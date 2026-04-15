# ADHD Planner

Personal ADHD planner with:
- React web app
- Firebase Auth + Firestore
- Vercel API routes
- Telegram bot
- MCP integration

## Source Of Truth

- Code, docs, and scripts: GitHub repo
- Live planner data: Firestore
- Production web app: `https://planner.valquilty.com`

Git syncs the codebase between home and office.
Git does not sync live user tasks from Firestore or Vercel secrets.

## New Machine Setup

1. Clone the repo:
   - `git clone git@github.com:QuiltyVal/Adhdplanner.git`
2. Enter the repo:
   - `cd Adhdplanner`
3. Use the recommended Node version:
   - `nvm use || nvm install`
4. Bootstrap the machine:
   - `bash scripts/bootstrap-machine.sh`
5. Start local development:
   - `npm start`

Full setup notes: [MACHINE_SETUP.md](MACHINE_SETUP.md)

## Daily Home/Office Workflow

Before each session:
- `bash scripts/sync-local.sh`

Before each push:
- `npm run verify`
- `npm run verify:server` if you changed `api/`

For one person switching between home and office, `main` is the default branch.
If multiple agents or machines are making parallel changes at the same time, use a short-lived branch instead of writing to `main` concurrently.

Full workflow: [WORKFLOW.md](WORKFLOW.md)

## Execution Plan

Active product execution now lives in [EXECUTION_PLAN.md](EXECUTION_PLAN.md).

Foundational storage and mutation boundaries for the angel layer live in [ANGEL_ARCHITECTURE.md](ANGEL_ARCHITECTURE.md).

Use it when work touches:
- angel / executive-function companion features
- capture and memory architecture
- commitments / boss score / angel pin logic
- cross-agent product execution tracking

## Agent Handoff

If you or an AI coding agent continue work in a new session, start with:

- [AGENTS.md](AGENTS.md)
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md)
- [ROADMAP.md](ROADMAP.md)
- [EXECUTION_PLAN.md](EXECUTION_PLAN.md)
- [ANGEL_ARCHITECTURE.md](ANGEL_ARCHITECTURE.md)
- [AGENT_LOG.md](AGENT_LOG.md)
