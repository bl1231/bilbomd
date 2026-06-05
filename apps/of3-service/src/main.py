"""
Thin HTTP wrapper around run_openfold.

Accepts POST /infer {"uuid": "<uuid>"} and runs OpenFold3 inference against
the job directory at UPLOAD_DIR/<uuid>. Both this service and the worker share
the same UPLOAD_DIR volume mount, so no file transfer is needed.

Requests are serialised by an asyncio lock — OpenFold3 saturates the GPU.
"""

import asyncio
import logging
import os
import subprocess
import sys
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("of3-service")

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/bilbomd/uploads"))
OF3_DATA_DIR = Path(os.environ.get("OF3_DATA_DIR", "/of3_data"))
CKPT_PATH = OF3_DATA_DIR / "of3-p2-155k.pt"

QUERY_FILE = "of3-query.json"
OUTPUT_DIR = "openfold"
RUNNER_YML = "of3-runner.yml"

app = FastAPI(title="bilbomd-of3-service")
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

    query_path = work_dir / QUERY_FILE
    if not query_path.exists():
        raise HTTPException(status_code=422, detail=f"{QUERY_FILE} missing in {uuid}")

    async with _lock:
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, _run_inference, work_dir
            )
        except subprocess.CalledProcessError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"run_openfold exited with code {exc.returncode}"
            ) from exc

    return {"status": "ok", "uuid": uuid}


def _tee_stream(src, log_file, log_fn):
    """Read lines from src, write to log_file and call log_fn for each line."""
    with log_file.open("wb") as f:
        for raw in src:
            f.write(raw)
            f.flush()
            log_fn(raw.decode(errors="replace").rstrip())


def _run_inference(work_dir: Path) -> None:
    stdout_log = work_dir / "openfold.log"
    stderr_log = work_dir / "openfold_error.log"

    uuid = work_dir.name
    logger.info("Starting run_openfold for %s", uuid)

    cmd = [
        "run_openfold",
        "predict",
        f"--query-json={QUERY_FILE}",
        f"--output-dir={OUTPUT_DIR}",
        f"--runner-yaml={RUNNER_YML}",
        f"--inference-ckpt-path={CKPT_PATH}",
    ]

    proc = subprocess.Popen(
        cmd,
        cwd=work_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    t_out = threading.Thread(
        target=_tee_stream,
        args=(proc.stdout, stdout_log, lambda line: logger.info("[%s stdout] %s", uuid, line)),
        daemon=True,
    )
    t_err = threading.Thread(
        target=_tee_stream,
        args=(proc.stderr, stderr_log, lambda line: logger.warning("[%s stderr] %s", uuid, line)),
        daemon=True,
    )
    t_out.start()
    t_err.start()

    proc.wait()
    t_out.join()
    t_err.join()

    if proc.returncode != 0:
        logger.error("run_openfold exited with code %d for %s", proc.returncode, uuid)
        raise subprocess.CalledProcessError(proc.returncode, cmd)

    logger.info("run_openfold completed successfully for %s", uuid)
