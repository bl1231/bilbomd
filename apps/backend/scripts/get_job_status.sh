#!/bin/bash
#
# remember to export the BILBOMD_API_TOKEN variable before running this script
#
# export BILBOMD_API_TOKEN="your_api_token_here"
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -a
source "$SCRIPT_DIR/.env"
set +a


JOB_ID="$1"

if [ -z "$JOB_ID" ]; then
  echo "Usage: $0 <job_id>"
  exit 1
fi

RESPONSE_FILE=$(mktemp)
HTTP_STATUS=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X GET "${API_URL}/${JOB_ID}/status" \
  -H "Authorization: Bearer ${BILBOMD_API_TOKEN}" \
  -H "Accept: application/json")

echo "HTTP Status: $HTTP_STATUS"
jq . < "$RESPONSE_FILE" || cat "$RESPONSE_FILE"
rm "$RESPONSE_FILE"