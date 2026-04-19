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

## 2026-04-19 Europe/Berlin - Codex

- Summary: Added first override behavior for daily angel decision refresh to reduce stale day-plans when urgent context changes.
- Changed:
  - `api/_lib/angel-decision-store.js` — added override detection for day decision reuse:
    - `hard_deadline`: recalc if overdue/today-deadline active task is outside current day selection
    - `pin_gap`: recalc if selected pinned tasks became fewer than expected (e.g. completed/inactive)
  - `api/_lib/angel-decision-store.js` — decision docs now store `overrideReason` when recalculated
  - `EXECUTION_PLAN.md` — Phase 5 notes updated with implemented override scope
- Verified:
  - code integration + deploy/push in this session
- Risks / follow-up:
  - manual dismiss and emergency override are not implemented yet
  - day decision is still refreshed lazily on `/today` (no separate scheduler yet)

## 2026-04-19 Europe/Berlin - Codex

- Summary: Added first working daily angel-decision persistence layer: `/today` now resolves/reuses a day decision document and syncs angel pin fields to active tasks.
- Changed:
  - `api/_lib/angel-decision-store.js` — new daily decision store in `Users/{uid}/angelDecisions/{dateKey}` with deterministic 1-2 task selection, reason, and score
  - `api/_lib/planner-action-executor.js` — `show_today` now runs daily decision sync (`ensureDailyAngelPins`) before digest
  - `api/_lib/planner-action-executor.js` — added shared pin applicator for active tasks (`angelPinned`, `angelReason`, `angelScore`)
  - `api/_lib/planner-store.js` — priority score now includes `angelPinned` bonus, so angel-focused tasks stay visible
  - `EXECUTION_PLAN.md` — Phase 5 marked in progress with implementation note
- Verified:
  - code integration + production deploy in this session
- Risks / follow-up:
  - override rules (deadline shock, completed pinned task, manual dismiss, emergency) are not implemented yet
  - no separate scheduler yet; decision is refreshed lazily on `/today`

## 2026-04-19 Europe/Berlin - Codex

- Summary: Started Phase 4 angel-pin layer on server: tasks now support angel markers, and Telegram `/today` can surface angel-selected focus with explicit reason text.
- Changed:
  - `api/_lib/planner-store.js` — added task fields `angelPinned`, `angelScore`, `angelReason` to `createTask(...)` and planner fingerprint normalization; mission selection now considers `angelPinned` after manual `isToday` shortlist
  - `api/_lib/planner-store.js` — Telegram task line now shows `🤖 ангел` marker for angel-pinned tasks
  - `api/_lib/planner-action-executor.js` — `/today` now includes angel-pinned tasks in “Важное сейчас” and sends short “почему ангел выбрал” text when top task is angel-pinned
  - `EXECUTION_PLAN.md` — Phase 4 field item marked in-progress with note about partial implementation
- Verified:
  - code integration only; no tests in this session
- Risks / follow-up:
  - fields `angelPressure`, `angelDecidedAt`, `angelReviewAt` are not implemented yet
  - no dedicated decision writer exists yet; current change only prepares schema + rendering path

## 2026-04-19 Europe/Berlin - Codex

- Summary: Switched Angel Lab default behavior to simple brain-dump mode (`dump -> create cards`) so it focuses on turning chaotic text into clear new tasks without merge complexity.
- Changed:
  - `api/captures.js` — added default mode switch `ANGEL_LAB_MODE` (`simple` by default, `smart` opt-in)
  - `api/captures.js` — added `buildSimpleBrainDumpTaskCards(...)` path using deterministic parsing + actionable filtering + near-duplicate suppression
  - `api/captures.js` — in `simple` mode disabled smart merge/classification + AI subtask enrichment + create preselection pipeline (returns plain create cards)
- Verified:
  - code integration only; no tests in this session
- Risks / follow-up:
  - simple mode intentionally does not merge into existing tasks; if needed later, keep it in optional `smart` mode only

## 2026-04-19 Europe/Berlin - Codex

