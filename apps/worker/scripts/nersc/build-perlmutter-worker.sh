#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Print each command before executing it (useful for debugging)
#set -x

# Check if one argument was provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <UUID>"
    exit 1
fi

# Assign args to global variables
UUID=$1

echo "Building bilbomd-perlmutter-worker with UID: $UID"

# Define repository and branch
REPO_URL="https://github.com/bl1231/bilbomd-worker.git"
BRANCH="352-trigger-docker-build-on-perlmutter"
REPO_DIR="${HOME}/projects/webhooks/build/bilbomd-worker"
OPENMM_VER="8.1.2"
CHARMM_VER="c48b2"

# Define source directory
SRC_DIR="/global/cfs/cdirs/m4659/src-needed-for-bilbomd-worker"

# Define files to check and copy if they don't exist
declare -A FILES_TO_CHECK=(
    ["openmm/${OPENMM_VER}.tar.gz"]="${SRC_DIR}/openmm/${OPENMM_VER}.tar.gz"
    ["charmm/${CHARMM_VER}.tar.gz"]="${SRC_DIR}/charmm/${CHARMM_VER}.tar.gz"
    ["bioxtas/bioxtasraw-master.zip"]="${SRC_DIR}/bioxtasraw/bioxtasraw-master.zip"
)

# Ensure the repository directory exists
mkdir -p "$(dirname "$REPO_DIR")"

# Checkout the latest code
if [ -d "$REPO_DIR" ]; then
    echo "Repository directory already exists. Pulling latest changes."
    cd "$REPO_DIR" || exit
    git fetch origin
    git checkout $BRANCH
    git pull origin $BRANCH
else
    echo "Cloning repository."
    git clone -b $BRANCH $REPO_URL $REPO_DIR
    cd "$REPO_DIR" || exit
fi

# Check and copy necessary files
for file in "${!FILES_TO_CHECK[@]}"; do
    dest_file="$REPO_DIR/$file"
    src_file="${FILES_TO_CHECK[$file]}"
    if [ ! -f "$dest_file" ]; then
        echo "File $dest_file does not exist. Copying from $src_file."
        mkdir -p "$(dirname "$dest_file")"
        cp "$src_file" "$dest_file"
    else
        echo "File $dest_file already exists."
    fi
done

# Build the Docker image
echo "Building Docker image..."
podman-hpc build --build-arg USER_ID=$UID -t bilbomd/bilbomd-perlmutter-worker -f bilbomd-perlmutter-worker.dockerfile .

# Migrate (or push) the Docker image
echo "Migrating Docker image..."
podman-hpc migrate bilbomd/bilbomd-perlmutter-worker:latest