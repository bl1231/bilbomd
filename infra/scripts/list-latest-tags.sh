#!/usr/bin/env bash
set -euo pipefail

# List the newest semver tag published to GHCR for each BilboMD container image.
#
# Usage:
#   ./list-latest-tags.sh
#
# Environment:
#   GH_OWNER=<org-or-user>                    # default: bl1231
#   IMAGES="bilbomd-backend bilbomd-ui ..."   # default: all BilboMD images
#   GITHUB_TOKEN=<token with read:packages>   # only used for the curl fallback
#
# Requires jq, plus one of:
#   - the gh CLI, authenticated with the read:packages scope, or
#   - GITHUB_TOKEN set to a PAT with read:packages
#
# The GHCR package-versions API requires authentication even for public
# packages, so an unscoped token will fail with 403/401.

OWNER="${GH_OWNER:-bl1231}"
IMAGES="${IMAGES:-bilbomd-backend bilbomd-ui bilbomd-worker-base bilbomd-worker bilbomd-scoper-base bilbomd-scoper bilbomd-of3-service bilbomd-colabfold bilbomd-colabfold-service}"

have() { command -v "$1" >/dev/null 2>&1; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

have jq || die "jq is required (brew install jq)"

# ---------------------------------------------------------------------------
# Is OWNER an org or a user? Decides the REST path prefix.
# ---------------------------------------------------------------------------
SCOPE="users"
if have gh; then
  gh api -X GET "/orgs/${OWNER}" >/dev/null 2>&1 && SCOPE="orgs"
else
  curl -fsSL -H "Accept: application/vnd.github+json" \
    "https://api.github.com/orgs/${OWNER}" >/dev/null 2>&1 && SCOPE="orgs"
fi

versions_url() { printf '/%s/%s/packages/container/%s/versions' "$SCOPE" "$OWNER" "$1"; }

# ---------------------------------------------------------------------------
# Pick an auth method once, up front. Probing here means a missing scope is
# reported a single time with a fix, instead of once per image.
# ---------------------------------------------------------------------------
PROBE="${IMAGES%% *}"
METHOD=""
GH_ERR=""

if have gh; then
  # Capture stderr only: 2>&1 aims stderr at the substitution, then stdout is discarded.
  if GH_ERR="$(gh api -H "Accept: application/vnd.github+json" \
      "$(versions_url "$PROBE")?per_page=1" 2>&1 >/dev/null)"; then
    METHOD="gh"
  fi
fi

if [[ -z "$METHOD" && -n "${GITHUB_TOKEN:-}" ]]; then
  if curl -fsSL -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      "https://api.github.com$(versions_url "$PROBE")?per_page=1" >/dev/null 2>&1; then
    METHOD="curl"
  fi
fi

if [[ -z "$METHOD" ]]; then
  {
    printf 'Cannot read GHCR package versions for %s (probe image: %s).\n' "$OWNER" "$PROBE"
    [[ -n "$GH_ERR" ]] && printf '  gh: %s\n' "$GH_ERR"
    printf '\n'
    case "$GH_ERR" in
      *404*|*"Not Found"*)
        printf 'A 404 usually means GH_OWNER or the image name is wrong, or the\n'
        printf 'package is private and your token cannot see it.\n'
        ;;
      *)
        printf 'Fix one of:\n'
        printf '  gh auth refresh -h github.com -s read:packages   # grant gh the scope\n'
        printf '  export GITHUB_TOKEN=<PAT with read:packages>     # use the curl fallback\n'
        ;;
    esac
  } >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Fetch + parse
# ---------------------------------------------------------------------------

# versions JSON -> "<tag> <created_at>" lines. The type guard keeps an error
# body (an object, not an array) from producing a jq "cannot index" message.
parse_tags() {
  jq -r 'if type == "array" then .[] else empty end
         | .created_at as $created
         | .metadata.container.tags[]?
         | "\(.) \($created)"'
}

fetch_tags() {
  local pkg="$1"
  case "$METHOD" in
    gh)
      gh api -H "Accept: application/vnd.github+json" --paginate \
        "$(versions_url "$pkg")?per_page=100" 2>/dev/null | parse_tags
      ;;
    curl)
      # No pagination here: only the 100 most recent versions are considered.
      curl -fsSL -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer ${GITHUB_TOKEN}" \
        "https://api.github.com$(versions_url "$pkg")?per_page=100" 2>/dev/null | parse_tags
      ;;
  esac
}

# Keep strict semver tags only (no pre-release/build), highest version wins.
latest_semver() {
  grep -E '^[0-9]+\.[0-9]+\.[0-9]+ ' | sort -uV -k1,1 | tail -1
}

# ISO-8601 UTC -> local time. GNU date, then coreutils gdate, then BSD date.
to_local_time() {
  local iso="$1" epoch
  date -d "$iso" "+%Y-%m-%d %H:%M:%S %Z" 2>/dev/null && return 0
  gdate -d "$iso" "+%Y-%m-%d %H:%M:%S %Z" 2>/dev/null && return 0
  epoch="$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" "+%s" 2>/dev/null || true)"
  if [[ -n "$epoch" ]]; then
    date -r "$epoch" "+%Y-%m-%d %H:%M:%S %Z"
  else
    printf '%s' "$iso"
  fi
}

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
for pkg in $IMAGES; do
  latest="$(fetch_tags "$pkg" | latest_semver || true)"
  ver="${latest%% *}"

  if [[ -z "$ver" ]]; then
    printf '%s: (no semver tag found)\n' "$pkg"
    continue
  fi

  created="${latest#* }"
  printf '%s\t%s\t%s\tghcr.io/%s/%s:%s\n' \
    "$pkg" "$ver" "$(to_local_time "$created")" "$OWNER" "$pkg" "$ver"
done
