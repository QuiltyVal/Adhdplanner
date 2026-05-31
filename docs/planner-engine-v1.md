# Planner Engine v1

This document is the project compass for making ADHD Planner feel proactive, reliable, and inspectable.

## Goal

Planner Engine is the single backend brain for tasks, ticks, reports, and delivery.

UI, Telegram, email, and future mobile clients must not independently decide what the planner world means. They should send commands, render snapshots, and deliver messages.

## Source of truth

| Domain | Source of truth |
| --- | --- |
| Raw task state | `Users/{userId}/tasks` |
| User commands | `runPlannerCommand(...)` |
| Time-based system changes | `runPlannerTick(...)` |
| Human-readable activity | `Users/{userId}/plannerEvents` |
| Login/devil/angel summaries | `Users/{userId}/reportItems` |
| Delivery reliability | Outbox records |
| Mission/rescue projection | `Users/{userId}.plannerMeta` |

## Required rule

Every meaningful state change must have an event.

Meaningful means:

- task created;
- task completed;
- task touched / movement recorded;
- task moved to Cemetery;
- task restored;
- task deleted forever;
- task auto-decayed or auto-cleaned by the engine;
- delivery sent or failed;
- mission/rescue projection changed.

Noise should not become user-facing events:

- tiny heat decay;
- repeated ticks that do not cross a threshold;
- duplicate delivery attempts hidden behind the same outbox item.

## Actor separation

| Actor | Meaning | Can devil say “I did it”? |
| --- | --- | --- |
| `user` | Human action through Web or Telegram | No |
| `engine` | Automatic planner maintenance | Yes, if the event is devil-facing |
| `delivery` | Telegram/email/push sent or failed | No |
| `migration` | Data repair or schema change | No |

Devil reports must narrate engine-authored changes, not user-authored changes.

## Command path

All writable user actions should flow through:

```txt
Web / Telegram / future app
  -> canonical action route
  -> runPlannerCommand(command, actor, now)
  -> task mutation
  -> plannerEvents
  -> runPlannerTick(trigger="command")
  -> plannerMeta/reportItems/outbox
  -> fresh snapshot returned to client
```

Current first-class command slice:

- `TASK_COMPLETE`
- `TASK_TOUCH`
- `TASK_MOVE_TO_CEMETERY`
- `TASK_DELETE_FOREVER`
- `TASK_REOPEN`
- `CREATE_OR_MERGE_TASK`
- subtask and tuning commands already routed through the same service where possible.

Report projection rule:

- task creation writes a stable `angel_task_created` report item;
- movement/touch/rescue shift writes a stable `angel_task_moved` report item;
- user-authored task creation, touch, completion, restore, and manual cemetery moves use `user_*` report keys and the `user` persona;
- engine-authored cemetery moves stay devil-facing;
- settings edits remain event-log only unless they cross a meaningful planner threshold.

## Tick path

Scheduled backend work should flow through:

```txt
Hetzner / cron
  -> internal planner tick endpoint
  -> runPlannerTick(userId, now, trigger)
  -> threshold-based changes only
  -> plannerEvents + reportItems + outbox
  -> outbox drain sends Telegram/email/push
```

Cron must not decide message content or planner priorities by itself.

Scheduled notification timing:

- Hetzner cron is the production scheduler for Telegram nudges.
- Slot jobs call `/api/telegram-nudge?slot=morning|evening` for user-facing nudges.
- Maintenance jobs call `/api/telegram-nudge?action=maintenance` and must not enqueue scheduled nudges by ambient time.
- Morning slot is 09:00 Europe/Berlin; evening slot is 18:00 Europe/Berlin.
- Outbox semantic dedupe still prevents duplicate sends if a slot job is retried.
- Scheduled Telegram nudge dedupe includes a non-reversible hash of the destination chat id. A successful send to an old linked chat must not block the same date/slot after the user reconnects the current Telegram chat with `/start`.
- Hetzner retries each slot several times during the target hour, while `/root/adhd-mcp/runTelegramNudge.sh` uses a `flock` lock so overlapping cron/manual runs cannot race.
- Hetzner maintenance runs away from top-of-hour slot starts and only refreshes/drains; it is not a user-facing notification scheduler.
- Email digests are also scheduled from Hetzner, not from the browser.
- Email digest retries run several times during the same Berlin morning/evening slot, while `/root/adhd-mcp/runPlannerDigest.sh` uses a `flock` lock and writes `/root/adhd-mcp/.digest-state/YYYY-MM-DD_slot.ok` only after a successful send.
- The email success marker makes retries safe: transient failures get another attempt, but a successful digest is not sent twice for the same date/slot.
- Hetzner runs `/root/adhd-mcp/runPlannerDeliveryWatchdog.sh morning|evening` after each retry window. The watchdog checks Firestore for the exact `scheduled_nudge` outbox id for the current `YYYY-MM-DD_slot` and checks the email success marker for the same slot.
- The watchdog writes `/root/adhd-mcp/delivery-watchdog-status.json`, logs to `/var/log/adhd-planner-watchdog.log`, and sends a single email alert per failed date/slot/failure set. Manual forced Telegram sends do not satisfy the scheduled slot check.

## Bootstrap path

When the app opens:

```txt
GET/POST planner bootstrap
  -> tasks
  -> plannerMeta
  -> unread reportItems
  -> recent plannerEvents ordered by createdAt desc
```

The UI may cache events locally, but backend events are authoritative for cloud users.

## UI contract

The UI may:

- optimistically show local changes only for Guest/offline mode;
- render task cards and reports;
- display cached report entries while loading.
- subscribe to `reportItems` for live human-readable updates from web, Telegram, and engine actions.

The UI must not:

- invent different mission/rescue logic than backend;
- assign devil/angel actor meaning without backend event actor/source;
- require full page refresh to see command events;
- mutate cloud task state outside backend commands except during explicitly temporary migration phases.

### Cloud write rule

For authenticated cloud users, web code must be command-first:

```txt
UI intent
  -> /api/planner-client-actions
  -> PlannerCommandService
  -> fresh snapshot
  -> UI renders returned state
```

Do not add new `saveTask(...)`, `deleteTask(...)`, or `persistTask(...)` paths for cloud user actions.

Frontend guard:

- `persistTask(...)` is blocked for cloud users and only logs a warning.
- `persistScore(...)` is blocked for cloud users and only logs a warning.
- Cloud user changes must go through `/api/planner-client-actions`.
- Live Firestore snapshots are not allowed to visually undo a fresh local command intent while the command response/bootstrap is still catching up.
- Client task merging lives in `src/plannerTaskMerge.mjs` and has a contract test in `tests/planner-client-merge-stability.test.mjs`.
- A stale live snapshot may not bounce a fresh Active/Heaven/Cemetery move back to the old column; an authoritative command/bootstrap snapshot may.
- The while-away popup may auto-open only during the entry report window and only once per exact report-item signature in the current browser session. Report items still stay visible in Progress/history; this only prevents repeated modal spam.
- Scheduled nudges and auto-cemetery delivery now carry an explicit semantic delivery dedupe key. Outbox document ids still dedupe queue creation, while the delivery layer also suppresses equivalent messages if a second outbox item reaches drain.
- Optimistic cloud delete-forever now leaves a short-lived local pending-delete tombstone. A stale live Firestore snapshot may not visually resurrect the deleted card while the backend delete command is still catching up; an authoritative command/bootstrap response may still restore it if the server says deletion failed. The tombstone is removed after successful backend confirmation or rollback.
- Pending-delete tombstones are also cleared on user/session identity change so local delete protection cannot leak across login contexts in a long-lived browser tab.
- Latest command/write boundary audit: client-side direct Firestore mutation primitives remain centralized in `src/firestoreUtils.js` and protected by `assertDirectPlannerWriteAllowed(...)`. Remaining direct task writes in `src/*Guest*` helpers are guest/offline paths, while backend writes live inside PlannerCommandService, Planner Engine, report projection, outbox, or explicit migration/snapshot maintenance.

Backend legacy-store guard:

- `mutatePlanner(...)` may still update non-task root metadata for old helper paths.
- Legacy `mutatePlanner(...)` task/score writes are blocked unless a caller explicitly opts into `allowLegacyTaskMutation`.
- New backend task writes must use `runPlannerCommand(...)` / PlannerCommandService.

Inactive completion safety:

- `TASK_COMPLETE` and `TASK_RESCUE_COMPLETED` may complete only `active` tasks.
- `completed` and `dead` tasks treat stale Done / rescue-complete callbacks as no-op.
- Single-task `noop` commands write only a technical command record, not `plannerEvents`, `reportItems`, `telegramContext`, or title-index changes.
- Returning a task from Heaven or Cemetery must use `TASK_REOPEN`, not completion.

Allowed direct persistence exceptions:

- Guest/offline mode.
- Cloud cache writes after authoritative bootstrap/command snapshots.
- Explicit migration or repair code with a comment explaining why it cannot use a command yet.
- Snapshot backup/create/restore writes inside backend snapshot commands.

## Phase 1 acceptance

- Web complete/touch/cemetery/delete-forever actions route through backend commands for cloud users.
- Telegram complete/touch/cemetery/delete-forever actions route through the same backend commands.
- Command responses return fresh state and recent ordered events.
- Progress / Planner Report can update after an action without F5.
- User actions are not narrated as “devil did it”.
- Engine auto-actions can be narrated by devil.

## Phase 2 acceptance

- `reportItems` become the stable “while you were away” source.
- Delivery status is driven by outbox events.
- Email and Telegram use the same report/delivery projection.
- Mission and default rescue suggestion come from `plannerMeta`.
- Legacy local-only report/event paths are removed or clearly limited to Guest mode.

## Current Web persistence audit

This table tracks remaining `persistTask(...)` usage in `src/App.js`.

| Area | Current status | Target |
| --- | --- | --- |
| Add task | OK temporary | Cloud path uses `add_task`; `persistTask` is Guest/offline only. |
| Touch / movement | OK temporary | Cloud path uses `touch_task`; `persistTask` is Guest/offline only. |
| Add/edit/delete/toggle subtask | OK temporary | Cloud path uses backend commands; `persistTask` is Guest/offline only. |
| Edit title | OK temporary | Cloud path uses `edit_task`; `persistTask` is Guest/offline only. |
| Add time | OK temporary | Cloud path uses `add_time`; `persistTask` is Guest/offline only. |
| Urgency/resistance/deadline/vital/today | OK temporary | Cloud path uses backend commands; `persistTask` is Guest/offline only. |
| Reorder / heat zone | OK temporary | Cloud path uses backend commands; `persistTask` is Guest/offline only. |
| Complete / kill | OK temporary | Cloud path uses backend commands through `runCloudTaskAction`; `persistTask` is fallback/offline path. |
| Rescue start/shift/complete | Backend command path | Cloud path uses first-class `rescue_started`, `rescue_shift_recorded`, and `rescue_completed` actions. Guest/offline keeps local fallback. |
| Angel Lab merge apply | OK temporary | Cloud path uses backend `add_subtask` commands; Guest/offline keeps local persist. |
| Angel Lab create apply | OK temporary | Cloud path uses backend `add_task` and marks cards added only after command success. |
| Restore completed to active | OK temporary | Cloud path routes through `reopen_task`; offline fallback keeps local writes. |
| Resurrect cemetery task | OK temporary | Cloud path routes through `reopen_task`; offline fallback keeps local writes. |
| Move completed task to Cemetery | OK temporary | Cloud path routes through `kill_task`; offline fallback keeps local writes. |
| Heaven bulk clean/delete | OK temporary | Cloud path uses backend commands and applies returned snapshot; offline fallback keeps local writes. |
| Snapshot create/restore | Backend command path | Cloud path uses `create_snapshot` / `CREATE_SNAPSHOT` and `restore_snapshot` / `RESTORE_SNAPSHOT`; backend creates backups, restores snapshot tasks, deletes absent tasks, and writes snapshot events. |
| Startup protected-task repair | Backend command path | Cloud path uses `repair_protected_tasks` / `REPAIR_PROTECTED_TASKS`; backend revives protected dead tasks that came from stale state and writes `PROTECTED_TASKS_REPAIRED`. |
| Telegram webhook task mutations | Backend command path | Old unused direct `mutatePlanner` handlers were removed; live text and callback actions go through `executePlannerAction` and `PlannerCommandService`. |
| Frontend direct cloud persistence | Hard-guarded | `persistTask` and `persistScore` no longer save cloud state directly; backend command failure must not silently write around the engine. |
| Capture extraction task enrichment | Backend command path | `capture-extractor` now applies matched urgency/resistance/vital/deadline/life-area/commitment hints through `TASK_APPLY_EXTRACTION_HINTS` instead of direct task mutation. |

Remaining backend `mutatePlanner(...)` exceptions:

- Snapshot backup/create/restore writes stay inside backend snapshot commands.

Rule: any cloud path that still needs `persistTask(...)` is technical debt unless it is a documented migration/cache repair path.

Legacy priority modules:

- `api/_lib/angel-decision-store.js` is legacy. Active routes must not call `resolveDailyAngelDecision(...)`; mission/rescue decisions come from `plannerMeta`.

## Next backend-contract targets

1. Convert remaining root metadata writes to first-class commands when they become product behavior, not infrastructure.
2. Add backend observability around command/tick/outbox health without exposing technical noise to users.

Recent backend-contract progress:

