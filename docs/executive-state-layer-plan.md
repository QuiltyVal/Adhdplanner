# Executive State Layer Plan

## Product thesis

ADHD Planner is not just a task list.

It is an external executive-function layer for moments when the user cannot reliably choose, start, continue, or let go of tasks.

The app should first ask what state the user's brain is in, then adapt what it shows and allows.

## Core states

- `panic`: the user is overloaded and may try to solve everything at once.
- `fog`: the user cannot choose or parse the full list.
- `stuck`: the user has a target but cannot start or continue.
- `hyperfocus`: the user may over-expand, over-perfect, or ignore boundaries.
- `normal`: the user can use the full planner.

## Non-goals

- Do not create a new local-only MVP.
- Do not rewrite the task system.
- Do not duplicate auth, backend, Telegram, or storage logic.
- Do not hide the existing task worlds permanently.
- Do not add AI state detection in v1.
- Do not redesign the whole app in this pass.

## UX contract

Executive State Layer is a first-action layer, not a replacement for the planner.

It should:

- make the current state explicit;
- explain what is happening;
- block or discourage harmful actions;
- offer allowed actions;
- give one safe next step;
- let the user reveal the full planner if needed.

## Phase 1: visible UX layer

Goal: make the idea visible without touching deep backend.

Status: first product pass implemented in `src/App.js` and `src/App.css` as a thin layer over the existing planner shell. It does not replace task worlds, auth, backend commands, rescue, or reports.

Update: the layer is now gated for safe rollout. It is always visible in `/demo`, can be enabled in the real app with `?stateLayer=1`, and also appears if the user already has a selected executive state saved locally. Demo defaults to `stuck` so the portfolio story is immediately visible.

Update: rescue-first states now gate the full planner until the user explicitly clicks `Show full planner`. Mode card rendering is keyed by selected state to prevent stale visual state after switching.

Update: each mode now has a distinct protocol:

- `panic`: emergency brake, no decisions, two-minute rescue;
- `fog`: low-visibility mode, reduce choice noise;
- `stuck`: activation bridge, lower the first-step cost;
- `hyperfocus`: scope guard, prevent expansion;
- `normal`: full planner.

The layer is dismissible outside demo mode and clears the saved local executive-state selection.

Update: Angel check-in v1 now chooses a control-restoring task from existing active tasks for every non-normal state. The suggestion includes why this task was chosen, the first usable step, and confirm actions. If the task has no open step, Angel can suggest a concrete first step and add it through the existing subtask command before opening rescue. This is still a safe deterministic layer, not a new backend or autonomous AI writer.

Add:

- `ExecutiveStatePicker`
- `StateModeCard`
- state copy for panic/fog/stuck/hyperfocus/normal
- local selected state for the current session
- optional localStorage persistence for selected state

The card should show:

- what is happening;
- forbidden actions;
- allowed actions;
- one safe next step;
- CTA: `Start rescue`;
- CTA: `Park until tomorrow`;
- secondary CTA: `Show full planner`.

For `panic`, `fog`, and `stuck`:

- show state protocol before the full task list;
- do not remove the task list from the product;
- make the full planner secondary.

## Phase 2: safe behavior

Goal: make state choice change behavior without causing backend instability.

Status: first safe behavior pass implemented. `Start rescue` uses the existing rescue entry point. `Park until tomorrow` removes today's pressure by unpinning active today tasks through the existing today-toggle path; it does not delete, complete, bury, or resurrect tasks.

Update: `Start rescue` in the executive-state card now starts rescue for the Angel-selected control task, not only the generic mission. `Add step + start rescue` first adds the suggested microstep to that task using the existing step command path, then opens the existing rescue overlay with that step pinned as the first rescue move.

Add:

- `Start rescue` opens existing rescue flow with current mission/default rescue task.
- `Park until tomorrow` is non-destructive.
- In v1, parking should remove today pressure, not delete or bury tasks.

Recommended initial implementation for `Park until tomorrow`:

