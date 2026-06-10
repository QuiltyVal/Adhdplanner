# MCP Live Smoke Checklist

Use this checklist before treating the live Hetzner MCP path as verified.

This is a real-client smoke, not a repo unit test. Older already-open Codex sessions may not refresh their callable ADHD Planner MCP tools, so final proof should come from a fresh MCP client that is actually connected to `https://mcp.valquilty.com/mcp`.

## Current Status

Already covered repo-side:

- `add_subtask` request validation requires both `taskRef` and `subtaskText`;
- route-to-command mapping emits `TASK_ADD_SUBTASK`;
- subtask-add events expose `payload.extra.createdSubtask`;
- local command service updates the task through the canonical command path;
- fake-transaction coverage now exercises `runPlannerCommand(TASK_ADD_SUBTASK)` end to end for canonical task mutation, `lastUpdated`, event trace, title index, Telegram context, and duplicate noop behavior;
- `/api/captures` preserves `origin.channel: "mcp"` for `source=mcp...` capture intake;
- repo/API contract coverage proves non-dry-run `source=mcp...` capture requests call append-only capture storage with MCP origin metadata and process the stored capture;
- repo-side MCP server source now includes a `capture_note` tool that calls the already-verified captures API path with `dry_run` defaulting to `true`;
- `capture_note` request construction is covered by mocked-fetch tests in `tests/mcp-capture-client.test.mjs` without live Firestore reads or writes;
- `npm run check:mcp` verifies the public MCP auth boundary without credentials: live endpoint returns Bearer `401`, advertises scope `mcp:tools`, and serves OAuth protected-resource metadata for `ADHD Planner MCP`.
- `npm run check:qa-packet` validates copied web QA packets and diffs baseline/post-write/post-refresh packets locally, without network or Firestore access.

Live client evidence:

- 2026-06-07: a fresh post-OAuth Codex thread exposed callable `mcp__adhd_planner` tools and completed the controlled disposable task smoke:
  - baseline `get_tasks`: `count=61`, `score=511`, no exact QA task present;
  - `add_task`: created `QA MCP smoke — delete after test`, id `d56aa293-4768-4c4b-bb30-d186bf9bdfe0`;
  - `add_subtask`: added `QA MCP subtask write — delete after test`, id `50fd06a6-d1e9-4656-b876-e5da1330c729`;
  - verification `get_tasks`: `count=62`, exact QA task and subtask present;
  - `delete_task`: removed only the QA task;
  - final `get_tasks`: `count=61`, `score=511`, exact QA task absent.
- No non-QA task was touched, and cleanup completed.
- 2026-06-08: production `/api/captures` dry-run smoke passed for `source=mcp:live-smoke`: response returned `dryRun: true`, `origin.channel: "mcp"`, `origin.via: "captures_api"`, `origin.source: "mcp:live-smoke"`, `activeTasksSource: "none"`, and `activeTasksCount: 0`.
- 2026-06-10: authenticated MCP/web refresh smoke passed:
  - baseline web QA packet: `active=8`, `taskDataFingerprint=972e7261`, `liveQaReady=yes`;
  - MCP client ran `capture_note`, `get_tasks`, `add_task`, `add_subtask`, and `delete_task` on only the disposable QA task;
  - post-write web QA packet: `active=9`, `taskDataFingerprint=c6faf840`, latest task `QA MCP smoke — delete after test`, latest subtask `QA MCP subtask write — delete after test`;
  - hard-refresh web QA packet kept `taskDataFingerprint=c6faf840`, proving the MCP write did not bounce after refresh;
  - cleanup returned MCP task count `62 -> 61`, confirmed QA task ref `ab3825f0` absent, and web task-data fields returned to baseline fingerprint `972e7261`.

Still remaining:

- non-dry-run `capture_note` remains intentionally untested;
- destructive Yes/Cemetery on a real task remains outside safe smoke;
- Google Calendar OAuth completion remains a separate live smoke.

Codex can keep strengthening repo-side contracts without touching live data. The authenticated MCP task/subtask write, web hard-refresh persistence, cleanup, and dry-run capture-note paths are now proven.

## Preconditions