- Summary: Added beta auto-preselection for `create` Angel Lab cards so 1-2 strongest subtasks are selected by default, while keeping an instant rollback switch.
- Changed:
  - `api/captures.js` — added `applyCreateCardSubtaskPreselection(...)` after server card enrichment; applies only to `mode: "create"` cards and selects up to 2 highest-confidence subtasks
  - `api/captures.js` — added env flag `ANGEL_LAB_CREATE_AUTO_PRESELECT` (`"1"` default enabled, set `"0"` to disable and return to strict manual selection)
- Verified:
  - code integration only; no tests and no deploy in this session
- Risks / follow-up:
  - if low-confidence AI subtasks still feel noisy, raise threshold (`CREATE_CARD_AUTO_PRESELECT_MIN_CONFIDENCE`) or disable with env flag

## 2026-04-18 Europe/Berlin - Codex

- Summary: Added transparent capture-enrichment reporting so Angel Lab can tell the user which existing tasks were updated and which fields changed after saving a dump.
- Changed:
  - `api/_lib/capture-extractor.js` — `taskEnrichment` now includes `updatedTasks[]` with task text and changed field keys (`urgency`, `resistance`, `isVital`, `deadlineAt`, `lifeArea`, `commitmentIds`)
  - `src/App.js` — Angel Lab success status now shows human-readable update details (`Обновила N задач: ...`) based on server enrichment output
- Verified:
  - code integration only; no tests and no deploy in this session
- Risks / follow-up:
  - enrichment messages can be long when many tasks are updated; UI currently truncates by showing top 3 and `+N`

## 2026-04-18 Europe/Berlin - Codex

- Summary: Stabilized Angel Lab extraction quality and then moved to the next plan item by adding safe web-capture hint upsert into active tasks via server-domain mutation path.
- Changed:
  - `api/_lib/capture-extractor.js` — added conservative extraction->task enrichment pass (`applyExtractionTaskHints`) with fuzzy matching guardrails, safe field merges (`urgency`, `resistance`, `isVital`, `deadlineAt`, `lifeArea`, `commitmentIds`), and `mutatePlanner` stale-safe writes
  - `api/captures.js` — now returns `taskEnrichment` summary from capture processing
  - `EXECUTION_PLAN.md` — added Phase 2 note about safe web capture hint upsert and clarified remaining scope (MCP enrichment still pending)
  - `SESSION_HANDOFF.md` — documented new capture->task enrichment behavior
- Verified:
  - code integration only; no tests and no deploy in this session
- Risks / follow-up:
  - enrichment currently updates only existing active tasks; it does not create tasks (intentional)
  - matching is conservative by design and may skip ambiguous captures; MCP-originated capture enrichment remains TODO

## 2026-04-18 Europe/Berlin - Codex

- Summary: Added a cross-platform planner action API layer so future Android/iOS (and web thin clients) can execute the same server/domain action contract as Telegram, with Firebase-authenticated client access.
- Changed:
  - `api/planner-client-actions.js` — new `POST /api/planner-client-actions` endpoint (Firebase bearer auth, action validation, shared action execution, optional state response)
  - `api/_lib/planner-actions-runtime.js` — new shared runtime helper for body parsing, flag parsing, adapter capture, and `executePlannerAction` orchestration
  - `api/planner-actions.js` — refactored to reuse shared runtime helper (secret-based server-to-server path preserved)
  - `api/_lib/planner-contract.js` — expanded allowed action set (`show_completed`, `panic_task`, `unset_vital`) to match executor capabilities
  - `EXECUTION_PLAN.md` — marked cross-platform boundary item done and added notes about new client/server action endpoints
  - `SESSION_HANDOFF.md` — updated Telegram route-executor status and documented new planner action API surfaces
- Verified:
  - code integration only; no tests and no deploy in this session
- Risks / follow-up:
  - web UI still has local direct task mutations; to complete thin-client migration, progressively move those paths behind planner action API calls
  - client endpoint currently accepts explicit `userId` only when it matches auth uid; multi-user admin scopes are intentionally not supported yet

## 2026-04-15 Europe/Berlin - Codex

