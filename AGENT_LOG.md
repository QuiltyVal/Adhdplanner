# AGENT_LOG.md

Append-only log for coding-agent handoff.

Purpose:
- give the next agent a compact trail of what happened
- reduce context loss across Codex, Claude, and other agents
- record what was changed, verified, and left risky

Rules:
- add a new entry after every meaningful work session
- newest entry goes at the top
- keep entries short and factual
- do not paste secrets, tokens, or full logs
- if architecture or runtime behavior changed, also update `SESSION_HANDOFF.md`

Entry template:

```md
## YYYY-MM-DD HH:MM Europe/Berlin - Agent name

- Summary: one or two sentences
- Changed:
  - file or system
  - file or system
- Verified:
  - build/test/manual check
- Risks / follow-up:
  - open issue
```

## 2026-04-11 12:15 Europe/Berlin - Codex

- Summary: Extracted Telegram text routing into a dedicated `planner-agent-router` module so incoming bot messages now go through one shared decision point before hitting execution handlers.
- Changed:
  - `api/_lib/planner-agent-router.js`: new shared router for Telegram text input; centralizes explicit rule overrides plus AI-intent fallback into one action contract
  - `api/telegram-webhook.js`: `handlePlainCapture` now uses `routePlannerAgentInput(...)` instead of locally chaining regex + `parseTelegramIntent`
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/_lib/planner-agent-router'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - execution still lives in Telegram-specific handlers; next architectural step is a shared planner action executor so other channels can reuse the same mutation layer
  - webhook still contains some now-duplicate parsing helpers that can be removed after a short stabilization period

## 2026-04-11 12:35 Europe/Berlin - Codex

- Summary: Taught Telegram to treat follow-ups like `давай последнюю` and `нет, последняя была ...` as a selection from the last unpin suggestion list instead of a generic context task.
- Changed:
  - `api/_lib/planner-store.js`: `telegramContext` now preserves `suggestedTaskId` and `candidateTaskIds`
  - `api/_lib/planner-agent-router.js`: added selection-context routing for follow-ups after `today_limit` / `suggest_unpin_today`
  - `api/telegram-webhook.js`: added `resolveSuggestedTodayTaskReference()` and now uses the stored candidate list when unpinning from a suggested shortlist
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/_lib/planner-agent-router'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - selection memory is currently tailored to the today-unpin flow; if similar list-based choices appear elsewhere, move this into a generalized `selection_context` layer

## 2026-04-11 13:00 Europe/Berlin - Codex

- Summary: Introduced a real `planner-action-executor` layer and switched Telegram plain-text handling to `route -> execute`, so webhook text flow no longer performs action branching inline.
- Changed:
  - `api/_lib/planner-action-executor.js`: new shared executor for planner actions (`add_task`, `add_subtask`, `complete_task`, `reopen_task`, `set_today`, `unset_today`, `set_vital`, `suggest_unpin`, `show_today`, `panic`, `schedule_task`, `chat`)
  - `api/telegram-webhook.js`: `handlePlainCapture` now delegates to `executePlannerAction(...)` after routing instead of executing many Telegram-specific branches directly
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/_lib/planner-agent-router'); require('./api/_lib/planner-action-executor'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - callback buttons and slash commands still use local webhook handlers; next step is to migrate them onto the same executor contract
  - old helper functions still remain in `api/telegram-webhook.js`; remove them only after a short stabilization window

## 2026-04-11 11:55 Europe/Berlin - Codex

- Summary: Added a dedicated Telegram `unset_today` path so follow-ups like `открепи последнюю` no longer reopen the wrong task, and added fuzzy task matching for small typos in task names.
- Changed:
  - `api/telegram-webhook.js`: added `handleUnsetTodayRequest`, today-task resolver, typo-tolerant `findTaskByText`, and better `today_limit` / `suggest_unpin_today` context handling
  - `api/_lib/telegram-intent.js`: added `unset_today` intent so AI routing can explicitly remove tasks from today's shortlist
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - fuzzy matching is intentionally conservative but can still choose the wrong task if several pinned tasks have nearly identical names
  - if user wants ranked alternatives beyond unpinning, that should be a separate `replace_today_task` flow rather than more regex

## 2026-04-10 22:45 Europe/Berlin - Codex

