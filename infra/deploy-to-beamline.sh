#!/usr/bin/env bash
set -euo pipefail

# deploy-to-beamline.sh — drive the BilboMD Docker Compose stacks.
#
# `dev` and `prod` each span two beamline hosts. SCOPER runs on hyperion
# because its KGSRna binary only runs on Intel CPUs (epyc is AMD); everything
# else runs on epyc. `local` is a single stack on whatever machine runs this.
#
#   env    host      compose file                      env file            project
#   local  (here)    docker-compose.local.yml          .env.local          bilbomd-local
#   dev    epyc      docker-compose-epyc.dev.yml       .env.dev            bilbomd-dev
#   dev    hyperion  docker-compose-hyperion.dev.yml   .env.hyperion.dev   bilbomd-dev
#   prod   epyc      docker-compose-epyc.prod.yml      .env.prod           bilbomd-prod
#   prod   hyperion  docker-compose-hyperion.prod.yml  .env.hyperion.prod  bilbomd-prod
#
# Run it from anywhere, including your laptop. For each host it SSHes in and
# re-runs itself inside the BilboMD checkout there (skipping SSH when you are
# already on that host), so env files and secrets never leave the servers.
# /home is NFS-shared between epyc and hyperion, so one checkout serves both;
# before up/pull/restart the script fast-forwards it with `git pull --ff-only`.
#
# Overrides (environment variables):
#   BILBOMD_EPYC_HOST      ssh destination for epyc      (default: epyc)
#   BILBOMD_HYPERION_HOST  ssh destination for hyperion  (default: hyperion)
#   BILBOMD_REMOTE_DIR     checkout on the hosts, relative to the remote $HOME
#                          or absolute                   (default: projects/bilbomd)
#
# Keep this file bash 3.2 compatible — that is what macOS ships.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

EPYC_HOST="${BILBOMD_EPYC_HOST:-epyc}"
HYPERION_HOST="${BILBOMD_HYPERION_HOST:-hyperion}"
REMOTE_DIR="${BILBOMD_REMOTE_DIR:-projects/bilbomd}"

# Services defined in the hyperion compose files; every other service is on epyc.
HYPERION_SERVICES="scoper"

# --- colors --------------------------------------------------------------------
BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

ASSUME_YES=0
DRY_RUN=0
NO_PULL=0
ONLY_HOST=""
# Internal: set when this script re-runs itself over SSH on the target host.
EXEC_HERE=0

usage() {
  cat <<EOF
Usage: $0 [options] [command] <env> [service...]     env = local | dev | prod

Commands:
  up       <env> [service...] Create/refresh the stack in the background (default)
  down     <env>              Stop and remove the stack's containers
  restart  <env> [service...] Restart the whole stack, or just the named services
  pull     <env> [service...] Pull the images named in the compose file
  ps       <env> [service...] Show the stack's containers
  logs     <env> [service...] Follow logs (last 100 lines)
  config   <env>              Print the fully resolved compose config

dev and prod run on two hosts: scoper on hyperion, everything else on epyc.
Without services a command covers both hosts; named services are sent to the
host that runs them.

Options:
  -h, --help         Show this help and exit
  -y, --yes          Skip the confirmation prompt for production environments
  -n, --dry-run      Print the docker compose commands instead of running them
  --host <host>      Only act on one host: epyc | hyperion (dev/prod only)
  --no-pull          Don't 'git pull --ff-only' the checkout on the hosts first

Examples:
  $0 local                    # legacy form, same as: up local
  $0 up prod                  # epyc + hyperion
  $0 up dev scoper            # hyperion only
  $0 logs dev backend worker  # epyc only
  $0 --host epyc down dev
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
    --no-pull) NO_PULL=1 ;;
    --host)
      [[ $# -ge 2 ]] || die "--host needs a value: epyc | hyperion"
      ONLY_HOST="$2"
      shift
      ;;
    --host=*) ONLY_HOST="${1#--host=}" ;;
    --exec-here) EXEC_HERE=1 ;;
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

case "$ENV_NAME" in
  local|dev|prod) ;;
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

case "$ONLY_HOST" in
  ""|epyc|hyperion) ;;
  *) die "Unknown --host '$ONLY_HOST'. Expected 'epyc' or 'hyperion'." ;;
esac
[[ "$ENV_NAME" == local && -n "$ONLY_HOST" ]] && die "--host applies to dev and prod only."

if [[ ($COMMAND == down || $COMMAND == config) && $# -gt 0 ]]; then
  die "'$COMMAND' acts on a whole stack and takes no services. Use --host to pick one host."
fi

IS_PROD=0
[[ "$ENV_NAME" == prod ]] && IS_PROD=1
PROJECT_NAME="bilbomd-$ENV_NAME"

# --- targets -------------------------------------------------------------------
# A target is one compose stack on one host: local, epyc or hyperion.

# Point the compose globals at one target's files.
set_target() {
  TARGET="$1"
  NEEDS_INTEL=0
  case "$ENV_NAME:$TARGET" in
    local:local)
      ENV_FILE=".env.local"
      COMPOSE_FILE="docker-compose.local.yml"
      ;;
    dev:epyc|prod:epyc)
      ENV_FILE=".env.$ENV_NAME"
      COMPOSE_FILE="docker-compose-epyc.$ENV_NAME.yml"
      ;;
    dev:hyperion|prod:hyperion)
      ENV_FILE=".env.hyperion.$ENV_NAME"
      COMPOSE_FILE="docker-compose-hyperion.$ENV_NAME.yml"
      NEEDS_INTEL=1
      ;;
    *) die "No '$TARGET' target for env '$ENV_NAME'." ;;
  esac
}

