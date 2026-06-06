# ADHD Planner Roadmap

Last updated: 2026-06-06

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
- [x] Add a simple Firestore backup / export strategy.
  - 2026-06-06: read-only local JSON export script added; first live export run is still pending.
- [x] Add operation logging for destructive task changes.
  - 2026-06-06: destructive/status-transition events include structured status transition payloads; bulk/delete/snapshot paths already write planner events.

### P1: Telegram as Main Daily Interface

- [x] Add planner web link into Telegram bot replies.
- [x] Add "return from completed to active" from Telegram.
- Live Telegram smoke procedure:
  - 2026-06-06: checklist added in `docs/telegram-live-smoke-checklist.md` for `/help`, `/today`, `/calendar`, `/cemetery`, completed restore, Cemetery confirmation/cancel, and `Open planner` evidence.
- Add "kill / revive" from free text and buttons.
  - 2026-06-05: active-task `Cemetery` button and `/cemetery` restore list are implemented; live Telegram smoke is still needed before closing.
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

### P1: MCP Reliability

- Fix "subtasks via MCP are not set".
- Ensure MCP updates also maintain `lastUpdated`.
- Ensure web merge logic and MCP writes do not conflict.
  - 2026-06-06: local shared server path already sets `lastUpdated` for `TASK_ADD_SUBTASK`; regression coverage was added for the API contract and route-to-command mapping. Separate live MCP verification remains required.

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
