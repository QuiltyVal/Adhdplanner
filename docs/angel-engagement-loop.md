# Angel Engagement Loop

## Product goal

The planner should not behave like a toxic task list that says "do the task" when the user is overwhelmed, waiting on someone else, or avoiding the app.

The loop we are building is:

```txt
Planner Engine notices a reason to invite the user back
-> Outbox sends a gentle Telegram/email/push invitation
-> user opens the app
-> Angel Entry Session appears before the full task list
-> angel offers one emotionally safe action
-> action is logged through PlannerCommandService
```

This is the engagement equivalent of Duolingo, but for executive function: a small character-led re-entry point instead of a guilt-heavy task reminder.

## Non-goals

- Do not create a separate local demo planner.
- Do not bypass PlannerCommandService.
- Do not make Telegram/email decide what the user should do.
- Do not send raw task-list dumps as notifications.
- Do not treat every unfinished task as procrastination.
- Do not auto-delete, auto-complete, or auto-bury user work from this loop.

## Core concepts

### Angel Entry Session

An Angel Entry Session is the screen/state the user lands in after a gentle invite or a login return.

It is not the dashboard. It is a small guided entry into action.

```ts
AngelEntrySession = {
  id: string;
  userId: string;
  trigger:
    | "daily_checkin"
    | "user_was_away"
    | "task_getting_cold"
    | "deadline_near"
    | "important_task_without_step"
    | "not_your_move_checkin_due"
    | "panic_or_stuck_detected"
    | "repeated_resistance";
  mode:
    | "brain_dump"
    | "make_it_smaller"
    | "tiny_focus"
    | "clarify_task"
    | "rescue_me"
    | "not_your_move_checkin"
    | "diagnose_resistance";
  taskId: string | null;
  message: string;
  primaryCta: string;
  secondaryCta?: string;
  source: "engine" | "telegram" | "email" | "push" | "login";
  createdAt: number;
  expiresAt: number;
}
```

### Not Your Move

`Not Your Move` is a task state for external dependency. It means the user is not procrastinating; the next real move depends on someone or something outside the user.

User-facing labels:

- English: `Not your move`
- Russian: `Сейчас не твой ход`

Minimal task metadata:

```ts
task.blocked = {
  status: "not_your_move";
  reason:
    | "waiting_for_person"
    | "waiting_for_organization"
    | "waiting_for_document"
    | "waiting_for_access"
    | "waiting_for_money"
    | "other";
  waitingFor: string;
  lastUserAction: string;
  nextCheckInAt: number | null;
}
```

Rules:

- Do not treat this as active avoidance.
- Do not make it the default Today Mission unless the check-in date is due.
- Do not nudge "finish this today".
- Do allow "check status", "write follow-up", "save evidence", and "set next check-in".
- Do log the state change.
- Do let the user return it to active.

### Rescue-to-waiting recognition

When the user adds a rescue step that clearly means an external wait, for example `waiting for response from Burgerbüro`, the app should not save it as an ordinary actionable step.

Instead, the rescue flow should mark the task as `Not Your Move`, save the waiting context, set a gentle check-in, and stop repeating the same task as immediate Today Mission pressure.

This keeps the companion from misreading external dependency as avoidance or stuckness.

The first implementation uses a safe AI intent classifier through `/api/planner-client-actions` mode `rescue_intent` with a deterministic fallback. The classifier is allowed to return only:

- `not_your_move`
- `ordinary_step`
- `clarify_resistance`
- `unclear`

It cannot execute destructive actions. The frontend still routes any state change through the existing `Not Your Move` command path.

When the classifier returns `not_your_move`, the app opens the existing Not Your Move confirmation flow with the inferred reason and waiting context prefilled. The user still chooses the check-in window before the task state changes.

The waiting recognition now also applies to ordinary subtask entry points, not only the rescue overlay. If the user types a waiting phrase as a new step, the frontend opens the same confirmation flow instead of adding another unactionable subtask.

Once a Not Your Move draft opens, the current mission/companion pressure is quieted locally. After confirmation, backend-provided mission and rescue ids are ignored if they point to a `not_your_move` task, so the same external-dependency quest does not immediately return as Today Mission pressure.

In the task list, `Not Your Move` is now visible as a waiting note that includes the saved `waitingFor` context and a `Back in my hands` action. This makes the state reversible from the task card itself instead of hiding it in reports or logs.

### 2026-05-20 — Progress activity labels are explicit

The Progress panel no longer labels the active-days list as `Task history by day`.

It now says `Quest activity` and explains that the number is days with recorded movement, not task age and not the full event log. The badge now reads as active/movement days instead of a bare `6d`.

This prevents old unresolved tasks from looking like a stuck or stale history widget.

### 2026-05-20 — While-away report owns the active companion voice

When the `While you were away` report is open, the base companion avatar for the same speaker is hidden. If the report uses Angel, the idle Angel is suppressed; if it uses Devil, the idle Devil is suppressed.

This keeps the screen to one active companion voice at a time and prevents the report panel from visually competing with the normal corner mascot.

### 2026-05-20 — Telegram health uses current liveness, not stale dead rows

Telegram `/start` and other inbound Telegram commands now refresh `telegramLastSeenAtMs` even when the original link command is reused through idempotency.

Delivery Health also renders from the normalized delivery status used by the dashboard, so a historical `telegram_chat_unreachable` outbox row no longer wins over newer Telegram liveness. Old failed scheduled sends may still be visible as history, but they should not force the active reconnect warning once Telegram has responded.

### 2026-05-21 — Sticky `too big` starts a shrink-to-step loop

When the user diagnoses a sticky quest as `too big`, the companion no longer just jumps to the task card.

The Angel opens a shrink prompt, asks for one smaller entry point through the existing `clarify_step` action, and only adds the suggested microstep when the user confirms `Start 2-min step`. This keeps AI suggestions non-destructive and keeps the state change on the existing confirmed task-action path.

### 2026-05-21 — Quest relation memory begins

Sticky quest buttons now write a small local `quest relation memory` signal for the task:

- `too_big` -> next strategy `make_it_smaller`;
- `unclear` -> next strategy `clarify_task`;
- `not_my_move` / `still_waiting` -> next strategy `hold_external_dependency`;
- `dismissed` / `not_now` -> next strategy `cool_down`;
- `kill_without_guilt` -> next strategy `confirm_cemetery`.

This is intentionally client-side comfort memory for now. It does not mutate production task data and does not let AI execute actions. It gives the future Quest Director a first explicit model of the user's relationship to a quest instead of treating every unfinished task as a generic reminder problem.

### 2026-05-21 — Today Mission starts using quest relation memory

The Today Mission companion prompt now checks the local relation memory before choosing its primary action:

- remembered `too_big` -> opens the shrink-to-step flow instead of direct rescue;
- remembered `unclear` -> opens clarification before action;
- remembered `not_my_move` / `still_waiting` -> opens the Not Your Move check instead of pushing execution;
- `Not now` on the Today Mission prompt records a `not_now` relation signal.

This is the first Quest Director behavior rule: the same task can produce a different entry flow depending on the user's prior relationship to it.

### 2026-05-21 — One active companion surface

Companion prompts now suppress ordinary Angel/Devil speech bubbles while they are visible. The `While you were away` modal also blocks other companion prompts while open.

This enforces the product rule that Angel/Devil should not stack multiple notification surfaces on top of each other. There can be one active companion voice at a time.

### 2026-05-22 — Repeated `Not now` becomes Sticky Quest diagnosis

The Today Mission companion prompt now treats repeated `Not now` as a relationship signal instead of a simple dismissal.

After the resistance threshold is reached, the normal mission bubble is suppressed and the Sticky Quest diagnosis is allowed to appear immediately for that task. This keeps the planner from repeating the same direct ask when the user has already shown that the direct route is not opening.

The `unclear` Sticky Quest action now enters the clarification loop and asks for one clearer entry point instead of only focusing the task card. `not my move` and `still waiting` also quiet the Sticky Quest bubble before opening or updating the external-dependency flow.

### 2026-05-22 — Clarification options now create an entry point

The Clarify Quest flow now treats a selected foggy reason as input for the micro-step generator instead of merely focusing the task card.

When the user chooses an unclear reason, the app records an `unclear` relation signal for that task, asks for one clearer entry point through the existing `clarify_step` path, and keeps companion prompts quiet briefly while the new step is being started. Confirming the suggested step records the relation signal again before opening the two-minute rescue flow.

The primary Clarify Quest CTA now asks for one suggested step instead of opening the task card. Opening the full task remains available through the explicit `Planner` action.

### 2026-05-22 — Rescue completion becomes relation memory

When the user taps `I moved` inside the rescue/tiny-step overlay, the client now records a `microstep_completed` relation signal for that quest in addition to the existing rescue shift event.

This gives the future Quest Director a positive signal: the task was not merely touched; one safe entry point worked.

`Not now` and `Later` are now relationship signals too. Angel Entry dismissal records `not_now`, Clarify Quest dismissal records `not_now`, and Rescue `Later` records `rescue_later`. These are still client-side comfort signals, not production task mutations.

### 2026-05-22 — Prompt quieting no longer hides active clarification

Companion quieting now suppresses only lower-priority prompts, not the active Clarify/Shrink flow.

This fixes the failure where choosing `unclear` or `too big` from Sticky Quest created a clarification state but immediately hid it behind the quiet timer.

### 2026-05-25 — Shrink flow reuses existing microsteps

The `too big` Sticky Quest path now carries a concrete suggested microstep plus the matching subtask id when the microstep already exists.

Starting the two-minute rescue from this shrink prompt no longer creates a duplicate subtask for the same text. If the suggested step is already an open subtask, Rescue works on that existing step; if the step is new, it is still added only after the user confirms `Start 2-min step`.

### 2026-05-25 — Clarify flow uses the safe suggestion endpoint

### 2026-05-26 — Clarify/Shrink retry avoids repeating the same step

`Make smaller` and `Try another` now remember the currently suggested micro-step inside the local clarification prompt and ask the next suggestion pass to avoid it.

The fallback selector can choose from open subtasks, explicit next actions, panic-plan steps, and generic safe entry points. If the AI clarification endpoint returns the same step again, the client falls back to a different local suggestion instead of showing the duplicate.

This is still client-side comfort memory: no schema migration, no automatic task mutation, and no AI authority over task status.

The `unclear` Sticky Quest path now connects to the existing `clarify_step` backend mode for authenticated users.

This endpoint is intentionally non-destructive: it can suggest one emotionally safe microstep, but it cannot mutate task state, complete tasks, move tasks, or delete anything. The frontend still requires explicit confirmation before adding/starting the suggested step, and falls back to deterministic local suggestions when the user is in demo/guest mode or the API is unavailable.

### 2026-05-25 — Sticky external blockers and cemetery are explicit

The `not my move` Sticky Quest path now lets the user write what exactly is being waited for before choosing the check-in window. This keeps external dependency context visible instead of storing only a vague blocker category.

