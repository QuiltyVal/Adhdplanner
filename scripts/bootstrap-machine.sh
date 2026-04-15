#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT"

echo "[bootstrap] repo: $REPO_ROOT"

if [[ -f ".nvmrc" ]]; then
  NODE_VERSION="$(tr -d '[:space:]' < .nvmrc)"
  echo "[bootstrap] recommended Node version: $NODE_VERSION"
  echo "[bootstrap] if needed: nvm use || nvm install"
fi

echo "[bootstrap] installing npm dependencies..."
npm install

echo ""
echo "[bootstrap] done"
echo "[bootstrap] next commands:"
echo "  bash scripts/sync-local.sh"
echo "  npm start"
echo "  npm run verify"
