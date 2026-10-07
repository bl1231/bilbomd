#!/usr/bin/env bash
set -euo pipefail

# Scripts dir in the docker image (apps/worker/scripts plus tools/python)
SCRIPTS_ROOT="${SCRIPTS_ROOT:-/app/scripts}"
SRC="${SCRIPTS_ROOT}/nersc"

# This is the CFS destination mounted into the SPIN container
DEST="${DEST:-/bilbomd/scripts}"

echo "[sync] Syncing NERSC scripts"
echo "       from: ${SRC}"
echo "       to:   ${DEST}"

# Define the specific files to copy
FILES_TO_COPY=(
  "copy-back-to-cfs.sh"
  "gen-charmm-slurm-file.py"
  "gen-openmm-slurm-file.py"
)

# copy specific files
for file in "${FILES_TO_COPY[@]}"; do
  rsync -av "${SRC}/${file}" "${DEST}/"
done

# CHARMM input templates read by gen-charmm-slurm-file.py from its own directory
rsync -av --delete "${SRC}/bilbomd-templates/" "${DEST}/bilbomd-templates/"

# Scripts the Slurm jobs run (job-scripts.txt), which the generators copy into
# each job's workdir. Build the new set beside the old one and swap it in, so a
# generator running now never copies a half-synced set.
rm -rf "${DEST}/job-scripts.new"
rsync -a -r --files-from="${SRC}/job-scripts.txt" \
  --exclude='__pycache__' --exclude='.pytest_cache' --exclude='test_*.py' --exclude='conftest.py' \
  "${SCRIPTS_ROOT}/" "${DEST}/job-scripts.new/"
rm -rf "${DEST}/job-scripts.old"
[ -d "${DEST}/job-scripts" ] && mv "${DEST}/job-scripts" "${DEST}/job-scripts.old"
mv "${DEST}/job-scripts.new" "${DEST}/job-scripts"
rm -rf "${DEST}/job-scripts.old"

echo "[sync] Done."