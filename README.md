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

## Firestore Backup Export

Read-only local export notes live in [docs/firestore-backup-export.md](docs/firestore-backup-export.md).

Quick help:
- `npm run backup:planner -- --help`
- `npm run backup:planner -- --userId <uid> --dry-run`
- `npm run backup:planner -- --userId <uid> --preflight`

## MCP Endpoint Probe

Read-only MCP auth-boundary probe:

- `npm run check:mcp`
- `npm run check:codex-mcp`
- `npm run check:mcp-readiness`
- `npm run setup:codex-mcp`

`check:mcp` verifies that `https://mcp.valquilty.com/mcp` is reachable, protected by Bearer auth, and publishes OAuth protected-resource metadata. `check:codex-mcp` verifies that the Codex Desktop config has that server URL registered. Neither command calls MCP tools or mutates planner data.

`check:mcp-readiness` combines both checks and reports whether Codex is ready to expose Planner MCP tools after restart/reload.

`setup:codex-mcp` is dry-run by default; `npm run setup:codex-mcp -- --apply` appends the Planner MCP URL entry to Codex config without tokens or headers.

Codex setup notes: [docs/codex-mcp-setup.md](docs/codex-mcp-setup.md)

## Live QA Checklists

- Telegram live smoke: [docs/telegram-live-smoke-checklist.md](docs/telegram-live-smoke-checklist.md)
- MCP live smoke: [docs/mcp-live-smoke-checklist.md](docs/mcp-live-smoke-checklist.md)
- Angel/live planner verification: [docs/live-angel-verification-checklist.md](docs/live-angel-verification-checklist.md)

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
