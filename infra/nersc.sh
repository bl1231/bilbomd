#!/bin/bash

set -euo pipefail

# nersc.sh — admin tool for the bilbomd-nersc Helm release on NERSC Spin/Rancher.
#
# Usage:
#   ./nersc.sh [command] <env>      env = dev | prod
#
#   deploy   <env>   (default)  preflight, show image tags, history, then upgrade
#   status   <env>              read-only: helm status, deployments, pods, images
#   rollback <env> [revision]   roll back to previous (or given) revision
#   sfapi    <env|all>          rotate Superfacility API creds (patch secrets + restart)
#
# Backward compatible: `./nersc.sh dev` is treated as `deploy dev`.

# --- colors --------------------------------------------------------------------
BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

CHART_PATH="./helm"
RED_CLIENT_DIR="./helm-secrets/red-client"

# --- helpers -------------------------------------------------------------------

usage() {
  cat <<EOF
Usage: $0 [command] <env>     env = dev | prod

Commands:
  deploy   <env>            Deploy the release (default if command omitted)
  status   <env>            Show current release status (read-only)
  rollback <env> [revision] Roll back to previous (or given) revision
  sfapi    <env|all>        Rotate Superfacility API creds (patch secrets + restart)

Examples:
  $0 status dev
  $0 deploy prod
  $0 dev                    # legacy form, same as: deploy dev
  $0 rollback prod 19
  $0 sfapi all              # rotate SFAPI creds in both dev and prod
EOF
}

require_tools() {
  local missing=()
  for tool in kubectl helm yq jq; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${RED}❌ Missing required tool(s): ${missing[*]}${NC}" >&2
    exit 1
  fi
}

# Validate a single env and that its kube-context exists.
validate_env() {
  local env="$1"
  if [[ "$env" != "dev" && "$env" != "prod" ]]; then
    echo -e "${RED}❌ Invalid or missing env: '${env:-}'. Expected 'dev' or 'prod'.${NC}" >&2
    usage >&2
    exit 1
  fi
  if ! kubectl config get-contexts -o name 2>/dev/null | grep -qx "nersc-spin-$env"; then
    echo -e "${RED}❌ kube-context 'nersc-spin-$env' not found.${NC}" >&2
    exit 1
  fi
}

use_context() {
  local env="$1"
  echo -e "🔧 Switching to context: ${BLUE}nersc-spin-$env${NC}"
  kubectl config use-context "nersc-spin-$env" >/dev/null
  echo "🧭 Current context: $(kubectl config current-context)"
  echo "📛 Current namespace: $NS"
  echo "--------------------------------"
}

# Print the image repository:tag for each service from values-<env>.yaml.
image_summary() {
  local env="$1"
  local values_file="$CHART_PATH/values-$env.yaml"
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
  local version app_version
  version=$(yq '.version' "$chart_file")
  app_version=$(yq '.appVersion' "$chart_file")
  echo -e "${BLUE}🧩 Chart $(basename "$chart_file"):${NC}"
  printf "   %-12s %s\n" "version" "$version"
  printf "   %-12s %s\n" "appVersion" "$app_version"
  echo "--------------------------------"
}

