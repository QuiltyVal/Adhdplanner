# ADHD Planner Roadmap

Last updated: 2026-06-07

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
  - 2026-06-06: repo-side planner action/command regression coverage now guards `add_subtask` validation, command mapping, and event payload shape. Live Hetzner MCP smoke is still pending because that server is deployed separately.
  - 2026-06-07: repo-side fake-transaction coverage now verifies `TASK_ADD_SUBTASK` through `runPlannerCommand`: canonical task write, `lastUpdated`, created-subtask payload, event trace, title index, Telegram context, and duplicate noop behavior. Live Hetzner MCP smoke is still pending.
- [x] Add a simple Firestore backup / export strategy.
  - 2026-06-06: read-only local JSON export script added; first live export run is still pending.
  - 2026-06-06: backup script now has a no-Firestore `--dry-run` plan plus collection/user-id validation and regression coverage, so the first live export can be previewed before reading data.
  - 2026-06-06: backup script now validates generated backup payloads and supports local `--verify-file` checks for schema, user id, collection shape, and document paths before trusting an export.
  - 2026-06-07: backup verification output now includes `sizeBytes` and `fileSha256`, so first live backup evidence can be pinned to a stable checksum without reading Firestore again.
  - 2026-06-07: first real-user dry-run scope check passed for `U2geUdbvWyVRNLWnSZBnftOMSU22`; no Firestore read/write was performed and `backups/` is gitignored. First live export remains pending.
  - 2026-06-07: backup CLI output now includes explicit `safety` flags for dry-run, verify-file, and real export modes, so it is clear when Firestore is read and that Firestore is never written.
  - 2026-06-07: backup CLI now supports `--preflight` to validate that Firebase credentials are present and shaped correctly without reading Firestore, writing Firestore, creating a local backup file, or printing credential values.
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
  - 2026-06-06: user-provided real Telegram screenshots confirmed `/today` renders the daily digest with active task buttons including `Cemetery` and `Open planner`, and `/calendar` renders the Google Calendar connect CTA. OAuth completion was not tested.
  - 2026-06-06: user-provided live Telegram check confirmed `/cemetery` and active-task `Cemetery -> Cancel` work correctly in the real bot client. Destructive `Yes, Cemetery` on a real task remains intentionally outside this safe smoke.
  - 2026-06-06: empty `/completed` and empty `/cemetery` Telegram replies now also include `Open planner`, with repo-side read-only coverage.
  - 2026-06-06: Google Calendar OAuth state now has repo-side TTL/user-id validation coverage, so stale Telegram connect links are rejected before token exchange.
  - 2026-06-07: Google Calendar OAuth callback now has repo-side coverage for success, missing refresh token, expired/bad state, missing code/state, and method boundaries. Live OAuth completion is still pending.
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

### P1: MCP Reliability

- Fix "subtasks via MCP are not set".
- Ensure MCP updates also maintain `lastUpdated`.
- Ensure web merge logic and MCP writes do not conflict.
  - 2026-06-06: local shared server path already sets `lastUpdated` for `TASK_ADD_SUBTASK`; regression coverage was added for the API contract and route-to-command mapping. Separate live MCP verification remains required.
  - 2026-06-07: transactional command-service coverage now exercises the MCP-style add-subtask write without Firestore credentials, including duplicate protection and event trace.
  - 2026-06-07: `npm run check:mcp` now verifies the live public MCP auth boundary without credentials: reachable endpoint, Bearer `401`, `mcp:tools` scope, and OAuth protected-resource metadata. Authenticated live task read/write smoke is still pending.
  - 2026-06-07: `npm run check:codex-mcp` and `docs/codex-mcp-setup.md` now cover the Codex Desktop client-side setup check, so a missing Planner MCP tool can be diagnosed without printing secrets.
  - 2026-06-07: `npm run check:mcp-readiness` now combines endpoint health and Codex config registration into one read-only report for Codex MCP readiness.
  - 2026-06-07: `npm run setup:codex-mcp` now previews the exact Codex config entry; `--apply` appends only the Planner MCP URL entry, without tokens or headers.
  - 2026-06-06: `/api/captures` now preserves MCP/API origin metadata for `source=mcp...` dry-run and stored capture paths, with contract coverage. Separate live Hetzner MCP capture/write smoke remains required.
  - 2026-06-06: `docs/mcp-live-smoke-checklist.md` now defines the real-client Hetzner MCP smoke path for read-only task list, disposable add-subtask write, web refresh proof, cleanup, and optional dry-run MCP capture origin check.
  - 2026-06-06: `/api/captures` dry-run no longer reads live Firestore tasks by default; response metadata reports whether task context came from `none`, `request`, or explicit `live` read.

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
