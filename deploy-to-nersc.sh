#!/bin/bash

set -euo pipefail

ENV="${1:-}"

if [[ -z "$ENV" || ( "$ENV" != "dev" && "$ENV" != "prod" ) ]]; then
  echo "❌ Usage: $0 [dev|prod]"
  exit 1
fi

RELEASE="bilbomd-nersc-$ENV"
VALUES_FILE="values-$ENV.yaml"
CHART_PATH="./helm"

echo "🚀 Deploying $RELEASE using $VALUES_FILE..."

echo "🧭 Current context: $(kubectl config current-context)"
echo "📛 Current namespace: $(kubectl config view --minify --output 'jsonpath={..namespace}')"
echo "--------------------------------"

/usr/local/bin/helm upgrade --install "$RELEASE" "$CHART_PATH" \
  -f "$CHART_PATH/values.yaml" \
  -f "$CHART_PATH/$VALUES_FILE" \
  --wait

echo "✅ Deployment of $RELEASE completed."