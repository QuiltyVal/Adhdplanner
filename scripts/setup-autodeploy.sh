#!/bin/bash
# setup-autodeploy.sh
# Run ONCE on Hetzner to enable automatic deploys from git.
# Usage: cd /root/adhdplanner && bash scripts/setup-autodeploy.sh

set -e

echo "[setup] Pulling latest code..."
git pull origin main

echo "[setup] Starting auto-pull watcher in PM2..."
pm2 start scripts/auto-pull.js --name auto-pull --no-autorestart=false

echo "[setup] Saving PM2 process list..."
pm2 save

echo ""
echo "Done! From now on, every git push will deploy within 2 minutes."
echo "Check status any time with: pm2 logs auto-pull"
