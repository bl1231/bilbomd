#!/usr/bin/env bash
set -euo pipefail

# Determine environment: CLI arg wins, then BILBOMD_ENV, default to "dev"
ENVIRONMENT="${1:-${BILBOMD_ENV:-dev}}"

# Translate "development" to "dev" and "production" to "prod"
case "${ENVIRONMENT}" in
  development) ENVIRONMENT="dev" ;;
  production) ENVIRONMENT="prod" ;;
  dev|prod) ;;  # Already correct
  *) echo "Usage: $0 [development|production|dev|prod]"
     echo "Or set BILBOMD_ENV=development|production|dev|prod"
     echo "Got: '${ENVIRONMENT}'"
     exit 1 ;;
esac

LOCAL_DIR="/app/scripts/nersc"

# Base CFS root can be overridden if needed
BASE_ROOT="${BILBOMD_CFS_BASE_ROOT:-/global/cfs/cdirs/m4659/bilbomd}"

# If BILBOMD_CFS_SCRIPT_ROOT is set, it wins; otherwise derive from env
REMOTE_ROOT="${BILBOMD_CFS_SCRIPT_ROOT:-${BASE_ROOT}/${ENVIRONMENT}/scripts}"

VERSION="${BILBOMD_VERSION:-dev}"
DEST="${REMOTE_ROOT}/${VERSION}"

echo "[sync] Syncing NERSC scripts"
echo "       env:  ${ENVIRONMENT}"
echo "       from: ${LOCAL_DIR}"
echo "       to:   ${DEST}"

# ensure destination dir
mkdir -p "${DEST}"

# Define the specific files to copy
FILES_TO_COPY=(
  "copy-back-to-cfs.sh"
  "gen-bilbomd-slurm-file.sh"
  "gen-openmm-slurm-file.py"
)

# copy specific files
for file in "${FILES_TO_COPY[@]}"; do
  rsync -av "${LOCAL_DIR}/${file}" "${DEST}/"
done

echo "[sync] Done."