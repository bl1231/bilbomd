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

KUBE_CONTEXT="bilbomd-$ENV"
echo "🔧 Switching to context: $KUBE_CONTEXT"
kubectl config use-context "$KUBE_CONTEXT"

echo "🚀 Deploying $RELEASE using $VALUES_FILE..."

echo "🧭 Current context: $(kubectl config current-context)"
echo "📛 Current namespace: $(kubectl config view --minify --output 'jsonpath={..namespace}')"
echo "--------------------------------"

echo -e "\033[1;34m📜 Helm History for $RELEASE:\033[0m"
helm history "$RELEASE"

helm upgrade --install "$RELEASE" "$CHART_PATH" \
  -f "$CHART_PATH/values.yaml" \
  -f "$CHART_PATH/$VALUES_FILE" \
  --wait

echo -e "\033[1;32m✅ Deployment of $RELEASE completed.\033[0m"