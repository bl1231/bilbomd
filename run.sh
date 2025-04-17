#!/bin/bash

docker compose --env-file .env.local -f docker-compose.local.yml -p bilbomd-local up -d