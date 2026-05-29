"""
Thin HTTP wrapper around colabfold_batch.

Accepts POST /infer {"uuid": "<uuid>"} and runs ColabFold inference against
the job directory at UPLOAD_DIR/<uuid>. Both this service and the worker share
the same UPLOAD_DIR volume mount, so no file transfer is needed.

Requests are serialised by an asyncio lock — ColabFold saturates the GPU.
"""

import asyncio
import os
import subprocess
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/bilbomd/uploads"))
COLABFOLD_DATA_DIR = Path(os.environ.get("COLABFOLD_DATA_DIR", "/cache"))

FASTA_FILE = "af-entities.fasta"
OUTPUT_DIR = "alphafold"

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

    async with _lock:
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, _run_inference, work_dir
            )
        except subprocess.CalledProcessError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"colabfold_batch exited with code {exc.returncode}"
            ) from exc

    return {"status": "ok", "uuid": uuid}


def _run_inference(work_dir: Path) -> None:
    stdout_log = work_dir / "colabfold.log"
    stderr_log = work_dir / "colabfold_error.log"

    cmd = [
        "colabfold_batch",
        "--num-models=3",
        "--amber",
        "--use-gpu-relax",
        "--num-recycle=4",
        FASTA_FILE,
        OUTPUT_DIR,
    ]

    env = {**os.environ, "COLABFOLD_DATA_DIR": str(COLABFOLD_DATA_DIR)}

    with stdout_log.open("wb") as out, stderr_log.open("wb") as err:
        subprocess.run(
            cmd,
            cwd=work_dir,
            stdout=out,
            stderr=err,
            env=env,
            check=True,
        )