- Summary: Added web captures end-to-end (UI + API) as append-only brain-dump intake into canonical `Users/{uid}/captures` storage, and aligned the endpoint with existing capture contract.
- Changed:
  - `src/App.js` — added `Выгрузить из головы` action and modal wiring
  - `src/App.css` — added launch-button styles for capture action in header
  - `src/CaptureComposer.js` + `src/CaptureComposer.css` — new capture modal UI and interaction states
  - `api/captures.js` — new `POST /api/captures` endpoint with payload validation
  - `api/_lib/capture-store.js` — append helper now reuses `writeCapture(...)` contract from planner-store
  - `EXECUTION_PLAN.md` — marked web append-only capture intake as done
  - `SESSION_HANDOFF.md` — recorded web capture intake in memory groundwork
- Verified:
  - code integration only; no tests and no deploy in this session
- Risks / follow-up:
  - endpoint currently uses `PLANNER_DEFAULT_USER_ID`; add authenticated user resolution when auth/session layer is exposed server-side
  - extraction is still asynchronous/not wired as immediate response in `/api/captures`

## 2026-04-15 Europe/Berlin - Codex

- Summary: Added a portable multi-machine / multi-agent repo wrapper so the project can be developed comfortably from both home and office without depending on one hardcoded Mac path.
- Changed:
  - `README.md` — rewritten around portable setup, daily sync, and agent handoff
  - `AGENTS.md` + `CLAUDE.md` — switched to repo-relative links and added multi-machine guidance
  - `MACHINE_SETUP.md` — new first-clone / new-machine setup guide
  - `WORKFLOW.md` — new daily home/office and parallel-agent workflow doc
  - `scripts/bootstrap-machine.sh` — new fresh-machine bootstrap helper
  - `scripts/sync-local.sh` — new safe `main` sync helper for switching machines
  - `package.json` — added `bootstrap`, `sync`, `verify`, and `verify:server` scripts
  - `.nvmrc` — pinned recommended Node major to `24`
  - `.gitignore` — now ignores `.DS_Store` and `.vercel`
  - `SESSION_HANDOFF.md` — added repo portability notes
- Verified:
  - repo docs updated
  - package scripts updated
- Risks / follow-up:
  - root `.DS_Store` is still currently tracked from older repo history; removing it from git can be done later if desired, but it was not force-removed in this pass

## 2026-04-11 (evening) — Claude (Sonnet 4.6, remote session)

- Summary: Replaced all regex-based Telegram routing with unified LLM intent router. Bot now has 12 intents and full conversation context — "давай последнюю" after suggest_unpin now resolves correctly.
- Changed:
  - `api/_lib/telegram-intent.js`: full rewrite. 12 intents (add_task, complete_task, reopen_task, delete_subtask, add_subtask, set_today, unset_today, set_vital, suggest_unpin, show_today, panic, schedule_task, chat). Rich system prompt with full task list + telegramContext.suggestedTaskTexts. No regex post-processing.
  - `api/_lib/planner-store.js`: buildTelegramContext now accepts extra={} fields; ensurePlannerDoc preserves suggestedTaskTexts.
  - `api/telegram-webhook.js`: removed regex pre-filters. Added handlers: handleSuggestUnpin, handleSetToday, handleUnsetToday, handleSetVital, handleAddSubtask, handleReopenTask. handlePlainCapture passes full telegramContext to LLM.
- Verified:
  - `node server ok` passes, `npm run build` passes, pushed to main
- Risks / follow-up:
  - **⚠️ Hetzner still needs deploy**: `git pull origin main && pm2 restart all`
  - After deploy, test: "предложи что открепить" → "давай последнюю"
  - Codex's planner-agent-router.js / planner-action-executor.js were in their commits — after rebase those are replaced by this cleaner unified approach

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

## 2026-04-11 17:55 Europe/Berlin - Codex

- Summary: Found the real reason why Telegram still ignored `давай последнюю`. It was not a deployment mystery: the shared router used JavaScript `\b` word-boundary checks on Cyrillic phrases, so the selection-context override never triggered and the message fell through to the AI parser as `set_today`.
- Changed:
  - `api/_lib/planner-agent-router.js`
