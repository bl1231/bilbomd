#!/bin/bash

set -euo pipefail

# Determine base64 command based on OS
if [[ "$(uname)" == "Darwin" ]]; then
    # macOS (BSD base64)
    CLIENT_ID_B64=$(base64 < helm-secrets/red-client/clientid.txt | tr -d '\n')
    PRIV_KEY_B64=$(base64 < helm-secrets/red-client/priv_key.pem | tr -d '\n')
else
    # Linux (GNU base64)
    CLIENT_ID_B64=$(base64 -b 0 helm-secrets/red-client/clientid.txt)
    PRIV_KEY_B64=$(base64 -b 0 helm-secrets/red-client/priv_key.pem)
fi

# Define contexts
CONTEXTS=("nersc-spin-dev" "nersc-spin-prod")

for CONTEXT in "${CONTEXTS[@]}"; do
    echo "🔁 Switching to context: $CONTEXT"
    kubectl config use-context "$CONTEXT"

    echo "🔐 Patching bilbomd-secrets..."
    kubectl patch secret bilbomd-secrets \
        -p "{\"data\":{\"SFAPI_CLIENT_ID\":\"$CLIENT_ID_B64\"}}"

    echo "🔐 Patching sfapi-priv-key..."
    kubectl patch secret sfapi-priv-key \
        -p "{\"data\":{\"priv_key.pem\":\"$PRIV_KEY_B64\"}}"

    VALUES_FILE=""
    NAME=""
    if [[ "$CONTEXT" == "nersc-spin-dev" ]]; then
        NAME="bilbomd-nersc-dev"
        VALUES_FILE="values-dev.yaml"
    elif [[ "$CONTEXT" == "nersc-spin-prod" ]]; then
        NAME="bilbomd-nersc-prod"
        VALUES_FILE="values-prod.yaml"
    else
        echo "❌ Unknown context: $CONTEXT"
        exit 1
    fi

    echo "🚀 Running helm upgrade for $CONTEXT..."
    helm upgrade "$NAME" ./helm -f "./helm/$VALUES_FILE"

    echo "🔁 Restarting key deployments..."
    for DEPLOYMENT in backend ui worker; do
        echo "🔄 Restarting deployment: $DEPLOYMENT"
        kubectl rollout restart deployment "$DEPLOYMENT"
    done

    echo "✅ Done with $CONTEXT"
    echo "------------------------"
done

echo "🎉 All contexts processed successfully."