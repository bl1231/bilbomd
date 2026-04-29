#!/bin/bash

set -e

# Determine which environment to use
ENV=""
COMPOSE_FILE=""
PROJECT_NAME=""

case "$1" in
  local)
    ENV=".env.local"
    COMPOSE_FILE="docker-compose.local.yml"
    PROJECT_NAME="bilbomd-local"
    ;;
  dev)
    ENV=".env.dev"
    COMPOSE_FILE="docker-compose-epyc.dev.yml"
    PROJECT_NAME="bilbomd-dev"
    ;;
  prod)
    ENV=".env.prod"
    COMPOSE_FILE="docker-compose-epyc.prod.yml"
    PROJECT_NAME="bilbomd-prod"
    ;;
  *)
    echo "❌ Usage: $0 [local|dev]"
    exit 1
    ;;
esac

echo "🏃‍♂️‍➡️ Running with $ENV ($PLATFORM)..."

docker compose \
  --env-file "$ENV" \
  -f "$COMPOSE_FILE" \
  -p "$PROJECT_NAME" \
  up -d