- Telegram `/today` now prefers `plannerMeta.mission_task_id` / `plannerMeta.suggested_rescue_task_id` as a virtual angel projection instead of writing `angelPinned` onto tasks.
- Telegram `/panic` now prefers `plannerMeta.suggested_rescue_task_id`, then `plannerMeta.mission_task_id`, then local fallback.
- Telegram `/today` and `/panic` refresh `plannerMeta` through `runPlannerTick(..., allowScheduledNudge: false)` before rendering, so manual commands do not accidentally send scheduled nudges.
- Command-triggered engine ticks use `allowScheduledNudge: false`; scheduled/forced nudge endpoints keep the default nudge behavior.
- Event actor mapping now respects `actor_ref` / `source`: engine+angel reports as `angel`, engine+devil or cemetery/death reports as `devil`, and ordinary Telegram user actions stay user-authored.
- Telegram context and rescue override writes now go through `SET_PLANNER_CONTEXT` in `PlannerCommandService` instead of direct `mutatePlanner(...)` calls in `planner-action-executor`.
- Telegram no longer calls `resolveDailyAngelDecision(...)` as a second priority brain; `/today` uses refreshed `plannerMeta` plus a no-op fallback when meta is empty.
- Old angel override helper code was removed from `planner-action-executor`; override patching now lives in `PlannerCommandService`.
- Telegram `/today` orders digest tasks by `plannerMeta.mission_task_id`, then `plannerMeta.suggested_rescue_task_id`, then ordinary priority sorting.
- Telegram chat linking now goes through first-class `LINK_TELEGRAM_CHAT` command instead of direct `mutatePlanner(...)`.
- `SET_PLANNER_CONTEXT` and `LINK_TELEGRAM_CHAT` are command-log-only technical commands: they write `plannerCommands` records with `debug_only: true`, `visible_in_feed: false`, and `visible_in_report: false`; they must not create user-facing planner events.
- Planner bootstrap now projects `plannerMeta.outbox_backlog` with `pending`, `retry`, `dead`, `sending`, and `total` counts so Progress can show whether delivery is merely idle or actually stuck.
- Planner command responses now also include fresh `plannerMeta.outbox_backlog`, so Delivery Health can update after user actions without requiring a full page refresh.
- Planner client bootstrap now runs `runPlannerTick(..., trigger: "bootstrap", allowScheduledNudge: false)` before returning tasks/meta/report items, so opening the app refreshes mission/rescue/heat/report projections without sending scheduled Telegram/email nudges.
- Planner Engine now stores `plannerMeta.last_bootstrap_tick` when the app wakes the engine during login/bootstrap. Progress Delivery Health shows this separately as "Login refresh", so cron health and user-login refresh are visible instead of being collapsed into one opaque timestamp.
- Progress report rendering now translates existing `report_item`, mission, rescue, at-risk, cemetery, and outbox events into persona-first human text ("Angel picked...", "Devil warning...", "Telegram sent...") without requiring a database migration.
- Planner Engine trigger health is now split by source: `last_bootstrap_tick`, `last_command_tick`, and `last_cron_tick`. Successful/failed/locked runs write the trigger-specific field, and successful runs release the engine lock immediately instead of leaving the user-facing session looking stuck for the full lock TTL.
- Delivery Health now shows the scheduled worker separately from login refresh. This prevents a healthy site-open refresh from hiding a broken cron/Hetzner nudge worker.
- Delivery messages now carry structured `messageKey`, `params`, `persona`, and `taskText` inside outbox payloads and delivery events. Telegram/email can still render channel-specific copy, but the meaning now matches Planner Report instead of living as unrelated strings.
- Planner Engine now emits an `engine_run_summary` report item when one tick produces multiple meaningful changes. This is the backend-owned “what changed while you were away” summary; frontend digesting remains only a display fallback.
- Planner Engine now maintains `plannerMeta.health_snapshot` as a backend-owned health projection for engine heartbeat, scheduled worker, outbox backlog, and latest delivery status. Progress uses this snapshot for the top-level health summary instead of recomputing the meaning only from scattered fields.
- Planner Engine now writes `plannerMeta.engine_decisions` and mirrors it into `health_snapshot.decisions`. This is a compact backend-owned list of the latest mission, rescue, at-risk, cemetery, and outbox decisions, shown in Progress so the user can see what the engine actually decided, not only whether it is alive.
- The “while you were away” popup now prefers backend engine decisions as the first digest highlights, with raw report events as fallback/supporting context. This keeps the popup product-facing instead of looking like a technical event feed.
- Planner Engine now writes `plannerMeta.engine_inbox` and mirrors it into `health_snapshot.inbox`. This is the engine-facing attention list: overdue tasks, cold tasks, missing first steps, cemetery moves, queued messages, scheduled nudge slots, or a clear state. Progress renders it next to health/decisions as the current operational inbox of the planner brain.
- Planner bootstrap now includes `plannerMeta.debug_runs` with the latest engine and outbox runs. Progress renders this behind a collapsed `Debug runs` disclosure so operator visibility exists without turning the product UI into an admin dashboard.
- Planner bootstrap now includes a sanitized `plannerMeta.outbox_queue` with pending/retry/dead/sending delivery items. Progress can show what exactly is stuck in the queue without exposing Telegram chat IDs or email recipients.
- Regular web commands now return a fresh bootstrap snapshot in the same response. Task state, Planner Report, health, debug runs, and outbox queue can update after the action without waiting for a delayed refresh or manual F5.
- Telegram-style planner routes now also use the same bootstrap snapshot after command execution. Web client actions and generic planner actions receive the same `planner_meta`, report items, event items, debug runs, and outbox queue shape instead of a thinner Telegram-only state.
- Planner Engine summary and decision projections count only newly queued outbox rows. Repeated cron/manual ticks for the same delivery slot no longer create extra summary noise just because an already-deduped outbox candidate was considered again.
- Planner bootstrap now exposes a sanitized `plannerMeta.engine_lock` snapshot. Progress can show whether the engine lock is active, released, expired, or missing without exposing raw lock internals.
- Web command idempotency keys for high-risk actions now use short time buckets instead of raw `Date.now()`. Fast double clicks/retries reuse the same key, while intentional repeats after a few seconds still work.
- More web mutation commands now use bucketed idempotency keys for task edits, subtasks, timers, drag/reorder, heat-zone moves, Angel Lab merges, and cleanup actions. This reduces accidental duplicate backend commands from double taps, retries, or UI repeat clicks.
- Client Firestore mutation helpers (`saveTask`, `deleteTask`, `saveScore`, `savePlannerEvent`, `restoreFromSnapshot`) now block direct writes for cloud users unless an explicit maintenance/migration override is passed. This makes `PlannerCommandService` the enforced write path instead of just a convention.
- Planner bootstrap now exposes `plannerMeta.command_health`, a backend-owned command-path health projection derived from recent `plannerCommands`: latest status, no-op count, idempotency reuse count, unknown count, and last command metadata. Progress shows this as a compact health card above raw command history.
- Telegram webhook now writes debug-only `plannerEvents` for inbound messages, resolved routes, callbacks, executed routes, and webhook errors. These are visible in Progress as delivery/route traces but are not login report items.
- Progress now separates human-facing Planner Report / Event log from `debug_only` technical traces. Telegram webhook traces remain inspectable, but they no longer visually compete with user/angel/devil activity.
- Outbox failures now store a normalized `diagnostic` object with `code`, `hint`, `message`, and `channel`. Delivery Health and Debug runs translate these codes into human-readable reasons such as Telegram chat unreachable, invalid token, email not configured, email auth failed, or provider/network failure.
- Progress Debug runs now has authenticated manual controls: `Run engine now` calls `runPlannerTick(..., trigger: "manual", allowScheduledNudge: false)` and `Drain outbox now` calls `drainOutbox(...)`, then refreshes planner meta/report state without requiring a page reload.
- Planner bootstrap now exposes compact `plannerMeta.command_history` from `plannerCommands`: latest command type, `ok` / `no-op` / `reused`, reuse count, actor/source, and task text. Progress can show whether a web/Telegram action reached `PlannerCommandService` or was collapsed by idempotency.
- Planner bootstrap now exposes `plannerMeta.engine_contract_status`, a backend-owned architecture status projection. Progress shows stable/warning layers for command service, idempotency, event log, outbox, report projection, engine tick, direct client write guard, and remaining legacy risk.

### 2026-05-09 — Cloud local fallback guard

Added an explicit web-side guard for cloud users: if a PlannerCommandService action does not start, the UI must not silently continue into the legacy local mutation branch.

Covered user-facing task mutations include touch, add/edit/delete/toggle subtask, edit task title, timer writes, urgency/resistance/deadline/vital/today updates, complete, cemetery move, reopen, and completed-to-cemetery moves.

This is still a transitional safety layer, not the final architecture. The final target remains: remove the legacy local mutation branches from cloud paths entirely and keep them only as guest/offline behavior.

### 2026-05-09 — Engine contract legacy risk downgraded to guarded

`plannerMeta.engine_contract_status.layers[].legacy_risk` is no longer a permanent warning after the cloud fallback guard. The remaining local branches are treated as guarded transitional code: acceptable for Guest/offline behavior, not acceptable as a cloud write path.

The next cleanup target is deletion, not more guards: remove or isolate legacy branches once every product action has a stable backend command equivalent.

### 2026-05-09 — Guest mutation gateway in App.js

Introduced `mutateGuestSingleTask(...)` as the explicit gateway for remaining single-task local mutations in `App.js`.

Cloud product actions still attempt backend commands first. If the command does not start, the guest mutation gateway blocks the local fallback and shows a backend refresh message. This makes local mutation code structurally guest/offline-only instead of being mixed into cloud behavior.

Converted the main single-task handlers: touch, subtasks, title edit, timer, urgency, resistance, deadline, vital, heat-zone restore, complete, cemetery, reopen, completed-to-cemetery, today toggle, and Angel Lab merge fallback.

### 2026-05-09 — Guest bulk operation gateway in App.js

Introduced `runGuestOnlyBulkOperation(...)` for remaining multi-task or whole-list local operations in `App.js`.

Covered bulk/local fallback areas: reorder, Heaven junk cleanup, Heaven junk purge, delete forever, manual snapshot create fallback, and snapshot restore fallback.

Cloud behavior remains backend-owned. These branches exist only for Guest/offline mode and are blocked for cloud users if the backend command path does not run.

### 2026-05-09 — Guest gateway extracted from App.js

Moved the local fallback boundary into `src/guestPlannerGateway.js`.

`App.js` now imports `createGuestPlannerGateways(...)` and receives three explicit gateway functions:

- `blockCloudLocalFallback(...)`
- `mutateGuestSingleTask(...)`
- `runGuestOnlyBulkOperation(...)`

This keeps the cloud-vs-guest write rule outside the main UI file and prepares the next extraction step: moving actual guest mutation implementations out of `App.js`.

### 2026-05-09 — First guest task mutation builders extracted

Added `src/guestTaskMutations.js` with small guest/offline mutation builders:

- `updateGuestTaskFields(...)`
- `toggleGuestTaskBoolean(...)`

`App.js` now uses these helpers for guest/offline urgency, resistance, deadline, and vital changes. This is the first step toward moving actual guest mutation implementations out of the main UI file while keeping cloud behavior backend-owned.

### 2026-05-09 — More guest mutation builders extracted

Extended `src/guestTaskMutations.js` with guest/offline builders for:

- `touchGuestTask(...)`
- `editGuestTaskTitle(...)`
- `addGuestTaskTime(...)`

`App.js` now delegates guest/offline touch, title edit, and timer fallback mutation building to this module. Cloud behavior remains backend-command-only.

### 2026-05-09 — Guest subtask mutation builders extracted

Extended `src/guestTaskMutations.js` with guest/offline subtask builders:

- `addGuestSubtask(...)`
- `deleteGuestSubtask(...)`
- `editGuestSubtask(...)`
- `toggleGuestSubtask(...)`

`App.js` now delegates guest/offline subtask mutation building to this module. Event narration and UI status remain in `App.js`; cloud persistence remains backend-command-only.

### 2026-05-09 — Guest world transition builders connected

`App.js` now delegates guest/offline world transitions to `src/guestTaskMutations.js`:

- `completeGuestTask(...)`
- `moveGuestTaskToCemetery(...)`
- `reopenGuestTask(...)`
- `toggleGuestToday(...)`

This covers local fallback behavior for Heaven, Cemetery, returning to Active, completed-to-cemetery cleanup, and Today shortlist toggles. Cloud users still go through `PlannerCommandService`; these helpers are only the remaining Guest/offline implementation.

### 2026-05-09 — Guest bulk mutation builders extracted

Added `src/guestBulkMutations.js` for guest/offline list-level operations:

- `reorderGuestActiveTasks(...)`
- `moveGuestTasksToCemetery(...)`
- `removeGuestTasksById(...)`

`App.js` now delegates guest/offline reorder, Heaven junk cleanup, Heaven junk purge, and delete-forever list calculations to this module. Cloud behavior remains backend-command-owned; these helpers only preserve Guest/offline behavior during the Planner Engine transition.

### 2026-05-09 — Guest snapshot fallback extracted

Added `src/guestSnapshotMutations.js` for guest/offline snapshot operations:

- `createGuestTaskSnapshot(...)`
- `restoreGuestTaskSnapshot(...)`

`App.js` now delegates guest/offline snapshot create/restore implementation to this module. Cloud snapshot actions remain backend-command-owned through `PlannerCommandService`.

### 2026-05-09 — Remaining guest single-task builders extracted

Extended `src/guestTaskMutations.js` with the remaining guest/offline builders that used to be assembled manually in `App.js`:

- `createGuestTask(...)`
- `setGuestHeatZone(...)`
- `appendGuestUniqueSubtasks(...)`

`App.js` now delegates guest/offline creation, heat-zone movement, and Angel Lab merge-subtask fallback to the guest mutation module. The remaining `commitTasks(...)` calls in `App.js` are mostly state acceptance from backend/bootstrap or explicit UI-level list commits.

### 2026-05-09 — Planner client state adapter introduced

Added `src/plannerClientStateAdapter.js` with `buildPlannerClientUpdate(...)` to normalize backend command/bootstrap/debug responses before `App.js` applies them.

`App.js` now uses this adapter for:

- manual report refresh
- `runPlannerClientAction(...)`
- planner debug actions
- `applyPlannerClientState(...)`

This reduces duplicated parsing of `tasks`, `score`, `planner_meta`, `report_items`, `report_history_items`, and `event_items`. The UI still owns visual side effects, but backend response shape is now handled in one client adapter.

### 2026-05-09 — Initial planner bootstrap uses client state adapter

The initial `/api/planner-client-actions` `planner_bootstrap` load now uses `buildPlannerClientUpdate(...)` too.

This removes the last duplicated parsing block for `planner_meta`, `score`, `tasks`, `report_items`, `report_history_items`, and `event_items` from the bootstrap path. `App.js` still decides how to display reports and UI panels, but backend response normalization is centralized in `src/plannerClientStateAdapter.js`.

### 2026-05-09 — Planner local storage adapter introduced

Added `src/plannerLocalStorage.js` as the local persistence boundary for guest/offline state, cloud cache, pulse state, and planner event cache.

`App.js` now uses this adapter for:

- loading guest/offline tasks and score
- saving guest/offline tasks and score
- loading/saving cloud cache wrappers
- loading/saving pulse state wrappers
- Angel Lab fallback active-task lookup from guest storage

This keeps browser storage key/format knowledge out of the main UI flow and makes the remaining local storage usage easier to isolate from the Planner Engine backend path.

### 2026-05-09 — Planner command client adapter introduced

Added `src/plannerCommandClient.js` as the browser-side command transport boundary for Planner Engine calls.

`App.js` now delegates these backend calls to the adapter:

- planner command execution
- planner bootstrap/report refresh
- initial login/bootstrap report load
- planner debug engine/outbox runs
- report acknowledgement

The UI still decides what to render and which optimistic/status messages to show, but token handling, endpoint details, JSON parsing, and backend error normalization now live outside the main app component.

### 2026-05-09 — Frontend planner command names centralized

Added `src/plannerCommandContract.js` with frontend-side constants for Planner Engine command names and special client modes.

`App.js` now calls backend actions through `PLANNER_ACTIONS` instead of inline string literals for the main web command path. `src/plannerCommandClient.js` uses `PLANNER_CLIENT_MODES` for bootstrap, debug-run, and report acknowledgement.

This is a bridge step before a fully shared server/client command contract. It reduces accidental typos and makes it clearer which UI actions are real Planner Engine commands.

### 2026-05-09 — Server planner client modes centralized

Added `api/_lib/planner-client-modes.js` for server-side special client modes:

- `planner_bootstrap`
- `planner_debug_run`
- `report_ack`

`api/planner-client-actions.js` now compares incoming mode values through `PLANNER_CLIENT_MODES` instead of inline literals. This keeps the client endpoint contract explicit while leaving canonical planner actions in `api/_lib/planner-contract.js`.

### 2026-05-10 — Server planner action names centralized

Added `api/_lib/planner-action-types.js` as the server-side canonical action-name dictionary for Planner Engine actions.

`api/_lib/planner-contract.js` now builds its allowed action list from `PLANNER_ACTIONS` instead of maintaining a separate literal array. The request validator and route builder still keep the same behavior, but action names are now less likely to drift between web, Telegram, and backend command handling.

### 2026-05-10 — Telegram intent parser uses server action dictionary

`api/_lib/telegram-intent.js` now imports `PLANNER_ACTIONS` from `api/_lib/planner-action-types.js` for its allowed intent set and deterministic quick-intent returns.

This keeps Telegram's natural-language parser aligned with the same canonical action names accepted by `planner-contract.js`. The parser logic and wording stay unchanged; only the action-name source moved into the shared server contract.

### 2026-05-10 — Telegram router and callbacks use action dictionary

`api/_lib/planner-agent-router.js` and `api/telegram-webhook.js` now use `PLANNER_ACTIONS` for Telegram route/callback action names where those routes map to canonical Planner Engine commands.

This keeps deterministic Telegram routing, callback buttons, and backend action validation pointed at the same action dictionary. Non-command technical route types such as `noop` and `unknown_command` remain local router control states.

### 2026-05-10 — Planner action executor route checks use action dictionary

