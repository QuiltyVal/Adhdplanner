# Apus architecture plan

Goal:

Implement the Cursor/Apus design as a real React layout, not as CSS overrides on the old DOM.

Design source:

- external `adhd planer design/manifest-apus.html`
- external `adhd planer design/main-apus.html`
- external `adhd planer design/rescue-apus.html`
- external `adhd planer design/mascots`
- external `adhd planer design/apus-assets`

## Problem with the failed attempt

The failed second pass tried to force `main-apus.html` onto the current app using CSS overrides.

That broke composition because:

- the Apus mockup has a different DOM/layout structure;
- it is mobile-first with a narrow shell;
- the current app is desktop-first with a wide kanban;
- the mockup header/status/mission/kanban are one composition;
- the current app renders them as separate old components;
- mascot positions depend on the new layout, not the old one.

Conclusion:

Do not keep trying to make the old DOM look like the Apus mockup with more CSS.

## Required architecture

Add a new layout layer:

```txt
App.js
  derives data and owns mutations
  passes view model + callbacks into:

ApusPlannerShell
  renders Apus layout using real data
  does not own task mutations

TaskColumn
  remains current task list implementation at first
```

## Component structure

Create:

- `src/apus/ApusPlannerShell.js`
- `src/apus/ApusHeader.js`
- `src/apus/ApusStatusBar.js`
- `src/apus/ApusTodayMission.js`
- `src/apus/ApusMascots.js`
- `src/apus/ApusShell.css`

Later:

- `src/apus/ApusTaskCard.js`
- `src/apus/ApusRescueOverlay.js`
- `src/apus/ApusAngelLab.js`

## First Apus shell contract

`ApusPlannerShell` receives:

```ts
{
  user,
  theme,
  score,
  calendarConnected,
  calendarToken,
  activeTab,
  activeFilter,
  stats: {
    streak,
    todayActions,
    tasksInDanger,
    activeTasksCount,
    todayPinnedCount,
    completedTasksCount,
    deadTasksCount
  },
  mission: {
    task,
    copy,
    reasonLabel,
    deadline,
    vitalLabel,
    urgencyLabel,
    resistanceLabel
  },
  handlers: {
    toggleTheme,
    connectCalendar,
    openProgress,
    filterActive,
    openAngelLab,
    openRescue,
    switchTab
  },
  children
}
```

`children` is the current kanban/tabs/content area from `App.js`.

This means Apus shell controls only layout and presentation.

## Rollback strategy

Keep old components available:

- `PlannerStatusBar`
- `TodayMissionPanel`
- current header markup

Add one local feature constant:

```js
const USE_APUS_SHELL = true;
```

Render:

```jsx
{USE_APUS_SHELL ? (
  <ApusPlannerShell ...>
    {mainPlannerContent}
  </ApusPlannerShell>
) : (
  oldHeaderStatusMissionAndContent
)}
```

Rollback becomes:

```js
const USE_APUS_SHELL = false;
```

No file deletion required.

## Implementation phases

### Phase 1 — Shell only

Goal:

Make the top-level layout structurally match `main-apus.html`.

Includes:

- Apus header
- Apus status bar
- Apus Today Mission
- Apus mascots
- current tabs/TaskColumn rendered below as children

Does not include:

- rewriting TaskColumn
- changing Angel Lab
- changing Rescue logic
- changing calendar logic
- changing task mutations

Acceptance:

- page loads;
- Today Mission opens Rescue;
- status filters still work;
- Angel Lab opens;
- tabs still switch;
- task expansion still works.

### Phase 2 — Task cards

Goal:

Port compact task card visual structure from `main-apus.html`.

Must preserve:

- in-card expansion;
- subtasks;
- calendar;
- urgency/resistance/deadline;
- cemetery/danger zone;
- completion/reopen/delete behavior.

### Phase 3 — Rescue

Goal:

Port `rescue-apus.html` into current `RescueOverlay`.

Must preserve:

- one task;
- one microstep;
- 2-minute sprint;
- `Сдвиг есть`;
- `Готово`;
- close without mutation.

### Phase 4 — Angel Lab

Goal:

Port `angel-lab-apus.html`.

Must preserve:

- server-authoritative cards;
- no auto-apply on save;
- user confirmation before applying;
- no client-side reclassification.

## Do not do

- Do not use CSS overrides to force the old layout into Apus.
- Do not add fixed mascots outside the shell composition.
- Do not narrow the whole desktop app to `460px`.
- Do not remove the kanban.
- Do not reintroduce Fog as a separate mode.
- Do not make Today Mission show multiple action buttons.
- Do not make drawer the default task detail pattern.

## Recommended next coding task

Implement Phase 1 only:

1. Create `src/apus/` components.
2. Move top-level render into a `mainPlannerContent` variable inside `App.js`.
3. Render `mainPlannerContent` inside `ApusPlannerShell`.
4. Keep old path behind `USE_APUS_SHELL = false`.
5. Deploy and compare.
