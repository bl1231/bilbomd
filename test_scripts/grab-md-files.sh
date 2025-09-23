#!/usr/bin/env bash
set -euo pipefail

# Usage: ./grab-md-dcds.sh <UUID> [DEST_DIR]
# Example:
#   ./grab-md-dcds.sh e71175cb-f77b-48f2-a9aa-01ad069e976a
#
# Notes:
# - Set HOST via env to override (default: sclassen@perlmutter)
# - Uses rsync includes to pull only rg_*/md.dcd and preserve rg_* directory names.
# I use this to copy files from Perlmutter to my local machine for analysis.

HOST="${HOST:-sclassen@perlmutter}"
BASE_REMOTE="/pscratch/sd/s/sclassen/bilbomd/dev"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <UUID> [DEST_DIR]" >&2
  exit 1
fi

UUID="$1"
DEST="${2:-$UUID}"            # default local destination folder is the UUID

REMOTE_DIR="$BASE_REMOTE/$UUID/openmm/md"

echo "Host:        $HOST"
echo "UUID:        $UUID"
echo "Remote dir:  $REMOTE_DIR"
echo "Local dest:  $DEST"
echo

# Make destination directory (will contain rg_* subdirs)
mkdir -p "$DEST"

# Pull only md.dcd files inside rg_* directories, preserving rg_* structure.
# --prune-empty-dirs keeps the tree tidy if some rg_* don't have md.dcd yet.
rsync -avz --partial --progress --prune-empty-dirs \
  --include='rg_*/' --include='rg_*/md.dcd' --include='rg_*/md.pdb' --exclude='*' \
  "$HOST:$REMOTE_DIR/" "$DEST/"

echo
echo "Done. Collected md.dcd files should now be under: $DEST/"