## 2026-06-03 17:45 Europe/Berlin - Codex

- Summary: Investigated the live demo breakage report and stabilized plain Kanban task creation.
- Evidence:
  - Vercel production errors for the last 2h only showed `/api/telegram-nudge` deprecation warnings with HTTP 200; no Angel Lab or task-create server failures were visible.
  - Browser repro on production `/demo?reset=1&qa=bug-repro`: Angel Lab opened, accepted text, drafted a card, confirmed one task, and showed no console errors.
  - Repro found a real Kanban UX bug: plain task add reused the generic highlighted-task path, which auto-scrolled to the new card and rendered the fallback `DAY MISSION` badge even though the user had only added a normal Kanban task.
- Changed:
  - `src/App.js` — plain Kanban adds now keep the current mission visible briefly and do not trigger task highlight/auto-scroll or the misleading `DAY MISSION` fallback badge.
  - `src/App.js` — guest/demo Angel Lab create calls now pass `source: "web_angel_lab_create"` so Angel Lab keeps its own post-add focus behavior separate from plain Kanban adds.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=kanban-no-jump-after-patch`: adding `QA kanban no jump 2026-06-03` no longer gives the new card `DAY MISSION` or `.priority-target`, and no console errors appear.
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=angel-source-regression`: Angel Lab drafts and adds one card, `Done — back to planner` returns to a card with `ADDED FROM ANGEL`, and no console errors appear.

## 2026-06-03 12:45 Europe/Berlin - Codex

- Summary: Clarified QA packet wording after the authenticated live Angel Lab verification run.
- Live QA evidence:
  - Starting packet at `2026-06-03T10:07:08.380Z`: `mode: cloud-authenticated`, `liveQaReady: yes`, `active: 8`, `actionsToday: 0`, outbox `0/0/0/0`.
  - Final packet at `2026-06-03T10:31:37.847Z`: `mode: cloud-authenticated`, `liveQaReady: yes`, `active: 9`, `actionsToday: 1`, latest human event `2026-06-03T10:30:45.582Z`, engine tick `03 июн., 12:30`, outbox `0/0/0/0`.
  - Result: Angel Lab created exactly one live QA task and the command-path/engine hook stayed healthy.
  - Cleanup packet at `2026-06-03T11:39:56.500Z`: `mode: cloud-authenticated`, `liveQaReady: yes`, `active: 8`, `actionsToday: 2`, latest human event `2026-06-03T11:38:33.635Z`, engine tick `03 июн., 13:39`, outbox `0/0/0/0`.
  - Result after cleanup: QA task was removed or completed through normal UI, and the authenticated live verification pass is complete.
  - Note: the cleanup packet still showed the pre-refresh `Latest engine decisions` / `Rescue` wording, so the browser tab likely had the older app bundle until reload. Data state was healthy.
- Changed:
  - `src/App.js` — renamed the latest engine `rescue` snapshot label to `Engine rescue target` / `Rescue-цель движка` and clarified that it can be separate from the current mission. The QA packet export now says `Latest engine snapshot decisions` instead of implying every row is the current mission.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document the clarified engine rescue evidence wording.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/main?qa=engine-rescue-label`: guest/local Progress renders `След решения`, Decision Safety, primary `Скопировать QA packet`, and the copy-options disclosure without console errors.
  - Final live cleanup packet confirmed `active: 8`, `actionsToday: 2`, clean outbox counts, and fresh Engine tick.

## 2026-06-03 10:27 Europe/Berlin - Codex

- Summary: Aligned the live Angel verification checklist with the new QA packet workflow.
- Changed:
  - `docs/live-angel-verification-checklist.md` — now uses `Copy QA packet` as the primary Decision Safety evidence artifact, checks `liveQaReady: yes`, asks for a fresh packet after the Engine run, and changes pass criteria from baseline-only notes to starting/final QA packets.
  - `EXECUTION_PLAN.md` and `SESSION_HANDOFF.md` — record that the checklist now follows the QA packet flow.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`

## 2026-06-03 01:05 Europe/Berlin - Codex

- Summary: Reduced Decision Safety copy-button clutter.
- Changed:
  - `src/App.js` — kept `Copy QA packet` / `Скопировать QA packet` as the primary visible copy action and moved separate baseline/trace buttons into a secondary copy-options disclosure.
  - `src/App.css` — styled the disclosure summary and made diagnostic copy buttons appear only when the disclosure is open.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document the new primary/secondary copy layout.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/main?qa=qa-packet-options`: in the collapsed state, visible Decision Safety actions include `Скопировать QA packet` and `Ещё копировать` while baseline/trace are hidden; opening `Ещё копировать` reveals `Скопировать baseline` and `Скопировать trace`; `Скопировать trace` still displays a trace export with `liveQaReady: no`; no app console errors.

## 2026-06-02 23:04 Europe/Berlin - Codex

- Summary: Made the combined Decision Safety QA packet the primary copy action.
- Changed:
  - `src/App.js` — moved `Copy QA packet` / `Скопировать QA packet` before the separate baseline/trace buttons and gave it a primary copy class.
  - `src/App.css` — added a distinct green-tinted style for the primary QA packet action.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document that QA packet is now the recommended copy action.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/main?qa=qa-packet-primary`: guest/local Decision Safety orders actions as live snapshot, backups, report, primary `Скопировать QA packet`, then separate `baseline` and `trace`; the packet button carries the primary class, live snapshot remains disabled, clicking the packet displays baseline and trace sections, and no app console errors appear.

## 2026-06-02 22:48 Europe/Berlin - Codex

- Summary: Added a combined Decision Safety QA packet export.
- Changed:
  - `src/App.js` — split baseline and Decision Trace text construction into reusable builders, preserved the existing separate copy buttons, and added `Copy QA packet` / `Скопировать QA packet` that combines both exports with one timestamp.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document the combined QA packet.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/main?qa=qa-packet`: guest/local Decision Safety shows `Скопировать baseline`, `Скопировать trace`, and `Скопировать QA packet`; the live snapshot guard remains disabled; clicking `Скопировать QA packet` displays `ADHD Planner live QA packet` with `=== QA baseline ===`, `=== Decision trace ===`, `liveQaReady: no`, `stopReason: guest-or-local session`, and no app console errors.

## 2026-06-02 22:15 Europe/Berlin - Codex

- Summary: Made the Decision Safety live-QA stop condition harder to miss.
- Changed:
  - `src/App.js` — copied QA baseline and Decision Trace exports now include `liveQaReady` and `stopReason`; the Decision Safety live snapshot action is disabled and relabeled in guest/local sessions.
  - `src/App.css` — disabled Decision Safety actions now use a blocked cursor instead of a wait cursor.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document the explicit live-QA guard.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/main?qa=live-qa-guard`: guest/local Decision Safety shows `Live snapshot недоступен`, the live snapshot button is disabled, the normal create-snapshot label is absent, `Скопировать baseline` and `Скопировать trace` remain available, both copied outputs include `liveQaReady: no` and `stopReason: guest-or-local session`, and no app console errors appear.

## 2026-06-02 21:55 Europe/Berlin - Codex

- Summary: Added a non-mutating Decision Trace text export.
- Changed:
  - `src/App.js` — extracted Decision Trace row construction into one reusable builder, added a shared clipboard/fallback helper for Decision Safety exports, preserved `Copy QA baseline`, and added `Copy decision trace` / `Скопировать trace`.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document the new trace export.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/main?qa=copy-trace`: guest/local Decision Safety shows both `Скопировать baseline` and `Скопировать trace`; clicking `Скопировать trace` displays `ADHD Planner decision trace` with mode, mission metadata, Decision Trace rows, and no app console errors; clicking `Скопировать baseline` still displays `ADHD Planner live QA baseline` with `visibleHumanEvents`, `technicalEventsVisible`, and guest/local mode.

## 2026-06-02 21:18 Europe/Berlin - Codex

- Summary: Removed the remaining generic `Back` ambiguity from partial Angel Lab drafts.
- Changed:
  - `src/AngelLabScreen.js` — pending draft sessions now use one state-aware return action. Before the first card is handled, the top action reads `Back to planner — draft stays here`; after a card is handled, the top return action is hidden and the next-state strip keeps the only visible draft-return action. The older bottom return block is removed.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document the single partial-draft return action.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=single-exit`: before adding a draft card there is exactly one `Back to planner — draft stays here`, no generic `Back`, no bottom exit block, no `Done — back to planner`, and four draft cards. After adding one card, the next-state strip appears with three cards left, the top return action is hidden, there is exactly one `Back to planner — draft stays here`, no generic `Back`, no `Done — back to planner`, and reopening Angel Lab resumes with three cards still waiting. No browser console errors.

## 2026-06-02 20:02 Europe/Berlin - Codex

- Summary: Tightened the partial-draft Angel Lab exit copy to avoid implying durable storage.
- Changed:
  - `src/AngelLabScreen.js` — unfinished draft sessions now label the exit action as `Back to planner — draft stays here` / `В планер — черновик останется здесь`. Completed/no-pending sessions still use `Done — back to planner`.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — update the documented partial-draft exit wording.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=draft-stays-copy`: before and after adding one draft card, partial draft shows exactly one `Back to planner — draft stays here`, the older `Back to planner — keep draft` copy is absent, `Done — back to planner` is absent, remaining draft-card action buttons stay visible, reopening resumes with `Resuming Angel draft: 3 card(s) still waiting.`, and no browser console errors appear.

## 2026-06-02 19:49 Europe/Berlin - Codex

- Summary: Clarified the partial-draft Angel Lab exit copy.
- Changed:
  - `src/AngelLabScreen.js` — unfinished draft sessions now label the exit action as `Back to planner — keep draft` / `В планер — черновик сохранится`. Completed/no-pending sessions still use `Done — back to planner`.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document that partial draft exit means "leave and preserve the draft", not "all draft work is done".
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=keep-draft-copy`: before and after adding one draft card, partial draft shows exactly one `Back to planner — keep draft`, shows no `Done — back to planner`, keeps remaining draft-card action buttons visible, resumes with `Resuming Angel draft: 3 card(s) still waiting.`, and has no browser console errors.

## 2026-06-02 16:38 Europe/Berlin - Codex

- Summary: Kept Angel Lab partial draft context when reopening the lab.
- Changed:
  - `src/App.js` — reopening Angel Lab with pending draft cards now shows a resume status, preserves added/skipped progress and last-action context, and avoids pre-filling demo text over an unfinished draft. Fresh opens with no pending draft still reset the session context normally.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document the pending-draft resume behavior.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=resume-draft`: after drafting demo cards, adding one selected card, leaving Angel Lab, and reopening it, the lab shows `Resuming Angel draft: 3 card(s) still waiting.`, preserves progress as `1 added / 0 skipped / 3 left`, shows the post-add next-state panel, keeps exactly one `Done — back to planner` action, keeps the textarea empty, and has no browser console errors.

## 2026-06-02 15:25 Europe/Berlin - Codex

- Summary: Made the Angel Lab return highlight easier to notice.
- Changed:
  - `src/App.js` — keeps focused task highlights visible for 5.2 seconds, compares highlighted task ids as strings, and passes an Angel-specific highlight label after Angel Lab closes.
  - `src/TaskColumn.js` — renders the focused-task badge from the provided highlight label, falling back to the existing day-mission label for generic highlights.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document the longer Angel Lab return highlight and outcome-specific card badge.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=angel-highlight-2`: after drafting demo cards, adding one selected card, and clicking `Done — back to planner`, the returned card has `.task-card.priority-target`, the badge reads `ADDED FROM ANGEL`, the highlight remains after roughly 3.8 seconds, clears after the timeout, planner status includes `Added from Angel Lab`, and no browser console errors appear.

## 2026-06-02 15:08 Europe/Berlin - Codex

- Summary: Removed the duplicate Angel Lab return action after a partial draft confirmation.
- Changed:
  - `src/AngelLabScreen.js` — reuses the post-add next-state condition and hides the older bottom `Done — back to planner` action when that top next-state strip is visible.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document that partial draft sessions now show one clear return action instead of duplicate exits.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=dedupe-done`: after drafting demo cards and adding one selected card, `.angel-lab-next-panel` is visible, `Done — back to planner` appears exactly once, `.angel-lab-bottom-actions` is absent, closing Angel Lab returns to the planner with `Added from Angel Lab`, and no browser console errors appear.

## 2026-06-02 14:46 Europe/Berlin - Codex

- Summary: Made Angel Lab return focus to the applied task after closing.
- Changed:
  - `src/App.js` — tracks the last Angel Lab applied task for create, merge, and existing-duplicate outcomes. Closing Angel Lab now focuses the Active list, scrolls to that task through the existing highlight path, and shows `Added from Angel Lab`, `Updated from Angel Lab`, or `Already in planner`.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document the post-close task focus behavior.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=return-focus`: after drafting demo cards, adding one selected card, and clicking the top `Done — back to planner`, Angel Lab closes, planner status includes `Added from Angel Lab`, the Active list is focused, the applied task is highlighted, and no browser console errors appear.

## 2026-06-02 13:52 Europe/Berlin - Codex

- Summary: Added clearer Angel Lab next-state feedback after a draft card is handled.
- Changed:
  - `src/AngelLabScreen.js` — when at least one draft card has been added/skipped and more cards remain, Angel Lab now shows a compact next-state strip: added cards are already in the planner, remaining card count, next card title, and a nearby `Done — back to planner` action.
  - `src/AngelLabScreen.css` — styles the strip with responsive wrapping and a compact top action.
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document the post-add next-state behavior.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=post-add-next-state`: after drafting demo cards and adding one selected card, the next-state strip appears with `Added cards are already in the planner.`, `3 still waiting`, the next draft card title, and `Done — back to planner`; no browser console errors.
  - Mobile viewport QA at 390px width: the next-state strip wraps without horizontal overflow.

## 2026-06-02 12:03 Europe/Berlin - Codex

- Summary: Clarified the Decision Safety QA baseline event-log metric after authenticated live QA cleanup.
- Changed:
  - `src/App.js` — replaces the ambiguous `humanEvents` QA baseline field with `visibleHumanEvents`, adds `technicalEventsVisible`, `eventWindowLimit`, and `latestHumanEventAt`, resolves event timestamps more robustly, and updates Decision Trace copy to say visible human events.
  - `docs/live-angel-verification-checklist.md`, `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — document that event-log counts are recent visible-window diagnostics, not full append-only history totals.
- Why:
  - The cleanup baseline returned `active` to the pre-add value but showed `humanEvents: 23 -> 19`; code review found the web event log is bounded (`PLANNER_EVENT_LIMIT = 25`) and bootstrap returns a smaller visible event window, so this was a misleading label rather than evidence of lost tasks.
- Verification:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/main?qa=event-window`: Progress Decision Safety baseline includes `visibleHumanEvents`, `technicalEventsVisible`, `eventWindowLimit: 25`, and `latestHumanEventAt`; Decision Trace says visible human events; no browser console errors.
  - Production user-provided baseline at `2026-06-02T11:24:04.717Z`: `mode: cloud-authenticated`, `active: 8`, outbox pending/retry/dead/sending all `0`, `visibleHumanEvents: 19`, `technicalEventsVisible: 2`, `eventWindowLimit: 25`, and `latestHumanEventAt: 2026-06-02T10:40:02.753Z`.

## 2026-06-02 11:42 Europe/Berlin - Codex

- Summary: Recorded authenticated production Angel Lab live-QA progress from user-provided baselines.
- Observed:
  - Authenticated baseline at `2026-06-02T09:36:13.527Z`: `mode: cloud-authenticated`, `active: 8`, `today: 0`, `atRisk: 4`, `actionsToday: 0`, outbox pending/retry/dead/sending all `0`, mission `Выставить свитер Stone Island на продажу`, `engineDecisions: 3`, `reportItems: 30`, `humanEvents: 23`.
  - Angel Lab drafted 3 cards and did not auto-create tasks: `added: 0`, `skipped: 0`, `left: 3`.
  - User reported `Planner self-test passed: 5 passed, 0 failed.`
  - User selected exactly one subtask on the `Записать короткий демо-видео для планера` draft and added it.
  - Post-add baseline at `2026-06-02T09:42:00.507Z`: `active: 9`, `today: 0`, `atRisk: 4`, `actionsToday: 1`, outbox pending/retry/dead/sending all `0`, mission unchanged, `engineDecisions: 3`, `reportItems: 30`, `humanEvents: 23`.
  - Cleanup baseline at `2026-06-02T09:51:24.591Z`: `active: 8`, `today: 0`, `atRisk: 4`, `actionsToday: 0`, outbox pending/retry/dead/sending all `0`, mission unchanged, `engineDecisions: 3`, `reportItems: 30`, `humanEvents: 19`.
- Risks / follow-up:
  - The live QA task appears cleaned up because `active` returned to the pre-add count.
  - `humanEvents` changed from `23` to `19` after cleanup; treat this as a visible-report/event-window anomaly to inspect before relying on that count as a strict append-only metric.
  - Codex browser automation still saw a stale guest tab, so authenticated evidence is from user-pasted production baselines rather than direct automated browser inspection.

## 2026-06-01 13:27 Europe/Berlin - Codex

- Summary: Made the live-QA auth boundary visible inside Decision Safety.
- Changed:
  - `src/App.js` — adds a Decision Safety badge that says `Live QA: cloud-authenticated` or `Live QA blocked: guest/local session`.
  - `src/App.js` — shows the QA baseline in the card even if Clipboard API refuses the write.
  - `src/App.css` — styles cloud mode as green and guest/local mode as red.
  - `docs/live-angel-verification-checklist.md`, `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — documented the visible stop condition.
- Verified:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/main?qa=live-guard`: Decision Safety shows `Live QA заблокирован: guest/local сессия`; clicking `Скопировать baseline` displays the full QA baseline in-card with `mode: guest-or-local`, counts, mission, delivery, and report/event totals; no console errors.
- Risks / follow-up:
  - This is non-mutating UI safety only. The authenticated live pass is still blocked until `/main` is open in the real account.

## 2026-06-01 12:18 Europe/Berlin - Codex

- Summary: Added a non-mutating QA baseline copy action to Progress Decision Safety.
- Changed:
  - `src/App.js` — adds `Copy QA baseline` / `Скопировать baseline` to Decision Safety. It copies auth mode, user id, active/today/at-risk/action counts, outbox counts, mission, delivery summary, Engine decision count, report count, and human event count.
  - `src/App.js` — uses textarea fallback if Clipboard API exists but refuses writes in the in-app browser.
  - `docs/live-angel-verification-checklist.md`, `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/angel-engagement-loop.md` — documented the baseline step and the `guest-or-local` stop condition.
- Verified:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/main?qa=baseline`: Progress Decision Safety shows `Скопировать baseline`; clicking it copies a baseline with `mode: guest-or-local`, `active: 0`, `today: 0`, `outboxPending: 0`, mission/delivery summary, and report/event counts.
- Risks / follow-up:
  - The real authenticated live pass is still blocked until the browser is in the user's actual account; current `/main` browser session is `Guest`.
  - This change is intentionally non-mutating and does not run Telegram delivery.

## 2026-06-01 10:58 Europe/Berlin - Codex

- Summary: Added the manual live verification checklist for the angel/Planner Engine rollout path.
- Changed:
  - `docs/live-angel-verification-checklist.md` — defines the production QA path for capture ingestion, extraction review, one confirmed task, commitment/linkage evidence, Engine decision visibility, report/event/outbox traces, optional Telegram delivery, refresh/cross-device persistence, cleanup, and recovery.
  - `EXECUTION_PLAN.md` — marks the Phase 8 manual verification checklist item complete and notes that the authenticated production pass still needs to be run.
  - `SESSION_HANDOFF.md` and `docs/angel-engagement-loop.md` — point future agents to the checklist before treating new angel/delivery behavior as stable.
- Verified:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This is checklist/documentation work only. It does not run the authenticated production pass or mutate live planner data.

## 2026-06-01 10:41 Europe/Berlin - Codex

- Summary: Added a non-mutating Angel Lab repair path for wrong draft-card extraction.
- Changed:
  - `src/AngelLabScreen.js` — adds `Fix parse` / `Исправить разбор` to every non-reject draft card; it appends a correction prompt back into the dump textarea instead of creating a task.
  - `src/AngelLabScreen.js` — keeps existing `Clarify this` behavior for cards already marked `needsClarification`.
  - `src/AngelLabScreen.css` — styles parse-fix as a distinct repair action.
  - `docs/angel-engagement-loop.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the bad-extraction repair path.
- Verified:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=parse-repair`: Angel Lab drafted 4 normal cards, each showed `Fix parse`; clicking the first `Fix parse` appended `Fix this draft card: finish the planner demo` / `Correct task or next move:` into the dump textarea, kept draft progress at `0 added / 0 skipped / 4 left`, kept planner status at `5 active` and `0 actions today`, and disabled only that card's repeated repair button.
  - Browser QA console check for the local demo: no `error` logs.
- Risks / follow-up:
  - Weak-card `Clarify this` behavior is covered by existing draft-quality tests and unchanged in code, but this session's browser QA used the normal public demo cards only.

## 2026-05-31 23:46 Europe/Berlin - Codex

- Summary: Added a first user-facing Decision Safety path next to Decision Trace.
- Changed:
  - `src/App.js` — adds Decision Safety actions for normal sessions: create safety snapshot, show backups, and open the report log from Decision Trace.
  - `src/App.js` — adds refs/scroll helpers so Decision Trace can jump to Planner Report and Snapshots without changing task state.
  - `src/App.css` — styles the Decision Safety card and keeps it responsive.
  - `EXECUTION_PLAN.md`, `docs/angel-engagement-loop.md`, and `SESSION_HANDOFF.md` — documented the recovery/debug surface.
- Verified:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=safety`: public demo still has the six-row Decision Trace and does not show Decision Safety or engine-evidence disclosures.
  - Browser QA at `http://localhost:3001/main` as local guest: normal-session Progress shows Decision Safety with `Create safety snapshot`, `Show backups`, and `Open report log`; Planner Report and Snapshots sections exist as jump targets.
- Risks / follow-up:
  - The safety card is hidden in demo and local guest verified, but the snapshot/report buttons still need authenticated live QA before treating this as complete recovery UX.

## 2026-05-31 23:26 Europe/Berlin - Codex

- Summary: Kept the new Progress Decision Trace compact while restoring inspectable Planner Engine evidence for normal sessions.
- Changed:
  - `src/App.js` — adds a normal-session `Latest engine evidence` disclosure inside Decision Trace for Planner Engine decisions and inbox items.
  - `src/App.css` — styles the evidence disclosure without changing the demo's six-row public trace.
  - `src/App.css` — keeps tab navigation clickable above floating companions when avatars overlap the lower viewport.
  - `docs/angel-engagement-loop.md` and `EXECUTION_PLAN.md` — documented the compact explanation plus raw-evidence split.
- Verified:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1`: public demo still shows the compact six-row Decision Trace.
  - Browser QA at `http://localhost:3001/demo?reset=1`: demo does not show the normal-session evidence disclosure, and Progress still suppresses companion prompt/avatars.
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=tabs`: when the Progress tab sits under the companion layer, `elementFromPoint` now resolves to the Progress button and the tab opens correctly.
- Risks / follow-up:
  - Normal-session evidence rendering is build-verified but still needs authenticated visual QA against live `plannerMeta`.

## 2026-05-31 23:02 Europe/Berlin - Codex

- Summary: Promoted Decision Trace from demo-only into the first Progress surface for normal planner sessions too.
- Changed:
  - `src/App.js` — builds shared decision-trace rows for mission, reason, rescue, manual Today boundary, delivery state, and report/event trace; renders them before Delivery Health.
  - `src/App.js` — keeps Delivery Health focused on Telegram/email state and separates Engine diagnostics from user-facing decision explanation.
  - `src/App.css` — adds shared Decision Trace and diagnostics panel styling.
  - `docs/angel-engagement-loop.md` and `EXECUTION_PLAN.md` — documented the Decision Trace product surface.
- Verified:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1`: Progress shows shared `Decision trace` with 6 rows including Trace.
  - Browser QA at `http://localhost:3001/demo?reset=1`: companion prompt and avatars remain suppressed on Progress.
