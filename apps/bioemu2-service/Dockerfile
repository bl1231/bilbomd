# BioEmu2 sampling service for the BilboMD BioEmu2 pipeline (bilbomd#1200).
# Based on the Phase 0 evaluation image (bioemu-tests/perlmutter/bioemu2.dockerfile),
# which ran on epyc and Perlmutter. CUDA comes from the PyTorch pip wheels; the host
# only provides the driver (CUDA 13 wheels need driver >= 580).
FROM ubuntu:24.04

ARG BIOEMU2_COMMIT=f99e0d8
ARG CHECKPOINT_REVISION=dd4b0c1b69984b68edcb6200a544213be4d75242

ENV DEBIAN_FRONTEND=noninteractive
# python3.12-dev and gcc: torch.compile's Triton step builds a small C helper at runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3.12 python3.12-dev python3.12-venv gcc git curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN python3.12 -m venv /opt/bioemu2 && \
    /opt/bioemu2/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/bioemu2/bin/pip install --no-cache-dir \
        "bioemu2[cuda] @ git+https://github.com/microsoft/bioemu2@${BIOEMU2_COMMIT}" \
        fastapi "uvicorn[standard]" pydantic
ENV PATH=/opt/bioemu2/bin:${PATH}

# Bake the checkpoint into the image so the service runs without Hugging Face access
ENV HF_HOME=/opt/hf
RUN python -c "from huggingface_hub import hf_hub_download as d; \
[d('microsoft/bioemu2', f'checkpoints/bioemu2-preview/{f}', revision='${CHECKPOINT_REVISION}') \
 for f in ('checkpoint.ckpt', 'config.yaml')]" && \
    chmod -R a+rX /opt/hf

WORKDIR /app
COPY src/ /app/

# Runs as the worker's UID (compose `user:`), whose $HOME isn't writable: keep every
# cache under /cache (a volume) so compiled kernels and MSAs survive restarts.
ENV HF_HUB_OFFLINE=1 \
    UPLOAD_DIR=/bilbomd/uploads \
    HOME=/tmp \
    XDG_CACHE_HOME=/cache \
    BIOEMU2_MSA_CACHE=/cache/bioemu2_msa \
    TRITON_CACHE_DIR=/cache/triton \
    TORCHINDUCTOR_CACHE_DIR=/cache/inductor \
    NUMBA_CACHE_DIR=/cache/numba \
    PYTHONUNBUFFERED=1

RUN python -c "import bioemu2, torch, fastapi; \
from bioemu2.checkpoints import get_checkpoint_files as g; print('torch', torch.__version__, 'cuda', torch.version.cuda); print(g('bioemu2-preview'))"

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