- Verified:
  - local repro before fix: `routePlannerAgentInput({ text: 'давай последнюю', telegramContext.lastAction='suggest_unpin_today' })` fell through to AI parsing
  - local repro after fix: same input now routes to `{ type: 'unset_today', taskRef: 'последнюю', source: 'selection_context' }`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - other Cyrillic regexes should avoid `\b`; if similar “human follow-up not understood” bugs appear, inspect for ASCII-only boundary assumptions first

## 2026-04-13 — Claude (claude-sonnet-4-6)

- Summary: Fixed critical production bugs reported by user: pink screen on load, tasks reverting from heaven/cemetery after page reload, and complete button blocked by heat bar.
- Changed:
  - `src/App.js` — added `useRef` to React imports (was crashing entire app), added `mergeTaskLists` to onSnapshot callback so local optimistic updates (complete/kill/drag) aren't overwritten by stale Firestore snapshots, added automatic per-day activity tracking (`activeDays[]`, `timeByDay`), added `completedAt` timestamp on task completion
  - `src/TaskColumn.js` — Complete button now always visible (was gated behind `heatCurrent > 60`), subtask edit input replaced with auto-growing textarea
  - `src/TaskColumn.css` — `.subtask-edit-input` fixed to be readable (white text on translucent dark bg), `.subtask-item--editing` added for proper alignment
  - `src/App.css` — stats tab redesigned with per-task activity dot-calendar and day-by-day time log
  - `.gitignore` — removed `build/` so compiled output is committed and deployed via git pull
  - `scripts/auto-pull.js` — added `npm run build` step between git pull and pm2 restart
- Verified:
  - `npm run build` compiled cleanly each time
  - jsdom render test showed ROOT CONTENT was populated (not empty) after useRef fix
- Branches: committed and pushed to both `main` and `claude/review-project-Zw7WB`
- Risks / follow-up:
  - `isFirstSnapshot` flag is set AFTER `firestoreReadyRef.current` is set to true, so technically always false — but `mergeTaskLists([], remoteTasks)` correctly returns remoteTasks, so initial load works fine; the branch is dead code but harmless
  - The review branch (`claude/review-project-Zw7WB`) has AI companion features (OpenRouter) not yet in main — needs future merge/PR

## 2026-04-14 10:55 Europe/Berlin - Codex

- Summary: Hardened cross-device task sync against stale tabs and clock skew. The likely failure mode was not just “snapshot race on reload” anymore: a stale browser session or a device with a slightly older clock could still send a whole-task overwrite that looked newer locally and rolled tasks back across devices.
- Changed:
  - `src/App.js` — added local-only task sync metadata (`__baseLastUpdated`, `__pendingSyncAt`), bounded optimistic merge window to 15s, stopped refreshing cloud cache before a real Firestore snapshot, and applied remote conflict replacements directly in UI when Firestore rejects a stale write
  - `src/firestoreUtils.js` — `saveTask()` now rejects writes when Firestore has already advanced beyond the task’s local base version, normalizes accepted `lastUpdated` to at least `base + 1` to tolerate clock skew, and strips local-only sync metadata from saved tasks/snapshots
  - regenerated tracked build output after verification
- Verified:
  - `npm install`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - tabs already open with the old pre-fix bundle can still write stale state until they are refreshed or fully closed once
  - this conflict guard protects web writes that go through `src/firestoreUtils.saveTask`; if reverts continue after refreshing all clients, inspect live Firestore snapshots and any non-web writer that may still bypass this path

## 2026-04-14 11:25 Europe/Berlin - Codex

