#!/bin/bash

ARCH=$(uname -m)

# Default to linux/amd64 for Mac M1/M2/M3
if [[ "$ARCH" == "arm64" || "$ARCH" == "aarch64" ]]; then
  export DOCKER_PLATFORM=linux/amd64
else
  export DOCKER_PLATFORM=linux/${ARCH}
fi

# Now run Docker Compose
docker compose --env-file .env.local -f docker-compose.local.yml -p bilbomd build