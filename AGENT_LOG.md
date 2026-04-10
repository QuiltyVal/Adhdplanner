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
