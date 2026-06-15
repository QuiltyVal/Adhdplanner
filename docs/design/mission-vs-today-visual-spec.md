# Design spec: "you pinned" vs "angel chose" (mission vs Today)

Author: Claude (design/review). Implementer: Codex (implement exactly, leave uncommitted, hand back for review + commit).
Status: ready to implement. Scope: authenticated web app UI only. No planner logic changes. No Firestore changes.

## Problem (verified in code, 2026-06-11)

1. The angel's pick is invisible on the board. `angelPinned` / `angelReason` are not rendered on task cards at all (`src/TaskColumn.js`). A task the angel is holding looks identical to every other task.
2. The mission panel is mislabeled. `src/TodayMissionPanel.js:48` renders a hardcoded kicker `today mission`. The word "today" and the warm sun of the user's manual `☀️ Сегодня` pin collide, so the user cannot tell "I pinned this" from "the system chose this."

This spec does NOT invent a new visual vocabulary. It formalizes the palette the app already uses by accident into three intentional signal families.

## The three signal families

| Family | Meaning | Emoji | Color (light sticker on dark card) | Already in app? |
|---|---|---|---|---|
| Warm | Your manual signals | `☀️` Today | amber | `☀️` exists but is currently neutral/grey — make it warm |
| Cool | Angel / system signals | `🎯` angel's quest (new), `🪽` not your move (exists) | blue | `🪽` not_your_move already blue |
| Red | Task-intrinsic facts | `🚨` critical, `📅` deadline | red | already red |

Rule for all future chips: warm = the user chose it, cool = the angel/system chose it, red = a hard fact about the task. `🎯` is the agreed mark for "angel chose this." Do not reuse `🪽` (taken by not_your_move) or `🧭` (taken by the mission-reason chip).

## Exact color tokens

Follow the existing "light sticker on dark card" pattern of `.task-passive-chip.not-your-move-chip` (light background, dark same-family text).

- Angel-pick (cool/blue):
  - background `rgba(230, 241, 251, 0.92)`
  - border-color `rgba(55, 138, 221, 0.45)`
  - color `#0C447C`
- Today (warm/amber):
  - background `rgba(250, 238, 218, 0.9)`
  - border-color `rgba(239, 159, 39, 0.40)`
  - color `#854F0B`

These intentionally differ from not_your_move's lighter blue so the two cool chips are distinguishable; the `🎯` mark + label also separate them, and they rarely co-occur on one card.

### Dark-mode tokens (required)

The app has a dark cascade (`[data-theme="dark"] .task-card .task-passive-chip`, `src/TaskColumn.css` ~line 2095) that overrides chip colors, so each special chip needs its own dark override. Match not_your_move's dark strategy (translucent dark fill + light same-family text), NOT the light tokens, so all special chips render coherently in dark mode:

