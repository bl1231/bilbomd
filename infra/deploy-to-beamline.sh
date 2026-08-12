#!/usr/bin/env bash
set -euo pipefail

# deploy-to-beamline.sh — drive the BilboMD Docker Compose stacks.
#
# Each environment is a (compose file, env file, project name) triple. Docker
# Compose isolates stacks by project name, so `dev` and `prod` can run side by
# side on the same host.
#
#   local  docker-compose.local.yml       .env.local  bilbomd-local
#   dev    docker-compose-epyc.dev.yml    .env.dev    bilbomd-dev
#   prod   docker-compose-epyc.prod.yml   .env.prod   bilbomd-prod
#
# Run it from anywhere — it resolves paths relative to the script, not $PWD.

cd "$(dirname "${BASH_SOURCE[0]}")"

# --- colors --------------------------------------------------------------------
BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

ASSUME_YES=0
DRY_RUN=0

usage() {
  cat <<EOF
Usage: $0 [options] [command] <env> [service...]     env = local | dev | prod

Commands:
  up       <env> [service...] Create/refresh the stack in the background (default)
  down     <env>              Stop and remove the stack's containers
  restart  <env> [service...] Restart the whole stack, or just the named services
  pull     <env> [service...] Pull the images named in the compose file
  ps       <env>              Show the stack's containers
  logs     <env> [service...] Follow logs (last 100 lines)
  config   <env>              Print the fully resolved compose config

Options:
  -h, --help      Show this help and exit
  -y, --yes       Skip the confirmation prompt for production environments
  -n, --dry-run   Print the docker compose command instead of running it

Examples:
  $0 local                    # legacy form, same as: up local
  $0 up prod
  $0 logs dev backend worker
  $0 restart prod ui
  $0 --dry-run up prod
EOF
}

die() {
  echo -e "${RED}❌ $*${NC}" >&2
  exit 1
}

have() { command -v "$1" >/dev/null 2>&1; }

# --- argument parsing ----------------------------------------------------------
# Options are pulled out first, then the remainder is put back into "$@" so the
# command / env / service list can be read positionally (and an empty service
# list expands safely under `set -u`).

POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -y|--yes) ASSUME_YES=1 ;;
    -n|--dry-run) DRY_RUN=1 ;;
    --) shift; while [[ $# -gt 0 ]]; do POSITIONAL+=("$1"); shift; done; break ;;
    -*)
      echo -e "${RED}❌ Unknown option: $1${NC}" >&2
      usage >&2
      exit 1
      ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done

if [[ ${#POSITIONAL[@]} -eq 0 ]]; then
  usage >&2
  exit 1
fi

set -- "${POSITIONAL[@]}"

case "$1" in
  up|down|restart|pull|ps|logs|config)
    COMMAND="$1"
    shift
    ;;
  *)
    # Legacy form: `$0 <env>` means `up <env>`.
    COMMAND="up"
    ;;
esac

ENV_NAME="${1:-}"
[[ $# -gt 0 ]] && shift
# Whatever is left in "$@" is the (possibly empty) service list.

# --- environment resolution ----------------------------------------------------

IS_PROD=0
case "$ENV_NAME" in
  local)
    ENV_FILE=".env.local"
    COMPOSE_FILE="docker-compose.local.yml"
    PROJECT_NAME="bilbomd-local"
    ;;
  dev)
    ENV_FILE=".env.dev"
    COMPOSE_FILE="docker-compose-epyc.dev.yml"
    PROJECT_NAME="bilbomd-dev"
    ;;
  prod)
    ENV_FILE=".env.prod"
    COMPOSE_FILE="docker-compose-epyc.prod.yml"
    PROJECT_NAME="bilbomd-prod"
    IS_PROD=1
    ;;
  "")
    echo -e "${RED}❌ Missing env.${NC}" >&2
    usage >&2
    exit 1
    ;;
  *)
    echo -e "${RED}❌ Unknown env: '$ENV_NAME'. Expected 'local', 'dev' or 'prod'.${NC}" >&2
    usage >&2
    exit 1
    ;;
esac

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT_NAME" "$@"
}