- Risks / follow-up:
  - Browser QA covered demo/local. The normal authenticated session path is build-verified but still needs live-auth visual QA when a logged-in session is available.

## 2026-05-31 22:32 Europe/Berlin - Codex

- Summary: Started the decision-visibility slice in the public demo by adding a safe Decision Trace to the Progress tab.
- Changed:
  - `src/App.js` — renders a demo-only Decision Trace with mission, reason, rescue step, manual Today boundary, and delivery/no-send boundary.
  - `src/App.css` — adds light styling for the demo Decision Trace panel.
  - `docs/angel-engagement-loop.md` — documents the public demo Decision Trace.
- Verified:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/demo?reset=1`: Progress shows `Decision trace` with mission, reason, rescue, boundary, and delivery rows.
  - Browser QA at `http://localhost:3001/demo?reset=1`: companion prompt and avatars are suppressed on Progress so they do not cover the trace on mobile width.
- Risks / follow-up:
  - This makes the portfolio demo explainable, but production users still need a tighter first-class decision surface in the main app/Progress view.

## 2026-05-31 22:22 Europe/Berlin - Codex

- Summary: Reconciled the recovered big Planner roadmap after the old `PLANNER` thread became unavailable. The plan now explicitly keeps the angel/memory roadmap, aligns it with Planner Engine/public demo/Angel Entry/Quest Relation work, and names decision visibility + safety as the next product slice before more autonomous pressure.
- Changed:
  - `EXECUTION_PLAN.md` — updated phase statuses, documented `plannerMeta`/Planner Engine as the active decision source, marked `angel-decision-store.js` as legacy, and added the next vertical slice.
  - `SESSION_HANDOFF.md` — updated current handoff state so future agents do not treat the public demo polish as the whole product goal.
- Verified:
  - `git diff --check`
- Risks / follow-up:
  - This was a docs-only roadmap reconciliation. The next code slice should make Engine decisions/reasons/outbox status visible in the app or Progress/debug surface.

- 2026-05-30 00:40 Europe/Berlin - Codex: Made Angel Lab Clarify this idempotent so the same clarification prompt cannot be appended repeatedly. Files: src/AngelLabScreen.js, docs/angel-engagement-loop.md.
- 2026-05-30 00:25 Europe/Berlin - Codex: Changed Angel Lab needsClarification fallback add copy to Add title only / Добавить только название. Files: src/AngelLabScreen.js, docs/angel-engagement-loop.md.
- 2026-05-30 00:10 Europe/Berlin - Codex: Added visible feedback for Angel Lab Clarify this action with textarea highlight and short local notice. Files: src/AngelLabScreen.js, src/AngelLabScreen.css, docs/angel-engagement-loop.md.
- 2026-05-29 13:50 Europe/Berlin - Codex: Added Clarify this action for Angel Lab needsClarification draft cards; it appends a focused prompt to the dump textarea without creating a task. Files: src/AngelLabScreen.js, src/AngelLabScreen.css, docs/angel-engagement-loop.md.
- 2026-05-29 13:35 Europe/Berlin - Codex: Added Angel Lab draft quality regression test and wired it into verify:server. Files: api/captures.js, tests/angel-lab-draft-quality.test.mjs, package.json, docs/angel-engagement-loop.md.
- 2026-05-29 13:20 Europe/Berlin - Codex: Adjusted Angel Lab create-card preselection to respect explicit selectedByDefault steps and avoid auto-selecting additional high-confidence steps. Files: api/captures.js, docs/angel-engagement-loop.md.
- 2026-05-29 13:05 Europe/Berlin - Codex: Added Angel Lab UI state for draftQuality.needsClarification so weak draft cards are visibly marked instead of looking ready. Files: src/AngelLabScreen.js, src/AngelLabScreen.css, docs/angel-engagement-loop.md.
- 2026-05-29 12:50 Europe/Berlin - Codex: Added Angel Lab draft quality gate to remove empty/generic/off-topic subtasks and mark weak create cards as needsClarification. Files: api/captures.js, docs/angel-engagement-loop.md.
- 2026-05-29 12:35 Europe/Berlin - Codex: Fixed Angel Lab category bleed so portfolio/demo subtasks only apply to portfolio/demo draft cards, not every card in the same dump. Files: api/captures.js, docs/angel-engagement-loop.md.
- 2026-05-29 12:20 Europe/Berlin - Codex: Filtered Angel Lab meta-confusion phrases out of draft task cards so overwhelm context does not become a fake task. Files: api/captures.js, docs/angel-engagement-loop.md.
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

## 2026-04-19 Europe/Berlin - Codex

- Summary: Added first override behavior for daily angel decision refresh to reduce stale day-plans when urgent context changes.
- Changed:
  - `api/_lib/angel-decision-store.js` — added override detection for day decision reuse:
    - `hard_deadline`: recalc if overdue/today-deadline active task is outside current day selection
    - `pin_gap`: recalc if selected pinned tasks became fewer than expected (e.g. completed/inactive)
  - `api/_lib/angel-decision-store.js` — decision docs now store `overrideReason` when recalculated
  - `EXECUTION_PLAN.md` — Phase 5 notes updated with implemented override scope
- Verified:
  - code integration + deploy/push in this session
- Risks / follow-up:
  - manual dismiss and emergency override are not implemented yet
  - day decision is still refreshed lazily on `/today` (no separate scheduler yet)

## 2026-04-19 Europe/Berlin - Codex

- Summary: Added first working daily angel-decision persistence layer: `/today` now resolves/reuses a day decision document and syncs angel pin fields to active tasks.
- Changed:
  - `api/_lib/angel-decision-store.js` — new daily decision store in `Users/{uid}/angelDecisions/{dateKey}` with deterministic 1-2 task selection, reason, and score
  - `api/_lib/planner-action-executor.js` — `show_today` now runs daily decision sync (`ensureDailyAngelPins`) before digest
  - `api/_lib/planner-action-executor.js` — added shared pin applicator for active tasks (`angelPinned`, `angelReason`, `angelScore`)
  - `api/_lib/planner-store.js` — priority score now includes `angelPinned` bonus, so angel-focused tasks stay visible
  - `EXECUTION_PLAN.md` — Phase 5 marked in progress with implementation note
- Verified:
  - code integration + production deploy in this session
- Risks / follow-up:
  - override rules (deadline shock, completed pinned task, manual dismiss, emergency) are not implemented yet
  - no separate scheduler yet; decision is refreshed lazily on `/today`

## 2026-04-19 Europe/Berlin - Codex

- Summary: Started Phase 4 angel-pin layer on server: tasks now support angel markers, and Telegram `/today` can surface angel-selected focus with explicit reason text.
- Changed:
  - `api/_lib/planner-store.js` — added task fields `angelPinned`, `angelScore`, `angelReason` to `createTask(...)` and planner fingerprint normalization; mission selection now considers `angelPinned` after manual `isToday` shortlist
  - `api/_lib/planner-store.js` — Telegram task line now shows `🤖 ангел` marker for angel-pinned tasks
  - `api/_lib/planner-action-executor.js` — `/today` now includes angel-pinned tasks in “Важное сейчас” and sends short “почему ангел выбрал” text when top task is angel-pinned
  - `EXECUTION_PLAN.md` — Phase 4 field item marked in-progress with note about partial implementation
- Verified:
  - code integration only; no tests in this session
- Risks / follow-up:
  - fields `angelPressure`, `angelDecidedAt`, `angelReviewAt` are not implemented yet
  - no dedicated decision writer exists yet; current change only prepares schema + rendering path

## 2026-04-19 Europe/Berlin - Codex

- Summary: Switched Angel Lab default behavior to simple brain-dump mode (`dump -> create cards`) so it focuses on turning chaotic text into clear new tasks without merge complexity.
- Changed:
  - `api/captures.js` — added default mode switch `ANGEL_LAB_MODE` (`simple` by default, `smart` opt-in)
  - `api/captures.js` — added `buildSimpleBrainDumpTaskCards(...)` path using deterministic parsing + actionable filtering + near-duplicate suppression
  - `api/captures.js` — in `simple` mode disabled smart merge/classification + AI subtask enrichment + create preselection pipeline (returns plain create cards)
- Verified:
  - code integration only; no tests in this session
- Risks / follow-up:
  - simple mode intentionally does not merge into existing tasks; if needed later, keep it in optional `smart` mode only

## 2026-04-19 Europe/Berlin - Codex

- Summary: Added beta auto-preselection for `create` Angel Lab cards so 1-2 strongest subtasks are selected by default, while keeping an instant rollback switch.
- Changed:
  - `api/captures.js` — added `applyCreateCardSubtaskPreselection(...)` after server card enrichment; applies only to `mode: "create"` cards and selects up to 2 highest-confidence subtasks
  - `api/captures.js` — added env flag `ANGEL_LAB_CREATE_AUTO_PRESELECT` (`"1"` default enabled, set `"0"` to disable and return to strict manual selection)
- Verified:
  - code integration only; no tests and no deploy in this session
- Risks / follow-up:
  - if low-confidence AI subtasks still feel noisy, raise threshold (`CREATE_CARD_AUTO_PRESELECT_MIN_CONFIDENCE`) or disable with env flag

## 2026-04-18 Europe/Berlin - Codex

- Summary: Added transparent capture-enrichment reporting so Angel Lab can tell the user which existing tasks were updated and which fields changed after saving a dump.
- Changed:
  - `api/_lib/capture-extractor.js` — `taskEnrichment` now includes `updatedTasks[]` with task text and changed field keys (`urgency`, `resistance`, `isVital`, `deadlineAt`, `lifeArea`, `commitmentIds`)
  - `src/App.js` — Angel Lab success status now shows human-readable update details (`Обновила N задач: ...`) based on server enrichment output
- Verified:
  - code integration only; no tests and no deploy in this session
- Risks / follow-up:
  - enrichment messages can be long when many tasks are updated; UI currently truncates by showing top 3 and `+N`

## 2026-04-18 Europe/Berlin - Codex

- Summary: Stabilized Angel Lab extraction quality and then moved to the next plan item by adding safe web-capture hint upsert into active tasks via server-domain mutation path.
- Changed:
  - `api/_lib/capture-extractor.js` — added conservative extraction->task enrichment pass (`applyExtractionTaskHints`) with fuzzy matching guardrails, safe field merges (`urgency`, `resistance`, `isVital`, `deadlineAt`, `lifeArea`, `commitmentIds`), and `mutatePlanner` stale-safe writes
  - `api/captures.js` — now returns `taskEnrichment` summary from capture processing
  - `EXECUTION_PLAN.md` — added Phase 2 note about safe web capture hint upsert and clarified remaining scope (MCP enrichment still pending)
  - `SESSION_HANDOFF.md` — documented new capture->task enrichment behavior
- Verified:
  - code integration only; no tests and no deploy in this session
- Risks / follow-up:
  - enrichment currently updates only existing active tasks; it does not create tasks (intentional)
  - matching is conservative by design and may skip ambiguous captures; MCP-originated capture enrichment remains TODO

## 2026-04-18 Europe/Berlin - Codex

- Summary: Added a cross-platform planner action API layer so future Android/iOS (and web thin clients) can execute the same server/domain action contract as Telegram, with Firebase-authenticated client access.
- Changed:
  - `api/planner-client-actions.js` — new `POST /api/planner-client-actions` endpoint (Firebase bearer auth, action validation, shared action execution, optional state response)
  - `api/_lib/planner-actions-runtime.js` — new shared runtime helper for body parsing, flag parsing, adapter capture, and `executePlannerAction` orchestration
  - `api/planner-actions.js` — refactored to reuse shared runtime helper (secret-based server-to-server path preserved)
  - `api/_lib/planner-contract.js` — expanded allowed action set (`show_completed`, `panic_task`, `unset_vital`) to match executor capabilities
  - `EXECUTION_PLAN.md` — marked cross-platform boundary item done and added notes about new client/server action endpoints
  - `SESSION_HANDOFF.md` — updated Telegram route-executor status and documented new planner action API surfaces
- Verified:
  - code integration only; no tests and no deploy in this session
- Risks / follow-up:
  - web UI still has local direct task mutations; to complete thin-client migration, progressively move those paths behind planner action API calls
  - client endpoint currently accepts explicit `userId` only when it matches auth uid; multi-user admin scopes are intentionally not supported yet

## 2026-04-15 Europe/Berlin - Codex

- Summary: Added web captures end-to-end (UI + API) as append-only brain-dump intake into canonical `Users/{uid}/captures` storage, and aligned the endpoint with existing capture contract.
- Changed:
  - `src/App.js` — added `Выгрузить из головы` action and modal wiring
  - `src/App.css` — added launch-button styles for capture action in header
  - `src/CaptureComposer.js` + `src/CaptureComposer.css` — new capture modal UI and interaction states
  - `api/captures.js` — new `POST /api/captures` endpoint with payload validation
  - `api/_lib/capture-store.js` — append helper now reuses `writeCapture(...)` contract from planner-store
  - `EXECUTION_PLAN.md` — marked web append-only capture intake as done
  - `SESSION_HANDOFF.md` — recorded web capture intake in memory groundwork
- Verified:
  - code integration only; no tests and no deploy in this session
- Risks / follow-up:
  - endpoint currently uses `PLANNER_DEFAULT_USER_ID`; add authenticated user resolution when auth/session layer is exposed server-side
  - extraction is still asynchronous/not wired as immediate response in `/api/captures`

## 2026-04-15 Europe/Berlin - Codex

- Summary: Added a portable multi-machine / multi-agent repo wrapper so the project can be developed comfortably from both home and office without depending on one hardcoded Mac path.
- Changed:
  - `README.md` — rewritten around portable setup, daily sync, and agent handoff
  - `AGENTS.md` + `CLAUDE.md` — switched to repo-relative links and added multi-machine guidance
  - `MACHINE_SETUP.md` — new first-clone / new-machine setup guide
  - `WORKFLOW.md` — new daily home/office and parallel-agent workflow doc
  - `scripts/bootstrap-machine.sh` — new fresh-machine bootstrap helper
  - `scripts/sync-local.sh` — new safe `main` sync helper for switching machines
  - `package.json` — added `bootstrap`, `sync`, `verify`, and `verify:server` scripts
  - `.nvmrc` — pinned recommended Node major to `24`
  - `.gitignore` — now ignores `.DS_Store` and `.vercel`
  - `SESSION_HANDOFF.md` — added repo portability notes
- Verified:
  - repo docs updated
  - package scripts updated
- Risks / follow-up:
  - root `.DS_Store` is still currently tracked from older repo history; removing it from git can be done later if desired, but it was not force-removed in this pass

## 2026-04-11 (evening) — Claude (Sonnet 4.6, remote session)

- Summary: Replaced all regex-based Telegram routing with unified LLM intent router. Bot now has 12 intents and full conversation context — "давай последнюю" after suggest_unpin now resolves correctly.
- Changed:
  - `api/_lib/telegram-intent.js`: full rewrite. 12 intents (add_task, complete_task, reopen_task, delete_subtask, add_subtask, set_today, unset_today, set_vital, suggest_unpin, show_today, panic, schedule_task, chat). Rich system prompt with full task list + telegramContext.suggestedTaskTexts. No regex post-processing.
  - `api/_lib/planner-store.js`: buildTelegramContext now accepts extra={} fields; ensurePlannerDoc preserves suggestedTaskTexts.
  - `api/telegram-webhook.js`: removed regex pre-filters. Added handlers: handleSuggestUnpin, handleSetToday, handleUnsetToday, handleSetVital, handleAddSubtask, handleReopenTask. handlePlainCapture passes full telegramContext to LLM.
- Verified:
  - `node server ok` passes, `npm run build` passes, pushed to main
- Risks / follow-up:
  - **⚠️ Hetzner still needs deploy**: `git pull origin main && pm2 restart all`
  - After deploy, test: "предложи что открепить" → "давай последнюю"
  - Codex's planner-agent-router.js / planner-action-executor.js were in their commits — after rebase those are replaced by this cleaner unified approach

## 2026-04-11 12:15 Europe/Berlin - Codex

- Summary: Extracted Telegram text routing into a dedicated `planner-agent-router` module so incoming bot messages now go through one shared decision point before hitting execution handlers.
- Changed:
  - `api/_lib/planner-agent-router.js`: new shared router for Telegram text input; centralizes explicit rule overrides plus AI-intent fallback into one action contract
  - `api/telegram-webhook.js`: `handlePlainCapture` now uses `routePlannerAgentInput(...)` instead of locally chaining regex + `parseTelegramIntent`
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/_lib/planner-agent-router'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - execution still lives in Telegram-specific handlers; next architectural step is a shared planner action executor so other channels can reuse the same mutation layer
  - webhook still contains some now-duplicate parsing helpers that can be removed after a short stabilization period

## 2026-04-11 12:35 Europe/Berlin - Codex

- Summary: Taught Telegram to treat follow-ups like `давай последнюю` and `нет, последняя была ...` as a selection from the last unpin suggestion list instead of a generic context task.
- Changed:
  - `api/_lib/planner-store.js`: `telegramContext` now preserves `suggestedTaskId` and `candidateTaskIds`
  - `api/_lib/planner-agent-router.js`: added selection-context routing for follow-ups after `today_limit` / `suggest_unpin_today`
  - `api/telegram-webhook.js`: added `resolveSuggestedTodayTaskReference()` and now uses the stored candidate list when unpinning from a suggested shortlist
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/_lib/planner-agent-router'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - selection memory is currently tailored to the today-unpin flow; if similar list-based choices appear elsewhere, move this into a generalized `selection_context` layer

## 2026-04-11 13:00 Europe/Berlin - Codex

- Summary: Introduced a real `planner-action-executor` layer and switched Telegram plain-text handling to `route -> execute`, so webhook text flow no longer performs action branching inline.
- Changed:
  - `api/_lib/planner-action-executor.js`: new shared executor for planner actions (`add_task`, `add_subtask`, `complete_task`, `reopen_task`, `set_today`, `unset_today`, `set_vital`, `suggest_unpin`, `show_today`, `panic`, `schedule_task`, `chat`)
  - `api/telegram-webhook.js`: `handlePlainCapture` now delegates to `executePlannerAction(...)` after routing instead of executing many Telegram-specific branches directly
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/_lib/planner-agent-router'); require('./api/_lib/planner-action-executor'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - callback buttons and slash commands still use local webhook handlers; next step is to migrate them onto the same executor contract
  - old helper functions still remain in `api/telegram-webhook.js`; remove them only after a short stabilization window

## 2026-04-11 11:55 Europe/Berlin - Codex

- Summary: Added a dedicated Telegram `unset_today` path so follow-ups like `открепи последнюю` no longer reopen the wrong task, and added fuzzy task matching for small typos in task names.
- Changed:
  - `api/telegram-webhook.js`: added `handleUnsetTodayRequest`, today-task resolver, typo-tolerant `findTaskByText`, and better `today_limit` / `suggest_unpin_today` context handling
  - `api/_lib/telegram-intent.js`: added `unset_today` intent so AI routing can explicitly remove tasks from today's shortlist
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - fuzzy matching is intentionally conservative but can still choose the wrong task if several pinned tasks have nearly identical names
  - if user wants ranked alternatives beyond unpinning, that should be a separate `replace_today_task` flow rather than more regex

## 2026-04-10 22:45 Europe/Berlin - Codex

- Summary: Expanded Telegram subtask parsing to handle real user phrasing like `добавь в ... подзадачу ...` and common typos like `добваь`.
- Changed:
  - `api/telegram-webhook.js`: `parseAddSubtaskRequest` now accepts `добавь в`, `добавь к`, `добавить подзадачу X в Y`, and two common typos
- Verified:
  - local string checks for:
    - `добавь в проверить лог подзадачу N2`
    - `добваь в проверить лог подзадачу N2`
    - `добавь к проверить лог подзадачу "N2"`
    - `добавить подзадачу N2 в проверить лог`
    - `добавь в задачу проверить лог подзадачу N2`
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); require('./api/telegram-nudge'); console.log('server ok')"`
- Risks / follow-up:
  - the parser is still explicit-rule based, not semantic; unusual wording can still fall through to generic intent parsing

## 2026-04-10 22:35 Europe/Berlin - Codex

- Summary: Made task auto-death less brutal for important tasks and taught Telegram to parse explicit “add subtask to task” phrasing without creating a new task.
- Changed:
  - `src/App.js`: extended urgency decay windows and blocked automatic cemetery moves for tasks with `isToday`, `isVital`, or any `deadlineAt`
  - `api/telegram-webhook.js`: added `parseAddSubtaskRequest` / `handleAddSubtaskRequest` and `add_subtask_from_text` action logging
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); require('./api/telegram-nudge'); console.log('server ok')"`
- Risks / follow-up:
  - protected tasks can now cool all the way to `0` heat while staying active; that is intentional for now, but nudging cadence may need tuning
  - Telegram phrasing coverage is still rule-based for subtask additions; more variants may appear in real use

## 2026-04-10 22:20 Europe/Berlin - Codex

- Summary: Added explicit Telegram `action` logs for successful task upserts so debug sessions can distinguish creation vs update without inferring from `intent` + `message_out`.
- Changed:
  - `api/telegram-webhook.js`: `upsertTask` now writes `upsert_task_created` / `upsert_task_updated` logs and reports an explicit error log if the mutation returns no outcome
- Verified:
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); require('./api/telegram-nudge'); console.log('server ok')"`
- Risks / follow-up:
  - this improves observability only; it does not change Telegram NLP behavior
  - next live test should confirm these new `action` logs appear in Firestore after a real Telegram add/update

## 2026-04-10 22:10 Europe/Berlin - Codex

- Summary: Verified end-to-end that the live Vercel Telegram webhook is active and writes explicit `add_task` requests into `Users/<uid>/tasks` subcollection. Removed the debug task afterwards.
- Changed:
  - live Firestore only: added then removed `DEBUG TG ROUTE 1775851666`
- Verified:
  - `POST https://planner.valquilty.com/api/telegram-webhook` with `добавь задачу DEBUG TG ROUTE 1775851666` returned `200 {"ok":true}`
  - task appeared in subcollection and did not appear in legacy root array
  - removed the debug task right after verification
- Risks / follow-up:
  - Telegram still does not log a distinct `action` record for successful `add_task`, which makes future debugging noisier than it should be
  - the earlier missing `ТГ тест` is consistent with later canonical re-import removing test data, not with Telegram being dead

## 2026-04-10 11:15 Europe/Berlin - Codex

- Summary: Patched the live Hetzner MCP server to stop reading/writing the legacy root `tasks` array and use `Users/<uid>/tasks` subcollection instead.
- Changed:
  - live server only: `/root/adhd-mcp/index.js`
  - created backup on server: `/root/adhd-mcp/index.array-storage-backup-2026-04-10.js`
  - restarted PM2 process `adhd-mcp`
- Verified:
  - `node --check /root/adhd-mcp/index.js`
  - `pm2 restart adhd-mcp`
  - confirmed patched helpers exist in live file: `userDocRef`, `tasksColRef`, batch writes to subcollection
