#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
export FIRESTORE_DATABASE_ID="${FIRESTORE_DATABASE_ID:-wedding}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "Set PROJECT_ID or run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

echo "Using project ${PROJECT_ID}, database ${FIRESTORE_DATABASE_ID}"
echo ""

npm install --silent

if [[ "${1:-}" == "--dry-run" ]]; then
  node import-guests.mjs --replace --dry-run
else
  node import-guests.mjs --replace
fi
