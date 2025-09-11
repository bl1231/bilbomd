#!/bin/bash
#
# remember to export the BILBOMD_API_ variables before running this script
#
# export BILBOMD_API_TOKEN="your_api_token_here"
# export BILBOMD_API_URL="https://bilbomd-nersc.bl1231.als.lbl.gov/api/v1/external/jobs"
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Or put thise variable in a .env file
set -a
source "$SCRIPT_DIR/.env"
set +a

DAT_FILE="$SCRIPT_DIR/../test/data/af-dimer/xrcc4_dimer.dat"
SEQ_FILE="$SCRIPT_DIR/../test/data/af-dimer/entities.json"

TITLE_DATE=$(date +%m%d)
TITLE_SUFFIX=$(date +%s | tail -c 5)

RESPONSE_FILE=$(mktemp)
HTTP_STATUS=$(curl -# -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST "$API_URL"/ \
  -H "Authorization: Bearer $BILBOMD_API_TOKEN" \
  -H "Accept: application/json" \
  -F "bilbomd_mode=alphafold" \
  -F "title=${TITLE_DATE}-api-test-af-dimer-${TITLE_SUFFIX}" \
  -F "dat_file=@${DAT_FILE}" \
  -F "entities_json=$(< "$SEQ_FILE")" )

echo "HTTP Status: $HTTP_STATUS"
jq . < "$RESPONSE_FILE" || cat "$RESPONSE_FILE"
rm "$RESPONSE_FILE"

