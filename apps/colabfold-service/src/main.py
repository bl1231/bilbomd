"""
Thin HTTP wrapper around colabfold_batch.

Accepts POST /infer {"uuid": "<uuid>"} and runs ColabFold inference against
the job directory at UPLOAD_DIR/<uuid>. Both this service and the worker share
the same UPLOAD_DIR volume mount, so no file transfer is needed.

Requests are serialised by an asyncio lock — ColabFold saturates the GPU.

MSA generation is delegated to a remote MMseqs2 server. When that server is
unreachable, colabfold_batch retries submission forever, so the subprocess is
bounded by COLABFOLD_TIMEOUT_S and the host is probed before the lock is taken.
"""

import asyncio
import logging
import os
import signal
import socket
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("colabfold-service")

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/bilbomd/uploads"))
COLABFOLD_DATA_DIR = Path(os.environ.get("COLABFOLD_DATA_DIR", "/cache"))

FASTA_FILE = "af-entities.fasta"
OUTPUT_DIR = "alphafold"

DEFAULT_MSA_HOST_URL = "https://api.colabfold.com"
# Set to a self-hosted MMseqs2 API to bypass the public server. Only passed
# through to colabfold_batch when overridden, so the default run is unchanged.
MSA_HOST_URL = os.environ.get("COLABFOLD_HOST_URL", DEFAULT_MSA_HOST_URL)

# Must stay below the worker's COLABFOLD_TIMEOUT_MS (default 1h) so the service
# fails cleanly before the worker's HTTP client gives up and orphans this run.
SUBPROCESS_TIMEOUT_S = int(os.environ.get("COLABFOLD_TIMEOUT_S", 55 * 60))
# Grace period between SIGTERM and SIGKILL when tearing down a timed-out run.
TERM_GRACE_S = int(os.environ.get("COLABFOLD_TERM_GRACE_S", 30))

PREFLIGHT_ENABLED = os.environ.get("COLABFOLD_PREFLIGHT", "true").lower() != "false"
PREFLIGHT_TIMEOUT_S = float(os.environ.get("COLABFOLD_PREFLIGHT_TIMEOUT_S", 5))

# How much of each log to surface in an error response.
ERROR_TAIL_BYTES = 16384
ERROR_TAIL_CHARS = 2000
ERROR_TAIL_LINES = 12

app = FastAPI(title="bilbomd-colabfold-service")
_lock = asyncio.Lock()


class InferRequest(BaseModel):
    uuid: str


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/infer")
async def infer(req: InferRequest) -> dict:
    uuid = req.uuid
    work_dir = UPLOAD_DIR / uuid

    if not work_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Job directory not found: {uuid}")

    fasta_path = work_dir / FASTA_FILE
    if not fasta_path.exists():
        raise HTTPException(status_code=422, detail=f"{FASTA_FILE} missing in {uuid}")

    # Probed before the lock: a run whose MSA server is down would otherwise
    # hold the lock for the full timeout and stall every queued AF job.
    if PREFLIGHT_ENABLED:
        reachable = await asyncio.get_event_loop().run_in_executor(
            None, _msa_host_reachable
        )
        if not reachable:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"MSA server {MSA_HOST_URL} is unreachable — "
                    f"refusing to start ColabFold for {uuid}"
                ),
            )

    async with _lock:
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, _run_inference, work_dir
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(
                status_code=504,
                detail=(
                    f"colabfold_batch exceeded {SUBPROCESS_TIMEOUT_S}s and was "
                    f"terminated: {_error_context(work_dir)}"
                ),
            ) from None
        except subprocess.CalledProcessError as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"colabfold_batch exited with code {exc.returncode}: "
                    f"{_error_context(work_dir)}"
                ),
            ) from exc

    return {"status": "ok", "uuid": uuid}


def _msa_host_reachable() -> bool:
    """TCP-connect to the MSA server. A blocked host hangs on connect rather
    than refusing, which is exactly what the timeout catches."""
    parsed = urlparse(MSA_HOST_URL)
    host = parsed.hostname
    if not host:
        logger.warning("Could not parse a hostname from %s, skipping preflight", MSA_HOST_URL)
        return True
    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    try:
        with socket.create_connection((host, port), timeout=PREFLIGHT_TIMEOUT_S):
            return True
    except OSError as exc:
        logger.error("MSA server preflight failed for %s:%d — %s", host, port, exc)
        return False


