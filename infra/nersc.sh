#!/bin/bash

set -euo pipefail

# nersc.sh — admin tool for the bilbomd-nersc Helm release on NERSC Spin/Rancher.
#
# Usage:
#   ./nersc.sh [options] [command] <env>      env = dev | prod
#
#   deploy   <env>   (default)  preflight, images, history, active jobs, confirm, upgrade
#   status   <env>              read-only: helm status, deployments, pods, images
#   diff     <env>              read-only: what an upgrade would change
#   rollback <env> [revision]   roll back to previous (or given) revision
#   sfapi    <env|all>          rotate Superfacility API creds (patch secrets + restart)
#
# Backward compatible: `./nersc.sh dev` is treated as `deploy dev`.
#
# Every helm and kubectl call names the env's kube-context and namespace
# explicitly; the script never switches your current kubectl context. (It used
# to, and a later bare `helm upgrade` meant for Berkelium then ran against
# nersc-spin-prod.)

# --- settings ------------------------------------------------------------------

# Paths are relative to this script's directory (infra/), so it can be run
# from anywhere. helm-secrets/ is local only (gitignored).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
CHART_PATH="./helm-nersc"
RED_CLIENT_DIR="./helm-secrets/red-client"

# Spin cluster each env must reach (the Rancher cluster ID at the end of the
# context's API server URL), so a renamed or miswired context can't deploy
# "dev" to prod. Override with NERSC_SPIN_DEV_CLUSTER / NERSC_SPIN_PROD_CLUSTER.
EXPECTED_CLUSTER_DEV="${NERSC_SPIN_DEV_CLUSTER:-c-fwj56}"
EXPECTED_CLUSTER_PROD="${NERSC_SPIN_PROD_CLUSTER:-c-tmq7p}"

# helm --wait otherwise gives up after 5 min, e.g. on a slow image pull
TIMEOUT="15m"
ASSUME_YES="false"
DRY_RUN="false"

# --- colors --------------------------------------------------------------------
BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

# --- helpers -------------------------------------------------------------------

usage() {
  cat <<EOF
Usage: $0 [options] [command] <env>     env = dev | prod

Commands:
  deploy   <env>            Deploy the release (default if command omitted)
  status   <env>            Show current release status (read-only)
  diff     <env>            Show what an upgrade would change (read-only)
  rollback <env> [revision] Roll back to previous (or given) revision
  sfapi    <env|all>        Rotate Superfacility API creds (patch secrets + restart)

Options:
  -y, --yes                 Don't ask for confirmation
  -n, --dry-run             deploy: render and validate on the server, change nothing
  --timeout <dur>           helm timeout for deploy/rollback (default: $TIMEOUT)
  -h, --help                Show this help

Examples:
  $0 status dev
  $0 diff prod
  $0 deploy prod
  $0 --dry-run deploy prod
  $0 dev                    # legacy form, same as: deploy dev
  $0 rollback prod 19
  $0 sfapi all              # rotate SFAPI creds in both dev and prod
EOF
}

die() {
  echo -e "${RED}❌ $*${NC}" >&2
  exit 1
}

