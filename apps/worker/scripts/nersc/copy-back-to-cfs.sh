#!/bin/bash -l

# Check if an arguments was provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <UUID>"
    exit 1
fi

# Assign args to global variables
UUID=$1

PROJECT="m4659"

# Set the environment (default to 'development' if not set)
ENVIRONMENT=${ENVIRONMENT:-development}

# Map 'development' to 'dev' and 'production' to 'prod'
if [ "$ENVIRONMENT" = "production" ]; then
    ENV_DIR="prod"
else
    ENV_DIR="dev"
fi

# Define base directories
BASE_DIR=${CFS}/${PROJECT}/bilbomd
UPLOAD_DIR=${BASE_DIR}/${ENV_DIR}/uploads/${UUID}
WORKDIR=${PSCRATCH}/bilbomd/${ENV_DIR}/${UUID}

echo "Copying results back to CFS..."
cp -nR $WORKDIR/* $UPLOAD_DIR
echo "DONE copying $UUID"