# Design port plan — 2026-04-24

Source:

External `adhd planer design` handoff folder outside this repository.

Goal:

Port the new Apus/Cursor design into the current React app without breaking the working planner logic.

## Current product logic to preserve

- Today Mission is a compact summary.
- Clicking Today Mission opens Rescue / `Я застряла`.
- Planner Status Bar owns global metrics and filters.
- Kanban remains the core structure: active / heaven / cemetery / progress.
- Task details currently expand in-card.
- Angel Lab remains a brain-dump-to-confirmed-draft flow.
- Google Calendar scheduling works through the server OAuth path.

## Design direction from the source package

The selected visual direction is:

- `Paper Tamagotchi` / `Apus`
- warm cream background
- editorial serif for emotional copy
- rounded white cards
- mono labels
- pixel accents used sparingly
- angel/devil mascots as brand and state guides
- mobile-first layout

Key references:

- `manifest-apus.html` — primary brand/design manifesto and base tokens.
- `main-apus.html` — main planner shell, Today Mission, status bar, compact task cards.
- `rescue-apus.html` — Rescue screen.
- `mascots/` — primary mascot image folder.
- `apus-assets/` — angel/devil mascot assets.

Secondary references:

- `style-guide-2026.html` — wider visual experiments and theme variants.
- `angel-lab-apus.html` — Angel Lab redesign.
- `main-apus-drawer.html` — task detail/drawer exploration, not a final product decision.

## Primary tokens from `manifest-apus.html`

Colors:

- `--cream: #FAF5EA`
- `--cream-warm: #F3E8D0`
- `--cream-deep: #E8DBBD`
- `--ink: #2A241E`
- `--ink-soft: #6B5E4F`
- `--ink-muted: #A59680`
- `--halo: #F7D742`
- `--halo-deep: #E8B624`
- `--blush: #FFA8BE`
- `--blush-soft: #FFD5DE`
- `--night: #1F1C1A`
- `--night-warm: #2E2825`
- `--ember: #E8402E`
- `--spark: #FF8A3D`

Typography:

- Sans: `Nunito`
- Emotional serif: `Instrument Serif`
- Pixel accent: `Press Start 2P`
- System mono labels: `JetBrains Mono`

Shape/motion:

- rounded cards: `18px`, `28px`, `36px`
- soft warm shadows
- subtle breathing/float motion for mascots
- pixel font only as accent, not as the main body font

Product tone:

- warm, embodied, slightly absurd, not corporate
- mascot-guided but not noisy
- emotionally supportive without hiding the system logic
- mobile-first

## Important mismatch to avoid

The design spec still mentions some old ideas:

- Fog as a separate mode.
- Mission action column with multiple actions.
- Panic Mode with many buttons.
- Drawer as a possible task detail pattern.

Current product decision overrides those:

- no separate Fog entry;
- no mission action column;
- no extra Today Mission buttons;
- no drawer as primary task detail for desktop;
- task detail stays in-card unless we explicitly decide otherwise later.

## Port order

### Phase 1 — visual tokens only

Files likely touched:

- `src/App.css`
- `src/TaskColumn.css`

Work:

- Add Apus color tokens.
- Add typography tokens.
- Add card/button radius and shadow tokens.
- Keep existing class names where possible.
- Do not change task behavior.

Risk:

- low.

### Phase 2 — app shell

Files likely touched:

- `src/App.js`
- `src/App.css`
- `src/PlannerStatusBar.js`
- `src/TodayMissionPanel.js`

Work:

- Apply warm paper background.
- Update header visual hierarchy.
- Restyle Planner Status Bar using `main-apus.html`.
- Restyle Today Mission as a compact card.
- Preserve click-on-card => Rescue.

Risk:

- medium, because status filters must still scroll/filter correctly.

### Phase 3 — task cards

Files likely touched:

- `src/TaskColumn.js`
- `src/TaskColumn.css`

Work:

- Port compact task card style.
- Keep `...` expansion behavior.
- Keep existing task actions, but visually separate summary from tuning.
- Keep calendar scheduling.
- Keep cemetery action in the expanded details/danger zone.

Risk:

- medium-high, because task cards have most mutation logic.

### Phase 4 — Rescue

Files likely touched:

- `src/RescueOverlay.js`
- `src/App.css` or dedicated CSS if created

Work:

- Port mood from `rescue-apus.html`.
- Use one task, one microstep.
- Keep current Rescue state and actions.
- Do not add new panic/fog branches.

Risk:

- medium.

### Phase 5 — Angel Lab

Files likely touched:

- `src/App.js`
- `src/App.css`
- maybe extract `AngelLab` component later

Work:

- Port layout from `angel-lab-apus.html`.
- Keep server-authoritative taskCards.
- Keep user confirmation before applying.
- Do not reintroduce auto-merge-on-save.

Risk:

- high, because Angel Lab was fragile and is now stable enough.

### Phase 6 — secondary screens

Files likely touched:

- Heaven / Cemetery / Progress sections in `src/App.js`
- CSS files

Work:

- Port visual language for paradise/cemetery/progress.
- Keep existing data states.

Risk:

- low-medium.

## Recommended next implementation step

Start with Phase 1 + a small part of Phase 2:

1. Add visual tokens.
2. Restyle only:
   - page background;
   - header;
   - Planner Status Bar;
   - Today Mission.
3. Do not touch TaskColumn yet.

Reason:

This gives the app the new visual direction quickly, while keeping the riskiest logic untouched.

## Acceptance for first pass

- The app still loads.
- Today Mission click still opens Rescue.
- Status filters still filter/scroll to Kanban.
- Angel Lab still opens from status/header entry.
- Task expansion still works as before.
- Calendar still works.