# Run (or, under --dry-run, just print) a docker compose invocation.
run_compose() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo -e "${YELLOW}[dry-run]${NC} docker compose --env-file $ENV_FILE -f $COMPOSE_FILE -p $PROJECT_NAME $*"
    return 0
  fi
  compose "$@"
}

# --- preflight -----------------------------------------------------------------

preflight() {
  have docker || die "docker is not installed or not on PATH."
  docker compose version >/dev/null 2>&1 || die "The 'docker compose' plugin is not available."
  docker info >/dev/null 2>&1 || die "Cannot talk to the Docker daemon. Is it running, and are you in the docker group?"

  [[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $PWD/$COMPOSE_FILE"
  [[ -f "$ENV_FILE" ]] || die "Env file not found: $PWD/$ENV_FILE (copy .env.example and edit it)"

  local err
  if ! err="$(compose config -q 2>&1)"; then
    echo -e "${RED}❌ Compose config is invalid:${NC}" >&2
    echo "$err" >&2
    exit 1
  fi
}

# Every stack declares its volumes as `external: true`, so a missing volume
# fails the whole `up` with an opaque message. Check them up front instead.
check_external_volumes() {
  if ! have jq; then
    echo -e "${YELLOW}⚠️  jq not found — skipping the external volume check.${NC}"
    return 0
  fi

  local missing=() vol
  while IFS= read -r vol; do
    [[ -z "$vol" ]] && continue
    docker volume inspect "$vol" >/dev/null 2>&1 || missing+=("$vol")
  done < <(compose config --format json 2>/dev/null |
    jq -r '(.volumes // {}) | to_entries[] | select(.value.external == true) | .value.name // .key')

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo -e "${RED}❌ Missing external Docker volume(s):${NC}" >&2
    printf '   %s\n' "${missing[@]}" >&2
    echo -e "${YELLOW}Create them with:${NC}" >&2
    printf '   docker volume create %s\n' "${missing[@]}" >&2
    exit 1
  fi
}

# Print the image each service will run, so you can see what is about to start.
image_summary() {
  echo -e "${BLUE}📦 Images in $COMPOSE_FILE:${NC}"
  if have jq; then
    compose config --format json 2>/dev/null |
      jq -r '.services | to_entries[] | "   \(.key)\t\(.value.image // "(built locally)")"' |
      column -t -s $'\t'
  else
    compose config --images 2>/dev/null | sed 's/^/   /'
  fi
  echo "--------------------------------"
}

confirm_prod() {
  [[ $IS_PROD -eq 1 ]] || return 0
  [[ $ASSUME_YES -eq 1 || $DRY_RUN -eq 1 ]] && return 0
  if [[ ! -t 0 ]]; then
    die "Refusing to '$COMMAND' the PRODUCTION stack non-interactively. Pass --yes if you mean it."
  fi
  echo -e "${YELLOW}⚠️  This targets the ${RED}PRODUCTION${YELLOW} stack ($PROJECT_NAME).${NC}"
  local reply
  read -r -p "Continue with '$COMMAND'? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
}

# --- dispatch ------------------------------------------------------------------

preflight

echo -e "${BLUE}🎯 ${COMMAND} → ${ENV_NAME}${NC} (project: $PROJECT_NAME, env: $ENV_FILE)"
echo "--------------------------------"

case "$COMMAND" in
  up)
    image_summary
    check_external_volumes
    confirm_prod
    run_compose up -d "$@"
    if [[ $DRY_RUN -eq 0 ]]; then
      echo "--------------------------------"
      compose ps
      echo -e "${GREEN}✅ $PROJECT_NAME is up.${NC}"
    fi
    ;;
  down)
    confirm_prod
    run_compose down
    if [[ $DRY_RUN -eq 0 ]]; then
      echo -e "${GREEN}✅ $PROJECT_NAME is down.${NC}"
    fi
    ;;
  restart)
    confirm_prod
    run_compose restart "$@"
    if [[ $DRY_RUN -eq 0 ]]; then
      echo -e "${GREEN}✅ Restarted.${NC}"
    fi
    ;;
  pull)
    image_summary
    run_compose pull "$@"
    ;;
  ps)
    run_compose ps
    ;;
  logs)
    run_compose logs -f --tail=100 "$@"
    ;;
  config)
    run_compose config
    ;;
esac
