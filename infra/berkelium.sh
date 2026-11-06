#!/bin/bash

set -euo pipefail

# berkelium.sh — admin tool for the bilbomd Helm release on Berkelium, LBL
# Science IT's Kubernetes cluster (chart: infra/helm-berkelium).
#
# Usage:
#   ./berkelium.sh [options] [command]
#
#   deploy   (default)   preflight, versions, history, running jobs, confirm, upgrade
#   status               read-only: release, workloads, job pods, images, warnings
#   diff                 read-only: what an upgrade would change in the cluster
#   rollback [revision]  roll back to the previous (or given) revision
#
# Every helm and kubectl call names the Berkelium context and namespace
# explicitly. The script never switches your current kubectl context. (A
# leftover context, e.g. from nersc.sh, once sent a Berkelium install to NERSC.)
# Preflight also refuses to run against a cluster without Berkelium's APIs.

# --- settings ------------------------------------------------------------------

KUBE_CONTEXT="${BERKELIUM_KUBE_CONTEXT:-oidc@berkelium}"
NS="bilbomd"
RELEASE="bilbomd"
# Helm waits for the of3-weights post-install/upgrade hook; its first run (cold
# image pull + 2.2 GB download) takes longer than Helm's default 5 min.
TIMEOUT="20m"
ASSUME_YES="false"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_PATH="$SCRIPT_DIR/helm-berkelium"

# --- colors --------------------------------------------------------------------
BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

# --- helpers -------------------------------------------------------------------

usage() {
  cat <<EOF
Usage: $0 [options] [command]

Commands:
  deploy               Upgrade (or install) the release (default)
  status               Show the release, workloads, job pods and images (read-only)
  diff                 Show what an upgrade would change (read-only)
  rollback [revision]  Roll back to the previous (or given) revision

Options:
  -y, --yes            Don't ask for confirmation
  --timeout <dur>      Helm timeout (default: $TIMEOUT)
  -h, --help           Show this help

Environment:
  BERKELIUM_KUBE_CONTEXT   kube-context for Berkelium (default: oidc@berkelium)

Examples:
  $0 status
  $0 diff
  $0                   # same as: deploy
  $0 rollback 5
EOF
}

die() {
  echo -e "${RED}❌ $*${NC}" >&2
  exit 1
}

# helm and kubectl, always pinned to Berkelium's context and namespace
H() { helm --kube-context "$KUBE_CONTEXT" -n "$NS" "$@"; }
K() { kubectl --context "$KUBE_CONTEXT" -n "$NS" "$@"; }

