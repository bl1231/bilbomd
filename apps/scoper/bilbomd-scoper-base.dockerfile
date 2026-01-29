# syntax=docker/dockerfile:1.7-labs

# -----------------------------------------------------------------------------
# Base image for Scoper: consolidates stages 1–4
# - Ubuntu + build toolchain
# - Compiled reduce + RNAView
# - Node.js v22
# - Micromamba-managed Python environment (from environment.yml)
# - No app sources; long-lived, rarely changes

FROM ubuntu:22.04 AS build-deps
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Los_Angeles

# Toolchain and libs with BuildKit cache mounts
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    rm -f /var/lib/apt/lists/lock && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    git \
    cmake \
    unzip \
    curl \
    ca-certificates \
    libgsl-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Build 'reduce'
WORKDIR /usr/local/src
RUN git clone https://github.com/rlabduke/reduce.git reduce && \
    cd reduce && \
    make && make install && \
    rm -rf /usr/local/src/reduce

# Build 'RNAView'
WORKDIR /usr/local
RUN curl -L -o rnaview.zip https://github.com/rcsb/RNAView/archive/refs/heads/master.zip && \
    unzip rnaview.zip && \
    mv RNAView-master RNAView && \
    cd RNAView && \
    make && \
    rm /usr/local/rnaview.zip

# -----------------------------------------------------------------------------
FROM ubuntu:22.04 AS bilbomd-scoper-base
ENV DEBIAN_FRONTEND=noninteractive
ARG TARGETOS
ARG TARGETARCH

# Minimal runtime deps and Node.js v22
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    rm -f /var/lib/apt/lists/lock && \
    apt-get update && \
    apt-get install -y --no-install-recommends curl wget unzip git libgsl-dev ca-certificates && \
    update-ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Copy compiled artifacts
COPY --from=build-deps /usr/local/bin/reduce /usr/local/bin/
COPY --from=build-deps /usr/local/reduce_wwPDB_het_dict.txt /usr/local/
COPY --from=build-deps /usr/local/RNAView/bin/rnaview /usr/local/bin/
COPY --from=build-deps /usr/local/RNAView/BASEPARS /usr/local/RNAView/BASEPARS

# Install micromamba (fast, reproducible conda) with arch-aware URL
RUN curl -L -o /tmp/miniforge.sh https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh && \
    bash /tmp/miniforge.sh -b -p /opt/conda && \
    rm /tmp/miniforge.sh && \
    /opt/conda/bin/conda clean --all --yes

ENV MAMBA_ROOT_PREFIX=/opt/conda
ENV PATH=/opt/conda/bin:/usr/local/bin:$PATH

# Add Conda/Mamba to PATH
ENV PATH=/opt/conda/bin:$PATH

# Install PyTorch
# This is a big red flag: pyg and torchmetrics (below)
# from conda are usually built against conda’s pytorch, not a random pip wheel.
RUN pip install torch==2.2.2+cpu --index-url https://download.pytorch.org/whl/cpu

# Update Conda as per ChatGPT suggestion
RUN conda install --yes --name base -c defaults python=3.10
RUN conda config --add channels pyg
RUN conda config --add channels pytorch
RUN conda config --add channels conda-forge
RUN conda config --add channels default

# ChatGPT suggests we might try this
# RUN conda config --set channel_priority strict

# Copy the environment.yml file into the image
COPY apps/scoper/environment.yml /tmp/environment.yml

# Update existing base environment from environment.yml
RUN conda env update -n base -f /tmp/environment.yml && \
    conda install -n base -y \
    pyg=2.4.0 \
    torchmetrics=0.7.2 \
    tabulate \
    -c pyg -c conda-forge
RUN conda install -y imp
RUN pip install wandb && conda clean --all --yes

# Environment config
ENV RNAVIEW=/usr/local/RNAView

# Default working directory for app (populated by dependent image)
WORKDIR /home/scoper/app

# Final stage name exported for reuse
CMD ["bash", "-lc", "echo 'Base image ready' && sleep 1"]