- Confirm `https://planner.valquilty.com` returns HTTP 200.
- Run `npm run check:mcp` and confirm `ok: true` before debugging any MCP client issue. This only proves reachability/auth metadata, not tool execution.
- If the MCP client is Codex Desktop, run `npm run check:codex-mcp` and confirm the Planner MCP server URL is present in `~/.codex/config.toml`; setup notes live in [codex-mcp-setup.md](codex-mcp-setup.md).
- For Codex Desktop, `npm run check:mcp-readiness` combines endpoint health and Codex config registration into one read-only readiness report.
- If `codex_config` is missing, `npm run setup:codex-mcp` previews the config entry and `npm run setup:codex-mcp -- --apply` appends it.
- Confirm the MCP client is connected to the real planner server: `https://mcp.valquilty.com/mcp`.
- Prefer running `npm run backup:planner -- --userId <uid> --dry-run` first to confirm backup scope.
- If credentials are available and the test is risky, run the real read-only backup before mutating anything.
- Save copied web QA packets as local text files when using packet evidence. For example:
  - `qa-before.txt`
  - `qa-after-mcp-write.txt`
  - `qa-after-refresh.txt`
- Keep the filenames aligned with capture order. `npm run check:qa-packet` now fails if the `--after` packet's `capturedAt` is not newer than `--before`, which catches swapped files or accidentally comparing a packet with itself.
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
- A local packet diff passes:
  - `npm run check:qa-packet -- --before qa-before.txt --after qa-after-mcp-write.txt --expectTaskTitle "QA MCP smoke" --expectSubtaskPreview "QA MCP subtask write"`
  - after hard refresh: `npm run check:qa-packet -- --before qa-after-mcp-write.txt --after qa-after-refresh.txt --expectStable`
  - if no Engine/Telegram action ran between the two packet captures, add `--expectDecisionStable` to prove the visible decision trace did not change across refresh.
- In the JSON report, `comparison.capturedAtOrder` is `after_is_newer`.

Cleanup:

- Delete the QA subtask or delete/complete the disposable QA task through the normal UI.
- Confirm the cleanup is visible in the web app.

Stop if:

- MCP writes to the wrong task;
- MCP creates a new task instead of adding a subtask;
- the web app briefly shows the subtask and then loses it;
- the live server appears to read the legacy root task array.

## Optional Capture Smoke

Only run this after the subtask write smoke passes. The MCP server source has a `capture_note` tool; use dry-run first.

Action:

- From the MCP client, call `capture_note` with:
  - `text: "MCP live-smoke dry run: verify capture tool origin only"`
  - `dry_run: true`
  - `source_label: "live-smoke"`
- By default, dry-run capture intake does not read live Firestore tasks. Pass an explicit task snapshot as `activeTasks`, or intentionally set `includeLiveTasks: true` if the test needs live task context.

Expected:

- Response includes `dryRun: true`.
- Response includes `origin.channel: mcp`.
- Response includes `activeTasksSource: "none"` for a pure no-live-read dry run, `activeTasksSource: "request"` when a task snapshot was supplied, or `activeTasksSource: "live"` only when `includeLiveTasks: true` was intentional.
- No Firestore write is required for this dry-run.

Current evidence:

- 2026-06-08: production dry-run API smoke passed with `source=mcp:live-smoke`, `origin.channel: "mcp"`, and `activeTasksSource: "none"`. This verifies the capture API origin path, not a dedicated Hetzner MCP capture tool.
- 2026-06-08: live Hetzner MCP source now contains `capture_note` with `dry_run` defaulting to `true` and `idempotency_key` required for `dry_run=false`. `/healthz` and `/mcp` auth-boundary checks passed after deploy. Authenticated dry-run MCP tool-call smoke passed on 2026-06-10; non-dry-run capture remains intentionally untested.

## Evidence To Record

Record:

- commit hash and production deployment id;
- MCP client used;
- read-only task-list result or screenshot;
- mutation request text;
- MCP success result;
- web screenshot or QA packet showing the subtask;
- if using a QA packet for web proof, keep `taskDataFingerprint`, `latestTaskUpdatedAt`, `latestTaskUpdatedTitle`, `latestTaskUpdatedSubtasks`, and `latestTaskUpdatedSubtaskPreview`;
- for decision visibility proof, keep `decisionTraceFingerprint` and `decisionTraceRows`;
- if using packet files, keep the `npm run check:qa-packet` JSON report or paste its `ok`, `comparison`, and `safety` fields into the log;
- cleanup evidence;
- any anomaly or mismatch.

## Pass Criteria

The MCP live smoke passes when:

- the real MCP client reads current canonical tasks;
- one disposable subtask write appears in the web app and remains stable after refresh/bootstrap;
- cleanup is completed;
- no important live task is mutated;
- evidence is logged in `AGENT_LOG.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md`.