- Summary: Fixed the more direct web write-loss bug in `src/App.js`. Existing-task handlers were mutating a local `saved` variable inside `setTasks(...)` and then calling `persistTask(saved)` outside; that is not a safe way to derive a task to persist from React state scheduling, and it could leave status changes visible in UI but never written to Firestore.
- Changed:
  - `src/App.js` — added `tasksRef` + `mutateSingleTask()` so task mutations are computed synchronously before `persistTask()`
  - `src/App.js` — switched existing-task handlers (`complete/kill/resurrect/reopen/drag/today/subtasks/edits`) to the new mutation helper
  - `src/App.js` — queued pending task writes until the first Firestore snapshot instead of silently dropping them while `firestoreReadyRef` is false
  - regenerated tracked build output after verification
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - game-tick auto-death still uses its own update path and should be reviewed separately if dead-task persistence behaves oddly
  - if tasks still revert after this deploy, next suspect is a non-web writer overwriting canonical subcollection state after the web write succeeds

## 2026-04-14 13:05 Europe/Berlin - Codex

- Summary: Hardened the Vercel server-side planner writer against stale overwrites. If any Telegram/server mutation is derived from an older task version, it now skips overwriting the newer Firestore document instead of blindly batch-writing old state back into the subcollection.
- Changed:
  - `api/_lib/planner-store.js` — `mutatePlanner()` now runs in a Firestore transaction, strips internal task sync markers before writing, compares each task doc against the base version the mutation was derived from, skips stale overwrites/deletes, and normalizes accepted writes to at least `base + 1`
  - `api/telegram-webhook.js` — reopen flows now attach `__baseLastUpdated` when reviving tasks fetched outside the active-task list so the stale-write guard can tell a valid reopen from an out-of-date overwrite
  - `api/_lib/planner-action-executor.js` — reopen flow carries the same base-version marker
- Verified:
  - `node --check api/_lib/planner-store.js`
  - `node --check api/_lib/planner-action-executor.js`
  - `node --check api/telegram-webhook.js`
- Risks / follow-up:
  - this protects server writers that go through `api/_lib/planner-store.js`; a completely separate writer that bypasses that module can still revert tasks

## 2026-04-15 16:10 Europe/Berlin - Codex

- Summary: Added a dedicated execution tracker for the new "angel / executive-function companion" direction so agents can work against one shared plan instead of free-floating product notes.
- Changed:
  - `EXECUTION_PLAN.md` — added phased plan with checkboxes, non-negotiable product rules, and "done when" criteria for captures, commitments, angel pinning, daily decisions, delivery loop, and validation
  - `AGENTS.md` — made `EXECUTION_PLAN.md` part of the expected reading and end-of-session update flow
  - `CLAUDE.md` — added the same requirement for Claude-style agents
  - `README.md` and `SESSION_HANDOFF.md` — linked the execution plan as the active tracker for this product direction
- Verified:
  - reviewed updated docs locally
- Risks / follow-up:
  - this is planning structure only; none of the capture/commitment/angel features are implemented yet
  - `ROADMAP.md` still contains older broader backlog items, so future agents should treat `EXECUTION_PLAN.md` as the execution tracker for this specific product direction

## 2026-04-15 16:40 Europe/Berlin - Codex

- Summary: Landed the first real angel-memory slice: a documented storage boundary note plus append-only Telegram `captures` ingestion for open-ended plain text.
- Changed:
  - `ANGEL_ARCHITECTURE.md` — documented source-of-truth boundaries for `tasks`, `captures`, `commitments`, and `angelDecisions`, plus anti-patterns like relying on legacy `Users/{uid}.tasks`
  - `api/_lib/planner-store.js` — added `writeCapture(userId, payload)` for append-only capture documents under `Users/{uid}/captures/{captureId}`
  - `api/telegram-webhook.js` — plain-text Telegram intake now writes a `text_dump` capture before normal handling when the parsed intent is `add_task` or `chat`, and logs `capture_created`
  - `EXECUTION_PLAN.md` — marked the architecture-note and Telegram-capture items done
  - `README.md`, `SESSION_HANDOFF.md`, `AGENTS.md`, `CLAUDE.md` — linked the new architecture note for future agents
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - exact `node -e "require(...)"` verification could not be completed on this machine because the only installed global Node is `v25.4.0`, and a transitive dependency (`buffer-equal-constant-time`) crashes under Node 25 before app modules load
- Risks / follow-up:
  - live Telegram still uses the older webhook file, not the newer `planner-agent-router -> planner-action-executor` path, so future capture/extraction work must either migrate webhook routing or keep both paths aligned
  - capture ingestion exists only for Telegram plain text so far; web and MCP are still missing

