#!/bin/bash
#
# remember to export the BILBOMD_API_ variables before running this script
#
# export BILBOMD_API_TOKEN="your_api_token_here"
# export BILBOMD_API_URL="https://bilbomd-nersc.bl1231.als.lbl.gov/api/v1/external/jobs"
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Or put these variable in a .env file
set -a
source "$SCRIPT_DIR/.env"
set +a

PDB_FILE="$SCRIPT_DIR/../test/data/auto1/auto1.pdb"
DAT_FILE="$SCRIPT_DIR/../test/data/auto1/saxs-data.dat"
INP_FILE="$SCRIPT_DIR/../test/data/auto1/const.inp"

TITLE_DATE=$(date +%m%d)
TITLE_SUFFIX=$(date +%s | tail -c 5)

RESPONSE_FILE=$(mktemp)
HTTP_STATUS=$(curl -# -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST "$API_URL"/ \
  -H "Authorization: Bearer $BILBOMD_API_TOKEN" \
  -H "Accept: application/json" \
  -F "bilbomd_mode=pdb" \
  -F "md_engine=OpenMM" \
  -F "title=${TITLE_DATE}-api-test-pdb-auto1-${TITLE_SUFFIX}" \
  -F "pdb_file=@${PDB_FILE}" \
  -F "dat_file=@${DAT_FILE}" \
  -F "inp_file=@${INP_FILE}" )

echo "HTTP Status: $HTTP_STATUS"
jq . < "$RESPONSE_FILE" || cat "$RESPONSE_FILE"
rm "$RESPONSE_FILE"