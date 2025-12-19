# syntax=docker/dockerfile:1.7-labs

# -----------------------------------------------------------------------------
# Scoper app image: builds app on top of long-lived base
# The base image consolidates stages 1–4 (toolchain, RNAView/reduce, Node, Python env)

# ARG BASE_IMAGE=ghcr.io/bl1231/bilbomd-scoper-base:0.0.1

# -----------------------------------------------------------------------------
# Build stage 5a - deps: prefetch pnpm store for monorepo
FROM ghcr.io/bl1231/bilbomd-scoper-base:0.0.1 AS deps
WORKDIR /repo

# Enable pnpm via Corepack and pin the repo version (user set to latest)
RUN corepack enable \
    && corepack prepare pnpm@latest --activate \
    && pnpm config set inject-workspace-packages=true

# Copy only manifests for better caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/mongodb-schema/package.json packages/mongodb-schema/package.json
COPY packages/eslint-config/ packages/eslint-config/
COPY apps/scoper/package.json apps/scoper/package.json

# Prefetch dependencies into pnpm store
RUN pnpm fetch

# -----------------------------------------------------------------------------
# Build stage 5b - build: install, build schema + scoper, and deploy to /out
FROM ghcr.io/bl1231/bilbomd-scoper-base:0.0.1 AS build
WORKDIR /repo

RUN corepack enable \
    && corepack prepare pnpm@latest --activate \
    && pnpm config set inject-workspace-packages=true

ENV HUSKY=0

# Reuse fetched pnpm store
COPY --from=deps /root/.local/share/pnpm/store /root/.local/share/pnpm/store

# Copy full repo
COPY . .

# Install deterministically and build
RUN pnpm install --frozen-lockfile
RUN pnpm -C packages/mongodb-schema run build
RUN pnpm -C apps/scoper run build

# Produce a minimal, pruned output for just scoper
RUN pnpm deploy --filter @bilbomd/scoper --prod /out

# -----------------------------------------------------------------------------
# Final stage: Use base directly (keeps all libraries)
FROM ghcr.io/bl1231/bilbomd-scoper-base:0.0.1 AS bilbomd-scoper
ARG USER_ID
ARG GROUP_ID

# Create scoper user
RUN groupadd -g $GROUP_ID scoper && \
    useradd -ms /bin/bash -u $USER_ID -g $GROUP_ID scoper && \
    mkdir -p /home/scoper/app && \
    chown -R scoper:scoper /home/scoper

# Switch to scoper user
USER scoper:scoper

# Optional: fetch IonNet assets (consider gating via build-arg)
WORKDIR /home/scoper
RUN set -eux; \
    cd /home/scoper; \
    curl -fsSL -o /tmp/ionnet.zip https://github.com/bl1231/IonNet/archive/refs/heads/docker-test.zip; \
    unzip -q /tmp/ionnet.zip -d /home/scoper; \
    rm -f /tmp/ionnet.zip; \
    mv /home/scoper/IonNet-docker-test /home/scoper/IonNet; \
    tar -xvf /home/scoper/IonNet/scripts/scoper_scripts/KGSrna.tar -C /home/scoper/IonNet/scripts/scoper_scripts; \
    rm -f /home/scoper/IonNet/scripts/scoper_scripts/KGSrna.tar

# Application payload
WORKDIR /home/scoper/app
COPY --from=build /out/ .

# Environment variables (RNAVIEW already set in base, ok to keep)
ENV RNAVIEW=/usr/local/RNAView

# Expose and start (adjust if your start script differs)
CMD [ "node", "build/scoper.js" ]

