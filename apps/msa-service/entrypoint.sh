#!/usr/bin/env bash
# Start mmseqs-server in -local mode (server + one worker in one process).
#
#   MSA_GPU=1           run the MMseqs2 searches on the GPU (default 1)
#   MSA_GPU_SERVER=1    keep a resident `mmseqs gpuserver` (default 0: it pins
#                       the padded databases in host memory, ~250 GB)
#   MSA_WORKERS=N       concurrent MSA jobs (default 1)
#   MSA_JOBS_TTL_DAYS   delete finished job dirs older than this (default 2)
set -euo pipefail

DB_DIR="${MSA_DB_DIR:-/databases}"
JOBS_DIR="${MSA_JOBS_DIR:-/jobs}"
GPU="${MSA_GPU:-1}"
GPU_SERVER="${MSA_GPU_SERVER:-0}"
WORKERS="${MSA_WORKERS:-1}"
TTL_DAYS="${MSA_JOBS_TTL_DAYS:-2}"

# Run mmseqs once so a broken binary (e.g. a missing shared library) stops the
# container here. Otherwise the server stays healthy while every ticket fails.
if ! mmseqs_version="$(mmseqs version)"; then
  echo "ERROR: the mmseqs binary does not run" >&2
  exit 1
fi
echo "mmseqs ${mmseqs_version} (pinned ${MMSEQS_COMMIT:-?}), mmseqs-server ${MMSEQS_SERVER_COMMIT:-?}"

# Fail fast and loudly on a missing or half-built database, rather than
# accepting tickets that will all error out.
missing=0
for marker in UNIREF30_READY COLABDB_READY PDB_READY PDB100_READY IDX_READY; do
  if [ ! -e "${DB_DIR}/${marker}" ]; then
    echo "ERROR: ${DB_DIR}/${marker} not found; the database build is incomplete" >&2
    missing=1
  fi
done
for db in uniref30_2302_db colabfold_envdb_202108_db pdb100_230517; do
  if [ ! -e "${DB_DIR}/${db}.idx" ]; then
    echo "ERROR: ${DB_DIR}/${db}.idx not found (run mmseqs createindex, see README)" >&2
    missing=1
  fi
done
if [ "${missing}" -ne 0 ]; then
  exit 1
fi

mkdir -p "${JOBS_DIR}"

# mmseqs-server never deletes job dirs. ColabFold downloads the result right
# after the ticket completes, so anything older than TTL_DAYS is garbage.
(
  while true; do
    find "${JOBS_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime +"${TTL_DAYS}" \
      -exec rm -rf -- {} + 2>/dev/null || true
    sleep 3600
  done
) &

exec mmseqs-server -local -config /app/config.json \
  -paths.results "${JOBS_DIR}" \
  -paths.colabfold.uniref "${DB_DIR}/uniref30_2302_db" \
  -paths.colabfold.pdb "${DB_DIR}/pdb100_230517" \
  -paths.colabfold.environmental "${DB_DIR}/colabfold_envdb_202108_db" \
  -paths.colabfold.pdb70 "${DB_DIR}/pdb100" \
  -paths.colabfold.pdbdivided "${DB_DIR}/pdb/divided" \
  -paths.colabfold.pdbobsolete "${DB_DIR}/pdb/obsolete" \
  -paths.colabfold.gpu.gpu "${GPU}" \
  -paths.colabfold.gpu.server "${GPU_SERVER}" \
  -local.workers "${WORKERS}"