## 2026-04-15 17:05 Europe/Berlin - Codex

- Summary: Added the first extraction pass for Telegram captures. Raw plain-text capture docs are now immediately enriched with structured `commitments`, `candidateTasks`, and `facts` instead of staying as unprocessed blobs.
- Changed:
  - `api/_lib/capture-extractor.js` — new heuristic extractor + capture post-processing helpers
  - `api/telegram-webhook.js` — after writing a Telegram capture, immediately processes it into structured extraction and logs extracted counts
  - `package.json` — `verify:server` now also checks `api/_lib/capture-extractor.js`
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, `ANGEL_ARCHITECTURE.md` — updated to reflect that Phase 2 extraction now exists in first-pass form
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - this extractor is heuristic and intentionally rough; it is good enough for a first memory layer, not for final semantic quality
  - extraction does not yet upsert tasks or commitments into canonical collections

## 2026-04-15 17:30 Europe/Berlin - Codex

- Summary: Added durable commitment memory. Extraction no longer stops at the capture document: extracted life obligations now upsert into `Users/{uid}/commitments/{commitmentId}` with stable review and pressure metadata.
- Changed:
  - `api/_lib/commitment-store.js` — new per-document commitment upsert layer
  - `api/_lib/capture-extractor.js` — `processCapture()` now materializes extracted commitments and writes `commitmentIds` back onto the processed capture
  - `api/telegram-webhook.js` — Telegram capture processing now logs both extracted commitment count and actually upserted commitment IDs/count
  - `package.json` — `verify:server` now also checks `api/_lib/commitment-store.js`
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, `ANGEL_ARCHITECTURE.md`, `AGENTS.md` — updated to reflect that commitment memory exists as a real Firestore layer
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - commitment IDs currently come from extractor `tempKey` values and heuristic fallback slugs, so long-term ID stability still needs a more deliberate strategy
  - commitments exist, but task docs still do not carry `commitmentIds`, so the planner UI cannot yet use that memory for ranking or visibility

## 2026-04-15 18:10 Europe/Berlin - Codex

- Summary: Fixed the two biggest risks in the new memory layer after independent review. Telegram capture ingestion is now replay-safe enough for webhook retries, and the extractor no longer turns arbitrary unmatched text into fake durable commitments.
- Changed:
  - `api/_lib/planner-store.js` — `writeCapture()` now supports deterministic idempotency keys and reuses an existing capture doc instead of always generating a new random one
  - `api/_lib/capture-extractor.js` — `processCapture()` now short-circuits already processed captures, returns a `replayed` flag, and stops creating fallback commitments for unmatched text
  - `api/_lib/commitment-store.js` — commitment upserts now avoid re-incrementing mention counters when the same capture ID is replayed
  - `api/telegram-webhook.js` — Telegram plain-text capture path now derives an idempotency key from `update_id` / `message_id`, logs `capture_reused` on replay, and records Telegram ids in capture metadata
  - `SESSION_HANDOFF.md` and `ANGEL_ARCHITECTURE.md` — clarified the remaining legacy Telegram split and the new replay-safe capture behavior
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Telegram replay safety is now much better, but it still depends on Telegram identity fields being present for the inbound message
  - the newer router/executor path still is not the live plain-text handler, so there is still real legacy behavior in Telegram code

## 2026-04-15 18:45 Europe/Berlin - Codex

