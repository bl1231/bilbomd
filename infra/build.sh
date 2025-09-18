#!/bin/bash

set -e

# Detect architecture and set platform
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" || "$ARCH" == "aarch64" ]]; then
  PLATFORM="linux/arm64"
else
  PLATFORM="linux/${ARCH}"
fi

# Determine which environment to use
ENV=""
COMPOSE_FILE=""
PROJECT_NAME=""

case "$1" in
  local)
    ENV=".env.local"
    COMPOSE_FILE="./docker-compose.local.yml"
    PROJECT_NAME="bilbomd-local"
    ;;
  dev)
    ENV=".env.dev"
    COMPOSE_FILE="./docker-compose.dev.yml"
    PROJECT_NAME="bilbomd-dev"
    ;;
  *)
    echo "❌ Usage: $0 [local|dev]"
    exit 1
    ;;
esac

# Set UI version and git hash
UI_VERSION=$(node -p "require('../apps/ui/package.json').version" 2>/dev/null || echo "0.0.0-local")
UI_GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "UI Version: $UI_VERSION, Git Hash: $UI_GIT_HASH"
export UI_VERSION
export UI_GIT_HASH

# Update or append DOCKER_PLATFORM in the selected .env file
if grep -q '^DOCKER_PLATFORM=' "$ENV"; then
  sed -i.bak "s|^DOCKER_PLATFORM=.*|DOCKER_PLATFORM=${PLATFORM}|" "$ENV"
else
  echo "DOCKER_PLATFORM=${PLATFORM}" >> "$ENV"
fi

echo "Building with $ENV ($PLATFORM)..."

docker compose \
  --env-file "$ENV" \
  -f "$COMPOSE_FILE" \
  -p "$PROJECT_NAME" \
  build ui
