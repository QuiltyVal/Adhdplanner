# ADHD Planner Roadmap

Last updated: 2026-06-10

## Product Direction

ADHD Planner is not a generic todo app.

It is a personal executive memory and orchestration layer for a user whose long-term intention regularly breaks under ADHD.

The product should do three things well:

1. Keep important goals alive over time.
2. Push the user back into context through nagging, game loops, and micro-steps.
3. Act as a docking station for AI agents, Telegram, Calendar, and future mobile clients.

## Current Architecture

- Web app: React on Vercel
- Data: Firebase Auth + Firestore
- Telegram bot: Vercel API routes
- LLM companion/parser: OpenRouter model selected by `TELEGRAM_INTENT_MODEL`
- MCP server: Hetzner, remote MCP for Claude and other clients
- Email digest: Hetzner server-side script
- Google Calendar:
  - browser-side connect in web app
  - server-side OAuth flow for Telegram calendar actions

## What Exists Already

- Today mission / rescue target
- Panic mode
- Deadlines
- Urgency / resistance / vital flags
- Telegram bot:
  - `/start`
  - `/today`
  - `/panic`
  - `/add`
  - free-text intent parsing
  - subtasks from text
  - Google Calendar scheduling
- MCP integration for planner tasks
- Email nudges
- Browser notifications
- Planner favicon

## Critical Notes

- Task sync race condition between web state and Firestore was fixed on 2026-04-08.
- This fix needs continued real-world testing.
- Previously lost tasks may already be gone if they were overwritten in Firestore before the fix.
- The system still needs a proper backup / revision history layer.

## Immediate Priorities

### P0: Stability and Data Integrity

- Retest task sync across:
  - web app
  - Telegram bot
  - MCP / Claude actions
- Verify that tasks added from Telegram and MCP appear in web UI without disappearing.
- Verify that subtasks added externally show correctly in web UI.
  - 2026-06-06: repo-side planner action/command regression coverage now guards `add_subtask` validation, command mapping, and event payload shape. Live Hetzner MCP smoke was still pending at that point because that server is deployed separately.
  - 2026-06-07: repo-side fake-transaction coverage now verifies `TASK_ADD_SUBTASK` through `runPlannerCommand`: canonical task write, `lastUpdated`, created-subtask payload, event trace, title index, Telegram context, and duplicate noop behavior. Live Hetzner MCP smoke later passed on 2026-06-10.
  - 2026-06-07: authenticated Codex MCP live smoke passed for a disposable QA task: `get_tasks` read canonical data, `add_task` created `QA MCP smoke — delete after test`, `add_subtask` attached `QA MCP subtask write — delete after test`, follow-up `get_tasks` saw the exact subtask, and `delete_task` cleaned it up. Separate web refresh/QA-packet proof later passed on 2026-06-10.
  - 2026-06-10: authenticated MCP/web refresh proof passed. Baseline web packet was `active: 8`, fingerprint `972e7261`; MCP created the disposable QA task and subtask; post-write web packet was `active: 9`, fingerprint `c6faf840`, latest QA task/subtask present; hard-refresh packet kept fingerprint `c6faf840`; cleanup via MCP returned the task count to baseline and removed the QA task without touching other tasks.
  - 2026-06-10: web planner bootstrap now has a client-side timeout, so QA packets should not remain in `planner-bootstrap-pending` forever if `/api/planner-client-actions` hangs; the packet will become an explicit bootstrap failure instead.