# Read-only status block; reused at the end of deploy/rollback.
show_status() {
  chart_summary

  echo -e "${BLUE}📜 Helm status for $RELEASE:${NC}"
  helm status "$RELEASE" 2>/dev/null | grep -E '^(NAME|LAST DEPLOYED|NAMESPACE|STATUS|REVISION):' || \
    echo -e "${YELLOW}   (no release found)${NC}"
  echo "--------------------------------"

  echo -e "${BLUE}📜 Helm history for $RELEASE (last 5):${NC}"
  helm history "$RELEASE" --max 5 2>/dev/null || echo -e "${YELLOW}   (no prior release)${NC}"
  echo "--------------------------------"

  echo -e "${BLUE}🚀 Deployments & pods in $NS:${NC}"
  kubectl get deploy,pods -n "$NS"
  echo "--------------------------------"

  echo -e "${BLUE}🏷️  Running container images:${NC}"
  kubectl get deploy -n "$NS" -o json | \
    jq -r '.items[] | "   \(.metadata.name)\t\(.spec.template.spec.containers[0].image)"' | column -t -s $'\t'
  echo "--------------------------------"

  echo -e "${BLUE}⚠️  Recent warning events (last 15):${NC}"
  local events
  events=$(kubectl get events -n "$NS" --field-selector type=Warning --sort-by=.lastTimestamp 2>/dev/null | tail -n 15)
  if [[ -z "$events" || "$events" == "No resources found"* ]]; then
    echo -e "${GREEN}   none 🎉${NC}"
  else
    echo "$events"
  fi
}

# On failure during deploy/rollback/sfapi, surface helm status + warnings so the
# error isn't an opaque Helm message (e.g. the old agent/.spec.replicas conflict).
on_error() {
  local line="$1"
  echo -e "${RED}❌ Failed at line $line.${NC}" >&2
  echo -e "${YELLOW}--- helm status ---${NC}" >&2
  helm status "$RELEASE" 2>/dev/null | grep -E '^(STATUS|REVISION|DESCRIPTION):' >&2 || true
  echo -e "${YELLOW}--- recent warning events ---${NC}" >&2
  kubectl get events -n "$NS" --field-selector type=Warning --sort-by=.lastTimestamp 2>/dev/null | tail -n 15 >&2 || true
  exit 1
}

# base64-encode a file with no line wrapping, portable across BSD (macOS) and GNU.
b64_file() {
  local file="$1"
  if [[ "$(uname)" == "Darwin" ]]; then
    base64 < "$file" | tr -d '\n'
  else
    base64 -b 0 "$file"
  fi
}

# --- commands ------------------------------------------------------------------

cmd_status() {
  local env="$1"
  use_context "$env"
  show_status
}

cmd_deploy() {
  local env="$1"
  trap 'on_error $LINENO' ERR

  use_context "$env"
  image_summary "$env"

  echo -e "${BLUE}📜 Helm history for $RELEASE (last 5):${NC}"
  helm history "$RELEASE" --max 5 2>/dev/null || echo -e "${YELLOW}   (no prior release — first install)${NC}"
  echo "--------------------------------"

  if [[ "$env" == "prod" ]]; then
    echo -e "${RED}⚠️  You are about to deploy to PRODUCTION.${NC}"
    read -r -p "Type 'yes' to continue: " confirm
    if [[ "$confirm" != "yes" ]]; then
      echo -e "${YELLOW}Aborted.${NC}"
      exit 0
    fi
  fi

  echo -e "🚀 Deploying ${BLUE}$RELEASE${NC} using values-$env.yaml..."

  # Use server-side apply explicitly (Helm 4's "auto" otherwise inherits the
  # previous release's method, which differs between dev and prod). --force-conflicts
  # lets Helm reclaim field ownership (e.g. .spec.replicas after a manual scale-down
  # via the Spin UI, or the one-time client-side -> server-side migration).
  helm upgrade --install "$RELEASE" "$CHART_PATH" \
    -f "$CHART_PATH/values.yaml" \
    -f "$CHART_PATH/values-$env.yaml" \
    --server-side=true \
    --force-conflicts \
    --wait

  echo -e "${GREEN}✅ Deployment of $RELEASE completed.${NC}"
  echo "--------------------------------"
  show_status
}

