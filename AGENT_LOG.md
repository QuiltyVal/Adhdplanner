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
  - `src/Login.js` — removed `signInWithPopup` as the primary login path, starts Google auth with `signInWithRedirect`, and forces `browserLocalPersistence` before redirect/result handling.
  - `SESSION_HANDOFF.md`, `EXECUTION_PLAN.md` — recorded the auth boundary and live-QA access implication.
- Verified:
  - Reproduced the Codex in-app browser failure: popup login navigated the selected tab to `telegrammadhd.firebaseapp.com/__/auth/handler` with no opener, blank body, and no saved `adhdUser`.
  - Reproduced the first redirect attempt returning from the handler to `/login` without a user while the embedded browser reported no IndexedDB.
  - `git diff --check`
  - `npm run verify:server`
  - `DISABLE_ESLINT_PLUGIN=true npm run build`
- Risks / follow-up:
  - Needs production deploy and one fresh in-app browser login attempt to confirm Firebase redirect plus local persistence returns to `/main` as a cloud-authenticated user.