`api/_lib/planner-action-executor.js` now imports `PLANNER_ACTIONS` and uses it for canonical `route.type` checks that correspond to Planner Engine actions.

This keeps the execution layer aligned with the same server action dictionary used by request validation, Telegram intent parsing, and Telegram callbacks. Internal command-service command types such as `TASK_COMPLETE` and `TASK_MOVE_TO_CEMETERY` remain separate for now; they are the next lower layer of the engine contract.

### 2026-05-10 — Internal PlannerCommandService command types centralized

Added `api/_lib/planner-command-types.js` with `PLANNER_COMMAND_TYPES` for internal engine command-service commands such as `TASK_COMPLETE`, `TASK_MOVE_TO_CEMETERY`, `CREATE_OR_MERGE_TASK`, and `SET_PLANNER_CONTEXT`.

`api/_lib/planner-action-executor.js` now sends internal command types through `PLANNER_COMMAND_TYPES`, and `api/_lib/planner-command-service.js` compares/persists command types through the same dictionary. This separates external planner actions from internal engine commands while keeping both layers explicit.

### 2026-05-10 — Planner event types centralized

Added `api/_lib/planner-event-types.js` with `PLANNER_EVENT_TYPES` for append-only planner events such as `TASK_COMPLETED`, `TASK_MOVED_TO_CEMETERY`, `RESCUE_SHIFT_RECORDED`, `SNAPSHOT_RESTORED`, and cleanup events.

`api/_lib/planner-command-service.js` now writes and compares planner event types through this dictionary instead of inline uppercase strings. This keeps the next layer of the engine contract explicit:

- external action names live in `api/_lib/planner-action-types.js`
- internal command names live in `api/_lib/planner-command-types.js`
- event-log names live in `api/_lib/planner-event-types.js`

The behavior is unchanged. This is a stability step so report projection, outbox, and future admin/debug views can depend on one event vocabulary.

### 2026-05-10 — Command dispatcher uses command dictionary

`api/_lib/planner-command-service.js` now routes dispatcher command names through `PLANNER_COMMAND_TYPES` instead of inline command strings.

The command layer now has one vocabulary for both writing command records and deciding which command handler runs. Legacy aliases like `TASK_CREATE` and `CREATE_TASK` are explicit constants too, so backwards compatibility is visible instead of hidden in string comparisons.

### 2026-05-10 — Planner action executor command adapter introduced

`api/_lib/planner-action-executor.js` now uses small adapter helpers for command payload execution:

- `buildPlannerActionCommand(...)`
- `buildPlannerActionActor(...)`
- `executePlannerActionCommand(...)`

Telegram/action handlers now hand command-service payloads through this adapter instead of repeating `runPlannerCommand({ userId, command, actor })` wiring in every branch. This keeps the action executor as a routing/response layer and makes command-service the single mutation layer.

Also fixed the unset-today/unset-vital route mapping so those route keys point at `PLANNER_ACTIONS.UNSET_TODAY` and `PLANNER_ACTIONS.UNSET_VITAL` explicitly.

### 2026-05-10 — Route-to-command mappings made explicit

`api/_lib/planner-action-executor.js` now keeps route-to-command mappings near the top of the file:

- `RESCUE_ROUTE_COMMAND_TYPES`
- `TASK_TUNING_ROUTE_COMMAND_TYPES`

The executor no longer defines these command maps inside action branches. This makes the adapter boundary clearer: route types are external action-level decisions; command types are engine-level mutations.

### 2026-05-10 — Action-to-command map extracted

Added `api/_lib/planner-action-command-map.js` as the explicit adapter contract between action routes and engine command types.

It owns:

- `RESCUE_ROUTE_COMMAND_TYPES`
- `TASK_TUNING_ROUTE_COMMAND_TYPES`
- route type groups
- small lookup helpers for route-to-command conversion

`api/_lib/planner-action-executor.js` now imports this map instead of owning the mapping inline. This keeps executor focused on resolving tasks and sending user-facing responses, while the action-to-command contract lives in one dedicated module.

### 2026-05-10 — Planner command builders introduced

Added `api/_lib/planner-command-builders.js` as the command payload factory layer between action routes and `PlannerCommandService`.

`api/_lib/planner-action-executor.js` now uses builder functions such as:

- `buildCreateOrMergeTaskCommand(...)`
- `buildTaskTuningCommand(...)`
- `buildRescueCommand(...)`
- `buildToggleSubtaskCommand(...)`
- `buildDeleteForeverCommand(...)`

This keeps command payload shape centralized. The executor still resolves tasks and sends human-facing Telegram responses, but no longer hand-builds most engine command objects inline.

### 2026-05-10 — Telegram context adapter extracted

Added `api/_lib/planner-telegram-context.js` as the dedicated adapter for Telegram conversation memory.

It owns the `SET_PLANNER_CONTEXT` command payload and actor construction through:

- `buildTelegramContextCommand(...)`
- `buildTelegramContextActor(...)`
- `setPlannerContextFromTelegram(...)`

`api/_lib/planner-action-executor.js` now imports this helper instead of building Telegram context commands inline. This keeps action execution separate from Telegram dialogue memory.

### 2026-05-10 — Telegram copy helpers introduced

Added `api/_lib/planner-telegram-copy.js` for Telegram response copy that depends on route type and updated task data.

`api/_lib/planner-action-executor.js` now uses:

- `buildRescueActionMessage(...)`
- `buildTaskTuningMessage(...)`

This is the first copy extraction step. The executor still sends responses, but repeated message maps no longer live inline with command execution logic.

### 2026-05-10 — More Telegram task-action copy extracted

`api/_lib/planner-telegram-copy.js` now owns success response copy for common task actions:

- task completed, including overdue bonus copy
- movement/touch recorded
- moved to Cemetery
- deleted forever
- add/create-or-merge task messages with metadata

`api/_lib/planner-action-executor.js` still owns branching and error responses, but more successful mutation copy now lives in the Telegram copy layer.

### 2026-05-10 — More Telegram task action copy extracted

`api/_lib/planner-telegram-copy.js` now owns success-message copy for completion, movement, manual cemetery, delete-forever, and add/update task responses.

`api/_lib/planner-action-executor.js` still resolves tasks and sends replies, but task action wording is moving into the copy layer so the executor can stay focused on routing and side effects.

### 2026-05-10 — Telegram operational copy extracted

`api/_lib/planner-telegram-copy.js` now also owns Telegram success-message copy for subtask add/delete/edit/toggle, task reorder, bulk Heaven cleanup, snapshot restore, and time tracking.

`api/_lib/planner-action-executor.js` still keeps lookup/error handling for now, but successful task-operation wording is no longer embedded in the executor.

### 2026-05-10 — Planner command runner boundary introduced

`api/_lib/planner-command-runner.js` now owns the adapter boundary between Telegram action routes and `runPlannerCommand`.

`api/_lib/planner-action-executor.js` no longer calls `runPlannerCommand` directly. This creates a stable seam where Planner Engine recompute, report projection, and outbox enqueueing can be attached later without rewriting Telegram routing.

### 2026-05-10 — Post-command engine hook added to command runner

`api/_lib/planner-command-runner.js` now runs `runPlannerTick(..., trigger: "command", allowScheduledNudge: false)` after Telegram command mutations by default.

`api/_lib/planner-actions-runtime.js` marks web/API routes with `__skipPostCommandHook` because that runtime already performs its own command tick before returning a fresh bootstrap snapshot. This keeps Telegram proactive without double-ticking web commands.

### 2026-05-10 — Post-command hook extracted

`api/_lib/planner-post-command-hook.js` now owns the post-command Planner Engine wake-up.

`api/_lib/planner-command-runner.js` calls `runPostCommandPlannerEngine(...)` instead of knowing about `runPlannerTick(...)` directly. This keeps the runner thin and gives report projection / outbox enqueueing a dedicated future home.

### 2026-05-10 — Post-command hook contract normalized

`runPostCommandPlannerEngine(...)` now returns a structured `postCommand` object with `status`, `trigger`, `ranAt`, `runId`, `locked`, `engine`, and `error` fields.

`executePlannerActionCommand(...)` attaches this object to command results while keeping legacy `engine` / `engineError` fields for compatibility. Future report/outbox/debug code should read `postCommand` instead of inferring hook state from scattered fields.

### 2026-05-10 — Post-command status stored in command history

Post-command hook status is now persisted back onto the matching `plannerCommands` document as compact `postCommand` / `post_command` metadata.

`plannerMeta.command_history.items[]` now exposes that `postCommand` object, and `plannerMeta.command_health` counts recent failed or locked post-command engine wake-ups. This means Progress can distinguish "the command mutation worked" from "the command worked but the engine did not wake cleanly".

### 2026-05-10 — Post-command status surfaced in Progress

Progress backend command history now displays compact post-command engine wake-up status per command (`engine ok`, `engine locked`, or `engine failed`).

Command health now includes recent post-command failed/locked counts and can show a warning when commands mutate successfully but the Planner Engine wake-up is blocked or failing.

### 2026-05-10 — Report projection connected to post-command hook

`api/_lib/planner-report-projector.js` now projects recent `plannerEvents` with `visible_in_report: true` into stable `reportItems` when a matching report item is missing.

`runPostCommandPlannerEngine(...)` runs this projector after the command-triggered engine wake-up. Compact projection stats are stored on `postCommand` as `reportProjected`, `reportChecked`, and `reportProjectionOk`, and Progress can show `report +N` next to backend commands.

### 2026-05-10 — Report projection health added to command health

`plannerMeta.command_health` now counts recent report projection failures and successful projection work: `reportProjectionFailedCount`, `reportProjectedCount`, and `reportCheckedCount`.

Progress now distinguishes command mutation problems, post-command engine wake-up problems, and report projection problems. This makes "Angel/Devil did not narrate it" diagnosable as a backend pipeline issue instead of a vague UI symptom.

### 2026-05-10 — Outbox health added to command health

Post-command hook now checks the delivery outbox after command-triggered Planner Engine wake-up and report projection.

`plannerMeta.command_health` now exposes compact delivery queue signals: `outboxCheckFailedCount`, `outboxQueuedCount`, `latestOutboxPending`, `latestOutboxRetry`, `latestOutboxDead`, `latestOutboxSending`, and `latestOutboxTotal`.

Progress can now distinguish command mutation failure, engine wake-up failure/lock, report projection failure, and delivery queue trouble. This keeps Telegram/email delivery problems visible without making Telegram or email responsible for planner decisions.

### 2026-05-10 — Post-command contract versioned

Compact `postCommand` metadata stored on `plannerCommands` now includes `contractVersion: 1`.

This makes the command-to-engine bridge an explicit backend contract rather than an incidental object shape. Progress, audits, and future admin/debug views should treat `postCommand.contractVersion === 1` as the current stable shape for post-command engine wake-up, report projection, and outbox health metadata.

### 2026-05-10 — Delivery status contract versioned

`plannerMeta.delivery_status` now carries `contractVersion: 1` plus stable delivery diagnostics: `attempt`, `errorCode`, `errorHint`, `resultAt`, channel, topic, persona, message key, and task text.

Progress delivery rows can now explain the latest Telegram/email delivery attempt instead of only showing aggregate outbox backlog. This keeps delivery as a backend-owned contract: channels report results, but Planner Engine remains the source of decisions.

### 2026-05-10 — Outbox run results versioned

`outboxRuns.results[]` now uses `contractVersion: 1` and mirrors the same delivery diagnostics as `plannerMeta.delivery_status`: outbox id, channel, topic, status, attempt, error code, error hint, and diagnostic payload.

This makes debug runs and latest delivery status comparable. If Telegram/email delivery breaks, Progress can show both the latest user-facing signal and the raw queue-processing trace without translating two unrelated shapes.

### 2026-05-10 — Health snapshot uses delivery contract

`plannerMeta.health_snapshot` now reads the versioned `plannerMeta.delivery_status` contract when deciding top-level delivery health.

If the latest delivery attempt is `retry` or `dead`, the health reason becomes `delivery_retry` or `delivery_dead` before falling back to generic outbox backlog reasons. Progress can now explain the actual latest Telegram/email delivery attempt with channel, status, attempt number, error code, and hint.

### 2026-05-10 — Delivery contract surfaced in engine contract status

`plannerMeta.engine_contract_status.layers[]` now includes `delivery_contract`.

The layer reports whether a versioned `plannerMeta.delivery_status` has been observed and whether the latest delivery is clean, retrying, or dead. This makes delivery contract health visible in Progress alongside command service, idempotency, event log, outbox, report projection, and engine tick layers.

### 2026-05-10 — Report items contract v1

New `reportItems` now carry `contractVersion: 1` plus stable projection metadata: `sourceEventId`, `sourceType`, and `projection { version, projectedAt, projector, sourceEventType }`.

This applies to report items created by the report projector, Planner Engine, and Planner Command Service. The client preserves these fields when normalizing report items for Planner Report.

`plannerMeta.engine_contract_status.layers[]` now includes `report_items_contract`, so Progress can show whether recent Planner Report rows are using the versioned backend projection contract.

### 2026-05-10 — Report ack contract v1

`ackReportItems(...)` now returns `contractVersion: 1` and writes a hidden `REPORT_ITEMS_ACKED` planner event when report items are marked seen.

Each acknowledged report item also receives an `ack { contractVersion, ackedAt, source }` block next to `seenAt/seen_at`. The event is not user-facing (`visible_in_feed: false`, `visible_in_report: false`), but it makes “user saw/closed the report” auditable for backend diagnostics.

### 2026-05-10 — Report ack contract surfaced in engine contract status

`plannerMeta.engine_contract_status.layers[]` now includes `report_ack_contract`.

The layer checks recent report items for the versioned `ack { contractVersion, ackedAt, source }` block. Progress can now distinguish "no report has been acknowledged yet" from "acknowledged reports exist but are still using an unversioned shape".

### 2026-05-10 — Engine run summary contract v1

Planner Engine now builds a versioned `engineRunSummary` contract for each successful tick. The summary includes `contractVersion: 1`, run id, trigger, meaningful change count, stats, cemetery task ids, queued outbox ids, and event types.

`engine_run_summary` report items now carry the summary in projection metadata, and `plannerMeta.engine_contract_status.layers[]` includes `engine_run_summary_contract` so Progress can show whether the latest engine run summary is versioned.

### 2026-05-10 — Engine run summary visible in Progress debug

Progress Debug runs now renders the versioned `engineRunSummary` contract when present: summary version, meaningful changes, cemetery moves, queued outbox items, and event count.

This makes the latest Planner Engine tick readable without opening raw Firestore docs or inferring meaning from scattered stats.

### 2026-05-10 — Planner client update response contract v1

Planner bootstrap now returns `contractVersion: 1` and `responseShape: "planner_client_update_v1"` directly.

`api/planner-client-actions.js` also wraps command/debug responses in the same contract, so the browser has one expected response shape for bootstrap, commands, manual engine runs, and outbox drains.

`src/plannerClientStateAdapter.js` is the browser-side contract boundary. It normalizes task state, planner meta, report items, report history, event feed items, and response-contract status from that one shape. UI handlers should not manually re-apply state from raw API payloads after calling the adapter.

Progress now shows whether the frontend received the current response contract. If the backend returns `ok:false`, a missing `responseShape`, or an old `contractVersion`, it is treated as a contract warning instead of being silently accepted.

`api/_lib/planner-client-response-contract.js` owns the backend constants and wrapper for this response shape. API routes should import this helper instead of rewriting `contractVersion` / `responseShape` by hand.

`api/planner-client-actions.js` now wraps error responses in the same contract too. A failed command can still return HTTP 400/401/500, but the JSON body remains recognizable as `planner_client_update_v1` with `ok:false`, which lets Progress diagnose backend failure vs. legacy response shape.

Report acknowledgement responses from the same endpoint are also wrapped in `planner_client_update_v1`. They may not carry a fresh task snapshot, but they no longer create a second response vocabulary for the browser.