The `let it die` path remains non-destructive. Confirmation moves the quest to Cemetery, records `kill_without_guilt` relation memory, suppresses immediate mission pressure for that task, and gives the companion prompt a short quiet window so the same quest does not reappear immediately.

### 2026-05-25 — Quest relation memory becomes visible on task cards

Active task cards now receive the local quest relation memory for each task and show a small passive chip when Angel has learned something about the user's relationship to that quest.

Examples:

- `too_big` -> `sticky: too big`;
- `unclear` -> `sticky: unclear`;
- `not_now` / `rescue_later` -> cooldown/pause;
- `microstep_completed` -> movement logged;
- `kill_without_guilt` -> asked to die.

This is deliberately read-only UI. It does not mutate task data, does not change backend contracts, and does not let AI execute actions. The goal is to make the Quest Director feel less invisible: the user can see that the planner remembers friction instead of blindly repeating the same prompt.

## Engagement triggers

The engine may propose an entry session when one of these is true:

| Trigger | Meaning | Good mode |
| --- | --- | --- |
| `daily_checkin` | ordinary daily return | `tiny_focus` |
| `user_was_away` | user has not opened the app recently | `brain_dump` or `tiny_focus` |
| `task_getting_cold` | meaningful task is losing pulse | `make_it_smaller` |
| `deadline_near` | deadline is close or overdue | `rescue_me` |
| `important_task_without_step` | important task has no first step | `clarify_task` |
| `not_your_move_checkin_due` | external dependency check-in is due | `not_your_move_checkin` |
| `panic_or_stuck_detected` | Angel Lab / state layer detects panic or stuckness | `rescue_me` |
| `repeated_resistance` | user repeatedly closed or paused rescue for the same task | `diagnose_resistance` |

## Notification contract

Notifications should invite the user into a session, not dump tasks.

Good pattern:

```txt
character + state + tiny promise + low-pressure CTA
```

Examples:

```txt
Angel found one tiny entry point.
No full planner today. Just one safe step.
```

```txt
This may not be procrastination. It might just be not your move.
Want me to hold the context?
```

Bad pattern:

```txt
You have 7 tasks due today.
```

```txt
Finish Bürgergeld now.
```

## Integration points

### Planner Engine

Planner Engine should decide whether an entry session should exist. It should use existing derived state:

- mission task;
- rescue suggestion;
- stale/cold tasks;
- deadline pressure;
- tasks without steps;
- last login / last action;
- `not_your_move` check-in dates.

### PlannerCommandService

All user actions from an entry session must go through canonical commands.

Potential commands:

```txt
SET_EXECUTIVE_STATE
START_ANGEL_ENTRY_SESSION
ACK_ANGEL_ENTRY_SESSION
TASK_MARK_NOT_YOUR_MOVE
TASK_CLEAR_NOT_YOUR_MOVE
TASK_SET_CHECKIN
TASK_ADD_FOLLOWUP_STEP
RESCUE_START
RESCUE_SHIFT_RECORDED
RESCUE_CLOSED_LATER
RESCUE_ABORTED
```

### Outbox

Outbox rows for this loop should include semantic dedupe:

```ts
dedupe_key =
  `angel-entry:${userId}:${trigger}:${taskId || "none"}:${dayBucket}`
```

This prevents Telegram/email double sends.

### Report items

Report items should narrate meaningful state, not every delivery.

Good report items:

- `Angel invited you back with one safe step.`
- `Marked Bürgergeld as Not your move. Waiting for Jobcenter.`
- `Check-in due: Bürgergeld has been waiting 3 days.`

Usually hidden from report:

- delivery attempted;
- delivery sent;
- outbox drain internals.

## MVP phases

### Phase 1: Contract and display

- Document the loop.
- Add backend constants/types/helpers where safe.
- Add a basic `Angel Entry Session` projection object to bootstrap if the engine can build one without mutation.
- Display one entry card on login when available.

Phase 1 helper added:

- `api/_lib/planner-angel-engagement-contract.js`
- exports trigger/mode/source constants;
- exports `buildAngelEntrySession(...)`;
- exports `buildAngelEntryDedupeKey(...)`;
- exports `normalizeNotYourMoveMetadata(...)`;
- exports `isTaskNotYourMove(...)`.

This helper is intentionally low-risk: it does not mutate data, send notifications, or change current UI behavior by itself.

Phase 1 selector added:

- `api/_lib/planner-angel-entry-selector.js`
- exports `selectAngelEntrySessionCandidate(...)`;
- chooses a non-mutating Angel Entry Session candidate from existing task snapshots;
- priority order: due `Not your move` check-in, deadline pressure, important task without a step, cold active task, daily check-in fallback.

The selector is not wired into bootstrap/outbox yet. It exists so the engine, Telegram, email, and UI can later share one candidate-selection contract instead of each guessing differently.

Phase 1 copy helper added:

- `api/_lib/planner-angel-engagement-copy.js`
- exports `buildAngelEntryNotificationCopy(...)`;
- converts an Angel Entry Session candidate into gentle notification copy;
- keeps notification language focused on re-entry, check-in, rescue, and "not your move" context instead of task-list pressure.

The helper is not wired into delivery yet. It gives Telegram/email/push a shared wording contract before any channel starts sending engagement sessions.

Phase 1 outbox payload builder added:

- `api/_lib/planner-angel-engagement-outbox.js`
- exports `buildAngelEntryOutboxPayload(...)`;
- converts an Angel Entry Session into Telegram/email outbox payloads;
- uses semantic delivery dedupe keys based on user, trigger, task, and day bucket;
- returns `null` when the requested channel has no configured destination.

The builder is not called by the engine yet. It only defines the delivery contract so future wiring can be done without duplicating message shapes.

Phase 1 command/event vocabulary added:

- command types: `TASK_MARK_NOT_YOUR_MOVE`, `TASK_CLEAR_NOT_YOUR_MOVE`, `TASK_SET_CHECKIN`;
- action types: `mark_not_your_move`, `clear_not_your_move`, `set_checkin`;
- event types: `TASK_MARKED_NOT_YOUR_MOVE`, `TASK_CLEARED_NOT_YOUR_MOVE`, `TASK_CHECKIN_SET`;
- event/report wording for these future transitions.

These are vocabulary-only changes for now. They make the future implementation explicit without wiring new UI actions or mutating production data.

Phase 1 engine-rule helper added:

- `api/_lib/planner-not-your-move-rules.js`;
- exports read-only helpers for check-in due state, mission-pressure suppression, auto-cemetery suppression, allowed actions, and forbidden nudges;
- gives the Planner Engine one future rule boundary for external-dependency tasks.

The helper is not wired into mission, death rules, or notifications yet. It defines how those systems should treat `Not your move` before live behavior changes.

### Phase 2: Not Your Move

- Add a task action that marks external dependency metadata.
- Exclude `not_your_move` tasks from aggressive stale/death pressure.
- Add check-in reminder logic.
- Add report narration.

### Phase 3: Delivery

- Convert daily Telegram/email nudges to session invitations.
- Add dedupe keys specific to engagement sessions.
- Keep delivery decisions in Planner Engine, not in Telegram/email renderers.

### Phase 4: Angel Lab bridge

- Let Angel Lab detect "I can't because I am waiting for..." as `not_your_move`.
- Let Angel Lab suggest a follow-up step instead of adding execution pressure.

## Portfolio positioning

Strong one-liners:

```txt
Not every unfinished task is procrastination. Sometimes it is just not your move.
```

```txt
A planner that turns avoidance into a tiny guided session.
```

```txt
An external executive-function companion that brings the user back with one safe next step instead of a guilt-heavy task list.
```

## First safe wiring order

Do not wire all channels at once. The safe sequence is:

1. Bootstrap-only projection

   Return at most one `angelEntrySession` candidate from planner bootstrap. Do not enqueue delivery yet.

2. UI display behind existing surface

   Show the candidate as an entry card only after bootstrap. It should be dismissible and should not block current task actions.

3. Report-only audit

   When the user acts on or dismisses the session, write a visible report item. Do not send Telegram/email yet.

4. Telegram pilot

   Enqueue Telegram only for `daily_checkin` or `task_getting_cold`, with one semantic dedupe key per user/trigger/task/day.

5. Email pilot

   Add email only after Telegram proves non-spammy.

6. Push later

   Push notifications are the last channel because they are easiest to make annoying.

## Live behavior acceptance checklist

Before any delivery wiring is considered stable:

- A user should not receive more than one Angel Entry invite for the same trigger/task/day.
- A `Not your move` task should not be buried only because it got stale.
- A `Not your move` task should not become Today Mission unless its check-in is due.
- A notification should invite the user into a small session, not list all tasks.
- Opening the app from an invite should show one entry session before the full task list.
- Dismissing a session should not immediately recreate the same session in the same app visit.
- Telegram/email delivery events should not appear as noisy user-facing report items.
- User actions from the session must go through PlannerCommandService.

## Bootstrap projection guard

Added `api/_lib/planner-angel-entry-bootstrap-contract.js`.

This helper defines the first safe UI-facing projection boundary:

- builds at most one compact `angelEntrySession` for bootstrap;
- strips the session to UI-safe fields;
- gates session creation by "away time" so a daily fallback does not appear on every refresh;
- uses a default minimum gap of 18 hours since last login/entry.

This is still not wired into live bootstrap. It exists to avoid the exact failure mode we already saw with `While you were away`: a good feature turning into a panel that appears too often.

## Bootstrap projection wired

`buildPlannerBootstrapPayload(...)` now includes:

```ts
angel_entry_session: AngelEntryBootstrap | null
```

This is projection-only. It does not mutate tasks, write report items, enqueue outbox rows, or show UI by itself. The frontend can ignore it until we deliberately add the entry card.

The current gate is intentionally conservative: one candidate after the away-time rule, no delivery.

## Frontend adapter carries projection

`src/plannerClientStateAdapter.js` now preserves `angel_entry_session` as `angelEntrySession` in the normalized client update object.

This still does not render anything and does not change user behavior. It only makes the projection reachable to a future UI card without reparsing raw bootstrap payloads.

## Contract status visibility

Planner Engine contract status now includes an `angel_entry_projection` layer.

This lets the Progress/debug panel show whether bootstrap produced an Angel Entry candidate without turning the candidate into UI or delivery behavior yet.

Health snapshot now also carries a compact `angelEntry` diagnostic when a candidate exists. This keeps debug visibility separate from user-facing UI.

## Report narration helper

Added `api/_lib/planner-angel-entry-report-specs.js`.

This pure helper defines how Angel Entry Sessions should be narrated in Planner Report once the UI starts showing/acting/dismissing them:

- `created` / prepared session;
- `acted` session;
- `dismissed` session;
- `not_your_move_checkin_due`;
- `task_getting_cold`.

The helper is not wired yet. It exists so the future report layer talks about entry sessions as gentle re-entry, not as delivery/debug noise.

