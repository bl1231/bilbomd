# syntax=docker/dockerfile:1.7-labs

# -----------------------------------------------------------------------------
# Scoper app image: builds app on top of long-lived base
# The base image consolidates stages 1–4 (toolchain, RNAView/reduce, Node, Python env)

ARG BASE_IMAGE=ghcr.io/bl1231/bilbomd-scoper-base:0.0.1
ARG PNPM_VERSION=latest

# -----------------------------------------------------------------------------
# Build stage 5a - deps: prefetch pnpm store for scoped workspaces
FROM ${BASE_IMAGE} AS deps
WORKDIR /repo

RUN set -eux; \
    if command -v corepack >/dev/null 2>&1; then \
    corepack enable || true; \
    corepack prepare pnpm@${PNPM_VERSION} --activate || corepack use pnpm@${PNPM_VERSION}; \
    else \
    npm i -g pnpm@${PNPM_VERSION}; \
    fi; \
    pnpm config set inject-workspace-packages=true; \
    pnpm --version

# Copy only manifests for better caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/mongodb-schema/package.json packages/mongodb-schema/package.json
COPY apps/scoper/package.json apps/scoper/package.json

# Prefetch dependencies into pnpm store (cache mount, not layered)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm fetch --filter @bilbomd/scoper --filter @bilbomd/mongodb-schema

# -----------------------------------------------------------------------------
# Build stage 5b - build: install, build schema + scoper, and deploy to /out
FROM ${BASE_IMAGE} AS build
WORKDIR /repo

RUN set -eux; \
    if command -v corepack >/dev/null 2>&1; then \
    corepack enable || true; \
    corepack prepare pnpm@${PNPM_VERSION} --activate || corepack use pnpm@${PNPM_VERSION}; \
    else \
    npm i -g pnpm@${PNPM_VERSION}; \
    fi; \
    pnpm config set inject-workspace-packages=true; \
    pnpm --version

ENV HUSKY=0

# Copy only needed sources (keep context small)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/scoper apps/scoper
COPY packages/mongodb-schema packages/mongodb-schema

# Install only what we need using filters; use cache mount for store
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @bilbomd/scoper --filter @bilbomd/mongodb-schema

# Build targets
RUN pnpm -C packages/mongodb-schema run build
RUN pnpm -C apps/scoper run build

# Produce a minimal, pruned output for just scoper
RUN pnpm deploy --filter @bilbomd/scoper --prod /out

# -----------------------------------------------------------------------------
# Final stage: Use base directly (keeps all libraries)
FROM ${BASE_IMAGE} AS bilbomd-scoper
ARG USER_ID
ARG GROUP_ID
ARG FETCH_IONNET=1

# Create scoper user
RUN groupadd -g $GROUP_ID scoper && \
    useradd -ms /bin/bash -u $USER_ID -g $GROUP_ID scoper && \
    mkdir -p /home/scoper/app && \
    chown -R scoper:scoper /home/scoper

# Switch to scoper user
USER scoper:scoper

# Optional: fetch IonNet assets (gate via build-arg to keep CI lean)
WORKDIR /home/scoper
RUN if [ "$FETCH_IONNET" = "1" ]; then \
    set -eux; \
    curl -fsSL -o /tmp/ionnet.zip https://github.com/bl1231/IonNet/archive/refs/heads/docker-test.zip; \
    unzip -q /tmp/ionnet.zip -d /home/scoper; \
    rm -f /tmp/ionnet.zip; \
    mv /home/scoper/IonNet-docker-test /home/scoper/IonNet; \
    tar -xvf /home/scoper/IonNet/scripts/scoper_scripts/KGSrna.tar -C /home/scoper/IonNet/scripts/scoper_scripts; \
    rm -f /home/scoper/IonNet/scripts/scoper_scripts/KGSrna.tar; \
    fi

# Application payload
WORKDIR /home/scoper/app
COPY --from=build /out/ .

# Environment variables (RNAVIEW already set in base, ok to keep)
ENV RNAVIEW=/usr/local/RNAView

# Final cleanup to reduce layer size
RUN rm -rf ~/.cache /home/scoper/.cache /tmp/*

# Expose and start
CMD [ "node", "build/scoper.js" ]