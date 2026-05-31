# ADHD Planner Project Compass

This document is the product compass for ADHD Planner. If a future design, backend, AI, Telegram, email, or onboarding decision conflicts with this file, pause and resolve the conflict deliberately instead of adding another patch.

## 1. Product promise

ADHD Planner is a proactive planner for stuck brains.

It does not try to make the user manage a perfect task database. It helps the user see one next move, keep stale tasks from poisoning the active list, and feel that the system is alive, fair, and explainable.

The target feeling is:

- a planner with the emotional pull of Duolingo;
- a semi-physical world where tasks move between states;
- one visible next move instead of seventeen competing controls;
- angel/devil mascots that explain what happened without stealing agency from the user;
- a system that feels stable, grounded, and trustworthy.

## 2. Core product model

The app is built around five worlds:

- Focus: tasks that need direct attention now.
- Background: active but not urgent tasks.
- Purgatory: tasks losing momentum or becoming risky.
- Heaven: completed tasks.
- Cemetery: dead, paused, discarded, or auto-buried tasks.

Tasks travel through these worlds. This movement is part of the product, not just a UI filter.

The user should understand:

- active tasks are alive;
- completed tasks still count;
- dead tasks stop poisoning the active list;
- the devil may clean stale tasks, but must explain it;
- the user can undo system moves when needed.

## 3. Non-negotiable principles

### One brain

Planner Engine is the brain.

Web, Telegram, email, onboarding, mascots, and reports are mouths and windows. They do not independently decide what the planner world means.

### User actions and system actions must never be mixed

If the user manually sends a task to Cemetery, the devil must not say “I did it.”

If the engine auto-buries a stale task, the devil may say “I buried it,” because the system performed that action.

### No invisible magic

Important changes must leave a trace:

- event log entry;
- report item when user-facing;
- outbox message when Telegram/email/push should deliver it.

### Stability over cleverness

The user must feel the app is solid. Avoid behavior that makes tasks jump, duplicate, reorder unexpectedly, or change without explanation.

### Rescue is not task management

Rescue means: one task, one microstep, two minutes, one action.

Rescue must not show full task tuning, deadline controls, filters, delete actions, or global dashboards.

### Angel Lab is brain dump, not universal task surgery

Angel Lab should turn messy pain into draft task cards. It may suggest merges, but it must not silently mutate existing tasks on dump save.

Angel Lab voice input should use OpenAI speech recognition as the product default. Browser speech APIs may exist as fallback/debug helpers, but the intended demo and release path is OpenAI-powered transcription so Russian and English brain dumps are handled consistently.

## 4. Backend compass

Recommended architecture:

- snapshot task store;
- append-only event log;
- outbox for reliable Telegram/email/push delivery;
- report projection for “while you were away” and devil reports.

Do not implement full event sourcing in v1.

### Backend services

- PlannerCommandService: one write path for user actions from web, Telegram, and internal UI.
- PlannerEngine: recomputes heat, pulse, zones, mission, rescue suggestion, system transitions, reports, and outbox entries.
- OutboxWorker: delivers Telegram/email/push without making planner decisions.
- ReportProjector: builds stable user-facing reports from events.

### Source of truth

- raw task state: tasks;
- mission/rescue suggestion/global counts: planner_meta;
- audit/history: event_log;
- reliable delivery: outbox;
- user-facing changes since last visit: report_items.

### Phase 1 backend goal

Make the system proactive and auditable without rewriting the whole app:

- all system transitions create events;
- auto-burials create devil report items;
- Telegram/email delivery goes through outbox;
- cron triggers engine, not ad hoc notification logic;
- manual user actions do not produce fake devil claims.

### Phase 2 backend goal

Move all user mutations to PlannerCommandService:

- task create;
- touch / moved;
- complete;
- set today;
- set vital;
- urgency/resistance/deadline changes;
- move to Cemetery;
- rescue start / shift / complete.

## 5. Frontend compass

### Main page structure

The main page should be understandable as:

1. Header: identity, language, score, account/system controls.
2. Planner Status: global state and filters.
3. Today Mission: one chosen task summary.
4. Worlds/Kanban: Focus, Background, Purgatory, Heaven, Cemetery, Progress.
5. Angel Lab: brain dump into draft task cards.
6. Progress/Event Log: history, reports, stats, snapshots.

### Today Mission

Today Mission is a compact summary of the chosen task.

It should show:

- title;
- why this task is selected;
- open step count or first microstep;
- passive chips only when useful;
- clear “click when stuck” behavior.

Clicking Today Mission should open Rescue.

It should not contain global counters, task tuning controls, or dangerous actions.

### Planner Status

Planner Status is the global dashboard/filter layer.

- streak: display/progress;
- actions today: display/progress;
- at risk: filter;
- active: filter;
- today: filter;
- Angel Lab: entry to brain dump.

If an element looks clickable, it must do something obvious.

### Task cards

Collapsed task cards should feel stable and physical.

They should show:

- title;
- next step;
- progress;
- passive state chips;
- main action such as “I moved” or “Done.”

Expanded task cards can show tuning and subtasks, but controls must not overflow or collide.

### Rescue

Rescue should feel like being pulled out of freeze:

- one selected task;
- one microstep;
- soft start / two minutes;
- “I moved”;
- “Done.”

Mascots may comment, but they must not block primary controls.

## 6. Mascot compass

Angel and devil are product characters, not random decoration.

Angel role:

- reduce shame;
- make the next step gentle;
- guide onboarding;
- celebrate real movement;
- help with brain dumps.

Devil role:

- remove stale clutter;
- call out fake aliveness;
- protect the active list;
- report system cleanup;
- add playful pressure without blaming the user.

Rules:

- mascot bubbles must follow the selected app language;
- onboarding should not duplicate mascot icons and mascot bubbles in a confusing way;
- during onboarding, normal idle mascot bubbles should be suppressed;
- mascots should never hide Next, Done, or primary task controls.

## 7. Demo readiness compass

The product is demo-ready when a non-Russian speaker can understand it in 1-2 minutes without verbal explanation.

Required for demo:

- English UI pass for main screens;
- English onboarding that explains the product model, not just buttons;
- demo account with prepared tasks across all worlds;
- stable Today Mission and Rescue flow;
- Angel Lab example that turns a messy dump into draft tasks;
- visible Progress/Event Log with meaningful events;
- Telegram/email examples that look like part of the same product;
- no obvious mobile onboarding overlap;
- no unreadable dark mode task cards.

## 8. What we should not do next

Avoid these until the foundation is stable:

- building a native app before the web/PWA demo is coherent;
- adding more random buttons to solve unclear flows;
- adding more autonomous AI behavior without event log/outbox/report trace;
- making the devil more aggressive before undo/reporting are reliable;
- redesigning screens without preserving existing task actions;
- making Angel Lab mutate tasks without explicit user confirmation.

## 9. Current strategic priorities

1. Backend trust: Planner Engine, events, outbox, reports.
2. Demo clarity: English demo account and onboarding.
3. Interface stability: no jumping, no duplicate actions, no unreadable states.
4. Proactivity: devil reports, login reports, Telegram/email that explain what changed.
5. Polish: mascots, animation, dark mode, mobile layout.

## 10. Decision test

Before adding or changing a feature, ask:

1. Does this make the next move clearer?
2. Does this preserve user trust and agency?
3. Is there one source of truth for this decision?
4. Will this leave an event/report/outbox trace if important?
5. Does this fit the worlds model?
6. Would this make sense to a demo viewer in English?
7. Does it reduce clutter, or just add another control?

If the answer is weak, do not patch around it. Re-think the flow.