## Current implementation boundary

Status: contract/projection foundation, not a finished user-facing feature.

Built safely so far:
- Angel Entry Session domain contract and session shape.
- Not Your Move task metadata contract.
- Pure selector for one Angel Entry candidate.
- Pure copy helper for future Telegram/email/push invites.
- Pure outbox payload builder for future delivery integration.
- Command/event/report vocabulary for Not Your Move and check-ins.
- Read-only Not Your Move engine rules.
- Bootstrap projection contract gated by away-time.
- Frontend response adapter can carry `angelEntrySession` without rendering it yet.
- Planner health/contract diagnostics can expose the Angel Entry projection.

Not built yet:
- Visible Angel Entry Session UI.
- Real Not Your Move buttons or task editor controls.
- TASK_MARK_NOT_YOUR_MOVE now has a minimal web confirmation path from sticky diagnosis: the user chooses the blocker category and a gentle check-in window (tomorrow / 3 days / 1 week). The command writes `task.blocked.status = not_your_move`, clears today pressure, and stores `nextCheckInAt` so the Angel Entry selector can later surface a check-in instead of repeating execution pressure.
- Report item writes for Angel Entry actions.
- Telegram/email/push enqueue for Angel Entry invites.
- Dismiss/ack behavior for Angel Entry sessions.
- Localization quality for final notification copy.

Next gate before live product behavior:
1. Run a build/check with permission.
2. Add one visible but dismissible Angel Entry card behind existing bootstrap data.
3. Add Not Your Move as a reversible task action through PlannerCommandService.
4. Only after that wire Telegram/email invites through outbox with dedupe.

## Angel Entry dismiss / ack contract

Purpose: Angel Entry must not become another `While you were away` spam source.

Rule:
- If the user dismisses an Angel Entry session, suppress the same semantic entry for a short window.
- If the user acts on it, suppress the same semantic entry longer.
- If the user defers it, treat it as a gentle action, not a failure.
- If the user opens the full planner, do not immediately recreate the same rescue card.

Recommended ack actions:
- `dismissed`: user closed the session; suppress for 6 hours.
- `acted`: user started rescue, made task smaller, or created a follow-up; suppress for 18 hours.
- `deferred`: user chose not now / park pressure; suppress for 18 hours.
- `opened_full_planner`: user chose to see the normal planner; suppress for 6 hours.

Storage shape:

```ts
AngelEntryAck = {
  contractVersion: "angel_entry_ack_v1";
  ackKey: string;
  sessionId: string | null;
  userId: string | null;
  taskId: string | null;
  trigger: string | null;
  mode: string | null;
  action: "dismissed" | "acted" | "deferred" | "opened_full_planner";
  note: string | null;
  createdAt: number;
  suppressUntil: number;
}
```

Implementation note:
- A pure helper exists at `api/_lib/planner-angel-entry-ack-contract.js`.
- It is not wired into bootstrap or storage yet.
- Next safe step is to use this helper before returning an Angel Entry bootstrap projection.

## Ack storage and bootstrap wiring plan

Do not wire Angel Entry delivery before suppression is stored and read consistently.

Recommended minimal storage:

```ts
planner_meta.angel_entry_ack = {
  contractVersion: "angel_entry_ack_v1";
  ackKey: string;
  sessionId: string | null;
  trigger: string | null;
  mode: string | null;
  taskId: string | null;
  action: "dismissed" | "acted" | "deferred" | "opened_full_planner";
  createdAt: number;
  suppressUntil: number;
}
```

Bootstrap rule:
1. Build candidate session from current planner state.
2. Read latest `planner_meta.angel_entry_ack`.
3. If ack matches the candidate semantic key and `suppressUntil > now`, return no Angel Entry session.
4. Otherwise return the candidate.

Command rule:
- UI dismissal/action should go through PlannerCommandService, not direct client writes.
- The command should write the ack record and a hidden or low-noise event.
- Report items should only be created for meaningful actions, not for every dismissal.

Delivery rule:
- Telegram/email/push must check the same ack/suppression state before enqueueing.
- Delivery dedupe and session ack are separate protections: dedupe prevents duplicate sends; ack respects user intent.

## Bootstrap suppression wiring target

Next code-level step: the bootstrap projection should read the latest Angel Entry ack and suppress the same semantic session while the ack window is active.

Expected behavior:
- No ack: bootstrap may return an Angel Entry candidate when the away-time gate allows it.
- Matching active ack: bootstrap returns `null` for `angel_entry_session`.
- Expired ack: bootstrap may return a fresh candidate again.
- Non-matching ack: bootstrap may return a different candidate.

This keeps Angel Entry from repeating the same invitation after the user already dismissed, deferred, or acted on it.

## First visible Angel Entry surface

Implemented a first low-risk frontend surface for `planner_meta.angel_entry_session`.

Behavior:
- If bootstrap returns a visible Angel Entry session, the app renders a small Angel Entry card above the Executive State layer.
- The card does not enqueue notifications.
- The card does not write an ack record to backend yet.
- Dismiss is local for the current page session.
- Start maps the backend session mode to an Executive State mode and opens a safe entry:
  - `brain_dump` -> fog
  - `make_it_smaller` -> stuck
  - `clarify_task` -> stuck
  - `rescue_me` -> stuck
  - `tiny_focus` -> normal
  - `not_your_move_checkin` -> normal
- If the session points to a task and the target mode is rescue-first, the existing rescue flow opens for that task.

This is intentionally a UI pilot only. Backend ack persistence should come before Telegram/email engagement delivery.

## Manual preview flag

Added a safe manual preview path for the first Angel Entry UI pilot.

URL:
- `/main?angelEntry=1`
- `/demo?angelEntry=1`

Behavior:
- If backend returns a real `angel_entry_session`, the UI uses the backend session.
- If backend returns no session and the URL flag is present, the UI creates a local preview session from the current rescue/default task.
- The preview session does not write backend data, does not enqueue notifications, and does not affect production engagement logic.

Why:
- The backend away-time gate is intentionally conservative.
- The preview flag lets us test the surface without weakening production anti-spam rules.

## Rollback point before Companion Surface experiment

Before starting the Companion Surface experiment, create a local rollback archive of the current project state.

Reason:
- The user wants the final interaction to feel cozy and engaging.
- The current Angel Entry / Executive State pilot works as a test surface, but visually it can overload the UI.
- The next experiment should be reversible.

Target UX direction:
- Angel and devil become the mouth of the Planner Engine.
- Engine decisions should appear as compact companion prompts near the mascots, not as another large dashboard panel.
- Angel handles entry, rescue, not-your-move, and gentle focus.
- Devil handles cleanup, stale-task honesty, pressure reduction, and cemetery/purgatory narration.

## Companion Surface pilot

Started replacing large Angel Entry panels with a compact Companion Prompt.

Behavior:
- `?angelEntry=1` now surfaces the Angel Entry through the bottom angel companion bubble by default.
- The large Angel Entry panel is hidden unless `?angelEntryPanel=1` is also present.
- The companion prompt uses the same Start / Not now / Planner handlers as the panel.
- This keeps the Planner Engine concept visible through angel/devil characters instead of adding another dashboard block.

Rollback:
- Local rollback archive exists in `../planner-rollbacks/adhdplanner-before-companion-surface-20260516-172248.tgz`.
### 2026-05-17 — Sticky quest diagnosis can use a free LLM as suggestion-only layer

Repeated rescue dismissals can now produce a `diagnose_resistance` Angel Entry session with non-destructive diagnosis options.

Safety boundary:

- The LLM only suggests button labels such as "too big", "unclear", "not my move", or "let it die".
- Clicking a diagnosis option does not move, delete, complete, schedule, or mutate the task.
- The UI focuses the task/tuning area and logs the selected diagnosis locally.
- If the free model lookup or OpenRouter request fails, the planner falls back to deterministic safe options.

Implementation notes:

- `api/_lib/planner-sticky-diagnosis.js` fetches the current recommended free OpenRouter model from `https://shir-man.com/api/free-llm/top-models`.
- The helper uses the existing server-side OpenRouter adapter and returns compact JSON only.
- `DISABLE_FREE_LLM_STICKY_DIAGNOSIS=true` disables the LLM path and keeps fallback options.
- This is intentionally not a mutation path. Future task changes from diagnosis must go through explicit user confirmation and `PlannerCommandService`.

Follow-up fix: repeated-resistance sticky sessions bypass the normal away-time gate. The 18-hour away gate still protects generic Angel Entry sessions, but a task that just collected enough `Later` / rescue-close signals can surface immediately for diagnosis.

### 2026-05-17 — Sticky diagnosis options start safe next flows

Sticky diagnosis options now respect the current UI language and start bounded next flows:

- `too_big` / `слишком большое` marks resistance high and opens task tuning.
- `unclear` / `непонятно` opens task tuning without changing task status.
- `not_my_move` / `не мой ход` opens a confirm flow that records the external blocker and the next gentle check-in date.
- `let it die` / `пусть умрёт` requires a second click inside a short confirmation window before moving the task to Cemetery.

The backend prompt also receives the UI language from bootstrap, so fallback/model labels no longer have to follow the task title language.

### 2026-05-17 — Not Your Move visible state

`Not Your Move` is now visible on active task cards as a waiting/check-in state rather than a hidden backend flag. Cards show the next check-in date and a reversible `Back in my hands` action wired to `TASK_CLEAR_NOT_YOUR_MOVE`.

Frontend mission/rescue selection ignores `Not Your Move` tasks, so they stay visible in Active without being repeatedly chosen as execution pressure.

Due `Not Your Move` Angel Entry sessions now render as gentle check-ins. The user can choose `still waiting` to move the check-in forward by 3 days, or `back in my hands` to clear the waiting state and return the task to normal mission eligibility.

Manual preview: `?angelEntryPanel=1&notYourMoveCheckin=1` opens the waiting-task check-in UI without waiting for a real due date, using an existing Not Your Move task when available or the first active task as a preview target.

### 2026-05-17 — Angel Entry not-now cooldown

Angel Entry dismissals now keep a small local cooldown so the same sticky quest or waiting check-in does not immediately reappear after the user says `Not now`.

Behavior:

- Sticky/resistance prompts cool down locally for 4 hours after dismissal.
- Not Your Move check-ins cool down locally for 12 hours after dismissal.
- Opening the full planner from the prompt cools the same prompt down for 2 hours.
- Manual preview URLs skip the cooldown so testing remains repeatable.

This is intentionally a browser comfort guard, not a backend task mutation. It does not change task status, enqueue notifications, or affect production data.

### 2026-05-17 — Companion idle-life asset hooks

The bottom angel/devil companions now support a lightweight idle-life layer on startup.

Behavior:

- The browser picks one angel idle activity and one devil idle activity per session.
- Angel and devil are never assigned the same activity at the same time.
- Active prompts, drag/drop hover, chat, and flash messages mute the idle layer so product actions stay clear.
- Missing image files fall back to the existing quiet angel/devil images.

