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

CRD_FILE="$SCRIPT_DIR/data/sasdml3/sasdml3.crd"
PSF_FILE="$SCRIPT_DIR/data/sasdml3/sasdml3.psf"
DAT_FILE="$SCRIPT_DIR/data/sasdml3/sasdml3.dat"
# Constraints as JSON (BilboMD no longer accepts const.inp uploads)
CONSTRAINTS_FILE="$SCRIPT_DIR/data/sasdml3/constraints-crd.json"

TITLE_DATE=$(date +%m%d)
TITLE_SUFFIX=$(date +%s | tail -c 5)

RESPONSE_FILE=$(mktemp)
HTTP_STATUS=$(curl -# -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST "$API_URL"/ \
  -H "Authorization: Bearer $BILBOMD_API_TOKEN" \
  -H "Accept: application/json" \
  -F "bilbomd_mode=crd_psf" \
  -F "title=${TITLE_DATE}-api-test-crd-${TITLE_SUFFIX}" \
  -F "crd_file=@${CRD_FILE}" \
  -F "psf_file=@${PSF_FILE}" \
  -F "dat_file=@${DAT_FILE}" \
  -F "constraints=<${CONSTRAINTS_FILE}")

echo "HTTP Status: $HTTP_STATUS"
jq . < "$RESPONSE_FILE" || cat "$RESPONSE_FILE"
rm "$RESPONSE_FILE"
