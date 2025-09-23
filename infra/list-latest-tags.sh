#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   GH_OWNER=YOUR_ORG_OR_USERNAME ./latest-tags.sh
#
# Optional:
#   GITHUB_TOKEN=<token with read:packages>   # needed for curl fallback or private packages
#   IMAGES="bilbomd-backend bilbomd-ui bilbomd-worker bilbomd-scoper"

OWNER="${GH_OWNER:-bl1231}"
IMAGES="${IMAGES:-bilbomd-backend bilbomd-ui bilbomd-worker bilbomd-scoper}"

if [[ -z "$OWNER" ]]; then
  echo "GH_OWNER not set. Export GH_OWNER=your-org-or-username" >&2
  exit 1
fi

have_gh() { command -v gh >/dev/null 2>&1; }
have_jq() { command -v jq >/dev/null 2>&1; }

if ! have_jq; then
  echo "jq is required" >&2
  exit 1
fi

# Determine if OWNER is an org or a user (for the REST path prefix)
SCOPE="users"
if have_gh; then
  if gh api -X GET "/orgs/${OWNER}" >/dev/null 2>&1; then
    SCOPE="orgs"
  fi
else
  # curl probe
  if curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/orgs/${OWNER}" >/dev/null 2>&1; then
    SCOPE="orgs"
  fi
fi

fetch_tags_with_gh() {
  local pkg="$1"
  # Pull all pages; collect all tags and created_at dates across versions
  gh api \
    -H "Accept: application/vnd.github+json" \
    --paginate \
    "/${SCOPE}/${OWNER}/packages/container/${pkg}/versions?per_page=100" \
  | jq -r '.[] | .metadata.container.tags[]? as $tag | "\($tag) \(.created_at)"'
}

fetch_tags_with_curl() {
  local pkg="$1"
  if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    echo "GITHUB_TOKEN not set for curl fallback; set it if packages are private" >&2
  fi
  curl -fsSL \
    -H "Accept: application/vnd.github+json" \
    ${GITHUB_TOKEN:+-H "Authorization: Bearer ${GITHUB_TOKEN}"} \
    "https://api.github.com/${SCOPE}/${OWNER}/packages/container/${pkg}/versions?per_page=100" \
  | jq -r '.[] | .metadata.container.tags[]? as $tag | "\($tag) \(.created_at)"'
}

latest_semver() {
  # Input format: tag created_at
  # Filter tags that look like strict semver X.Y.Z (no pre-release/build)
  # Sort using sort -V (version aware) and return the last one with its date.
  awk 'NF' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+ ' | sort -uV -k1,1 | tail -1
}

for pkg in $IMAGES; do
  tags=""
  if have_gh; then
    if ! tags="$(fetch_tags_with_gh "$pkg" || true)"; then tags=""; fi
  fi
  if [[ -z "$tags" ]]; then
    tags="$(fetch_tags_with_curl "$pkg" || true)"
  fi

  ver_and_date="$(printf '%s\n' "$tags" | latest_semver || true)"
  ver="$(printf '%s' "$ver_and_date" | awk '{print $1}')"
  date="$(printf '%s' "$ver_and_date" | awk '{print $2}')"
  if [[ -n "$ver" ]]; then
    echo -e "${pkg}\t${ver}\t${date}\tghcr.io/${OWNER}/${pkg}:${ver}"
  else
    echo "${pkg}: (no semver tag found)"
  fi
done