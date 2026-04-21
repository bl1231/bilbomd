# bilbomd-foundry.dockerfile
#
# Builds a container for running RoseTTAFold3 (RF3) from the
# RosettaCommons/foundry repository.
#
# Requirements enforced by foundry:
#   - Python 3.12 exactly (pyproject.toml: requires-python = ">=3.12,<3.13")
#   - CUDA 12 for cuequivariance_ops_cu12 GPU extensions
#
# Python 3.12 is managed by uv (not the system package manager), so Ubuntu
# 22.04 with its default Python 3.10 is fine as the base.
#
# Build args:
#   CUDA_VERSION       CUDA version string (default: 12.9.1)
#   FOUNDRY_REF        Git branch/tag/commit to check out (default: production)
#   DOWNLOAD_WEIGHTS   Set to "true" to bake weights into the image (default: false)
#
# Runtime:
#   Mount a directory containing RF3 checkpoint(s) at /checkpoints, or set
#   FOUNDRY_CHECKPOINT_DIRS to a colon-separated list of paths.
#   RF3 latest weights: http://files.ipd.uw.edu/pub/rf3/rf3_foundry_01_24_latest_remapped.ckpt

ARG CUDA_VERSION=12.9.1

# ---------------------------------------------------------------------------
# Stage 1 — builder
# Full CUDA dev toolkit is needed to compile cuequivariance CUDA extensions.
# ---------------------------------------------------------------------------
FROM nvidia/cuda:${CUDA_VERSION}-devel-ubuntu22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    wget \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# uv manages both Python 3.12 and the virtual environment.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Clone foundry. Pin FOUNDRY_REF for reproducible builds.
ARG FOUNDRY_REF=production
RUN git clone --branch "${FOUNDRY_REF}" \
    https://github.com/RosettaCommons/foundry /app/foundry

# Create a Python 3.12 venv and install foundry with all extras:
#   [rfd3]   - RFdiffusion3
#   [rfd3na] - RFdiffusion3 nucleic acid extension
#   [rf3]    - RoseTTAFold3 (includes cuequivariance CUDA 12 packages)
RUN cd /app/foundry \
    && uv venv --python 3.12 \
    && uv pip install --no-cache ".[all]"

# Verify the CLI entry points are available.
RUN /app/foundry/.venv/bin/rf3 --help
RUN /app/foundry/.venv/bin/foundry --help

# Optionally bake model weights into the image (increases image size ~3-5 GB).
# Pass --build-arg DOWNLOAD_WEIGHTS=true to enable.
ARG DOWNLOAD_WEIGHTS=false
RUN if [ "$DOWNLOAD_WEIGHTS" = "true" ]; then \
        /app/foundry/.venv/bin/foundry install base-models \
            --checkpoint-dir /app/foundry/checkpoints; \
    fi

# ---------------------------------------------------------------------------
# Stage 2 — runtime
# Smaller image: CUDA runtime only, no compiler toolchain.
# ---------------------------------------------------------------------------
ARG CUDA_VERSION
FROM nvidia/cuda:${CUDA_VERSION}-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    libgomp1 \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy the uv-managed Python 3.12 interpreter (lives under /root/.local/share/uv)
# and the foundry venv + source tree from the builder stage.
COPY --from=builder /root /root
COPY --from=builder /app /app
RUN chmod -R a+rX /root && chmod -R a+rX /app

# Put the venv on PATH so all foundry CLI commands work without activation.
ENV PATH="/app/foundry/.venv/bin:$PATH"

# Foundry searches FOUNDRY_CHECKPOINT_DIRS for model weights at inference time.
# Mount a volume at /checkpoints or override this env var.
ENV FOUNDRY_CHECKPOINT_DIRS="/checkpoints"

WORKDIR /app/foundry

SHELL ["/bin/bash", "-c"]

# No default command — each model uses a different entry point:
#   rf3  fold inputs='...' out_dir='...'
#   rfd3 ...
#   mpnn ...
CMD ["bash"]
