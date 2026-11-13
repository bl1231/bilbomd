# syntax=docker/dockerfile:1.7
# -----------------------------------------------------------------------------
# CHARMM-enabled BilboMD worker.
#
# The published bilbomd-worker image does not contain CHARMM. Hosts that run
# CHARMM jobs build this image locally, on top of a released worker image, from
# a CHARMM source tarball that sits next to this file in charmm/ (gitignored).
# The image is never pushed to a registry.
#
# The epyc compose files build it on `up` (pull_policy: build), with the context
# set to apps/worker; bilbomd-worker-charmm.dockerfile.dockerignore keeps that
# context down to the tarball. `deploy-to-beamline.sh build <env>` builds it
# ahead of time without touching the running stack, so `up` then only hits the
# cache. By hand:
#
#   docker build -f bilbomd-worker-charmm.dockerfile \
#     --build-arg WORKER_IMAGE=ghcr.io/bl1231/bilbomd-worker:<version> \
#     -t bilbomd-worker-charmm:<env> .
#
# Docker layer caching keeps the CHARMM compile across worker releases: only the
# final stage reruns when WORKER_IMAGE changes.

# The released worker image to add CHARMM to. Required.
ARG WORKER_IMAGE
# Same toolchain as the worker base image's builder, so the binary links
# against the libraries the worker's CUDA runtime image provides.
ARG CHARMM_BUILDER_IMAGE=nvidia/cuda:12.9.2-devel-ubuntu22.04

# -----------------------------------------------------------------------------
FROM ${CHARMM_BUILDER_IMAGE} AS build-charmm
ARG CHARMM_VER=c49b2
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    cmake gcc gfortran g++ make build-essential && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
# Bind-mount the tarball so it never lands in an image layer.
RUN --mount=type=bind,source=charmm/${CHARMM_VER}.tar.gz,target=/tmp/charmm.tar.gz \
    mkdir -p /usr/local/src && \
    tar --no-same-owner -xzf /tmp/charmm.tar.gz -C /usr/local/src
WORKDIR /usr/local/src/charmm
# Parallel compile jobs; empty means all cores. The epyc compose files cap it so
# a build doesn't starve MD jobs running on the same host. Declared here, after
# the extract, so changing it only reruns the compile.
ARG CHARMM_MAKE_JOBS=
RUN ./configure && \
    make -j"${CHARMM_MAKE_JOBS:-$(nproc)}" -C build/cmake install && \
    (strip bin/charmm || true)

# -----------------------------------------------------------------------------
FROM ${WORKER_IMAGE} AS bilbomd-worker-charmm
USER root
COPY --from=build-charmm /usr/local/src/charmm/bin/charmm /usr/local/bin/charmm
COPY --from=build-charmm /usr/local/src/charmm/toppar /app/charmm-toppar
# CHARMM prints its banner before it reads any input.
RUN echo stop | charmm 2>&1 | grep -q "Chemistry at HARvard Macromolecular Mechanics"
USER bilbo:bilbomd