- find active tasks with `isToday === true`;
- unset today pin through existing backend command path where possible;
- do not change `active/completed/dead` status;
- do not touch cemetery/heaven;
- show confirmation text.

## Phase 3: report/log

Goal: make this visible as a product system.

Status: v1 logs selected state/actions locally in `adhd_planner_executive_state_log`. Backend command/report integration is intentionally deferred until the UX behavior is validated.

Add backend command later:

- `SET_EXECUTIVE_STATE`
- payload: state, intensity, selectedAction, source
- event: `EXECUTIVE_STATE_SELECTED`
- report item for Progress/Planner Report

Progress can later show:

- recent executive states;
- actions taken from state mode;
- parked pressure events.

## Phase 4: portfolio/demo polish

Prepare:

Status: first demo story layer added, but it is no longer shown by default inside `/demo` because it reads like portfolio copy rather than product UI. Use `?demoStory=1` only when a separate portfolio screenshot is needed.

- 5 screenshots:
  - state picker;
  - panic protocol;
  - fog protocol;
  - park until tomorrow;
  - progress/report with state log.
- portfolio copy:
  - "Built an executive-state interface for an ADHD planner: the app changes behavior depending on whether the user is in panic, fog, stuckness, hyperfocus, or normal planning mode."
  - "Designed Park until tomorrow as a non-destructive pressure-release action: tasks are not deleted, only removed from today's cognitive load."

## Implementation order

1. Add state definitions and UI components.
2. Render picker/card above Today Mission or directly under Planner Status.
3. Connect `Start rescue` to existing rescue flow.
4. Add safe `Park until tomorrow`.
5. Add light session/local persistence.
6. Only then consider backend log/report.

## Test checklist

- `Panic` shows rescue protocol first.
- `Fog` does not force the user into the full task list first.
- `Stuck` points to one current task/microstep.
- `Hyperfocus` warns against expanding scope.
- `Normal` leaves the planner mostly unchanged.
- `Park until tomorrow` does not delete tasks.
- `Park until tomorrow` does not move tasks to Heaven or Cemetery.
- Existing `Done`, `Cemetery`, `Reopen`, and `Delete forever` flows still work.

## Angel Lab speech input update

- Angel Lab microphone input now prefers OpenAI server-side transcription through `/api/transcribe`.
- Browser `SpeechRecognition` remains only as a fallback when `MediaRecorder` is unavailable.
- The transcription language follows the planner UI language: `ru` for Russian, `en` for English.
- `/api/speech-to-text` remains as a backward-compatible endpoint.

Correction: `/api/transcribe` was not kept because the Vercel Hobby deployment already uses the maximum number of Serverless Functions. Angel Lab uses the existing `/api/speech-to-text` function for OpenAI transcription.

## Angel Lab speech language detection update

- Angel Lab now sends `language: auto` for microphone dumps.
- The speech endpoint omits the OpenAI `language` parameter in auto mode, allowing OpenAI transcription to detect the spoken language from the audio instead of relying on the UI language.

## Angel Lab microphone UX fix

- The microphone button now shows an immediate permission-request status before `getUserMedia` resolves.
- The active microphone button state now matches the actual React class (`busy`), so recording/finalizing is visually obvious.

## Angel Lab microphone permission timeout

- `getUserMedia` can stay pending when the browser waits for microphone permission.
- Angel Lab now times out that pending state after 9 seconds and tells the user to allow microphone access from the browser/address-bar permission icon before retrying.

## Angel Lab microphone permission wait correction

- Microphone permission waiting is now hint-only, not a hard cancellation.
- If the browser grants microphone access slowly, Angel Lab keeps waiting and can still start recording instead of stopping the late stream.
- The permission hint is cleared on both success and failure so stale “requesting microphone access” text does not overwrite the real state.

## Angel Lab microphone primary path correction

- Browser speech dictation is again the primary microphone path because that was the historically working behavior on mobile.
- OpenAI audio recording remains as a fallback only when browser speech recognition is unavailable.
- This keeps the new server-side transcription path without letting `getUserMedia` block the main user flow.
