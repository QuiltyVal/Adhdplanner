# MCP OAuth Password Reset

The live MCP server is a separate Hetzner process at `/root/adhd-mcp`.

Use the normal web page when the current MCP OAuth login password is known. Use the reset helper only when the password is unknown or needs emergency admin rotation. Both paths update only `passwordSalt` and `passwordHash` in `auth-secrets.json`; they preserve `allowedEmail`, session token secret, access token secret, and refresh token secret.

## Normal Password Change

Open:

```text
https://mcp.valquilty.com/change-password
```

The page redirects to MCP login if there is no active MCP session. After login, it asks for:

- current password
- new password
- new password confirmation

The new password must be at least 12 characters. The page writes a chmod `600` backup of `auth-secrets.json`, changes only the password hash/salt, and does not require SSH or a PM2 restart.

Existing MCP OAuth tokens are not revoked by a normal password change.

## Safety Model

- There is no recoverable plaintext password in `auth-secrets.json`.
- Normal known-password changes do not require shell access.
- Emergency reset when the current password is unknown requires shell access to the server.
- The helper creates a chmod `600` backup next to `auth-secrets.json` before writing.
- The live `adhd-mcp` process must restart after the password hash changes because it reads secrets at startup.
- Do not pass the password as a command-line argument. Use `--generate` or `--password-stdin`.

## Install / Update Helper On Hetzner

From the repo root:

```bash
scp scripts/set-mcp-oauth-password.mjs root@mcp.valquilty.com:/root/adhd-mcp/set-mcp-oauth-password.mjs
ssh root@mcp.valquilty.com 'chmod 700 /root/adhd-mcp/set-mcp-oauth-password.mjs'
```

## Generate A New Password

This writes the generated password to a root-only file on the server and restarts MCP:

```bash
ssh root@mcp.valquilty.com 'cd /root/adhd-mcp && node set-mcp-oauth-password.mjs --generate --password-output-file /root/adhd-mcp/.mcp-oauth-password-latest --pm2-restart adhd-mcp'
```

To copy that one-time password to this machine:

```bash
scp root@mcp.valquilty.com:/root/adhd-mcp/.mcp-oauth-password-latest /Users/valquilty/.codex/adhd-mcp-oauth-password.txt
chmod 600 /Users/valquilty/.codex/adhd-mcp-oauth-password.txt
```

Delete the server-side password file after copying it:

```bash
ssh root@mcp.valquilty.com 'rm -f /root/adhd-mcp/.mcp-oauth-password-latest'
```

## Set A Chosen Password

Avoid putting the password in shell history:

```bash
read -s NEW_MCP_PASSWORD
printf '%s' "$NEW_MCP_PASSWORD" | ssh root@mcp.valquilty.com 'cd /root/adhd-mcp && node set-mcp-oauth-password.mjs --password-stdin --pm2-restart adhd-mcp'
unset NEW_MCP_PASSWORD
```

## Verify

```bash
codex mcp list
npm run check:mcp-readiness
```

`check:mcp-readiness` is read-only. It does not call tools, send bearer tokens, or mutate planner data.