`applyPlannerClientUpdate(...)` now records response-contract status before deciding whether the response contains useful state to apply. This matters for lightweight responses such as `report_ack`: the UI may not need to mutate tasks, but Progress should still know that the frontend/backend contract is healthy.

The backend response wrapper also normalizes `report_items`, `report_history_items`, and `event_items` from either top-level payload fields or `state.*` fields. This keeps future endpoints from accidentally hiding report/event data inside a nested state object that the browser adapter would otherwise miss.

`src/plannerCommandClient.js` now throws `PlannerClientActionError` with the backend payload attached. `App.js` applies that payload before rethrowing command/debug errors, so Progress can still show `ok:false` contract diagnostics even when a command fails.

`runPlannerDebug(...)` and `ackPlannerReportItems(...)` now accept `reportLimit` in the browser command client, matching the bootstrap command style. This keeps report-loading knobs explicit instead of hiding them inside individual command helpers.

The “while you were away” dismiss flow now applies the `report_ack` response payload through `applyPlannerClientState(...)`. Closing a report still removes it optimistically from the screen, but the frontend response-contract status now reflects the ack endpoint result instead of ignoring that backend response.

`buildPlannerClientUpdate(...)` now exposes `hasStatePayload`, a small adapter-owned flag that says whether the response contains task/meta/report/event state beyond response-contract diagnostics. This makes diagnostic-only responses explicit and keeps `applyPlannerClientUpdate(...)` from inferring intent from scattered field checks.

### 2026-05-11 — Snapshot restore uses command runner

`api/snapshot-read.js` now restores snapshots through `executePlannerActionCommand(...)` instead of calling `runPlannerCommand(...)` directly.

Snapshot restore is a task-state mutation, so it should wake the post-command Planner Engine hook and allow report/outbox/health projections to update like other commands. The endpoint remains legacy/admin-oriented, but it no longer bypasses the command runner seam.

### 2026-05-11 — Telegram technical commands use command runner seam

Telegram chat linking and Telegram context updates now call `executePlannerActionCommand(...)` instead of `runPlannerCommand(...)` directly.

These commands are explicitly marked with `__skipPostCommandHook: true` because they are technical context/link commands, not task-world mutations that should create report/outbox noise. The important architecture change is that the bypass is now visible at the command runner seam instead of being hidden as direct service calls.

### 2026-05-11 — Capture extractor hints use command runner

`api/_lib/capture-extractor.js` now applies `TASK_APPLY_EXTRACTION_HINTS` through `executePlannerActionCommand(...)`.

Extraction hints can change task data, so they should participate in the same post-command wake-up/report/outbox path as web and Telegram task mutations. This leaves `runPlannerCommand(...)` as an internal service called directly only by the command runner.

### 2026-05-11 — Post-command hook skip is centralized

`api/_lib/planner-command-runner.js` now owns `buildSkipPostCommandHookRoute(...)` and `shouldSkipPostCommandHook(...)`.

Technical command paths that intentionally skip the immediate post-command hook now use this helper instead of writing `__skipPostCommandHook` by hand. This keeps the exception visible, named, and centralized while preserving the behavior: Telegram link/context commands do not create report/outbox noise, and `planner-actions-runtime` skips per-action hooks because it runs one consolidated engine tick after route execution.

### 2026-05-11 — Legacy snapshot restore returns client update contract

The POST restore branch of `api/snapshot-read.js` now returns `planner_client_update_v1`.

It still preserves the old `message`, `taskCount`, and `restoredFrom` fields, but it also includes fresh bootstrap state through the shared response wrapper. If this legacy/admin endpoint is used, the caller can now receive tasks, planner meta, report items, and event items in the same response vocabulary as the main client action endpoint.

The GET branches of `snapshot-read` remain read-only legacy snapshot listing/detail responses for now. They do not mutate planner state, so they are lower priority than command/bootstrap/write paths.

### 2026-05-11 — Worker response contract v1

Added `api/_lib/planner-worker-response-contract.js` with `planner_worker_result_v1`.

`api/telegram-nudge.js` now wraps maintenance, manual-force, outbox-drain, deprecated, auth, method, and error responses in this worker contract. This is separate from `planner_client_update_v1`: cron/internal workers do not need to return a browser bootstrap snapshot, but they do need a stable diagnostic response shape for Hetzner/Vercel/manual checks.

### 2026-05-11 — Legacy planner-actions returns client update contract

`api/planner-actions.js` now wraps success and error responses in `planner_client_update_v1`.

This endpoint is still a secret-protected legacy command surface, but it no longer returns a separate unversioned response vocabulary. If `includeState` is requested, callers receive task state, planner meta, reports, and event items through the same client response contract as `/api/planner-client-actions`.

### 2026-05-11 — Endpoint contract boundary

Current Planner Engine response contracts are intentionally scoped:

- Browser/client state and command endpoints use `planner_client_update_v1`.
- Cron/internal worker endpoints use `planner_worker_result_v1`.
- Telegram webhook responses remain Telegram adapter acknowledgements, not planner state responses.
- Calendar, speech-to-text, captures, and snapshot GET routes keep feature-specific response shapes unless they mutate planner state or need to return a planner bootstrap snapshot.

This prevents contract sprawl: not every API route should pretend to be a planner bootstrap route. The rule is that planner-world mutations must go through the command runner, and responses that are meant to update the browser planner state must use `planner_client_update_v1`.

### 2026-05-11 — Shared route response builder

`api/_lib/planner-client-response-contract.js` now owns `buildPlannerRouteClientResponse(...)`.

Both `/api/planner-client-actions` and legacy `/api/planner-actions` use this helper for route-command responses. This keeps `tasks`, `planner_meta`, `report_items`, `report_history_items`, `event_items`, `report_cursor`, and `engine` extraction in one place instead of duplicating the same bootstrap-unpacking code across endpoints.

### 2026-05-11 — Shared report item builder

`api/_lib/planner-report-projector.js` now owns `buildPlannerReportItem(...)`.

Planner Engine, command-service command summaries, and event projection now build report items through the same shape helper. The write locations stay unchanged, but the report contract fields (`contractVersion`, ids, projection, persona, surface, seen state, severity, message key, params) are no longer manually reassembled in multiple modules.

### 2026-05-11 — Shared outbox item builder

Added `api/_lib/planner-outbox-contract.js` with `buildPlannerOutboxItem(...)`.

Planner Engine still decides when to queue Telegram/email delivery, but the storage shape for an outbox row is now centralized: id/outbox id, user id, channel, topic, sanitized payload, pending status, attempts, availability time, dedupe key, cause event, and timestamps. This keeps queued delivery rows consistent across direct write paths and candidate-based transaction paths.

### 2026-05-11 — Frontend write boundary audit

The browser command path is now:

- cloud user mutations go through `src/plannerCommandClient.js` → `/api/planner-client-actions`;
- `/api/planner-client-actions` validates Firebase auth, runs the route through Planner Engine command runtime, and returns `planner_client_update_v1`;
- `src/plannerClientStateAdapter.js` is the browser-side boundary that applies task/meta/report/event state.

`src/firestoreUtils.js` still contains direct Firestore utilities, but cloud writes are guarded by `assertDirectPlannerWriteAllowed(...)`. For cloud users, direct task/score/event/snapshot restore writes throw `planner/direct-cloud-write-blocked`; guest/local and explicit migration/snapshot maintenance paths are the remaining exceptions.

This means the important remaining rule is not “remove every Firestore import from the client”, but “no cloud task-world mutation may bypass `plannerCommandClient` unless it is an explicit, documented maintenance exception.”

### 2026-05-11 — Post-command hook contract

`api/_lib/planner-post-command-hook.js` now names the compact post-command status shape as `planner_post_command_hook_v1`.

Every normal Planner Engine command runner execution can write a compact post-command summary with: engine tick status, report projection status, outbox backlog status, run id, lock state, and queue counts. This is the backend evidence that a user action woke the Planner Engine instead of only mutating task state.

### 2026-05-11 — Route runtime uses post-command hook

`api/_lib/planner-actions-runtime.js` now uses `runPostCommandPlannerEngine(...)` after executing a route.

This keeps legacy `/api/planner-actions` and browser `/api/planner-client-actions` route execution aligned with the command runner: after task mutations, Planner Engine runs, report items can be projected, and outbox backlog is inspected. Route responses also expose `postCommand` / `post_command` through the shared client response builder for diagnostics.

### 2026-05-11 — Telegram trace events use event contract

`api/telegram-webhook.js` still writes Telegram webhook trace events directly to `plannerEvents`, because these are debug/audit records rather than task-world mutations.

The direct write now goes through `normalizeEvent(...)` from `api/_lib/planner-event-contract.js` before storage. This keeps Telegram trace rows in the same event vocabulary as Planner Engine and command-service events: `event_id`, `event_type`, actor fields, visibility flags, timestamps, entity fields, and payload shape.

This is an intentional exception to the command path rule:

- Telegram trace writes do not mutate tasks, score, mission, rescue, reports, or outbox.
- They may stay outside `PlannerCommandService`.
- They must still use the shared event contract.

### 2026-05-11 — Legacy planner-store event helper normalized

`api/_lib/planner-store.js` still exports `writePlannerEvent(...)` for older server helpers, although current live mutation paths write events through Planner Engine / `PlannerCommandService`.

That legacy helper now also passes payloads through `normalizeEvent(...)` before writing to `plannerEvents`. This closes another format drift risk: future callers cannot accidentally create old-style event rows without `event_id`, `event_type`, actor separation, visibility flags, and normalized timestamps.

### 2026-05-11 — Batch event writes use shared event helper

`api/_lib/planner-event-contract.js` now exports `writeEventBatch(...)` alongside the transaction-only `writeEvent(...)`.

`ackReportItems(...)` in Planner Engine uses this helper for its `REPORT_ITEMS_ACKED` audit event. This keeps batch-based event writes on the same path as transaction-based event writes: normalize first, then write the normalized event row to `plannerEvents`.

### 2026-05-11 — Report acknowledgement patch centralized

`api/_lib/planner-report-projector.js` now owns `buildReportAckPatch(...)`.

`ackReportItems(...)` in Planner Engine uses this helper when marking report items as seen. This keeps the report acknowledgement storage contract (`seenAt`, `seen_at`, `ack.contractVersion`, `ack.ackedAt`, `ack.source`) in one place instead of rebuilding it inline inside the Engine.

### 2026-05-11 — Direct event writes use shared event helper

`api/_lib/planner-event-contract.js` now exports `writeEventDirect(...)` for async non-transaction event writes.

The remaining direct event write paths now use it:

- delivery status events in Planner Engine;
- Telegram webhook trace events;
- legacy `writePlannerEvent(...)` in `planner-store`.

This gives all three event write modes the same contract boundary:

- `writeEvent(...)` for transactions;
- `writeEventBatch(...)` for batches;
- `writeEventDirect(...)` for direct async writes.

### 2026-05-11 — Command report writes use report storage helper

`api/_lib/planner-report-projector.js` now exports `writePlannerReportItemTransaction(...)`.

`PlannerCommandService` still decides when a command should create a history/report item, but the transaction write target for `reportItems` now lives in the report contract module instead of inline in the command service. This keeps command reports aligned with the shared `buildPlannerReportItem(...)` shape.

### 2026-05-11 — Engine report writes use report storage helper

`api/_lib/planner-event-contract.js` now also writes engine report items through `writePlannerReportItemTransaction(...)`.

This means both command-authored report items and engine-authored report items share the same report storage helper. `writeReportItem(...)` still owns the engine-specific report content defaults, but it no longer owns the Firestore write target.

### 2026-05-11 — Outbox write helpers moved to outbox contract

`api/_lib/planner-outbox-contract.js` now owns:

- `writeOutboxIfMissing(...)`;
- `buildOutboxCandidate(...)`.

Planner Engine still decides when to queue Telegram/email delivery, but the outbox row construction, dedupe document id, and “write only if missing” storage behavior now live with the outbox contract instead of inline in `planner-engine.js`.

### 2026-05-11 — Outbox backlog reads use shared helpers

`api/_lib/planner-outbox-contract.js` now owns:

- `OUTBOX_QUEUE_STATUSES`;
- `getOutboxStatusSnapshots(...)`;
- `buildOutboxBacklogCounts(...)`.

Planner bootstrap and the post-command hook now read and count outbox statuses through these helpers instead of repeating `pending/retry/dead/sending` queries inline. This keeps queue diagnostics aligned between Progress, post-command status, and backend health projections.

### 2026-05-11 — Outbox drain run shape moved to delivery runtime

`api/_lib/planner-delivery-runtime.js` now owns `buildOutboxDrainRun(...)`.

`drainOutbox(...)` in Planner Engine still claims rows, calls providers, records delivery events, and persists the run. The stable run shape (`run_id`, `status`, `stats`, compact `results`, timestamps) now lives with the delivery runtime contract instead of being assembled inline inside the Engine.

### 2026-05-11 — Outbox queued event shape moved to delivery runtime

`api/_lib/planner-delivery-runtime.js` now owns `buildOutboxQueuedEventSpec(...)`.

Planner Engine still decides when an outbox row is queued, but the user-visible delivery event shape for `OUTBOX_QUEUED` now lives with the rest of the delivery contract. This keeps queued/sent/retry/dead delivery diagnostics aligned instead of assembling queue events inline in the Engine.

### 2026-05-11 — Client adapter carries post-command diagnostics

`src/plannerClientStateAdapter.js` now preserves the `postCommand` contract from `planner_client_update_v1` responses inside the frontend response-contract status.

Progress can therefore show both layers: whether the browser received the expected client response shape, and whether the backend command response included `planner_post_command_hook_v1` status from the Engine/report/outbox wake-up.

### 2026-05-11 — Engine contract status checks post-command hook version

`planner_meta.command_health` now carries the latest post-command hook response shape/version from command history.

`planner_meta.engine_contract_status.layers[]` includes `post_command_hook_contract`, so Progress can distinguish “commands exist” from “commands are followed by a versioned Engine/report/outbox wake-up contract.”

### 2026-05-11 — Route runtime persists post-command hook status

`api/_lib/planner-actions-runtime.js` now writes the consolidated route-level post-command hook result back into `plannerCommands`.

This closes the gap between command-runner commands and route-runtime commands: both now leave backend evidence that task mutation was followed by the versioned Engine/report/outbox wake-up contract. Route responses also expose `postCommandWrite` / `post_command_write` for diagnostics.

### 2026-05-11 — Client status shows hook persistence

`src/plannerClientStateAdapter.js` now keeps `postCommandWrite` from `planner_client_update_v1` responses.

Progress can show whether the post-command hook merely ran, or also persisted its compact status back into command health. This makes the contract boundary easier to debug without inspecting Firestore directly.

### 2026-05-11 — Engine contract status extracted

Added `api/_lib/planner-engine-contract-status.js`.

The architecture health projection for Progress is now a small dedicated helper instead of living inside the main Planner Engine file. It still reads the same inputs: command health, outbox queue, debug runs, delivery status, and report items. The behavior is unchanged, but the contract/report/outbox health layer is easier to maintain independently from task decay and tick logic.

### 2026-05-11 — Command health extracted

Added `api/_lib/planner-command-health.js`.

Command history compaction and `planner_meta.command_health` projection now live outside the main Planner Engine file. The behavior is unchanged, but the command-health contract is now a focused module that can evolve independently from tick execution, task decay, and delivery code.

### 2026-05-11 — Outbox queue compaction moved into outbox contract

`api/_lib/planner-outbox-contract.js` now owns `compactOutboxQueueDoc(...)`.

Planner bootstrap still exposes the same `outbox_queue` diagnostics, but the compact queue shape now lives next to outbox row creation and payload normalization. This keeps delivery storage/diagnostic shape in one module instead of splitting it across the main Planner Engine file.

