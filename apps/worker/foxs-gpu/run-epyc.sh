#!/usr/bin/env bash
# Run the FoXS benchmark on epyc against finished dev jobs.
# Usage: ./run-epyc.sh <out-subdir> <job-uuid>[:label] [<job-uuid>[:label] ...]
# Uses GPU 0 only (dev's GPU; prod is pinned to GPU 1) and the dev MPS daemon.
set -euo pipefail

IMAGE=${IMAGE:-bilbomd-foxs-bench:local}
UPLOADS=${UPLOADS:-/bilbomd/dev/uploads}
SCRATCH=${SCRATCH:-/scr/foxs-bench}
MPS_VOLUME=${MPS_VOLUME:-bilbomd-dev_mps-pipe}
GPU=${GPU:-0}
EXTRA_ARGS=${EXTRA_ARGS:-}

run_name=$1
shift
mkdir -p "$SCRATCH/$run_name"

for spec in "$@"; do
  job=${spec%%:*}
  label=${spec#*:}
  [ "$label" = "$spec" ] && label=$job
  exp=$(cd "$UPLOADS/$job" && ls *.dat | grep -v '\.orig$' | head -1)
  echo "=== $label ($job, $exp) ==="
  # shellcheck disable=SC2086
  docker run --rm --gpus "device=$GPU" --user "$(id -u):$(id -g)" \
    -v "$UPLOADS/$job:/job:ro" \
    -v "$SCRATCH/$run_name:/out" \
    -v "$MPS_VOLUME:/run/nvidia-mps" \
    "$IMAGE" python3 /opt/foxs-bench/bench.py \
    --job-dir /job --exp-dat "$exp" --out "/out/$label" --label "$label" \
    --mps-pipe /run/nvidia-mps $EXTRA_ARGS
done