Expected optional asset paths:

- `/mascots/idle/angel_cassette.png`
- `/mascots/idle/devil_cassette.png`
- `/mascots/idle/angel_book.png`
- `/mascots/idle/devil_book.png`
- `/mascots/idle/angel_noodles.png`
- `/mascots/idle/devil_noodles.png`
- `/mascots/idle/angel_nintendo.png`
- `/mascots/idle/devil_nintendo.png`
- `/mascots/idle/angel_nap.png`
- `/mascots/idle/devil_nap.png`
- `/mascots/idle/angel_quest_cards.png`
- `/mascots/idle/devil_quest_cards.png`

Follow-up implementation note:

- Generated mascot files can include fake checkerboard transparency baked into the pixels.
- `scripts/clean-idle-mascot-backgrounds.py` removes the light checkerboard border/background and writes safe copies to `/mascots/idle-cleaned/`.
- The live companion layer now reads from `/mascots/idle-cleaned/` for the assets that passed cleanup.
- Original generated files stay in `/mascots/idle/` and are not overwritten.
- The Sony/PS angel image is intentionally not connected yet because it still has a visible square background.

Update:

- The cleaned Sony/PS angel and nap scenes are now connected.
- Idle scene pairs are no longer pinned in `sessionStorage`; a page reload can pick a new pair.
- Companion speech bubbles no longer force the mascots back to standard idle images.
- If the page stays open, idle scenes rotate every 8 minutes while preserving the "not the same activity at the same time" rule.

### 2026-05-17 — Not Your Move excluded from Angel pressure selectors

Backend Angel Entry selection now keeps `Not Your Move` tasks out of normal pressure prompts.

Behavior:

- `Not Your Move` tasks can still produce the dedicated gentle check-in when their `nextCheckInAt` is due.
- They no longer qualify for deadline-near Angel Entry prompts.
- They no longer qualify for important-without-step Angel Entry prompts.
- Sticky/cold selection was already excluding them.

This keeps waiting tasks visible but prevents the angel from treating them as execution pressure.

Follow-up backend hardening:

- Planner Engine mission selection now excludes `Not Your Move` tasks while they are still waiting.
- Planner Engine rescue selection now excludes `Not Your Move` tasks while they are still waiting.
- At-risk/cold-task cleanup now excludes `Not Your Move` tasks from auto-cemetery staleness pressure.

This extends the same waiting-state rule beyond Angel Entry into the core mission/rescue projections.

Correction:

- `Not Your Move` tasks are now excluded from mission/rescue pressure even when their check-in is due.
- A due check-in should surface through the dedicated gentle check-in session, not by becoming a normal mission/rescue target again.

### 2026-05-17 — Local Angel Entry resistance memory

Angel Entry now remembers repeated `Not now` dismissals per task in browser-local storage.

Behavior:

- The first dismissal just cools the prompt down.
- After 2 dismissals for the same task, the next Angel Entry for that task becomes `diagnose_resistance`.
- The diagnosis prompt asks where the quest is sticky instead of repeating the same entry pressure.
- Starting the entry or choosing any diagnosis option clears the local resistance count.
- Opening the full planner from the prompt also clears the local resistance count, because it is engagement rather than refusal.
- Manual preview sessions and Not Your Move check-ins are excluded from this memory.

This is intentionally local comfort memory only. It does not change task status, write production data, or let the model mutate tasks without confirmation.

Follow-up behavior:

- The first `let it die` / `пусть умрёт` click now only arms the confirmation and shows explicit copy.
- The task is moved to Cemetery only on the second click inside the short confirmation window.
- The first click no longer opens unrelated task tuning, so the destructive path stays clear and reversible until confirmation.

### 2026-05-17 — Onboarding keeps working mascots

Idle-life mascot scenes are disabled while onboarding is active.

### 2026-05-18 — Rescue overlay keeps the explicit selected quest

Fixed a UI consistency bug where Rescue could show a different task than the one the user clicked.

Behavior:

- Today Mission is now the first fallback for local rescue entry.
- When Rescue is opened with an explicit `panicTaskId`, the overlay resolves that exact task by string-normalized id.
- If that exact task cannot be found, Rescue does not silently fall back to another backend rescue candidate.

This prevents the "shown quest != opened quest" feeling when Today Mission, Angel Entry, and backend rescue projections all have different candidates.

### 2026-05-18 — Angel Entry does not compete with Today Mission

The companion bubble now suppresses ordinary Angel Entry sessions when they point to a different task than the visible Today Mission.

Allowed exceptions:

- manual preview flags;
- explicit Angel Entry panel mode;
- `Not Your Move` check-ins.

This keeps Angel Entry from creating a second unrelated quest prompt while the main screen is already asking the user to enter one clear mission.

### 2026-05-18 — Angel voice starts moving into the companion bubble

First UI rule for the game/HUD direction:

- Today Mission keeps the quest data: title, chips, deadline, status, and clickable entry.
- The angel's explanation for the selected mission now appears as a single companion bubble above the angel.
- The mission bubble uses the same companion prompt channel as Angel Entry, so only one angel prompt is active.
- `Not now` hides the mission bubble for that exact mission task in the current session, allowing idle mascot scenes to return.
- If the Today Mission task changes, a new mission bubble may appear.

This is the first step toward `angel voice lives in angel bubble`; cards should show the world/quest data, while the character speaks through the character surface.

### 2026-05-18 — Today Mission gets resistance memory

Today Mission now writes into the same local resistance memory as Angel Entry.

Behavior:

- First `Not now` on a mission bubble cools the prompt down.
- Repeated `Not now` on the same quest is treated as resistance, not as a reason to repeat the same demand.
- After the resistance threshold, the next entry shows a `Sticky quest` diagnosis prompt instead of another `Today Mission -> Start rescue` prompt.
- Starting rescue or opening the planner clears the local resistance memory for that mission task.

This is intentionally local comfort memory, not task data mutation. It prevents the companion from sounding like a dumb reminder loop while keeping destructive/state-changing actions behind existing command paths.

Temporary QA flags, remove before public:

- `?resetAngelMemory=1` clears only local companion comfort memory: Angel Entry cooldowns, Angel Entry resistance, and mission bubble cooldowns.
- `?stickyMission=1` forces the current Today Mission into the Sticky Quest diagnosis prompt for manual testing.

These flags do not mutate tasks or backend data.

### 2026-05-19 — Sticky unclear starts clarification flow

Choosing `unclear` in a Sticky Quest no longer ends by only opening the task.

Behavior:

- Angel opens a `Unclear quest` companion bubble for the same task.
- The bubble asks what is unclear: where to start, first step, too many options, unclear done-state, or AI step suggestion.
- Non-AI clarification choices record the foggy area and focus the task for tuning.
- `Angel suggests step` calls the existing `/api/planner-client-actions` contract with mode `clarify_step`.
- The model returns only one suggested microstep. It does not mutate task data.
- The user must press `Add this step` before the step is added through the existing subtask command path.

This keeps `unclear` inside the companion loop instead of dropping the user back into the list without guidance.

### 2026-05-19 — Clarification prompt owns the companion bubble

When `unclear` opens the clarification flow, the sticky/mission prompt is temporarily suppressed.

Behavior:

- only one angel prompt owns the bubble at a time;
- `Unclear quest` has its own prompt key, so it cannot visually inherit stale Sticky Quest text;
- AI step suggestions stay non-destructive until the user presses `Add this step`;
- exiting clarification returns the app to the normal companion prompt queue.

This fixes the mixed state where a Sticky Quest message could keep rendering while clarification options were already active.

### 2026-05-19 — Clarified step opens rescue directly

When the user accepts an AI-suggested clarification step, the app now opens rescue with that exact step as the current `stepOverride`.

Behavior:

- the suggested microstep is still added through the existing subtask path;
- the old unfinished task step is not falsely marked done;
- the rescue screen starts with the new clarified step immediately;
- completing movement in rescue remains the user-confirmed signal.

This avoids the confusing state where Angel suggests a new safer entry point, but rescue still shows the old first unfinished step.

### 2026-05-19 — Rescue can complete the current tiny step

The rescue action now means more than a vague movement signal when the current rescue step matches a task subtask.

Behavior:

- AI-clarified steps get a temporary client subtask id when added optimistically;
- rescue remembers that subtask id as the current step target;
- pressing `I did this step` completes that matching subtask if it is still open;
- if no matching subtask is found, rescue still records a safe movement signal without mutating unrelated steps.

This makes the tiny-step window behave like a real quest action while avoiding accidental completion of the wrong task step.

### 2026-05-19 — Rescue step completion waits for cloud reconciliation

Cloud task updates can briefly race the rescue overlay: the user may accept an AI microstep and press completion before the newly added subtask is visible in the current task snapshot.

Behavior:

- rescue first tries to complete the current step by remembered subtask id;
- if that id is not present yet, it matches by exact normalized step text in the latest task snapshot;
- if the subtask still has not arrived, it stores a short pending completion signal;
- when the task snapshot updates, the matching open subtask is completed automatically;
- the pending signal expires after two minutes to avoid stale accidental completion.

The companion bubble also now has an explicit `Hide` close button, routed through the same dismiss/cooldown path as `Not now`.

### 2026-05-19 — Rescue does not toggle temporary optimistic subtask ids

AI clarification can create an optimistic subtask id before the backend assigns the real stored id.

Behavior:

- rescue no longer sends `toggle_subtask` for temporary ids such as `clarify-*` or `optimistic-*`;
- if the current rescue step only exists under a temporary id, completion is deferred;
- once the backend snapshot returns the same step with a stable id, the pending completion toggles that stored subtask;
- this prevents the backend from rejecting or rolling back a completion because it received a client-only subtask id.

### 2026-05-19 — Public demo starts from onboarding

The public `/demo` route is now treated as a portfolio/resume demo entrypoint, not as a remembered app session.

Behavior:

- `/demo` reseeds the demo planner state on page load;
- `/demo` always opens the onboarding overlay first;
- closing onboarding on `/demo` does not write the `onboarding_seen` flag;
- QA links such as `/main?demo=1` still keep their existing manual test behavior;
- `/demo?preserveDemo=1` can be used if a preserved demo state is needed.

This makes the resume link deterministic for first impressions.

### 2026-05-19 — Public demo onboarding is clearly labeled

The first onboarding screen in demo mode now labels itself as an interactive portfolio demo.

Behavior:

- demo onboarding starts from step one every time it opens;
- the first screen says the app is using safe demo data;
- the note clarifies that trying the flow does not touch a real user account.
- the first screen gives a concrete "try first" path: enter planner, click Today Mission, start Rescue, complete one tiny step.

This makes the resume link safer for recruiters and hiring managers who may hesitate to click around an unfamiliar planner.

### 2026-05-19 — Public demo points to the first in-app action

