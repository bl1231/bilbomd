#!/usr/bin/env bash
set -euo pipefail

# Source dir which is present in teh docker image
SRC="/app/scripts/nersc"

# This is the CFS destination mounted into the SPIN container
DEST="/bilbomd/scripts"

echo "[sync] Syncing NERSC scripts"
echo "       from: ${SRC}"
echo "       to:   ${DEST}"

# Define the specific files to copy
FILES_TO_COPY=(
  "nersc-test.sh"
  "copy-back-to-cfs.sh"
  "gen-bilbomd-slurm-file.sh"
  "gen-openmm-slurm-file.py"
)

# copy specific files
for file in "${FILES_TO_COPY[@]}"; do
  rsync -av "${SRC}/${file}" "${DEST}/"
done

echo "[sync] Done."