# ADHD Planner Roadmap

Last updated: 2026-04-08

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
- Add a simple Firestore backup / export strategy.
- Add operation logging for destructive task changes.

### P1: Telegram as Main Daily Interface

- Add planner web link into Telegram bot replies.
- Add "return from completed to active" from Telegram.
- Add "kill / revive" from free text and buttons.
- Improve Telegram nudges:
  - investigate why a nudge landed at 09:44 instead of 09:00
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

- add planner website link into Telegram bot
- return completed tasks back to active from Telegram
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
3. Fix "return from completed to active" in Telegram.
4. Fix MCP subtask write path.
5. Decide first version of time tracking schema.
