# ADHD Planner MCP Server

This is the versioned source mirror for the live Hetzner MCP server at `https://mcp.valquilty.com/mcp`.

The live server currently runs as a standalone PM2 process in `/root/adhd-mcp`. Keep this directory as the source of truth for future MCP server code changes, then deploy intentionally to Hetzner.

## What Belongs In Git

- `src/index.js` — MCP HTTP/OAuth server source.
- `src/capture-client.js` — isolated Planner captures API client used by `capture_note`.
- `package.json` — service dependencies and scripts.
- `ecosystem.config.cjs.example` — PM2 configuration template without secrets.
- `env.example` — required environment variable names without values.

## What Must Not Be Committed

- `auth-secrets.json`
- `oauth-clients.json`
- Firebase service account JSON
- `.env` files
- logs
- backup files
- generated one-time password files

## Local Checks

```bash
npm run check
```

This only checks JavaScript syntax. Running the server locally requires valid Firebase and MCP OAuth secrets.

## Planner Capture Tool

The MCP server exposes `capture_note` for raw notes / brain dumps. It calls the existing Planner API path at `PLANNER_CAPTURE_API_URL`, defaulting to `https://planner.valquilty.com/api/captures`, with `source=mcp:*`.

Safety defaults:

- `dry_run` defaults to `true`.
- dry-runs do not write Firestore.
- `include_live_tasks` defaults to `false`.
- `active_tasks` can supply explicit task context without forcing a live task read.
- `dry_run=false` requires `idempotency_key` so repeated client calls do not accidentally create duplicate captures.

## Live Deploy Boundary

Until the live MCP server is migrated to a CI/deploy flow, deployment is controlled by a dry-run-first repo script:

```bash
npm run deploy:mcp-server
npm run deploy:mcp-server -- --apply
```

Dry-run prints the exact plan without SSH/scp side effects. Apply mode:

1. checks `services/mcp-server/src/index.js` and `services/mcp-server/src/capture-client.js` locally;
2. copies only those source files to candidate paths on the live server;
3. checks each candidate with `node --check` on the server;
4. backs up existing live source files before replacement;
5. replaces the source files;
6. restarts PM2 process `adhd-mcp`;
7. verifies `/healthz` and the `/mcp` Bearer auth boundary with short retries for PM2/nginx warmup.

The deploy helper does not copy secrets, service-account JSON, OAuth clients, logs, backup files, or live Firestore data.

Record every live-only change in `AGENT_LOG.md` and `SESSION_HANDOFF.md`.
