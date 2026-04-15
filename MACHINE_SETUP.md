# Machine Setup

This repo is meant to work from multiple Macs and from multiple AI-agent sessions.

## What Git Syncs

GitHub syncs:
- source code
- docs
- scripts
- build output that is intentionally committed in this repo

GitHub does not sync:
- live planner tasks in Firestore
- Vercel env vars
- local `.vercel` link state
- SSH keys
- local `.env` files

## Recommended Baseline

- Git installed
- Node `24` via `nvm`
- npm available

The recommended Node version is pinned in [`.nvmrc`](.nvmrc).

## First Clone On A New Machine

```bash
git clone git@github.com:QuiltyVal/Adhdplanner.git
cd Adhdplanner
nvm use || nvm install
bash scripts/bootstrap-machine.sh
```

Then start local work with:

```bash
npm start
```

## Daily Sync Between Home And Office

Before starting work on a clean machine:

```bash
bash scripts/sync-local.sh
```

That helper:
- fetches `origin/main`
- fast-forwards local `main`
- runs `npm install`

It intentionally refuses to run if tracked local changes exist.

## Access Levels

### Code-only machine

Needed:
- GitHub access
- Node/npm

Enough for:
- local web development
- commits
- pushes
- reading handoff docs

### Deploy machine

Needed in addition:
- correct Vercel login/team/project access

Enough for:
- checking deployments
- redeploys
- env inspection

### Server-debug machine

Needed in addition:
- Firebase admin credentials or server access

Enough for:
- debugging server-side writers
- direct Firestore inspection
- infrastructure maintenance

## Local Verification

Before pushing from any machine:

```bash
npm run verify
```

If you changed `api/` code too:

```bash
npm run verify:server
```

## Important Portability Rule

Keep repo docs portable:
- use repo-relative links
- do not bake in `/Users/<name>/...` paths unless they are historical notes in logs