- Summary: Expanded Telegram subtask parsing to handle real user phrasing like `добавь в ... подзадачу ...` and common typos like `добваь`.
- Changed:
  - `api/telegram-webhook.js`: `parseAddSubtaskRequest` now accepts `добавь в`, `добавь к`, `добавить подзадачу X в Y`, and two common typos
- Verified:
  - local string checks for:
    - `добавь в проверить лог подзадачу N2`
    - `добваь в проверить лог подзадачу N2`
    - `добавь к проверить лог подзадачу "N2"`
    - `добавить подзадачу N2 в проверить лог`
    - `добавь в задачу проверить лог подзадачу N2`
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); require('./api/telegram-nudge'); console.log('server ok')"`
- Risks / follow-up:
  - the parser is still explicit-rule based, not semantic; unusual wording can still fall through to generic intent parsing

## 2026-04-10 22:35 Europe/Berlin - Codex

- Summary: Made task auto-death less brutal for important tasks and taught Telegram to parse explicit “add subtask to task” phrasing without creating a new task.
- Changed:
  - `src/App.js`: extended urgency decay windows and blocked automatic cemetery moves for tasks with `isToday`, `isVital`, or any `deadlineAt`
  - `api/telegram-webhook.js`: added `parseAddSubtaskRequest` / `handleAddSubtaskRequest` and `add_subtask_from_text` action logging
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); require('./api/telegram-nudge'); console.log('server ok')"`
- Risks / follow-up:
  - protected tasks can now cool all the way to `0` heat while staying active; that is intentional for now, but nudging cadence may need tuning
  - Telegram phrasing coverage is still rule-based for subtask additions; more variants may appear in real use

## 2026-04-10 22:20 Europe/Berlin - Codex

- Summary: Added explicit Telegram `action` logs for successful task upserts so debug sessions can distinguish creation vs update without inferring from `intent` + `message_out`.
- Changed:
  - `api/telegram-webhook.js`: `upsertTask` now writes `upsert_task_created` / `upsert_task_updated` logs and reports an explicit error log if the mutation returns no outcome
- Verified:
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); require('./api/telegram-nudge'); console.log('server ok')"`
- Risks / follow-up:
  - this improves observability only; it does not change Telegram NLP behavior
  - next live test should confirm these new `action` logs appear in Firestore after a real Telegram add/update

## 2026-04-10 22:10 Europe/Berlin - Codex

- Summary: Verified end-to-end that the live Vercel Telegram webhook is active and writes explicit `add_task` requests into `Users/<uid>/tasks` subcollection. Removed the debug task afterwards.
- Changed:
  - live Firestore only: added then removed `DEBUG TG ROUTE 1775851666`
- Verified:
  - `POST https://planner.valquilty.com/api/telegram-webhook` with `добавь задачу DEBUG TG ROUTE 1775851666` returned `200 {"ok":true}`
  - task appeared in subcollection and did not appear in legacy root array
  - removed the debug task right after verification
- Risks / follow-up:
  - Telegram still does not log a distinct `action` record for successful `add_task`, which makes future debugging noisier than it should be
  - the earlier missing `ТГ тест` is consistent with later canonical re-import removing test data, not with Telegram being dead

## 2026-04-10 11:15 Europe/Berlin - Codex

- Summary: Patched the live Hetzner MCP server to stop reading/writing the legacy root `tasks` array and use `Users/<uid>/tasks` subcollection instead.
- Changed:
  - live server only: `/root/adhd-mcp/index.js`
  - created backup on server: `/root/adhd-mcp/index.array-storage-backup-2026-04-10.js`
  - restarted PM2 process `adhd-mcp`
- Verified:
  - `node --check /root/adhd-mcp/index.js`
  - `pm2 restart adhd-mcp`
  - confirmed patched helpers exist in live file: `userDocRef`, `tasksColRef`, batch writes to subcollection
- Risks / follow-up:
  - Hetzner app is not a git checkout; future deploys there are still manual unless that setup is changed
  - this fixes MCP storage on Hetzner; if Telegram bot still misbehaves, that is likely a separate planner/Vercel path to inspect

## 2026-04-10 09:40 Europe/Berlin - Codex