require_tools() {
  local missing=()
  for tool in kubectl helm yq jq; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  [[ ${#missing[@]} -eq 0 ]] || die "Missing required tool(s): ${missing[*]}"
}

context_for() { echo "nersc-spin-$1"; }

expected_cluster_for() {
  case "$1" in
    dev) echo "$EXPECTED_CLUSTER_DEV" ;;
    prod) echo "$EXPECTED_CLUSTER_PROD" ;;
  esac
}

# helm and kubectl for the current $ENV, always with its context and namespace
H() { helm --kube-context "$(context_for "$ENV")" -n "$NS" "$@"; }
K() { kubectl --context "$(context_for "$ENV")" -n "$NS" "$@"; }

# The API server URL of a kube-context
context_server() {
  local ctx="$1" cluster
  cluster=$(kubectl config view -o jsonpath="{.contexts[?(@.name=='$ctx')].context.cluster}")
  kubectl config view -o jsonpath="{.clusters[?(@.name=='$cluster')].cluster.server}"
}

# Check an env: valid name, its context exists, points at the expected Spin
# cluster, and the namespace is reachable.
validate_env() {
  local env="$1"
  if [[ "$env" != "dev" && "$env" != "prod" ]]; then
    echo -e "${RED}❌ Invalid or missing env: '${env:-}'. Expected 'dev' or 'prod'.${NC}" >&2
    usage >&2
    exit 1
  fi
  local ctx contexts server expected
  ctx=$(context_for "$env")
  # Capture, then grep: `kubectl … | grep -q` can fail under pipefail (SIGPIPE)
  contexts="$(kubectl config get-contexts -o name 2>/dev/null || true)"
  grep -qx "$ctx" <<<"$contexts" || die "kube-context '$ctx' not found."
  server=$(context_server "$ctx")
  expected=$(expected_cluster_for "$env")
  [[ "$server" == */k8s/clusters/"$expected" ]] ||
    die "kube-context '$ctx' points at '${server:-<none>}', expected Spin cluster '$expected' for $env."
  kubectl --context "$ctx" -n "$NS" get namespace "$NS" >/dev/null 2>&1 ||
    die "Can't reach namespace '$NS' through '$ctx' (expired Spin token? see helm-nersc/NOTES.md)."
}

show_context() {
  local ctx
  ctx=$(context_for "$ENV")
  echo -e "🎯 ${BLUE}$RELEASE${NC} on context ${BLUE}$ctx${NC} ($(context_server "$ctx")), namespace ${BLUE}$NS${NC}"
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

# Print the image repository:tag for each service from values-<env>.yaml.
image_summary() {
  local values_file="$CHART_PATH/values-$ENV.yaml"
  echo -e "${BLUE}📦 Images from $(basename "$values_file"):${NC}"
  for svc in ui backend worker mongo redis; do
    local repo tag
    repo=$(yq ".${svc}.image.repository" "$values_file")
    tag=$(yq ".${svc}.image.tag" "$values_file")
    printf "   %-9s %s:%s\n" "$svc" "$repo" "$tag"
  done
  echo "--------------------------------"
}

# Print the chart version + appVersion from the local Chart.yaml.
chart_summary() {
  local chart_file="$CHART_PATH/Chart.yaml"
  echo -e "${BLUE}🧩 Chart $(basename "$chart_file"):${NC}"
  printf "   %-12s %s\n" "version" "$(yq '.version' "$chart_file")"
  printf "   %-12s %s\n" "appVersion" "$(yq '.appVersion' "$chart_file")"
  echo "--------------------------------"
}

history_summary() {
  echo -e "${BLUE}📜 Helm history for $RELEASE (last 5):${NC}"
  H history "$RELEASE" --max 5 2>/dev/null || echo -e "${YELLOW}   (no prior release — first install)${NC}"
  echo "--------------------------------"
}

# BilboMD jobs not finished yet, read from the env's MongoDB (read-only). A
# deploy restarts the worker, which monitors the Perlmutter jobs and runs their
# FoXS/MultiFoXS follow-up, so show them before going ahead. Prints nothing
# when there are none; returns non-zero if MongoDB couldn't be queried.
active_jobs() {
  K exec deploy/mongo -- sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" \
    -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "
    const active = [\"Submitted\", \"Pending\", \"Running\"];
    for (const { name } of db.adminCommand({ listDatabases: 1, nameOnly: true }).databases) {
      const d = db.getSiblingDB(name);
      if (!d.getCollectionNames().includes(\"jobs\")) continue;
      d.jobs.find({ status: { \$in: active } }, { title: 1, status: 1, uuid: 1, \"nersc.state\": 1 })
        .sort({ time_submitted: -1 }).limit(20)
        .forEach((j) => print([j.status, (j.uuid || \"\").slice(0, 8), j.nersc?.state || \"-\", j.title].join(\"\\t\")));
    }"' 2>/dev/null
}

# Shows the active jobs and sets ACTIVE_JOBS (empty when there are none)
jobs_summary() {
  local jobs
  echo -e "${BLUE}🧪 Active BilboMD jobs (status, uuid, Slurm state, title):${NC}"
  if ! jobs="$(active_jobs)"; then
    echo -e "${YELLOW}   (couldn't query MongoDB; check by hand before restarting the worker)${NC}"
    ACTIVE_JOBS="unknown"
  elif [[ -z "$jobs" ]]; then
    echo -e "${GREEN}   none${NC}"
    ACTIVE_JOBS=""
  else
    echo "$jobs" | column -t -s $'\t' | sed 's/^/   /'
    echo -e "${YELLOW}   A deploy restarts the worker that monitors these jobs.${NC}"
    ACTIVE_JOBS="$jobs"
  fi
  echo "--------------------------------"
}

# Read-only status block; reused at the end of deploy/rollback.
show_status() {
  chart_summary

  echo -e "${BLUE}📜 Helm status for $RELEASE:${NC}"
  H status "$RELEASE" 2>/dev/null | grep -E '^(NAME|LAST DEPLOYED|NAMESPACE|STATUS|REVISION):' ||
    echo -e "${YELLOW}   (no release found)${NC}"
  echo "--------------------------------"
  history_summary

  echo -e "${BLUE}🚀 Deployments & pods in $NS:${NC}"
  K get deploy,pods
  echo "--------------------------------"

  echo -e "${BLUE}🏷️  Running container images:${NC}"
  K get deploy -o json |
    jq -r '.items[] | "   \(.metadata.name)\t\(.spec.template.spec.containers[0].image)"' | column -t -s $'\t'
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

# On failure during deploy/rollback/sfapi, surface helm status + warnings so the
# error isn't an opaque Helm message (e.g. the old agent/.spec.replicas conflict).
on_error() {
  echo -e "${RED}❌ Failed at line $1.${NC}" >&2
  echo -e "${YELLOW}--- helm status ---${NC}" >&2
  H status "$RELEASE" 2>/dev/null | grep -E '^(STATUS|REVISION|DESCRIPTION):' >&2 || true
  echo -e "${YELLOW}--- recent warning events ---${NC}" >&2
  K get events --field-selector type=Warning --sort-by=.lastTimestamp 2>/dev/null | tail -n 15 >&2 || true
  exit 1
}

# base64-encode a file with no line wrapping, portable across BSD (macOS) and GNU.
b64_file() {
  local file="$1"
  if [[ "$(uname)" == "Darwin" ]]; then
    base64 <"$file" | tr -d '\n'
  else
    base64 -w 0 "$file"
  fi
}

# --- commands ------------------------------------------------------------------

cmd_status() {
  show_context
  show_status
}

cmd_diff() {
  show_context
  local tmp changes
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT
  H get manifest "$RELEASE" >"$tmp/deployed.yaml" 2>/dev/null ||
    die "No deployed release '$RELEASE' to compare with."
  # --no-hooks: `helm get manifest` leaves hook resources out
  helm template "$RELEASE" "$CHART_PATH" -n "$NS" --no-hooks \
    -f "$CHART_PATH/values.yaml" -f "$CHART_PATH/values-$ENV.yaml" >"$tmp/new.yaml"
  echo -e "${BLUE}🔍 Deployed (-) vs local chart (+), helm.sh/chart labels ignored:${NC}"
  # diff exits 1 when the files differ: collect output, don't test a pipeline
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

  show_context
  image_summary
  history_summary
  ACTIVE_JOBS=""
  jobs_summary

  # Use server-side apply explicitly (Helm 4's "auto" otherwise inherits the
  # previous release's method, which differs between dev and prod). --force-conflicts
  # lets Helm reclaim field ownership (e.g. .spec.replicas after a manual scale-down
  # via the Spin UI, or the one-time client-side -> server-side migration).
  local upgrade=(upgrade --install "$RELEASE" "$CHART_PATH"
    -f "$CHART_PATH/values.yaml"
    -f "$CHART_PATH/values-$ENV.yaml"
    --server-side=true
    --force-conflicts
    --wait
    --timeout "$TIMEOUT")

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "🧪 Dry run: rendering ${BLUE}$RELEASE${NC} with values-$ENV.yaml and validating it on the server..."
    H "${upgrade[@]}" --dry-run=server >/dev/null
    echo -e "${GREEN}✅ Dry run of $RELEASE passed; nothing was changed.${NC}"
    return 0
  fi

  if [[ "$ENV" == "prod" ]]; then
    confirm "⚠️  You are about to deploy to PRODUCTION."
  elif [[ -n "$ACTIVE_JOBS" ]]; then
    confirm "⚠️  Jobs may be active on $ENV."
  fi

  echo -e "🚀 Deploying ${BLUE}$RELEASE${NC} using values-$ENV.yaml..."
  H "${upgrade[@]}"

  echo -e "${GREEN}✅ Deployment of $RELEASE completed.${NC}"
  echo "--------------------------------"
  show_status
}

cmd_rollback() {
  local revision="${1:-}"
  trap 'on_error $LINENO' ERR

  show_context
  history_summary

  if [[ -z "$revision" ]]; then
    local current
    current=$(H history "$RELEASE" -o json | jq -r '.[-1].revision')
    revision=$((current - 1))
    [[ "$revision" -ge 1 ]] || die "No previous revision to roll back to."
    echo -e "${YELLOW}No revision given; rolling back to previous revision: $revision${NC}"
  fi
  jobs_summary

  confirm "⚠️  Rolling back $RELEASE ($ENV) to revision $revision."

  H rollback "$RELEASE" "$revision" --wait --timeout "$TIMEOUT"

  echo -e "${GREEN}✅ Rolled back $RELEASE to revision $revision.${NC}"
  echo "--------------------------------"
  show_status
}

# Rotate the Superfacility API creds for a single env: patch the two secrets from
# the local red-client files, then restart the deployments that consume them.
# No helm upgrade is needed — patching the secrets and restarting the pods is
# sufficient to pick up the new values.
sfapi_one_env() {
  ENV="$1"
  RELEASE="bilbomd-nersc-$ENV"
  show_context

  echo -e "🔐 Patching ${BLUE}bilbomd-secrets${NC} (SFAPI_CLIENT_ID)..."
  K patch secret bilbomd-secrets --patch-file "$PATCH_DIR/client-id.json"

  echo -e "🔐 Patching ${BLUE}sfapi-priv-key${NC} (priv_key.pem)..."
  K patch secret sfapi-priv-key --patch-file "$PATCH_DIR/priv-key.json"

  echo -e "${BLUE}🔁 Restarting deployments that use the SFAPI creds:${NC}"
  for deployment in backend ui worker; do
    echo "   🔄 $deployment"
    K rollout restart deployment "$deployment"
  done

  echo -e "${GREEN}✅ SFAPI creds rotated for $RELEASE.${NC}"
  echo "--------------------------------"
}

cmd_sfapi() {
  local target="$1"
  trap 'on_error $LINENO' ERR

  local clientid_file="$RED_CLIENT_DIR/clientid.txt"
  local priv_key_file="$RED_CLIENT_DIR/priv_key.pem"
  for f in "$clientid_file" "$priv_key_file"; do
    [[ -f "$f" ]] || die "Missing red-client file: $f"
  done

  # The patches go through private temp files rather than `kubectl patch -p`,
  # where the secret values would be visible in `ps` while it runs. Encode once:
  # the values are the same for every env.
  PATCH_DIR="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$PATCH_DIR'" EXIT
  chmod 700 "$PATCH_DIR"
  (
    umask 077
    printf '{"data":{"SFAPI_CLIENT_ID":"%s"}}' "$(b64_file "$clientid_file")" >"$PATCH_DIR/client-id.json"
    printf '{"data":{"priv_key.pem":"%s"}}' "$(b64_file "$priv_key_file")" >"$PATCH_DIR/priv-key.json"
  )

  local envs=()
  if [[ "$target" == "all" ]]; then
    envs=(dev prod)
  else
    envs=("$target")
  fi

  local env
  for env in "${envs[@]}"; do
    if [[ "$env" == "prod" ]]; then
      confirm "⚠️  This will rotate SFAPI creds in PRODUCTION and restart its pods."
    fi
  done

  for env in "${envs[@]}"; do
    sfapi_one_env "$env"
  done

  echo -e "${GREEN}🎉 All requested contexts processed successfully.${NC}"
}

# --- arg parsing & dispatch ----------------------------------------------------

POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -y | --yes) ASSUME_YES="true" ;;
    -n | --dry-run) DRY_RUN="true" ;;
    --timeout)
      [[ $# -ge 2 ]] || die "--timeout needs a value (e.g. 15m)"
      TIMEOUT="$2"
      shift
      ;;
    -h | --help | help)
      usage
      exit 0
      ;;
    -*) die "Unknown option: '$1' (see --help)" ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done

require_tools

NS=$(yq '.namespace' "$CHART_PATH/values.yaml")

# Determine command + env. If the first arg is an env, command defaults to deploy.
COMMAND="${POSITIONAL[0]:-}"
ENV=""
case "$COMMAND" in
  dev | prod)
    ENV="$COMMAND"
    COMMAND="deploy"
    echo -e "${YELLOW}ℹ️  '$0 $ENV' is the legacy form of '$0 deploy $ENV'.${NC}"
    ;;
  deploy | status | diff | rollback | sfapi)
    ENV="${POSITIONAL[1]:-}"
    ;;
  "")
    usage
    exit 0
    ;;
  *)
    echo -e "${RED}❌ Unknown command: '$COMMAND'${NC}" >&2
    usage >&2
    exit 1
    ;;
esac

[[ "$DRY_RUN" != "true" || "$COMMAND" == "deploy" ]] || die "--dry-run only applies to deploy."

# sfapi accepts 'all' (loop over both envs); the others require a single env.
if [[ "$COMMAND" == "sfapi" && "$ENV" == "all" ]]; then
  validate_env dev
  validate_env prod
  cmd_sfapi all
  exit 0
fi

validate_env "$ENV"
RELEASE="bilbomd-nersc-$ENV"

case "$COMMAND" in
  deploy) cmd_deploy ;;
  status) cmd_status ;;
  diff) cmd_diff ;;
  rollback) cmd_rollback "${POSITIONAL[2]:-}" ;;
  sfapi) cmd_sfapi "$ENV" ;;
esac