cmd_rollback() {
  local env="$1"
  local revision="${2:-}"
  trap 'on_error $LINENO' ERR

  use_context "$env"

  echo -e "${BLUE}📜 Helm history for $RELEASE (last 5):${NC}"
  helm history "$RELEASE" --max 5

  if [[ -z "$revision" ]]; then
    local current
    current=$(helm history "$RELEASE" -o json | jq -r '.[-1].revision')
    revision=$((current - 1))
    if [[ "$revision" -lt 1 ]]; then
      echo -e "${RED}❌ No previous revision to roll back to.${NC}" >&2
      exit 1
    fi
    echo -e "${YELLOW}No revision given; rolling back to previous revision: $revision${NC}"
  fi

  echo -e "${RED}⚠️  Rolling back $RELEASE ($env) to revision $revision.${NC}"
  read -r -p "Type 'yes' to continue: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo -e "${YELLOW}Aborted.${NC}"
    exit 0
  fi

  helm rollback "$RELEASE" "$revision" --wait

  echo -e "${GREEN}✅ Rolled back $RELEASE to revision $revision.${NC}"
  echo "--------------------------------"
  show_status
}

# Rotate the Superfacility API creds for a single env: patch the two secrets from
# the local red-client files, then restart the deployments that consume them.
# No helm upgrade is needed — patching the secrets and restarting the pods is
# sufficient to pick up the new values.
sfapi_one_env() {
  local env="$1"
  RELEASE="bilbomd-nersc-$env"

  use_context "$env"

  echo -e "🔐 Patching ${BLUE}bilbomd-secrets${NC} (SFAPI_CLIENT_ID)..."
  kubectl patch secret bilbomd-secrets -n "$NS" \
    -p "{\"data\":{\"SFAPI_CLIENT_ID\":\"$CLIENT_ID_B64\"}}"

  echo -e "🔐 Patching ${BLUE}sfapi-priv-key${NC} (priv_key.pem)..."
  kubectl patch secret sfapi-priv-key -n "$NS" \
    -p "{\"data\":{\"priv_key.pem\":\"$PRIV_KEY_B64\"}}"

  echo -e "${BLUE}🔁 Restarting deployments that use the SFAPI creds:${NC}"
  for deployment in backend ui worker; do
    echo "   🔄 $deployment"
    kubectl rollout restart deployment "$deployment" -n "$NS"
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
    if [[ ! -f "$f" ]]; then
      echo -e "${RED}❌ Missing red-client file: $f${NC}" >&2
      exit 1
    fi
  done

  # Encode once — the files are identical regardless of target env.
  CLIENT_ID_B64=$(b64_file "$clientid_file")
  PRIV_KEY_B64=$(b64_file "$priv_key_file")

  local envs=()
  if [[ "$target" == "all" ]]; then
    envs=(dev prod)
  else
    envs=("$target")
  fi

  if printf '%s\n' "${envs[@]}" | grep -qx prod; then
    echo -e "${RED}⚠️  This will rotate SFAPI creds in PRODUCTION and restart its pods.${NC}"
    read -r -p "Type 'yes' to continue: " confirm
    if [[ "$confirm" != "yes" ]]; then
      echo -e "${YELLOW}Aborted.${NC}"
      exit 0
    fi
  fi

  for env in "${envs[@]}"; do
    sfapi_one_env "$env"
  done

  echo -e "${GREEN}🎉 All requested contexts processed successfully.${NC}"
}

# --- arg parsing & dispatch ----------------------------------------------------

require_tools

NS=$(yq '.namespace' "$CHART_PATH/values.yaml")

# Determine command + env. If the first arg is an env, command defaults to deploy.
COMMAND="${1:-}"
case "$COMMAND" in
  dev|prod)
    ENV="$COMMAND"
    COMMAND="deploy"
    ;;
  deploy|status|rollback|sfapi)
    ENV="${2:-}"
    ;;
  ""|-h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo -e "${RED}❌ Unknown command: '$COMMAND'${NC}" >&2
    usage >&2
    exit 1
    ;;
esac

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
  deploy)   cmd_deploy "$ENV" ;;
  status)   cmd_status "$ENV" ;;
  rollback) cmd_rollback "$ENV" "${3:-}" ;;
  sfapi)    cmd_sfapi "$ENV" ;;
esac