- Summary: Exported live Firestore, built a canonical task set locally, and imported that canonical set into `Users/<uid>/tasks` without touching the legacy array field.
- Changed:
  - live Firestore only
  - canonical export files under `/tmp/adhd-planner-export-2026-04-10/`
  - `Users/<uid>/tasks` now holds 12 canonical human tasks
- Verified:
  - pre-import backup: `/tmp/adhd-planner-export-2026-04-10/pre-import-backup.json`
  - post-import backup: `/tmp/adhd-planner-export-2026-04-10/post-import-backup.json`
  - verified counts after import: `subcollection = 12`, `legacy array = 11`
- Risks / follow-up:
  - the import repaired live data, but older legacy array data still exists as rollback safety
  - next agent should verify every writer is truly using the subcollection before trusting day-to-day edits again

## 2026-04-10 (late evening) — Claude (Sonnet 4.6, remote session, session 2)

- Summary: Added task text editing, time tracking per task, recorded drag-drop plan.
- Changed:
  - `src/App.js`: `handleEditTask` (edit main task text), `handleAddTime` (accumulate timeSpent)
  - `src/TaskColumn.js`: double-click on task title edits it inline; ▶/⏹ timer button per task, shows running elapsed + total timeSpent; `formatMs` helper
  - `src/TaskColumn.css`: `.timer-row`, `.timer-btn`, `.timer-running` pulse animation, `.timer-total`
  - `SESSION_HANDOFF.md`: added drag-drop plan for next agent
- Verified:
  - `npm run build` passes, pushed to main
- Risks / follow-up:
  - Hetzner still needs `git pull + pm2 restart` (Telegram still broken until then)
  - Timer resets on page reload (by design — only saved time is persisted)
  - Drag & drop plan written in SESSION_HANDOFF.md — needs `@dnd-kit` install

## 2026-04-10 (evening) — Claude (Sonnet 4.6, remote session)

- Summary: Completed subcollection migration for web + server. Added subtask inline editing. Deployed to Vercel via git push. Hetzner NOT yet updated (user needs to run git pull + pm2 restart manually).
- Changed:
  - `src/firestoreUtils.js`: full rewrite — new `subscribeToTasks`, `saveTask`, `saveScore`, `getUserScore`, `migrateTasksToSubcollection`; old functions kept as no-ops
  - `src/App.js`: loading switched to `subscribeToTasks`; auto-migration on first empty snapshot; all handlers now call `persistTask`/`persistScore` directly; removed bulk sync effect and all race guards; game tick only saves newly dead tasks
  - `api/_lib/planner-store.js`: `getPlannerData` now reads tasks from subcollection; `mutatePlanner` replaced Firestore transaction with WriteBatch writing to subcollection; root doc only stores score + metadata (no tasks array)
  - `src/TaskColumn.js` + `src/TaskColumn.css`: inline subtask editing (double-click to edit, Enter saves, Escape cancels)
  - Firestore Rules updated (user did this in Firebase Console): added `match /tasks/{taskId}` and `match /taskSnapshots/{snapshotId}` under Users/{userId}
- Verified:
  - `npm run build` passes
  - `node -e "require('./api/_lib/planner-store')..."` passes
  - Firestore subcollection appeared after first web app load (migration ran)
  - Web app reads/writes correctly from subcollection
- Risks / follow-up:
  - **⚠️ Hetzner server NOT updated** — Telegram bot still runs old planner-store.js from before this session. Must `git pull origin main && pm2 restart all` on Hetzner.
  - After Hetzner deploy: test Telegram → add task → verify appears in web instantly
  - MCP server on Hetzner also uses planner-store.js — same git pull will fix it too
  - Old `tasks: []` array still exists in root doc (not deleted) — safe to ignore, web app no longer reads it

## 2026-04-10 — Claude (Sonnet 4.6 / Opus 4.6, work session)

