/**
 * auto-pull.js — runs as a PM2 process on Hetzner.
 * Polls git every 2 minutes and auto-deploys when new commits appear on main.
 *
 * One-time setup (run once in Hetzner console):
 *   cd /root/adhdplanner
 *   bash scripts/setup-autodeploy.sh
 */

"use strict";

const { execSync } = require("child_process");
const path = require("path");

const CWD = path.join(__dirname, "..");
const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const BRANCH = "main";

function run(cmd) {
  return execSync(cmd, { cwd: CWD, stdio: "pipe" }).toString().trim();
}

function timestamp() {
  return new Date().toISOString();
}

function check() {
  try {
    run(`git fetch origin ${BRANCH}`);

    const local = run("git rev-parse HEAD");
    const remote = run(`git rev-parse origin/${BRANCH}`);

    if (local === remote) {
      console.log(`[${timestamp()}] [auto-pull] up-to-date (${local.slice(0, 7)})`);
      return;
    }

    console.log(`[${timestamp()}] [auto-pull] new commit detected: ${local.slice(0, 7)} → ${remote.slice(0, 7)}`);
    run(`git pull origin ${BRANCH}`);
    console.log(`[${timestamp()}] [auto-pull] pulled ok`);

    run("pm2 restart all");
    console.log(`[${timestamp()}] [auto-pull] pm2 restarted`);
  } catch (err) {
    console.error(`[${timestamp()}] [auto-pull] error: ${err.message}`);
  }
}

check();
setInterval(check, INTERVAL_MS);
