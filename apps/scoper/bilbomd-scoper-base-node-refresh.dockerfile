# syntax=docker/dockerfile:1.7-labs

# -----------------------------------------------------------------------------
# Node-only refresh of the Scoper base image.
#
# Upgrades Node.js on top of an existing, known-good base without rebuilding the
# Python/conda stack (torch, torch_geometric, IonNet deps), so a Node security
# fix doesn't also change the scientific environment. A from-scratch build of
# bilbomd-scoper-base.dockerfile currently fails (latest Miniforge's Python has
# no torch==2.2.2+cpu wheel) and would drift the unpinned conda packages.
#
# Build with the "Build and Push Scoper Base Image" workflow, choosing this file.

ARG FROM_IMAGE=ghcr.io/bl1231/bilbomd-scoper-base:0.0.3

FROM ${FROM_IMAGE}
ENV DEBIAN_FRONTEND=noninteractive

# Swap the NodeSource repo to 26.x and install the pinned Node.js release
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    rm -f /var/lib/apt/lists/lock && \
    curl -fsSL https://deb.nodesource.com/setup_26.x | bash - && \
    apt-get install -y --no-install-recommends nodejs=26.12.1-1nodesource1 && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    node --version | grep -qx 'v26.12.1'
