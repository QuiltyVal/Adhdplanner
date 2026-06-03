# Live Angel Verification Checklist

Use this checklist before treating any new angel, capture, Engine, or delivery behavior as stable in production.

Production app: `https://planner.valquilty.com`

## Scope

This checklist covers the real end-to-end path:

1. capture ingestion
2. extraction / draft-card review
3. commitment or task linkage
4. Planner Engine decision and visible reason
5. report / event / outbox trace
6. Telegram delivery, when explicitly included
7. refresh and cross-device persistence
8. recovery if extraction or decision is wrong

## Preconditions

- Work from the latest `main` commit and note the commit hash.
- Confirm the Vercel production deployment is `Ready` and `planner.valquilty.com` points at it.
- Open the app in the real authenticated account, not `/demo`, when validating live writes.
- Open Progress -> Decision Safety and confirm the visible badge says `Live QA: cloud-authenticated`. If it says `Live QA blocked: guest/local session`, stop.
- Run `Run self-test` from Progress before starting any live mutation.
- Create a safety snapshot from Progress Decision Safety before a test that may mutate real tasks.
- Use `Copy QA packet` in Progress -> Decision Safety, then keep that copied or displayed text with the test notes. It combines the QA baseline and Decision Trace in one block with one timestamp.
- Confirm the copied QA packet says `mode: cloud-authenticated` and `liveQaReady: yes`. If it says `guest-or-local` or `liveQaReady: no`, stop; the browser is not in the real live account.
- Treat `visibleHumanEvents` inside the packet as a recent-window diagnostic, not an append-only total. Compare `latestHumanEventAt`, `eventWindowLimit`, and the report/event rows when deciding whether an event trace is healthy.
- Use `More copy options` / `Ещё копировать` only when you need a narrower `Copy QA baseline` or `Copy decision trace` diagnostic.
- Use one deliberately named QA task/capture so cleanup is unambiguous, for example `QA angel verification <date>`.

Stop immediately if the QA packet state looks wrong, old tasks disappear, outbox has unexpected retry/dead rows, or the app shows stale cloud/cache warnings.

## 1. Capture Ingestion

Action:
- Open Angel Lab.
- Enter one messy but bounded brain dump, for example:
  - `QA angel verification: I need to send one application tomorrow, record a short planner demo, and not overbuild the portfolio tonight.`
- Draft task cards.

Expected UI evidence:
- Angel Lab shows draft cards, not immediate task creation.
- The draft summary says nothing was added until confirmation.
- Normal cards have `Fix parse`.
- Weak cards, if any, have `Clarify this`.

Expected storage/debug evidence:
- A capture exists for the submitted text if this is an authenticated non-demo run.
- Repeating the same browser action should not create duplicate active tasks without confirmation.

Stop if the brain dump silently creates multiple tasks before confirmation.

## 2. Extraction Review

Action:
- Inspect each draft card title and its selected micro-step.
- Click `Fix parse` on one intentionally wrong or too-broad card.

Expected evidence:
- `Fix parse` appends a focused correction prompt back into the Angel Lab textarea.
- Draft progress stays unchanged for that action.
- Active task count and actions-today count stay unchanged.
- Re-clicking the same repair action is disabled once the prompt is present.

Stop if `Fix parse` creates, deletes, completes, or skips a task.

## 3. Confirm One Task

Action:
- Confirm exactly one low-risk QA card with one selected micro-step.

Expected evidence:
- One new active task appears.
- The first visible next step matches the selected micro-step.
- Planner score/actions may update only according to existing task-add behavior.
- Planner Report or Event log records a user-visible task creation event.

Stop if more than one task is created, subtasks are duplicated, or the task lands in Heaven/Cemetery/Purgatory unexpectedly.

## 4. Commitment / Linkage Check

Action:
- Open Progress.
- Inspect Decision Trace, latest Engine evidence, Planner Report, and Event log.

