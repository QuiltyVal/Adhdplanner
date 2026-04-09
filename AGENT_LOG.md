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
