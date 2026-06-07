# Codex MCP Setup

Use this when the live MCP endpoint is healthy, but Codex Desktop does not expose ADHD Planner tools in chat.

## Check Endpoint Health

From this repo:

```bash
npm run check:mcp
```

Expected:

- `ok: true`
- `status: 401`
- `authScheme: "Bearer"`
- `scopeOk: true`
- `resourceMetadata.resourceName: "ADHD Planner MCP"`

This only proves the public auth boundary. It does not authenticate or call planner tools.

## Check Codex Config

From this repo:

```bash
npm run check:codex-mcp
```

Expected after setup:

- `ok: true`
- one matching server with `url: "https://mcp.valquilty.com/mcp"`

If it returns `ok: false`, Codex does not currently have the Planner MCP server in `~/.codex/config.toml`.

## Combined Readiness Check

From this repo:

```bash
npm run check:mcp-readiness
```

This combines endpoint health plus Codex config registration into one report.

Expected when Codex is ready to expose Planner MCP tools after restart/reload:

- `ok: true`
- `endpoint.ok: true`
- `codexConfig.ok: true`
- `readyForCodexToolUse: true`

If the endpoint is healthy but Codex config is missing, the report will show `missing: ["codex_config"]`.

## Add Planner MCP To Codex

Add this server entry to `~/.codex/config.toml`:

```toml
[mcp_servers.adhd_planner]
url = "https://mcp.valquilty.com/mcp"
```

Do not paste bearer tokens into chat or repo files.

After editing config:

1. Restart or reload Codex Desktop.
2. Start a fresh Planner thread if tools do not appear in the current one.
3. Ask Codex to search tools for `ADHD Planner MCP`.
4. If OAuth/login is requested, complete it in the app/browser flow.
5. Run the real-client smoke in [mcp-live-smoke-checklist.md](mcp-live-smoke-checklist.md).

## Boundary

`npm run check:codex-mcp` only reads MCP server names and URLs from Codex config. It does not print headers, tokens, or secrets.