ssh_host_for() {
  case "$1" in
    epyc) echo "$EPYC_HOST" ;;
    hyperion) echo "$HYPERION_HOST" ;;
  esac
}

short_hostname() { hostname -s 2>/dev/null || hostname; }

# Are we already on the named host? Compared by short hostname, not ssh alias.
is_here() { [[ "$(short_hostname)" == "$1" ]]; }

is_hyperion_service() {
  case " $HYPERION_SERVICES " in
    *" $1 "*) return 0 ;;
  esac
  return 1
}

# --- per-target work -----------------------------------------------------------

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

# SCOPER's KGSRna binary only runs on Intel, so refuse to start it anywhere else.
check_intel() {
  [[ $NEEDS_INTEL -eq 1 ]] || return 0
  local vendor
  vendor="$(awk -F': *' '/^vendor_id/ { print $2; exit }' /proc/cpuinfo 2>/dev/null || true)"
  if [[ "$vendor" != GenuineIntel ]]; then
    die "$COMPOSE_FILE runs SCOPER, which needs an Intel CPU, but $(short_hostname) reports '${vendor:-unknown}'."
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

# Run $COMMAND against one target on this machine.
run_target() {
  set_target "$1"
  shift

  preflight

  echo -e "${BLUE}🎯 ${COMMAND} → ${ENV_NAME}${NC} on $(short_hostname) (project: $PROJECT_NAME, env: $ENV_FILE)"
  echo "--------------------------------"

  case "$COMMAND" in
    up)
      check_intel
      image_summary
      check_external_volumes
      run_compose up -d "$@"
      if [[ $DRY_RUN -eq 0 ]]; then
        echo "--------------------------------"
        compose ps
        echo -e "${GREEN}✅ $PROJECT_NAME is up on $(short_hostname).${NC}"
      fi
      ;;
    down)
      run_compose down
      if [[ $DRY_RUN -eq 0 ]]; then
        echo -e "${GREEN}✅ $PROJECT_NAME is down on $(short_hostname).${NC}"
      fi
      ;;
    restart)
      check_intel
      run_compose restart "$@"
      if [[ $DRY_RUN -eq 0 ]]; then
        echo -e "${GREEN}✅ Restarted on $(short_hostname).${NC}"
      fi
      ;;
    pull)
      image_summary
      run_compose pull "$@"
      ;;
    ps)
      run_compose ps "$@"
      ;;
    logs)
      run_compose logs -f --tail=100 "$@"
      ;;
    config)
      run_compose config
      ;;
  esac
}

# Re-run this script over SSH inside the checkout on a target's host.
# SSH_FORCE_TTY=1 allocates a tty even when output is piped, so the remote
# `logs -f` dies with the connection instead of lingering.
SSH_FORCE_TTY=0
run_remote() {
  local target="$1"
  shift
  local host
  host="$(ssh_host_for "$target")"

  local args=(--exec-here --host "$target" --yes --no-pull)
  [[ $DRY_RUN -eq 1 ]] && args+=(--dry-run)
  args+=("$COMMAND" "$ENV_NAME" "$@")

  local remote_cmd a
  remote_cmd="cd $(printf '%q' "$REMOTE_DIR/infra") && ./deploy-to-beamline.sh"
  for a in "${args[@]}"; do
    remote_cmd+=" $(printf '%q' "$a")"
  done

  local tty=()
  if [[ $SSH_FORCE_TTY -eq 1 ]]; then
    tty=(-tt)
  elif [[ -t 0 && -t 1 ]]; then
    tty=(-t)
  fi
  ssh ${tty[@]+"${tty[@]}"} "$host" "$remote_cmd"
}

dispatch() {
  local target="$1"
  shift
  if is_here "$target"; then
    (run_target "$target" "$@")
  else
    run_remote "$target" "$@"
  fi
}

# Fast-forward a checkout so the hosts run the committed compose files.
# Git replaces changed files rather than rewriting them in place, so pulling
# the checkout this script is running from is safe.
sync_checkout() {
  local where="$1" git_cmd
  git_cmd="git pull --ff-only --quiet && echo \"   \$(git branch --show-current) @ \$(git log -1 --format='%h %s')\""
  if [[ $DRY_RUN -eq 1 ]]; then
    echo -e "${YELLOW}[dry-run]${NC} git pull --ff-only (${where})"
    return 0
  fi
  echo -e "${BLUE}🔄 git pull --ff-only (${where})${NC}"
  if [[ "$where" == here ]]; then
    (cd "$SCRIPT_DIR/.." && eval "$git_cmd")
  else
    ssh "$(ssh_host_for "$where")" "cd $(printf '%q' "$REMOTE_DIR") && $git_cmd"
  fi
}

