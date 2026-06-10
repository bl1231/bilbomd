#!/usr/bin/env bash
#
# assign-role.sh — Add or remove a BilboMD user role (e.g. "Admin").
#
# BilboMD stores users in MongoDB with a `roles: string[]` field. There is no
# UI for granting the "Admin" role, so this script does it from the command
# line by running `mongosh` *inside* the running mongo container. You do NOT
# need MongoDB Compass, the mongo shell, or any database port exposed on the
# host — only Docker access.
#
# MULTIPLE DEPLOYMENTS ON ONE HOST
#   docker compose isolates each stack by its PROJECT NAME. `run.sh` starts
#   them as bilbomd-local / bilbomd-dev / bilbomd-prod. This script resolves
#   the mongo container by that project label, so dev and prod never collide:
#
#     ./assign-role.sh --target dev  user@example.com    # touches bilbomd-dev
#     ./assign-role.sh --target prod user@example.com    # touches bilbomd-prod
#
#   If you DON'T pass --target/--project and more than one stack is running,
#   the script refuses to guess and lists the candidates. If exactly one stack
#   is running it uses that one (and tells you which).
#
# Usage:
#   ./assign-role.sh [--target <local|dev|prod>] <email> [role]
#   ./assign-role.sh --target prod user@example.com           # grant Admin
#   ./assign-role.sh --target dev  user@example.com Manager   # grant Manager
#   ./assign-role.sh --target prod --remove user@example.com Admin
#   ./assign-role.sh --target dev  --list user@example.com
#
# Options:
#   --target <name>     local|dev|prod — maps to project bilbomd-<name>.
#   --project <name>    docker compose project name to target directly
#                       (use for custom stacks, e.g. a hyperion deployment).
#   --service <name>    mongo compose service name (default: mongodb).
#   --db <name>         database name (default: $MONGO_DB or "bilbomd").
#   --auth-source <db>  auth source (default: $MONGO_AUTH_SRC or "admin").
#   --env-file <path>   read MONGO_USERNAME/PASSWORD from here instead of the
#                       container's own environment.
#   --list              Show the user's current roles and exit.
#   --remove            Remove the role instead of adding it.
#   --yes               Skip the confirmation prompt.
#   -h, --help          Show this help.
#
# Credentials: by default they are read from the mongo container itself
# (MONGO_INITDB_ROOT_USERNAME / MONGO_INITDB_ROOT_PASSWORD), so you don't have
# to point at the right .env. Override with --env-file if needed.

set -euo pipefail

# --- defaults ---------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=""
PROJECT_NAME=""
SERVICE="mongodb"
ENV_FILE=""
DB_NAME=""
AUTH_SRC=""
ACTION="add"        # add | remove | list
ASSUME_YES="false"
EMAIL=""
ROLE="Admin"

VALID_ROLES=("Admin" "Manager" "User")

# --- helpers ----------------------------------------------------------------
die() {
  echo "Error: $*" >&2
  exit 1
}

usage() {
  sed -n '2,46p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

is_valid_role() {
  local r="$1" v
  for v in "${VALID_ROLES[@]}"; do
    [[ "$r" == "$v" ]] && return 0
  done
  return 1
}

# --- parse args -------------------------------------------------------------
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:?--target needs local|dev|prod}"; shift 2 ;;
    --project) PROJECT_NAME="${2:?--project needs a name}"; shift 2 ;;
    --service) SERVICE="${2:?--service needs a name}"; shift 2 ;;
    --db) DB_NAME="${2:?--db needs a name}"; shift 2 ;;
    --auth-source) AUTH_SRC="${2:?--auth-source needs a name}"; shift 2 ;;
    --env-file) ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --list) ACTION="list"; shift ;;
    --remove) ACTION="remove"; shift ;;
    --yes | -y) ASSUME_YES="true"; shift ;;
    -h | --help) usage 0 ;;
    -*) die "Unknown option: $1 (see --help)" ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

EMAIL="${POSITIONAL[0]:-}"
[[ -n "${POSITIONAL[1]:-}" ]] && ROLE="${POSITIONAL[1]}"

[[ -n "$EMAIL" ]] || die "No email provided. See --help."

# Strict email check — also guards the mongosh eval, since the only values we
# interpolate are an email and a role, both matched against tight patterns.
[[ "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] \
  || die "'$EMAIL' does not look like a valid email address."

if [[ "$ACTION" != "list" ]]; then
  is_valid_role "$ROLE" \
    || die "Invalid role '$ROLE'. Valid roles: ${VALID_ROLES[*]}"
fi

# --target is shorthand for the project name run.sh uses.
if [[ -n "$TARGET" ]]; then
  case "$TARGET" in
    local | dev | prod) ;;
    *) die "Invalid --target '$TARGET'. Use local, dev, or prod." ;;
  esac
  [[ -z "$PROJECT_NAME" ]] && PROJECT_NAME="bilbomd-${TARGET}"
fi