- [x] Add a simple Firestore backup / export strategy.
  - 2026-06-06: read-only local JSON export script added; at that point the first live export run was still pending.
  - 2026-06-06: backup script now has a no-Firestore `--dry-run` plan plus collection/user-id validation and regression coverage, so the first live export can be previewed before reading data.
  - 2026-06-06: backup script now validates generated backup payloads and supports local `--verify-file` checks for schema, user id, collection shape, and document paths before trusting an export.
  - 2026-06-07: backup verification output now includes `sizeBytes` and `fileSha256`, so first live backup evidence can be pinned to a stable checksum without reading Firestore again.
  - 2026-06-07: first real-user dry-run scope check passed for `U2geUdbvWyVRNLWnSZBnftOMSU22`; no Firestore read/write was performed and `backups/` is gitignored. At that point the first live export was still pending.
  - 2026-06-07: backup CLI output now includes explicit `safety` flags for dry-run, verify-file, and real export modes, so it is clear when Firestore is read and that Firestore is never written.
  - 2026-06-07: backup CLI now supports `--preflight` to validate that Firebase credentials are present and shaped correctly without reading Firestore, writing Firestore, creating a local backup file, or printing credential values.
  - 2026-06-08: backup preflight also accepts `--credentials-file` / `FIREBASE_CREDENTIALS_FILE` / `GOOGLE_APPLICATION_CREDENTIALS`, reads the service-account JSON only for credential readiness, and keeps credential values plus file paths out of the report. This was the final guard before the first live export.
  - 2026-06-08: first live read-only Firestore export completed for `U2geUdbvWyVRNLWnSZBnftOMSU22`. The ignored backup file is `backups/firestore-planner-U2geUdbvWyVRNLWnSZBnftOMSU22-2026-06-08T12-26-06-380Z.json`, verified with `totalDocs: 6775`, `sizeBytes: 9800417`, and SHA-256 `d2ff47895555905fa05694982abda800f0d8a123e217e193d499363a53eda13d`; `safety.firestoreWrite` stayed `false`.
  - 2026-06-08: backup CLI now supports `--restore-plan`, a local-file-only restore drill that validates a backup and prints target root/collection write counts without reading or writing Firestore. The first live backup restore-plan passed with `totalDocs: 6775` and `restorePlanOnly: true`.
  - 2026-06-08: backup CLI now supports `--list-backups [dir]`, which validates local backup JSON files, reports latest trusted backup/checksums, and flags invalid files without reading or writing Firestore.
  - 2026-06-09: backup CLI now supports `--restore-latest [dir]`, which selects the latest valid local backup and builds the same non-mutating restore review artifact without requiring a pasted filename.
  - 2026-06-09: backup CLI now supports `--safety-check [dir]`, which validates local backup inventory freshness and reports `readyForRiskyQa` before risky QA/migration work without reading or writing Firestore.
  - 2026-06-10: `--safety-check` can also enforce `--minTotalDocs` and `--requireCollections`, so a fresh but incomplete backup blocks risky QA instead of passing on age alone.
  - 2026-06-10: backup CLI now supports `--compare-backups before.json after.json`, a local-only diff that validates both files and reports root/document hash deltas, counts, and path previews without printing document data.
  - 2026-06-10: `npm run check:planner-integrity` checks a local backup JSON for semantic task risks without network or Firestore access, including false-death signatures, invalid `deadlineAt` years like `0020-02-07`, stale not-your-move blocks, Angel pins on non-active tasks, overdue pressure tasks, and leftover QA/smoke tasks.
  - 2026-06-10: deadline writes now reject or ignore unsupported years outside `2020..2100`: API/client contracts and command-service/MCP paths reject `0020-02-07` with clear errors, while capture/Telegram heuristic extraction drops invalid dates instead of writing them. Deployed to production web/API (`dpl_8md2CxUakCAZd68Ajp3NJVxsCgxs`) and Hetzner MCP.
- [x] Add operation logging for destructive task changes.
  - 2026-06-06: destructive/status-transition events include structured status transition payloads; bulk/delete/snapshot paths already write planner events.
  - 2026-06-07: subtask toggle events now use the canonical planner event type constant with regression coverage, keeping subtask activity traces consistent for MCP/Telegram/web-origin mutations.

### P1: Telegram as Main Daily Interface

- [x] Add planner web link into Telegram bot replies.
- [x] Add "return from completed to active" from Telegram.
  - 2026-06-06: repo regression coverage now checks `reopen_task` restore execution for latest non-active tasks and explicit title refs, including returned active keyboard with `Open planner`.
