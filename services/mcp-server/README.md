# ADHD Planner MCP Server

This is the versioned source mirror for the live Hetzner MCP server at `https://mcp.valquilty.com/mcp`.

The live server currently runs as a standalone PM2 process in `/root/adhd-mcp`. Keep this directory as the source of truth for future MCP server code changes, then deploy intentionally to Hetzner.

## What Belongs In Git

- `src/index.js` — MCP HTTP/OAuth server source.
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

## Live Deploy Boundary

Until the live MCP server is migrated to a CI/deploy flow, deployment is controlled by a dry-run-first repo script:

```bash
npm run deploy:mcp-server
npm run deploy:mcp-server -- --apply
```

Dry-run prints the exact plan without SSH/scp side effects. Apply mode:

1. checks `services/mcp-server/src/index.js` locally;
2. copies only that source file to a candidate path on the live server;
3. checks the candidate with `node --check` on the server;
4. backs up the current live `index.js`;
5. replaces `index.js`;
6. restarts PM2 process `adhd-mcp`;
7. verifies `/healthz` and the `/mcp` Bearer auth boundary.

The deploy helper does not copy secrets, service-account JSON, OAuth clients, logs, backup files, or live Firestore data.

Record every live-only change in `AGENT_LOG.md` and `SESSION_HANDOFF.md`.