After onboarding, the public demo needs to guide a recruiter into the core product loop without making them hunt.

Behavior:

- in demo mode, the Today Mission CTA says `start here · open rescue`;
- the CTA uses a stronger demo-guide visual state;
- non-demo users keep the ordinary `tap when stuck` language.

This keeps the public demo focused on the intended one-minute path: Today Mission -> Rescue -> complete one tiny step.

### 2026-05-19 — Public demo exits onboarding onto Today Mission

Closing onboarding in the public `/demo` route now returns the user to the active planner view and scrolls the Today Mission into focus.

Behavior:

- demo onboarding close switches back to the Active tab;
- the app clears active filters;
- the page scrolls to the Today Mission card;
- the nudge line tells the visitor to click Today Mission to open Rescue.

This prevents the portfolio demo from ending onboarding on a lower explanatory section and leaving the visitor unsure where to start.

### 2026-05-20 — Public demo confirms the core loop

After a visitor completes a rescue tiny step in `/demo`, the app now explicitly labels the completed flow.

Behavior:

- public demo completion says: `Today Mission -> Rescue -> one tiny step`;
- ordinary user sessions keep the softer momentum message;
- no task lifecycle or backend contract changes are introduced.

This helps recruiters understand that the short interaction they just completed is the core product mechanic, not just a random task action.

### 2026-05-20 — Demo mode stays labeled inside the app

The public demo now keeps a small safe-data badge visible in the planner header after onboarding closes.

Behavior:

- demo mode header shows `Demo data · Safe to click`;
- the badge is informational, not an action;
- regular user sessions do not show it.

This reduces hesitation for visitors who want to click through the demo but may worry they are changing a real account.

### 2026-05-20 — Demo onboarding starts as a readable intro card

The first public demo onboarding step no longer highlights the planner header.

Instead, it opens as a centered intro card with opaque background, the angel preview, the portfolio-demo label, and the product explanation. Later onboarding steps still use targeted highlights.

This prevents the demo from starting with a red spotlight around the header and a low-contrast modal that competes with the app content underneath.

### 2026-05-19 — Rescue completion creates a short quiet period

After the user completes a rescue step, the companion prompt queue now pauses briefly instead of immediately surfacing another Sticky Quest or mission prompt.

Behavior:

- pressing `I did this step` starts a three-minute local quiet period;
- ordinary companion prompts are suppressed during that pause;
- task data is not changed by the quiet period;
- the pause resets automatically and does not persist across long sessions.

This keeps the planner from feeling like it punishes progress by instantly handing the user another demand.

### 2026-05-18 — While-away report enters through the companion bubble

The login `While you were away` report no longer auto-opens as a competing modal.

Behavior:

- unread report data still comes from `reportItems`;
- the compact report summary appears as one companion bubble;
- the bubble primary action opens the existing full report modal;
- `Got it` acknowledges/dismisses the report through the same report ACK path;
- `Progress` acknowledges the report and opens the Progress screen;
- the full report modal still exists, but it is user-opened instead of auto-competing with the main screen.

This keeps the report contract intact while moving another "voice" into the companion surface.

Reason:

- Onboarding needs the helpers in their clear "working" state.
- Cozy idle scenes are for the main app loop, not first-run guidance.
- This keeps onboarding from showing sleeping/eating/gaming companions when the user needs orientation.

### 2026-05-20 — Progress movement labels no longer pretend to be task age

The Progress activity list now treats recorded movement separately from task age.

Behavior:

- the section is labeled as quest movement, not task history;
- the compact badge says tracked movement days instead of a bare `6d`;
- task age is shown separately only when a reliable creation timestamp exists;
- old tasks with newer movement tracking no longer look like they were created recently.

Reason:

- `activeDays` can start later than the real task creation date;
- older/imported tasks may not have reliable IDs as creation timestamps;
- showing one bare day count made the Progress screen look stale or dishonest.

### 2026-05-20 — Telegram unreachable gets a human reconnect card

Delivery Health now surfaces a dedicated recovery card when Telegram delivery dies with `telegram_chat_unreachable`.

Behavior:

- the card explains that Telegram needs to be reconnected;
- the user is told to open the planner bot, unblock it if needed, and send `/start`;
- after reconnecting, the existing manual engine/outbox buttons remain the recovery path;
- no bot token or secret handling changed.

Reason:

- a bot cannot message a chat that Telegram marks unavailable;
- the repair action is user-side relinking, not backend retrying forever;
- the previous red diagnostic text was technically correct but not actionable enough.

### 2026-05-20 — Manual debug runs show their result inline

The Progress `Debug runs` controls now show the latest manual action result directly under the buttons.

Behavior:

- clicking `Run engine now`, `Drain outbox now`, or `Self-test` immediately shows a running state;
- the finished state remains visible with status, timestamp, and a compact stats summary;
- failures are shown in the same card instead of only as a short transient nudge.

Reason:

- users need to know what happened after pressing a backend maintenance button;
- the previous UI updated internal health/debug lists but did not make the immediate result obvious.

### 2026-05-20 — Telegram linked state is separated from old delivery failures

Telegram health now distinguishes a working bot chat from an old scheduled-send failure.

Behavior:

- every Telegram `/start` or inbound message confirms `telegram_link_status`;
- bootstrap exposes that link status to the frontend;
- if a `telegram_chat_unreachable` delivery failure happened before the latest Telegram link/seen timestamp, the UI treats the bot as reconnected;
- the Planner Status card can show `Telegram linked` instead of continuing to show `Telegram failed`;
- Delivery Health explains that the red delivery record was an old scheduled-send failure.

Reason:

- Telegram commands can work while an old outbox item remains dead;
- showing only the dead outbox record made the app look like the bot was still blocked;
- users need one truthful answer: bot chat works, old scheduled delivery failed earlier.

### 2026-05-20 — Old Telegram dead status no longer means current block

Delivery Health now treats a `telegram_chat_unreachable` delivery as stale when the current outbox backlog has no pending, retry, or dead Telegram work.

Behavior:

- a stale Telegram delivery failure is labeled as an old issue, not an active block;
- the reconnect card only appears for an active dead Telegram row;
- the planner status chip no longer shows `Telegram failed` when the outbox has no active dead/retry/pending backlog;
- backend health no longer escalates a historical dead delivery when the dead backlog is already zero.

Reason:

- Telegram `/today` can work while `plannerMeta.delivery_status` still contains the previous failed send;
- the user needs the app to distinguish current delivery state from stale history.

### 2026-05-22 — Quest Loop gets a deterministic Not now threshold demo reset

The Quest Loop can now be tested without relying on old localStorage state.

Behavior:

- any named demo `reset` now reseeds demo data instead of only accepting `reset=1`;
- demo reseeding also clears local companion comfort memory;
- `reset=quest-loop-not-now-threshold` starts one resistance signal below the Sticky Quest threshold;
- with that reset, the first `Not now` on Today Mission immediately switches into Sticky Quest diagnosis;
- when Today Mission reaches the resistance threshold, the app no longer starts the ordinary quiet pause that hid the Sticky Quest.

Test URL:

- `/demo?reset=quest-loop-not-now-threshold&angelEntry=1`

Reason:

- the product rule is `repeated Not now -> diagnose resistance`, but the previous demo required stale local state or waiting through cooldowns;
- the new reset makes this vertical slice reproducible for manual QA and portfolio demo testing.

### 2026-05-22 — Unclear uses a two-step clarification flow

Sticky Quest `unclear` no longer jumps straight to a generated micro-step.

Behavior:

- choosing `unclear` opens an `Unclear quest` companion prompt;
- the prompt asks what is unclear before suggesting action;
- choosing a clarification option records the `unclear` relation signal;
- only after that does the app request or fallback to one micro-step;
- the generated step can still be started through the existing two-minute rescue flow.

Reason:

- `unclear` means the app does not yet know where the friction is;
- asking one small diagnostic question makes the companion feel like it notices the user's relation to the quest instead of blindly pushing another action.

### 2026-05-22 — Not Your Move confirmation writes quest relation memory

Confirming a waiting/external-dependency task now records the relationship signal explicitly.

Behavior:

- any Not Your Move confirmation writes `not_my_move` into local quest relation memory;
- the same confirmation clears local Angel resistance for that task;
- the task gets a short companion quiet period after confirmation;
- Today Mission and Sticky Quest already exclude tasks marked `blocked.status = not_your_move`, so the confirmed waiting task stops being pressure;
- this works for Sticky Quest, rescue waiting-text detection, and Not Your Move check-in paths.

Reason:

- "not my move" is not a failure or procrastination signal;
- the companion should remember that the user clarified an external dependency and should not immediately re-offer the same quest as today's pressure.

### 2026-05-22 — Demo Not Your Move survives preserved reloads

Guest/demo Not Your Move now persists immediately after confirmation.

Behavior:

- after marking a demo task as Not Your Move, the guest planner snapshot is saved synchronously;
- `/demo?preserveDemo=1` keeps the waiting state instead of allowing the old task to reappear as Sticky Quest;
- this is limited to guest/demo local storage and does not change cloud task storage.

Reason:

- the general guest save effect can lag behind a quick QA reload;
- Not Your Move is specifically meant to remove pressure, so losing it on reload makes the companion look dumb.

### 2026-05-22 — Relation memory can suppress mission pressure

Mission selection now has a client-side pressure guard in addition to task status.

Behavior:

- active tasks marked `blocked.status = not_your_move` are still excluded from Today Mission and danger pressure;
- tasks whose local quest relation memory says `not_my_move` or `still_waiting` are also excluded from pressure;
- the task remains visible in the active list, but Angel should not keep offering it as the main quest;
- this is a reversible client-side guard and does not migrate task data.

Reason:

- Not Your Move is a relationship/state signal, not just a task field;
- if a preserved demo or stale task snapshot loses the `blocked` field, the companion should still remember that this quest is waiting and avoid re-pressuring it.

### 2026-05-22 - Sticky quest cemetery confirmation

- Changed `let it die` from an invisible double-click guard into a visible Angel confirmation bubble.
- First click now replaces the Sticky Quest bubble with `Let it die?`, explains that the task moves to Cemetery and is not deleted forever.
- Confirming uses the existing task lifecycle path; cancelling keeps the quest alive and starts a short prompt cooldown.

### 2026-05-22 - Single companion bubble guard

- Companion prompts now suppress random idle/flash speech instead of rendering an empty secondary speech bubble beside the active prompt.
- The Companions layer clears angel/devil speech whenever a structured prompt is active, so Today Mission, Sticky Quest, clarification, and report prompts have one visible companion bubble at a time.

### 2026-05-22 - Clarification and shrink prompt clarity

- `too big` and `unclear` prompts now explicitly repeat the selected resistance reason before proposing a micro-step.
- Loading prompts now say what Angel is doing (`turning it into one confirmable 2-minute step`) instead of showing a vague no-op state.
- The primary action is disabled while Angel is thinking, and the suggested-step CTA now says `Use this 2-min step` so the next rescue session clearly uses that exact micro-step.