- Summary: Wired commitment memory into real Telegram task docs instead of leaving it isolated in capture/commitment collections.
- Changed:
  - `api/_lib/planner-store.js` — canonical task fingerprints and `createTask()` now include `lifeArea` and `commitmentIds`
  - `api/telegram-webhook.js` — Telegram `/add` and plain-text task upsert flows now carry extraction-based `urgency`, `resistance`, `lifeArea`, and `commitmentIds`; existing tasks merge those fields conservatively instead of dropping them
  - `api/_lib/planner-action-executor.js` — kept the newer non-live Telegram execution path aligned so it also preserves `resistance`, `lifeArea`, and `commitmentIds`
  - `EXECUTION_PLAN.md`, `ANGEL_ARCHITECTURE.md`, `SESSION_HANDOFF.md` — updated to reflect that task-linking now exists and to correct the misleading "Telegram already fully migrated to router/executor" implication
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - this only links memory on Telegram task create/update flows; web and MCP capture ingestion still do not enrich task docs
  - extractor-driven urgency fallback is now used where safe, but broader deadline/vital inference still mostly depends on explicit intent parsing

## 2026-04-15 19:20 Europe/Berlin - Codex

- Summary: Applied the smallest safe fix after skeptical review of the Telegram memory split: extracted the live webhook enrichment into a shared helper, marked the router contract honestly, and corrected docs that overstated router/executor readiness.
- Changed:
  - `api/_lib/telegram-task-memory.js` — new shared helper for Telegram capture processing and task-memory enrichment so the logic is no longer buried only inside the legacy webhook file
  - `api/telegram-webhook.js` — now calls the shared helper but keeps the live behavior unchanged
  - `api/_lib/planner-agent-router.js` — `add_task` routes now explicitly mark that they still require external memory enrichment before execution
  - `package.json` — `verify:server` now syntax-checks the new helper and the router too
  - `EXECUTION_PLAN.md` and `SESSION_HANDOFF.md` — corrected to say only the live inline webhook path is memory-enriched today; router/executor still needs an outer intake/enrichment step
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - attempted full server module-load check, but local `Node v25.4.0` hits an old transitive dependency before repo code loads; `~/.nvm/nvm.sh` was not present here to retry under Node 24 from this shell
- Risks / follow-up:
  - this does not migrate Telegram traffic to `planner-agent-router` / `planner-action-executor`; it only removes the misleading split and makes the enrichment seam reusable
  - there is still no automated behavioral test that proves memory enrichment survives a future router migration

## 2026-04-15 20:05 Europe/Berlin - Codex

- Summary: Moved live plain-text Telegram back onto the shared `route -> memory -> execute` path, while keeping slash commands and callback buttons local for now.
- Changed:
  - `api/_lib/telegram-task-memory.js` — added shared route-level merge logic so memory enrichment can be applied to a routed Telegram action before execution
  - `api/_lib/planner-action-executor.js` — `reopen_task` and `schedule_task` now safely resolve non-active tasks too, so the shared executor can match the old webhook plain-text behavior more closely
  - `api/telegram-webhook.js` — `handlePlainCapture` now uses `routePlannerAgentInput(...)`, runs Telegram capture/enrichment once, and delegates to `executePlannerAction(...)`
  - `EXECUTION_PLAN.md` and `SESSION_HANDOFF.md` — updated to reflect that live plain-text Telegram is now on the shared route/enrichment/executor path, while slash/callback flows still remain local
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - slash commands and callback-button flows still duplicate part of the old webhook behavior
  - there is still no automated behavioral Telegram test, so this is verified structurally/build-wise rather than by end-to-end bot replay

## 2026-04-18 20:10 Europe/Berlin - Codex

