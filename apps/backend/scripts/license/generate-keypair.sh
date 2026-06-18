#!/usr/bin/env bash
#
# generate-keypair.sh — one-time generation of the BilboMD license keypair.
#
# Produces an RS256 (RSA-2048) keypair in the current directory:
#   license-private-key.pem  → KEEP OFFLINE. Store in a vault/password manager.
#                              This is the secret that lets you mint licenses.
#                              NEVER commit it or copy it into a Docker image.
#   license-public-key.pem   → copy to apps/backend/src/license/license-public-key.pem
#                              and commit it. Safe to publish.
#
# Rotating the keypair requires cutting a new backend release (the public key is
# compiled into the image) and re-issuing all licensee tokens.
#
set -euo pipefail

PRIV="license-private-key.pem"
PUB="license-public-key.pem"

if [[ -e "$PRIV" || -e "$PUB" ]]; then
  echo "Refusing to overwrite existing $PRIV / $PUB in $(pwd)." >&2
  echo "Move or delete them first if you really intend to regenerate." >&2
  exit 1
fi

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$PRIV"
openssl rsa -pubout -in "$PRIV" -out "$PUB" 2>/dev/null

chmod 600 "$PRIV"

echo "Wrote:"
echo "  $PRIV  (private — store OFFLINE, never commit)"
echo "  $PUB   (public  — copy to apps/backend/src/license/license-public-key.pem and commit)"