- Summary: UI/UX session + data loss investigation. Added AI agent chat, Google Calendar, font cleanup. Found and partially fixed task sync bugs. Wrote subcollection migration plan.
- Changed:
  - `src/AgentChat.js`: full agent chat panel with tool calling (get_tasks, add_task, add_subtask, delete_subtask, mark_critical, kill_task, create_calendar_event). Uses `/api/agent-chat` server route.
  - `src/AgentChat.css`: new chat panel styles, Inter font for messages
  - `src/Companions.js`: clicking angel/devil opens agent chat instead of speech bubble
  - `src/App.js`: Google Calendar connect button (📅), handleConnectCalendar, calendarToken state passed to Companions/TaskColumn. Removed auto-kill from game tick (then reverted — auto-kill is intentional architecture). Fixed: `skipNextCloudSyncRef` + `hasPendingWrites` guard to not overwrite local state from own pending writes.
  - `src/TaskColumn.js`: calendar picker on each task card (date/time/duration → Google Calendar event), delete subtask button (×)
  - `src/TaskColumn.css`: Inter font for task text/subtasks/inputs, cal-picker styles, subtask-delete-btn
  - `src/firestoreUtils.js`: `subscribeUserData` fixed — check `metadata.fromCache` before auto-creating empty document (was silently wiping all tasks on new device). `onData` now receives `(data, metadata)`.
  - `api/_lib/openrouter.js`: fallback to `REACT_APP_OPENROUTER_KEY` if `OPENROUTER_API_KEY` not set
  - `MIGRATION_TASKS_SUBCOLLECTION.md`: full migration plan (new file)
- Verified:
  - `npm run build` passes on all commits
  - `/api/agent-chat` route exists and correctly proxies to OpenRouter server-side
- Risks / follow-up:
  - **CRITICAL: tasks still stored as array in one Firestore document** — race condition on multi-device writes not fully solved. See `MIGRATION_TASKS_SUBCOLLECTION.md` for the real fix.
  - Google Calendar connect uses Firebase popup OAuth — works but shows "unverified app" warning (expected, user is aware)
  - `OPENROUTER_API_KEY` env var may need to be added to Vercel separately (or `REACT_APP_OPENROUTER_KEY` will be used as fallback)

## 2026-04-09 ~17:00 Europe/Berlin - Claude (Sonnet 4.6)

- Summary: Added "🌐 Открыть планнер" URL button to Telegram task keyboard. Stop heat-tick writes. Tasks restored twice after data loss.
- Changed:
  - `api/_lib/telegram.js`: added planner URL button to plannerTaskKeyboard
  - `src/App.js`: firestoreReadyRef + lastWrittenFingerprintRef — two-layer write guard
  - `src/firestoreUtils.js`: exported buildClientFingerprint
  - `api/snapshot-read.js`: new snapshot read/restore API (committed earlier)
  - Firestore (via MCP): restored "улучшить приложение" (9 subtasks) + "посмотреть фильм зулейхи" — twice, due to repeated data loss
- Verified:
  - All builds pass
  - `node server ok` check passes
  - Firestore confirmed 13 tasks after last restoration
- Risks / follow-up:
  - Data loss happened twice today before fixes were deployed — monitor tomorrow
  - The firestoreReadyRef + fingerprint fix is now in prod — should prevent stale writes
  - If tasks disappear again: use GET /api/snapshot-read?limit=10 with Bearer CRON_SECRET to find last good snapshot, then POST to restore

## 2026-04-09 ~16:00 Europe/Berlin - Claude (Sonnet 4.6)

- Summary: Fixed root cause of data loss — stale local cache overwrote Firestore. Added `firestoreReadyRef` guard in sync-effect.
- Changed:
  - `src/App.js`: added `firestoreReadyRef = useRef(false)`, set in Firestore listener callback, reset on user change, checked before `updateUserData()` in sync effect
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build` passes
- How the fix works:
  - `firestoreReadyRef.current` starts as `false`
  - Set to `true` only when Firestore listener fires (line ~663)
  - Reset to `false` on user logout/switch
  - Sync effect for non-guest users returns early if `firestoreReadyRef.current = false`
  - Result: Firestore writes are blocked until the app has confirmed fresh server data
- Risks / follow-up:
  - If Firestore listener never fires (network down), user changes won't sync to Firestore — this is correct behaviour (better than corrupting data)
  - Still worth monitoring real-world: does the listener always fire before the user makes a change?

## 2026-04-09 ~15:30 Europe/Berlin - Claude (Sonnet 4.6)

- Summary: Added snapshot-read API (GET list, GET by id, POST restore). Identified root cause of recurring data loss.
- Changed:
  - `api/snapshot-read.js` (new file)
- Verified:
  - `node -e "require('./api/snapshot-read'); console.log('ok')"` passes
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); require('./api/telegram-nudge'); console.log('server ok')"` passes
  - `DISABLE_ESLINT_PLUGIN=true npm run build` passes