### 2026-05-22 - Suggested micro-step carried into rescue

- Clarification and shrink flows now pass a `stepSource` into Rescue so the rescue screen can label the micro-step as Angel-shrunk or Angel-clarified.
- Rescue shows a small source badge under the first step when the micro-step came from the Angel flow.
- `I moved` now records the actual micro-step text in the human event log and relation memory, making the movement trace easier to inspect.

### 2026-05-22 - Not Your Move confirmation pause

- Opening a Not Your Move draft now clears competing clarification/cemetery prompts before showing the waiting confirmation.
- Confirming Not Your Move writes an explicit `not_your_move_confirmed` executive-state log entry with reason, waiting text, and next check-in time.
- Confirming also starts a short companion quiet period and keeps the mission bubble dismissed, so the same quest should not immediately return as Today Mission or Sticky Quest pressure.
- Cancelling or closing the draft records a `not_now` relation signal and starts a short cooldown instead of instantly reopening the same prompt.

### 2026-05-22 - Not Your Move suppresses mission selection immediately

- Confirming Not Your Move now also stores the task id in a session-level pressure suppression list.
- Mission selection checks this list before choosing Today Mission, so the confirmed waiting task leaves the current mission card immediately even before backend/demo persistence catches up.
- Clearing Not Your Move removes the task from the session suppression list, letting Angel consider it again.

### 2026-05-22 - Companion quiet survives reload for waiting flow

- Not Your Move open/confirm/cancel now writes the short companion quiet period to local storage as well as React state.
- Reloading a demo URL with `angelEntry=1` during that quiet period no longer immediately opens another forced Sticky Quest.
- This is a UI comfort guard only; it does not change task data or backend state.

### 2026-05-22 - Waiting draft removes pressure before confirmation

- Opening the Not Your Move draft now immediately suppresses that task from mission pressure while the draft is open.
- Cancelling the draft releases that temporary suppression; confirming keeps it.
- This avoids the confusing state where the user has already said "not my move" but the same quest still remains as the visible Today Mission until a reload.
- Mission selection also treats the currently dismissed/quieted Not Your Move task as pressure-suppressed, using the same state that already hides the companion bubble.

### 2026-05-22 - Not Your Move held-task guard

- The current Not Your Move draft/confirmation now stores a dedicated held task id.
- Mission pressure builds a suppression set from this held id, the draft task id, and the session suppression list before choosing Today Mission.
- This makes the mission card follow the same choice the user just made: once they say "not my move", that quest should stop being the visible mission in the current loop.

### 2026-05-22 - Not Your Move suppresses by task title too

- The held Not Your Move guard now stores the task title as well as the task id.
- Mission selection checks the held title before keeping a backend/demo mission, so the same quest is suppressed even if the visible mission comes from a stale or alternate task object.
- This keeps the current loop coherent: choosing Not Your Move should immediately move pressure away from that quest without needing a page reload.

### 2026-05-22 - Not Your Move hold survives local remounts

- Opening or confirming Not Your Move now writes a short pressure-hold record to local storage.
- Draft-open holds last for the draft quiet window; confirmed holds last until the selected check-in.
- Mission selection reads that hold on every render, so a temporary local remount or backend/demo refresh cannot immediately put the same quest back into Today Mission.

### 2026-05-22 - Not Your Move gets an immediate mission replacement

- Opening or confirming Not Your Move now also selects the next best active task as a temporary mission override.
- This is a UI-level bridge while backend/demo mission projections catch up; it does not mutate the replacement task.
- The override is cleared on draft cancel, Not Your Move clear, or QA memory reset.
- The override now stores the replacement task object as well as its id, so the current UI frame can swap the mission immediately even if the task list is refreshed underneath.
- Confirming Not Your Move now also applies an immediate local optimistic update to the held task (`blocked.status = not_your_move`, `isToday = false`) before the backend command catches up.
- The same optimistic hold is re-applied shortly after confirmation to prevent command/bootstrap reconciliation from bouncing the task back into mission pressure.
- Not Your Move draft buttons now stop click propagation explicitly, so a check-in confirmation cannot be overwritten by the overlay close handler.
- Mission pressure now detects Not Your Move with the same merged metadata rule as the task cards (`notYourMove` legacy data plus `blocked` data), preventing visually waiting tasks from still being selected as Today Mission.
- Mission selection now has a final guard after manual overrides: if any selected mission is already pressure-suppressed or Not Your Move, the card falls back to the pressure-safe active list before rendering.
- The guard now resolves stale mission objects against the current task list by `id` or title before deciding, so an older manual override copy cannot keep rendering a quest that the visible list already marks as Not Your Move.
- Manual mission overrides now prefer the fresh task object from the current list by override id before falling back to the stored object, reducing stale-card mismatches after local optimistic Not Your Move updates.
- Confirmed Not Your Move now also records session pressure keys by task id and title. This gives mission selection an explicit suppression guard even if React still has an older copy of the task object during the same UI frame.
- Moving mission away from a Not Your Move task now also updates local `plannerMeta.mission_task_id` to the replacement task. This prevents a stale backend/demo mission projection from keeping the old quest in the top mission card while the task list already shows it as waiting.
- The local `plannerMeta` bridge also works when demo mode had no planner meta yet; it creates the minimal mission projection needed for the current UI frame.
- Replacement mission selection now runs from the current task ref, or from the already-optimistically-updated task list, instead of relying on the previous render's priority list. This prevents the just-marked waiting task from being re-selected by stale render state.
- Mission pressure now also builds explicit active Not Your Move id/title sets and rejects any mission candidate matching those sets, even if the candidate object itself is stale.
- The UI now has a dedicated forced mission display bridge for the current session. When Not Your Move moves pressure away, the replacement task becomes the rendered mission before backend/demo projections can reassert an older mission.
- The Not Your Move optimistic update now computes the replacement mission inside the React `setTasks` update from the exact task list React will render next, reducing ref/state mismatch in the same frame.

### 2026-05-22 - Not Your Move mission fallback hardening

When a mission task is marked as `not_your_move`, the visible Today Mission fallback now selects only unsuppressed active candidates. This prevents a held external-dependency quest from being immediately re-selected through the pressure-task fallback after the user confirms a check-in.

### 2026-05-22 - Mission replacement after held quests

The immediate replacement picker after `Not Your Move` now ignores old sticky relation-memory on other candidate tasks. It still excludes the currently held quest and any task already marked `not_your_move`, but it must be allowed to pick a usable alternate mission so the same held quest does not remain pinned at the top.

### 2026-05-22 - Forced replacement beats soft sticky memory

A forced Today Mission replacement created after `Not Your Move` is now blocked only when the replacement task is itself marked `not_your_move`. Old sticky/relation-memory on the replacement candidate no longer cancels the forced swap, so the held quest does not remain visually pinned after confirmation.

### 2026-05-22 - Explicit display mission guard

The top Today Mission card now has an explicit display guard: if the selected mission is currently held as `Not Your Move` or otherwise pressure-suppressed, the rendered mission is replaced with the first available active alternative before the shell receives it. This avoids stale backend/manual mission IDs keeping a held quest visually pinned.

### 2026-05-22 - Mission self-correct effect

A render-time safety effect now watches the visible mission: if it points to a task that has become `not_your_move`, it immediately applies a mission replacement from the active list. This covers stale backend/manual mission IDs and optimistic task updates that arrive before the mission selector recalculates.

### 2026-05-22 - Robust Not Your Move detection

The App-level pressure helper now treats `not_your_move_v1` metadata and `nextCheckInAt` as Not Your Move signals, not only `status: not_your_move`. This keeps mission selection aligned with the task card UI when optimistic/backend payloads carry equivalent Not Your Move metadata.

### 2026-05-22 - Visual mission hard override

The Today Mission card now has a dedicated visual fallback task set by the mission replacement path. This override is separate from backend/manual mission metadata, so a confirmed `Not Your Move` quest can be removed from visible pressure immediately even if stale mission metadata still points at it.

### 2026-05-22 - Today Mission remount on task switch

`ApusTodayMission` is now keyed by the displayed mission task id. This forces the mission card to remount when the parent switches from a held quest to a replacement, preventing stale mission DOM from surviving after the selector has already changed.

## 2026-05-23 - Quest Loop mission replacement verification

- Verified the production demo quest loop after the Not Your Move flow: when a sticky mission is marked as Not Your Move, the active Today Mission display moves to another eligible task instead of continuing to pressure the held task.
- Added a remount boundary for the Today Mission card so the visual mission updates when the planner swaps the selected quest after a resistance/Not Your Move action.

## 2026-05-23 - Too Big shrink flow starts vertical slice

- `too_big` diagnosis now opens a deterministic shrink flow instead of waiting on the clarification API/LLM.
- The shrink flow proposes one 2-minute step from the current task's open subtask, explicit next action, or rescue plan fallback.
- Confirming the shrink prompt adds the suggested step with a shrink-specific source and opens rescue with that exact step override.
- The CTA now reads as a start action for the 2-minute step, making the flow clearer than generic task tuning.

## 2026-05-23 - Rescue completion quiets sticky pressure

- Completing a rescue micro-step now closes the rescue overlay synchronously before the backend command finishes.
- The completed task receives a short mission/companion cooldown, so Sticky Quest cannot immediately reappear over the just-completed rescue session.
- The cooldown is persisted in local storage for the current session to survive immediate UI reconciliation.

## 2026-05-23 - Too Big production verification

- Verified on production demo bundle `main.c4c3f5fc.js` with `Sticky Quest -> too big -> Start 2-min step -> I moved`.
- The shrink prompt generated a concrete step (`Record a 90-second walkthrough`) from the existing task data.
- Rescue opened with the shrink step and showed the shrink source label.
- Completing `I moved` closed rescue and did not immediately reopen Sticky Quest or the shrink prompt.
- Today Mission moved away from the completed pressure task after the movement signal.

## 2026-05-23 - Unclear clarification flow starts vertical slice

- `unclear` diagnosis now stays in the same companion prompt surface and asks which part is foggy before suggesting action.
- The clarification step is deterministic for now: start/first-step/options/done-enough reasons map to one safe micro-step without asking an LLM to mutate task state.
- Confirming the clarified step opens rescue with the suggested step and the `angel_clarification` source label.
- This keeps the loop testable while preserving the safety boundary: AI/heuristics can suggest an entry point, but user confirmation still controls mutations.

## 2026-05-23 - Sticky kill confirmation uses Cemetery feedback

- `let it die` still opens a confirmation prompt and does not delete tasks forever.
- Confirming the prompt now routes through the existing Cemetery command path and asks the devil companion to use the Cemetery scene feedback.
- This keeps the sticky-resistance loop non-destructive while making the companion response match the action.

## 2026-05-23 - Companion report owns the mascot slot