- Live Telegram smoke procedure:
  - 2026-06-06: checklist added in `docs/telegram-live-smoke-checklist.md` for `/help`, `/today`, `/calendar`, `/cemetery`, completed restore, Cemetery confirmation/cancel, and `Open planner` evidence.
  - 2026-06-06: repo regression coverage added for read-only Telegram daily actions (`/today`, `/completed`, `/cemetery`) so they keep their expected keyboards and fail if they accidentally call the mutation command runner.
  - 2026-06-07: repo regression coverage now checks the `/start` connected response still includes command discovery and `Open planner`.
  - 2026-06-06: repo regression coverage now also checks `/help` and `/calendar` response payloads, including `Open planner` and Google Calendar connect buttons.
  - 2026-06-07: unknown slash-command replies now include `Open planner` and are covered as read-only command-discovery responses.
  - 2026-06-07: command error hints such as `/add` without text now include `Open planner` and are covered repo-side.
  - 2026-06-07: chat/fallback guidance replies now include `Open planner` and are covered as read-only responses.
  - 2026-06-07: AI-routed Done confirmations are covered so they require `confirm_done` and still expose Rescue, Cancel, and `Open planner`.
  - 2026-06-07: direct task-card `done` callbacks are covered so the normal Telegram task button still completes the task with task-card feedback and context.
  - 2026-06-07: `confirm_done` callbacks are covered so the second tap routes to the normal completed-task mutation with confirmation feedback and callback context.
  - 2026-06-06: user-provided real Telegram screenshots confirmed `/today` renders the daily digest with active task buttons including `Cemetery` and `Open planner`, and `/calendar` renders the Google Calendar connect CTA. OAuth completion was not tested.
  - 2026-06-06: user-provided live Telegram check confirmed `/cemetery` and active-task `Cemetery -> Cancel` work correctly in the real bot client. Destructive `Yes, Cemetery` on a real task remains intentionally outside this safe smoke.
  - 2026-06-06: empty `/completed` and empty `/cemetery` Telegram replies now also include `Open planner`, with repo-side read-only coverage.
  - 2026-06-06: Google Calendar OAuth state now has repo-side TTL/user-id validation coverage, so stale Telegram connect links are rejected before token exchange.
  - 2026-06-07: Google Calendar OAuth callback now has repo-side coverage for success, missing refresh token, expired/bad state, missing code/state, and method boundaries. Live OAuth completion is still pending.
  - 2026-06-10: Telegram calendar scheduling executor path now has repo-side mocked coverage for disconnected connect CTA, connected missing-date/time guidance, and connected successful event creation. No live Google API call is made; OAuth completion remains the live gap.
- Add "kill / revive" from free text and buttons.
  - 2026-06-05: active-task `Cemetery` button and `/cemetery` restore list are implemented.
  - 2026-06-06: repo regression coverage now checks the first-tap Cemetery confirmation payload (`Yes, Cemetery`, `Make smaller`, `Cancel`, `Open planner`) so the task keyboard does not expose direct `confirm_kill`.
  - 2026-06-06: repo regression coverage now also checks Telegram `cancel:<taskId>` resolves to no planner command, while `confirm_kill:<taskId>` still resolves to Cemetery mutation.
  - 2026-06-06: user-provided live Telegram check confirmed the Cemetery bot path behaves correctly, including safe cancel behavior.
  - 2026-06-06: web active-card `To Cemetery` now asks for confirmation before moving a task out of Active, matching the Telegram destructive-action boundary.
- Improve Telegram nudges:
  - investigate why a nudge landed at 09:44 instead of 09:00
    - 2026-06-06: scheduled nudge outbox payloads now include `scheduledForLocal`, `triggeredLocal`, and `retryWindow` so future delayed-looking nudges can be distinguished from intentional within-hour retries.
  - verify cron and timezone behavior
  - tune message timing and tone
- Add better free-text support for:
  - mark task done
  - pin for today
  - unpin
  - revive completed/dead tasks
  - 2026-06-06: repo fallback parser now routes Russian and Telegram-button-style English free-text actions for done, revive, Cemetery, Today pin/unpin, and critical on/off when OpenRouter is unavailable. Live Telegram smoke is still pending.
  - 2026-06-06: repo fallback parser now also routes `I'm stuck` / `я застряла` variants to panic or task-specific panic instead of accidental new-task creation when OpenRouter is unavailable. Live Telegram smoke is still pending.
  - 2026-06-10: repo fallback parser now normalizes Telegram-style panic text with emoji/SOS/curly apostrophes (`🆘 I’m stuck`, `SOS I’m stuck`, `sos`) to plain panic instead of treating the button text as a task reference; task-specific forms such as `I’m stuck on "Pay rent"` remain covered. Production deploy and live free-text smoke remain separate.
  - 2026-06-10: the same OpenRouter-down panic cases are covered at `planner-agent-router` level, proving `🆘 I’m stuck` routes to `panic` instead of `add_task` before the executor can create task-memory side effects.

### P1: MCP Reliability