### 2026-05-11 — Planner health snapshot extracted

Added `api/_lib/planner-health-snapshot.js`.

`buildPlannerHealthSnapshot(...)` and `compactEngineLock(...)` now live in a focused health module. Planner Engine still publishes the same `planner_meta.health_snapshot` and sanitized `planner_meta.engine_lock`, but the health projection is no longer embedded inside the tick/task mutation file.

### 2026-05-11 — Engine decision/inbox snapshots extracted

Added `api/_lib/planner-engine-snapshots.js`.

`plannerMeta.engine_decisions` and `plannerMeta.engine_inbox` are still produced by Planner Engine, but their compact snapshot builders now live in a dedicated module. This keeps the “what did the brain decide?” projection separate from tick execution and task mutation internals.

### 2026-05-11 — Engine run contract extracted

Added `api/_lib/planner-engine-run-contract.js`.

Trigger metadata routing (`last_bootstrap_tick`, `last_command_tick`, `last_cron_tick`) and the versioned `engine_run_summary` contract now live outside the main Planner Engine file. This keeps run/report contract shape separate from tick execution and task mutation logic.

### 2026-05-11 — Delivery runtime extracted

Added `api/_lib/planner-delivery-runtime.js`.

Telegram/email provider delivery, delivery status contract shape, outbox drain result shape, and delivery error classification now live outside the main Planner Engine file. Planner Engine still owns `writeDeliveryEvent(...)`, because recording delivery events and updating planner meta are part of the engine-owned event/report trail.

This keeps the boundary explicit:

- Planner Engine decides what should be sent and records what happened;
- Delivery runtime sends Telegram/email payloads and returns normalized delivery results;
- Outbox remains the durable queue between those two responsibilities.

### 2026-05-11 — Event/report write contract extracted

Added `api/_lib/planner-event-contract.js`.

Event actor normalization, event document normalization, transaction event writes, and report item writes now live in a dedicated contract module. Planner Engine still decides which events and report items should exist, but the persisted shape is no longer embedded directly in the tick/task mutation file.

This keeps the event boundary explicit:

- Engine decisions produce events and report items;
- `planner-event-contract` owns the stable persisted shape;
- bootstrap/report surfaces can rely on one normalized event/report contract.

### 2026-05-11 — Planner rules extracted

Added `api/_lib/planner-engine-rules.js`.

Heat decay, active/background/purgatory counts, at-risk task selection, rescue suggestion fallback, compact id normalization, and mission/rescue reason text now live in a focused rules module. Planner Engine still executes the tick and writes state, but the reusable “how the planner interprets task state” rules are no longer embedded in the transaction-heavy engine file.

This gives the backend contract a clearer split:

- `planner-engine-rules` computes deterministic planner meaning from tasks;
- `planner-engine` applies those rules inside locked engine runs;
- bootstrap and reports receive the same derived interpretation without UI-side reimplementation.

### 2026-05-11 — Scheduled nudge rules extracted

Added `api/_lib/planner-nudge-schedule.js`.

Berlin date/hour parsing, scheduled nudge slot selection, and scheduled nudge text assembly now live outside the main Planner Engine file. Planner Engine still decides whether to enqueue a nudge and writes the outbox row, but the schedule/text rules are no longer mixed into the tick transaction logic.

This keeps nudge behavior clearer:

- `planner-nudge-schedule` owns when a scheduled nudge slot exists and how its user-facing text is assembled;
- `planner-engine` owns idempotent enqueueing and event/report side effects;
- delivery runtime owns actually sending the queued notification.

### 2026-05-11 — Death notification outbox payloads extracted

Added `api/_lib/planner-death-notification-outbox.js`.

Telegram/email outbox payload assembly for engine-authored cemetery moves now lives outside the main Planner Engine file. Planner Engine still decides that a task moved to Cemetery and writes the outbox row idempotently, but the channel-specific payload shape is owned by a focused notification module.

This keeps the devil/system boundary clearer:

- Engine marks stale tasks as dead and emits the source event;
- death notification outbox builder creates Telegram/email payload candidates for that event;
- outbox and delivery runtime handle dedupe and sending.

### 2026-05-11 — Scheduled nudge outbox payload extracted

Added `api/_lib/planner-scheduled-nudge-outbox.js`.

Scheduled Telegram nudge outbox payload assembly now lives outside the main Planner Engine file. Both immediate queueing and candidate-based idempotent enqueueing use the same builder, so the scheduled nudge payload shape is defined in one place.

This keeps the scheduled nudge boundary consistent:

- nudge schedule module owns slot/time/text rules;
- scheduled nudge outbox module owns the Telegram outbox payload contract;
- Planner Engine owns the decision to enqueue and the transaction/dedupe path.

### 2026-05-11 — Engine report specs extracted

Added `api/_lib/planner-engine-report-specs.js`.

Angel/devil report item specs for mission selection, rescue suggestion, at-risk warnings, engine-authored cemetery moves, and engine run summaries now live outside the main Planner Engine file. Planner Engine still decides which facts happened and writes the transaction, but the report narration contract is assembled in one focused module.

This keeps the report boundary clearer:

- Planner Engine owns event timing and state transitions;
- report specs own persona/title/message key/params for user-facing narration;
- report projector owns normalized persisted report item shape and shared message formatting.

### 2026-05-11 — Remaining write-boundary audit

Current backend direction remains: user-visible planner mutations should go through `PlannerCommandService`, while Planner Engine owns system/time-based transitions.

Current boundary status:

- Telegram action execution is routed through `planner-command-runner` / `PlannerCommandService` for task mutations.
- API capture and extraction code reads planner data and writes captures, but final task mutation should still be command-based.
- `planner-engine` is allowed to write task state directly only for engine-authored system transitions inside its locked tick transaction.
- `planner-store.mutatePlanner(...)` remains a legacy safe mutation primitive, but new user-facing writes should not be added there.
- Client direct Firestore writes are guarded in `src/firestoreUtils.js`: cloud users are blocked unless an explicit migration/legacy escape hatch is passed.
- The largest remaining migration area is the web client’s local mutation/persistence adapter in `src/App.js`, which still contains many UI handlers that build local task patches before sending them through the current client action path.

Next safe migration target:

- inventory `src/App.js` UI handlers by command type;
- keep guest/local behavior separate;
- route cloud mutations through canonical command payloads instead of task-shaped patches;
- preserve optimistic UI only as a visual cache, not as source of truth.

### 2026-05-11 — Web touch action clarified as command-only

The cloud path for `Вспомнил / I moved` now uses the generic command action helper instead of the payload helper. Behavior is intentionally unchanged: guests still mutate locally, while cloud users send `touch_task` to `/api/planner-client-actions`, which resolves to `TASK_TOUCH` in `PlannerCommandService`.

This is the first web-client boundary slice:

- `Вспомнил / I moved` is treated as a canonical command;
- the client does not construct a task patch for this action;
- optimistic UI remains limited to local highlight/action feedback;
- the server remains the source of truth for the persisted task/event/report state.

### 2026-05-11 — Web command-path inventory

Audited the main cloud task handlers in `src/App.js`.

Already routed through `/api/planner-client-actions` for cloud users:

- `Вспомнил / I moved` → `touch_task` → `TASK_TOUCH`
- `Done` → `complete_task` → `TASK_COMPLETE`
- `Cemetery / kill` → `kill_task` → `TASK_MOVE_TO_CEMETERY`
- `Restore / reopen` → `reopen_task` → `TASK_REOPEN`
- `Add subtask` → `add_subtask` → `TASK_ADD_SUBTASK`
- `Edit task` → `edit_task` → `TASK_EDIT_TASK`
- `Add time` → `add_time` → `TASK_ADD_TIME`
- `Delete subtask` → `delete_subtask` → `TASK_DELETE_SUBTASK`
- `Edit subtask` → `edit_subtask` → `TASK_EDIT_SUBTASK`
- `Toggle subtask` → `toggle_subtask` → `TASK_SUBTASK_TOGGLED`
- `Urgency` → `set_urgency` → `TASK_SET_URGENCY`
- `Resistance` → `set_resistance` → `TASK_SET_RESISTANCE`
- `Deadline` → `set_deadline` → `TASK_SET_DEADLINE`
- `Critical` → `set_vital` / `unset_vital`
- `Reorder` → `reorder_task` → `TASK_REORDER`
- `Heat zone` → `set_heat_zone` → `TASK_SET_HEAT_ZONE`

Remaining cleanup:

- `runCloudTaskPayloadAction(...)` is a payload-command adapter, not a direct patch writer.
- Guest/local task mutation paths remain intentionally separate.
- Direct Firestore writes remain blocked for cloud users by `src/firestoreUtils.js`.

### 2026-05-11 — Web payload helper renamed

Renamed the cloud helper in `src/App.js` from `runCloudTaskPatchAction(...)` to `runCloudTaskPayloadAction(...)`.

Behavior is unchanged. The rename matters because the old name implied client-side task patching, while the actual contract is now:

- web builds an action payload;
- `/api/planner-client-actions` validates it;
- `PlannerCommandService` owns the persisted mutation;
- the client receives the refreshed command/bootstrap-shaped state.

### 2026-05-11 — Server write-boundary inventory

Audited server-side task writes.

Allowed task write owners:

- `api/_lib/planner-command-service.js` — user-command mutations from web, Telegram, capture extraction hints, snapshots, restore/delete flows.
- `api/_lib/planner-engine.js` — engine-authored system transitions inside locked tick runs.
- `api/_lib/planner-store.js` — legacy safe mutation primitive and shared read/store utilities; new user-facing writes should not be added here.

Current route status:

- `api/planner-client-actions.js` validates web action payloads and delegates to planner action runtime / command service.
- `api/telegram-webhook.js` routes Telegram task actions through planner action executor / command runner.
- `api/_lib/planner-action-executor.js` maps user intents to canonical command builders before mutation.
- `api/_lib/capture-extractor.js` applies extraction hints through the command runner.
- capture/telegram memory stores may write captures/logs, but they are not task-state mutation owners.

Remaining principle:

- Any new task mutation must be a canonical command or an engine-authored tick transition.
- Routes, Telegram handlers, and UI adapters should not become task mutation brains.

### 2026-05-11 — Angel Lab apply path audit

Audited the Angel Lab apply path in `src/App.js`.

Cloud behavior:

- create cards call `handleAddTask(...)` with source `web_angel_lab_create`;
- `handleAddTask(...)` sends `add_task` to `/api/planner-client-actions`;
- merge cards with selected steps send `add_subtask` to `/api/planner-client-actions` with source `web_angel_lab_merge`;
- merge cards without selected steps remain a no-op and only mark the card handled/highlight the target;
- reject cards remain a no-op.

This means Angel Lab classification remains server-authoritative, while applying accepted cards still enters the same Planner Engine command boundary as normal web actions.

No new task-state mutation owner is needed for Angel Lab.

### 2026-05-11 — Remaining direct-write audit

Searched the current project for task-state write paths.

Cloud/server task mutations are still concentrated in the intended command boundary:

- `api/_lib/planner-action-executor.js` resolves user/Telegram/API routes and calls `executePlannerActionCommand(...)`;
- `api/_lib/planner-command-runner.js` is the only adapter that calls `runPlannerCommand(...)`;
- `api/_lib/planner-command-service.js` owns user-command task mutations;
- `api/_lib/planner-engine.js` owns engine-authored tick transitions;
- `api/_lib/planner-store.js` remains the low-level safe store primitive.

Client-side `persistTask(...)` calls in `src/App.js` are still present, but they are guest/local compatibility paths. For cloud users, `src/firestoreUtils.js` blocks direct task persistence and requires `/api/planner-client-actions`.

Current boundary status:

- web cloud actions: command path;
- Telegram actions: command path;
- capture extraction hints: command path;
- snapshot restore: command path;
- guest/local planner: intentionally local compatibility path.

### 2026-05-11 — Shared post-command status helper

Extracted the repeated post-command hook sequence into `runAndWritePostCommandStatus(...)` in `api/_lib/planner-post-command-hook.js`.

Used by:

- `api/_lib/planner-command-runner.js`;
- `api/_lib/planner-actions-runtime.js`.

The helper owns the common sequence:

1. run `runPostCommandPlannerEngine(...)`;
2. write compact post-command status to `plannerCommands`;
3. return `{ postCommand, postCommandWrite }`;
4. normalize failure shape when the hook/status write fails.

Behavior is unchanged, but the contract is cleaner:

- Telegram command routes and web/API route batches now share one post-command bookkeeping path;
- future report/outbox diagnostics should attach here instead of duplicating hook logic in route adapters.

### 2026-05-12 — Outbox delivery event builder

`api/_lib/planner-delivery-runtime.js` now owns `buildOutboxDeliveryEventSpec(...)`.

Before this cleanup:

- queued outbox event specs lived in the delivery runtime;
- sent/retry/dead delivery event specs were still assembled inline in `planner-engine.js`.

After this cleanup:

- `planner-engine.js` still decides when delivery results are written;
- the event storage shape for delivery attempts lives with the delivery runtime contract;
- delivery diagnostics stay aligned across queued, sent, retry, and dead states.

### 2026-05-12 — Command report specs extracted

Added `api/_lib/planner-command-report-specs.js`.

It owns:

- `buildSingleTaskCommandReportSpec(...)`;
- `writeCommandReportItem(...)`.

`api/_lib/planner-command-service.js` still owns task mutation and event creation, but command report wording/storage normalization now lives outside the mutation service. This keeps the command boundary cleaner:

- command service decides what happened;
- command report specs decide how that command becomes a user-facing Planner Report row;
- report projector still owns the final versioned `reportItems` shape.

### 2026-05-12 — Shared event actor resolver

`api/_lib/planner-command-service.js` now uses `getPlannerEventActor(...)` from `api/_lib/planner-event-contract.js` instead of keeping its own duplicate actor/persona resolver.

This keeps actor classification centralized:

- user actions stay `user`;
- angel/assistant routes stay `angel`;
- engine cemetery/death transitions stay `devil`;
- delivery/system events stay `system`.

That matters because actor/persona is reused by Planner Report, health/debug views, and future admin auditing. There should be one resolver for event authorship, not one per route layer.

### 2026-05-12 — Command event specs extracted

Added `api/_lib/planner-command-event-specs.js`.

It currently owns `buildPlannerCommandEvent(...)` for create/update command events.

This is another small separation inside the command boundary:

- `PlannerCommandService` still owns mutation and transaction order;
- command event specs own the append-only event shape for command-authored task creation/update;
- `planner-event-contract.js` still owns actor normalization and generic event writing.

The goal is to keep command-service from becoming a giant file that mixes mutation rules, event shape, report wording, and delivery diagnostics.

### 2026-05-12 — Post-extraction command-service audit

Checked the command-service extraction boundary after moving command report specs, command event specs, and actor normalization.

Current status:

- `planner-command-report-specs.js` owns single-task command report specs and command report writes;
- `planner-command-event-specs.js` owns create/update command event specs;
- `planner-event-contract.js` owns actor/persona normalization;
- `planner-command-service.js` still needs `escapeHtml(...)` because several non-create/update command event messages remain inline there.

No unused extraction imports were left behind.

Next safe extraction target, when useful: move the remaining single-task mutation event message builder out of `planner-command-service.js`. That should be done as a separate small batch because it touches many command types (`complete`, `cemetery`, `reopen`, `touch`, `rescue`, `subtask`, tuning fields, deadline, heat zone).

### 2026-05-12 — Single-task mutation event specs extracted

`api/_lib/planner-command-event-specs.js` now also owns `buildSingleTaskMutationCommandEvent(...)`.

This moved the long event-message ladder for single-task commands out of `PlannerCommandService`:

- complete;
- cemetery;
- reopen;
- touch / movement;
- rescue start / shift / completion;
- time tracking;
- subtask add/edit/toggle/delete;
- title change;
- today/vital toggles;
- urgency/resistance/deadline;
- heat zone movement.