Expected evidence:
- The new QA task is visible as a task, event, or evidence row.
- If extraction produced commitment linkage, the task or evidence includes stable linkage fields such as `commitmentIds`, `lifeArea`, deadline, urgency, resistance, or vital hints.
- Missing commitment linkage is acceptable only if the dump did not contain a durable commitment.

Stop if commitment hints overwrite unrelated task metadata.

## 5. Planner Engine Decision

Action:
- In Progress, run `Run engine now`.
- Re-open or refresh Progress.
- Copy a fresh `QA packet` after the run.

Expected evidence:
- Decision Trace still explains the current mission, reason, rescue step, manual Today boundary, delivery state, and report/event trace.
- Latest Engine evidence updates with a recent run.
- The fresh QA packet still says `liveQaReady: yes` and includes the updated Decision Trace.
- If the QA task is not selected, there is a plausible reason: deadline order, existing Today shortlist, vital task, or fallback priority.
- If the QA task is selected, the reason is visible and not just hidden in raw Firestore.

Stop if the Engine changes Today Mission without a visible reason or pins more than the allowed Today shortlist.

## 6. Report And Event Trace

Action:
- Inspect Planner Report and Event log after the Engine run.

Expected evidence:
- Meaningful user-facing changes appear in Planner Report.
- Internal delivery/debug noise stays out of the user-facing report.
- Event log retains lower-level events for debugging.
- Report entries do not duplicate after refresh.

Stop if the same report item reappears after being acknowledged or if debug-only outbox events dominate the user report.

## 7. Delivery / Outbox

Only run this section when Telegram/email delivery is intentionally under test.

Action:
- Confirm Telegram is linked and reachable.
- Run `Run engine now`.
- Run `Drain outbox now` once.

Expected evidence:
- Outbox pending/retry/dead counts move in the expected direction.
- Delivery Health shows the latest outbox drain result.
- Telegram receives at most one message for the same trigger/task/day.
- The delivery leaves an event/outbox trace but does not create noisy report spam.

Stop if Telegram receives duplicate messages, the app reports active dead/retry backlog, or delivery bypasses outbox.

## 8. Refresh / Cross-Device Persistence

Action:
- Hard refresh the web app.
- If possible, open the same account on a second device/browser.
- Send `/today` in Telegram.

Expected evidence:
- The QA task remains in the same world with the same selected subtask state.
- Today Mission and Decision Trace stay consistent after reload.
- Telegram `/today` agrees with the web Today Mission unless a documented rule explains the difference.

Stop if reload resurrects deleted tasks, loses the QA task, or shows legacy array-state artifacts.

## 9. Cleanup

Action:
- Complete, cemetery, or delete the QA task through the normal UI flow.
- If deletion or restore is tested, verify snapshot protection first.

Expected evidence:
- Cleanup action goes through PlannerCommandService-backed behavior.
- Planner Report/Event log records the cleanup appropriately.
- The QA task does not reappear after refresh.

## 10. Recovery Path

Use recovery when extraction, Engine choice, or delivery looks wrong.

Action:
- Use Decision Safety to create a snapshot if one was not already created.
- Use `Show backups` to inspect available snapshots.
- Use `Open report log` to verify what actually happened.
- For extraction mistakes, prefer `Fix parse` / `Clarify this` and redraft instead of accepting a wrong card.

Expected evidence:
- Recovery tools are discoverable from Progress Decision Trace.
- Snapshot restore still requires confirmation.
- Recovery does not silently overwrite newer Firestore state.

## Pass Criteria

A live validation pass is complete only when:

- exact commit and deployment are recorded;
- starting and final QA packets are recorded;
- both QA packets say `liveQaReady: yes`;
- one capture/draft path was inspected before task creation;
- one confirmed task went through the app without duplicate writes;
- Decision Trace explains the Engine state;
- report/event/outbox evidence exists for behavior that should leave a trace;
- Telegram delivery, if tested, sent no duplicates;
- cleanup succeeded and persisted after refresh;
- any anomaly is logged in `AGENT_LOG.md` before more feature work.
