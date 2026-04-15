#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$BRANCH" != "main" ]]; then
  echo "[sync] current branch is '$BRANCH'"
  echo "[sync] this helper is for syncing the main working copy between machines."
  echo "[sync] switch to main or sync the feature branch manually."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[sync] tracked changes detected. Commit or stash them before syncing."
  git status --short
  exit 1
fi

echo "[sync] fetching latest origin/main..."
git fetch origin main

echo "[sync] fast-forwarding local main..."
git pull --ff-only origin main

echo "[sync] ensuring dependencies match lockfile..."
npm install

echo "[sync] done"
echo "[sync] current commit: $(git rev-parse --short HEAD)"