Behavior is unchanged. `PlannerCommandService` still decides the command type, applies the mutation, and writes the event/report in the transaction. The event spec module now owns the event shape and human event message for this command family.

### 2026-05-12 — Remaining command-service event families

After extracting create/update and single-task mutation event specs, the remaining inline event/report blocks in `api/_lib/planner-command-service.js` are no longer the ordinary task button path.

Remaining families:

- extraction hints applied;
- active task reorder;
- bulk completed-to-cemetery cleanup;
- snapshot restore;
- snapshot create;
- protected task repair;
- delete forever.

These should be extracted only as separate small batches because each family has different event/report semantics and different rollback risk. The important product path is already cleaner:

- normal create/update event shape is outside command-service;
- normal single-task mutation event shape is outside command-service;
- normal command report wording is outside command-service;
- actor/persona normalization is shared through the event contract.

### 2026-05-12 — Extraction hints event spec extracted

`api/_lib/planner-command-event-specs.js` now owns `buildExtractionHintsAppliedCommandEvent(...)`.

This moves `TASK_EXTRACTION_HINTS_APPLIED` event shape out of `PlannerCommandService`.

Why this matters:

- capture extraction hints can mutate task priority/deadline/context;
- they already enter through the command runner;
- their event shape now lives with other command event specs instead of being hand-built inline.

Behavior is unchanged: no-op extraction hints still do not write an event, while changed hints write the same hidden event with `changedFields`.

### 2026-05-12 — Extraction hints event spec extracted

Moved the capture-extraction hint event shape out of `planner-command-service.js` into `buildExtractionHintsAppliedCommandEvent(...)` in `api/_lib/planner-command-event-specs.js`.

Behavior stays the same: `applyExtractionHintsCommand(...)` still owns the task mutation and command record, but the append-only event payload for `TASK_EXTRACTION_HINTS_APPLIED` now lives in the shared command event specs module.

This keeps the Planner Command Service moving toward orchestration only: mutate state, ask shared helpers for event/report shapes, then write through the same command/bootstrap contract.

### 2026-05-12 — Task reorder event spec extracted

Moved the manual active-task reorder event shape into `buildTaskReorderedCommandEvent(...)` in `api/_lib/planner-command-event-specs.js`.

Behavior stays the same: `reorderActiveTaskCommand(...)` still owns the ordering/heat mutation and command result, but no longer hand-builds the `TASK_REORDERED` append-only event inline.

This keeps the command-service boundary cleaner: command handlers apply state changes; shared event specs define event shape, actor normalization, payload fields, and feed/report visibility.

### 2026-05-12 — Bulk Heaven cleanup specs extracted

Moved the bulk completed-to-Cemetery event shape into `buildBulkCompletedMovedToCemeteryCommandEvent(...)` and the matching user-facing report wording into `buildBulkCompletedToCemeteryReportSpec(...)`.

Behavior stays the same: `bulkMoveCompletedToCemeteryCommand(...)` still owns the state mutation, score delta, protected-task filtering, and command result. Shared specs now own the append-only event payload and report item wording for the cleanup.

This keeps system cleanup closer to the Planner Engine contract: command-service applies a single transactional mutation, then asks shared modules for event/report shapes instead of hand-building narration inline.

### 2026-05-12 — Snapshot command specs extracted

Moved snapshot restore/create event shapes into shared command event specs:

- `buildSnapshotRestoredCommandEvent(...)`;
- `buildSnapshotCreatedCommandEvent(...)`.

Moved restore report wording into `buildSnapshotRestoredReportSpec(...)`.

Behavior stays the same for restore: `restoreSnapshotCommand(...)` still owns backup creation, task restoration, task deletion for non-restored IDs, score restoration, and command result. Shared specs now own the `SNAPSHOT_RESTORED` event payload and report wording.

Also removed an invalid report write from `createSnapshotCommand(...)`: snapshot creation was accidentally trying to write protected-task-repair copy using `repairedTasks`, which does not exist in that command. Snapshot creation now writes only its `SNAPSHOT_CREATED` event, matching its `visible_in_report: false` contract.

### 2026-05-12 — Protected task repair specs extracted

Moved protected-task repair event/report shapes into shared command specs:

- `buildProtectedTasksRepairedCommandEvent(...)`;
- `buildProtectedTasksRepairedReportSpec(...)`.

Behavior stays the same for the repair mutation: `repairProtectedTasksCommand(...)` still decides which protected dead tasks are invalid, returns them to active, updates Telegram context, and records the command result.

Also fixed a bad report write in the repair command: it was accidentally using deleted-forever copy and undefined `deletedTasks`. Protected repair now writes the intended angel report explaining that protected tasks were returned to active because they should not silently disappear.

### 2026-05-12 — Delete forever event spec extracted

Moved permanent deletion event shape into `buildTaskDeletedForeverCommandEvent(...)` in `api/_lib/planner-command-event-specs.js`.

Behavior stays the same: `deleteTasksForeverCommand(...)` still owns permanent task deletion, title-index tombstoning, score delta, and command result. The shared event spec now owns the `TASK_DELETED_FOREVER` event payload, actor normalization, feed/report visibility, and human event message.

This keeps the dangerous-action command path closer to the Planner Engine contract while avoiding any migration or production data changes.

### 2026-05-12 — Command-service inline event cleanup audit

After extracting ordinary task events, extraction hints, reorder, Heaven cleanup, snapshots, protected repair, and permanent deletion, `api/_lib/planner-command-service.js` no longer hand-builds planner event objects inline.

Current boundary:

- command-service owns command routing, validation, transactional mutations, command result records, and idempotency;
- `planner-command-event-specs.js` owns append-only event shapes and event messages;
- `planner-command-report-specs.js` owns command report wording;
- `planner-event-contract.js` owns actor/persona normalization.

The only remaining `visible_in_feed/report` flags in command-service are debug-only command records for `SET_PLANNER_CONTEXT` and `LINK_TELEGRAM_CHAT`; they are not planner events and should stay hidden from user-facing report surfaces.

Removed stale direct imports of `escapeHtml(...)` and `getPlannerEventActor(...)` from command-service because event/report specs now own that formatting boundary.

### 2026-05-12 — Direct task-write audit after command-service cleanup

Audited remaining direct task writes after extracting command event/report specs.

Current write boundary:

- `api/_lib/planner-command-service.js` writes tasks for canonical user/internal commands;
- `api/_lib/planner-engine.js` writes tasks only for engine-authored system transitions such as tick-driven auto movement;
- `api/_lib/planner-store.js` remains the low-level protected mutation primitive used by legacy/safe store helpers;
- cloud client writes are guarded by `src/firestoreUtils.js` and routed through `/api/planner-client-actions` / PlannerCommandService for logged-in users.

No UI or Telegram task-action path should write Firestore tasks directly. Telegram actions route through `planner-action-executor` and command builders into `runPlannerCommand(...)`; web actions route through `plannerCommandClient` and `/api/planner-client-actions`.

This is the intended Planner Engine v1 boundary: UI and Telegram adapt user intent into commands; command-service and engine are the only decision/mutation layers; event/report/outbox helpers narrate and deliver the result.

### 2026-05-12 — Planner command record helper introduced

Added `api/_lib/planner-command-records.js` as the shared command-record boundary.

It now owns:

- `reusePlannerCommand(...)` for idempotency reuse metadata;
- `buildPlannerCommandRecord(...)` for canonical command result documents;
- `writePlannerCommandRecord(...)` for transaction writes.

Applied the helper to the two high-volume command paths first:

- create-or-merge task;
- ordinary single-task mutations.

Behavior is unchanged. This is an incremental extraction: remaining special command families still write command records inline until they are moved in small follow-up batches.

### 2026-05-12 — Debug command records moved to shared writer

Moved the debug-only command records for these technical commands onto the shared command-record helper:

- `SET_PLANNER_CONTEXT`;
- `LINK_TELEGRAM_CHAT`.

Behavior stays the same: both records remain hidden from feed/report surfaces with `visible_in_feed: false`, `visible_in_report: false`, and `debug_only: true`.

This extends the command-record boundary beyond task mutations without changing user-visible planner behavior.

### 2026-05-12 — Extraction and reorder command records moved to shared writer

Moved two special command families onto the shared command-record helper:

- `TASK_APPLY_EXTRACTION_HINTS`;
- `TASK_REORDER`.

Behavior stays the same: extraction hints still only writes a planner event when fields actually change, and reorder still handles missing/no-op/update outcomes as before. The change is only the command-result persistence boundary: `planner-command-service.js` now uses `buildPlannerCommandRecord(...)` and `writePlannerCommandRecord(...)` instead of hand-building these command documents inline.

This keeps idempotency/result records consistent while leaving task mutations, event payloads, and user-facing reports unchanged.

### 2026-05-12 — Special command records fully moved to shared writer

Moved the remaining special command-result records in `planner-command-service.js` onto `buildPlannerCommandRecord(...)` and `writePlannerCommandRecord(...)`:

- `BULK_MOVE_COMPLETED_TO_CEMETERY`;
- `RESTORE_SNAPSHOT`;
- `CREATE_SNAPSHOT`;
- `REPAIR_PROTECTED_TASKS`;
- `TASK_DELETE_FOREVER`.

Together with the previous create/merge, single-task mutation, debug command, extraction hints, and reorder batches, command-service no longer writes `plannerCommands` documents by hand with direct `transaction.set(commandRef, ...)` blocks.

Behavior stays the same: task mutations, planner events, report items, score changes, and snapshot/cleanup semantics are unchanged. This step only centralizes command-result persistence so idempotency/result records have one shared shape and one write helper.

### 2026-05-12 — Command idempotency reuse centralized

Moved all remaining `planner-command-service.js` idempotency reuse branches onto `reusePlannerCommand(...)`.

Before this batch, some command families returned `commandSnap.data().result` by hand. They now share one helper that returns the stored result and updates reuse metadata on the command document (`lastReusedAt`, `reuseCount`). This applies consistently across create/merge, single-task mutations, debug context commands, extraction hints, reorder, cleanup, snapshots, protected repair, and permanent deletion.

Behavior for first-time command execution is unchanged. The difference is only repeated-command handling: every command family now has the same idempotency reuse contract.

### 2026-05-12 — Bootstrap response contract extracted

Added `api/_lib/planner-bootstrap-contract.js` as the shared builder for the web bootstrap payload.

`planner-engine.js` still owns Firestore reads and engine execution, but the response shape for bootstrap is now centralized in `buildPlannerBootstrapPayload(...)`. That helper owns:

- client response contract version and response shape;
- `planner_meta` debug/health/outbox/command status projection;
- unread login report items;
- report history items;
- visible event feed items;
- outbox backlog and command health summaries.

Behavior is unchanged. This is a boundary extraction so future UI, Telegram, and admin/debug surfaces read one stable bootstrap contract instead of duplicating projection logic.

### 2026-05-12 — Outbox drain response contract extracted

Added `buildOutboxDrainResponse(...)` to `api/_lib/planner-delivery-runtime.js`.

`drainOutbox(...)` still owns claiming pending/retry outbox rows, delivering Telegram/email payloads, writing delivery events, persisting outbox run documents, and updating `plannerMeta.last_outbox_drain`. The final API-facing result shape is now built by the delivery runtime instead of inline inside `planner-engine.js`.

Behavior is unchanged. This keeps delivery response shape beside the existing delivery helpers (`buildOutboxRunResult(...)`, `buildOutboxDrainRun(...)`, `buildDeliveryStatus(...)`) and reduces projection logic inside the engine.

### 2026-05-12 — Report ack response contract extracted

Added `buildReportAckResponse(...)` to `api/_lib/planner-report-projector.js`.

`ackReportItems(...)` still owns validating report item IDs, marking `reportItems` as seen, and writing the hidden `REPORT_ITEMS_ACKED` audit event. The response shape for report acknowledgement now lives beside `buildReportAckPatch(...)` in the report projector.

Behavior is unchanged. This keeps report acknowledgement storage and response contracts together instead of leaving part of the contract inline in `planner-engine.js`.

### 2026-05-12 — Client action response helpers added

Extended `api/_lib/planner-client-response-contract.js` with response builders for API route shapes:

- `buildPlannerClientErrorResponse(...)`;
- `buildPlannerBootstrapClientResponse(...)`;
- `buildPlannerDebugRunClientResponse(...)`.

`api/planner-client-actions.js` now uses these helpers for method/auth/body/validation errors, bootstrap responses, and debug-run responses. Route execution responses still use `buildPlannerRouteClientResponse(...)`, and report acknowledgement still uses the report projector response wrapped by the client contract.

Behavior is unchanged for successful planner actions. This reduces inline response construction in the route adapter and keeps API response shape decisions in the client response contract module.

### 2026-05-12 — Route runtime result contract extracted

Added `api/_lib/planner-route-result-contract.js`.

It now owns the route runtime response/state shape used by `/api/planner-client-actions` after a web/Telegram-style action route is executed:

- `buildPlannerRouteRuntimeResult(...)`;
- `buildPlannerRouteState(...)`.

`planner-actions-runtime.js` still owns parsing the route, invoking `executePlannerAction(...)`, running the post-command hook, and fetching bootstrap when state is requested. The task/state projection returned to the client is now centralized in the route result contract.

Behavior is unchanged. This keeps the route adapter as an adapter instead of another place that hand-builds planner state projections.

### 2026-05-12 — Planner action route command builder centralized

Added `buildPlannerActionRouteCommand(...)` to `api/_lib/planner-command-builders.js`.

`planner-action-executor.js` still owns Telegram/web-action flow control: resolving task references, validating missing tasks/subtasks, sending user-facing Telegram copy, and logging action summaries. The command object passed into `executePlannerActionCommand(...)` is now built through one route-to-command helper instead of selecting individual command builders inline at each action branch.

Behavior is unchanged. This is a command boundary cleanup: route adapters still decide *which action branch* is running, but canonical command shape now lives in the command-builder contract.

### 2026-05-12 — Snapshot restore API moved onto command builder

`api/snapshot-read.js` no longer hand-builds the `RESTORE_SNAPSHOT` command object inline.

The snapshot restore endpoint now builds one route object and passes it through `buildRestoreSnapshotCommand(...)` before calling `executePlannerActionCommand(...)`. The endpoint still owns authorization, snapshot listing/reading, bootstrap reload, and client response wrapping.

Behavior is unchanged. This removes another direct route-adapter command shape and keeps restore command structure in the shared command-builder contract.

### 2026-05-12 — Telegram link command moved onto command builder

Added `buildLinkTelegramChatCommand(...)` to `api/_lib/planner-command-builders.js` and switched `api/telegram-webhook.js` to use it.

The Telegram webhook still owns chat authorization, `/start` handling, callback handling, and message routing. It no longer hand-builds the internal `LINK_TELEGRAM_CHAT` command object inline; it builds a route and lets the command-builder contract produce the command shape passed to `executePlannerActionCommand(...)`.

Behavior is unchanged. This removes another adapter-level command shape and keeps Telegram linking inside the same command-construction boundary as web and route actions.

### 2026-05-12 — Capture extraction hints moved onto command builder

Added `buildApplyExtractionHintsCommand(...)` to `api/_lib/planner-command-builders.js` and switched `api/_lib/capture-extractor.js` to use it.

The capture extractor still owns candidate ranking, similarity thresholds, commitment-derived patch creation, and deciding whether an extraction hint is confident enough to apply. It no longer hand-builds the internal `TASK_APPLY_EXTRACTION_HINTS` command object inline; it creates one route payload and delegates command shape to the shared command-builder contract.

Behavior is unchanged. This keeps engine-authored extraction hint application inside the same canonical command construction boundary as Telegram and web actions.

### 2026-05-12 — Legacy planner-actions error responses use shared client error builder