- Risks / follow-up:
  - Hetzner app is not a git checkout; future deploys there are still manual unless that setup is changed
  - this fixes MCP storage on Hetzner; if Telegram bot still misbehaves, that is likely a separate planner/Vercel path to inspect

## 2026-04-10 09:40 Europe/Berlin - Codex

- Summary: Exported live Firestore, built a canonical task set locally, and imported that canonical set into `Users/<uid>/tasks` without touching the legacy array field.
- Changed:
  - live Firestore only
  - canonical export files under `/tmp/adhd-planner-export-2026-04-10/`
  - `Users/<uid>/tasks` now holds 12 canonical human tasks
- Verified:
  - pre-import backup: `/tmp/adhd-planner-export-2026-04-10/pre-import-backup.json`
  - post-import backup: `/tmp/adhd-planner-export-2026-04-10/post-import-backup.json`
  - verified counts after import: `subcollection = 12`, `legacy array = 11`
- Risks / follow-up:
  - the import repaired live data, but older legacy array data still exists as rollback safety
  - next agent should verify every writer is truly using the subcollection before trusting day-to-day edits again

## 2026-04-10 (late evening) — Claude (Sonnet 4.6, remote session, session 2)

- Summary: Added task text editing, time tracking per task, recorded drag-drop plan.
- Changed:
  - `src/App.js`: `handleEditTask` (edit main task text), `handleAddTime` (accumulate timeSpent)
  - `src/TaskColumn.js`: double-click on task title edits it inline; ▶/⏹ timer button per task, shows running elapsed + total timeSpent; `formatMs` helper
  - `src/TaskColumn.css`: `.timer-row`, `.timer-btn`, `.timer-running` pulse animation, `.timer-total`
  - `SESSION_HANDOFF.md`: added drag-drop plan for next agent
- Verified:
  - `npm run build` passes, pushed to main
- Risks / follow-up:
  - Hetzner still needs `git pull + pm2 restart` (Telegram still broken until then)
  - Timer resets on page reload (by design — only saved time is persisted)
  - Drag & drop plan written in SESSION_HANDOFF.md — needs `@dnd-kit` install

## 2026-04-10 (evening) — Claude (Sonnet 4.6, remote session)

- Summary: Completed subcollection migration for web + server. Added subtask inline editing. Deployed to Vercel via git push. Hetzner NOT yet updated (user needs to run git pull + pm2 restart manually).
- Changed:
  - `src/firestoreUtils.js`: full rewrite — new `subscribeToTasks`, `saveTask`, `saveScore`, `getUserScore`, `migrateTasksToSubcollection`; old functions kept as no-ops
  - `src/App.js`: loading switched to `subscribeToTasks`; auto-migration on first empty snapshot; all handlers now call `persistTask`/`persistScore` directly; removed bulk sync effect and all race guards; game tick only saves newly dead tasks
  - `api/_lib/planner-store.js`: `getPlannerData` now reads tasks from subcollection; `mutatePlanner` replaced Firestore transaction with WriteBatch writing to subcollection; root doc only stores score + metadata (no tasks array)
  - `src/TaskColumn.js` + `src/TaskColumn.css`: inline subtask editing (double-click to edit, Enter saves, Escape cancels)
  - Firestore Rules updated (user did this in Firebase Console): added `match /tasks/{taskId}` and `match /taskSnapshots/{snapshotId}` under Users/{userId}
- Verified:
  - `npm run build` passes
  - `node -e "require('./api/_lib/planner-store')..."` passes
  - Firestore subcollection appeared after first web app load (migration ran)
  - Web app reads/writes correctly from subcollection
- Risks / follow-up:
  - **⚠️ Hetzner server NOT updated** — Telegram bot still runs old planner-store.js from before this session. Must `git pull origin main && pm2 restart all` on Hetzner.
  - After Hetzner deploy: test Telegram → add task → verify appears in web instantly
  - MCP server on Hetzner also uses planner-store.js — same git pull will fix it too
  - Old `tasks: []` array still exists in root doc (not deleted) — safe to ignore, web app no longer reads it

## 2026-04-10 — Claude (Sonnet 4.6 / Opus 4.6, work session)

- Summary: UI/UX session + data loss investigation. Added AI agent chat, Google Calendar, font cleanup. Found and partially fixed task sync bugs. Wrote subcollection migration plan.
- Changed:
  - `src/AgentChat.js`: full agent chat panel with tool calling (get_tasks, add_task, add_subtask, delete_subtask, mark_critical, kill_task, create_calendar_event). Uses `/api/agent-chat` server route.
  - `src/AgentChat.css`: new chat panel styles, Inter font for messages
  - `src/Companions.js`: clicking angel/devil opens agent chat instead of speech bubble
  - `src/App.js`: Google Calendar connect button (📅), handleConnectCalendar, calendarToken state passed to Companions/TaskColumn. Removed auto-kill from game tick (then reverted — auto-kill is intentional architecture). Fixed: `skipNextCloudSyncRef` + `hasPendingWrites` guard to not overwrite local state from own pending writes.
  - `src/TaskColumn.js`: calendar picker on each task card (date/time/duration → Google Calendar event), delete subtask button (×)
  - `src/TaskColumn.css`: Inter font for task text/subtasks/inputs, cal-picker styles, subtask-delete-btn
  - `src/firestoreUtils.js`: `subscribeUserData` fixed — check `metadata.fromCache` before auto-creating empty document (was silently wiping all tasks on new device). `onData` now receives `(data, metadata)`.
  - `api/_lib/openrouter.js`: fallback to `REACT_APP_OPENROUTER_KEY` if `OPENROUTER_API_KEY` not set
  - `MIGRATION_TASKS_SUBCOLLECTION.md`: full migration plan (new file)
- Verified:
  - `npm run build` passes on all commits
  - `/api/agent-chat` route exists and correctly proxies to OpenRouter server-side
- Risks / follow-up:
  - **CRITICAL: tasks still stored as array in one Firestore document** — race condition on multi-device writes not fully solved. See `MIGRATION_TASKS_SUBCOLLECTION.md` for the real fix.
  - Google Calendar connect uses Firebase popup OAuth — works but shows "unverified app" warning (expected, user is aware)
  - `OPENROUTER_API_KEY` env var may need to be added to Vercel separately (or `REACT_APP_OPENROUTER_KEY` will be used as fallback)

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

## 2026-04-10 00:45 Europe/Berlin - Codex

- Summary: Fixed a repeated false-death bug where a protected task (`isToday` / `isVital` / `deadlineAt`) was being overwritten by an older stale `dead` version from the web. The key signal was `status = dead` with `deadAt = null` and an older `lastUpdated`, which cannot come from the current auto-death code.
- Changed:
  - `src/firestoreUtils.js`
  - `src/App.js`
  - `api/telegram-webhook.js`
- Verified:
  - queried live Firestore on Hetzner and confirmed the broken task regressed from a newer active version to an older dead version
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - this hardens refreshed clients and auto-heals invalid protected dead tasks, but a truly old already-open browser tab can still keep trying stale writes until the tab is refreshed or closed

## 2026-04-11 00:10 Europe/Berlin - Codex

- Summary: Fixed Telegram subtask routing for context references like “добавь к последней добавленной задаче подзадачу …”. The bot now resolves these phrases via `telegramContext.lastTaskId` instead of searching for a literal task named “последней добавленной задаче”.
- Changed:
  - `api/telegram-webhook.js`
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - this fixes relative references for add-subtask; broader natural-language task references still deserve a shared resolver instead of scattered regexes

## 2026-04-11 00:25 Europe/Berlin - Codex

- Summary: Started the real AI-aware Telegram routing. `telegram-intent` now supports `add_subtask` and can return `task_ref='last_task'`, with webhook passing `telegramContext` into the model and resolving relative task references server-side.
- Changed:
  - `api/_lib/telegram-intent.js`
  - `api/telegram-webhook.js`
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/telegram-webhook'); console.log('server ok')"`
- Risks / follow-up:
  - local synthetic parse could not be executed end-to-end without `OPENROUTER_API_KEY`
  - next step is to extend the same `task_ref` mechanism to complete/reopen/today/vital actions, not just add-subtask

## 2026-04-11 11:05 Europe/Berlin - Codex

- Summary: Prepared the Hetzner-side Telegram nudge move. Added a standalone ops script that can trigger `/api/telegram-nudge` from Hetzner on exact cron times, and made the Vercel nudge route accept an explicit `slot=morning|evening` override.
- Changed:
  - `api/telegram-nudge.js`
  - `/Users/valquilty/Documents/My Website/adhd-planner-ops/sendTelegramNudge.mjs`
  - `/Users/valquilty/Documents/My Website/adhd-planner-ops/telegram-nudge.env.example`
- Verified:
  - `node -e "require('./api/_lib/planner-store'); require('./api/telegram-nudge'); console.log('server ok')"`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `node /Users/valquilty/Documents/My Website/adhd-planner-ops/sendTelegramNudge.mjs` fails cleanly with `PLANNER_NUDGE_SECRET is not configured`
- Risks / follow-up:
  - Hetzner cron cannot be activated until we have the Vercel `CRON_SECRET` (or a new shared replacement) to authorize the request

## 2026-04-11 11:12 Europe/Berlin - Codex

- Summary: Finished the Hetzner Telegram nudge move. Installed the bridge script on Hetzner, created exact cron jobs for 09:00 and 18:00 Berlin time, and manually verified one successful morning nudge end-to-end.
- Changed:
  - `vercel.json` (remove Vercel cron jobs to avoid duplicates after next deploy)
  - live Hetzner files:
    - `/root/adhd-mcp/sendTelegramNudge.mjs`
    - `/root/adhd-mcp/.telegram-nudge.env`
    - `/root/adhd-mcp/runTelegramNudge.sh`
    - root crontab entries for `runTelegramNudge.sh morning|evening`
- Verified:
  - Hetzner manual run succeeded and returned `ok: true`
  - live response payload confirmed slot `morning` and a real task id/text
- Risks / follow-up:
  - `CRON_SECRET` is now stored on Hetzner too; rotate it later in **both** places:
    - Vercel env `CRON_SECRET`
    - `/root/adhd-mcp/.telegram-nudge.env`
  - after `vercel.json` deploy, Vercel cron duplicates should stop

## 2026-04-11 11:20 Europe/Berlin - Codex

- Summary: Extended Telegram context routing beyond subtasks. The AI intent layer now supports `complete_task`, `reopen_task`, `set_today`, `set_vital`, and `schedule_task` with `task_ref`, and the webhook resolves these against `telegramContext.lastTaskId` or task text server-side.
- Changed:
  - `api/_lib/telegram-intent.js`
  - `api/telegram-webhook.js`
- Verified:
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/telegram-webhook'); console.log('server ok')"`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - this is the first real action-router pass; if future phrasing gaps appear, prefer improving shared `task_ref` resolution over adding isolated regex branches

## 2026-04-11 11:30 Europe/Berlin - Codex

- Summary: Improved the `today=3` limit flow in Telegram. Instead of a dead-end refusal, the bot now stores `today_limit` context, recommends one pinned task to unpin, and understands follow-ups like “предложи что открепить”.
- Changed:
  - `api/telegram-webhook.js`
- Verified:
  - `node -e "require('./api/_lib/planner-store'); require('./api/_lib/telegram-intent'); require('./api/telegram-webhook'); console.log('server ok')"`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - the recommendation is currently a simple “lowest-priority pinned task”; if the product logic changes, keep it aligned with mission/today selection rather than inventing separate ranking rules

## 2026-04-11 17:55 Europe/Berlin - Codex

- Summary: Found the real reason why Telegram still ignored `давай последнюю`. It was not a deployment mystery: the shared router used JavaScript `\b` word-boundary checks on Cyrillic phrases, so the selection-context override never triggered and the message fell through to the AI parser as `set_today`.
- Changed:
  - `api/_lib/planner-agent-router.js`
- Verified:
  - local repro before fix: `routePlannerAgentInput({ text: 'давай последнюю', telegramContext.lastAction='suggest_unpin_today' })` fell through to AI parsing
  - local repro after fix: same input now routes to `{ type: 'unset_today', taskRef: 'последнюю', source: 'selection_context' }`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - other Cyrillic regexes should avoid `\b`; if similar “human follow-up not understood” bugs appear, inspect for ASCII-only boundary assumptions first

## 2026-04-13 — Claude (claude-sonnet-4-6)

- Summary: Fixed critical production bugs reported by user: pink screen on load, tasks reverting from heaven/cemetery after page reload, and complete button blocked by heat bar.
- Changed:
  - `src/App.js` — added `useRef` to React imports (was crashing entire app), added `mergeTaskLists` to onSnapshot callback so local optimistic updates (complete/kill/drag) aren't overwritten by stale Firestore snapshots, added automatic per-day activity tracking (`activeDays[]`, `timeByDay`), added `completedAt` timestamp on task completion
  - `src/TaskColumn.js` — Complete button now always visible (was gated behind `heatCurrent > 60`), subtask edit input replaced with auto-growing textarea
  - `src/TaskColumn.css` — `.subtask-edit-input` fixed to be readable (white text on translucent dark bg), `.subtask-item--editing` added for proper alignment
  - `src/App.css` — stats tab redesigned with per-task activity dot-calendar and day-by-day time log
  - `.gitignore` — removed `build/` so compiled output is committed and deployed via git pull
  - `scripts/auto-pull.js` — added `npm run build` step between git pull and pm2 restart
- Verified:
  - `npm run build` compiled cleanly each time
  - jsdom render test showed ROOT CONTENT was populated (not empty) after useRef fix
- Branches: committed and pushed to both `main` and `claude/review-project-Zw7WB`
- Risks / follow-up:
  - `isFirstSnapshot` flag is set AFTER `firestoreReadyRef.current` is set to true, so technically always false — but `mergeTaskLists([], remoteTasks)` correctly returns remoteTasks, so initial load works fine; the branch is dead code but harmless
  - The review branch (`claude/review-project-Zw7WB`) has AI companion features (OpenRouter) not yet in main — needs future merge/PR

## 2026-04-14 10:55 Europe/Berlin - Codex

- Summary: Hardened cross-device task sync against stale tabs and clock skew. The likely failure mode was not just “snapshot race on reload” anymore: a stale browser session or a device with a slightly older clock could still send a whole-task overwrite that looked newer locally and rolled tasks back across devices.
- Changed:
  - `src/App.js` — added local-only task sync metadata (`__baseLastUpdated`, `__pendingSyncAt`), bounded optimistic merge window to 15s, stopped refreshing cloud cache before a real Firestore snapshot, and applied remote conflict replacements directly in UI when Firestore rejects a stale write
  - `src/firestoreUtils.js` — `saveTask()` now rejects writes when Firestore has already advanced beyond the task’s local base version, normalizes accepted `lastUpdated` to at least `base + 1` to tolerate clock skew, and strips local-only sync metadata from saved tasks/snapshots
  - regenerated tracked build output after verification
- Verified:
  - `npm install`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - tabs already open with the old pre-fix bundle can still write stale state until they are refreshed or fully closed once
  - this conflict guard protects web writes that go through `src/firestoreUtils.saveTask`; if reverts continue after refreshing all clients, inspect live Firestore snapshots and any non-web writer that may still bypass this path

## 2026-04-14 11:25 Europe/Berlin - Codex

- Summary: Fixed the more direct web write-loss bug in `src/App.js`. Existing-task handlers were mutating a local `saved` variable inside `setTasks(...)` and then calling `persistTask(saved)` outside; that is not a safe way to derive a task to persist from React state scheduling, and it could leave status changes visible in UI but never written to Firestore.
- Changed:
  - `src/App.js` — added `tasksRef` + `mutateSingleTask()` so task mutations are computed synchronously before `persistTask()`
  - `src/App.js` — switched existing-task handlers (`complete/kill/resurrect/reopen/drag/today/subtasks/edits`) to the new mutation helper
  - `src/App.js` — queued pending task writes until the first Firestore snapshot instead of silently dropping them while `firestoreReadyRef` is false
  - regenerated tracked build output after verification
- Verified:
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - game-tick auto-death still uses its own update path and should be reviewed separately if dead-task persistence behaves oddly
  - if tasks still revert after this deploy, next suspect is a non-web writer overwriting canonical subcollection state after the web write succeeds

## 2026-04-14 13:05 Europe/Berlin - Codex

- Summary: Hardened the Vercel server-side planner writer against stale overwrites. If any Telegram/server mutation is derived from an older task version, it now skips overwriting the newer Firestore document instead of blindly batch-writing old state back into the subcollection.
- Changed:
  - `api/_lib/planner-store.js` — `mutatePlanner()` now runs in a Firestore transaction, strips internal task sync markers before writing, compares each task doc against the base version the mutation was derived from, skips stale overwrites/deletes, and normalizes accepted writes to at least `base + 1`
  - `api/telegram-webhook.js` — reopen flows now attach `__baseLastUpdated` when reviving tasks fetched outside the active-task list so the stale-write guard can tell a valid reopen from an out-of-date overwrite
  - `api/_lib/planner-action-executor.js` — reopen flow carries the same base-version marker
- Verified:
  - `node --check api/_lib/planner-store.js`
  - `node --check api/_lib/planner-action-executor.js`
  - `node --check api/telegram-webhook.js`
- Risks / follow-up:
  - this protects server writers that go through `api/_lib/planner-store.js`; a completely separate writer that bypasses that module can still revert tasks

## 2026-04-15 16:10 Europe/Berlin - Codex

- Summary: Added a dedicated execution tracker for the new "angel / executive-function companion" direction so agents can work against one shared plan instead of free-floating product notes.
- Changed:
  - `EXECUTION_PLAN.md` — added phased plan with checkboxes, non-negotiable product rules, and "done when" criteria for captures, commitments, angel pinning, daily decisions, delivery loop, and validation
  - `AGENTS.md` — made `EXECUTION_PLAN.md` part of the expected reading and end-of-session update flow
  - `CLAUDE.md` — added the same requirement for Claude-style agents
  - `README.md` and `SESSION_HANDOFF.md` — linked the execution plan as the active tracker for this product direction
- Verified:
  - reviewed updated docs locally
- Risks / follow-up:
  - this is planning structure only; none of the capture/commitment/angel features are implemented yet
  - `ROADMAP.md` still contains older broader backlog items, so future agents should treat `EXECUTION_PLAN.md` as the execution tracker for this specific product direction

## 2026-04-15 16:40 Europe/Berlin - Codex

- Summary: Landed the first real angel-memory slice: a documented storage boundary note plus append-only Telegram `captures` ingestion for open-ended plain text.
- Changed:
  - `ANGEL_ARCHITECTURE.md` — documented source-of-truth boundaries for `tasks`, `captures`, `commitments`, and `angelDecisions`, plus anti-patterns like relying on legacy `Users/{uid}.tasks`
  - `api/_lib/planner-store.js` — added `writeCapture(userId, payload)` for append-only capture documents under `Users/{uid}/captures/{captureId}`
  - `api/telegram-webhook.js` — plain-text Telegram intake now writes a `text_dump` capture before normal handling when the parsed intent is `add_task` or `chat`, and logs `capture_created`
  - `EXECUTION_PLAN.md` — marked the architecture-note and Telegram-capture items done
  - `README.md`, `SESSION_HANDOFF.md`, `AGENTS.md`, `CLAUDE.md` — linked the new architecture note for future agents
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - exact `node -e "require(...)"` verification could not be completed on this machine because the only installed global Node is `v25.4.0`, and a transitive dependency (`buffer-equal-constant-time`) crashes under Node 25 before app modules load
- Risks / follow-up:
  - live Telegram still uses the older webhook file, not the newer `planner-agent-router -> planner-action-executor` path, so future capture/extraction work must either migrate webhook routing or keep both paths aligned
  - capture ingestion exists only for Telegram plain text so far; web and MCP are still missing

## 2026-04-15 17:05 Europe/Berlin - Codex

- Summary: Added the first extraction pass for Telegram captures. Raw plain-text capture docs are now immediately enriched with structured `commitments`, `candidateTasks`, and `facts` instead of staying as unprocessed blobs.
- Changed:
  - `api/_lib/capture-extractor.js` — new heuristic extractor + capture post-processing helpers
  - `api/telegram-webhook.js` — after writing a Telegram capture, immediately processes it into structured extraction and logs extracted counts
  - `package.json` — `verify:server` now also checks `api/_lib/capture-extractor.js`
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, `ANGEL_ARCHITECTURE.md` — updated to reflect that Phase 2 extraction now exists in first-pass form
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - this extractor is heuristic and intentionally rough; it is good enough for a first memory layer, not for final semantic quality
  - extraction does not yet upsert tasks or commitments into canonical collections

## 2026-04-15 17:30 Europe/Berlin - Codex

- Summary: Added durable commitment memory. Extraction no longer stops at the capture document: extracted life obligations now upsert into `Users/{uid}/commitments/{commitmentId}` with stable review and pressure metadata.
- Changed:
  - `api/_lib/commitment-store.js` — new per-document commitment upsert layer
  - `api/_lib/capture-extractor.js` — `processCapture()` now materializes extracted commitments and writes `commitmentIds` back onto the processed capture
  - `api/telegram-webhook.js` — Telegram capture processing now logs both extracted commitment count and actually upserted commitment IDs/count
  - `package.json` — `verify:server` now also checks `api/_lib/commitment-store.js`
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, `ANGEL_ARCHITECTURE.md`, `AGENTS.md` — updated to reflect that commitment memory exists as a real Firestore layer
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - commitment IDs currently come from extractor `tempKey` values and heuristic fallback slugs, so long-term ID stability still needs a more deliberate strategy
  - commitments exist, but task docs still do not carry `commitmentIds`, so the planner UI cannot yet use that memory for ranking or visibility

## 2026-04-15 18:10 Europe/Berlin - Codex

- Summary: Fixed the two biggest risks in the new memory layer after independent review. Telegram capture ingestion is now replay-safe enough for webhook retries, and the extractor no longer turns arbitrary unmatched text into fake durable commitments.
- Changed:
  - `api/_lib/planner-store.js` — `writeCapture()` now supports deterministic idempotency keys and reuses an existing capture doc instead of always generating a new random one
  - `api/_lib/capture-extractor.js` — `processCapture()` now short-circuits already processed captures, returns a `replayed` flag, and stops creating fallback commitments for unmatched text
  - `api/_lib/commitment-store.js` — commitment upserts now avoid re-incrementing mention counters when the same capture ID is replayed
  - `api/telegram-webhook.js` — Telegram plain-text capture path now derives an idempotency key from `update_id` / `message_id`, logs `capture_reused` on replay, and records Telegram ids in capture metadata
  - `SESSION_HANDOFF.md` and `ANGEL_ARCHITECTURE.md` — clarified the remaining legacy Telegram split and the new replay-safe capture behavior
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Telegram replay safety is now much better, but it still depends on Telegram identity fields being present for the inbound message
  - the newer router/executor path still is not the live plain-text handler, so there is still real legacy behavior in Telegram code

## 2026-04-15 18:45 Europe/Berlin - Codex

