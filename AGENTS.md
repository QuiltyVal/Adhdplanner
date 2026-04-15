# AGENTS.md

Read this file first if you are an AI coding agent working on this repository.

## Product in one sentence

ADHD Planner is not a generic todo app. It is a personal executive-memory and orchestration system for a user with ADHD: it keeps goals alive, nags through Telegram/email/web, and acts as a docking station for AI agents.

## Source of truth

- Main repo: this repository
- Production web app: `https://planner.valquilty.com`
- Firestore is the data source of truth
- Telegram bot runs through Vercel API routes in `api/`
- MCP server runs on Hetzner and is used by Claude and other MCP-capable clients

## Multi-machine rule

This repo must stay portable between home and office machines.

- Do not hardcode local filesystem paths in living docs unless they are explicitly historical notes inside logs.
- Prefer repo-relative links like `README.md`, `src/App.js`, `api/telegram-webhook.js`.
- GitHub is the source of truth for code and docs.
- Firestore is the source of truth for live planner data.
- `.vercel`, `.env`, local SSH keys, and other machine-local state must stay out of git.
- New machines should work from:
  - `.nvmrc`
  - `bash scripts/bootstrap-machine.sh`
  - `bash scripts/sync-local.sh`

## Core architecture

- Web app: React + CRA
- Serverless API: Vercel functions in `api/`
- Data: Firebase Auth + Firestore
- Telegram bot: `api/telegram-webhook.js`
- Telegram nudges: `api/telegram-nudge.js`
- Agent chat: `api/agent-chat.js`
- Google Calendar server-side OAuth for Telegram: `api/google-calendar-*.js`
- Planner server logic shared by API routes: `api/_lib/planner-store.js`
- Web Firestore sync logic: `src/firestoreUtils.js`

## Non-negotiable rules

1. Do not put secrets in client-side env vars.
   - Never use `REACT_APP_*` for LLM/API secrets.
   - Server-side secrets belong in Vercel env vars without client prefixes.

2. Firestore writes must be conservative.
   - Do not overwrite tasks blindly from stale local state.
   - Prefer functional updates and merge-safe logic.

3. Telegram free text must not silently create nonsense tasks.
   - Contextual commands like "верни ее" or "отправь в рай" should resolve against known context before falling back to task capture.

4. If you change planner state mutation logic, preserve snapshots/history.
   - Web and Vercel server paths already write `taskSnapshots` before mutations.

5. Keep web and Telegram selection logic aligned.
   - Today mission logic exists in both web and server code.

## Files that matter most

- `src/App.js`
- `src/TaskColumn.js`
- `src/firestoreUtils.js`
- `api/telegram-webhook.js`
- `api/telegram-nudge.js`
- `api/_lib/planner-store.js`
- `api/_lib/telegram-intent.js`
- `ROADMAP.md`
- `EXECUTION_PLAN.md`
- `ANGEL_ARCHITECTURE.md`
- `SESSION_HANDOFF.md`
- `AGENT_LOG.md`
- `WORKFLOW.md`
- `MACHINE_SETUP.md`

## Commands

- Dev: `npm start`
- Production build: `DISABLE_ESLINT_PLUGIN=true npm run build`
- Portable machine bootstrap: `bash scripts/bootstrap-machine.sh`
- Portable machine sync: `bash scripts/sync-local.sh`
- Verify build: `npm run verify`
- Verify server syntax after API changes: `npm run verify:server`

Why the build command disables eslint:
- this repo can hit `EPERM` on `.eslintcache` inside `node_modules/.cache`
- `DISABLE_ESLINT_PLUGIN=true` avoids false build failures during handoff work

## Current product semantics

### Today mission

The current rule order is:

1. active tasks with overdue or today deadlines
2. active tasks manually pinned with `isToday`
3. active tasks marked `isVital`
4. fallback automatic priority across all active tasks

This logic exists in:
- web: `src/App.js`
- server/Telegram: `api/_lib/planner-store.js`

### Meaning of task flags

- `isToday`: manual shortlist for today, limited to 3 tasks in web UI
- `isVital`: critical life priority
- `deadlineAt`: external time pressure
- `urgency`: affects cooling speed
- `resistance`: affects priority, not heat decay directly

### Heat

Right now:
- `heatCurrent` cools based on `urgency`
- `deadlineAt` affects priority and nudges, not heat decay directly
- `isVital` affects priority, not heat decay directly

Do not assume deadline already changes heat. It does not.

## Telegram behavior notes

- The bot supports commands and free text.
- Context-sensitive actions depend on `telegramContext` stored in the user document.
- Logs are written to Firestore subcollection `telegramLogs`.
- If Telegram behaves strangely, inspect logs before changing prompts.

## Known platform caveats

- Vercel Cron is not reliable to the exact minute on this setup. Do not assume `09:00` means exactly `09:00`.
- Google Calendar browser-side connect still exists in web UI, but Telegram scheduling uses server-side OAuth.
- The MCP server on Hetzner may contain small live patches not yet mirrored automatically elsewhere. Check `SESSION_HANDOFF.md`.

## Before making risky changes

1. Read `SESSION_HANDOFF.md`
2. Read `ROADMAP.md`
3. Read `EXECUTION_PLAN.md` if the work touches roadmap/product execution
4. Read `ANGEL_ARCHITECTURE.md` if the work touches captures / commitments / angel logic
5. Read the newest entries in `AGENT_LOG.md`
6. If on a new machine, read `MACHINE_SETUP.md` and `WORKFLOW.md`
7. Check recent commits
8. Avoid touching unrelated features
9. Keep changes small and verifiable

## After making changes

1. Run `DISABLE_ESLINT_PLUGIN=true npm run build`
2. If Telegram/webhook logic changed, also run:
   - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); require('./api/telegram-nudge'); console.log('server ok')"`
3. Update `EXECUTION_PLAN.md` if you completed or meaningfully re-scoped plan items
4. Append a short factual entry to `AGENT_LOG.md`
5. Update `SESSION_HANDOFF.md` if the project state meaningfully changed

## Logging is mandatory

Every coding agent must leave a trail for the next one.

Minimum end-of-session requirement:
- update `EXECUTION_PLAN.md` when you finished a relevant plan item
- append one entry to `AGENT_LOG.md`
- include what changed, what was verified, and what still looks risky
- if live infrastructure was changed outside git, say that explicitly

Do not finish a meaningful work session without updating the log.