- Angel-pick dark: background `rgba(37, 99, 235, 0.28)`, border-color `rgba(96, 165, 250, 0.40)`, color `#dbeafe` (a touch stronger than not_your_move's dark blue, since the active pick should read stronger than the waiting state).
- Today dark: background `rgba(146, 64, 14, 0.24)`, border-color `rgba(239, 159, 39, 0.34)`, color `#fde6c0`.

## Change 1 — make the Today chip warm (`src/TaskColumn.js` + `src/TaskColumn.css`)

Current (`src/TaskColumn.js`, ~line 688):
```jsx
{task.isToday && <span className="task-passive-chip">☀️ {copy.today}</span>}
```
Change to add a modifier class:
```jsx
{task.isToday && <span className="task-passive-chip today-chip">☀️ {copy.today}</span>}
```
Add to `src/TaskColumn.css` (next to `.not-your-move-chip`):
```css
.task-passive-chip.today-chip {
  border-color: rgba(239, 159, 39, 0.40);
  color: #854F0B;
  background: rgba(250, 238, 218, 0.9);
}
```
Do not change `copy.today` text. Do not change the `today-toggle-btn` / `todayPinned` / `todayPin` button copy.

## Change 2 — add the angel-pick chip on cards (`src/TaskColumn.js` + `src/TaskColumn.css`)

Add a new chip in the same `.task-passive-row`, immediately AFTER the `isToday` chip and BEFORE the `isVital` chip, so order reads: your-signal, angel-signal, fact.

Trigger: `task.angelPinned`. Tooltip: `task.angelReason` when present.

Add to the copy object in `src/TaskColumn.js` (near `today`/`critical`, ~line 318):
```js
angelQuest: isEnglish ? "angel's quest" : "квест ангела",
```
Insert the chip (after the `isToday` line, before the `isVital` line):
```jsx
{task.angelPinned && (
  <span
    className="task-passive-chip angel-pick-chip"
    title={task.angelReason || undefined}
  >
    🎯 {copy.angelQuest}
  </span>
)}
```
Add to `src/TaskColumn.css`:
```css
.task-passive-chip.angel-pick-chip {
  border-color: rgba(55, 138, 221, 0.45);
  color: #0C447C;
  background: rgba(230, 241, 251, 0.92);
}
```
Verification note for Codex: confirm `task.angelPinned` (and `angelReason`) are present on the task objects `TaskColumn` receives in the authenticated app. They are stored on canonical task docs and synced by the engine. If `angelPinned` is not reliably populated on the client task object, STOP and ask before switching the trigger to a `plannerMeta.daily_decision.missionTaskId` comparison — do not invent a new client data path.

## Change 3 — rename + re-theme the mission panel kicker (`src/TodayMissionPanel.js` + `src/App.css`)

The kicker must stop saying "today" and must read as the angel's choice, in the cool/blue family, localized.

In `src/TodayMissionPanel.js`, add to the `copy` object:
```js
kicker: isEnglish ? "angel's quest" : "ангел держит квест",
```
Replace line 48:
```jsx
<div className="daily-pulse-kicker">today mission</div>
```
with:
```jsx
<div className="daily-pulse-kicker">🎯 {copy.kicker}</div>
```
Re-theme the kicker color in `src/App.css` (`.daily-pulse-kicker`, ~line 177) from the current red `#fca5a5` to the cool family:
```css
color: #85B7EB;
```
Leave `letter-spacing`, `text-transform`, `font-size`, `margin` unchanged. Leave the `🧭 {missionReasonLabel}` reason chip unchanged — it stays as the "why" line.

## Change 4 — demo kicker consistency (`src/apus/ApusTodayMission.js` + `src/demoI18n.js`)

Approved by Val 2026-06-11 ("трогай"). The public `/demo` portfolio shell must not say "today mission" while the real app says "angel's quest" — that is incoherent for a portfolio. Text-only change; do NOT re-color the kicker.

`.apus-section-kicker` is SHARED with `ApusStatusBar.js` ("planner status"), so its color must stay untouched — the warm parchment Apus aesthetic does not take the app's blue. Only change the mission kicker text, matching the component's existing `isEnglish` pattern.

In `src/apus/ApusTodayMission.js`, replace:
```jsx
<div className="apus-section-kicker">today mission</div>
```
with:
```jsx
<div className="apus-section-kicker">🎯 {isEnglish ? "angel's quest" : "ангел держит квест"}</div>
```
In `src/demoI18n.js`, the dead `["today mission", "today mission"]` entry becomes the RU→EN mapping for the new text-node:
```js
["ангел держит квест", "angel's quest"],
```

## Out of scope — do not touch without Val's explicit approval

- No change to `isToday` selection semantics, mission selection, daily-decision logic, or any `api/` code.
- No new emoji beyond `🎯`. No change to `🪽`, `🧭`, `🚨`, `📅`, `☀️`.

## i18n

Both EN and RU strings are specified above. Do not ship an English-only kicker (the current bug). RU: `квест ангела` (card chip), `ангел держит квест` (panel kicker).

## Acceptance criteria

- On the board, a task with `angelPinned` shows a blue `🎯 квест ангела` chip; a task the user pinned shows a warm amber `☀️ сегодня` chip; the two are visually distinct at a glance.
- The mission panel kicker reads `🎯 ангел держит квест` (RU) / `🎯 angel's quest` (EN) in blue, never "today mission".
- `angelReason` appears as the hover tooltip on the angel-pick chip when present.
- No console errors. `DISABLE_ESLINT_PLUGIN=true npm run build` passes. `npm run verify:server` and `npm run test:contract` still pass (no server change expected).
- `/demo` is visually unchanged.

## Review hand-back

Leave changes uncommitted. Claude reviews the diff against this spec, then commits. Flag any deviation (e.g. if `angelPinned` was not available client-side) before implementing a workaround.