- Summary: Wired commitment memory into real Telegram task docs instead of leaving it isolated in capture/commitment collections.
- Changed:
  - `api/_lib/planner-store.js` — canonical task fingerprints and `createTask()` now include `lifeArea` and `commitmentIds`
  - `api/telegram-webhook.js` — Telegram `/add` and plain-text task upsert flows now carry extraction-based `urgency`, `resistance`, `lifeArea`, and `commitmentIds`; existing tasks merge those fields conservatively instead of dropping them
  - `api/_lib/planner-action-executor.js` — kept the newer non-live Telegram execution path aligned so it also preserves `resistance`, `lifeArea`, and `commitmentIds`
  - `EXECUTION_PLAN.md`, `ANGEL_ARCHITECTURE.md`, `SESSION_HANDOFF.md` — updated to reflect that task-linking now exists and to correct the misleading "Telegram already fully migrated to router/executor" implication
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - this only links memory on Telegram task create/update flows; web and MCP capture ingestion still do not enrich task docs
  - extractor-driven urgency fallback is now used where safe, but broader deadline/vital inference still mostly depends on explicit intent parsing

## 2026-04-15 19:20 Europe/Berlin - Codex

- Summary: Applied the smallest safe fix after skeptical review of the Telegram memory split: extracted the live webhook enrichment into a shared helper, marked the router contract honestly, and corrected docs that overstated router/executor readiness.
- Changed:
  - `api/_lib/telegram-task-memory.js` — new shared helper for Telegram capture processing and task-memory enrichment so the logic is no longer buried only inside the legacy webhook file
  - `api/telegram-webhook.js` — now calls the shared helper but keeps the live behavior unchanged
  - `api/_lib/planner-agent-router.js` — `add_task` routes now explicitly mark that they still require external memory enrichment before execution
  - `package.json` — `verify:server` now syntax-checks the new helper and the router too
  - `EXECUTION_PLAN.md` and `SESSION_HANDOFF.md` — corrected to say only the live inline webhook path is memory-enriched today; router/executor still needs an outer intake/enrichment step
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - attempted full server module-load check, but local `Node v25.4.0` hits an old transitive dependency before repo code loads; `~/.nvm/nvm.sh` was not present here to retry under Node 24 from this shell
- Risks / follow-up:
  - this does not migrate Telegram traffic to `planner-agent-router` / `planner-action-executor`; it only removes the misleading split and makes the enrichment seam reusable
  - there is still no automated behavioral test that proves memory enrichment survives a future router migration

## 2026-05-29 11:35 Europe/Berlin - Codex

- Summary: Tightened Angel Lab draft confirmation UX after returning from the accidental NovaHaus thread.
- Changed:
  - `src/AngelLabScreen.js` — draft column now shows how many cards are still waiting, and the selected-subtasks CTA renders before the weaker main-only action.
  - `src/AngelLabScreen.css` — added a compact draft queue status style.
  - `docs/angel-engagement-loop.md` — documented the Angel Lab confirmation UX rule.
- Verified:
  - not run (user did not request build/browser QA in this turn).
- Risks / follow-up:
  - This is a presentation/flow clarity patch only; it does not change draft parsing quality or backend apply semantics.

## 2026-05-29 11:55 Europe/Berlin - Codex

- Summary: Improved Angel Lab AI draft quality path without changing the confirmation boundary.
- Changed:
  - `api/captures.js` — AI-generated draft cards now still pass through subtask enrichment and create-card preselection even in default `simple` mode.
  - `api/captures.js` — tightened the Angel Lab prompt against generic/invented subtasks and asked for concrete first steps on simple errands.
  - `docs/angel-engagement-loop.md` — documented the AI draft polish path.
- Verified:
  - not run yet in this step.
- Risks / follow-up:
  - This should improve draft quality, but model output can still vary; the next stronger step would be adding a deterministic post-processor for common errand/document/portfolio categories.

## 2026-04-15 20:05 Europe/Berlin - Codex

- Summary: Moved live plain-text Telegram back onto the shared `route -> memory -> execute` path, while keeping slash commands and callback buttons local for now.
- Changed:
  - `api/_lib/telegram-task-memory.js` — added shared route-level merge logic so memory enrichment can be applied to a routed Telegram action before execution
  - `api/_lib/planner-action-executor.js` — `reopen_task` and `schedule_task` now safely resolve non-active tasks too, so the shared executor can match the old webhook plain-text behavior more closely
  - `api/telegram-webhook.js` — `handlePlainCapture` now uses `routePlannerAgentInput(...)`, runs Telegram capture/enrichment once, and delegates to `executePlannerAction(...)`
  - `EXECUTION_PLAN.md` and `SESSION_HANDOFF.md` — updated to reflect that live plain-text Telegram is now on the shared route/enrichment/executor path, while slash/callback flows still remain local
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - slash commands and callback-button flows still duplicate part of the old webhook behavior
  - there is still no automated behavioral Telegram test, so this is verified structurally/build-wise rather than by end-to-end bot replay

## 2026-04-18 20:10 Europe/Berlin - Codex

- Summary: Closed the next memory-roadmap gap: capture suggestions are now replay-safe against already-active tasks, and `/today` now explicitly warns about important commitments that have no live next step for too long.
- Changed:
  - `api/captures.js` — added active-task aware suggestion filtering (`filterSuggestionsAgainstActiveTasks`) so repeated extraction runs stop proposing duplicates that already exist in active tasks
  - `api/captures.js` — response now includes `extractionReplayed` to expose when extraction came from an already-processed capture
  - `api/_lib/commitment-store.js` — added `getCommitmentsNeedingLiveTask(...)` to detect active high-cost commitments with no linked active task past `needsTaskIfSilentDays`
  - `api/_lib/planner-action-executor.js` — `show_today` now calls that commitment-gap detector and sends an explicit follow-up message when such obligations exist
  - `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md` — marked/recorded the two roadmap points as landed
- Verified:
  - not run (by request in this session: no extra validation pass unless explicitly asked)
- Risks / follow-up:
  - commitment surfacing currently only runs on `show_today`; it may need expansion to morning/evening nudge jobs later
  - suggestion de-duplication currently uses text similarity heuristics, so edge cases with very short/ambiguous task text may still need tuning

## 2026-04-18 20:45 Europe/Berlin - Codex

- Summary: Reworked Angel Lab output UX to “one main task + optional steps”, and updated Telegram `/today` so “important now” is always explicit (not only when a stale-commitment alert triggers).
- Changed:
  - `src/App.js` — Angel Lab save/result shaping now creates one `main` suggestion plus `step` suggestions; added handlers for toggling optional steps and adding either main-only or main+selected-steps
  - `src/App.js` — `handleAddTask()` now accepts optional `subtasks` array on creation
  - `src/AngelLabScreen.js` — replaced per-row “add” UX with:
    - main task card
    - optional step checkboxes
    - two explicit actions: “Добавить только задачу” / “Добавить с шагами”
  - `src/AngelLabScreen.css` — added styles for main card, step checklist, and dual action buttons
  - `api/_lib/planner-action-executor.js` — `/today` now always sends “⭐ Важное сейчас” and then:
    - stale important commitment warning when needed, or
    - explicit “всё под контролем” message when no gap is detected
- Verified:
  - not run (per current session rule: no extra validation/test pass unless explicitly requested)
- Risks / follow-up:
  - the “important now” block in Telegram is intentionally verbose now; if it feels noisy in real use, it can be condensed into one combined digest message

## 2026-04-18 21:05 Europe/Berlin - Codex

- Summary: Fixed two UX regressions from the first rollout: Angel Lab main-vs-steps confusion and duplicate-feeling wording in `/today`.
- Changed:
  - `src/App.js` — added suggestion normalization helpers to keep Angel suggestions anchored to the user dump, choose a stable main suggestion, and filter near-duplicate step suggestions against main task text
  - `api/_lib/planner-action-executor.js` — when “important now” matches the same top tasks already shown above, bot now sends a short reference (“это пункты 1 и 2 из списка выше”) instead of repeating task names
- Verified:
  - not run (per current session rule: no extra validation/test pass unless explicitly requested)
- Risks / follow-up:
  - suggestion quality still depends on upstream extraction candidates; if creative drift remains in edge cases, next step is to add explicit “strict mode” knob for Angel extraction prompt

## 2026-04-18 21:20 Europe/Berlin - Codex

- Summary: Applied a second pass after live user screenshots: recovered step generation when the model returns too few candidates, and de-cluttered `/today` by removing the extra “all good” status line.
- Changed:
  - `src/App.js` — added `buildAngelLabStepFallbackFromDump(...)` and merged fallback clauses into step suggestions when server/model output is sparse
  - `api/_lib/planner-action-executor.js` — kept “important now” compact and removed the additional green confirmation message when no commitment gap exists
- Verified:
  - not run (per current session rule: no extra validation/test pass unless explicitly requested)

## 2026-04-18 21:55 Europe/Berlin - Codex

- Summary: Switched Angel Lab from single-card mode back to multi-task cards with per-task optional subtasks, and removed duplicate-feeling “important now” repeat in Telegram when it mirrors the top list.
- Changed:
  - `src/App.js` — implemented task-card builder pipeline (`buildAngelLabTaskCards`) from dump + suggestions, with deterministic split by action starters and task/step separation by keyword overlap
  - `src/App.js` — replaced global main/steps handlers with per-card actions: add task only, add task with selected steps, toggle step, dismiss card
  - `src/AngelLabScreen.js` — UI now renders multiple task cards, each with its own optional steps and controls
  - `src/AngelLabScreen.css` — added card-list and dismiss-button styles for multi-card mode
  - `api/_lib/planner-action-executor.js` — `show_today` now suppresses the extra “important now” block when it duplicates the same top tasks already listed in the main digest
- Verified:
  - not run (per current session rule: no extra validation/test pass unless explicitly requested)

## 2026-05-30 - Codex

- Summary: Added a low-priority Angel Opening Move so the planner can proactively offer one safe entry point when no higher-priority companion prompt is active.
- Changed:
  - `src/App.js` — added `angel_opening_move` prompt using the current mission task, with start/dismiss/planner handlers and a 4-hour cooldown.
  - `docs/angel-engagement-loop.md` — documented the opening move layer.
- Verified:
  - pending.

## 2026-05-31 - Codex

- Summary: Made Angel Lab draft-card handling more explicit after add/merge/skip actions.
- Changed:
  - `src/App.js` — added `angelLabHandledNotice` and set it when a draft card is added, merged into an existing task, skipped, or already exists.
  - `src/AngelLabScreen.js` — renders a `Last action` notice above the draft queue.
  - `src/AngelLabScreen.css` — added handled-card feedback styling.
  - `docs/angel-engagement-loop.md` — documented the handled-card feedback.
- Verified:
  - pending.

## 2026-05-31 - Codex

- Summary: Added Angel Lab draft-session progress chips.
- Changed:
  - `src/App.js` — tracks added/skipped draft card counts for the current Angel Lab session.
  - `src/AngelLabScreen.js` — shows added/skipped/left chips above the draft queue.
  - `src/AngelLabScreen.css` — added compact progress chip styling.
  - `docs/angel-engagement-loop.md` — documented draft progress chips.
- Verified:
  - pending.

## 2026-05-31 - Codex

- Summary: Added a clearer Angel Lab completion state after all draft cards are handled.
- Changed:
  - `src/AngelLabScreen.js` — when the current draft queue reaches zero after handling cards, the done panel now shows added/skipped totals and a clear return-to-planner action.
  - `docs/angel-engagement-loop.md` — documented the completion summary.
- Verified:
  - pending.

## 2026-05-31 - Codex

- Summary: Added deterministic splitting for Angel Lab cards that combine multiple independent needs.
- Changed:
  - `api/captures.js` — `polishAngelLabTaskCards` now splits create-card titles joined by `и/and` when each part is separately actionable, then applies category-specific subtasks to each split card.
  - `tests/angel-lab-draft-quality.test.mjs` — added regression coverage for a combined Jobcenter + cat-food draft card.
  - `docs/angel-engagement-loop.md` — documented the split-card post-processing rule.
- Verified:
  - pending.

## 2026-05-31 - Codex

- Summary: Capped Angel Lab draft preselection to one subtask per card.
- Changed:
  - `api/captures.js` — normalized `selected`, `checked`, and `selectedByDefault` flags so AI/category post-processing cannot silently preselect multiple subtasks.
  - `tests/angel-lab-draft-quality.test.mjs` — added regression coverage for a card whose model output marks several subtasks selected.
  - `docs/angel-engagement-loop.md` — documented the one-selected-subtask rule.
- Verified:
  - pending.

## 2026-05-31 - Codex

- Summary: Recovered from the broken Codex `PLANNER` thread and tightened Angel Lab fallback parsing.
- Changed:
  - `api/_lib/angel-lab-core.js` — trims trailing/leading `и/and` connector words when splitting a brain dump by action markers, preventing draft titles such as `Разобрать письма от Jobcenter и`.
  - `tests/angel-lab-draft-quality.test.mjs` — added regression coverage for the mixed Jobcenter + cat-food sentence at the parser level.
  - `api/captures.js` — cleaned indentation around active task normalization and the final response block without changing behavior.
  - `docs/angel-engagement-loop.md` — documented the connector-tail parser guard.
- Verified:
  - `node tests/angel-lab-draft-quality.test.mjs`
  - `node --check api/captures.js && node --check api/_lib/angel-lab-core.js`
  - `git diff --check -- api/captures.js api/_lib/angel-lab-core.js tests/angel-lab-draft-quality.test.mjs`
  - `ANGEL_LAB_OPENAI_DRAFTS=0` dry-run of `api/captures.js` with `Разобрать письма от Jobcenter и купить корм коту` produced two cards, each with one selected step.
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - The old Codex `PLANNER` thread is in `systemError`; continue recovery work from a fresh thread or this one.
  - The repo still has a large pre-existing dirty worktree. Do not bulk revert it without a deliberate review.

## 2026-05-31 - Codex

- Summary: Cleaned the Planner repo working tree into a commit-ready checkpoint.
- Changed:
  - `.gitignore` — ignored generated `build/`, temporary Angel E2E artifacts, audit screenshots, and the raw Cursor design preview import.
  - Removed tracked `.DS_Store` and generated `build/` artifacts from git tracking; production build output is now generated locally/Vercel instead of committed.
  - Kept the runtime Apus/Planner Engine/Angel Lab source files, docs, public mascot assets, and regression tests as real project changes.
  - Reworded new design docs so they do not commit machine-specific `/Users/...` source paths.
- Verified:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Local static smoke-test at `http://127.0.0.1:4173/`: page rendered the login screen with no framework error overlay.
- Risks / follow-up:
  - Static smoke-test cannot exercise Vercel API routes; `/api/google-calendar-status` returns 404 under `python3 -m http.server`, which is expected for that test mode.
  - The raw `design/cursor-soul-planner-2026-04-24/` folder remains local but ignored.

## 2026-05-31 - Codex

- Summary: Tightened the public `/demo` flow around the recovered product goal: readable onboarding, visible Rescue completion, and reliable demo Angel Lab drafts.
- Changed:
  - `src/OnboardingOverlay.css` — fixed the mobile demo intro card so the safe-data note, product explanation, and actions fit in the first viewport.
  - `src/App.css` — compacted mobile Apus Rescue and kept the timer plus primary action visible without overlap; widened completion banners for readable demo-loop copy.
  - `src/App.js` — made public demo rescue completion show the existing `Today Mission -> Rescue -> one tiny step` banner; upgraded the demo-only Angel Lab parser to strip launcher/meta phrases, split independent action chunks, and return up to four portfolio-safe cards.
  - `src/apus/ApusPlannerShell.js`, `src/apus/ApusTodayMission.js`, `src/apus/ApusShell.css` — surfaced planner nudge status inside the Apus Today Mission shell.
  - `docs/angel-engagement-loop.md` — documented the mobile public demo and demo Angel Lab parser behavior.
- Verified:
  - Browser QA at `http://localhost:3001/demo?reset=1`: onboarding intro readable at 389px width.
  - Browser QA at `http://localhost:3001/demo?reset=1`: Today Mission opens Rescue; timer and `I moved` action are visible together; completing rescue shows the demo-loop completion banner.
  - Browser QA at `http://localhost:3001/demo?reset=1`: Angel Lab dump `мне надо разобрать почту, купить корм коту, подготовить демо приложения и отправить портфолио, но я не знаю с чего начать` produces four cards (`разобрать почту`, `купить корм коту`, `подготовить демо приложения`, `отправить портфолио`) with concrete first steps and no fake start-confusion task.
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Local QA covered the public demo shell and demo Angel Lab path. Cloud-authenticated real-user Angel Lab still relies on `/api/captures` and should keep using the server regression suite for parser changes.

## 2026-06-03 - Codex

- Summary: Fixed the planner language toggle regression in the public demo / Apus shell.
- Changed:
  - `src/App.js` — removed the demo-only effect that forced language back to English, set `document.documentElement.lang` directly from current language, passed shared language state into onboarding, and localized the demo-start status before rendering.
  - `src/OnboardingOverlay.js` — made the onboarding `EN/RU` control use the app language state when provided instead of maintaining a separate language copy.
  - `src/apus/ApusHeader.js`, `src/apus/ApusPlannerShell.js`, `src/apus/ApusTodayMission.js` — localized the Apus language-button title and Today Mission hints/fallback copy through the shared `language` prop.
  - `src/demoI18n.js` — changed DOM translation storage so it only records genuinely translated source text/attributes and does not overwrite React-owned language labels on restore.
  - `SESSION_HANDOFF.md`, `EXECUTION_PLAN.md` — recorded the stable demo-language behavior.
- Verified:
  - Browser QA at `http://localhost:3001/demo?reset=1&qa=lang-toggle-final-2`: onboarding `RU`, skip, Apus header `EN`, Apus header `RU` changed `html lang` as `en -> ru -> en -> ru`; shell text and Today Mission status followed the selected language; browser console had no errors.
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Some product labels intentionally remain English in Russian mode (`Today Mission`, `Rescue`, task titles in demo data). This fix targets the broken toggle/stale translation behavior, not a full copy audit.

## 2026-06-03 - Codex

- Summary: Switched Google login from popup-first auth to Firebase redirect auth for embedded-browser access.
- Changed:
  - `src/Login.js` — removed `signInWithPopup` as the primary login path, starts Google auth with `signInWithRedirect`, forces `browserLocalPersistence` before redirect/result handling, and blocks login/offline guest attempts with a clear message when required browser storage is unavailable.
  - `SESSION_HANDOFF.md`, `EXECUTION_PLAN.md` — recorded the auth boundary and live-QA access implication.
- Verified:
  - Reproduced the Codex in-app browser failure: popup login navigated the selected tab to `telegrammadhd.firebaseapp.com/__/auth/handler` with no opener, blank body, and no saved `adhdUser`.
  - Reproduced the first redirect attempt returning from the handler to `/login` without a user while the embedded browser reported no IndexedDB.
  - Reproduced the final embedded-browser limitation: the Codex in-app browser also reported no localStorage/Web Storage, so Firebase Auth cannot persist a live session there.
  - Production deploy `dpl_HjoeZZk8wnjpuRD8VrCu4Jvtb6ad` returns from the Firebase handler back to `/login`, but still does not produce an authenticated session inside the Codex in-app browser.
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Authenticated live QA still needs a normal browser session plus copied QA packet; do not treat Codex in-app browser as a usable Firebase-authenticated surface.

## 2026-06-03 - Codex

- Summary: Tightened live QA readiness around Planner Engine bootstrap.
- Changed:
  - `src/App.js` — added a short Firebase-auth wait before `planner_bootstrap` so Engine/report refresh is not silently skipped when `auth.currentUser` is briefly unset.
  - `src/App.js` — added `plannerBootstrapStatus` / `plannerBootstrapReason` to QA exports and made `liveQaReady` require completed bootstrap/meta readiness, not just cloud login.
  - `SESSION_HANDOFF.md`, `EXECUTION_PLAN.md` — recorded the bootstrap readiness boundary.
- Verified:
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Needs one fresh authenticated Chrome/Safari QA packet after deploy; expected good state is `plannerBootstrapStatus: success` plus Engine decisions/report evidence.

## 2026-06-04 - Codex

- Summary: Confirmed the deployed bootstrap readiness fix on authenticated production.
- Verified:
  - User-provided Chrome/Safari live QA packet at `2026-06-04T15:02:43.209Z` showed `mode: cloud-authenticated`, `liveQaReady: yes`, `plannerBootstrapStatus: success`, `plannerBootstrapReason: bootstrap_applied`.
  - Engine health was fresh: last tick `04 июн., 17:02`, `engineDecisions: 3`, `engineInbox: 1`, `reportItems: 30`, and outbox counts all `0`.
- Risks / follow-up:
  - Bootstrap/heartbeat is no longer the blocker. Continue with controlled authenticated smoke QA for Kanban add stability and Angel Lab add/cleanup.

## 2026-06-04 - Codex

- Summary: Confirmed controlled authenticated smoke QA for Kanban and Angel Lab.
- Verified:
  - Starting QA packet at `2026-06-04T16:17:06.117Z`: `active: 7`, `actionsToday: 0`, mission `Выставить свитер Stone Island на продажу`, fresh Engine tick, outbox all zero.
  - Kanban smoke add/delete returned `active` to `7`, raised `actionsToday` to `1`, kept mission stable, and kept outbox all zero.
  - Angel Lab safety filter correctly refused the technical phrase `QA smoke angel lab — удалить после теста` as noise/unclear.
  - Angel Lab smoke with a human-style task was added and cleaned up; final packet at `2026-06-04T16:46:10.452Z` showed `active: 7`, `actionsToday: 3`, mission stable, `plannerBootstrapStatus: success`, `engineDecisions: 3`, `reportItems: 30`, and outbox all zero.
- Risks / follow-up:
  - No current live blocker from bootstrap, Kanban add/delete, or Angel Lab add/cleanup. Remaining work should be treated as polish or broader product roadmap, not emergency stabilization.

## 2026-06-05 - Codex

- Summary: Switched focus from portfolio polish back to ADHD Planner and closed the small Telegram return-link backlog item.
- Changed:
  - `api/_lib/telegram.js` — added a shared `plannerOpenKeyboard()` and reused the `🌐 Open planner` button across task, completed/restore, and calendar-connect keyboards.
  - `api/telegram-webhook.js` — added the planner link to `/start` and AI action-confirmation keyboards without changing planner action semantics.
  - `tests/telegram-webhook-security.test.mjs` — added regression assertions that Telegram keyboards include the planner web link.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded the closed Telegram web-link item.
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This did not send a live Telegram message. After deploy, a normal `/start`, `/today`, completed-task, and calendar-connect smoke pass should confirm the button appears in Telegram clients.

## 2026-06-05 - Codex

- Summary: Recorded first live Telegram evidence for the planner return-link button.
- Verified:
  - User-provided Telegram screenshot showed scheduled nudge messages in Apusbot with the `🌐 Open planner` inline button visible under task action buttons.
  - The button appeared on multiple live nudge messages, confirming the production Telegram keyboard path is using the deployed planner-link change for scheduled nudges.
- Risks / follow-up:
  - This confirms live nudge keyboards only. `/start`, `/today`, `/completed` restore, and calendar-connect smoke still need separate Telegram-client evidence before closing the full live smoke queue.

## 2026-06-05 - Codex

- Summary: Recorded live Telegram `/completed` list evidence.
- Verified:
  - User-provided Telegram screenshot showed `/completed` returning the latest completed tasks list.
  - Each visible completed task card included `↩️ Return to active` and `🌐 Open planner`, confirming the completed-list keyboard renders the restore and planner-link actions in the real Telegram client.
- Risks / follow-up:
  - The restore mutation itself is not yet confirmed. Next live smoke step is to tap `↩️ Return to active` on a safe test completed task, confirm the success message/task action keyboard, then either leave it active intentionally or complete it again.

## 2026-06-05 - Codex

