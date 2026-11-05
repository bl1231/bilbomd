#!/bin/sh
# Add an IPv6 listener to the BilboMD server block when the container has an
# IPv6 stack. Needed on IPv6-only Kubernetes clusters (Berkelium), harmless
# elsewhere. The stock nginx image's 10-listen-on-ipv6-by-default.sh skips our
# config because it only edits the unmodified packaged default.conf.
# Runs from /docker-entrypoint.d/ before nginx starts.
set -e

CONF=${BILBOMD_NGINX_CONF:-/etc/nginx/conf.d/default.conf}
IF_INET6=${BILBOMD_IF_INET6:-/proc/net/if_inet6}
ME=$(basename "$0")

if [ ! -f "$IF_INET6" ]; then
  echo "$ME: info: no IPv6 stack, keeping IPv4-only listener"
  exit 0
fi

if grep -q 'listen[[:space:]]*\[::\]:80' "$CONF"; then
  echo "$ME: info: IPv6 listener already present in $CONF"
  exit 0
fi

if [ ! -w "$CONF" ]; then
  echo "$ME: warning: $CONF is not writable, not adding IPv6 listener"
  exit 0
fi

# After each `listen 80;` line, add the same line for [::]:80 (same indent).
TMP=$(mktemp)
awk '{
  print
  if (match($0, /^[[:space:]]*listen[[:space:]]+80;[[:space:]]*$/)) {
    indent = $0; sub(/listen.*/, "", indent)
    print indent "listen       [::]:80;"
  }
}' "$CONF" > "$TMP"
cat "$TMP" > "$CONF"
rm -f "$TMP"
echo "$ME: info: added IPv6 listener to $CONF"