`api/planner-actions.js` now uses `buildPlannerClientErrorResponse(...)` for method, configuration, auth, parse, validation, missing-user, and execution errors.

The legacy endpoint already used the shared route runtime and route client response builder for successful action responses. This cleanup aligns its error contract with `/api/planner-client-actions` instead of calling the lower-level response wrapper directly at each branch.

Behavior is unchanged for successful route execution. Error payloads still use `planner_client_update_v1`, but the shape is now produced by the same client error helper as the primary browser endpoint.

### 2026-05-12 — Worker response success/error builders added

Added `buildPlannerWorkerErrorResponse(...)` and `buildPlannerWorkerSuccessResponse(...)` to `api/_lib/planner-worker-response-contract.js` and switched `api/telegram-nudge.js` to use them.

The worker endpoint still owns cron authorization, manual/maintenance tick routing, deprecated endpoint handling, Planner Engine tick execution, and outbox drain execution. It no longer repeats low-level worker response object shapes at each branch.

Behavior is unchanged. Worker responses still use `planner_worker_result_v1`; success and error payload construction now lives in the worker response contract module instead of directly inside the route adapter.

### 2026-05-12 — Snapshot read errors use shared client error builder

`api/snapshot-read.js` now uses `buildPlannerClientErrorResponse(...)` for authorization, missing user, missing snapshot, restore validation, restore failure, method, and internal error branches.

Successful snapshot read/list payloads are intentionally unchanged to avoid disturbing legacy consumers. Successful restore still returns the bootstrap-backed client response. This step only aligns planner snapshot error responses with the same `planner_client_update_v1` error builder used by the primary planner action endpoints.

### 2026-05-12 — Route post-command descriptor named

Added `buildRoutePostCommandDescriptor(...)` in `api/_lib/planner-actions-runtime.js`.

The route runtime still executes one consolidated post-command hook after a web/API action route has run. The minimal descriptor passed to that hook is now built through a named helper instead of an inline `{ idempotencyKey }` object. This keeps the remaining route-level post-command exception explicit and searchable.

Behavior is unchanged. No task mutation, event, report, outbox, or response behavior changed.

### 2026-05-12 — Command boundary checkpoint

Ran a command/write boundary audit after the route, Telegram, snapshot, capture, worker, and legacy action cleanup.

Current result:

- route and Telegram action branches call `executePlannerActionCommand(...)` through the command runner;
- action-to-command shape is centralized through `planner-command-builders.js`;
- command persistence/idempotency records are centralized through `planner-command-records.js`;
- direct task writes remain intentionally limited to `planner-command-service.js`, `planner-engine.js`, and low-level protected store helpers;
- remaining Firestore writes outside that task path are projection/support writes: planner events, command records, outbox rows, report items, captures, commitments, Telegram trace events, Google Calendar private credentials, and post-command status documents.

This closes the current backend-contract hardening pass for command/write boundaries. The next separate product/engineering block should be fast interactions: optimistic UI + background bootstrap reconciliation, so user actions feel immediate while Planner Engine remains the source of truth.

### 2026-05-12 — Scheduled Telegram nudge dedupe tightened

`api/telegram-nudge.js` no longer treats a normal requested `slot=morning|evening` or a plain POST as a forced nudge. Forced delivery is now explicit only through `force=true` or `action=manual-force`.

Why: a scheduled evening nudge and a slot-requested evening nudge could previously receive different outbox dedupe keys (`date_evening` vs `force_date_hour_bucket`) and send duplicate Telegram messages for the same user-facing event. Normal scheduled slots now share the stable daily slot dedupe key.

### Emergency stability note: forced nudge dedupe

Forced Telegram nudges must not create a new outbox item every few minutes. For Planner Engine v1, forced nudges are deduped by user/date/hour. Manual force remains possible, but repeated cron/manual calls inside the same hour should resolve to one outbox delivery candidate, not a notification flood.

### Emergency stability note: report source and completed-to-cemetery moves

Cloud UI reports must use `reportItems` as the single source for the login "while you were away" panel. The legacy plannerEvents fallback is disabled for cloud users because it can reopen the panel after reportItems are acknowledged.

Moving a completed task from Heaven to Cemetery must resolve non-active tasks on the backend. `KILL_TASK` is valid for active and completed tasks; otherwise the client can optimistically show Cemetery while the server leaves the task in Heaven.

Outbox drain also skips duplicate claimed items in the same drain run. This protects users from old duplicate scheduled-nudge rows that were created before stricter dedupe rules.

### Emergency stability note: delete forever and report ack-all

Single-task `DELETE_TASK_FOREVER` must resolve active and non-active tasks. Heaven/Cemetery actions often target completed or dead tasks, so executor lookup must use the non-active-aware resolver before building the PlannerCommandService command.

The client task merge must also treat backend Cemetery state as terminal for stale optimistic Heaven state. A pending local `completed` task may temporarily cover an older active snapshot while completion is saving, but it must not override a remote `dead` snapshot. Otherwise a completed-to-Cemetery move can appear to succeed and then visually jump back to Heaven from local cache merge.

### Emergency stability note: outbox delivery lock

Outbox drain now has a short-lived delivery dedupe lock keyed by the semantic delivery payload (`channel/topic/messageKey/slot/task/text`). This is stronger than per-run duplicate suppression: if two drain workers or old duplicate outbox rows try to send the same scheduled Telegram nudge, only the first one may deliver it. The duplicate row is marked as sent with a skipped duplicate diagnostic instead of sending a second Telegram message.

### Emergency stability note: delete forever applies backend snapshot

Single-task `DELETE_TASK_FOREVER` in the web client now applies the backend response payload through the same Planner Client State adapter used by other command responses. The optimistic removal still makes the UI feel immediate, but the authoritative snapshot/report/contract state is applied as soon as the backend confirms deletion.

Generic cloud task action helpers now also apply backend error payloads before deciding whether to roll back an optimistic UI mutation. If `/api/planner-client-actions` returns a structured `planner_client_update_v1` error with fresh state or diagnostics, the browser accepts that authoritative response instead of only reverting locally. This keeps failed Heaven/Cemetery/Reopen/Task tuning commands aligned with backend contract diagnostics.

If the structured error payload is diagnostic-only and contains no task/meta/report state, the browser still rolls back the optimistic mutation. This prevents a failed command response from leaving the UI in a locally guessed Heaven/Cemetery/Delete Forever state just because the backend returned a valid error envelope.

Closing the login report should acknowledge all currently unread login report items, not only the three items rendered in the floating panel. Otherwise the user closes one small page of the backlog and immediately gets another "While you were away" panel.

### Emergency stability note: login report is session-gated

`While you were away` is a login/session report, not a live notification stream. The web client may auto-open it at most once per loaded user session. After the user closes it, Firestore reportItems snapshots and command/bootstrap responses must not reopen it until the next full app entry/reload.

The auto-open window is now limited to the initial entry/bootstrap moment. Live `reportItems` updates that arrive while the user is already working may update Progress history, but they must not pop the `While you were away` modal. This keeps the report semantic literal: it summarizes what changed while the user was away, not what changed while the app is open.

### Emergency stability note: client error payloads are applied once

`runPlannerClientAction(...)` now marks structured backend error payloads with the result of the Planner Client State adapter. Higher-level optimistic helpers reuse that marker instead of applying the same `planner_client_update_v1` payload again. If the backend error is diagnostic-only and no authoritative state was applied, the helper still rolls back the optimistic UI mutation.

`DELETE_TASK_FOREVER` also avoids re-applying a success payload that `runPlannerClientAction(...)` has already applied. This keeps delete/reopen/cemetery transitions from duplicating report/event state on the client while preserving immediate optimistic feedback.

### Emergency stability note: report feed dedupe at client boundary

The web client now normalizes and dedupes `reportItems` by `reportItemId` at the Planner Client State boundary. The same helper is used for backend command/bootstrap payloads and live Firestore report item snapshots.

This keeps `Planner Report` and `While you were away` from showing duplicate rows when the same report item reaches the browser through more than one delivery path. Acknowledgement cleanup also compares report item IDs as strings so local removal matches the backend ACK contract consistently.

### Emergency stability note: dismissed reports stay dismissed locally

Live Firestore `reportItems` snapshots now filter out report item IDs already dismissed in the current browser session before updating local Planner Report state. This prevents a short ACK round-trip from reintroducing just-closed `While you were away` rows while the backend is marking them seen.

The backend ACK remains the source of truth; the local dismissed set is only a session-level guard against UI flicker and repeated report noise during the same app visit.

### 2026-05-13 — Snapshot helper direct-write guard

`saveTaskSnapshot(...)` now uses the same direct cloud write guard as task, score, event, and restore helpers. Guest snapshots still work locally because guest IDs are allowed by the guard. Cloud snapshot creation remains routed through PlannerCommandService via `CREATE_SNAPSHOT`.

This closes another low-level bypass: a future frontend caller cannot accidentally create cloud snapshot writes outside the Planner Engine command path unless it explicitly opts into a migration/admin-style direct write.

### 2026-05-13 — Legacy snapshot restore idempotency window

Legacy `POST /api/snapshot-read` restore now accepts an explicit `idempotencyKey` and otherwise falls back to a short 4-second key bucket instead of `Date.now()`. This keeps accidental repeated POSTs from being treated as unrelated restore commands while still allowing an intentional restore attempt later.

The main web restore path already sends its own `RESTORE_SNAPSHOT` command through `/api/planner-client-actions`; this hardens the remaining legacy/admin-style route to match Planner Engine v1 idempotency expectations.

### 2026-05-13 — Telegram callback command idempotency

Telegram inline callback routes now attach a stable command `idempotencyKey` based on `callback_query.id` before entering PlannerCommandService. If Telegram retries the same callback delivery, the command runner can treat it as the same command instead of a new mutation.

This intentionally does not use a broad multi-second action bucket for callbacks, so a separate user tap remains a separate user action. The goal is transport retry dedupe, not suppressing deliberate task operations.

### 2026-05-13 — Route post-command fallback dedupe bucket

The route runtime post-command descriptor no longer falls back to `Date.now()` when a route lacks an explicit command key. It now uses a short 4-second bucket built from route type, target, and chat/API source.

This affects the post-command engine/report status write, not the primary task mutation command. Routes with explicit `idempotencyKey`, `commandId`, or `id` remain unchanged. The fallback now has a bounded dedupe window instead of making every retry look unique.

### 2026-05-13 — Command runner fallback idempotency key

`executePlannerActionCommand(...)` now guarantees that every PlannerCommandService command receives an idempotency key. Explicit keys from web, Telegram callbacks, captures, snapshots, and API routes still win. If a route/command lacks one, the command runner creates a short 4-second fallback key from command type, target/text, source, and bucket.

This closes the remaining empty-key gap at the command boundary. It is intentionally a narrow retry guard: repeated transport delivery of the same command is dedupable, while separate deliberate actions outside the short window still run as new commands.

### 2026-05-13 — Engine outbox candidate dedupe inside one run

`runPlannerTick(...)` now dedupes outbox candidates by Firestore document path before reading/writing the queue and before creating `OUTBOX_QUEUED` events.

This protects the user-facing report/event layer from duplicate delivery narration inside a single engine run. The outbox document id was already dedupe-key based; this step makes the engine-run event/report accounting match that same idempotency rule.

### 2026-05-13 — Report acknowledgement preservation

Planner report writes now default to merge semantics instead of replacing the whole `reportItems/{id}` document. This preserves acknowledgement metadata (`ack`, `seenAt`, `seen_at`) if the engine projects the same report id again.

Planner bootstrap also filters report items through both `seenAt` and `ack.ackedAt`. If an older repeated projection left `seenAt: null` but preserved the ack object, the item is still treated as already acknowledged and must not reopen `While you were away`.

### 2026-05-13 — Explicit task target fallback disabled for risky actions

Telegram/web action routing now treats an explicit task reference as authoritative for completion, rescue, touch, and cemetery actions.

If a callback or API route carries a task id/text and that task is no longer valid for the requested action, the executor must not fall back to the latest active/context task. It should return the existing "not found / not active" response and let `PlannerCommandService` keep no-op behavior quiet.

This prevents stale inline buttons from applying `Done`, `I moved`, `I'm stuck`, or `Cemetery` to a different active task after the original task has moved to Heaven/Cemetery.

### 2026-05-13 — Report merge writes do not reset seen state

When `reportItems/{id}` is written with merge semantics and the projected report is unseen, the writer no longer sends `seenAt: null` / `seen_at: null` fields.

This preserves existing acknowledgement fields on repeated projections of the same report id. New reports are still considered unseen by the client because they have no ack timestamp, but an already dismissed report should not become unread again just because the engine projected the same report document.

### 2026-05-13 — Dangerous status actions require explicit task target

`kill_task` and `reopen_task` now require an explicit `taskRef`, matching `complete_task` and other task mutations.

These actions move tasks between Active, Heaven, and Cemetery, so they must not be allowed to run from an ambiguous route that falls back to context. If the user or adapter does not provide a task id/text, the route should fail validation instead of guessing the latest active task.

### 2026-05-13 — Explicit stale task callbacks reach command-service no-op

Explicit task references for completion, rescue, movement, and cemetery actions now resolve by task id/text across active and inactive tasks before entering `PlannerCommandService`.

If the explicit target is already in the wrong state, the command service returns a quiet `noop` instead of mutating another task. The Telegram/action adapter now treats that `noop` as a stale-button result and sends a neutral “nothing else changed” message instead of showing false success.

This keeps old inline buttons and repeated user taps from moving a task from Cemetery back to Heaven, completing the wrong active task, or narrating a state change that did not actually happen.

### 2026-05-13 — Status transition rules are explicit

The core Heaven/Cemetery/Active transitions now have a small shared rule table in `planner-status-transition-rules.js`.

Current v1 rules:

- `active -> completed` is allowed.
- `completed -> completed` and `dead -> completed` are no-op.
- `active -> dead` and `completed -> dead` are allowed.
- `dead -> dead` is no-op.
- `completed -> active` and `dead -> active` are allowed.
- `active -> active` through reopen is no-op.

`PlannerCommandService` uses this table for complete, cemetery, and reopen commands. The same rules are covered by a lightweight stability contract test so future backend changes cannot silently reintroduce Heaven/Cemetery loops.

### 2026-05-13 — Fresh local status intent wins over stale live snapshots

The web client now treats a fresh optimistic status transition as a short-lived visual intent while Firestore live snapshots catch up.

For live task snapshots, a recently pending local status change (`active`, `completed`, `dead`) is not overwritten only because an older remote snapshot has a higher `lastUpdated` timestamp. This prevents visible bounce-back such as a task staying in Active immediately after dragging it to Devil/Cemetery.

Authoritative PlannerCommandService responses still use an authoritative merge path and can replace local optimistic state immediately. The client distinction is now:

- live Firestore snapshot = protect fresh local intent for a short TTL;
- command/bootstrap response = backend state is authoritative.

### 2026-05-13 — Status intent survives stale snapshot races

The web client now keeps a short-lived per-task status intent map for cloud mutations that move tasks between Active, Heaven, and Cemetery.

This is separate from the task object itself. If a live Firestore snapshot arrives with stale status immediately after a user drag/click, the merge layer can still remember the user's intended status for the local TTL and avoid visual bounce-back.

Authoritative command/bootstrap responses still win immediately. The status intent map is cleared on user/session identity changes and expires through the same pending-sync TTL as other optimistic UI guards.

### 2026-05-13 — Report ack uses canonical acknowledged check

Report acknowledgement state is now normalized through one backend helper that accepts `seenAt`, `seen_at`, or `ack.ackedAt` as already acknowledged.

Bootstrap uses that helper when deciding which `reportItems` are unread. `ackAllUnread` also scans recent report items in addition to the `seenAt == null` query, so repeated projections with missing/null seen fields should still be acknowledged and should not reopen `While you were away`.

