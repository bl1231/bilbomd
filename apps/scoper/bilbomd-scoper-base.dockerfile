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
RUN set -eux; \
    case "$TARGETARCH" in \
    amd64) MICROMAMBA_URL="https://micro.mamba.pm/api/micromamba/linux-64/latest" ;; \
    arm64) MICROMAMBA_URL="https://micro.mamba.pm/api/micromamba/linux-aarch64/latest" ;; \
    *) echo "Unsupported TARGETARCH: $TARGETARCH"; exit 1 ;; \
    esac; \
    curl -fsSL --retry 3 --retry-delay 2 "$MICROMAMBA_URL" -o /usr/local/bin/micromamba; \
    chmod +x /usr/local/bin/micromamba

ENV MAMBA_ROOT_PREFIX=/opt/conda
ENV PATH=/opt/conda/bin:/usr/local/bin:$PATH

# Pre-create base env, add mamba, then update from environment.yml
WORKDIR /tmp
COPY apps/scoper/environment.yml /tmp/environment.yml

# Use cache for package downloads; unify CPU PyTorch + PyG via conda channels
RUN --mount=type=cache,target=/opt/conda/pkgs \
    micromamba install -y -n base -c conda-forge mamba && \
    micromamba env update -y -n base -f /tmp/environment.yml && \
    micromamba install -y -n base -c pytorch -c pyg -c conda-forge \
    pytorch=2.2.* cpuonly \
    pyg=2.4.0 \
    torchmetrics=0.7.2 \
    tabulate \
    wandb && \
    micromamba clean --all --yes

# Environment config
ENV RNAVIEW=/usr/local/RNAView

# Default working directory for app (populated by dependent image)
WORKDIR /home/scoper/app

# Final stage name exported for reuse
CMD ["bash", "-lc", "echo 'Base image ready' && sleep 1"]
