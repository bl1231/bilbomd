# --------------------------------------------------------------------------------------
# Build stage 1 - Install Miniforge3
# FROM node:22-slim AS bilbomd-backend-step1
FROM node:22 AS bilbomd-backend-step1

RUN apt-get update && \
    apt-get install -y ncat ca-certificates wget libgl1-mesa-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Download and install Miniforge3
RUN wget "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh" && \
    bash Miniforge3-$(uname)-$(uname -m).sh -b -p "/miniforge3" && \
    rm Miniforge3-$(uname)-$(uname -m).sh

# Add Conda to PATH
ENV PATH="/miniforge3/bin/:${PATH}"

# Copy in the environment.yml file
COPY apps/backend/environment.yml /tmp/environment.yml

# Update existing conda base env from environment.yml
RUN conda env update -f /tmp/environment.yml && \
    rm /tmp/environment.yml && \
    conda clean -afy

# --------------------------------------------------------------------------------------
# Build stage 2 - Install BioXTAS
FROM bilbomd-backend-step1 AS bilbomd-backend-step2

# install deps
RUN apt-get update && \
    apt-get install -y curl zip build-essential libarchive13 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install BioXTAS from source
WORKDIR /tmp
#COPY bioxtas/bioxtasraw-master.zip .
RUN wget -q https://github.com/jbhopkins/bioxtasraw/archive/refs/heads/master.zip -O bioxtasraw-master.zip && \
    unzip bioxtasraw-master.zip && \
    rm bioxtasraw-master.zip

WORKDIR /tmp/bioxtasraw-master
RUN python setup.py build_ext --inplace && \
    pip install .

# --------------------------------------------------------------------------------------
# Build stage 3a - deps: prefetch pnpm store for monorepo
FROM bilbomd-backend-step2 AS deps
WORKDIR /repo

# Enable pnpm via Corepack and pin the same version you use locally
RUN corepack enable \
    && corepack prepare pnpm@10.15.1 --activate \
    && pnpm config set inject-workspace-packages=true

# Only copy what's needed to resolve workspaces (good cache behavior)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/mongodb-schema/package.json packages/mongodb-schema/package.json
COPY apps/backend/package.json apps/backend/package.json

# Prefetch dependencies into pnpm store (no linking yet)
RUN pnpm fetch

# --------------------------------------------------------------------------------------
# Build stage 3b - build: install, build schema + backend, and create minimal output
FROM bilbomd-backend-step2 AS build
WORKDIR /repo

RUN corepack enable \
    && corepack prepare pnpm@10.15.1 --activate \
    && pnpm config set inject-workspace-packages=true

ENV HUSKY=0

# Reuse the fetched pnpm store
COPY --from=deps /root/.local/share/pnpm/store /root/.local/share/pnpm/store

# Copy the full repo (monorepo context)
COPY . .

# Optional: GitHub Packages auth (only if you actually need it at build time)
# ARG GITHUB_TOKEN
# RUN if [ -n "${GITHUB_TOKEN}" ]; then echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > /root/.npmrc; fi

# Install deterministically from lockfile and build
RUN pnpm install --frozen-lockfile
RUN pnpm -C packages/mongodb-schema run build
RUN pnpm -C apps/backend run build

# Produce a minimal deployable bundle for just the backend
RUN pnpm deploy --filter @bilbomd/backend --prod /out

# Clean up token
RUN rm -f /root/.npmrc || true

# --------------------------------------------------------------------------------------
# Build stage 3c - runtime: keep your base with Miniforge/BioXTAS, add app only
FROM bilbomd-backend-step2 AS bilbomd-backend

# IDs can be passed from compose as build args
ARG USER_ID
ARG GROUP_ID

# Create runtime dirs and user
RUN mkdir -p /app/node_modules /bilbomd/uploads /bilbomd/logs \
    && groupadd -g ${GROUP_ID:-1234} bilbomd \
    && useradd -u ${USER_ID:-1000} -g ${GROUP_ID:-1234} -m -d /home/bilbo -s /bin/bash bilbo \
    && chown -R bilbo:bilbomd /app /bilbomd/uploads /bilbomd/logs /home/bilbo

WORKDIR /app

# Copy minimal app bundle from build stage
COPY --chown=bilbo:bilbomd --from=build /out/ .

# Optional metadata/env from build args
ARG BILBOMD_BACKEND_GIT_HASH
ARG BILBOMD_BACKEND_VERSION
ENV BILBOMD_BACKEND_GIT_HASH=${BILBOMD_BACKEND_GIT_HASH}
ENV BILBOMD_BACKEND_VERSION=${BILBOMD_BACKEND_VERSION}
ENV NODE_DEBUG=openid-client

USER bilbo:bilbomd
EXPOSE 3500
CMD [ "node", "dist/server.js" ]
