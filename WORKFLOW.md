# Workflow

## Source Of Truth

- GitHub: code, docs, scripts, committed build output
- Firestore: live planner data
- Vercel: deploy state and server-side env vars

If something is missing locally, pull it from GitHub.
If something is missing in the planner itself, that is Firestore data, not git data.

## Solo Home/Office Workflow

Use this when one person moves between machines.

1. Start from `main`
2. Run:
   - `bash scripts/sync-local.sh`
3. Work locally:
   - `npm start`
4. Verify before push:
   - `npm run verify`
   - `npm run verify:server` if `api/` changed
5. Commit and push:
   - `git add ...`
   - `git commit -m "your message"`
   - `git push origin main`

Rule:
- do not start editing on office if home changes are not pushed yet
- do not start editing on home if office changes are not pulled yet

## Parallel Agent Workflow

Use this when multiple agents or machines may work at the same time.

Rules:
- one agent = one branch
- keep branch scope narrow
- do not let two agents edit the same files on different machines without a merge plan
- merge to `main` only after verification

Suggested branch names:
- `agent/<topic>`
- `user/<topic>`
- `fix/<topic>`

After merge to `main`, every machine should sync again from `main`.

## Required Agent Handoff

Before a meaningful session:
- read [AGENTS.md](AGENTS.md)
- read [SESSION_HANDOFF.md](SESSION_HANDOFF.md)
- read [ROADMAP.md](ROADMAP.md)
- read the newest part of [AGENT_LOG.md](AGENT_LOG.md)

After a meaningful session:
- append a factual note to [AGENT_LOG.md](AGENT_LOG.md)
- update [SESSION_HANDOFF.md](SESSION_HANDOFF.md) if project reality changed

## Do Not Commit

- `.env`
- `.vercel`
- SSH keys
- machine-local editor or OS noise
- secrets copied out of Vercel/Firebase

## Portable Defaults

- Node version comes from [`.nvmrc`](.nvmrc)
- bootstrap a fresh machine with `bash scripts/bootstrap-machine.sh`
- sync a working machine with `bash scripts/sync-local.sh`