- Root cause of data loss found (NOT yet fixed):
  - App.js loads stale cache from localStorage on startup
  - Before Firestore real-time listener delivers first update, game-tick effect modifies stale tasks
  - Sync effect writes them to Firestore via `updateUserData()`, overwriting newer data
  - Fix: block `updateUserData()` writes until Firestore listener has fired at least once (add `firestoreReadyRef`)
  - This fix is riskier to implement — needs separate session with careful reading of App.js sync logic
- Risks / follow-up:
  - Root cause fix still pending — data loss can recur if user opens app after >0min gap
  - snapshot-read.js is deployed to Vercel on next push — test with `GET /api/snapshot-read?limit=5` + Bearer token

## 2026-04-09 ~15:00 Europe/Berlin - Claude (Sonnet 4.6)

- Summary: Restored two tasks lost due to Firestore containing a stale/truncated state (11 tasks). No data was lost — tasks were identified in taskSnapshots by a previous agent session.
- Changed:
  - Firestore (via MCP): added "улучшить приложение" with 9 subtasks
  - Firestore (via MCP): added "посмотреть фильм зулейхи"
- Verified:
  - get_tasks confirmed 11 tasks before restore, both tasks absent
  - add_task confirmed successful creation of both tasks
  - No bot-garbage tasks restored (intentional: "Вернуть задачу в активную", "Отправить тестовую задачу в рай", "Тестовая задача")
- Risks / follow-up:
  - Previous agent mentioned "2 long subtasks about onboarding/dopamine" — user confirmed one (angel onboarding). Second long subtask may have been that same one described differently, or genuinely missing. User can add manually if needed.
  - Root cause of data loss not yet investigated. Firestore ended up with stale 11-task state — worth checking what wrote that state (MCP mutation? Telegram? Web stale cache?).
  - No restore-from-snapshot API exists — snapshots are write-only audit trail. Consider adding a read endpoint.

## 2026-04-09 22:35 Europe/Berlin - Codex

- Summary: Made cross-agent logging mandatory by adding a shared work log and wiring it into the repo handoff docs.
- Changed:
  - `AGENT_LOG.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `SESSION_HANDOFF.md`
  - `README.md`
- Verified:
  - reviewed updated docs and diff locally
- Risks / follow-up:
  - next coding session should actually append to this log after real code changes

## 2026-04-09 22:55 Europe/Berlin - Codex

- Summary: Hardened startup cache so stale local cloud snapshots stop pretending to be the real planner state after long gaps.
- Changed:
  - `src/App.js`
  - `SESSION_HANDOFF.md`
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); require('./api/telegram-nudge'); console.log('server ok')"`
- Risks / follow-up:
  - this prevents stale cache older than 30 minutes, but if Firestore itself already contains old tasks the UI will still correctly show those old tasks

## 2026-04-09 22:10 Europe/Berlin - Codex

- Summary: Added handoff docs so the project can switch between coding agents without restarting from zero.
- Changed:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `SESSION_HANDOFF.md`
  - `README.md`
- Verified:
  - files created and committed in `82f92e0`
- Risks / follow-up:
  - logging was not mandatory yet; add explicit logging contract next

## 2026-04-10 00:45 Europe/Berlin - Codex

- Summary: Fixed a repeated false-death bug where a protected task (`isToday` / `isVital` / `deadlineAt`) was being overwritten by an older stale `dead` version from the web. The key signal was `status = dead` with `deadAt = null` and an older `lastUpdated`, which cannot come from the current auto-death code.
- Changed:
  - `src/firestoreUtils.js`
  - `src/App.js`
  - `api/telegram-webhook.js`
- Verified:
  - queried live Firestore on Hetzner and confirmed the broken task regressed from a newer active version to an older dead version
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - this hardens refreshed clients and auto-heals invalid protected dead tasks, but a truly old already-open browser tab can still keep trying stale writes until the tab is refreshed or closed

## 2026-04-11 00:10 Europe/Berlin - Codex

