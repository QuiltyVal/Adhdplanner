# Planner Engine compass

This document is the project compass for backend/product decisions. If implementation notes conflict with this file, prefer this direction unless we explicitly replace it.

## Core direction

ADHD Planner should feel proactive because one Planner Engine decides what changed, writes events, queues delivery, and produces a human report.

The model is:

- snapshot task store;
- append-only planner events;
- delivery outbox;
- report projection;
- web, Telegram, email, and push as adapters.

UI, Telegram, email, and mascot copy should not independently decide what happened. They narrate what the engine recorded.

## Current backend contract

- User actions go through `PlannerCommandService` where possible.
- Time-based maintenance goes through `runPlannerTick`.
- Notifications are queued in outbox.
- Delivery attempts write visible delivery events.
- `Progress` shows both `Planner Report` and raw `Event log`.

## Future: Telegram brain dump

Brain dump should not be web-only.

Target behavior:

- If a user writes a messy Telegram message about life/tasks, the bot can offer to turn it into task cards.
- If a user sends a voice message, Telegram should pass audio to an OpenAI speech-to-text endpoint, then process the transcript as a brain dump.
- The same deterministic Angel Lab pipeline should be reused for web and Telegram.
- The bot should not silently add everything. It should return draft cards or ask for confirmation unless the intent is an explicit simple task add.

Recommended flow:

1. Telegram receives text or voice.
2. Voice is transcribed through OpenAI speech-to-text.
3. Transcript/text is stored as a capture.
4. Shared Angel Lab parser builds draft cards.
5. User confirms what to add.
6. Confirmed actions go through `PlannerCommandService`.

## Future: Web Angel Lab speech

The web Angel Lab should also use OpenAI speech-to-text as the reliable path for recorded audio.

Browser speech recognition can remain as a temporary convenience, but the product-grade path should be:

- record audio in Angel Lab;
- send it to `/api/speech-to-text`;
- receive transcript;
- feed transcript into the existing Angel Lab card pipeline.

## Guardrails

- Do not create separate task extraction logic for Telegram and web.
- Do not auto-apply messy brain dumps without confirmation.
- Do not let delivery channels decide task state.
- Do not let mascot/report copy claim user actions as system actions.
- Do not hide delivery failures from the user or from Progress.

## Agentic layer rules

The planner can use AI as an agent-like layer, but the AI is not the source of truth.

### What the AI layer is allowed to do

- Interpret messy user input as an intent, executive state, or task candidate.
- Suggest the next safe workflow: rescue, brain dump, task creation, task update, or parking pressure.
- Propose one concrete next step for an existing task.
- Explain why a task was selected as a control-restoring task.
- Draft task cards and subtasks for Angel Lab.
- Recommend a command payload for the backend.

### What the AI layer is not allowed to do directly

- Mutate tasks directly from the client or Telegram adapter.
- Delete, bury, complete, or reprioritize tasks without routing through PlannerCommandService.
- Treat a guess as a confirmed user decision.
- Trigger dangerous actions without confirmation.
- Create duplicate task systems or local-only planner state.
- Send notifications directly; notifications must go through outbox.

### Required execution path

```txt
user message / voice / UI action
  -> AI interpretation layer
  -> canonical intent or command proposal
  -> PlannerCommandService
  -> PlannerEngine recompute
  -> event_log
  -> report_items / outbox when needed
  -> fresh bootstrap/client response
```

### Executive state behavior

When the AI detects panic, fog, stuckness, hyperfocus, or normal planning, it should not just answer in text.
It should map the state to a safe planner workflow:

- panic: hide overload, choose one control-restoring task, offer rescue.
- fog: reduce choices, suggest one visible task and one tiny first step.
- stuck: keep the current target, create or choose a microstep, start rescue.
- hyperfocus: protect from overbuilding, suggest a boundary or stopping point.
- normal: allow fuller planning and list navigation.

### Confirmation rules

- Safe suggestions can be shown immediately.
- Task creation from messy input needs user confirmation unless the user gave an explicit command.
- Cemetery, delete forever, bulk parking, and priority changes need clear user intent or confirmation.
- AI may say “I think this is panic mode,” but the backend must still apply only allowed commands.

### Portfolio wording boundary

This is honest to describe as:

- AI-assisted task routing.
- Agent-like workflow logic.
- External executive function layer.
- State-aware planner orchestration.

Do not describe it as a fully autonomous production AI agent unless the system plans multi-step goals, invokes tools independently, verifies results, and continues without user confirmation.

## 2026-05-16 — Angel Lab executive-state assessment

Angel Lab now returns an `executiveAssessment` alongside draft task cards.

The assessment is intentionally a proposal, not a mutation:

- detects likely executive state from messy dump text;
- chooses a control-restoring active task when available;
- suggests one safe next step;
- turns on the existing Executive State Layer in the client;
- does not create, delete, complete, bury, or reprioritize tasks without the existing confirmation/command paths.

This keeps the AI/agent-like layer inside the agreed boundary: interpretation first, PlannerCommandService for actual world changes.