- Summary: Closed the Telegram completed-to-active roadmap item with live Telegram evidence.
- Changed:
  - `ROADMAP.md` — marked Telegram completed-to-active as done in both P1 priorities and captured Telegram backlog, and removed it from the next-session fix list.
  - `SESSION_HANDOFF.md` — recorded that the restore mutation was live-smoke verified in Telegram.
- Verified:
  - User-provided Telegram screenshot showed tapping `↩️ Return to active` on `Добавить одну тестовую карточку для Angel Lab` returned the bot response `is active again`.
  - The restored active-task response rendered the normal active action keyboard (`Done`, `Pin today`, `Critical`, `I'm stuck`) plus `🌐 Open planner`.
- Risks / follow-up:
  - The restored test task may now remain active unless the user completes/deletes it again intentionally. Continue smoke queue with `/start`, `/today`, and calendar-connect if full Telegram keyboard coverage is needed.

## 2026-06-05 - Codex

- Summary: Added a safe Telegram task-keyboard entry point for moving active tasks to Cemetery.
- Changed:
  - `api/_lib/telegram.js` — added `🪦 Cemetery` to the active task keyboard as `kill:<taskId>`.
  - `api/telegram-webhook.js` — added a `kill:<taskId>` callback prompt that sends the existing Cemetery confirmation UI without mutating task state.
  - `tests/telegram-webhook-security.test.mjs` — asserted task keyboards expose `kill:<taskId>` but never expose `confirm_kill:<taskId>` directly.
  - `SESSION_HANDOFF.md` — recorded that the button is two-step and still needs live Telegram smoke after deployment.
- Verified:
  - `node --check api/_lib/telegram.js && node --check api/telegram-webhook.js`
  - `npm run verify:server`
  - `node tests/telegram-webhook-security.test.mjs`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Production/live Telegram smoke is still needed: send or open any active task keyboard, tap `🪦 Cemetery`, verify it shows the confirmation prompt, then cancel or use a test task for the full Cemetery -> Return to active loop.

## 2026-06-05 - Codex

- Summary: Added a read-only Telegram `/cemetery` list so dead tasks can be restored from Telegram buttons.
- Changed:
  - `api/_lib/planner-action-types.js` and `api/_lib/planner-contract.js` — added the non-mutating `show_cemetery` action.
  - `api/telegram-webhook.js` — routed `/cemetery` and added it to `/start` help text.
  - `api/_lib/planner-action-executor.js` — lists the five most recent `dead` tasks with `↩️ Return to active` and `🌐 Open planner`.
  - `tests/planner-actions-contract.test.mjs` — added a contract assertion for `show_cemetery`.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded that kill/revive buttons are implemented but still need live Telegram smoke.
- Verified:
  - `node --check api/_lib/planner-action-types.js && node --check api/_lib/planner-contract.js && node --check api/_lib/planner-action-executor.js && node --check api/telegram-webhook.js`
  - `node tests/planner-actions-contract.test.mjs`
  - `node tests/telegram-webhook-security.test.mjs`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Live Telegram smoke is still needed for `/cemetery` and for the new active-task `🪦 Cemetery` confirmation prompt. First safe smoke should cancel at the confirmation prompt or use a disposable test task.

## 2026-06-06 - Codex

- Summary: Made the existing Telegram calendar-connect command visible in bot help.
- Changed:
  - `api/telegram-webhook.js` — added `/calendar — connect Google Calendar` to the `/start` command list.
  - `api/_lib/planner-action-executor.js` — added `/calendar` to the unknown-command fallback list.
  - `SESSION_HANDOFF.md` — recorded the discoverability fix.
- Verified:
  - `node --check api/telegram-webhook.js && node --check api/_lib/planner-action-executor.js`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This does not prove live Google OAuth. Next live-smoke step is still to send `/calendar` in Telegram and confirm the connect card includes both the Google Calendar button and `🌐 Open planner`.

## 2026-06-06 - Codex

- Summary: Added a read-only Telegram `/help` command for safer live-smoke guidance.
- Changed:
  - `api/telegram-webhook.js` — added shared help text, handled `/help` without chat re-linking or diagnostic ping, and kept `/start` using the same command list.
  - `api/_lib/planner-action-executor.js` — added `/help` to the unknown-command fallback list.
  - `tests/telegram-webhook-security.test.mjs` — asserted help text includes `/help`, `/calendar`, and `/cemetery`.
  - `SESSION_HANDOFF.md` — recorded `/help` as the safe read-only Telegram smoke entrypoint.
- Verified:
  - `node --check api/telegram-webhook.js && node --check api/_lib/planner-action-executor.js`
  - `node tests/telegram-webhook-security.test.mjs`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Live Telegram smoke is still user/client-side: send `/help` and verify `🌐 Open planner`, then continue `/today`, `/calendar`, `/cemetery`, and `🪦 Cemetery -> Cancel`.

## 2026-06-06 - Codex

- Summary: Added a read-only local Firestore planner export path.
- Changed:
  - `scripts/export-firestore-planner.js` — exports `Users/{uid}` plus key subcollections to a local JSON file under ignored `backups/`.
  - `package.json` — added `npm run backup:planner`.
  - `.gitignore` — ignored generated `backups/` output.
  - `docs/firestore-backup-export.md` and `README.md` — documented requirements, command examples, default export scope, and restore boundary.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded the simple backup/export strategy.
- Verified:
  - `node --check scripts/export-firestore-planner.js`
  - `npm run backup:planner -- --help`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - No live export was run during this heartbeat. First real backup should be run intentionally with `FIREBASE_CREDENTIALS` and the target `PLANNER_DEFAULT_USER_ID`, then the generated JSON should remain uncommitted.

## 2026-06-06 - Codex

- Summary: Improved planner event audit payloads for destructive/status-changing single-task operations.
- Changed:
  - `api/_lib/planner-command-event-specs.js` — single-task mutation events now include `payload.previousStatus`, `payload.nextStatus`, and `payload.scoreDelta` when relevant.
  - `api/_lib/planner-command-service.js` — passes the previous task state and score delta into the event builder.
  - `tests/planner-command-event-specs.test.mjs` — added regression coverage for Cemetery and reopen event payloads.
  - `package.json` — added the new event-spec regression test to `verify:server` and `test:contract`.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded the operation-logging improvement.
- Verified:
  - `node --check api/_lib/planner-command-event-specs.js && node --check api/_lib/planner-command-service.js && node --check tests/planner-command-event-specs.test.mjs`
  - `node tests/planner-command-event-specs.test.mjs`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This changes event metadata only, not task mutation behavior. Existing historical events will not get the new payload retroactively.

## 2026-06-06 - Codex

- Summary: Added repo-side regression coverage for the MCP-style `add_subtask` path.
- Changed:
  - `tests/planner-actions-contract.test.mjs` — added valid/invalid `add_subtask` contract cases plus route-to-command checks for `TASK_ADD_SUBTASK`.
  - `tests/planner-command-event-specs.test.mjs` — added coverage that subtask-add events expose `payload.extra.createdSubtask`.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded that the shared repo path is guarded, while live Hetzner MCP still needs separate smoke verification.
- Verified:
  - `node --check tests/planner-actions-contract.test.mjs && node --check tests/planner-command-event-specs.test.mjs && node tests/planner-actions-contract.test.mjs && node tests/planner-command-event-specs.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Hetzner MCP is a separately deployed process at `/root/adhd-mcp`; these repo tests do not prove the live MCP client path until a real MCP add-subtask smoke is run.

## 2026-06-06 - Codex

- Summary: Added timing diagnostics for scheduled Telegram nudges.
- Changed:
  - `api/_lib/planner-nudge-schedule.js` — now exposes Berlin minute data and `buildScheduledNudgeTiming`.
  - `api/_lib/planner-scheduled-nudge-outbox.js` — scheduled nudge payloads now include `dateKey`, `slot`, `timing`, `scheduledForLocal`, `triggeredLocal`, and `retryWindow`.
  - `tests/planner-nudge-schedule.test.mjs` — added Berlin DST/CET and 09:44 retry-window coverage.
  - `package.json` — added the nudge schedule test to `verify:server` and `test:contract`.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/planner-engine-v1.md` — recorded the diagnostic boundary.
- Verified:
  - `node --check api/_lib/planner-nudge-schedule.js && node --check api/_lib/planner-scheduled-nudge-outbox.js && node --check tests/planner-nudge-schedule.test.mjs && node tests/planner-nudge-schedule.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This does not prove Hetzner cron timing by itself. It makes the next live nudge explainable from the stored outbox/delivery payload.

## 2026-06-06 - Codex

- Summary: Added a stable live Telegram smoke checklist.
- Changed:
  - `docs/telegram-live-smoke-checklist.md` — added the real-client checklist for `/help`, `/today`, `/calendar`, `/cemetery`, completed restore, Cemetery confirmation/cancel, and `Open planner` evidence.
  - `README.md` — linked the Telegram and Angel live QA checklists.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded that the checklist is the canonical procedure; live smoke itself remains pending.
- Verified:
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This is documentation only. It does not replace real Telegram-client evidence.

## 2026-06-06 - Codex

- Summary: Added repo-side regression coverage for read-only Telegram daily actions.
- Changed:
  - `tests/planner-telegram-readonly-actions.test.mjs` — added fake-adapter coverage for `/today`, `/completed`, and `/cemetery`; the test fails if these read-only paths call the mutation command runner.
  - `package.json` — added the new Telegram read-only action test to `verify:server` and `test:contract`.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded this as repo-side protection, not a replacement for real Telegram live smoke.
- Verified:
  - `node --check tests/planner-telegram-readonly-actions.test.mjs && node tests/planner-telegram-readonly-actions.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Real Telegram-client evidence is still pending for `/help`, `/today`, `/calendar`, `/cemetery`, and Cemetery confirmation/cancel.

## 2026-06-06 - Codex

- Summary: Fixed Telegram fallback intent routing for core Russian free-text actions when OpenRouter is unavailable.
- Changed:
  - `api/_lib/telegram-intent.js` — stopped routing core Cyrillic action phrases through JavaScript ASCII word-boundary checks, preserved quoted task references before normalized fallback extraction, and handled both `закрепи ... на сегодня` and `сегодня закрепи ...` forms.
  - `tests/telegram-intent-fallback.test.mjs` — added OpenRouter-failure coverage for done, revive, Cemetery, Today pin/unpin, critical off, and the `готовить` false-positive guard.
  - `package.json` — added the fallback intent regression test to `verify:server` and `test:contract`.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded that repo-side fallback routing is guarded while live Telegram smoke remains pending.
- Verified:
  - `node --check api/_lib/telegram-intent.js && node --check tests/telegram-intent-fallback.test.mjs && node tests/telegram-intent-fallback.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This guards the deterministic fallback parser, not the full real Telegram-client path. Live messages are still needed for `/help`, `/today`, `/calendar`, `/cemetery`, Cemetery confirmation/cancel, and representative free-text actions after deploy.

## 2026-06-06 - Codex

- Summary: Extended Telegram fallback intent routing to English phrases that mirror the bot's visible buttons.
- Changed:
  - `api/_lib/telegram-intent.js` — added deterministic fallback handling for English `done`, `mark ... done`, `return ... to active`, `send ... to cemetery`, `pin ... today`, `unpin ... from today`, `remove critical`, and `make ... critical` phrases while preserving quoted task references.
  - `tests/telegram-intent-fallback.test.mjs` — added OpenRouter-failure coverage for the English button-style phrases.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded that fallback support now covers Russian and button-style English phrasing.
- Verified:
  - `node --check api/_lib/telegram-intent.js && node --check tests/telegram-intent-fallback.test.mjs && node tests/telegram-intent-fallback.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This still does not replace real Telegram smoke evidence; it only prevents the deterministic fallback path from turning common English action phrases into new tasks when the model is unavailable.

## 2026-06-06 - Codex

- Summary: Added repo-side response coverage for the remaining read-only Telegram smoke commands.
- Changed:
  - `api/telegram-webhook.js` — extracted `/help` and `/calendar` response builders so the transport handlers and tests share the same text/keyboard payloads.
  - `tests/telegram-webhook-security.test.mjs` — added coverage that `/help` includes the smoke-relevant commands with `Open planner`, and `/calendar` includes both the Google Calendar OAuth button and `Open planner`.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded the extra repo-side coverage while keeping real Telegram-client smoke open.
- Verified:
  - `node --check api/telegram-webhook.js && node --check tests/telegram-webhook-security.test.mjs && node tests/telegram-webhook-security.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This does not contact Telegram and does not prove OAuth completion. The next real-client smoke still needs `/help`, `/today`, `/calendar`, `/cemetery`, and Cemetery confirmation/cancel evidence.

## 2026-06-06 - Codex

- Summary: Added repo-side coverage for the two-step Telegram Cemetery confirmation boundary.
- Changed:
  - `api/telegram-webhook.js` — extracted the first-tap Cemetery confirmation response so the callback handler and tests share the same payload.
  - `tests/telegram-webhook-security.test.mjs` — added coverage that the normal task keyboard exposes only `kill:<taskId>`, while the confirmation payload exposes `confirm_kill`, `panic`, `cancel`, and `Open planner`.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded the destructive-action guard while keeping real Telegram smoke open.
- Verified:
  - `node --check api/telegram-webhook.js && node --check tests/telegram-webhook-security.test.mjs && node tests/telegram-webhook-security.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This does not contact Telegram and does not mutate a task. Real Telegram-client smoke still needs to tap `Cemetery`, verify the confirmation prompt, and cancel.

## 2026-06-06 - Codex

- Summary: Added repo-side coverage for Telegram restore/reopen execution.
- Changed:
  - `tests/planner-telegram-reopen-actions.test.mjs` — added fake-store/fake-command-runner coverage that `reopen_task` restores the latest non-active completed/Cemetery task when no ref is provided, restores an explicit completed title when provided, logs `reopen_from_text`, and returns the active task keyboard with `Open planner`.
  - `package.json` — added the reopen regression test to `test:contract` and `verify:server`.
  - `api/telegram-webhook.js` — clarified `/reopen` help text to say completed/Cemetery, matching actual executor behavior.
  - `tests/telegram-webhook-security.test.mjs` — added coverage for the clarified `/reopen` help text.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded the repo-side restore execution coverage.
- Verified:
  - `node --check tests/planner-telegram-reopen-actions.test.mjs && node tests/planner-telegram-reopen-actions.test.mjs && node --check api/telegram-webhook.js && node --check tests/telegram-webhook-security.test.mjs && node tests/telegram-webhook-security.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This does not contact Telegram and does not mutate live data. Real Telegram-client smoke for `/completed` and `/cemetery` restore evidence still depends on the user's Telegram client.

## 2026-06-06 - Codex

- Summary: Added browser confirmation before moving an active task to Cemetery.
- Changed:
  - `src/TaskColumn.js` — active task `To Cemetery` now opens a confirmation modal instead of calling `onKill` immediately. The copy states that the task leaves Active but is not deleted forever and can be restored from Cemetery.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded that the web Cemetery action now matches the Telegram destructive-action boundary.
- Verified:
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This is a browser UI confirmation only. It does not change the backend Cemetery command or delete-forever behavior.

## 2026-06-06 - Codex

- Summary: Recorded user-provided live Telegram smoke evidence for `/today` and `/calendar`.
- Changed:
  - `SESSION_HANDOFF.md` — marked `/today` as live-smoke confirmed in a real Telegram client, including active task buttons for `Done`, `Pin today`, `Critical`, `I'm stuck`, `Cemetery`, and `Open planner`; marked `/calendar` connect CTA as live-visible while keeping OAuth completion unverified.
  - `ROADMAP.md` — added the same real-client evidence under the Telegram smoke procedure.
- Verified:
  - Documentation-only update; no code checks required.
- Risks / follow-up:
  - Remaining Telegram smoke queue: `/cemetery` list and active-task `Cemetery -> Cancel` confirmation path. OAuth completion remains outside this smoke pass.

## 2026-06-06 - Codex

- Summary: Strengthened the Firestore backup/export safety path before the first live export.
- Changed:
  - `scripts/export-firestore-planner.js` — added `--dry-run`, argument parsing helpers, simple user-id/collection-name validation, reusable plan/output helpers, and `require.main` guarding so the script can be tested without running the CLI.
  - `tests/firestore-backup-export.test.mjs` — added regression coverage for collection validation, user-id validation, Firestore timestamp/reference normalization, backup plan building, and CLI dry-run output without Firebase credentials.
  - `package.json` — added the backup export test to `test:contract` and `verify:server`.
  - `docs/firestore-backup-export.md`, `README.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the dry-run guard and kept the first live export explicitly pending.
- Verified:
  - `node --check scripts/export-firestore-planner.js && node --check tests/firestore-backup-export.test.mjs && node tests/firestore-backup-export.test.mjs`
  - `npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22 --collections tasks,plannerEvents --maxDocs 2 --dry-run`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - No live Firestore export was run and no live data was read. The first real backup still needs an intentional read-only run with credentials.

## 2026-06-06 - Codex

- Summary: Clarified the Telegram live-smoke checklist status after user confusion about whether Telegram Cemetery was still broken.
- Changed:
  - `docs/telegram-live-smoke-checklist.md` — added a current-status section that explicitly says Telegram is not considered broken, lists confirmed real-client evidence (`Open planner` nudges, `/completed` restore, `/today`, `/calendar` CTA), and narrows the remaining queue to `/cemetery` list plus active-task `Cemetery -> Cancel`.
- Verified:
  - Documentation-only update; no code checks required.
- Risks / follow-up:
  - This does not add new Telegram evidence. The remaining confirmation/cancel path still depends on the user's real Telegram client.

## 2026-06-06 - Codex

- Summary: Added repo-side MCP/API origin support for capture intake.
- Changed:
  - `api/captures.js` — added capture source normalization and origin classification so `source=mcp`, `source=mcp:*`, and Claude-MCP-like source strings produce `origin.channel: "mcp"` instead of always writing web-origin metadata. `source=api:*` now maps to `origin.channel: "api"`. Dry-run responses include the computed origin.
  - `tests/captures-origin-contract.test.mjs` — added no-Firestore coverage for MCP/API/web origin classification and a dry-run handler response with `origin.channel: "mcp"`.
  - `package.json` — added the captures origin contract test to `test:contract` and `verify:server`.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded that repo/API-side MCP-origin capture support exists while live Hetzner MCP wiring remains unverified.
- Verified:
  - `node --check api/captures.js && node --check tests/captures-origin-contract.test.mjs && node tests/captures-origin-contract.test.mjs`
  - `node tests/angel-lab-draft-quality.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This does not contact the live Hetzner MCP server and does not write Firestore data. A real MCP capture/write smoke is still required before marking the MCP-originated capture item fully done.

## 2026-06-06 - Codex

- Summary: Added a canonical live MCP smoke checklist.
- Changed:
  - `docs/mcp-live-smoke-checklist.md` — added the real-client Hetzner MCP verification procedure: preconditions, read-only task list check, one disposable add-subtask mutation, web refresh proof, cleanup, optional MCP capture dry-run, evidence requirements, and pass criteria.
  - `README.md` — linked the MCP checklist under Live QA Checklists.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded that the procedure exists while the actual live MCP smoke remains pending.
- Verified:
  - Documentation-only update; no code checks required.
- Risks / follow-up:
  - This Codex session did not expose a callable ADHD Planner MCP tool; no live MCP task was read or mutated. Final proof still requires a real connected MCP client.

## 2026-06-06 - Codex

- Summary: Kept Telegram read-only empty states connected back to the planner.
- Changed:
  - `api/telegram-webhook.js` — passes `plannerOpenKeyboard` into the shared planner action adapter.
  - `api/_lib/planner-action-executor.js` — empty `/completed` and `/cemetery` responses now include `Open planner` instead of plain text only.
  - `tests/planner-telegram-readonly-actions.test.mjs` — added repo-side coverage for empty completed/Cemetery responses with planner links and no mutation command runner calls.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded the empty-state behavior.
- Verified:
  - `node --check api/telegram-webhook.js && node --check api/_lib/planner-action-executor.js && node --check tests/planner-telegram-readonly-actions.test.mjs && node tests/planner-telegram-readonly-actions.test.mjs`
  - `node tests/telegram-webhook-security.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This is repo-side/production behavior for empty read-only Telegram commands. It still does not replace real Telegram-client `/cemetery` evidence.

## 2026-06-06 - Codex

- Summary: Added local verification for Firestore planner backup files.
- Changed:
  - `scripts/export-firestore-planner.js` — added backup payload validation, `--verify-file`, optional `--expectUserId`, and post-write readback verification for real exports.
  - `tests/firestore-backup-export.test.mjs` — covered verify-file parsing, schema/user/path validation, local file verification, and the CLI verify path without Firebase credentials.
  - `docs/firestore-backup-export.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — documented the backup verification guard.
- Verified:
  - `node --check scripts/export-firestore-planner.js && node --check tests/firestore-backup-export.test.mjs && node tests/firestore-backup-export.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - No live Firestore export was run. First real export still needs intentional user-approved credentials/scope, then `--verify-file` proof on the generated JSON.

## 2026-06-06 - Codex

- Summary: Made capture dry-run avoid live task reads by default.
- Changed:
  - `api/captures.js` — dry-run capture handling now uses request-provided `activeTasks` or no task context by default; live Firestore task reads require explicit `includeLiveTasks: true`. Responses include `activeTasksSource` and `activeTasksCount`.
  - `tests/captures-origin-contract.test.mjs` — added coverage for MCP dry-run origin, `includeLiveTasks`, no-live-read default, and request-snapshot task context.
  - `docs/mcp-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded the dry-run task-source boundary.
- Verified:
  - `node --check api/captures.js && node --check tests/captures-origin-contract.test.mjs && node tests/captures-origin-contract.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This changes production `/api/captures` dry-run response metadata and default dry-run task context only. Normal stored captures and Angel Lab requests that pass `activeTasks` keep their existing behavior.

## 2026-06-06 - Codex

- Summary: Hardened Google Calendar OAuth state validation.
- Changed:
  - `api/_lib/google-calendar.js` — validates OAuth state user id and timestamp, rejects expired/future state, uses timing-safe signature comparison, and exposes TTL helpers.
  - `tests/telegram-webhook-security.test.mjs` — checks Calendar connect state payload, TTL override, expired-state rejection, and invalid user id rejection.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded that fresh Calendar OAuth links are required and stale state is rejected.
- Verified:
  - `node --check api/_lib/google-calendar.js && node --check tests/telegram-webhook-security.test.mjs && node tests/telegram-webhook-security.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - OAuth completion still needs real user-client testing. This only hardens the server state boundary before Google token exchange.

## 2026-06-06 - Codex

- Summary: Added repo-side guard for Telegram Cemetery cancel callbacks.
- Changed:
  - `api/telegram-webhook.js` — exposed `resolveUnifiedCallbackRoute` for regression tests.
  - `tests/telegram-callback-cancel.test.mjs` — verifies `cancel:<taskId>` resolves to no planner command/no mutation, while `confirm_kill:<taskId>` still resolves to `KILL_TASK`.
  - `package.json` — added the callback-cancel regression to `test:contract` and `verify:server`.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded the repo-side Cancel guard while keeping real Telegram evidence pending.
- Verified:
  - `node --check api/telegram-webhook.js && node --check tests/telegram-callback-cancel.test.mjs && node tests/telegram-callback-cancel.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This is repo-side callback routing proof only. The remaining live smoke still needs a real Telegram screenshot for `Cemetery -> Cancel`.

## 2026-06-06 - Codex

- Summary: Routed Telegram fallback stuck text to panic.
- Changed:
  - `api/_lib/telegram-intent.js` — fallback parser treats `I'm stuck` / `я застряла` variants as panic or task-specific panic, preserving quoted task references.
  - `tests/telegram-intent-fallback.test.mjs` — added OpenRouter-failure coverage for generic stuck text and task-specific stuck text.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded the repo-side fallback guard.