- Summary: Fixed Telegram subtask routing for context references like “добавь к последней добавленной задаче подзадачу …”. The bot now resolves these phrases via `telegramContext.lastTaskId` instead of searching for a literal task named “последней добавленной задаче”.
- Changed:
  - `api/telegram-webhook.js`
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - this fixes relative references for add-subtask; broader natural-language task references still deserve a shared resolver instead of scattered regexes

## 2026-04-11 00:25 Europe/Berlin - Codex

- Summary: Started the real AI-aware Telegram routing. `telegram-intent` now supports `add_subtask` and can return `task_ref='last_task'`, with webhook passing `telegramContext` into the model and resolving relative task references server-side.
- Changed:
  - `api/_lib/telegram-intent.js`
  - `api/telegram-webhook.js`
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - local synthetic parse could not be executed end-to-end without `OPENROUTER_API_KEY`
  - next step is to extend the same `task_ref` mechanism to complete/reopen/today/vital actions, not just add-subtask

## 2026-04-11 11:05 Europe/Berlin - Codex

- Summary: Prepared the Hetzner-side Telegram nudge move. Added a standalone ops script that can trigger `/api/telegram-nudge` from Hetzner on exact cron times, and made the Vercel nudge route accept an explicit `slot=morning|evening` override.
- Changed:
  - `api/telegram-nudge.js`
  - `/Users/valquilty/Documents/My Website/adhd-planner-ops/sendTelegramNudge.mjs`
  - `/Users/valquilty/Documents/My Website/adhd-planner-ops/telegram-nudge.env.example`
- Verified:
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-nudge'); console.log('server ok')"`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node /Users/valquilty/Documents/My Website/adhd-planner-ops/sendTelegramNudge.mjs` fails cleanly with `PLANNER_NUDGE_SECRET is not configured`
- Risks / follow-up:
  - Hetzner cron cannot be activated until we have the Vercel `CRON_SECRET` (or a new shared replacement) to authorize the request

## 2026-04-11 11:12 Europe/Berlin - Codex

- Summary: Finished the Hetzner Telegram nudge move. Installed the bridge script on Hetzner, created exact cron jobs for 09:00 and 18:00 Berlin time, and manually verified one successful morning nudge end-to-end.
- Changed:
  - `vercel.json` (remove Vercel cron jobs to avoid duplicates after next deploy)
  - live Hetzner files:
    - `/root/adhd-mcp/sendTelegramNudge.mjs`
    - `/root/adhd-mcp/.telegram-nudge.env`
    - `/root/adhd-mcp/runTelegramNudge.sh`
    - root crontab entries for `runTelegramNudge.sh morning|evening`
- Verified:
  - Hetzner manual run succeeded and returned `ok: true`
  - live response payload confirmed slot `morning` and a real task id/text
- Risks / follow-up:
  - `CRON_SECRET` is now stored on Hetzner too; rotate it later in **both** places:
    - Vercel env `CRON_SECRET`
    - `/root/adhd-mcp/.telegram-nudge.env`
  - after `vercel.json` deploy, Vercel cron duplicates should stop

## 2026-04-11 11:20 Europe/Berlin - Codex

- Summary: Extended Telegram context routing beyond subtasks. The AI intent layer now supports `complete_task`, `reopen_task`, `set_today`, `set_vital`, and `schedule_task` with `task_ref`, and the webhook resolves these against `telegramContext.lastTaskId` or task text server-side.
- Changed:
  - `api/_lib/telegram-intent.js`
  - `api/telegram-webhook.js`
- Verified:
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/telegram-webhook'); console.log('server ok')"`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - this is the first real action-router pass; if future phrasing gaps appear, prefer improving shared `task_ref` resolution over adding isolated regex branches

## 2026-04-11 11:30 Europe/Berlin - Codex

- Summary: Improved the `today=3` limit flow in Telegram. Instead of a dead-end refusal, the bot now stores `today_limit` context, recommends one pinned task to unpin, and understands follow-ups like “предложи что открепить”.
- Changed:
  - `api/telegram-webhook.js`
- Verified:
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/telegram-webhook'); console.log('server ok')"`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - the recommendation is currently a simple “lowest-priority pinned task”; if the product logic changes, keep it aligned with mission/today selection rather than inventing separate ranking rules