require_tools() {
  local missing=()
  for tool in kubectl helm yq jq; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  [[ ${#missing[@]} -eq 0 ]] || die "Missing required tool(s): ${missing[*]}"
}

# Refuse to touch anything unless the context is reachable and really is
# Berkelium: the chart needs Gateway API HTTPRoutes and DRA ResourceClaimTemplates,
# which other clusters (e.g. NERSC Spin) don't have.
preflight() {
  local contexts
  contexts="$(kubectl config get-contexts -o name 2>/dev/null || true)"
  grep -qx "$KUBE_CONTEXT" <<<"$contexts" ||
    die "kube-context '$KUBE_CONTEXT' not found (see infra/helm-berkelium/README.md for kubeconfig setup)."
  K get namespace "$NS" >/dev/null 2>&1 ||
    die "Can't reach namespace '$NS' through '$KUBE_CONTEXT' (expired OIDC login? try: kubectl --context $KUBE_CONTEXT get pods -n $NS)."
  # Capture first, then grep: piping into `grep -q` under pipefail fails
  # whenever grep exits before kubectl finishes writing (SIGPIPE). kubectl can
  # also exit non-zero when an unrelated API group's discovery fails.
  local missing=() gateway dra
  gateway="$(kubectl --context "$KUBE_CONTEXT" api-resources --api-group=gateway.networking.k8s.io -o name 2>/dev/null || true)"
  dra="$(kubectl --context "$KUBE_CONTEXT" api-resources --api-group=resource.k8s.io -o name 2>/dev/null || true)"
  grep -q '^httproutes' <<<"$gateway" || missing+=("HTTPRoute (gateway.networking.k8s.io)")
  grep -q '^resourceclaimtemplates' <<<"$dra" || missing+=("ResourceClaimTemplate (resource.k8s.io)")
  [[ ${#missing[@]} -eq 0 ]] ||
    die "'$KUBE_CONTEXT' doesn't look like Berkelium; missing API(s): ${missing[*]}"
  echo -e "🎯 Berkelium: context ${BLUE}$KUBE_CONTEXT${NC}, namespace ${BLUE}$NS${NC}, release ${BLUE}$RELEASE${NC}"
  echo "--------------------------------"
}

confirm() {
  [[ "$ASSUME_YES" == "true" ]] && return 0
  local answer
  read -r -p "$1 Type 'yes' to continue: " answer
  [[ "$answer" == "yes" ]] || {
    echo -e "${YELLOW}Aborted.${NC}"
    exit 0
  }
}

chart_summary() {
  echo -e "${BLUE}🧩 Local chart ($CHART_PATH):${NC}"
  printf "   %-12s %s\n" "version" "$(yq '.version' "$CHART_PATH/Chart.yaml")"
  printf "   %-12s %s\n" "appVersion" "$(yq '.appVersion' "$CHART_PATH/Chart.yaml")"
  echo -e "${BLUE}📦 Images in values.yaml:${NC}"
  yq '.images | to_entries | .[] | select(.value | tag == "!!map") | .key + " " + .value.repository + ":" + .value.tag' \
    "$CHART_PATH/values.yaml" | while read -r name image; do printf "   %-17s %s\n" "$name" "$image"; done
  echo "--------------------------------"
}

history_summary() {
  echo -e "${BLUE}📜 Helm history for $RELEASE (last 5):${NC}"
  H history "$RELEASE" --max 5 2>/dev/null || echo -e "${YELLOW}   (no prior release — first install)${NC}"
  echo "--------------------------------"
}

# BilboMD job pods that haven't finished. Upgrading restarts the dispatcher;
# running Jobs survive it and are adopted again, but say so before going ahead.
running_jobs() {
  K get pods -l app.kubernetes.io/component=job --no-headers 2>/dev/null |
    awk '$3 != "Completed" && $3 != "Error"' || true
}

jobs_summary() {
  local running
  running="$(running_jobs)"
  echo -e "${BLUE}🧪 BilboMD job pods still running:${NC}"
  if [[ -z "$running" ]]; then
    echo -e "${GREEN}   none${NC}"
  else
    echo "$running" | sed 's/^/   /'
    echo -e "${YELLOW}   An upgrade restarts the dispatcher; running Jobs keep going and are adopted again.${NC}"
  fi
  echo "--------------------------------"
}

show_status() {
  echo -e "${BLUE}📜 Helm status for $RELEASE:${NC}"
  H status "$RELEASE" 2>/dev/null | grep -E '^(NAME|LAST DEPLOYED|NAMESPACE|STATUS|REVISION):' ||
    echo -e "${YELLOW}   (no release found)${NC}"
  echo "--------------------------------"
  history_summary

  echo -e "${BLUE}🚀 Workloads in $NS:${NC}"
  K get deploy,statefulset,cronjob
  echo "--------------------------------"
  jobs_summary

  echo -e "${BLUE}🏷️  Running images:${NC}"
  K get deploy,statefulset -o json |
    jq -r '.items[] | "   \(.metadata.name)\t\([.spec.template.spec.containers[].image] | join(", "))"' |
    column -t -s $'\t'
  echo "--------------------------------"

  echo -e "${BLUE}⚠️  Recent warning events (last 15):${NC}"
  local events
  events=$(K get events --field-selector type=Warning --sort-by=.lastTimestamp 2>/dev/null | tail -n 15)
  if [[ -z "$events" || "$events" == "No resources found"* ]]; then
    echo -e "${GREEN}   none 🎉${NC}"
  else
    echo "$events"
  fi
}

# On failure, show the release state and recent warnings instead of only Helm's message
on_error() {
  echo -e "${RED}❌ Failed at line $1.${NC}" >&2
  echo -e "${YELLOW}--- helm status ---${NC}" >&2
  H status "$RELEASE" 2>/dev/null | grep -E '^(STATUS|REVISION|DESCRIPTION):' >&2 || true
  echo -e "${YELLOW}--- recent warning events ---${NC}" >&2
  K get events --field-selector type=Warning --sort-by=.lastTimestamp 2>/dev/null | tail -n 15 >&2 || true
  exit 1
}

# --- commands ------------------------------------------------------------------

cmd_status() {
  chart_summary
  show_status
}

cmd_diff() {
  local tmp
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT
  H get manifest "$RELEASE" >"$tmp/deployed.yaml" 2>/dev/null ||
    die "No deployed release '$RELEASE' to compare with."
  H get values "$RELEASE" -o yaml >"$tmp/user-values.yaml"
  # --no-hooks: `helm get manifest` leaves hook resources (the of3-weights Job) out
  helm template "$RELEASE" "$CHART_PATH" -n "$NS" --no-hooks -f "$tmp/user-values.yaml" >"$tmp/new.yaml"
  echo -e "${BLUE}🔍 Deployed (-) vs local chart (+), helm.sh/chart labels ignored:${NC}"
  # diff exits 1 when the files differ, so collect its output instead of
  # testing a pipeline's status (pipefail)
  local changes
  changes="$(diff -u "$tmp/deployed.yaml" "$tmp/new.yaml" || true)"
  changes="$(grep -E '^[-+]' <<<"$changes" | grep -v -E '^(\+\+\+|---) |^[-+][[:space:]]*$|helm.sh/chart:' || true)"
  if [[ -n "$changes" ]]; then
    echo "$changes"
  else
    echo -e "${GREEN}   no changes${NC}"
  fi
}

cmd_deploy() {
  trap 'on_error $LINENO' ERR
  chart_summary
  history_summary
  jobs_summary
  confirm "⚠️  About to upgrade $RELEASE on Berkelium (timeout $TIMEOUT)."

  echo -e "🚀 Deploying ${BLUE}$RELEASE${NC}..."
  H upgrade --install "$RELEASE" "$CHART_PATH" --timeout "$TIMEOUT"

  echo -e "${GREEN}✅ Deployment of $RELEASE completed.${NC}"
  echo "--------------------------------"
  show_status
}

cmd_rollback() {
  local revision="${1:-}"
  trap 'on_error $LINENO' ERR
  history_summary
  if [[ -z "$revision" ]]; then
    local current
    current=$(H history "$RELEASE" -o json | jq -r '.[-1].revision')
    revision=$((current - 1))
    [[ "$revision" -ge 1 ]] || die "No previous revision to roll back to."
    echo -e "${YELLOW}No revision given; rolling back to the previous revision: $revision${NC}"
  fi
  jobs_summary
  confirm "⚠️  About to roll back $RELEASE on Berkelium to revision $revision."

  H rollback "$RELEASE" "$revision" --wait --timeout "$TIMEOUT"

  echo -e "${GREEN}✅ Rolled back $RELEASE to revision $revision.${NC}"
  echo "--------------------------------"
  show_status
}

# --- arg parsing & dispatch ----------------------------------------------------

COMMAND=""
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -y | --yes) ASSUME_YES="true" ;;
    --timeout)
      [[ $# -ge 2 ]] || die "--timeout needs a value (e.g. 20m)"
      TIMEOUT="$2"
      shift
      ;;
    -h | --help | help)
      usage
      exit 0
      ;;
    deploy | status | diff | rollback)
      [[ -z "$COMMAND" ]] || die "Only one command at a time (got '$COMMAND' and '$1')"
      COMMAND="$1"
      ;;
    -*) die "Unknown option: '$1' (see --help)" ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done
COMMAND="${COMMAND:-deploy}"
if [[ "$COMMAND" != "rollback" && ${#ARGS[@]} -gt 0 ]]; then
  die "Unexpected argument(s): ${ARGS[*]} (see --help)"
fi

require_tools
preflight

case "$COMMAND" in
  deploy) cmd_deploy ;;
  status) cmd_status ;;
  diff) cmd_diff ;;
  rollback) cmd_rollback "${ARGS[0]:-}" ;;
esac
