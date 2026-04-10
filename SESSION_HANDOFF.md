# SESSION_HANDOFF.md

Last updated: 2026-04-10

This file exists so the project can survive context loss and switching between Codex, Claude, or another coding agent.

Companion file:
- `AGENT_LOG.md` = append-only short session log

## Current reality

- The project is actively used by a real user, not just as a prototype.
- Stability matters more than adding flashy features.
- Data loss already happened once because stale local web state overwrote newer Firestore data.
- Firestore still contains two task representations:
  - legacy array field `Users/<uid>.tasks` kept only as rollback safety
  - canonical subcollection `Users/<uid>/tasks`
- On 2026-04-10 the canonical 12-task set was imported into `Users/<uid>/tasks` after a bad migration started from a stale 11-task office state.
- The legacy array was intentionally left untouched and still holds that older 11-task state. Do not treat it as current truth.

## Production endpoints

- Web app: `https://planner.valquilty.com`
- MCP server: `https://mcp.valquilty.com/mcp`

## What was fixed recently

- Firestore sync race in web app
- ghost tasks surviving local cache after cloud deletion
- stale cloud cache older than 30 minutes is now ignored on startup
- Firestore `taskSnapshots` backup layer
- canonical human task set restored into `Users/<uid>/tasks`
- subcollection storage landed in code on `origin/main`
- Telegram duplicate task prevention
- Telegram reopen completed flow
- Telegram contextual actions:
  - reopen last completed
  - complete from free text
  - delete subtask from free text
- server-side Google Calendar flow for Telegram
- today mission rules clarified and aligned across web + Telegram
- Telegram logs written to Firestore `telegramLogs`

## Very recent commits

- `b665569` Clarify today mission rules
- `406f2b4` Improve Telegram task context and logging
- `00e97a4` Fix deadline and Telegram task actions
- `6d40dcf` Add Firestore planner snapshots
- `a629985` Fix ghost tasks after cloud deletions

## Current today mission model

Selection order:

1. overdue or due-today tasks
2. manually pinned `isToday` tasks
3. `isVital` tasks
4. fallback auto-priority

Important:
- `isToday` is now a shortlist, not a vague soft hint
- web UI limits `isToday` to max 3 tasks

## What still feels risky

1. Telegram NLP still needs real-world testing.
   - The bot now has more context, but natural language can still misfire.

2. Cron nudges are still on Vercel.
   - Timing is not trustworthy to the exact minute.
   - If exact `09:00` matters, move nudges to Hetzner.

3. Heat model is still product-incomplete.
   - `deadlineAt` affects mission priority and nudges
   - it does not directly change `heatCurrent`
   - `isVital` also does not directly change heat decay

4. Manual task movement between heat zones does not exist yet.

5. Cloud cache still exists as a fast-start fallback.
   - It is now capped to 30 minutes max age.
   - If the UI ever shows obviously old tasks again, verify Firestore before trusting local cache.

6. Deployment state may be mixed across environments.
   - `origin/main` contains the subcollection migration.
   - Vercel should follow git deploys, but Hetzner may still lag until explicitly updated.
   - Treat `Users/<uid>/tasks` as the canonical live task set.
   - Do not trust `Users/<uid>.tasks` as current truth.

## Live-server note

The Hetzner MCP server is a standalone manual deployment at `/root/adhd-mcp`, not a git checkout.

It was patched live to add safer mutation behavior:

- `add_subtask` updates `lastUpdated`
- MCP state mutations now also create Firestore `taskSnapshots`
- as of 2026-04-10 11:15 Europe/Berlin, the live MCP server reads/writes `Users/<uid>/tasks` subcollection instead of the legacy root `tasks` array
- server backup file exists at `/root/adhd-mcp/index.array-storage-backup-2026-04-10.js`

This was applied directly on the server and restarted via PM2.
Do not assume every live Hetzner change is already represented elsewhere unless you verify it.

## How to debug Telegram now

Look in Firestore under the user document:

- `telegramLogs`
- `taskSnapshots`

Useful log kinds:

- `message_in`
- `intent`
- `action`
- `callback_in`
- `callback_out`
- `error`

If the bot does something stupid, inspect logs before changing prompts.

## Handoff discipline

- `SESSION_HANDOFF.md` should describe the current stable state
- `AGENT_LOG.md` should record each meaningful session
- if you changed live Hetzner/Vercel behavior outside git, write it down in both places

## Safe verification checklist

When starting a new session, verify this sequence:

1. Add a task in web
2. Add a task in Telegram
3. Add a subtask in Telegram
4. Complete task from Telegram text
5. Reopen task from Telegram text
6. Delete subtask from Telegram text
7. Verify web reflects all of it without reload weirdness

## Current data architecture (as of 2026-04-10)

Canonical storage is the subcollection. Structure:
```
Users/{userId}/tasks/{taskId}   ← each task is its own document ✅
Users/{userId}                  ← root doc: score, telegramContext, telegramChatId only
Users/{userId}/taskSnapshots/   ← backup trail (unchanged)
Users/{userId}/telegramLogs/    ← telegram debug logs (unchanged)
```

`Users/{userId}.tasks` still exists as a legacy rollback artifact and currently contains an older 11-task snapshot. Keep it until the new subcollection flow is verified everywhere, then remove it deliberately.

`origin/main` contains the subcollection migration for web + server.
If Hetzner is still on older code, it needs:
```bash
git pull origin main
pm2 restart all
```

## Best next steps

**#1 — Verify every live writer is using the subcollection**
- web app on Vercel
- Telegram on Hetzner
- MCP on Hetzner

MCP on Hetzner is already patched live. The remaining question is whether Telegram is actually served from the same Hetzner process or from Vercel routes.

Other steps:
1. Move Telegram nudges from Vercel Cron to Hetzner (timing unreliable on Vercel)
2. **Drag & drop между зонами** (см. ниже)
3. Add restore-from-snapshot UI
4. Stats: показать timeSpent суммарно / за неделю

## Drag & drop — план для следующего агента

Пользователь хочет:
- Перетаскивать задачи мышью/пальцем между зонами (🔥 → 🧊 → 🥶)
- Бросать задачу на иконку чёртика → отправляется на кладбище (как handleKill)
- Бросать задачу на иконку ангела → отправляется в рай (как handleComplete)
- Обратно: из рая/кладбища перетащить обратно в активные

Реализация:
- Установить `@dnd-kit/core` + `@dnd-kit/sortable` (легче чем react-beautiful-dnd)
- Зоны становятся drop targets
- Компоненты ангела/чёртика в Companions.js становятся drop targets
- При drop на зону: менять heatBase задачи (hot=80, passive=40, purgatory=10) и вызывать persistTask
- При drop на чёртика: вызывать handleKill
- При drop на ангела: вызывать handleComplete (с подтверждением)
- timeSpent уже хранится в задаче — трекинг готов

## Things agents should not do casually

- do not reintroduce client-side secret usage
- do not “optimize” away backup snapshots
- do not change mission-selection logic in web without mirroring it in server code
- do not overwrite Firestore with stale bulk task arrays