- When `While you were away` is open, both bottom companion avatars and their speech bubbles are suppressed.
- This prevents the report mascot from competing with the regular angel/devil mascots on the same screen.
- The report panel now carries an explicit angel/devil class so future positioning can follow the active speaker without adding another parallel surface.

## 2026-05-23 - Portfolio demo opens on Kanban plus reliable Brain Dump

- The public `/demo` route no longer forces the unfinished Executive State Layer open by default. It still can be opened explicitly with the existing state-layer query flags, but the normal portfolio demo now starts closer to the task/Kanban interface.
- Angel Lab now has a demo-only local Brain Dump parser. In demo mode, saving typed text creates draft task cards and optional micro-steps locally, without requiring microphone access, OpenAI transcription, auth, or backend capture APIs.
- Demo Angel Lab pre-fills a safe example dump when opened empty, so the feature can be shown quickly in a portfolio walkthrough while preserving the confirmation boundary: nothing is added until the user clicks an add action.

## 2026-05-23 - Angel Lab text-first OpenAI draft boundary

- Real Angel Lab text dumps now attempt a backend OpenAI draft pass before falling back to the existing safe parser.
- The OpenAI path is proposal-only: it can return draft task cards, merge suggestions, and optional micro-steps, but it cannot mutate task state or perform destructive actions.
- `/api/captures` sanitizes model output into the existing Angel Lab card contract and reports whether the draft came from OpenAI or from the safe parser fallback.
- The frontend now surfaces that source in the Angel Lab status message, so OpenAI/API failure is visible instead of silently looking like a completed AI parse.

## 2026-05-23 - Angel Lab capture dry-run self-test

- `/api/captures` now accepts `dryRun: true` for contract verification.
- Dry-run uses the same Angel Lab draft path, including OpenAI when configured, but skips `appendCapture`, capture extraction persistence, and Firestore writes.
- This gives us a safe way to verify whether production is using OpenAI or falling back to the parser without polluting user data.

## 2026-05-23 - Angel Lab AI provider fallback

- Angel Lab draft generation now attempts OpenAI first and then OpenRouter when OpenAI is not configured or fails.
- The response reports `aiDraft.source` as `openai`, `openrouter`, or `simple_fallback`, so the UI and tests can see which path actually ran.
- If neither provider is configured, the endpoint still returns safe parser cards and a clear warning instead of pretending that AI drafting happened.

## 2026-05-24 - Angel Lab recording state clarity

- Angel Lab now shows an explicit recording banner after microphone access is granted, so the user can tell the app is actively listening instead of being stuck in the permission-request state.
- After speech is transcribed, the status explains the next step: press `Draft task cards` / `Разбить на задачи` to turn the transcript into draft cards.
- The primary Angel Lab action changes label from generic save wording to the draft/split action when there is transcript text and no current draft cards.

## 2026-05-24 - Angel Lab draft action stays visible

- The primary Angel Lab action now stays in the draft/split state whenever there is transcript text, even if older draft cards are still present below.
- This prevents a recognized voice dump from looking like a passive `Save dump` action instead of the next product step: turning the text into task cards.

## 2026-05-24 - Angel Lab recorder mascot state

- Added a square, muted recorder mascot video asset for Angel Lab recording mode.
- The Angel Lab mascot image is now clickable: idle shows the recorder still, and active recording swaps to the looping recorder video.
- A small `REC` pulse is layered on the recording mascot so the recording state is visible even before reading the status copy.

## 2026-05-24 - Angel Lab subtask confirmation and transcription default

- Angel Lab draft cards now use one shared selection helper for the visual checkbox state, the selected-subtask counter, and the actual add-with-subtasks mutation path.
- Server draft subtasks default to selected unless the draft explicitly marks them unselected, so generated micro-steps are actionable without hidden empty selection state.
- Angel Lab now shows a bottom close action after draft cards appear, so adding cards does not trap the user in Brain Dump.
- Speech transcription defaults to `gpt-4o-mini-transcribe` when no explicit `OPENAI_TRANSCRIPTION_MODEL` is configured, with a stronger prompt for casual Russian/English/German planner dictation.

## 2026-05-24 - Angel Lab checkbox-state hardening

- Angel Lab draft subtasks now render as explicit toggle rows instead of native checkboxes, so the visible checkmark is derived from the same selected state as the counter and add-with-subtasks action.
- The inactive add-with-subtasks state is now a non-clickable hint instead of a disabled button, so it no longer feels like a broken action.
- Demo translation now refreshes dynamic text when React changes a node, preventing stale `chosen to add` counters in the English demo overlay.
- The Angel Lab OpenAI draft prompt now explicitly asks for independent needs to be split into separate cards and for subtasks to stay concrete to the exact task.

## 2026-05-25 - Quest relation chips reopen the right companion flow

- Active task relation chips are now clickable entry points instead of passive labels.
- `sticky: too big` reopens the shrink flow and generates one smaller step before rescue.
- `sticky: unclear` reopens clarification before action.
- `sticky: not my move` / `still waiting` reopen the Not Your Move draft instead of applying Today Mission pressure.
- `asked to die` reopens the safe Cemetery confirmation, not delete forever.
- The chip click is still local relation memory plus existing command paths; it does not give AI or the UI permission to mutate task state without the user's next confirmation.

## 2026-05-25 - Cooldown chips become a soft re-entry

- `cooling down` / `rescue paused` chips now reopen the clarification flow instead of only focusing the task card.
- This keeps postponed quests from feeling like silent dead labels: the angel re-enters with a question about what is sticky, not a renewed demand to perform.
- The task still does not mutate until the user confirms a suggested step or another existing command-path action.

## 2026-05-25 - Pause signals no longer erase sticky cause

- Dismissing a shrink/clarification prompt now records the pause count without replacing the remembered root cause.
- Example: if a quest was marked `too_big`, closing the shrink prompt records `not_now` in counts but keeps the visible relation chip as `sticky: too big`.
- This prevents the companion from forgetting why the quest resisted just because the user chose not to continue right now.

## 2026-05-25 - Clarification memory keeps the reason and suggested step

- Quest Relation Memory now stores the latest sticky reason label, normalized confusion key, suggested micro-step, subtask id, and step source.
- `Try another` / `Make smaller` no longer overwrite the original reason with the button label; retries reuse the existing sticky reason.
- Starting rescue from a clarification/shrink prompt records the confirmed micro-step in relation memory before opening the 2-minute rescue session.
- This moves the loop closer to "the angel understands the relationship to the quest": the system can remember what was foggy and what entry point it offered.

## 2026-05-26 - Not Your Move remembers what is being waited on

- Not Your Move confirmations now store the waiting reason, waiting text, and next check-in timestamp in Quest Relation Memory.
- Reopening Not Your Move from a sticky chip, sticky diagnosis, or Today Mission relation now pre-fills the draft from the existing task blocker or relation memory instead of starting empty.
- Sticky diagnosis copy can include what the quest is waiting on, so the companion checks the dependency before applying pressure again.
- This keeps external-dependency quests as waiting/check-in material rather than repeated Today Mission pressure.

## 2026-05-26 - Quest Relation Director starts choosing the next route

- Quest Relation Memory now stores a `lastDirectorAction` derived from the latest relationship signal.
- Sticky Quest copy uses that director action to change the primary CTA/question:
  - `too_big` -> shrink first;
  - `unclear` -> clarify first;
  - `not_my_move` / `still_waiting` -> check waiting state;
  - `kill_without_guilt` -> consider Cemetery safely;
  - `microstep_completed` -> continue gently.
- This is still a safe frontend routing layer: it changes the companion entry point, not task data, and all task mutations still require the existing user confirmation/command paths.

## 2026-05-26 - Quest Relation Director primary CTA routes into the matching flow

- Sticky Quest primary CTA now follows the stored Director action instead of only focusing the task card.
- `shrink_then_rescue` reuses the existing `too_big` shrink flow, `clarify_then_rescue` reuses clarification, `hold_external_dependency` opens Not Your Move, and `confirm_cemetery` opens the safe Cemetery confirmation.
- This keeps the loop reversible: the Director chooses the next conversation route, but task status still changes only after the existing user confirmation path.
- Added a demo QA reset at `/demo?reset=quest-relation-director-primary&angelEntry=1` that seeds a `too_big` relation so this route can be checked without touching real user data.
- Added matching demo QA resets for `quest-relation-director-unclear`, `quest-relation-director-not-my-move`, and `quest-relation-director-kill` so all Director routes can be checked through the same demo surface.
- Added demo QA resets for `quest-relation-director-not-now`, `quest-relation-director-rescue-later`, and `quest-relation-director-microstep-completed` so cooldown and completed-movement relation notes can be checked directly.

## 2026-05-26 - Not Your Move relation is visible before confirmation

- A task with relation memory `not_my_move` / `still_waiting` no longer appears as generic `sticky: not my move`.
- Before the user confirms the waiting state, the task card shows a clear `not your move? confirm` / `не твой ход? подтвердить` chip and a small note explaining that Angel will stop pushing only after the waiting dependency is confirmed.
- Confirmed Not Your Move tasks still use the stronger Not Your Move card state and `Back in my hands` action.

## 2026-05-26 - Not Your Move confirmation is harder to miss

- The possible `Not Your Move` note on a task card is now itself clickable, not just the small relation chip.
- The confirmation draft requires a non-empty waiting context before a check-in can be saved.
- This keeps the flow explicit: Angel can stop pushing only after the user records what external dependency is being waited on.

## 2026-05-26 - Suggested micro-steps stay visible on task cards

- When `too_big` or `unclear` produces a suggested micro-step, the task card now shows that remembered Angel entry point under the relation chip.
- The remembered entry point is clickable and routes back into the same shrink/clarify flow, so the user can continue from the last useful suggestion instead of seeing only a generic sticky label.
- This keeps the quest loop visible after the bubble closes: resistance -> reason -> suggested entry point -> rescue.

## 2026-05-26 - Completed micro-steps are visible after rescue

- After `I moved` in rescue, the relation chip now says `movement counted` / `сдвиг засчитан`.
- The task card also shows the exact micro-step that was counted as `Counted micro-step` / `Засчитанный микрошаг`.
- This makes the end of the loop visible on the card instead of hiding the result in logs.

## 2026-05-26 - Relation memory leaves a readable card trace

- Quest relation chips no longer have to carry all meaning alone.
- When a task has relation memory but no remembered micro-step yet, the task card now shows a compact readable note:
  - `too_big` explains that the quest should be shrunk before rescue;
  - `unclear` explains that the first visible move should be clarified;
  - `not_now` / `rescue_later` explain that pressure was lowered and the same direct push should not repeat immediately;
  - `kill_without_guilt` explains that Cemetery still requires confirmation;
  - `microstep_completed` explains that movement was counted.
- These notes are clickable and route through the existing relation click handler. They do not mutate task state by themselves.

## 2026-05-26 - Cooldown relations reopen as diagnosis, not generic clarification