confirm_prod() {
  [[ $IS_PROD -eq 1 ]] || return 0
  [[ $ASSUME_YES -eq 1 || $DRY_RUN -eq 1 ]] && return 0
  case "$COMMAND" in
    up|down|restart) ;;
    *) return 0 ;;
  esac
  if [[ ! -t 0 ]]; then
    die "Refusing to '$COMMAND' the PRODUCTION stack non-interactively. Pass --yes if you mean it."
  fi
  echo -e "${YELLOW}⚠️  This targets the ${RED}PRODUCTION${YELLOW} stack ($PROJECT_NAME) on: $*${NC}"
  local reply
  read -r -p "Continue with '$COMMAND'? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
}

# --- dispatch ------------------------------------------------------------------

# Re-invoked over SSH: run the one target we were sent here for.
if [[ $EXEC_HERE -eq 1 ]]; then
  [[ -n "$ONLY_HOST" ]] || die "--exec-here needs --host."
  is_here "$ONLY_HOST" || die "Sent to run on '$ONLY_HOST', but this is '$(short_hostname)'. Check BILBOMD_$(echo "$ONLY_HOST" | tr a-z A-Z)_HOST."
  run_target "$ONLY_HOST" "$@"
  exit 0
fi

if [[ "$ENV_NAME" == local ]]; then
  run_target local "$@"
  exit 0
fi

# Split the service list by host.
EPYC_SVCS=()
HYPERION_SVCS=()
for svc in "$@"; do
  if is_hyperion_service "$svc"; then
    HYPERION_SVCS+=("$svc")
  else
    EPYC_SVCS+=("$svc")
  fi
done

TARGETS=()
if [[ $# -eq 0 || ${#EPYC_SVCS[@]} -gt 0 ]] && [[ "$ONLY_HOST" != hyperion ]]; then
  TARGETS+=(epyc)
fi
if [[ $# -eq 0 || ${#HYPERION_SVCS[@]} -gt 0 ]] && [[ "$ONLY_HOST" != epyc ]]; then
  TARGETS+=(hyperion)
fi
if [[ ${#TARGETS[@]} -eq 0 ]]; then
  die "None of the services ($*) run on $ONLY_HOST. scoper runs on hyperion; the rest on epyc."
fi

# Take consumers down before the Redis/Mongo they talk to.
if [[ "$COMMAND" == down && ${#TARGETS[@]} -eq 2 ]]; then
  TARGETS=(hyperion epyc)
fi

confirm_prod "${TARGETS[@]}"

if [[ $NO_PULL -eq 0 ]]; then
  case "$COMMAND" in
    up|pull|restart)
      # Local targets use this checkout; remote ones use $REMOTE_DIR, which is
      # the same NFS directory on both hosts, so it only needs pulling once —
      # and not at all if it is this checkout.
      pulled_here=0
      pulled_remote=0
      this_checkout="$(cd "$SCRIPT_DIR/.." && pwd -P)"
      case "$REMOTE_DIR" in
        /*) remote_checkout="$REMOTE_DIR" ;;
        *) remote_checkout="$HOME/$REMOTE_DIR" ;;
      esac
      remote_checkout="$( (cd "$remote_checkout" 2>/dev/null && pwd -P) || true)"
      for t in "${TARGETS[@]}"; do
        if is_here "$t"; then
          if [[ $pulled_here -eq 0 ]]; then
            sync_checkout here
            pulled_here=1
            [[ "$this_checkout" == "$remote_checkout" ]] && pulled_remote=1
          fi
        elif [[ $pulled_remote -eq 0 ]]; then
          sync_checkout "$t"
          pulled_remote=1
        fi
      done
      ;;
  esac
fi

services_for() {
  if [[ "$1" == hyperion ]]; then
    SVCS=(${HYPERION_SVCS[@]+"${HYPERION_SVCS[@]}"})
  else
    SVCS=(${EPYC_SVCS[@]+"${EPYC_SVCS[@]}"})
  fi
}

if [[ "$COMMAND" == logs && ${#TARGETS[@]} -gt 1 ]]; then
  # Follow every host at once, each line labelled with its host.
  SSH_FORCE_TTY=1
  # Take the per-host followers (and their ssh sessions) down with us. Not
  # `kill 0`: without job control that would also hit whatever called us.
  kill_tree() {
    local child
    for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
    kill "$1" 2>/dev/null || true
  }
  FOLLOWERS=()
  trap 'for p in "${FOLLOWERS[@]}"; do kill_tree "$p"; done; exit 130' INT TERM
  for t in "${TARGETS[@]}"; do
    services_for "$t"
    (
      dispatch "$t" ${SVCS[@]+"${SVCS[@]}"} 2>&1 |
        while IFS= read -r line; do printf '[%s] %s\n' "$t" "${line%$'\r'}"; done
    ) &
    FOLLOWERS+=($!)
  done
  wait
  exit 0
fi

for t in "${TARGETS[@]}"; do
  services_for "$t"
  dispatch "$t" ${SVCS[@]+"${SVCS[@]}"}
done
