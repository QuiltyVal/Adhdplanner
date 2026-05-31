# ADHD Planner UI Logic Spec

Status: agreed baseline
Date: 2026-04-20

## Core rule

The core planner surface stays a kanban with the original zones:

- Active
- Passive
- Purgatory
- Cemetery / Hell
- Heaven

This is not being replaced.

The refactor changes only the control layers around the kanban so the interface stops mixing:

- mission summary
- rescue / anti-freeze flow
- task tuning
- planner-wide counters and filters

## Product entities

### 1. Today Mission

Today Mission is a read-only summary of the selected main task for now.

It may show:

- task title
- short reason why this task was selected
- first open microstep
- subtask progress
- task-local passive chips:
  - deadline
  - critical / vital
  - urgency
  - resistance

It must not contain planner-wide counters.

It has exactly 2 explicit CTAs:

- `Я застряла`
- `Настроить`

The whole block must not behave like one giant button.

### 2. Planner Status Bar

Planner Status Bar is global planner state, not mission state.

It holds planner-wide counters and filters such as:

- streak
- actions today
- danger / on-edge count
- active count
- today count
- heaven count
- cemetery count

Rules:

- display badges stay display-only
- filters are clickable only as filters/navigation
- counters must not mutate tasks
- status bar must live outside Today Mission

### 3. Rescue Session

Rescue Session is the anti-freeze flow for `Я застряла`.

It is a temporary overlay / focused flow, not a permanent planner mode.

It shows:

- one task
- one microstep
- one primary action at a time

Typical actions:

- `▶ 2 минуты`
- `✅ Сдвиг есть`
- `☑ Готово`
- `Шаг не ясен`

It must not show:

- planner-wide counters
- full task tuning
- calendar planning
- dangerous actions

### 4. Task Tuning

Task Tuning is manual configuration of one concrete task.

Target UI pattern:

- desktop: drawer
- mobile: bottom sheet

Task tuning owns:

- today pin
- critical / vital
- urgency
- resistance
- deadline
- calendar scheduling
- full subtask management
- cemetery / delete danger zone

Task tuning must open by `taskId`, never by random scroll.

## Separation rules

### What stays in kanban cards

Task cards remain part of the kanban.

They should stay compact in default view and may show:

- title
- first open microstep
- progress
- passive chips
- `…` / gear to open tuning
- optional done action

### What leaves the default task card

These controls should move out of the default noisy card surface:

- today toggle
- critical toggle
- urgency select
- resistance select
- deadline input
- calendar controls
- full subtasks editor
- long timer controls
- cemetery / dangerous actions

## Source-of-truth rules

### Today Mission

Today Mission is a selected task summary derived from the mission resolver.

### Rescue target

Rescue target is fixed at the moment Rescue Session opens.

It may equal Today Mission, but does not have to.

### Task tuning target

Task tuning always edits one explicit `taskId`.

## Explicit non-goals

This refactor does not remove:

- the kanban model
- active / passive / purgatory / cemetery / heaven
- Telegram support
- angel-based prioritization

## Delivery phases

### Phase 1

Do only IA cleanup and façade changes:

- split Today Mission from planner-wide counters
- stop making the whole mission block clickable
- remove fake tuning behavior that only scrolls
- keep existing business logic where possible
- preserve current kanban

### Phase 2

Do deeper logic unification:

- shared mission resolver
- formal rescue session state
- real task tuning drawer
- cleanup of old fog / panic naming and duplicate entry points

## Working principle for future edits

If a control is being added or moved, first classify it as exactly one of:

- display only
- filter
- navigation
- action
- dangerous action

If that classification is unclear, do not implement the control yet.