- Summary: Closed the next memory-roadmap gap: capture suggestions are now replay-safe against already-active tasks, and `/today` now explicitly warns about important commitments that have no live next step for too long.
- Changed:
  - `api/captures.js` — added active-task aware suggestion filtering (`filterSuggestionsAgainstActiveTasks`) so repeated extraction runs stop proposing duplicates that already exist in active tasks
  - `api/captures.js` — response now includes `extractionReplayed` to expose when extraction came from an already-processed capture
  - `api/_lib/commitment-store.js` — added `getCommitmentsNeedingLiveTask(...)` to detect active high-cost commitments with no linked active task past `needsTaskIfSilentDays`
  - `api/_lib/planner-action-executor.js` — `show_today` now calls that commitment-gap detector and sends an explicit follow-up message when such obligations exist
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md` — marked/recorded the two roadmap points as landed
- Verified:
  - not run (by request in this session: no extra validation pass unless explicitly asked)
- Risks / follow-up:
  - commitment surfacing currently only runs on `show_today`; it may need expansion to morning/evening nudge jobs later
  - suggestion de-duplication currently uses text similarity heuristics, so edge cases with very short/ambiguous task text may still need tuning

## 2026-04-18 20:45 Europe/Berlin - Codex

- Summary: Reworked Angel Lab output UX to “one main task + optional steps”, and updated Telegram `/today` so “important now” is always explicit (not only when a stale-commitment alert triggers).
- Changed:
  - `src/App.js` — Angel Lab save/result shaping now creates one `main` suggestion plus `step` suggestions; added handlers for toggling optional steps and adding either main-only or main+selected-steps
  - `src/App.js` — `handleAddTask()` now accepts optional `subtasks` array on creation
  - `src/AngelLabScreen.js` — replaced per-row “add” UX with:
    - main task card
    - optional step checkboxes
    - two explicit actions: “Добавить только задачу” / “Добавить с шагами”
  - `src/AngelLabScreen.css` — added styles for main card, step checklist, and dual action buttons
  - `api/_lib/planner-action-executor.js` — `/today` now always sends “⭐ Важное сейчас” and then:
    - stale important commitment warning when needed, or
    - explicit “всё под контролем” message when no gap is detected
- Verified:
  - not run (per current session rule: no extra validation/test pass unless explicitly requested)
- Risks / follow-up:
  - the “important now” block in Telegram is intentionally verbose now; if it feels noisy in real use, it can be condensed into one combined digest message

## 2026-04-18 21:05 Europe/Berlin - Codex

- Summary: Fixed two UX regressions from the first rollout: Angel Lab main-vs-steps confusion and duplicate-feeling wording in `/today`.
- Changed:
  - `src/App.js` — added suggestion normalization helpers to keep Angel suggestions anchored to the user dump, choose a stable main suggestion, and filter near-duplicate step suggestions against main task text
  - `api/_lib/planner-action-executor.js` — when “important now” matches the same top tasks already shown above, bot now sends a short reference (“это пункты 1 и 2 из списка выше”) instead of repeating task names
- Verified:
  - not run (per current session rule: no extra validation/test pass unless explicitly requested)
- Risks / follow-up:
  - suggestion quality still depends on upstream extraction candidates; if creative drift remains in edge cases, next step is to add explicit “strict mode” knob for Angel extraction prompt

## 2026-04-18 21:20 Europe/Berlin - Codex

- Summary: Applied a second pass after live user screenshots: recovered step generation when the model returns too few candidates, and de-cluttered `/today` by removing the extra “all good” status line.
- Changed:
  - `src/App.js` — added `buildAngelLabStepFallbackFromDump(...)` and merged fallback clauses into step suggestions when server/model output is sparse
  - `api/_lib/planner-action-executor.js` — kept “important now” compact and removed the additional green confirmation message when no commitment gap exists
- Verified:
  - not run (per current session rule: no extra validation/test pass unless explicitly requested)

## 2026-04-18 21:55 Europe/Berlin - Codex

- Summary: Switched Angel Lab from single-card mode back to multi-task cards with per-task optional subtasks, and removed duplicate-feeling “important now” repeat in Telegram when it mirrors the top list.
- Changed:
  - `src/App.js` — implemented task-card builder pipeline (`buildAngelLabTaskCards`) from dump + suggestions, with deterministic split by action starters and task/step separation by keyword overlap
  - `src/App.js` — replaced global main/steps handlers with per-card actions: add task only, add task with selected steps, toggle step, dismiss card
  - `src/AngelLabScreen.js` — UI now renders multiple task cards, each with its own optional steps and controls
  - `src/AngelLabScreen.css` — added card-list and dismiss-button styles for multi-card mode
  - `api/_lib/planner-action-executor.js` — `show_today` now suppresses the extra “important now” block when it duplicates the same top tasks already listed in the main digest
- Verified:
  - not run (per current session rule: no extra validation/test pass unless explicitly requested)