### 2026-05-13 — Outbox stores delivery dedupe at row level

`buildPlannerOutboxItem(...)` now preserves `delivery_dedupe_key` / `deliveryDedupeKey` on the outbox row itself, in addition to any nested payload copy.

This makes delivery dedupe explicit at the queue contract boundary. `drainOutbox(...)` can now suppress equivalent Telegram/email deliveries even if a future outbox payload builder forgets to duplicate the semantic key inside `payload`.

### 2026-05-13 — Planner self-test debug contract

The authenticated debug endpoint now supports `target: "self-test"`.

The self-test uses a deterministic synthetic user id derived from the real user id, so it does not create, move, or delete real user tasks. It runs one temporary `__SELF_TEST__` task through the same route/command path as the product:

- create task -> active;
- complete task -> Heaven;
- move task -> Cemetery;
- reopen task -> active;
- delete forever -> missing.

The result is returned as `debugRun.kind = "planner_self_test"` with pass/fail step details. This gives us a safe smoke test for the fragile Heaven/Cemetery/Delete Forever loop without relying on manual user data.

The web route runtime adapter now also exposes `completedTaskKeyboard`, because complete/kill routes call that keyboard after command execution. Without this adapter method, a backend state mutation could succeed while the route response failed afterward.

### 2026-05-13 — Production self-test worker action

Added `/api/telegram-nudge?action=planner-self-test` as a production smoke-test action for the Planner Engine status loop.

The action intentionally does not accept a real `userId`. It always runs against the fixed synthetic profile `planner_worker_self_test`, then returns a `planner_worker_result_v1` response with the embedded `planner_self_test` result.

This gives us a way to verify production Firestore + command routing + Heaven/Cemetery/Delete Forever behavior without requiring a logged-in browser session and without touching real user tasks.

It lives inside the existing `telegram-nudge` worker function instead of adding a new serverless function, because the project is already at the Hobby-plan function count limit.

### 2026-05-13 — Self-test result is visible in Progress

The web Progress debug panel now keeps the latest `planner_self_test` result on screen after `Run self-test`.

The result card shows pass/fail, passed/failed counts, and each transition step (`active`, `completed`, `dead`, `missing`). This avoids relying on a temporary toast/status line and gives the user a clear place to copy the failure if the status loop breaks again.

### 2026-05-14 — Fresh optimistic intent also guards command/bootstrap races

The web client now keeps fresh optimistic task transitions protected even when a command/bootstrap response arrives during the short pending-sync window.

This is intentionally not a second source of truth. The guard exists only while a user action is actively catching up with Firestore/backend state. If the backend confirms the same status, the local intent is cleared. If no confirmation arrives within the pending-sync TTL, the backend snapshot wins again.

This closes the visible gap where a user could click `Done`, drag a task to Cemetery, or delete a task forever, then see an older command/bootstrap snapshot briefly put the card back before the final backend state arrived.

### 2026-05-14 — Login report waits for bootstrap before closing the entry window

The `While you were away` panel remains a login/session report, not a live notification stream.

A first empty realtime `reportItems` snapshot no longer closes the entry window by itself. Bootstrap may run the Planner Engine and create unread report items immediately after that initial empty snapshot. The entry window now stays available until bootstrap finishes, so the report can appear when there is real backend-generated content, while still being gated to one initial app-entry moment.

### 2026-05-14 — Pending guards clear only on raw backend confirmation

The web client no longer clears a fresh optimistic status/removal guard just because the merged client state looks correct.

Merged client state can already include the optimistic local intent, so using it as confirmation was unsafe. Status guards now clear only when the raw backend response contains the task with the confirmed target status. Delete-forever guards clear only when the raw backend response no longer contains the task.

This keeps stale command/bootstrap/live snapshots from briefly resurrecting a task after `Done`, Heaven/Cemetery moves, reopen, or delete forever actions.

### 2026-05-16 — Angel Engagement Loop contract

Added `docs/angel-engagement-loop.md` as the product/backend contract for the next engagement layer.

The loop is intentionally thin over the existing Planner Engine:

- Planner Engine decides why the user should be invited back;
- Outbox delivers a gentle Telegram/email/push invitation;
- UI opens an Angel Entry Session instead of dumping the full task list;
- user actions still go through PlannerCommandService;
- report items narrate meaningful state changes.

The contract also defines `Not Your Move` / `Сейчас не твой ход` as an external-dependency task state. This prevents the planner from treating all unfinished work as procrastination and gives the angel safe actions such as check-in, follow-up, and context holding instead of "finish this today" pressure.

### 2026-05-16 — Angel engagement helper contract

Added `api/_lib/planner-angel-engagement-contract.js` as a pure helper module for the engagement layer.

It defines:

- `AngelEntrySession` trigger/mode/source constants;
- semantic dedupe key generation for future Telegram/email/push invitations;
- a normalized `not_your_move_v1` metadata shape;
- an `isTaskNotYourMove(...)` helper for future Planner Engine filters.

The helper is not wired into production behavior yet. It exists so the next implementation step can reuse one contract instead of inventing engagement/session shapes independently in UI, Telegram, and engine code.

### 2026-05-16 — Angel entry selector draft

Added `api/_lib/planner-angel-entry-selector.js` as a pure, non-mutating selector for future Angel Entry Sessions.

The selector can choose a candidate session from existing task snapshots with this priority:

- due `Not your move` check-in;
- deadline pressure;
- important task without a first open step;
- cold active task;
- daily check-in fallback.

It is intentionally not wired into production behavior yet. The purpose is to make the future engagement loop share one selection rule before Telegram/email/UI start using it.

### 2026-05-16 — Angel engagement copy helper draft

Added `api/_lib/planner-angel-engagement-copy.js` as a pure notification-copy helper for future Angel Entry Session delivery.

The helper converts a selected session into soft copy for Telegram/email/push without dumping a raw task list. It distinguishes:

- `Not your move` check-ins;
- deadline rescue;
- important tasks with no first step;
- cold task re-entry;
- ordinary daily check-in.

It is not wired into delivery yet. This keeps the next delivery step contract-first and prevents Telegram/email renderers from inventing separate tones.

### 2026-05-16 — Angel engagement outbox payload builder draft

Added `api/_lib/planner-angel-engagement-outbox.js` as a pure outbox payload builder for future Angel Entry Session delivery.

The builder can produce Telegram/email outbox payloads from a session candidate and shared copy helper, with semantic delivery dedupe keys:

```txt
telegram:angel-entry:{userId}:{trigger}:{taskId|none}:{dayBucket}
email:angel-entry:{userId}:{trigger}:{taskId|none}:{dayBucket}
```

It is not wired into Planner Engine or delivery yet. This keeps the next integration step safe: the engine can later enqueue engagement invitations without inventing channel-specific payload shapes.

### 2026-05-16 — Not Your Move command vocabulary

Added the command/action/event vocabulary for the future external-dependency flow:

- `TASK_MARK_NOT_YOUR_MOVE`;
- `TASK_CLEAR_NOT_YOUR_MOVE`;
- `TASK_SET_CHECKIN`;
- `TASK_MARKED_NOT_YOUR_MOVE`;
- `TASK_CLEARED_NOT_YOUR_MOVE`;
- `TASK_CHECKIN_SET`.

Command event/report wording now has explicit messages for "Not your move", returning a task from that state, and setting a gentle check-in. These are not wired into UI routes yet; they reserve one canonical vocabulary before implementation.

### 2026-05-16 — Not Your Move engine-rule helper

Added `api/_lib/planner-not-your-move-rules.js` as a pure read-only rule helper for future Planner Engine integration.

It defines the intended behavior for external-dependency tasks:

- suppress execution pressure while the task is waiting;
- exclude waiting tasks from mission pressure unless check-in is due;
- exclude waiting tasks from auto-cemetery staleness;
- expose allowed actions such as `check_status`, `write_followup`, `save_evidence`, and `set_checkin`;
- expose forbidden nudges such as `finish_today`, `do_main_task_now`, and `shame_for_no_progress`.

The helper is not wired into production decisions yet. It is a contract boundary for the next safe implementation step.

### 2026-05-16 — Angel Engagement safe wiring order

Documented the first safe wiring order for Angel Engagement:

1. bootstrap-only candidate projection;
2. dismissible UI entry card;
3. report-only audit;
4. Telegram pilot;
5. email pilot;
6. push later.

The acceptance checklist explicitly guards against duplicate invites, stale auto-burial of `Not your move` tasks, noisy delivery events, and bypassing PlannerCommandService.

### 2026-05-16 — Angel Entry bootstrap projection guard

Added `api/_lib/planner-angel-entry-bootstrap-contract.js` as a pure bootstrap projection helper.

It compacts a selected Angel Entry Session into UI-safe fields and gates session creation by away-time, with a default 18-hour gap. This keeps the future UI integration from recreating an entry card on every refresh and repeats the lesson from `While you were away`: entry panels must be tied to app-entry context, not treated as a live stream.

### 2026-05-16 — Angel Entry bootstrap projection added

`buildPlannerBootstrapPayload(...)` now returns `angel_entry_session` as a projection-only field.

This is deliberately low-impact:

- no task mutation;
- no report item write;
- no outbox enqueue;
- no UI display yet;
- gated by the bootstrap projection guard.

The frontend can start consuming this when we choose to add the Angel Entry Card, without making Telegram/email/push live first.

### 2026-05-16 — Frontend adapter carries Angel Entry projection

`src/plannerClientStateAdapter.js` now preserves `angel_entry_session` from bootstrap as `angelEntrySession` in the normalized client update.

No UI is rendered from it yet. This is only a client-contract bridge so a future Angel Entry Card can consume the projection from the same adapter used for tasks, planner meta, report items, and event items.

### 2026-05-16 — Angel Entry report narration helper

Added `api/_lib/planner-angel-entry-report-specs.js` as a pure helper for future Planner Report items around Angel Entry Sessions.

It defines report wording for prepared, acted, and dismissed entry sessions, plus special copy for `not_your_move_checkin_due` and `task_getting_cold`. The helper is not wired yet; it prevents future report integration from turning engagement sessions into noisy delivery/debug events.

### 2026-05-16 — Angel Entry projection visible in contract status

Planner Engine contract status now includes an `angel_entry_projection` layer.

Bootstrap recomputes contract status after building the projection-only `angel_entry_session`, so Progress/debug can show whether a candidate exists without rendering an entry card or sending delivery notifications.

### 2026-05-16 — Angel Entry contract status cleanup

Removed the redundant pre-projection contract-status build in bootstrap. Contract status is now built once after `angel_entry_session` is selected.

The `angel_entry_projection` layer now reports:

- `ok` when a candidate exists with `angel_entry_bootstrap_v1`;
- `ready` when no candidate is currently projected;
- `warning` if a candidate exists without the expected contract version.

### 2026-05-16 — Angel Entry health diagnostic

Planner health snapshot now includes a compact `angelEntry` diagnostic when bootstrap projects a candidate.

The bootstrap payload also stores the projection under `planner_meta.angel_entry_session` so debug/status surfaces can inspect the selected trigger, mode, task id, source, and expiry without rendering a user-facing entry card yet.

### 2026-05-16 - Angel Engagement implementation boundary

Angel Engagement Loop is currently a contract/projection layer, not a fully interactive feature.

Ready:
- Angel Entry Session helper contract.
- Angel Entry selector and bootstrap projection guard.
- Not Your Move command vocabulary and read-only engine rules.
- Planner bootstrap can return a versioned `angel_entry_session` candidate.
- Frontend response adapter can carry the projection without forcing UI behavior.
- Contract/health diagnostics can show whether a candidate exists.

Not ready:
- No visible Angel Entry UI yet.
- No Not Your Move task action UI yet.
- No production delivery enqueue for Angel Entry notifications yet.
- No Angel Entry dismiss/ack flow yet.
- No report projection writes for Angel Entry actions yet.

Deploy/test gate:
- Before shipping user-facing behavior, run build/self-test and then wire exactly one UI surface first.
- Do not wire Telegram/email engagement delivery until session dedupe and dismiss/ack behavior are visible and tested.

### 2026-05-16 - Angel Entry ack contract

Added a pure Angel Entry ack/suppression contract helper.

Contract:
- `dismissed` suppresses the same semantic Angel Entry for 6 hours.
- `acted` suppresses it for 18 hours.
- `deferred` suppresses it for 18 hours.
- `opened_full_planner` suppresses it for 6 hours.

Why:
- Angel Entry must invite the user back into action without recreating the old `While you were away` spam pattern.
- A user dismissal or action must be respected by bootstrap, reports, and future Telegram/email delivery.

Current status:
- Helper exists but is not wired to storage/bootstrap yet.
- No production behavior changes until the helper is connected to an ack store.

### 2026-05-16 - Angel Entry ack wiring plan

Defined the minimal storage/wiring plan for Angel Entry suppression.

Planned storage:
- `planner_meta.angel_entry_ack` stores the latest semantic ack record.

Bootstrap behavior:
- Build a candidate Angel Entry session.
- Compare it with the latest ack record.
- If the same semantic session is still suppressed, return no session.

Command behavior:
- UI dismissal/action must be a PlannerCommandService command.
- It should write an ack record and a low-noise event.
- It should not generate user-facing report spam for simple dismissals.

Delivery behavior:
- Future Telegram/email/push Angel Entry invites must check suppression before enqueueing.
- Outbox dedupe remains separate from ack suppression.

### 2026-05-16 - Angel Entry bootstrap suppression hook

Connected the bootstrap projection helper to the Angel Entry ack contract.

Behavior:
- Bootstrap can still build an Angel Entry candidate after the away-time gate.
- If `planner_meta.angel_entry_ack` or equivalent root-level ack suppresses the same semantic session, bootstrap returns no `angel_entry_session`.
- This is a suppression hook only; there is still no UI command that writes the ack record.

Why:
- Before adding visible Angel Entry UI or Telegram/email engagement, the backend response must already know how to respect user dismissal/action/defer state.

### 2026-05-16 - First visible Angel Entry UI pilot

Added the first frontend surface for the Angel Entry Session projection.

Behavior:
- If bootstrap returns `planner_meta.angel_entry_session`, the app can render an Angel Entry card before the Executive State layer.
- The card is intentionally non-delivery and non-persistent for now.
- `Start` maps the backend session mode into the existing Executive State / rescue flows.
- `Not now` only dismisses locally for the current page session.
- No Telegram/email/push behavior was enabled.
- No backend ack write was enabled yet.

Build status:
- Production build passed after the UI pilot.

Next gate:
- Deploy a small batch only if the user wants to test the visible Angel Entry card on production.
- Backend ack persistence should come before any engagement notifications are wired to outbox.

### 2026-05-16 - Angel Entry manual preview flag

Added a frontend-only manual preview flag for the Angel Entry UI pilot.

URLs:
- `/main?angelEntry=1`
- `/demo?angelEntry=1`

Behavior:
- Real backend `angel_entry_session` still wins when present.
- If no backend session exists, the preview flag creates a local preview session from the current rescue/default task.
- No backend data is written.
- No Telegram/email/push delivery is enabled.

Purpose:
- Allows testing the first Angel Entry surface without weakening the production away-time / anti-spam bootstrap gate.
### 2026-05-16 — Telegram AI intent confirmation boundary

Telegram plain-text routes that come from the AI/natural-language parser no longer execute high-risk task-state changes immediately.

Current confirmation boundary:

- `complete_task` from AI/natural text is held behind a Telegram confirm button.
- `kill_task` from AI/natural text is held behind a Telegram confirm button.
- Slash commands and explicit Telegram callback buttons remain explicit user actions and continue through `PlannerCommandService`.
- The AI parser may classify intent, but the final mutation still requires user confirmation for these high-risk transitions.

This keeps emotional or ambiguous messages such as "пусть умрет" from being turned into task-state changes without a second user action.
