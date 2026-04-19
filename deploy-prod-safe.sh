#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_FILE="$ROOT_DIR/.vercel/project.json"
EXPECTED_PROJECT="adhdplanner"
EXPECTED_SCOPE="quiltyvals-projects"

if [ ! -f "$PROJECT_FILE" ]; then
  echo "ERROR: Missing .vercel/project.json"
  echo "Run:"
  echo "  npx -y vercel link --project $EXPECTED_PROJECT --scope $EXPECTED_SCOPE --yes"
  exit 1
fi

PROJECT_NAME="$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(String(p.projectName||''));" "$PROJECT_FILE")"

if [ -z "$PROJECT_NAME" ]; then
  echo "ERROR: Could not read projectName from .vercel/project.json"
  exit 1
fi

if [ "$PROJECT_NAME" != "$EXPECTED_PROJECT" ]; then
  echo "ERROR: This repo is linked to '$PROJECT_NAME', expected '$EXPECTED_PROJECT'."
  echo "Fix link:"
  echo "  npx -y vercel link --project $EXPECTED_PROJECT --scope $EXPECTED_SCOPE --yes"
  exit 1
fi

echo "OK: linked to '$EXPECTED_PROJECT'. Deploying production..."
npx -y vercel --prod --yes