- Fix "subtasks via MCP are not set".
- Ensure MCP updates also maintain `lastUpdated`.
- Ensure web merge logic and MCP writes do not conflict.
  - 2026-06-06: local shared server path already sets `lastUpdated` for `TASK_ADD_SUBTASK`; regression coverage was added for the API contract and route-to-command mapping. Separate live MCP verification remains required.
  - 2026-06-07: transactional command-service coverage now exercises the MCP-style add-subtask write without Firestore credentials, including duplicate protection and event trace.
  - 2026-06-07: `npm run check:mcp` now verifies the live public MCP auth boundary without credentials: reachable endpoint, Bearer `401`, `mcp:tools` scope, and OAuth protected-resource metadata. Authenticated task read/write smoke is covered separately below.
  - 2026-06-07: `npm run check:codex-mcp` and `docs/codex-mcp-setup.md` now cover the Codex Desktop client-side setup check, so a missing Planner MCP tool can be diagnosed without printing secrets.
  - 2026-06-07: `npm run check:mcp-readiness` now combines endpoint health and Codex config registration into one read-only report for Codex MCP readiness.
  - 2026-06-07: `npm run setup:codex-mcp` now previews the exact Codex config entry; `--apply` appends only the Planner MCP URL entry, without tokens or headers.
  - 2026-06-08: `scripts/set-mcp-oauth-password.mjs` now provides a tested admin-only MCP OAuth password reset helper. It updates only `passwordSalt`/`passwordHash`, writes a backup, can generate or read a password from stdin, and can restart the `adhd-mcp` PM2 process.
  - 2026-06-08: live Hetzner MCP now exposes `https://mcp.valquilty.com/change-password` for normal known-password changes after MCP login; admin SSH reset remains only for lost-password recovery.
  - 2026-06-08: live MCP source is now mirrored in `services/mcp-server`, with package metadata, deployment docs, env/PM2 templates, and repo-side source guard coverage. Deploy is still manual until the Hetzner service is moved to a CI-backed flow.
  - 2026-06-08: `npm run deploy:mcp-server` is a dry-run-first deploy helper for syncing the MCP source files to Hetzner with local/server syntax checks, remote backup, PM2 restart, and health/auth-boundary postchecks. It does not copy secrets or live data.
  - 2026-06-07: Codex CLI OAuth is now completed and a fresh post-OAuth Codex thread executed the live disposable MCP task smoke end to end: read tasks, create QA task, add QA subtask, verify, delete QA task, and confirm the final task count returned to baseline.
  - 2026-06-06: `/api/captures` now preserves MCP/API origin metadata for `source=mcp...` dry-run and stored capture paths, with contract coverage. Separate live Hetzner MCP capture/write smoke remains required.
  - 2026-06-06: `docs/mcp-live-smoke-checklist.md` now defines the real-client Hetzner MCP smoke path for read-only task list, disposable add-subtask write, web refresh proof, cleanup, and optional dry-run MCP capture origin check.
  - 2026-06-06: `/api/captures` dry-run no longer reads live Firestore tasks by default; response metadata reports whether task context came from `none`, `request`, or explicit `live` read.
  - 2026-06-07: `/api/captures` now has injectable contract coverage for non-dry-run MCP-origin notes: `source=mcp:...` is passed to append-only capture storage with MCP origin metadata, processing runs on that capture, and live task context is read only for Angel Lab response context. Live Hetzner MCP capture tool dry-run smoke later passed on 2026-06-10.
  - 2026-06-08: production `/api/captures` dry-run smoke with `source=mcp:live-smoke` returned `origin.channel: "mcp"` and `activeTasksSource: "none"`, proving the deployed no-write/no-live-read capture-origin path. A dedicated live Hetzner MCP `capture_note` dry-run smoke later passed on 2026-06-10.
  - 2026-06-08: live Hetzner MCP now includes `capture_note`, which calls the verified Planner captures API with `source=mcp:*`, `dry_run` defaulting to `true`, `include_live_tasks` defaulting to `false`, and `idempotency_key` required for `dry_run=false`. Deploy/auth-boundary smoke passed; authenticated dry-run tool-call smoke passed on 2026-06-10.
  - 2026-06-08: `capture_note` request construction moved into `services/mcp-server/src/capture-client.js` with mocked-fetch coverage for source normalization, dry-run defaults, idempotency protection, active task snapshots, timeouts, and non-OK capture API errors. The deploy helper now syncs both MCP source files instead of only `index.js`.
  - 2026-06-08: MCP server version reporting now uses one `MCP_SERVER_VERSION` constant for both MCP metadata and `/healthz`, preventing deploy evidence from reporting stale versions.
  - 2026-06-09: QA packets now include task-data freshness fields, so the pending web refresh proof can record a task fingerprint and latest task/subtask preview after MCP writes without opening Firestore.
  - 2026-06-09: `npm run check:qa-packet` now validates copied QA packets and diffs baseline/post-write/post-refresh packet files locally, so MCP/web consistency evidence can fail fast without reading Firestore or comparing fingerprints manually.
  - 2026-06-10: live `capture_note` dry-run plus disposable `get_tasks` / `add_task` / `add_subtask` / `delete_task` smoke passed through an authenticated MCP client, and the web QA packet proof showed the MCP write survived hard refresh. Final cleanup packets were copied during bootstrap loading, but their task-data fingerprint returned to the baseline and MCP cleanup confirmed the QA task absent.
  - 2026-06-10: Claude Code / Fable 5 independently verified the remote MCP `capture_note` dry-run tool call against `https://mcp.valquilty.com/mcp`: read-only `get_tasks` used the canonical tasks subcollection (`count=61`, `score=506` before manual cleanup; `count=60`, `score=521` after manual cleanup), and `capture_note` returned `origin.channel=mcp`, `origin.via=captures_api`, `origin.source=mcp:live-smoke`, `activeTasksSource=none`, `activeTasksCount=0`, and `captureId=dryrun-1781101401729` without mutations. The remaining MCP-consistency follow-up is a browser-authenticated web refresh / QA-packet proof with `npm run check:qa-packet`.
  - 2026-06-10: QA packets now include `decisionTraceFingerprint` and `decisionTraceRows`, and the local packet checker can assert `--expectDecisionStable` when a refresh should preserve the visible Decision Trace.
  - 2026-06-10: Google Calendar status endpoint behavior is covered repo-side, so the remaining OAuth live smoke can verify the actual connection without first debugging method/config/status edge cases.
  - 2026-06-10: QA packet diffs now fail on non-increasing `capturedAt`, preventing swapped packet files or same-file comparisons from being accepted as MCP/web refresh evidence.
  - 2026-06-10: QA packet checker can assert expected bootstrap status, mission text, and mission reason, turning current-focus checks into machine-verifiable evidence.
  - 2026-06-10: QA packet checker can assert `--expectOutboxEmpty`, so delivery/outbox health checks no longer depend on reading queue counts by eye.

