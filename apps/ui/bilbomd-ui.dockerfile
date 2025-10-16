# -----------------------------------------------------------------------------
# Stage 1: deps (prefetch pnpm store for monorepo)
FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable

# Copy only files needed to resolve workspace dependencies (better cache)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/mongodb-schema/package.json packages/mongodb-schema/package.json
COPY packages/eslint-config/ packages/eslint-config/
COPY apps/ui/package.json apps/ui/package.json

# Prefetch dependencies into pnpm store (no linking yet)
RUN pnpm fetch

# -----------------------------------------------------------------------------
# Stage 2: build (install, build UI, then prune)
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

# Reuse the fetched pnpm store from deps stage for fast, deterministic installs
COPY --from=deps /root/.local/share/pnpm/store /root/.local/share/pnpm/store

# Copy the full repo (monorepo context)
COPY . .

# Install using the fetched store and frozen lockfile
RUN pnpm install --frozen-lockfile
RUN pnpm -C packages/mongodb-schema run build
RUN pnpm -C apps/ui run build

# Produce a minimal, deployable output for just the UI (node_modules pruned to prod)
RUN pnpm deploy --filter @bilbomd/ui --prod /out

# Generate version.json during the build
ARG UI_VERSION
ARG UI_GIT_HASH
RUN echo "{ \"version\": \"${UI_VERSION}\", \"gitHash\": \"${UI_GIT_HASH}\" }" > /repo/apps/ui/build/version.json

# -----------------------------------------------------------------------------
# Stage 3: serve (nginx)
FROM nginx:alpine
RUN apk add --no-cache bash

# Copy the Vite build output (dist/build) to nginx serving directory
COPY --from=build /repo/apps/ui/build /usr/share/nginx/html

# Copy nginx configuration
COPY apps/ui/nginx.default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
