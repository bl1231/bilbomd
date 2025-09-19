########################################
# Stage 1: deps (prefetch pnpm store)
########################################
FROM node:20-alpine AS deps
WORKDIR /repo
# Enable pnpm via Corepack
RUN corepack enable

# Copy only files needed to resolve workspace dependencies (better cache)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/mongodb-schema/package.json packages/mongodb-schema/package.json
COPY apps/worker/package.json apps/worker/package.json

# Prefetch dependencies into pnpm store (no linking yet)
RUN pnpm fetch

########################################
# Stage 2: build (install, build schema + worker, then prune)
########################################
FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable

# Reuse the fetched pnpm store from deps stage for fast, deterministic installs
COPY --from=deps /root/.local/share/pnpm/store /root/.local/share/pnpm/store

# Copy the full repo (monorepo context)
COPY . .

# Install using the fetched store and frozen lockfile
RUN pnpm install --frozen-lockfile

# Build shared package first, then the worker
RUN pnpm -C packages/mongodb-schema run build
RUN pnpm -C apps/worker run build

# Produce a minimal, deployable output for just the worker (node_modules pruned to prod)
RUN pnpm deploy --filter @bilbomd/worker --prod /out

########################################
# Stage 3: runtime (your existing base image)
########################################
FROM ghcr.io/bl1231/bilbomd-worker-base:0.0.2 AS runtime
WORKDIR /app

# Install Node.js (if your base image doesn't already have it)
# Keep your original approach here so the base remains unchanged
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update \
    && apt-get install -y nodejs \
    && npm install -g npm@latest \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create non-root user (same as your original)
ARG USER_ID=1000
ARG GROUP_ID=1000
RUN groupadd -g ${GROUP_ID} bilbomd \
    && useradd -u ${USER_ID} -g ${GROUP_ID} -m -d /home/bilbo -s /bin/bash bilbo

# Copy the minimal app bundle from the build stage
COPY --chown=bilbo:bilbomd --from=build /out/ .

# Copy centralized shared scripts (e.g., autorg.py)
COPY --chown=bilbo:bilbomd tools/python/ /app/scripts/

ENV NODE_ENV=production
USER bilbo:bilbomd
EXPOSE 3000
CMD ["node", "dist/worker.js"]