- Verified:
  - `node --check api/_lib/telegram-intent.js && node --check tests/telegram-intent-fallback.test.mjs && node tests/telegram-intent-fallback.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This guards the deterministic fallback parser, not the full real Telegram-client path. Live Telegram smoke remains required for `/cemetery`, `Cemetery -> Cancel`, and representative free-text actions after deploy.

## 2026-06-06 - Codex

- Summary: Recorded live Telegram Cemetery smoke evidence.
- Changed:
  - `docs/telegram-live-smoke-checklist.md` — moved `/cemetery` and active-task `Cemetery -> Cancel` from remaining queue to confirmed real-client evidence.
  - `ROADMAP.md` and `SESSION_HANDOFF.md` — recorded the user-confirmed Cemetery bot path and kept destructive `Yes, Cemetery` outside the safe smoke scope.
- Verified:
  - User reported: "Cemetery через бота работает как надо, я проверила".
- Risks / follow-up:
  - This records user-provided live evidence only. Calendar OAuth completion and live MCP write smoke remain separate.

## 2026-06-07 - Codex

- Summary: Kept subtask toggle traces on canonical event constants.
- Changed:
  - `api/_lib/planner-command-service.js` — subtask toggle mutations now set `eventType` from `PLANNER_EVENT_TYPES.TASK_SUBTASK_TOGGLED`.
  - `api/_lib/planner-command-event-specs.js` — subtask toggle event messages now check the planner event type constant instead of the command type constant.
  - `tests/planner-command-event-specs.test.mjs` — added regression coverage for subtask toggle event type, command type, message, and payload.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded the observability cleanup.
- Verified:
  - `node --check api/_lib/planner-command-service.js && node --check api/_lib/planner-command-event-specs.js && node --check tests/planner-command-event-specs.test.mjs && node tests/planner-command-event-specs.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This is repo-side event-trace cleanup. Live Hetzner MCP subtask-write verification still needs a real MCP client.

## 2026-06-07 - Codex

- Summary: Added checksum evidence to planner backup verification.
- Changed:
  - `scripts/export-firestore-planner.js` — `--verify-file` and successful real exports now include `sizeBytes` and `fileSha256` in JSON output.
  - `tests/firestore-backup-export.test.mjs` — added checksum/size assertions for direct verification and CLI verification output.
  - `docs/firestore-backup-export.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the checksum evidence to record before risky QA.
- Verified:
  - `node --check scripts/export-firestore-planner.js && node --check tests/firestore-backup-export.test.mjs && node tests/firestore-backup-export.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - No live Firestore export was run. This only improves local verification evidence for future read-only backups.

## 2026-06-07 - Codex

- Summary: Added command-service coverage for MCP-style subtask writes.
- Changed:
  - `tests/planner-command-service-subtask.test.mjs` — added fake-Firestore transaction coverage for `runPlannerCommand(TASK_ADD_SUBTASK)`, including canonical task mutation, `lastUpdated`, created subtask payload, planner event trace, title index, Telegram context, and duplicate noop behavior.
  - `package.json` — added the command-service subtask test to `test:contract` and `verify:server`.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded that the repo-side transactional path is covered while live Hetzner MCP smoke remains pending.
- Verified:
  - `node --check tests/planner-command-service-subtask.test.mjs && node tests/planner-command-service-subtask.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This does not contact the live Hetzner MCP server and does not mutate Firestore. Real MCP subtask-write verification still needs a connected MCP client.

## 2026-06-07 - Codex

- Summary: Updated the MCP live-smoke checklist with current repo-side coverage.
- Changed:
  - `docs/mcp-live-smoke-checklist.md` — recorded the new fake-transaction `runPlannerCommand(TASK_ADD_SUBTASK)` coverage and clarified that final proof still requires the separately deployed Hetzner MCP client/server path.
  - `AGENT_LOG.md` — recorded this status cleanup.
- Verified:
  - Documentation-only update; no code checks required.
- Risks / follow-up:
  - Live Hetzner MCP read/write smoke is still pending and requires a real connected MCP client.

## 2026-06-07 - Codex

- Summary: Added a read-only MCP endpoint probe.
- Changed:
  - `scripts/check-mcp-endpoint.js` — added a no-token probe for the live MCP public boundary: endpoint reachability, Bearer `401`, advertised `mcp:tools` scope, and OAuth protected-resource metadata.
  - `tests/mcp-endpoint-probe.test.mjs` — added regression coverage for auth-header parsing, scope validation, metadata validation, and unhealthy scope detection without network calls.
  - `package.json` — added `npm run check:mcp` and included the probe test in `test:contract` / `verify:server`.
  - `README.md`, `docs/mcp-live-smoke-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded that public MCP auth-boundary health can now be checked from this repo.
- Verified:
  - `node --check scripts/check-mcp-endpoint.js && node --check tests/mcp-endpoint-probe.test.mjs && node tests/mcp-endpoint-probe.test.mjs`
  - `npm run check:mcp` returned `ok: true` for `https://mcp.valquilty.com/mcp` with HTTP `401`, Bearer auth, `mcp:tools`, and protected-resource metadata.
- Risks / follow-up:
  - This does not authenticate to MCP, list tasks, or write subtasks. Real MCP read/write smoke still needs a connected MCP client.

## 2026-06-07 - Codex

- Summary: Added Codex Desktop MCP config diagnostics.
- Changed:
  - `scripts/check-codex-mcp-config.js` — added a secret-safe config check that reads MCP server names/URLs from `~/.codex/config.toml` and reports whether `https://mcp.valquilty.com/mcp` is registered.
  - `tests/codex-mcp-config-check.test.mjs` — added parser/report coverage, including nested `http_headers` sections so headers are not treated as separate MCP servers.
  - `docs/codex-mcp-setup.md` — documented the Codex Desktop setup/restart path without tokens.
  - `package.json`, `README.md`, `docs/mcp-live-smoke-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — linked the client-side MCP setup check.
- Verified:
  - `node --check scripts/check-codex-mcp-config.js && node --check tests/codex-mcp-config-check.test.mjs && node tests/codex-mcp-config-check.test.mjs`
  - `npm run check:codex-mcp` currently returns `ok: false`, confirming `https://mcp.valquilty.com/mcp` is not registered in this Codex Desktop config yet.
  - `npm run check:mcp` still returns `ok: true` for the live MCP endpoint/auth metadata.
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This does not edit Codex config and does not authenticate to MCP. The current Codex session still needs the server registered/reloaded before Planner MCP tools can appear.

## 2026-06-07 - Codex

- Summary: Added a combined MCP readiness check.
- Changed:
  - `scripts/check-mcp-readiness.js` — combines the live MCP endpoint probe and Codex config check into one read-only readiness report.
  - `tests/mcp-readiness-check.test.mjs` — covers healthy readiness, missing Codex config, missing endpoint, and CLI option mapping without live network calls.
  - `package.json`, `README.md`, `docs/codex-mcp-setup.md`, `docs/mcp-live-smoke-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — added `npm run check:mcp-readiness`.
- Verified:
  - `node --check scripts/check-mcp-readiness.js && node --check tests/mcp-readiness-check.test.mjs && node tests/mcp-readiness-check.test.mjs`
  - `npm run check:mcp-readiness` currently reports `endpoint.ok: true`, `codexConfig.ok: false`, and `missing: ["codex_config"]`.
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This still does not authenticate or call MCP tools. It only separates endpoint health from Codex client registration.

## 2026-06-07 - Codex

- Summary: Added a dry-run Codex MCP setup helper.
- Changed:
  - `scripts/ensure-codex-mcp-config.js` — added `npm run setup:codex-mcp`, dry-run by default, with explicit `--apply` required before appending `[mcp_servers.adhd_planner]` to Codex config.
  - `tests/codex-mcp-config-ensure.test.mjs` — covered dry-run, apply, idempotent no-op, same-name URL conflict, option validation, and CLI dry-run.
  - `package.json`, `README.md`, `docs/codex-mcp-setup.md`, `docs/mcp-live-smoke-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the setup helper and boundary.
- Verified:
  - `node --check scripts/ensure-codex-mcp-config.js && node --check tests/codex-mcp-config-ensure.test.mjs && node tests/codex-mcp-config-ensure.test.mjs`
  - `npm run setup:codex-mcp` ran in dry-run mode only and reported `wouldChange: true`, `changed: false`, and no same-name URL conflict.
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - I did not run `--apply`; Codex config is still unchanged until explicitly applied, then Codex must restart/reload before Planner MCP tools can appear.

## 2026-06-07 - Codex

- Summary: Confirmed backup dry-run scope for the live planner user id.
- Changed:
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded the real-user backup dry-run evidence while keeping first live Firestore export pending.
- Verified:
  - `.gitignore` contains `backups/`.
  - `npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22 --dry-run` returned `ok: true`, `dryRun: true`, root path `Users/U2geUdbvWyVRNLWnSZBnftOMSU22`, and the planned default collections: `tasks`, `taskSnapshots`, `captures`, `commitments`, `plannerEvents`, `reportItems`, `outbox`, `engineRuns`, `outboxRuns`, `plannerCommands`, `telegramLogs`, and `angelDecisions`.
- Risks / follow-up:
  - This did not read Firestore and did not create a backup file. First live export with credentials is still pending before any risky live data mutation.

## 2026-06-07 - Codex

- Summary: Added explicit safety metadata to backup CLI output.
- Changed:
  - `scripts/export-firestore-planner.js` — dry-run, verify-file, and real export responses now include a `safety` object showing Firestore read/write and local file read/write behavior.
  - `tests/firestore-backup-export.test.mjs` — added coverage for safety metadata and CLI output.
  - `docs/firestore-backup-export.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the safety flags.
- Verified:
  - `node --check scripts/export-firestore-planner.js && node --check tests/firestore-backup-export.test.mjs && node tests/firestore-backup-export.test.mjs`
  - `npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22 --dry-run` returned `safety.firestoreRead: false`, `safety.firestoreWrite: false`, and `safety.localFileWrite: false`.
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This changes CLI JSON output only. No Firestore access was performed in this edit.

## 2026-06-07 - Codex

- Summary: Added backup export preflight checks.
- Changed:
  - `scripts/export-firestore-planner.js` — added `--preflight` mode to validate `FIREBASE_CREDENTIALS` presence and required field shape without reading Firestore, writing Firestore, reading local files, or writing local backup files.
  - `tests/firestore-backup-export.test.mjs` — added coverage for preflight safety metadata, option conflicts, credential shape checks, CLI output, and secret non-disclosure.
  - `docs/firestore-backup-export.md`, `README.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the preflight command and its safety boundary.
- Verified:
  - `node --check scripts/export-firestore-planner.js && node --check tests/firestore-backup-export.test.mjs && node tests/firestore-backup-export.test.mjs`
  - `npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22 --preflight || true` returned `ok: false` because `FIREBASE_CREDENTIALS` is not set in this environment, with `safety.firestoreRead: false`, `safety.firestoreWrite: false`, and `safety.localFileWrite: false`.
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - First live Firestore export is still pending. This preflight only confirms whether credentials are locally available and shaped correctly; it does not authenticate to Firebase or read planner data.

## 2026-06-07 - Codex

- Summary: Added Google Calendar callback regression coverage.
- Changed:
  - `tests/google-calendar-callback.test.mjs` — added stubbed callback-route coverage for non-GET methods, provider error redirect, missing code/state, successful refresh-token storage redirect, missing refresh token redirect, and bad/expired state redirect.
  - `package.json` — added the callback test to `test:contract` and `verify:server`.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded that callback handling is repo-covered while real OAuth completion remains unverified.
- Verified:
  - `node --check tests/google-calendar-callback.test.mjs && node tests/google-calendar-callback.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This does not complete Google OAuth in the real Telegram client and does not call live Google or Firestore.

## 2026-06-07 - Codex

- Summary: Added `/start` response regression coverage.
- Changed:
  - `tests/telegram-webhook-security.test.mjs` — added coverage that the connected `/start` response keeps the command list and `Open planner` return button.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded that `/start` is repo-covered while live Telegram `/start` evidence is still separate.
- Verified:
  - `node --check tests/telegram-webhook-security.test.mjs && node tests/telegram-webhook-security.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This is repo-side response coverage only. It does not send `/start` in the real Telegram client.

## 2026-06-07 - Codex

- Summary: Added `Open planner` to unknown Telegram command responses.
- Changed:
  - `api/_lib/planner-action-executor.js` — unknown slash-command replies now include the standard planner return keyboard.
  - `tests/planner-telegram-readonly-actions.test.mjs` — added coverage that unknown commands stay read-only, show command discovery, and include `Open planner`.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded the read-only command-discovery behavior.
- Verified:
  - `node --check api/_lib/planner-action-executor.js && node --check tests/planner-telegram-readonly-actions.test.mjs && node tests/planner-telegram-readonly-actions.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This changes Telegram response UI only; it does not add a new mutation path.

## 2026-06-07 - Codex

- Summary: Added `Open planner` to Telegram command error hints.
- Changed:
  - `api/telegram-webhook.js` — command error responses now use a small `buildTelegramErrorResponse()` helper with the standard planner return keyboard.
  - `tests/telegram-webhook-security.test.mjs` — added coverage that an `/add` usage hint includes `Open planner`.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded the command-error return path.
- Verified:
  - `node --check api/telegram-webhook.js && node --check tests/telegram-webhook-security.test.mjs && node tests/telegram-webhook-security.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This changes Telegram error-response UI only; it does not add a new task mutation path.

## 2026-06-07 - Codex

- Summary: Added `Open planner` to Telegram chat fallback replies.
- Changed:
  - `api/_lib/planner-action-executor.js` — chat/fallback replies now include the standard planner return keyboard.
  - `tests/planner-telegram-readonly-actions.test.mjs` — added coverage that chat guidance replies stay read-only and include `Open planner`.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded the fallback return path.
- Verified:
  - `node --check api/_lib/planner-action-executor.js && node --check tests/planner-telegram-readonly-actions.test.mjs && node tests/planner-telegram-readonly-actions.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This changes Telegram response UI only; it does not add a new task mutation path.

## 2026-06-07 - Codex

- Summary: Added AI Done confirmation keyboard coverage.
- Changed:
  - `api/telegram-webhook.js` — exported `buildAiActionConfirmationKeyboard` through `_test` for regression coverage.
  - `tests/telegram-webhook-security.test.mjs` — added coverage that AI-routed Done confirmations use `confirm_done`, do not expose direct `done`, and include Rescue, Cancel, and `Open planner`.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded the AI Done confirmation boundary.
- Verified:
  - `node --check api/telegram-webhook.js && node --check tests/telegram-webhook-security.test.mjs && node tests/telegram-webhook-security.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This does not change production behavior except exposing an existing helper through `_test`; it only strengthens the repo-side safety contract.

## 2026-06-07 - Codex

- Summary: Added Telegram `confirm_done` callback routing coverage.
- Changed:
  - `tests/telegram-callback-cancel.test.mjs` — added coverage that `confirm_done:<taskId>` routes to `COMPLETE_TASK`, uses callback idempotency, returns confirmation feedback, and records `callback_confirm_done` context.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded the second-tap Done callback boundary.
- Verified:
  - `node --check tests/telegram-callback-cancel.test.mjs && node tests/telegram-callback-cancel.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This is repo-side callback routing coverage only; it does not tap `Done` in the real Telegram client or mutate live user data.

## 2026-06-07 - Codex

- Summary: Rechecked ADHD Planner MCP after OAuth completed in Codex CLI.
- Changed:
  - No code or config changes.
- Verified:
  - `codex mcp list` shows `adhd_planner` enabled with `Auth: OAuth`.
  - `npm run check:mcp-readiness` still returns `ok: true` and `readyForCodexToolUse: true`.
  - `npm run check:codex-mcp` still finds `adhd_planner` in `/Users/valquilty/.codex/config.toml`.
  - `tool_search` for `ADHD Planner MCP adhd_planner tasks list planner task read-only` did not expose any ADHD Planner MCP namespace.
  - A narrower `tool_search` for likely task-list tool names also returned only non-planner tools.
- Risks / follow-up:
  - Exact blocker: OAuth/config readiness is now confirmed, but this Codex thread's callable tool registry still does not include ADHD Planner tools, so the read-only MCP task-list smoke cannot be invoked from this turn.
  - No Firestore read/write tool call was possible; no live planner data was mutated.

## 2026-06-07 - Codex

- Summary: Checked ADHD Planner MCP readiness from this machine and current Codex session.
- Changed:
  - No code or config changes.
- Verified:
  - `npm run check:mcp-readiness` returns `ok: true`, `readyForCodexToolUse: true`, healthy Bearer-protected endpoint metadata, and a matching `adhd_planner` Codex config entry for `https://mcp.valquilty.com/mcp`.
  - `npm run check:mcp` returns expected unauthenticated `401` with `authScheme: "Bearer"`, `requiredScope: "mcp:tools"`, and resource metadata for `ADHD Planner MCP`.
  - `npm run check:codex-mcp` finds `adhd_planner` in `/Users/valquilty/.codex/config.toml`.
  - `curl -I -L --max-time 20 https://planner.valquilty.com/demo` returns HTTP 200 from Vercel.
  - `npm run test:contract`
  - `npm run verify:server`
- Risks / follow-up:
  - The current Codex thread did not expose callable ADHD Planner MCP tools after `tool_search`; only readiness/config could be verified here.
  - The real authenticated MCP read/write smoke remains pending in a restarted/reloaded MCP-capable client, using a disposable QA task only.

## 2026-06-07 - Codex

- Summary: Added direct Telegram `done` callback routing coverage.
- Changed:
  - `tests/telegram-callback-cancel.test.mjs` — added coverage that direct task-card `done:<taskId>` routes to `COMPLETE_TASK`, uses callback idempotency, returns task-card feedback, and records `callback_done` context.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — recorded the direct Done task-button boundary separately from AI `confirm_done`.
- Verified:
  - `node --check tests/telegram-callback-cancel.test.mjs && node tests/telegram-callback-cancel.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - This is repo-side callback routing coverage only; it does not tap `Done` in the real Telegram client or mutate live user data.

## 2026-06-07 - Codex

- Summary: Completed Codex OAuth login for ADHD Planner MCP and verified read-only MCP access in a new post-OAuth thread.
- Changed:
  - `/Users/valquilty/.codex/config.toml` already contained `adhd_planner`; no config change was needed in this step.
  - Live Hetzner MCP auth password was reset because the owner did not remember the old password. Only `/root/adhd-mcp/auth-secrets.json` fields `passwordSalt` and `passwordHash` were updated.
  - Server backup created: `/root/adhd-mcp/auth-secrets.backup-20260607200853.json`.
  - PM2 process `adhd-mcp` restarted after the auth-secret update.
  - Local temporary plaintext password file and curl login temp files were removed after OAuth completed.
- Verified:
  - `codex mcp login adhd_planner` completed successfully.
  - `codex mcp list` now shows `adhd_planner` with `Auth: OAuth`.
  - `npm run check:mcp-readiness` returns `ok: true` and `readyForCodexToolUse: true`.
  - A brand-new post-OAuth Codex thread saw callable `mcp__adhd_planner` tools.
  - Read-only MCP smoke in that new thread called `mcp__adhd_planner.get_tasks` and returned `ok: true`, `documentExists: true`, `count: 61`, `score: 511`.
- Risks / follow-up:
  - Older already-open Codex threads, including this one, may still not refresh their callable tool namespace even after OAuth. Use a new post-OAuth thread for actual MCP tool calls.
  - No MCP mutation tool was called in this smoke; Firestore was read through `get_tasks` only.

## 2026-06-07 - Codex

- Summary: Completed authenticated ADHD Planner MCP disposable task write smoke.
- Changed:
  - `docs/mcp-live-smoke-checklist.md` — recorded the real post-OAuth Codex MCP read/write/cleanup evidence and kept web refresh proof separate.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded that authenticated MCP task read/write/cleanup is no longer pending.
- Verified:
  - Fresh post-OAuth Codex thread `019ea3b7-188e-7870-bd9c-22aeaa1f6492` used callable `mcp__adhd_planner` tools.
  - `get_tasks` baseline returned `count=61`, `score=511`, and no exact QA task.
  - `add_task` created `QA MCP smoke — delete after test`, id `d56aa293-4768-4c4b-bb30-d186bf9bdfe0`.
  - `add_subtask` added `QA MCP subtask write — delete after test`, id `50fd06a6-d1e9-4656-b876-e5da1330c729`.
  - Follow-up `get_tasks` returned `count=62` and saw the exact QA task/subtask.
  - `delete_task` removed only the QA task, then final `get_tasks` returned `count=61`, `score=511`, with the QA task absent.
  - No non-QA task was touched.
- Risks / follow-up:
  - The disposable task was cleaned up immediately after MCP verification, so a separate web refresh/QA-packet proof of visual web consistency is still pending.
  - Optional MCP-origin capture smoke remains pending.

## 2026-06-07 - Codex

- Summary: Added repo/API coverage for non-dry-run MCP-origin captures.
- Changed:
  - `api/captures.js` — factored the production handler through `createCapturesHandler`, allowing tests to inject `appendCapture`, `processCapture`, and `getPlannerData` without touching Firestore.
  - `tests/captures-origin-contract.test.mjs` — added a non-dry-run `source=mcp:claude-notes` capture test proving the handler passes MCP origin metadata to append-only capture storage, processes the stored capture, and reads live task context only for response context.
  - `docs/mcp-live-smoke-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded the repo/API MCP-origin capture boundary.
- Verified:
  - `node --check api/captures.js`
  - `node --check tests/captures-origin-contract.test.mjs && node tests/captures-origin-contract.test.mjs`
- Risks / follow-up:
  - This does not add a new live Hetzner MCP capture tool yet. It proves the Planner API path that such a tool should call.

## 2026-06-08 - Codex

- Summary: Verified deployed MCP-origin capture dry-run path.
- Changed:
  - `docs/mcp-live-smoke-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded production dry-run evidence for `source=mcp:live-smoke`.
- Verified:
  - `curl -X POST https://planner.valquilty.com/api/captures` with `{"text":"MCP live-smoke dry run: verify capture origin only","source":"mcp:live-smoke","dryRun":true}` returned `ok: true`, `dryRun: true`, `origin.channel: "mcp"`, `origin.via: "captures_api"`, `origin.source: "mcp:live-smoke"`, `activeTasksSource: "none"`, and `activeTasksCount: 0`.
  - `curl -I -L --max-time 20 https://planner.valquilty.com/demo` returned HTTP 200 from Vercel.
  - `npm run check:mcp-readiness` returned `ok: true` and `readyForCodexToolUse: true`.
- Risks / follow-up:
  - This is a deployed API dry-run smoke only. A dedicated live Hetzner MCP capture tool that calls this API path is still pending.

## 2026-06-08 - Codex

- Summary: Added and used an admin MCP OAuth password reset helper.
- Changed:
  - `scripts/set-mcp-oauth-password.mjs` — added an admin-only password rotation helper for the separate Hetzner MCP server. It supports generated passwords or stdin passwords, writes a backup, updates only `passwordSalt`/`passwordHash`, preserves OAuth token secrets, can restart PM2, and does not print/store passwords unless explicitly requested.
  - `tests/mcp-oauth-password-reset.test.mjs` — added coverage for password hashing/verification, backup path construction, preserved secret fields, reset behavior, CLI parsing, and password output files without trailing newlines.
  - `package.json` — included the password reset test in `test:contract` and `verify:server`.
  - `docs/mcp-oauth-password-reset.md` and `README.md` — documented the safe reset flow.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded the MCP password rotation helper and current reset evidence.
