# MCP Live Smoke Checklist

Use this checklist before treating the live Hetzner MCP path as verified.

This is a real-client smoke, not a repo unit test. The current Codex session may not have a callable ADHD Planner MCP tool, so final proof must come from the MCP client that is actually connected to `https://mcp.valquilty.com/mcp`.

## Current Status

Already covered repo-side:

- `add_subtask` request validation requires both `taskRef` and `subtaskText`;
- route-to-command mapping emits `TASK_ADD_SUBTASK`;
- subtask-add events expose `payload.extra.createdSubtask`;
- local command service updates the task through the canonical command path;
- fake-transaction coverage now exercises `runPlannerCommand(TASK_ADD_SUBTASK)` end to end for canonical task mutation, `lastUpdated`, event trace, title index, Telegram context, and duplicate noop behavior;
- `/api/captures` preserves `origin.channel: "mcp"` for `source=mcp...` capture intake;
- `npm run check:mcp` verifies the public MCP auth boundary without credentials: live endpoint returns Bearer `401`, advertises scope `mcp:tools`, and serves OAuth protected-resource metadata for `ADHD Planner MCP`.

Still remaining:

- prove the live Hetzner MCP server can add a subtask to the canonical `Users/{uid}/tasks` collection;
- prove the web app sees that MCP write after refresh/bootstrap;
- prove the task does not disappear or bounce because of stale local/web state;
- optionally prove MCP-origin capture intake with `source=mcp...` reaches the expected origin metadata.

Codex can keep strengthening repo-side contracts without touching live data. Final proof still requires a real connected MCP client because the Hetzner MCP server is deployed separately from this repository.

## Preconditions

- Confirm `https://planner.valquilty.com` returns HTTP 200.
- Run `npm run check:mcp` and confirm `ok: true` before debugging any MCP client issue. This only proves reachability/auth metadata, not tool execution.
- Confirm the MCP client is connected to the real planner server: `https://mcp.valquilty.com/mcp`.
- Prefer running `npm run backup:planner -- --userId <uid> --dry-run` first to confirm backup scope.
- If credentials are available and the test is risky, run the real read-only backup before mutating anything.
- Use one deliberately disposable active task, for example `QA MCP smoke — delete after test`.
- Do not use an important live task for the first mutation smoke.

## Read-Only Smoke

Action:

- From the MCP client, list or fetch active planner tasks.

Expected:

- The result uses current `Users/{uid}/tasks` data, not the legacy root `Users/{uid}.tasks` array.
- The task list includes the disposable QA task if it already exists.
- No task status, subtask, deadline, or priority changes during this read-only step.

## Controlled Mutation Smoke

Action:

- From the MCP client, add exactly one subtask to the disposable QA task:
  - task: `QA MCP smoke — delete after test`
  - subtask: `QA MCP subtask write — delete after test`

Expected:

- MCP reports success.
- Web app refresh/bootstrap shows the subtask on the same task.
- The subtask has a stable id and text.
- The task `lastUpdated` changes.
- No duplicate task is created.
- No unrelated task receives the subtask.

Cleanup:

- Delete the QA subtask or delete/complete the disposable QA task through the normal UI.
- Confirm the cleanup is visible in the web app.

Stop if:

- MCP writes to the wrong task;
- MCP creates a new task instead of adding a subtask;
- the web app briefly shows the subtask and then loses it;
- the live server appears to read the legacy root task array.

## Optional Capture Smoke

Only run this after the subtask write smoke passes.

Action:

- From the MCP client or an authorized API path, submit a dry-run capture with `source=mcp:live-smoke`.
- By default, dry-run capture intake does not read live Firestore tasks. Pass an explicit task snapshot as `activeTasks`, or intentionally set `includeLiveTasks: true` if the test needs live task context.

Expected:

- Response includes `dryRun: true`.
- Response includes `origin.channel: mcp`.
- Response includes `activeTasksSource: "none"` for a pure no-live-read dry run, `activeTasksSource: "request"` when a task snapshot was supplied, or `activeTasksSource: "live"` only when `includeLiveTasks: true` was intentional.
- No Firestore write is required for this dry-run.

## Evidence To Record

Record:

- commit hash and production deployment id;
- MCP client used;
- read-only task-list result or screenshot;
- mutation request text;
- MCP success result;
- web screenshot or QA packet showing the subtask;
- cleanup evidence;
- any anomaly or mismatch.

## Pass Criteria

The MCP live smoke passes when:

- the real MCP client reads current canonical tasks;
- one disposable subtask write appears in the web app and remains stable after refresh/bootstrap;
- cleanup is completed;
- no important live task is mutated;
- evidence is logged in `AGENT_LOG.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md`.
