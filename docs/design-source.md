# Design source

Current external design source:

The `adhd planer design` handoff folder lives outside this repository. It contains the Cursor/Claude design work and should be treated as the visual source of truth for the next UI pass.

Key files:
- `adhd-planner-rebuild-spec.md` — implementation/spec notes for rebuilding the UI.
- `style-guide-2026.html` — visual style guide.
- `main-apus.html` — main planner direction.
- `main-apus-drawer.html` — drawer/detail exploration.
- `rescue-apus.html` — rescue / anti-freeze screen.
- `angel-lab-apus.html` — Angel Lab design direction.
- `adhd-planner-app.html` — app-level page concept.
- `adhd-planner-board-v2.html` — board concept.
- `adhd-planner-paradise.html` — heaven/paradise screen.
- `adhd-planner-cemetery.html` — cemetery screen.
- `adhd-planner-progress.html` — progress screen.
- `adhd-planner-settings.html` — settings screen.
- `adhd-planner-onboarding.html` — onboarding screen.
- `apus-assets/` — angel/devil/mascot assets.

Implementation rule:
- Do not copy the HTML into production directly.
- Port the design into existing React components in small steps.
- Preserve current product logic:
  - Today Mission opens Rescue.
  - Planner Status Bar owns global filters.
  - Kanban remains active/heaven/cemetery/progress.
  - Task details currently expand in-card.
  - Angel Lab remains a confirmed-draft flow.

Recommended port order:
1. Main shell and visual tokens from `main-apus.html` / `style-guide-2026.html`.
2. Today Mission + Planner Status Bar.
3. Task card visual style.
4. Rescue overlay from `rescue-apus.html`.
5. Angel Lab from `angel-lab-apus.html`.
6. Heaven / Cemetery / Progress screens.
7. Onboarding and Settings.