def _meaningful_tail(path: Path) -> list[str]:
    """Last few informative lines of a log.

    Both logs run to tens of MB because tqdm redraws a progress bar every few
    seconds — on stderr, separated by carriage returns — so progress frames are
    dropped and consecutive repeats are collapsed. ColabFold writes its
    tracebacks to stdout, which is why callers read both files.
    """
    truncated = False
    try:
        size = path.stat().st_size
        with path.open("rb") as fh:
            if size > ERROR_TAIL_BYTES:
                fh.seek(-ERROR_TAIL_BYTES, os.SEEK_END)
                truncated = True
            raw = fh.read()
    except FileNotFoundError:
        return []
    except OSError as exc:
        return [f"<could not read {path.name}: {exc}>"]

    text = raw.decode(errors="replace")
    lines = [ln.strip() for ln in text.replace("\r", "\n").split("\n") if ln.strip()]
    if truncated and lines:
        # Seeking lands mid-line; that fragment is noise.
        lines.pop(0)
    lines = [ln for ln in lines if "elapsed:" not in ln]

    collapsed: list[str] = []
    for line in lines:
        # Timestamps differ on otherwise identical retry lines; compare the tail.
        prev = collapsed[-1] if collapsed else None
        if prev and _without_timestamp(prev) == _without_timestamp(line):
            continue
        collapsed.append(line)
    return collapsed[-ERROR_TAIL_LINES:]


def _without_timestamp(line: str) -> str:
    """Drop a leading `2026-08-10 18:45:34,795 ` style timestamp."""
    parts = line.split(" ", 2)
    if len(parts) == 3 and parts[0].count("-") == 2 and ":" in parts[1]:
        return parts[2]
    return line


def _error_context(work_dir: Path) -> str:
    """Log excerpt to attach to an error response, so the worker and the user
    see the real cause instead of a bare exit code."""
    parts: list[str] = []
    for name in ("colabfold.log", "colabfold_error.log"):
        tail = _meaningful_tail(work_dir / name)
        if tail:
            parts.append(f"[{name}] " + " | ".join(tail))
    if not parts:
        return "<no log output>"
    return " ;; ".join(parts)[-ERROR_TAIL_CHARS:]


def _terminate(proc: subprocess.Popen) -> None:
    """Tear down the whole process group — colabfold_batch spawns children
    (Amber relaxation, MSA submission) that outlive a bare kill of the parent.
    """
    try:
        pgid = os.getpgid(proc.pid)
    except ProcessLookupError:
        return

    os.killpg(pgid, signal.SIGTERM)
    try:
        proc.wait(timeout=TERM_GRACE_S)
        return
    except subprocess.TimeoutExpired:
        logger.warning("colabfold_batch ignored SIGTERM, sending SIGKILL")

    try:
        os.killpg(pgid, signal.SIGKILL)
        proc.wait(timeout=TERM_GRACE_S)
    except (ProcessLookupError, subprocess.TimeoutExpired) as exc:
        logger.error("Could not reap colabfold_batch process group: %s", exc)


def _run_inference(work_dir: Path) -> None:
    stdout_log = work_dir / "colabfold.log"
    stderr_log = work_dir / "colabfold_error.log"

    uuid = work_dir.name
    logger.info("Starting colabfold_batch for %s", uuid)

    cmd = [
        "colabfold_batch",
        "--num-models=3",
        "--amber",
        "--use-gpu-relax",
        "--num-recycle=4",
    ]
    if MSA_HOST_URL != DEFAULT_MSA_HOST_URL:
        cmd.append(f"--host-url={MSA_HOST_URL}")
    cmd += [FASTA_FILE, OUTPUT_DIR]

    env = {**os.environ, "COLABFOLD_DATA_DIR": str(COLABFOLD_DATA_DIR)}

    with stdout_log.open("wb") as out, stderr_log.open("wb") as err:
        # start_new_session gives the run its own process group to signal.
        proc = subprocess.Popen(
            cmd,
            cwd=work_dir,
            stdout=out,
            stderr=err,
            env=env,
            start_new_session=True,
        )

        try:
            returncode = proc.wait(timeout=SUBPROCESS_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            logger.error(
                "colabfold_batch exceeded %ds for %s, terminating",
                SUBPROCESS_TIMEOUT_S,
                uuid,
            )
            _terminate(proc)
            raise

    if returncode != 0:
        logger.error(
            "colabfold_batch exited with code %d for %s: %s",
            returncode,
            uuid,
            _error_context(work_dir),
        )
        raise subprocess.CalledProcessError(returncode, cmd)

    logger.info("colabfold_batch completed successfully for %s", uuid)