# --- locate the mongo container ---------------------------------------------
command -v docker >/dev/null 2>&1 || die "docker not found on PATH."

# Every compose-managed container carries these labels; we match on them
# rather than container names so this works regardless of how images are named.
SVC_FILTER=(--filter "label=com.docker.compose.service=${SERVICE}" \
            --filter "status=running")

if [[ -z "$PROJECT_NAME" ]]; then
  # No deployment specified — figure out what's running. (Use a while-read loop
  # rather than `mapfile`, which is bash 4+; macOS still ships bash 3.2.)
  PROJECTS=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && PROJECTS+=("$line")
  done < <(
    docker ps "${SVC_FILTER[@]}" \
      --format '{{ .Label "com.docker.compose.project" }}' \
      | sort -u
  )
  case "${#PROJECTS[@]}" in
    0) die "No running '${SERVICE}' container found. Is a stack up (./run.sh ...)?" ;;
    1)
      PROJECT_NAME="${PROJECTS[0]}"
      echo "Auto-selected the only running stack: ${PROJECT_NAME}"
      ;;
    *)
      echo "Multiple stacks are running:" >&2
      printf '  - %s\n' "${PROJECTS[@]}" >&2
      die "Refusing to guess. Re-run with --target <local|dev|prod> or --project <name>."
      ;;
  esac
fi

CID="$(docker ps -q \
  --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
  "${SVC_FILTER[@]}" | head -n1)"
[[ -n "$CID" ]] \
  || die "No running '${SERVICE}' container for project '${PROJECT_NAME}'."

# --- credentials ------------------------------------------------------------
if [[ -n "$ENV_FILE" ]]; then
  [[ -f "$ENV_FILE" ]] || die "Env file not found: $ENV_FILE"
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  MONGO_USER="${MONGO_USERNAME:?MONGO_USERNAME not set in $ENV_FILE}"
  MONGO_PASS="${MONGO_PASSWORD:?MONGO_PASSWORD not set in $ENV_FILE}"
  : "${DB_NAME:=${MONGO_DB:-}}"
  : "${AUTH_SRC:=${MONGO_AUTH_SRC:-}}"
else
  # Pull credentials straight from the container so we don't depend on which
  # .env the operator happens to have on disk.
  MONGO_USER="$(docker exec "$CID" printenv MONGO_INITDB_ROOT_USERNAME 2>/dev/null || true)"
  MONGO_PASS="$(docker exec "$CID" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null || true)"
  [[ -n "$MONGO_USER" && -n "$MONGO_PASS" ]] || die \
    "Could not read Mongo credentials from container ${CID}. Pass --env-file."
fi

DB_NAME="${DB_NAME:-bilbomd}"
AUTH_SRC="${AUTH_SRC:-admin}"

# --- mongosh runner ---------------------------------------------------------
# Run mongosh inside the resolved container, connecting over localhost.
run_mongosh() {
  local js="$1"
  docker exec -i "$CID" mongosh \
    "mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017/${DB_NAME}?authSource=${AUTH_SRC}" \
    --quiet --eval "$js"
}

print_roles() {
  run_mongosh "
    const u = db.users.findOne(
      { email: '${EMAIL}' },
      { email: 1, roles: 1 }
    );
    if (!u) { print('NOT_FOUND'); quit(0); }
    print('ROLES ' + EJSON.stringify(u.roles || []));
  "
}

# --- existence check --------------------------------------------------------
echo "Target stack : ${PROJECT_NAME}  (container ${CID:0:12}, db '${DB_NAME}')"
echo "Looking up '${EMAIL}' ..."
CURRENT="$(print_roles)"

if [[ "$CURRENT" == "NOT_FOUND"* ]]; then
  die "No user with email '${EMAIL}' in '${PROJECT_NAME}'. They must sign in first."
fi

echo "Current roles: ${CURRENT#ROLES }"

if [[ "$ACTION" == "list" ]]; then
  exit 0
fi

# --- confirm ----------------------------------------------------------------
if [[ "$ACTION" == "add" ]]; then
  VERB="Grant"; PREP="to"
else
  VERB="Revoke"; PREP="from"
fi

echo
echo "About to ${VERB} role '${ROLE}' ${PREP} '${EMAIL}' on stack '${PROJECT_NAME}'."
if [[ "$ASSUME_YES" != "true" ]]; then
  read -r -p "Proceed? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

# --- apply ------------------------------------------------------------------
if [[ "$ACTION" == "add" ]]; then
  UPDATE="{ \$addToSet: { roles: '${ROLE}' } }"
else
  UPDATE="{ \$pull: { roles: '${ROLE}' } }"
fi

RESULT="$(run_mongosh "
  const r = db.users.updateOne({ email: '${EMAIL}' }, ${UPDATE});
  print('MATCHED ' + r.matchedCount + ' MODIFIED ' + r.modifiedCount);
")"
echo "$RESULT"

# --- verify -----------------------------------------------------------------
AFTER="$(print_roles)"
echo "Updated roles: ${AFTER#ROLES }"
echo "Done."
