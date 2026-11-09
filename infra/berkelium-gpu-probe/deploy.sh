#!/bin/bash
# deploy.sh — run the Berkelium GPU availability study (see README.md).
#
#   ./deploy.sh up       create/refresh the script ConfigMap, claim templates and CronJob
#   ./deploy.sh run      start one probe round now (a Job from the CronJob)
#   ./deploy.sh status   CronJob, recent rounds, leftover probe Jobs, sample counts
#   ./deploy.sh logs     log of the most recent round
#   ./deploy.sh fetch [dir]  copy the results to dir (default ./results)
#   ./deploy.sh down     delete every probe object (results on the volume stay)
#
# Every kubectl call names the Berkelium context and namespace explicitly.
set -euo pipefail

KUBE_CONTEXT="${BERKELIUM_KUBE_CONTEXT:-oidc@berkelium}"
NS="bilbomd"
LABEL="app.kubernetes.io/part-of=bilbomd-gpu-probe"
REMOTE_DIR="/bilbomd/uploads/gpu-probe" # as the backend container sees it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

k() { kubectl --context "$KUBE_CONTEXT" -n "$NS" "$@"; }

cmd_up() {
  k create configmap gpu-probe-script --from-file="$SCRIPT_DIR/probe.sh" \
    --dry-run=client -o yaml | kubectl label --local -f - "$LABEL" -o yaml |
    k apply -f -
  k apply -f "$SCRIPT_DIR/gpu-probe.yaml"
}

cmd_run() {
  local name
  name="gpu-probe-manual-$(date -u +%H%M%S)"
  k create job "$name" --from=cronjob/gpu-probe
  echo "Started $name — follow with: kubectl --context $KUBE_CONTEXT -n $NS logs -f job/$name"
}

cmd_status() {
  k get cronjob gpu-probe -o wide || true
  echo
  echo "Recent rounds and probe Jobs:"
  k get jobs -l "$LABEL" --sort-by=.metadata.creationTimestamp || true
  echo
  echo "Samples per GPU class:"
  k exec deploy/backend -c backend -- sh -c \
    "cd $REMOTE_DIR/probes 2>/dev/null && wc -l *.jsonl; ls $REMOTE_DIR/status 2>/dev/null | wc -l | sed 's/$/ status page snapshots/'" ||
    echo "  (no results yet)"
}

cmd_logs() {
  local job
  # Round Jobs, not the per-GPU probe Jobs (those carry a gpu-class label)
  job=$(k get jobs -l "$LABEL,!bilbomd.lbl.gov/gpu-class" \
    --sort-by=.metadata.creationTimestamp -o name | tail -1)
  [ -n "$job" ] || {
    echo "No rounds found" >&2
    exit 1
  }
  k logs "$job"
}

cmd_fetch() {
  local dest="${1:-$SCRIPT_DIR/results}"
  mkdir -p "$dest"
  k exec deploy/backend -c backend -- tar -C "$REMOTE_DIR" -cf - . | tar -C "$dest" -xf -
  echo "Results in $dest"
}

cmd_down() {
  k delete cronjob,job -l "$LABEL" --ignore-not-found
  k delete resourceclaimtemplates.resource.k8s.io,configmap -l "$LABEL" --ignore-not-found
}

case "${1:-}" in
  up) cmd_up ;;
  run) cmd_run ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  fetch) cmd_fetch "${2:-}" ;;
  down) cmd_down ;;
  *)
    sed -n '2,10p' "$0"
    exit 1
    ;;
esac
