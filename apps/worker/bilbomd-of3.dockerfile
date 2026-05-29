# bilbomd-of3.dockerfile
# Testing image for evaluating OpenFold3 in the BilboMD pipeline.
# Builds on the official pre-built image from Docker Hub.
#
# Build:
#   docker build \
#     -f apps/worker/bilbomd-of3.dockerfile \
#     -t bilbomd-of3:latest .
#
# Run interactive shell:
#   docker run --rm --gpus all -it -v /af2_data/of3:/of3_data bilbomd-of3:latest bash
#
# Download model weights once (~ 2GB, stored on host at /af2_data/of3):
#   docker run --rm --gpus all -v /af2_data/of3:/of3_data bilbomd-of3:latest \
#     aws s3 cp s3://openfold/staging/of3-p2-155k.pt /of3_data/ --no-sign-request
#
# Run inference:
#   docker run --rm --gpus all -v /af2_data/of3:/of3_data bilbomd-of3:latest \
#     run_openfold --inference_ckpt_path /of3_data/of3-p2-155k.pt ...

FROM openfoldconsortium/openfold3:stable

# RUN apt-get update && \
#     apt-get install -y --no-install-recommends \
#     git build-essential cmake gfortran make \
#     wget ca-certificates bzip2 tar \
#     swig python3 python3-dev && \
#     rm -rf /var/lib/apt/lists/*

RUN mamba install -y -n openfold3 pytest

ENV OPENFOLD_CACHE=`/of3_data/`

# Mount point for model weights stored on the host at /af2_data/of3
ENV OF3_MODEL_DIR=/of3_data
VOLUME /of3_data