- Live server actions:
  - Copied the helper to `/root/adhd-mcp/set-mcp-oauth-password.mjs` and set mode `700`.
  - Generated a new MCP OAuth password, updated `/root/adhd-mcp/auth-secrets.json`, and restarted PM2 process `adhd-mcp`.
  - Backup created: `/root/adhd-mcp/auth-secrets.json.backup-20260608103812`.
  - Copied the generated password to `/Users/valquilty/.codex/adhd-mcp-oauth-password.txt` with mode `600`, then deleted the server-side one-time password file.
- Verified:
  - `node --check scripts/set-mcp-oauth-password.mjs`
  - `node --check tests/mcp-oauth-password-reset.test.mjs && node tests/mcp-oauth-password-reset.test.mjs`
  - server-side `node --check /root/adhd-mcp/set-mcp-oauth-password.mjs`
  - MCP `/login` returned HTTP `302` when the new password file was submitted without a trailing newline.
  - `codex mcp list` shows `adhd_planner` enabled with `Auth: OAuth`.
  - `npm run check:mcp-readiness` returned `ok: true` and `readyForCodexToolUse: true`.
  - `npm run verify:server`
  - `npm run test:contract`
- Risks / follow-up:
  - The plaintext password now exists intentionally only in the local user-owned file `/Users/valquilty/.codex/adhd-mcp-oauth-password.txt`; keep it out of git and chat.
  - This is an admin CLI helper, not a public password-change endpoint.

## 2026-06-08 - Codex

- Summary: Added credentials-file support for Firestore backup preflight.
- Changed:
  - `scripts/export-firestore-planner.js` — backup CLI now accepts `--credentials-file`, `FIREBASE_CREDENTIALS_FILE`, or `GOOGLE_APPLICATION_CREDENTIALS` for service-account JSON readiness checks. Real exports also prepare `FIREBASE_CREDENTIALS` from that file path before initializing Firebase Admin.
  - `tests/firestore-backup-export.test.mjs` — covered credential-file parsing, readable/missing file preflight, secret/path redaction, `prepareFirebaseCredentials`, and `credentialFileRead` safety metadata.
  - `docs/firestore-backup-export.md`, `README.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the credentials-file preflight flow and the remaining first-live-export boundary.
- Verified:
  - `node --check scripts/export-firestore-planner.js`
  - `node --check tests/firestore-backup-export.test.mjs`
  - `node tests/firestore-backup-export.test.mjs`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - No live Firestore export was run; this heartbeat did not read or write live Firestore data.
  - First live export still needs an explicit safe run where a service-account JSON file is available, then the output path, total docs, size, and SHA-256 should be logged.

## 2026-06-08 - Codex

- Summary: Added a normal known-password change page to the live Hetzner MCP server.
- Live server actions:
  - Patched standalone `/root/adhd-mcp/index.js` to add `GET/POST /change-password`.
  - The route requires an active MCP login session, asks for current password plus new password confirmation, enforces a 12-character minimum, writes a chmod `600` backup of `auth-secrets.json`, and updates only `passwordSalt`/`passwordHash` without changing OAuth token secrets.
  - Restarted PM2 process `adhd-mcp`.
  - Server code backup created: `/root/adhd-mcp/index.js.backup-change-password-20260608114600`.
- Changed in repo:
  - `docs/mcp-oauth-password-reset.md` — documented the normal `/change-password` flow and clarified that SSH reset is only for lost-password/admin recovery.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded the live-only MCP server route and backup filename.
- Verified:
  - local `node --check` on the patched MCP server file before upload.
  - server-side `node --check index.change-password-candidate.js` before replacing `index.js`.
  - `curl https://mcp.valquilty.com/healthz` returned HTTP 200 with `auth: "oauth-password"`.
  - `curl -I https://mcp.valquilty.com/change-password` returned HTTP 302 to `/login?returnTo=%2Fchange-password` without a session.
  - `curl https://mcp.valquilty.com/mcp` still returned HTTP 401 with Bearer `mcp:tools` metadata.
  - `pm2 status adhd-mcp` showed the process online after restart.
- Risks / follow-up:
  - This is a live-only manual deployment because `/root/adhd-mcp` is not a git checkout. The MCP server source should eventually be moved into versioned repo code.
  - Normal password change does not revoke existing OAuth tokens; add token/session revocation later if needed for compromised-password recovery.

## 2026-06-08 - Codex

- Summary: Mirrored the live Hetzner MCP server source into the repo.
- Changed:
  - `services/mcp-server/src/index.js` — added the current live MCP source as versioned service code, including the `/change-password` route. The repo copy removes the hardcoded live Firestore user-id fallback and requires `FIRESTORE_DOCUMENT_ID` or `FIRESTORE_USER_ID`.
  - `services/mcp-server/package.json`, `README.md`, `env.example`, and `ecosystem.config.cjs.example` — added service metadata, local syntax check, deployment boundary docs, and secret-free env/PM2 templates.
  - `tests/mcp-server-source.test.mjs` — added source guard coverage for the password-change route, missing hardcoded live user id, and absence of obvious secret/generated files under `services/mcp-server`.
  - `package.json` — added `npm run check:mcp-server-source` and included it in `verify:server` and `test:contract`.
  - `AGENTS.md`, `README.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded `services/mcp-server` as the MCP source mirror and kept live deploy manual for now.
- Verified:
  - `npm run check:mcp-server-source`
  - `node --check services/mcp-server/src/index.js`
  - `node tests/mcp-server-source.test.mjs`
  - `npm run verify:server`
  - `npm run test:contract`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `rg` over `services/mcp-server` found no hardcoded live user id or private key material.
- Risks / follow-up:
  - Live Hetzner still runs from `/root/adhd-mcp`; this commit creates a source-controlled mirror but does not yet replace manual deploy with CI.
  - The service source is still large and mostly unmodular. Next cleanup should split auth, Firestore task store, and tool definitions before adding more MCP features.

## 2026-06-08 - Codex

- Summary: Added a dry-run-first deploy helper for the mirrored MCP server.
- Changed:
  - `scripts/deploy-mcp-server.mjs` — added a controlled Hetzner sync helper for `services/mcp-server/src/index.js`. Dry-run prints the plan; apply mode runs local syntax check, uploads a candidate, runs server syntax check, backs up live `index.js`, replaces it, restarts PM2 `adhd-mcp`, and verifies `/healthz` plus the `/mcp` Bearer auth boundary.
  - `tests/mcp-server-deploy.test.mjs` — covered option parsing, shell quoting, remote deploy command construction, dry-run safety metadata, mocked apply execution, and help text.
  - `package.json` — added `npm run deploy:mcp-server` and `npm run check:mcp-server-deploy`, and included deploy-helper checks in `verify:server` and `test:contract`.
  - `services/mcp-server/README.md`, `README.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `AGENTS.md` — documented the controlled deploy path and clarified that it copies no secrets or live Firestore data.
- Verified:
  - `npm run check:mcp-server-deploy`
  - `npm run deploy:mcp-server` returned a dry-run plan with no SSH/scp side effects and `livePlannerDataTouched: false`.
  - `npm run deploy:mcp-server -- --help`
  - `npm run verify:server`
  - `npm run test:contract`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - No live deploy was run in this heartbeat; only the deploy helper and tests/docs were added.
  - This is still manual deploy automation, not CI. Next step can either run a dry-run/apply when there is an actual MCP source change to deploy, or modularize the service source before adding MCP capture tooling.

## 2026-06-08 - Codex

- Summary: Completed the first live read-only Firestore planner backup export.
- Changed:
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded the first live backup evidence and removed the practical ambiguity around the previously pending export.
- Live/data actions:
  - Ran backup dry-run for user `U2geUdbvWyVRNLWnSZBnftOMSU22`; no Firestore read/write and no local file write.
  - Ran backup preflight with Firebase service-account JSON sourced into the command environment; credential values were not printed or written into the repo.
  - Ran the real export once; this read Firestore and wrote a local ignored JSON file under `backups/`, with `safety.firestoreWrite: false`.
  - Ran local `--verify-file` against the generated JSON; this read only the backup file and did not read or write Firestore.
- Evidence:
  - Backup file: `backups/firestore-planner-U2geUdbvWyVRNLWnSZBnftOMSU22-2026-06-08T12-26-06-380Z.json`.
  - Absolute local path: `/Users/valquilty/Documents/My Website/Adhdplanner-repo/backups/firestore-planner-U2geUdbvWyVRNLWnSZBnftOMSU22-2026-06-08T12-26-06-380Z.json`.
  - `totalDocs: 6775`
  - `sizeBytes: 9800417`
  - `fileSha256: d2ff47895555905fa05694982abda800f0d8a123e217e193d499363a53eda13d`
  - Collection counts: `tasks: 61`, `taskSnapshots: 87`, `captures: 124`, `commitments: 6`, `plannerEvents: 779`, `reportItems: 490`, `outbox: 104`, `engineRuns: 2438`, `outboxRuns: 1689`, `plannerCommands: 319`, `telegramLogs: 677`, `angelDecisions: 1`.
  - `git status --short --ignored backups` reported `!! backups/`, confirming the generated backup output remains ignored.
- Risks / follow-up:
  - The backup file is local and intentionally not committed. If work moves to another machine, create a fresh backup there or copy this file intentionally through a secure path.
  - This creates a recovery artifact but does not yet add a restore UI or automated revision-history workflow.

## 2026-06-08 - Codex

- Summary: Added a non-mutating Firestore backup restore-plan drill.
- Changed:
  - `scripts/export-firestore-planner.js` — added `--restore-plan <backup.json> [--expectUserId <uid>]`. It reads and validates a local backup file, then prints the root user document target and per-collection document counts that a separate restore flow would need to write.
  - `tests/firestore-backup-export.test.mjs` — added option parsing, safety metadata, direct helper, and CLI coverage for restore-plan.
  - `docs/firestore-backup-export.md`, `README.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented restore-plan as a review artifact, not a live restore.
- Verified:
  - `node --check scripts/export-firestore-planner.js`
  - `node --check tests/firestore-backup-export.test.mjs`
  - `node tests/firestore-backup-export.test.mjs`
  - `npm run backup:planner -- --restore-plan backups/firestore-planner-U2geUdbvWyVRNLWnSZBnftOMSU22-2026-06-08T12-26-06-380Z.json --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22`
- Live/data boundary:
  - The real backup restore-plan reported `totalDocs: 6775`, `fileSha256: d2ff47895555905fa05694982abda800f0d8a123e217e193d499363a53eda13d`, `firestoreRead: false`, `firestoreWrite: false`, `localFileRead: true`, and `restorePlanOnly: true`.
  - No Firestore data was read or written by the restore-plan command.
- Risks / follow-up:
  - There is still no restore apply command. That is intentional until a separate confirmed path can handle backups, stale-current-data checks, and explicit destructive confirmation.
  - The current plan only describes setting documents present in the backup; it does not plan deletion of extra Firestore documents absent from the backup.

## 2026-06-08 - Codex

- Summary: Added and deployed the MCP `capture_note` tool.
- Changed:
  - `services/mcp-server/src/index.js` — added `capture_note`, which sends raw notes to `https://planner.valquilty.com/api/captures` with `source=mcp:*`. Safety defaults are `dry_run: true`, `include_live_tasks: false`, optional explicit `active_tasks`, and `idempotency_key` required for `dry_run:false`.
  - `tests/mcp-server-source.test.mjs` — added source guards for `capture_note`, capture API URL, dry-run default behavior, idempotency guard, and active task snapshot reporting.
  - `scripts/deploy-mcp-server.mjs` and `tests/mcp-server-deploy.test.mjs` — added retrying postchecks so short PM2/nginx warmup `502` responses do not create a false deploy failure.
  - `services/mcp-server/README.md`, `docs/mcp-live-smoke-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the capture tool and remaining authenticated tool-call smoke.
- Verified:
  - `npm run check:mcp-server-source`
  - `npm run deploy:mcp-server` dry-run showed no SSH/scp side effects and `livePlannerDataTouched: false`.
  - `npm run verify:server`
  - `npm run test:contract`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Live deploy:
  - Ran `npm run deploy:mcp-server -- --apply`.
  - Remote backup created: `/root/adhd-mcp/index.js.backup-deploy-20260608T134739`.
  - The deploy helper initially reported postcheck `502` because it checked immediately after PM2 restart; later checks showed the live service healthy.
  - Verified live `/root/adhd-mcp/index.js` contains `PLANNER_CAPTURE_API_URL`, `capture_note`, and the `idempotency_key is required when dry_run=false` guard.
  - `https://mcp.valquilty.com/healthz` returned HTTP 200.
  - `https://mcp.valquilty.com/mcp` returned HTTP 401 with Bearer auth and `mcp:tools` advertised.
  - `npm run check:mcp` and `npm run check:mcp-readiness` both returned `ok: true`.
- Live/data boundary:
  - No Firestore data was read or written by the deploy.
  - No `capture_note` MCP tool call was run in this thread; authenticated tool-call smoke remains pending in a fresh MCP-capable client/thread.

## 2026-06-08 - Codex

- Summary: Made MCP `capture_note` request handling modular and deployable as a multi-file source sync.
- Changed:
  - `services/mcp-server/src/capture-client.js` — extracted capture request construction and posting from `index.js`.
  - `services/mcp-server/src/index.js` — imports the capture client and keeps the MCP tool handler focused on schema-to-client mapping.
  - `tests/mcp-capture-client.test.mjs` — added mocked-fetch coverage for source normalization, dry-run defaults, idempotency protection, active task snapshots, timeout wiring, and capture API error reporting.
  - `scripts/deploy-mcp-server.mjs` and `tests/mcp-server-deploy.test.mjs` — deploy helper now syncs both MCP source files (`index.js` and `capture-client.js`) with local/remote syntax checks, existing-file backup, PM2 restart, and postchecks.
  - `package.json`, `services/mcp-server/package.json`, `services/mcp-server/README.md`, `docs/mcp-live-smoke-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — wired the new checks and documented the multi-file deploy boundary.
- Verified:
  - `npm run check:mcp-server-source`
  - `npm run check:mcp-server-deploy`
  - `npm --prefix services/mcp-server run check`
  - `git diff --check`
  - `npm run deploy:mcp-server` dry-run showed both MCP source files and no secret/live-data copy.
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Live deploy:
  - Ran `npm run deploy:mcp-server -- --apply`.
  - Uploaded only `services/mcp-server/src/index.js` and `services/mcp-server/src/capture-client.js`.
  - Remote `index.js` backup exists at `/root/adhd-mcp/index.js.backup-deploy-20260608T143713`.
  - `capture-client.js` was a new remote file, so no previous `capture-client.js` backup existed to create.
  - Postchecks passed: `/healthz` HTTP 200 and `/mcp` HTTP 401 Bearer auth boundary with `mcp:tools`.
  - Remote syntax checks passed for `/root/adhd-mcp/index.js` and `/root/adhd-mcp/capture-client.js`; remote `index.js` imports `./capture-client.js` and still registers `capture_note`.
- Live/data boundary:
  - No Firestore data was read or written by this deploy.
  - This thread still did not expose callable `adhd_planner` MCP tools through `tool_search`, so authenticated `capture_note` tool-call smoke remains pending in a fresh MCP-capable client/thread.

## 2026-06-08 - Codex

- Summary: Fixed MCP healthcheck version drift.
- Changed:
  - `services/mcp-server/src/index.js` — added `MCP_SERVER_VERSION` and used it for both MCP server metadata and `/healthz`.
  - `tests/mcp-server-source.test.mjs` — added guards that `/healthz` and MCP metadata share the same version constant and that stale `version: "4.0.0"` does not return.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded the ops visibility fix.
- Verified:
  - `npm run check:mcp-server-source`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run deploy:mcp-server` dry-run
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `npm run check:mcp`
  - `npm run check:mcp-readiness`
- Live/data boundary:
  - Ran `npm run deploy:mcp-server -- --apply`.
  - Remote backups created: `/root/adhd-mcp/index.js.backup-deploy-20260608T151520` and `/root/adhd-mcp/capture-client.js.backup-deploy-20260608T151520`.
  - Live `/healthz` now returns `version: "4.1.0"`.
  - Live `/mcp` auth boundary still returns HTTP 401 Bearer with `mcp:tools`.
  - No Firestore data was read or written for this source-only fix.

## 2026-06-08 - Codex

- Summary: Added a local-only backup inventory command.
- Changed:
  - `scripts/export-firestore-planner.js` — added `--list-backups [dir] [--expectUserId <uid>]`, which scans local JSON backup files, validates each backup, reports the latest trusted backup, and flags invalid files.
  - `tests/firestore-backup-export.test.mjs` — covered option parsing, safety metadata, helper behavior, missing directory behavior, invalid JSON reporting, latest-backup sorting, and CLI output.
  - `docs/firestore-backup-export.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the command and its no-Firestore boundary.
- Verified:
  - `node --check scripts/export-firestore-planner.js`
  - `node --check tests/firestore-backup-export.test.mjs`
  - `node tests/firestore-backup-export.test.mjs`
  - `npm run backup:planner -- --list-backups backups --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Live/data boundary:
  - The real local `--list-backups` run found one valid backup, zero invalid backups, and preserved the known checksum `d2ff47895555905fa05694982abda800f0d8a123e217e193d499363a53eda13d`.
  - This command read only local JSON backup files under ignored `backups/`.
  - No Firestore data was read or written.

## 2026-06-09 - Codex

- Summary: Added a local-only latest-backup restore-plan shortcut.
- Changed:
  - `scripts/export-firestore-planner.js` — added `--restore-latest [dir] [--expectUserId <uid>]`, which selects the newest valid local backup and builds the existing non-mutating restore review artifact.
  - `tests/firestore-backup-export.test.mjs` — covered option parsing, safety metadata, helper behavior, missing-valid-backup failure, and CLI output.
  - `docs/firestore-backup-export.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the local-only restore-latest workflow.
- Verified:
  - `node --check scripts/export-firestore-planner.js`
  - `node --check tests/firestore-backup-export.test.mjs`
  - `node tests/firestore-backup-export.test.mjs`
  - `npm run backup:planner -- --restore-latest backups --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Live/data boundary:
  - The real local `--restore-latest` run selected `backups/firestore-planner-U2geUdbvWyVRNLWnSZBnftOMSU22-2026-06-08T12-26-06-380Z.json`, checksum `d2ff47895555905fa05694982abda800f0d8a123e217e193d499363a53eda13d`, `totalDocs: 6775`.
  - This was a restore review artifact only: `firestoreRead: false`, `firestoreWrite: false`, `restorePlanOnly: true`.
  - No Firestore data was read or written.

## 2026-06-09 - Codex

- Summary: Added a local-only backup freshness safety check.
- Changed:
  - `scripts/export-firestore-planner.js` — added `--safety-check [dir] [--expectUserId <uid>] [--maxBackupAgeHours 72]`, which validates local backup inventory freshness and reports `readyForRiskyQa`.
  - `tests/firestore-backup-export.test.mjs` — covered option parsing, safety metadata, fresh/stale/missing backup behavior, and CLI output.
  - `docs/firestore-backup-export.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the command and its no-Firestore boundary.
- Verified:
  - `node --check scripts/export-firestore-planner.js`
  - `node --check tests/firestore-backup-export.test.mjs`
  - `node tests/firestore-backup-export.test.mjs`
  - `npm run backup:planner -- --safety-check backups --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22 --maxBackupAgeHours 72`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Live/data boundary:
  - The real local safety check found one valid backup, zero invalid backups, `readyForRiskyQa: true`, backup age about 28.2 hours, `totalDocs: 6775`, and checksum `d2ff47895555905fa05694982abda800f0d8a123e217e193d499363a53eda13d`.
  - This command read only local JSON backup files under ignored `backups/`.
  - No Firestore data was read or written.

## 2026-06-09 - Codex

- Summary: Added task-data freshness evidence to QA packets.
- Changed:
  - `src/App.js` — QA baseline/packet exports now include `taskDataFingerprint`, latest task update timestamp/title/status/subtask count/subtask preview, and a short active-task preview.
  - `docs/mcp-live-smoke-checklist.md` and `docs/live-angel-verification-checklist.md` — document the new fields for MCP/web refresh and cross-client proof.
  - `docs/angel-engagement-loop.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — record the QA evidence improvement.
- Verified:
  - `git diff --check`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - Browser QA at `http://localhost:3001/main?qa=task-freshness`: guest/local Progress -> Decision Safety copied a QA packet containing `taskDataFingerprint`, `latestTaskUpdatedAt`, `latestTaskUpdatedTitle`, `latestTaskUpdatedStatus`, `latestTaskUpdatedSubtasks`, `latestTaskUpdatedSubtaskPreview`, and `activeTaskPreview`; browser console errors were empty.
  - `npm run test:contract`
  - `npm run verify:server`
- Live/data boundary:
  - Browser QA used guest/local state only.
  - No Firestore data was read or written.
  - This does not complete the authenticated MCP/web refresh smoke; it adds the non-Firestore evidence fields needed for that future live pass.

## 2026-06-09 - Codex

- Summary: Added a local-only QA packet checker/differ for MCP/web refresh evidence.
- Changed:
  - `scripts/check-qa-packet.mjs` — validates copied QA packet text files and diffs baseline/post-write/post-refresh packets with explicit safety metadata.
  - `tests/qa-packet-check.test.mjs` — covers valid cloud packets, guest/local rejection, missing freshness fields, changed fingerprint proof, stable refresh proof, and CLI behavior.
  - `package.json` — added `npm run check:qa-packet` and wired the test into `npm run test:contract` / `npm run verify:server`.
  - `docs/mcp-live-smoke-checklist.md`, `docs/live-angel-verification-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented packet-file comparison as the preferred MCP/web refresh evidence path.
- Verified:
  - `node --check scripts/check-qa-packet.mjs`
  - `node --check tests/qa-packet-check.test.mjs`
  - `node tests/qa-packet-check.test.mjs`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
  - `npm run check:qa-packet -- --help`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Live/data boundary:
  - This is local-only tooling and documentation.
  - No network, MCP tool call, Firestore read, Firestore write, or production deploy was performed.
  - The authenticated MCP/web refresh proof remains pending; the next pass should save QA packets to local text files and run `npm run check:qa-packet`.

## 2026-06-10 - Codex

- Summary: Completed the authenticated MCP/web refresh smoke for disposable task writes.
- Evidence:
  - Preflight `npm run backup:planner -- --safety-check backups --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22 --maxBackupAgeHours 72` passed with `readyForRiskyQa: true`, backup age about 32.64 hours, `totalDocs: 6775`, and checksum `d2ff47895555905fa05694982abda800f0d8a123e217e193d499363a53eda13d`.
  - Preflight `npm run check:mcp-readiness` passed with `readyForCodexToolUse: true`, live MCP HTTP 401 Bearer boundary, scope `mcp:tools`, and Codex config pointing at `https://mcp.valquilty.com/mcp`.
  - Baseline authenticated QA packet at `2026-06-09T21:12:37.215Z`: `liveQaReady: yes`, `plannerBootstrapStatus: success`, `active: 8`, `taskDataFingerprint: 972e7261`.
  - Authenticated MCP client/user evidence confirmed `capture_note`, `get_tasks`, `add_task`, `add_subtask`, and `delete_task` all passed. Cleanup reported task count `62 -> 61`, QA task ref `ab3825f0` absent, and no other task touched.
  - Post-write authenticated QA packet at `2026-06-09T22:02:59.394Z`: `liveQaReady: yes`, `plannerBootstrapStatus: success`, `active: 9`, `taskDataFingerprint: c6faf840`, latest task `QA MCP smoke — delete after test`, latest subtask preview `QA MCP subtask write — delete after test`.
  - `npm run check:qa-packet -- --before qa-before.txt --after qa-after-mcp-write.txt --expectTaskTitle "QA MCP smoke" --expectSubtaskPreview "QA MCP subtask write"` passed with `ok: true`, `fingerprintChanged: true`, and both expectations found.
  - After hard refresh, authenticated QA packet at `2026-06-09T22:04:32.786Z`: `liveQaReady: yes`, `plannerBootstrapStatus: success`, `active: 9`, `taskDataFingerprint: c6faf840`, QA task/subtask still latest.
  - `npm run check:qa-packet -- --before qa-after-mcp-write.txt --after qa-after-refresh.txt --expectStable` passed with `ok: true` and `fingerprintStable: true`.
  - Cleanup web packets at `2026-06-09T22:06:58.296Z` and `2026-06-09T22:13:18.237Z` were copied while bootstrap was still pending, but both task-data fields returned to baseline: `active: 8`, `taskDataFingerprint: 972e7261`, and latest task returned to `Приготовить лесгинский злеб`.