- Clicking a `not_now` or `rescue_later` relation note now opens a Sticky Quest diagnosis prompt instead of the generic `Unclear quest` flow.
- The user is asked where the quest is sticky: `too big`, `unclear`, `not my move`, or `let it die`.
- Each answer routes into the existing safe path: shrink, clarify, Not Your Move confirmation, or Cemetery confirmation.
- This keeps cooldown signals product-correct: after the user pauses or delays a quest, Angel changes tactic instead of repeating the same direct push.

## 2026-05-26 - Unclear quests require a foggy-part choice first

- The `unclear` route now pauses before generating a micro-step.
- Until the user picks what is unclear (`where to start`, `first step`, `too many options`, `done is unclear`, or explicit `Angel suggests step`), the primary CTA is disabled and says `Pick what is unclear`.
- This makes Sticky Quest -> `unclear` behave like a real clarification flow instead of silently jumping straight to a suggested step.

## 2026-05-26 - Confirmed Not Your Move demo reset

- Added `/demo?reset=quest-relation-director-not-my-move-confirmed&angelEntry=1` as a QA scenario for the completed Not Your Move path.
- The demo seed now can mark the portfolio task as `blocked.status = not_your_move`, remove it from today's pressure, and store confirmed waiting context in Quest Relation Memory.
- Demo reset seeding now writes task storage after scenario mutation, so QA-only task state changes are actually visible in the demo UI.

## 2026-05-26 - Cemetery confirmation leaves a clear trace

- Confirming `let it die` now records `cemeteryConfirmed`, `lastBuriedAt`, and `lastBuriedReason` in Quest Relation Memory.
- A task moved to Cemetery through this route now shows `Buried, not deleted` / `Похоронено, не удалено` instead of continuing to look like an unconfirmed Cemetery request.
- The copy explicitly says the quest was moved to Cemetery without being deleted forever, keeping this path non-destructive and reversible.
- Demo routes now use the local demo mutation path instead of cloud command fallback, so safe demo tasks can visibly move to Cemetery without touching a real account.

## 2026-05-29 - Angel Lab draft confirmation is harder to misread

- Angel Lab draft cards now show a small queue status with the number of cards still waiting for a decision.
- The queue explains that added or dismissed draft cards disappear from the draft list, so the user can see that applying a card changed local state.
- When subtasks are selected, the primary `Add task + chosen subtasks` action is shown before the weaker `Add main task without subtasks` action. This keeps the main CTA aligned with the user's visible selection and reduces accidental main-only adds.

## 2026-05-29 - Angel Lab AI drafts use the full subtask polish path

- AI-generated Angel Lab cards now go through optional subtask enrichment and create-card preselection even when the endpoint is running in the default `simple` mode.
- The prompt now explicitly blocks generic/invented prerequisites such as `collect money`, `make a plan`, or `create visual elements` unless the user actually implied them.
- Simple errands are guided toward concrete visible first steps: check what is needed, open the app/site, write down the item, buy/order/go.
- This keeps the current safe boundary: AI still proposes draft cards and optional micro-steps only; applying them still requires explicit user confirmation.

### 2026-05-29 - Angel Lab filters meta-confusion out of task drafts

Angel Lab now treats pure state phrases such as "I do not know where to start" / "everything feels urgent" as context instead of creating a separate task card. This keeps the draft list focused on actionable tasks while preserving the user's overwhelm signal for the surrounding flow.

### 2026-05-29 - Angel Lab category polish no longer bleeds across cards

Angel Lab category-specific subtask polish now keys off the individual draft card title instead of the whole dump text. This prevents portfolio/demo subtasks from being applied to unrelated draft cards such as Jobcenter letters or buying cat food when the same brain dump mentions Apus Planner.

### 2026-05-29 - Angel Lab draft quality gate

Angel Lab now runs a deterministic quality gate after LLM/category post-processing. The gate removes empty, generic, duplicate, or clearly off-topic subtasks from each draft card. If a create-card loses all subtasks after filtering, it is marked as `needsClarification` instead of keeping misleading generic steps. This keeps future brain dumps from leaking one task's subtasks into another task card.

### 2026-05-29 - Angel Lab shows weak draft cards as clarification-needed

Angel Lab now renders draft cards with `draftQuality.needsClarification` as a visible clarification-needed state. The card explains that Angel could not find reliable subtasks and suggests either adding only the main task or skipping and dumping a clearer next move. This prevents weak LLM output from looking like a normal ready-to-add task.

### 2026-05-29 - Angel Lab respects explicit first-step preselection

Angel Lab create-card auto-preselection now respects explicit `selectedByDefault` subtasks from post-processing. When category polish marks the first visible step as the safe default, the later confidence-based preselector no longer adds extra steps from the middle of the card. This keeps the default action closer to "one next step" instead of silently selecting multiple steps.

### 2026-05-29 - Angel Lab draft quality regression test

Added a server-side regression test for the mixed Jobcenter + cat food + Apus Planner dump. The test guards against portfolio subtasks leaking into unrelated cards, meta-overwhelm becoming a fake task, and auto-preselection choosing more than the first safe step.

### 2026-05-29 - Angel Lab clarification cards can be sent back to the dump

Clarification-needed draft cards now show a `Clarify this` action. The action does not create or mutate a task; it appends a focused clarification prompt back into the Angel Lab textarea so the user can explain what is unclear or blocked and rerun the draft.

### 2026-05-30 - Angel Lab Clarify this gives visible feedback

The `Clarify this` action now gives immediate local UI feedback: it highlights the dump textarea and shows a short status message that the clarification prompt was added. This makes the action feel visible without creating or mutating a task.

### 2026-05-30 - Angel Lab weak drafts use safer add wording

When a draft card needs clarification, the fallback add action now says `Add title only` / `Добавить только название` instead of implying a complete task-without-subtasks path. This makes weak drafts feel provisional and safer.

### 2026-05-30 - Angel Lab Clarify this is idempotent

The `Clarify this` action now checks whether the same clarification prompt is already present in the textarea. If it is already there, the button is disabled instead of appending duplicate prompts.

### 2026-05-30 - Angel Opening Move

The companion prompt router now has a low-priority Angel Opening Move. When no higher-priority companion state is active, Angel can offer one safe entry point into the current mission instead of waiting passively for the user to manage the full list. Starting it opens the existing rescue flow; dismissing or opening the planner sets a longer cooldown so the prompt does not return on every refresh.

### 2026-05-31 - Angel Lab handled-card feedback

Angel Lab now keeps a small "last action" notice above the draft queue after a card is added, merged, skipped, or recognized as already existing. Draft cards still disappear after handling, but the user gets an explicit confirmation of what happened instead of needing to leave Angel Lab and search the planner.

### 2026-05-31 - Angel Lab draft progress chips

Angel Lab now shows draft-session progress chips for added, skipped, and remaining cards. This keeps the confirmation flow understandable while cards disappear from the queue after handling.

### 2026-05-31 - Angel Lab session completion summary

When all current draft cards are handled, Angel Lab now shows a session-complete panel with the added/skipped totals and a clear return-to-planner button. This makes the brain-dump confirmation loop feel closed instead of leaving an empty draft column.

### 2026-05-31 - Angel Lab splits combined independent needs

Angel Lab post-processing now detects create cards whose title combines multiple independent actionable needs with "и/and" and splits them into separate draft cards. Each split card then receives category-specific micro-steps, preventing unrelated needs such as Jobcenter letters and cat food from becoming one confusing task.

### 2026-05-31 - Angel Lab caps default selected subtasks at one

Angel Lab now normalizes `selected`, `checked`, and `selectedByDefault` flags after AI/category post-processing so a draft card can have at most one preselected subtask. This keeps the default action aligned with the product rule: one safe next step, not several hidden commitments.

### 2026-05-31 - Angel Lab parser trims connector tails

Angel Lab fallback parsing now trims connector words such as `и/and` when splitting one dump sentence into independent action chunks. This prevents drafts like `Разобрать письма от Jobcenter и` when the next action starts after the conjunction.

### 2026-05-31 - Public demo core loop is visible on mobile

The `/demo` onboarding intro now fits on a narrow mobile viewport instead of clipping the first explanation card. The Today Mission -> Rescue path also keeps the rescue timer and primary actions visible together, so the visitor can complete `I moved` without hunting below the fold.

After a public demo rescue shift, Apus now surfaces the existing demo-complete copy in the shell and shows a completion banner: `Core demo loop complete: Today Mission -> Rescue -> one tiny step.` This makes the intended product loop visible at the moment it succeeds.

### 2026-05-31 - Demo Angel Lab parser matches the portfolio story

The demo-only Angel Lab parser now cleans launcher prefixes such as `мне надо`, filters meta-confusion like `не знаю с чего начать`, and splits independent action chunks joined by `и/and` when the second chunk starts with a real action verb.

For the safe portfolio dump about mail, cat food, app demo, and portfolio, `/demo` now produces four separate draft cards with concrete first steps. This keeps the public demo useful even without auth, microphone access, OpenAI transcription, or backend capture APIs.

### 2026-05-31 - Public demo Decision Trace

The public `/demo` Progress tab now includes a safe Decision Trace. It shows the current mission, the selection reason, the rescue step, the manual Today boundary, and the fact that demo mode does not send Telegram/email. This lets a portfolio visitor see the "why did the planner choose this?" story without exposing production debug controls or live delivery actions.

When Progress is open, the floating companion prompt/avatars are suppressed so they do not cover the trace on narrow screens.

### 2026-05-31 - Decision Trace becomes the first Progress surface

The Progress tab now shows Decision Trace for both demo and normal planner sessions before Delivery Health. This makes the user-facing question "what is the planner pushing, why, and what trace did it leave?" separate from technical diagnostics.

Delivery Health still carries Telegram/email state and manual debug actions for authenticated users, but Engine diagnostics are now visually separated from the primary decision explanation.

### 2026-05-31 - Decision Trace keeps engine evidence inspectable

For normal planner sessions, Decision Trace now includes a collapsed "Latest engine evidence" section. It shows the latest Planner Engine decisions and inbox items under the compact six-row explanation, so the product can answer both "what is the current push?" and "what raw engine evidence backs that?" without moving those details back into Delivery Health.

### 2026-05-31 - Decision Safety recovery actions

Normal planner sessions now show a Decision Safety card inside Decision Trace. If the current focus, angel decision, or extraction looks wrong, the user can create a safety snapshot, jump to backups, or open the report log from the same surface that explains the decision. Restore still uses the existing confirmation modal; the safety card only makes the recovery path discoverable.

### 2026-06-01 - Angel Lab parse repair action

Every non-reject Angel Lab draft card now has a non-mutating `Fix parse` / `Исправить разбор` action. It appends a focused correction prompt back into the dump textarea, then the user can rewrite that card and draft again instead of accepting a wrong extraction or silently skipping it. Clarification-needed cards keep the stronger `Clarify this` wording.
