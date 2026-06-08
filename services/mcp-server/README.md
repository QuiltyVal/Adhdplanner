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

Until the live MCP server is migrated to a CI/deploy flow, deployment is manual:

1. Copy `services/mcp-server/src/index.js` to the live server.
2. Run `node --check` on the candidate file on the server.
3. Back up the current live `index.js`.
4. Replace `index.js`.
5. Restart PM2 process `adhd-mcp`.
6. Verify `/healthz`, `/mcp` auth boundary, and any changed routes.

Record every live-only change in `AGENT_LOG.md` and `SESSION_HANDOFF.md`.