- Result:
  - The historical stale-web rollback risk did not reproduce: the MCP-created QA task and subtask stayed visible after hard refresh.
  - The disposable QA task was cleaned up through MCP, and MCP confirmed it was absent afterward.
- Caveat / follow-up:
  - Final cleanup QA packets were `liveQaReady: no` because `plannerBootstrapStatus` was still `loading`; task data and MCP cleanup evidence were sufficient to close this smoke, but bootstrap latency after cleanup should be watched if it repeats.
  - No production code or infrastructure was changed in this verification session.

## 2026-06-10 - Codex

- Summary: Hardened web planner bootstrap against indefinite pending QA packets.
- Changed:
  - `src/plannerCommandClient.js` — added a default 15s timeout for `runPlannerBootstrap`, AbortController wiring, injectable `fetchImpl` for contract tests, and explicit `PlannerClientActionError` timeout payloads.
  - `tests/planner-command-client.test.mjs` — covered timeout normalization, successful bootstrap request shape, bootstrap abort behavior, and server error propagation without network or Firestore access.
  - `package.json` — wired the new test into `npm run test:contract` and `npm run verify:server`.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented that repeated `planner-bootstrap-pending` should now become an explicit bootstrap failure instead of staying in `loading` forever.
- Verified:
  - `node --check src/plannerCommandClient.js`
  - `node --check tests/planner-command-client.test.mjs`
  - `node tests/planner-command-client.test.mjs`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `./deploy-prod-safe.sh`
  - `curl -I -L --max-time 20 https://planner.valquilty.com/main`
  - Production bundle check: `/static/js/main.bc0c2d9f.js` returned HTTP 200 and contained both `Planner bootstrap` and `timed out after`.
- Production deploy:
  - Vercel deployment `dpl_768iWqGQif1CoGfF2VMX43fje3zN` completed with `readyState: READY` and was aliased to `https://planner.valquilty.com`.
- Live/data boundary:
  - No Firestore data was read or written.
  - No MCP, Telegram, or OAuth action was performed in this hardening slice.
  - This does not prove the next live QA packet will always bootstrap instantly; it prevents the browser client from hiding a hung bootstrap request as endless `planner-bootstrap-pending`.

## 2026-06-10 - Codex

- Summary: Strengthened local backup safety checks before risky QA.
- Changed:
  - `scripts/export-firestore-planner.js` — `--safety-check` now supports `--minTotalDocs` and `--requireCollections`, and reports the applied requirements plus latest backup collection counts.
  - `tests/firestore-backup-export.test.mjs` — covered option parsing, missing/invalid safety-only flags, minimum-document blockers, required-collection blockers, and the CLI happy path.
  - `docs/firestore-backup-export.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md` — documented the stronger safety gate.
- Verified:
  - `node --check scripts/export-firestore-planner.js`
  - `node --check tests/firestore-backup-export.test.mjs`
  - `node tests/firestore-backup-export.test.mjs`
  - `npm run backup:planner -- --safety-check backups --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22 --maxBackupAgeHours 72 --minTotalDocs 1000 --requireCollections tasks,plannerEvents,outbox,engineRuns`
- Local backup evidence:
  - The latest ignored backup passed the strengthened safety gate with `readyForRiskyQa: true`, age about 43.33 hours, `totalDocs: 6775`, SHA-256 `d2ff47895555905fa05694982abda800f0d8a123e217e193d499363a53eda13d`, and required collections `tasks`, `plannerEvents`, `outbox`, and `engineRuns` present.
- Live/data boundary:
  - This read only local ignored backup JSON files.
  - No Firestore data was read or written.
  - No MCP, Telegram, OAuth, or production deploy action was performed.

## 2026-06-10 - Codex

- Summary: Added Decision Trace freshness proof to copied QA packets.
- Changed:
  - `src/App.js` — `Copy QA packet` / `Copy decision trace` now include `decisionTraceFingerprint` and `decisionTraceRows` computed from the visible Decision Trace rows.
  - `scripts/check-qa-packet.mjs` — parsed the new decision fields and added `--expectDecisionStable` for packet pairs where refresh should preserve the visible Decision Trace.
  - `tests/qa-packet-check.test.mjs` — covered decision fingerprint parsing, changed/stable comparisons, CLI option parsing, and `--expectDecisionStable` CLI output.
  - `docs/mcp-live-smoke-checklist.md`, `docs/live-angel-verification-checklist.md`, `docs/angel-engagement-loop.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented when to capture and compare decision trace fingerprints.
- Verified:
  - `node --check src/App.js`
  - `node --check scripts/check-qa-packet.mjs`
  - `node --check tests/qa-packet-check.test.mjs`
  - `node tests/qa-packet-check.test.mjs`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `./deploy-prod-safe.sh`
  - `curl -I -L --max-time 20 https://planner.valquilty.com/main`
  - Production bundle check: `/static/js/main.a8efebb1.js` returned HTTP 200 and contained both `decisionTraceFingerprint` and `decisionTraceRows`.
- Production deploy:
  - Vercel deployment `dpl_AYXEnXoaVwsdtmGYuNNVCVdMsrd5` completed with `readyState: READY` and was aliased to `https://planner.valquilty.com`.
- Live/data boundary:
  - No Firestore data was read or written.
  - No MCP, Telegram, OAuth, or browser-authenticated QA action was performed.
  - Production deploy changed only the web QA packet/decision trace export surface; no live user task data was mutated.

## 2026-06-10 - Codex

- Summary: Added repo-side Google Calendar status coverage before the remaining live OAuth smoke.
- Changed:
  - `tests/google-calendar-callback.test.mjs` — added `/api/google-calendar-status` coverage for non-GET method guard, missing `PLANNER_DEFAULT_USER_ID`, connected true/false JSON responses, and backend error JSON responses with stubbed dependencies.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented that callback and status paths are repo-covered while real OAuth completion remains untested.
- Verified:
  - `node --check tests/google-calendar-callback.test.mjs`
  - `node tests/google-calendar-callback.test.mjs`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
- Live/data boundary:
  - No Google OAuth flow was opened or completed.
  - No Google API, Firestore, MCP, Telegram, or production deploy action was performed.

## 2026-06-10 - Codex

- Summary: Hardened local QA packet diffs against reversed or duplicated packet files.
- Changed:
  - `scripts/check-qa-packet.mjs` — diff mode now compares `capturedAt` values and fails with `captured_at_not_after` when `--after` is not newer than `--before`.
  - `tests/qa-packet-check.test.mjs` — covered normal chronological diffs, reversed packet diffs, and CLI failure output.
  - `docs/mcp-live-smoke-checklist.md`, `docs/live-angel-verification-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented `capturedAt` ordering as part of packet evidence.
- Verified:
  - `node --check scripts/check-qa-packet.mjs`
  - `node --check tests/qa-packet-check.test.mjs`
  - `node tests/qa-packet-check.test.mjs`
- Live/data boundary:
  - This is local-only checker/docs work.
  - No network, Firestore, MCP, Telegram, OAuth, or production deploy action was performed.

## 2026-06-10 - Codex

- Summary: Added a local-only backup comparison command for safer recovery review.
- Changed:
  - `scripts/export-firestore-planner.js` — added `--compare-backups before.json after.json`, which validates both local backup files, confirms the same user id, compares root/document data hashes, reports per-collection counts, and prints path-only previews for added/removed/changed documents without printing document data.
  - `tests/firestore-backup-export.test.mjs` — covered option parsing, safety metadata, direct comparison output, same-file comparison, CLI output, and no document-data leakage in the comparison report.
  - `docs/firestore-backup-export.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the local-only backup diff workflow.
- Verified:
  - `node --check scripts/export-firestore-planner.js`
  - `node --check tests/firestore-backup-export.test.mjs`
  - `node tests/firestore-backup-export.test.mjs`
- Live/data boundary:
  - This reads only local backup JSON files when used.
  - No Firestore data was read or written.
  - No MCP, Telegram, OAuth, Google API, or production deploy action was performed.

## 2026-06-10 - Codex

- Summary: Added mission/bootstrap expectations to the local QA packet checker.
- Changed:
  - `scripts/check-qa-packet.mjs` — parsed `plannerBootstrapStatus`, `plannerBootstrapReason`, `mission`, and `missionReason` into packet summaries, and added `--expectPlannerBootstrapStatus`, `--expectMission`, and `--expectMissionReason`.
  - `tests/qa-packet-check.test.mjs` — covered parsing, positive validation, negative validation, diff reports, CLI option parsing, and CLI output for the new expectations.
  - `docs/mcp-live-smoke-checklist.md`, `docs/live-angel-verification-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented focused mission/bootstrap packet checks.
- Verified:
  - `node --check scripts/check-qa-packet.mjs`
  - `node --check tests/qa-packet-check.test.mjs`
  - `node tests/qa-packet-check.test.mjs`
- Live/data boundary:
  - This is local-only checker/docs work.
  - No Firestore data was read or written.
  - No MCP, Telegram, OAuth, Google API, or production deploy action was performed.

## 2026-06-10 - Codex

- Summary: Added route-level coverage for Telegram panic fallback text.
- Changed:
  - `tests/telegram-intent-fallback.test.mjs` — now verifies that, with OpenRouter unavailable, `routePlannerAgentInput` routes `🆘 I’m stuck` to `panic` with no task-memory enrichment and routes `SOS I’m stuck on "Pay rent"` to `panic_task`.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded that the panic fallback is covered at router level, not only parser level.
- Verified:
  - `node --check tests/telegram-intent-fallback.test.mjs`
  - `node tests/telegram-intent-fallback.test.mjs`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
- Live/data boundary:
  - This is tests/docs only.
  - No Firestore data was read or written.
  - No MCP, Telegram, OAuth, Google API, or production deploy action was performed.

## 2026-06-10 - Codex

- Summary: Added repo-side coverage for Telegram Google Calendar scheduling execution.
- Changed:
  - `tests/planner-telegram-readonly-actions.test.mjs` — mocks Google Calendar helpers and covers three `schedule_task` executor paths: disconnected users receive the Calendar connect CTA, connected users missing date/time receive guidance, and a connected valid route calls `createCalendarEvent` with the expected task title/date/time/duration payload.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/telegram-live-smoke-checklist.md` — recorded that the executor path is covered while real OAuth completion and live Google API event creation remain untested.
- Verified:
  - `node --check tests/planner-telegram-readonly-actions.test.mjs`
  - `node tests/planner-telegram-readonly-actions.test.mjs`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
- Live/data boundary:
  - This is tests/docs only.
  - No Firestore data was read or written.
  - No MCP, Telegram, OAuth, live Google API, or production deploy action was performed.

## 2026-06-10 - Codex

- Summary: Hardened Telegram fallback panic parsing for real button-style text.
- Changed:
  - `api/_lib/telegram-intent.js` — normalizes curly apostrophes, strips leading panic button/SOS markers, and routes emoji/SOS panic text such as `🆘 I’m stuck`, `SOS I’m stuck`, and `sos` to plain `PANIC` instead of `PANIC_TASK` with the whole button text as `task_ref`.
  - `tests/telegram-intent-fallback.test.mjs` — added regression coverage for emoji/SOS/curly-apostrophe panic text and quoted task-specific panic text.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, `SESSION_HANDOFF.md`, and `docs/telegram-live-smoke-checklist.md` — recorded the repo-side coverage and the remaining live Telegram free-text smoke boundary.
- Verified:
  - `node --check api/_lib/telegram-intent.js`
  - `node --check tests/telegram-intent-fallback.test.mjs`
  - `node tests/telegram-intent-fallback.test.mjs`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
  - `./deploy-prod-safe.sh`
  - `curl -I -L --max-time 20 https://planner.valquilty.com/main`
- Production deploy:
  - Vercel deployment `dpl_DPikz1AHL1cEcJFkpdc54yQDaweT` completed with `readyState: READY` and was aliased to `https://planner.valquilty.com`.
- Live/data boundary:
  - No Firestore data was read or written.
  - No MCP, OAuth, Google API, or live Telegram message action was performed.
  - Production deploy changed the Telegram intent fallback parser and docs/tests only; a real Telegram free-text panic smoke remains useful.

## 2026-06-10 - Codex

- Summary: Added outbox-empty assertions to the local QA packet checker.
- Changed:
  - `scripts/check-qa-packet.mjs` — parses `outboxPending`, `outboxRetry`, `outboxDead`, `outboxSending`, and `delivery` into packet summaries, and adds `--expectOutboxEmpty` for packet validation/diff evidence.
  - `tests/qa-packet-check.test.mjs` — covers parsing outbox counts, successful empty-queue validation, non-empty queue failures, CLI option parsing, and JSON output.
  - `docs/mcp-live-smoke-checklist.md`, `docs/live-angel-verification-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — document when to use `--expectOutboxEmpty`.
- Verified:
  - `node --check scripts/check-qa-packet.mjs`
  - `node --check tests/qa-packet-check.test.mjs`
  - `node tests/qa-packet-check.test.mjs`
  - `git diff --check`
  - `npm run test:contract`
  - `npm run verify:server`
- Live/data boundary:
  - This is local-only checker/docs work.
  - No Firestore data was read or written.
  - No MCP, Telegram, OAuth, Google API, or production deploy action was performed.

## 2026-06-10 - Codex

- Summary: Logged Claude/Fable authenticated MCP `capture_note` smoke evidence.
- Changed:
  - `docs/mcp-live-smoke-checklist.md` — recorded the Claude Code / Fable 5 remote MCP dry-run `capture_note` evidence, read-only task counts, no-mutation boundary, and the remaining browser-authenticated QA-packet refresh proof.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded that the authenticated `capture_note` tool-call smoke is closed across a Claude client and clarified that remaining MCP consistency work is web refresh / QA-packet proof, not another capture call.
- Evidence recorded:
  - Remote MCP: `https://mcp.valquilty.com/mcp`.
  - Read-only `get_tasks`: canonical subcollection, `count=61`, `score=506` before manual cleanup; `count=60`, `score=521` after manual cleanup.
  - `capture_note` dry-run: `origin.channel=mcp`, `origin.via=captures_api`, `origin.source=mcp:live-smoke`, `activeTasksSource=none`, `activeTasksCount=0`, `captureId=dryrun-1781101401729`.
- Verified:
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Live/data boundary:
  - This is docs-only evidence logging.
  - No Firestore data was read or written by this Codex pass.
  - No MCP, Telegram, OAuth, Google API, browser-authenticated QA, or production deploy action was performed.

## 2026-06-10 - Codex

- Summary: Added a local-only planner integrity checker for backup JSON files.
- Changed:
  - `scripts/check-planner-integrity.mjs` — added a local backup checker with safety metadata, backup schema validation, exit code `1` on findings, and invariants for false-death signatures, invalid `deadlineAt`, stale not-your-move blocks, Angel pins on non-active tasks, overdue active pressure tasks, and QA/test/smoke title markers outside completed status.
  - `tests/planner-integrity-check.test.mjs` — added fixture coverage for all requested integrity findings, including `0020-02-07`, plus clean-backup and CLI exit-code coverage.
  - `package.json` — added `npm run check:planner-integrity` and wired the checker into `npm run test:contract` and `npm run verify:server`.
  - `docs/firestore-backup-export.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — documented the checker and its local-only boundary.
- Local backup probe:
  - Ran the checker against `backups/firestore-planner-U2geUdbvWyVRNLWnSZBnftOMSU22-2026-06-08T12-26-06-380Z.json` with `--asOf 2026-06-10T12:00:00.000Z`.
  - It correctly returned `ok: false` with six findings, including `invalid_deadlineAt` for `0020-02-07`.
- Fresh backup attempt:
  - `npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22` could not run because this shell has no `FIREBASE_CREDENTIALS`, `FIREBASE_CREDENTIALS_FILE`, or `GOOGLE_APPLICATION_CREDENTIALS`.
  - No credential file was found under the checked `.codex` / project paths. The 2026-06-08 backup remains the latest local backup until credentials are provided.
- Verified:
  - `node --check scripts/check-planner-integrity.mjs`
  - `node --check tests/planner-integrity-check.test.mjs`
  - `node tests/planner-integrity-check.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Live/data boundary:
  - Checker execution was local-only against an ignored backup file.
  - The attempted fresh backup would have been read-only, but it did not start because credentials were unavailable.
  - No Firestore write, MCP mutation, Telegram action, OAuth action, Google API mutation, browser-authenticated QA, or production deploy was performed.

## 2026-06-10 - Codex

- Summary: Added deadline year validation across planner write paths.
- Changed:
  - `api/_lib/planner-deadline.js` — added the shared server-side deadline validator for `YYYY-MM-DD` dates with supported years `2020..2100`.
  - `api/_lib/planner-contract.js` — rejects invalid `deadlineAt` on `add_task`, `schedule_task`, and `set_deadline`, including `0020-02-07`.
  - `api/_lib/planner-command-service.js` and `api/_lib/planner-store.js` — reject invalid explicit command deadlines before task creation/update and defensively avoid storing invalid deadlines.
  - `api/_lib/capture-extractor.js` and `api/_lib/telegram-intent.js` — heuristic extraction now ignores invalid deadline years instead of writing them; capture normalization exposes an `ignored_invalid_deadlineAt` warning for testable evidence.
  - `api/_lib/planner-action-executor.js` — validates schedule deadlines before passing them to Google Calendar and normalizes merge defense.
  - `services/mcp-server/src/index.js` — rejects invalid `deadline_at` in standalone MCP `add_task` and `set_deadline`.
  - `tests/planner-actions-contract.test.mjs`, `tests/planner-command-service-subtask.test.mjs`, `tests/captures-origin-contract.test.mjs`, and `tests/mcp-server-source.test.mjs` — added regression coverage for `0020-02-07` and the MCP year-range guard.
  - `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — recorded the deadline-write guard.
- Verified:
  - `node --check api/_lib/planner-deadline.js`
  - `node --check api/_lib/planner-store.js`
  - `node --check api/_lib/planner-contract.js`
  - `node --check api/_lib/planner-command-service.js`
  - `node --check api/_lib/capture-extractor.js`
  - `node --check api/_lib/telegram-intent.js`
  - `node --check api/_lib/planner-action-executor.js`
  - `node --check services/mcp-server/src/index.js`
  - `node tests/planner-actions-contract.test.mjs`
  - `node tests/planner-command-service-subtask.test.mjs`
  - `node tests/captures-origin-contract.test.mjs`
  - `node tests/mcp-server-source.test.mjs`
  - `node tests/planner-telegram-readonly-actions.test.mjs`
  - `node tests/telegram-intent-fallback.test.mjs`
  - `node tests/planner-command-client.test.mjs`
  - `node tests/planner-command-event-specs.test.mjs`
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Live/data boundary:
  - No Firestore data was read or written.
  - No MCP tool call, Telegram action, OAuth action, Google API mutation, browser-authenticated QA, or live user-data mutation was performed in this slice.
  - This is production-behavior code and should be deployed to both Vercel API/web and the standalone MCP server mirror.

## 2026-06-10 - Codex

- Summary: Deployed the planner deadline year validation guard to production web/API and the standalone MCP server.
- Deployment:
  - Web/API: `./deploy-prod-safe.sh` completed production deployment `dpl_8md2CxUakCAZd68Ajp3NJVxsCgxs`, aliased to `https://planner.valquilty.com`.
  - Web live check: `curl -I -L --max-time 20 https://planner.valquilty.com/main` returned HTTP `200`.
  - MCP: `npm run deploy:mcp-server -- --apply` synced `services/mcp-server/src/index.js` and `services/mcp-server/src/capture-client.js` to `/root/adhd-mcp`, restarted PM2 process `adhd-mcp`, and passed postchecks.
  - MCP remote backups: `index.js.backup-deploy-20260610T151939` and `capture-client.js.backup-deploy-20260610T151939`.
  - MCP postchecks: `/healthz` returned HTTP `200` with version `4.1.0`; `/mcp` auth boundary returned HTTP `401` with Bearer auth and `mcp:tools` advertised.
  - Public MCP probe: `npm run check:mcp` returned `ok: true`.
- Verified before deployment:
  - `npm run test:contract`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Live/data boundary:
  - This deploy changed code behavior only.
  - No Firestore data was read or written by Codex during deploy.
  - No authenticated MCP tool call, Telegram action, OAuth action, Google API mutation, browser-authenticated QA, or live user-data mutation was performed.

## 2026-06-10 - Codex

- Summary: Added a dedicated Google Calendar live-smoke runbook.
- Changed:
  - `docs/google-calendar-live-smoke-checklist.md` — added a user-assisted OAuth checklist that separates OAuth-only proof from optional disposable event creation, includes the read-only status endpoint check, and lists evidence fields without exposing tokens.
  - `docs/telegram-live-smoke-checklist.md`, `ROADMAP.md`, `EXECUTION_PLAN.md`, and `SESSION_HANDOFF.md` — linked/recorded the Calendar live-smoke procedure.
- Verified:
  - `git diff --check`
- Live/data boundary:
  - Docs-only change.
  - No Firestore data was read or written.
  - No Telegram action, Google OAuth action, Google API call, MCP tool call, browser-authenticated QA, production deploy, or live user-data mutation was performed.

## 2026-06-10 - Codex

- Summary: Added a short Claude/reviewer brief for the remaining non-blocking live items.
- Changed:
  - `SESSION_HANDOFF.md` — added a top-level "Current Claude/reviewer brief" clarifying that the remaining items are not known breakages: fresh read-only backup needs Firebase credentials, Google Calendar OAuth needs the user's real Telegram/browser flow, browser QA packet needs the user's authenticated browser, and non-dry-run `capture_note` is intentionally untested because it creates a real capture.
  - Recorded that the frequent `planner-sprint-heartbeat` automation was deleted because the remaining checks are user-assisted or credential-dependent.
- Latest safety state recorded:
  - Local backup safety-check passed at `2026-06-10T19:52:49.044Z` using the 2026-06-08 backup, `ageHours: 55.45`, `readyForRiskyQa: true`.
- Verified:
  - `git diff --check`
- Live/data boundary:
  - Docs-only change.
  - No Firestore data was read or written.
  - No Telegram action, Google OAuth action, Google API call, MCP tool call, browser-authenticated QA, production deploy, or live user-data mutation was performed.