## Next Product Features

### Time Tracking and Stats

- Add time tracking per task.
- Record:
  - total time spent
  - sessions count
  - last session time
- Show simple stats:
  - time spent by task
  - tasks completed this week
  - tasks killed
  - streak / momentum
- Use this for user-facing self-rating instead of competitive leaderboard.

### Subtasks UX

- Edit subtask text.
- Reorder subtasks.
- Better subtask creation and completion flow.

### Telegram + Planner Workflow

- Better structured capture from free text.
- Add richer task summaries in Telegram.
- Let Telegram bot answer in companion voice more naturally.
- Keep deterministic planner actions separate from model creativity.

## Future Product Direction

### Onboarding / Dopamine Loop

- Angel tutorial for first-time users.
- Start with one tiny goal immediately.
- Reward the first micro-action right away.
- Teach the user the planner loop through action, not explanation.

### Personal Progress System

- Score for self, not public competition first.
- Track:
  - tasks completed
  - tasks abandoned
  - time spent
  - consistency
  - rescue rate for dead / cold tasks

### AI Orchestration

- Planner as external executive memory for LLMs.
- Telegram as command bus.
- Claude via MCP for heavy execution.
- Companion model for:
  - interpretation
  - nudges
  - breakdowns
  - emotional tone

### Mobile

- Long-term target: Android app
- Secondary target: Mac app
- Web should remain usable, but not the final primary container.

## Backlog Captured From Telegram

- [x] add planner website link into Telegram bot
- [x] return completed tasks back to active from Telegram
- investigate why Telegram nudge came at 09:44 instead of 09:00
- add time tracking per task
- MCP to Cursor in the future
- allow editing and moving subtasks
- onboarding tutorial with angel / dopamine-first micro goal
- self-progress ranking / productivity history
- tasks disappearing bug from planner
- subtasks through MCP not working

## Suggested Build Order

1. Stabilize sync and stop data loss.
2. Finish Telegram daily workflow.
3. Fix MCP subtask writes and cross-client consistency.
4. Add time tracking + stats.
5. Add backup / revision history.
6. Improve onboarding and companion loop.
7. Move toward Android-first client.

## Next Session Start Here

If a new chat starts, begin with these checks:

1. Verify task sync after 2026-04-08 fix.
2. Verify Telegram nudges timing.
3. Continue Telegram daily workflow with kill/revive, nudge timing, and free-text action polish.
4. Fix MCP subtask write path.
5. Decide first version of time tracking schema.
