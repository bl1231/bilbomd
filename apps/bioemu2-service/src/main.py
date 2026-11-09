"""HTTP wrapper around Rg-steered BioEmu2 sampling (bilbomd#1200).

POST /infer {"uuid": "<uuid>"} samples the job at UPLOAD_DIR/<uuid> (see sampler.py for
the files it reads and writes). The worker and this service share the UPLOAD_DIR volume,
so no files are transferred. Requests are serialised by a lock: one job saturates the GPU.

The model is loaded on the first request and kept, so torch.compile's warm-up is paid
once per container, not once per job. Mount TORCHINDUCTOR_CACHE_DIR and TRITON_CACHE_DIR
on a volume to keep compiled kernels across restarts too.

Environment:
  UPLOAD_DIR          job directories (default /bilbomd/uploads)
  BIOEMU2_MSA_CACHE   ColabFold MSA cache (BioEmu2 reads and writes it)
  MSA_SERVER_URL      ColabFold-compatible MSA server (default: the public server)
  BIOEMU2_COMPILE     "0" to skip torch.compile (slower sampling, faster start)
"""

import asyncio
import logging
import os
import sys
import traceback
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sampler import Sampler, SamplingError

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("bioemu2-service")

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/bilbomd/uploads"))

msa_server = os.environ.get("MSA_SERVER_URL")
if msa_server:
    # BioEmu2 reads the ColabFold host from a module constant
    from bioemu2.msa import colabfold

    colabfold.COLABFOLD_HOST = msa_server.rstrip("/")
    logger.info("Using MSA server %s", colabfold.COLABFOLD_HOST)

app = FastAPI(title="bilbomd-bioemu2-service")
_lock = asyncio.Lock()
_sampler = Sampler(compile_denoiser=os.environ.get("BIOEMU2_COMPILE", "1") != "0")


class InferRequest(BaseModel):
    uuid: str


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "busy": _lock.locked()}


@app.post("/infer")
async def infer(req: InferRequest) -> dict:
    # uuid comes from the worker, but keep it from escaping UPLOAD_DIR
    if not req.uuid or "/" in req.uuid or req.uuid.startswith("."):
        raise HTTPException(status_code=400, detail="invalid uuid")
    work_dir = UPLOAD_DIR / req.uuid
    if not work_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Job directory not found: {req.uuid}")

    async with _lock:
        logger.info("Starting BioEmu2 sampling for %s", req.uuid)
        try:
            summary = await asyncio.get_running_loop().run_in_executor(None, _sampler.run, work_dir)
        except SamplingError as e:
            logger.error("BioEmu2 sampling failed for %s: %s", req.uuid, e)
            raise HTTPException(status_code=422, detail=str(e)) from e
        except Exception as e:
            logger.error("BioEmu2 sampling crashed for %s:\n%s", req.uuid, traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}") from e

    logger.info(
        "BioEmu2 sampling done for %s: %d/%d physical in %.0f s",
        req.uuid, summary["total_physical"], summary["total_frames"], summary["seconds"],
    )  # fmt: skip
    return {"status": "ok", "uuid": req.uuid, "summary": summary}
