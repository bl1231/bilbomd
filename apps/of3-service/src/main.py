"""
Thin HTTP wrapper around run_openfold.

Accepts POST /infer {"uuid": "<uuid>"} and runs OpenFold3 inference against
the job directory at UPLOAD_DIR/<uuid>. Both this service and the worker share
the same UPLOAD_DIR volume mount, so no file transfer is needed.

Requests are serialised by an asyncio lock — OpenFold3 saturates the GPU.
"""

import asyncio
import os
import subprocess
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

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


def _run_inference(work_dir: Path) -> None:
    stdout_log = work_dir / "openfold.log"
    stderr_log = work_dir / "openfold_error.log"

    cmd = [
        "run_openfold",
        "predict",
        f"--query-json={QUERY_FILE}",
        f"--output-dir={OUTPUT_DIR}",
        f"--runner-yaml={RUNNER_YML}",
        f"--inference-ckpt-path={CKPT_PATH}",
    ]

    with stdout_log.open("wb") as out, stderr_log.open("wb") as err:
        subprocess.run(
            cmd,
            cwd=work_dir,
            stdout=out,
            stderr=err,
            check=True,
        )
