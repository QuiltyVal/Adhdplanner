# SESSION_HANDOFF.md

Last updated: 2026-06-09

This file exists so the project can survive context loss and switching between Codex, Claude, or another coding agent.

Companion file:
- `AGENT_LOG.md` = append-only short session log
- `EXECUTION_PLAN.md` = active execution tracker for the angel / memory roadmap

## Repo portability

- The repo is now meant to be used from both home and office machines.
- Living docs should use repo-relative links, not `/Users/<name>/...` paths.
- GitHub is the source of truth for code and docs.
- Firestore is the source of truth for live planner data.
- New machine bootstrap lives in `scripts/bootstrap-machine.sh`.
- Main-machine sync lives in `scripts/sync-local.sh`.
- Reference docs:
  - `MACHINE_SETUP.md`
  - `WORKFLOW.md`
  - `EXECUTION_PLAN.md`
  - `ANGEL_ARCHITECTURE.md`

## Angel memory groundwork

- As of 2026-04-15, the repo has a dedicated execution tracker in `EXECUTION_PLAN.md`.
- As of 2026-04-15, foundational storage boundaries for the angel layer are documented in `ANGEL_ARCHITECTURE.md`.
- As of 2026-04-15, Telegram plain-text intake creates append-only `Users/{uid}/captures/{captureId}` documents for open-ended text / new-task text before continuing normal intent handling.
- As of 2026-04-15, web planner intake also supports append-only captures via `POST /api/captures`, writing into the same `Users/{uid}/captures/{captureId}` schema.
- As of 2026-04-15, those Telegram captures are immediately post-processed by a first-pass heuristic extractor into:
  - `commitments`
  - `candidateTasks`
  - `facts`
- As of 2026-04-15, extracted commitments are upserted into `Users/{uid}/commitments/{commitmentId}` with durable memory fields like:
  - `kind`
  - `whyMatters`
  - `failureCost`
  - `pressureStyle`
  - `lastMentionedAt`
  - `lastTouchedAt`
  - `nextReviewAt`
- As of 2026-04-15, Telegram capture creation is idempotent by Telegram message/update identity, so webhook retries should not inflate commitment counters.
- As of 2026-04-15, the extractor no longer fabricates fallback commitments from arbitrary unmatched text.
- As of 2026-04-15, live plain-text Telegram now runs through `planner-agent-router -> telegram-task-memory -> planner-action-executor`, and that path attaches `lifeArea` and `commitmentIds` to canonical task docs.
- As of 2026-04-16/18, Telegram plain text, slash commands, and callback-button flows all execute through the shared `route -> planner-action-executor` path (transport-only handlers remain for `/start` and `/calendar`).
- As of 2026-04-18, first-party authenticated clients can use `POST /api/planner-client-actions` (Firebase bearer token) to run the same server-side planner actions, with optional returned planner state for mobile/web thin clients.
- As of 2026-04-18, server-to-server automation keeps using `POST /api/planner-actions` (secret auth), now backed by the same runtime helper as client actions.
- As of 2026-04-18, `POST /api/captures` now filters returned task suggestions against currently active planner tasks, so replaying/repeating extraction does not keep surfacing already-live duplicates.
- As of 2026-04-18, `processCapture` now also applies a conservative safe-upsert pass over existing active tasks for web capture flow, enriching hints (`urgency`, `resistance`, `isVital`, `deadlineAt`, `lifeArea`, `commitmentIds`) through `mutatePlanner` with stale-write protection.
- As of 2026-04-18, `/today` now can surface high-cost commitments that have no active linked next step for too long (`needsTaskIfSilentDays` rule).
- As of 2026-04-19, Angel Lab `create` cards auto-preselect up to 1-2 highest-confidence subtasks by default (beta); quick rollback switch is env `ANGEL_LAB_CREATE_AUTO_PRESELECT=0`.
- As of 2026-04-19, Angel Lab default mode is `simple` (brain-dump to new create-cards only, no merge logic); optional smart mode remains available via env `ANGEL_LAB_MODE=smart`.
- As of 2026-04-19, task schema now supports Phase-4 angel fields (`angelPinned`, `angelScore`, `angelReason`) and Telegram `/today` can display a short angel reason when current top task is angel-pinned.
- As of 2026-04-19, `/today` now also resolves/reuses daily angel decisions in `Users/{uid}/angelDecisions/{dateKey}` and syncs pin fields to active tasks before rendering digest.
- As of 2026-04-19, daily decision reuse has basic override refresh: if a hard-deadline active task is outside selection (`hard_deadline`) or selected pins became fewer than expected (`pin_gap`), day-decision is recalculated.
- As of 2026-05-31, the recovered big plan is reconciled in `EXECUTION_PLAN.md`. The plan is still the angel/memory roadmap, now aligned with later Planner Engine, public demo, Angel Entry, Quest Relation Director, Not Your Move, report/outbox, and Angel Lab draft-quality work.
- As of 2026-05-31, active mission/rescue decisions should be treated as Planner Engine projections in `plannerMeta`. `api/_lib/angel-decision-store.js` is legacy and should not receive new mission/rescue behavior.
- As of 2026-05-31, the next safest product slice is decision visibility and safety: show what the Engine/angel chose, why, when it changed, and whether it left an event/report/outbox/delivery trace before adding more autonomous pressure.
- As of 2026-05-31, Progress Decision Trace is the main user-facing decision/safety surface. Normal sessions show the compact decision explanation, a collapsed latest-engine-evidence section, and Decision Safety actions for creating a safety snapshot, jumping to backups, or opening the report log.
- As of 2026-06-01, Angel Lab draft cards have a non-mutating parse-repair action: `Fix parse` / `Исправить разбор` appends a focused correction prompt back into the dump textarea so bad extraction can be retried without creating a task.
- As of 2026-06-02, Angel Lab shows a post-add next-state strip when some draft cards were handled and others remain. It confirms added cards are already in the planner, shows the remaining count and next draft card, and keeps `Back to planner — draft stays here` near the top.
- As of 2026-06-02, partial Angel Lab draft sessions use one state-aware return action: before the first add it replaces the generic top `Back`, and after a card is handled it lives in the next-state strip. The older bottom exit action is hidden.
- As of 2026-06-02, closing Angel Lab after applying a draft focuses the applied task in the Active list and updates the planner status with `Added from Angel Lab`, `Updated from Angel Lab`, or `Already in planner`.
- As of 2026-06-02, that returned task highlight stays visible longer and the task-card badge names the Angel Lab outcome (`Added from Angel`, `Updated from Angel`, or `Already in planner`) instead of reusing the generic day-mission label.
- As of 2026-06-02, reopening Angel Lab with pending draft cards resumes that draft instead of resetting the visible draft context; added/skipped progress and the next-state panel remain visible, and demo text is not re-prefilled over the pending draft.
- As of 2026-06-01, `docs/live-angel-verification-checklist.md` is the manual live QA checklist for capture -> extraction -> Engine decision -> report/outbox -> delivery -> persistence -> recovery. Use it before treating new angel/delivery behavior as stable.
- As of 2026-06-02, Progress Decision Safety has `Copy QA baseline`, which copies or displays auth mode, user id, active/today/at-risk/action counts, outbox counts, mission, delivery, Engine decision count, report count, and visible event-log window. If it says `guest-or-local`, do not treat the run as authenticated live QA. `visibleHumanEvents` is a recent-window diagnostic, not a full append-only history total.
- As of 2026-06-02, Progress Decision Safety also has `Copy decision trace`, which copies or displays the current Decision Trace rows plus latest Engine decisions/inbox evidence without mutating planner state.
- As of 2026-06-03, Progress Decision Safety has `Copy QA packet` as the primary copy action. The separate baseline/trace buttons are still available, but only inside the secondary copy-options disclosure.
- As of 2026-06-03, `docs/live-angel-verification-checklist.md` also treats `Copy QA packet` as the primary live-QA evidence artifact and asks for starting/final packets instead of separate baseline-only notes.
- As of 2026-06-03, the first authenticated live Angel Lab verification pass created exactly one QA task (`active: 8 -> 9`, `actionsToday: 0 -> 1`) and then cleaned it up through normal UI (`active: 9 -> 8`, `actionsToday: 2`). Starting/add/cleanup packets all showed `liveQaReady: yes`, clean outbox counts, and fresh Engine ticks where expected.
- As of 2026-06-03, copied/latest Engine evidence labels the separate rescue snapshot as `Engine rescue target` / `Rescue-цель движка`, because Engine rescue pressure can target a cold task separately from the current mission.
- As of 2026-06-03, plain Kanban task creation no longer uses the generic task-highlight path. This prevents a newly typed task from auto-scrolling the board and showing the fallback `DAY MISSION` badge. Angel Lab create still uses its own `Added from Angel` focus label.
- As of 2026-06-03, the public demo and Apus shell share one language state. `/demo` still defaults to English on fresh load, but the user can switch to Russian for the session; onboarding `EN/RU`, Apus header `EN/RU`, `html lang`, and the Today Mission demo status now stay aligned. The demo DOM translator now stores/restores only genuinely translated source text so React-owned English/Russian labels do not get stuck.
- As of 2026-06-03, Google login uses Firebase redirect sign-in instead of popup sign-in, with `browserLocalPersistence` forced before redirect/result handling. The Codex in-app browser could navigate the popup flow into `telegrammadhd.firebaseapp.com/__/auth/handler` without an opener and leave the user on a blank callback page; redirect now returns to `/login` instead of staying white, but it still does not establish a cloud-authenticated session in that browser. Treat Codex in-app browser auth as blocked and use a normal Chrome/Safari session plus copied QA packet for authenticated live QA.
- As of 2026-06-03, the web bootstrap waits briefly for the matching Firebase auth user before calling `planner_bootstrap`; it no longer silently skips Engine/report refresh if `auth.currentUser` is not ready on the first render. QA packets now include `plannerBootstrapStatus` / `plannerBootstrapReason`, and `liveQaReady` is only `yes` after bootstrap/meta is actually ready.
- As of 2026-06-04, a user-provided authenticated production QA packet confirmed that bootstrap readiness fix: `plannerBootstrapStatus: success`, fresh Engine tick at `04 июн., 17:02`, `engineDecisions: 3`, `reportItems: 30`, and outbox pending/retry/dead/sending all zero.
- As of 2026-06-04, controlled authenticated smoke QA for Kanban add/delete and Angel Lab add/cleanup passed. Final packet kept `active: 7`, mission stable on `Выставить свитер Stone Island на продажу`, `plannerBootstrapStatus: success`, `engineDecisions: 3`, `reportItems: 30`, and outbox all zero.
- As of 2026-06-05, Telegram reply keyboards consistently include a web-app return path. Task, completed/restore, calendar connect, `/start`, and AI action confirmation keyboards expose `🌐 Open planner` using `PLANNER_WEB_URL` or the default `https://planner.valquilty.com`.
- As of 2026-06-05, user-provided live Telegram evidence confirmed scheduled nudge messages in Apusbot show the `🌐 Open planner` inline button below the task action buttons. This verifies the live nudge keyboard path; remaining command evidence is tracked in the smoke bullets below.
- As of 2026-06-05, user-provided live Telegram evidence confirmed `/completed` returns recent completed tasks and renders each visible card with both `↩️ Return to active` and `🌐 Open planner`. The user then tapped `↩️ Return to active` on `Добавить одну тестовую карточку для Angel Lab`, and the bot replied that the task `is active again` with the normal active task keyboard plus `🌐 Open planner`. The Telegram completed-to-active flow is live-smoke verified and the roadmap item is closed.
- As of 2026-06-06, user-provided live Telegram evidence confirmed `/today` renders the current focus digest and active task keyboard with `Done`, `Pin today`, `Critical`, `I'm stuck`, `Cemetery`, and `Open planner`. The same evidence confirmed `/calendar` returns the Google Calendar connect CTA in a real Telegram client. OAuth completion itself was not part of this smoke.
- As of 2026-06-06, `tests/planner-telegram-reopen-actions.test.mjs` covers repo-side Telegram restore execution: blank `reopen_task` restores the latest non-active completed/Cemetery task, explicit title refs restore the matching completed task, and returned active keyboards include `Open planner`. `/reopen` help text now says completed/Cemetery to match the actual executor behavior.
- As of 2026-06-05, task keyboards include a two-step `🪦 Cemetery` button. The first tap only sends the existing kill confirmation prompt (`Yes, Cemetery` / `Make smaller` / `Cancel` / `Open planner`); the task is moved to Cemetery only after `confirm_kill`.
- As of 2026-06-05, Telegram supports `/cemetery`, which lists recent dead/Cemetery tasks with `↩️ Return to active` and `🌐 Open planner`. The command is read-only until the user taps restore.
- As of 2026-06-06, user-provided live Telegram evidence confirmed the Cemetery bot path works correctly, including `/cemetery` and active-task `Cemetery -> Cancel`. Destructive `Yes, Cemetery` on a real task was intentionally not counted as part of the safe smoke unless explicitly tested later.
- As of 2026-06-06, the web active-card `To Cemetery` action also requires confirmation before calling `handleKill`. The browser confirmation explicitly says the task is moved out of Active but not deleted forever, and can be restored from Cemetery.
- As of 2026-06-06, Telegram help text lists `/calendar` in both `/start` and unknown-command responses. The calendar connect command itself already existed; this only makes the live-smoke path discoverable.
- As of 2026-06-06, Telegram has a read-only `/help` command that shows the smoke-relevant commands and `🌐 Open planner` without re-linking the chat or sending the `/start` diagnostic ping.
- As of 2026-06-07, repo coverage checks the `/start` connected response keeps command discovery and the `🌐 Open planner` return button.
- As of 2026-06-07, unknown slash-command responses also include `🌐 Open planner` and are covered in the read-only Telegram action tests.
- As of 2026-06-07, Telegram command error hints such as `/add` without text use the standard error response with `🌐 Open planner`.
- As of 2026-06-07, Telegram chat/fallback guidance responses also include `🌐 Open planner` and are covered as read-only action responses.
- As of 2026-06-07, AI-routed Done confirmation keyboards are covered so they require `confirm_done`, not direct `done`, and include Rescue, Cancel, and `🌐 Open planner`.
- As of 2026-06-07, direct task-card `done:<taskId>` callback routing is covered so the normal Telegram task button completes the task with task-card feedback and `callback_done` context.
- As of 2026-06-07, `confirm_done:<taskId>` callback routing is covered so the second tap becomes a normal completed-task mutation with confirmation feedback and `callback_confirm_done` context.
- As of 2026-06-06, `docs/telegram-live-smoke-checklist.md` is the canonical live Telegram client checklist for `/help`, `/today`, `/calendar`, `/cemetery`, completed restore, Cemetery confirmation/cancel, and `Open planner` evidence. It documents read-only commands separately from controlled mutation tests.
- As of 2026-06-06, `tests/planner-telegram-readonly-actions.test.mjs` covers repo-side Telegram read-only daily actions: `/today`, `/completed`, and `/cemetery` render expected keyboards with `Open planner`, and the test fails if those paths call the mutation command runner.
- As of 2026-06-06, empty `/completed` and empty `/cemetery` Telegram responses also include the `Open planner` keyboard. This keeps a read-only smoke pass useful even when there are no completed/dead tasks to list.
- As of 2026-06-06, `tests/telegram-webhook-security.test.mjs` also covers the webhook-level `/help` and `/calendar` response builders, including the `Open planner` button and the Google Calendar OAuth button. This is repo-side protection only; the user-provided Telegram screenshot confirms the `/calendar` connect CTA renders live, but OAuth completion is still unverified.
- As of 2026-06-06, Google Calendar OAuth state now validates user id shape and timestamp age before token exchange. The default state TTL is 2 hours, overrideable with `GOOGLE_OAUTH_STATE_TTL_MS`; fresh `/calendar` links should be used for live OAuth tests.
- As of 2026-06-07, `tests/google-calendar-callback.test.mjs` covers the Google Calendar callback route success redirect, missing refresh token redirect, expired/bad state error redirect, missing code/state, and non-GET handling with stubbed Google/Firebase calls. Real OAuth completion is still not live-tested.
- As of 2026-06-10, the same Google Calendar test file also covers `/api/google-calendar-status` method guard, missing `PLANNER_DEFAULT_USER_ID`, connected true/false JSON, and backend error JSON. Real OAuth completion is still not live-tested.
- As of 2026-06-06, `tests/telegram-webhook-security.test.mjs` also covers the Cemetery confirmation payload: task keyboards expose only `kill:<taskId>` on first tap, while the confirmation response exposes `confirm_kill`, `panic`, `cancel`, and `Open planner`. This guards the two-step destructive-action boundary repo-side.
- As of 2026-06-06, `tests/telegram-callback-cancel.test.mjs` covers the second half of that boundary: `cancel:<taskId>` resolves to no planner command/no mutation, while `confirm_kill:<taskId>` still resolves to `KILL_TASK`. Real Telegram-client `Cemetery -> Cancel` evidence is now user-confirmed.
- As of 2026-06-06, the repo has a read-only local Firestore export script: `npm run backup:planner`. It writes JSON to ignored `backups/` and documents usage in `docs/firestore-backup-export.md`. The script now supports `--dry-run`, validates user/collection path inputs, and has regression coverage that the dry-run works without Firebase credentials. No live export was run in this heartbeat.
- As of 2026-06-06, the backup script validates backup payloads before trusting them and supports `--verify-file backups/file.json --expectUserId <uid>` without reading Firestore. This catches broken JSON, wrong user ids, schema drift, invalid collection names, and bad document paths around the first live export.
- As of 2026-06-07, backup verification output includes `sizeBytes` and `fileSha256` for generated or verified files. First live export evidence should record the printed output path, total docs, and checksum before risky QA.
- As of 2026-06-07, `npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22 --dry-run` passed, confirming the default backup collection scope and ignored `backups/` output path without Firestore access. At that point the first real export was still pending.
- As of 2026-06-07, backup CLI output includes `safety` metadata: dry-runs report no Firestore read/write and no local file write, verify-file reports local read only, and real export reports Firestore read plus local file write but still `firestoreWrite: false`.
- As of 2026-06-07, `npm run backup:planner -- --userId <uid> --preflight` validates Firebase credential presence/shape without reading Firestore, writing Firestore, creating a local backup file, or printing credential values.
- As of 2026-06-08, backup preflight can load Firebase credentials from `--credentials-file`, `FIREBASE_CREDENTIALS_FILE`, or `GOOGLE_APPLICATION_CREDENTIALS`. The JSON report exposes only readiness booleans (`source`, `fileRequested`, `fileReadable`) and does not include credential values or file paths. No live Firestore export was run in this heartbeat.
- As of 2026-06-08, the first live read-only Firestore export was completed and verified for `U2geUdbvWyVRNLWnSZBnftOMSU22`. The ignored backup file is `backups/firestore-planner-U2geUdbvWyVRNLWnSZBnftOMSU22-2026-06-08T12-26-06-380Z.json`; verification reported `totalDocs: 6775`, `sizeBytes: 9800417`, SHA-256 `d2ff47895555905fa05694982abda800f0d8a123e217e193d499363a53eda13d`, `firestoreRead: true`, and `firestoreWrite: false`. Collection counts were: `tasks: 61`, `taskSnapshots: 87`, `captures: 124`, `commitments: 6`, `plannerEvents: 779`, `reportItems: 490`, `outbox: 104`, `engineRuns: 2438`, `outboxRuns: 1689`, `plannerCommands: 319`, `telegramLogs: 677`, and `angelDecisions: 1`.
- As of 2026-06-10, backup `--safety-check` supports `--minTotalDocs` and `--requireCollections`, so future risky QA can require both freshness and basic backup completeness before proceeding.
- As of 2026-06-08, the backup CLI has a non-mutating restore drill: `--restore-plan <backup.json> --expectUserId <uid>`. It reads only the local backup file, validates it, and reports planned root/collection document writes while keeping `firestoreRead: false`, `firestoreWrite: false`, and `restorePlanOnly: true`. The first live backup restore-plan passed against the backup above with `totalDocs: 6775`.
- As of 2026-06-08, the backup CLI has a local-only inventory mode: `--list-backups [dir] --expectUserId <uid>`. It reads local JSON files, validates each one, reports the latest trusted backup and checksums, flags invalid files, and does not read or write Firestore.
- As of 2026-06-09, the backup CLI also has `--restore-latest [dir] --expectUserId <uid>`. It picks the latest valid local backup from the inventory and builds the same non-mutating restore review artifact without reading or writing Firestore.
- As of 2026-06-09, the backup CLI also has `--safety-check [dir] --expectUserId <uid>`. It reads only local backup JSON files, verifies the latest trusted backup is within the configured freshness window, reports `readyForRiskyQa`, and does not read or write Firestore.
- As of 2026-06-10, the backup CLI also has `--compare-backups before.json after.json --expectUserId <uid>`. It reads only local backup JSON files, validates both, checks same user id, reports root/doc hash deltas and path-only previews for added/removed/changed documents, and does not read or write Firestore.
- As of 2026-06-06, single-task status mutation planner events now carry structured audit payloads with `previousStatus`, `nextStatus`, and `scoreDelta` when relevant. This improves destructive/status-change logging for Done, Cemetery, and reopen flows without changing task mutation semantics.
- As of 2026-06-07, subtask toggle planner events use the canonical event-type constant in both command-service emission and event-message rendering, with regression coverage. This keeps MCP/Telegram/web subtask activity traces consistent.
- As of 2026-06-06, the repo-side planner action contract has regression coverage for `add_subtask`: validation requires both `taskRef` and `subtaskText`, route-to-command mapping emits `TASK_ADD_SUBTASK`, and event payloads expose `extra.createdSubtask`. The local command service already updates `lastUpdated` for created subtasks. Live Hetzner MCP verification later passed on 2026-06-10.
- As of 2026-06-07, `tests/planner-command-service-subtask.test.mjs` covers the actual `runPlannerCommand(TASK_ADD_SUBTASK)` path with a fake Firestore transaction: task subtask append, `lastUpdated`, planner event trace, title index, Telegram context, and duplicate noop behavior. The related live Hetzner MCP verification later passed on 2026-06-10.
- As of 2026-06-07, `npm run check:mcp` checks the live public MCP auth boundary without credentials. The current run returned `ok: true`, HTTP `401`, Bearer auth, advertised `mcp:tools`, and OAuth protected-resource metadata for `ADHD Planner MCP`. This proves reachability/auth metadata only, not authenticated MCP task read/write.
- As of 2026-06-07, `npm run check:codex-mcp` checks whether Codex Desktop has the Planner MCP URL in `~/.codex/config.toml` without printing secrets. `docs/codex-mcp-setup.md` documents adding `[mcp_servers.adhd_planner]`, restarting/reloading Codex, and then running the real MCP smoke.
- As of 2026-06-07, `npm run check:mcp-readiness` combines the endpoint and Codex config checks into one read-only report. In the current environment this should show endpoint healthy but Codex config missing until `~/.codex/config.toml` is updated/reloaded.
- As of 2026-06-07, `npm run setup:codex-mcp` previews the exact Codex MCP config entry and only writes it with explicit `--apply`; it appends the URL entry only, not tokens/headers.
- As of 2026-06-08, MCP OAuth password rotation has a repo helper and server copy: `scripts/set-mcp-oauth-password.mjs` / `/root/adhd-mcp/set-mcp-oauth-password.mjs`. The helper updates only `passwordSalt` and `passwordHash`, backs up `auth-secrets.json`, preserves OAuth token secrets, and can restart PM2. A new password was generated and stored locally at `/Users/valquilty/.codex/adhd-mcp-oauth-password.txt` with mode `600`; the server-side one-time password file was deleted. Latest backup from this reset: `/root/adhd-mcp/auth-secrets.json.backup-20260608103812`.
- As of 2026-06-08, the live standalone Hetzner MCP server also has a normal known-password change route at `https://mcp.valquilty.com/change-password`. It requires an active MCP session, asks for current/new/confirm password, writes an `auth-secrets.json` backup, updates only `passwordSalt`/`passwordHash`, and does not require SSH. This is a live-only manual deployment in `/root/adhd-mcp/index.js`; server code backup: `/root/adhd-mcp/index.js.backup-change-password-20260608114600`.
- As of 2026-06-08, `services/mcp-server` mirrors the current live MCP source in git. The mirrored source removes the hardcoded live user id fallback and requires `FIRESTORE_DOCUMENT_ID` / `FIRESTORE_USER_ID`; live Hetzner already supplies that through PM2 env. `tests/mcp-server-source.test.mjs` guards source syntax, the `/change-password` route, and secret/live-user-id boundaries. Deployment is still manual until CI/deploy automation is added.
- As of 2026-06-08, `npm run deploy:mcp-server` is the controlled deploy helper for the MCP mirror. It is dry-run by default; `-- --apply` uploads only the MCP source files from `services/mcp-server/src`, checks syntax locally and remotely, backs up existing live source files, replaces them, restarts PM2 `adhd-mcp`, and verifies `/healthz` plus the `/mcp` Bearer auth boundary. It does not copy secrets or Firestore data.
- As of 2026-06-07, Codex CLI OAuth for `adhd_planner` is logged in. The MCP OAuth password on Hetzner was reset by updating only `passwordSalt` / `passwordHash` in `/root/adhd-mcp/auth-secrets.json`; backup: `/root/adhd-mcp/auth-secrets.backup-20260607200853.json`; PM2 process `adhd-mcp` was restarted. A brand-new post-OAuth Codex thread saw callable `mcp__adhd_planner` tools and read-only `get_tasks` returned `ok: true`, `documentExists: true`, `count: 61`, `score: 511`. Older already-open threads may still not refresh their tool namespace.
- As of 2026-06-07, that fresh post-OAuth Codex thread completed a controlled live MCP write smoke with no non-QA task touched: baseline `get_tasks` was `count: 61`, `score: 511`; `add_task` created `QA MCP smoke — delete after test` (`d56aa293-4768-4c4b-bb30-d186bf9bdfe0`); `add_subtask` added `QA MCP subtask write — delete after test` (`50fd06a6-d1e9-4656-b876-e5da1330c729`); verification `get_tasks` saw `count: 62` with the exact subtask; `delete_task` cleaned up the QA task; final `get_tasks` returned `count: 61`, `score: 511`, with the QA task absent. A separate web refresh/QA-packet proof later passed on 2026-06-10.
- As of 2026-06-06, `/api/captures` no longer marks every capture API write as web-origin. `source=mcp`, `source=mcp:*`, and Claude-MCP-like source strings produce `origin.channel: "mcp"`; `source=api:*` produces `origin.channel: "api"`. The dry-run handler returns that origin and `tests/captures-origin-contract.test.mjs` covers it without Firestore writes. Live Hetzner MCP capture wiring is still unverified.
- As of 2026-06-06, `/api/captures` dry-run does not read live Firestore tasks by default, even when `PLANNER_DEFAULT_USER_ID` exists. Pass `activeTasks` for request-snapshot context or `includeLiveTasks: true` for an intentional live read. Responses include `activeTasksSource` and `activeTasksCount`.
- As of 2026-06-07, `tests/captures-origin-contract.test.mjs` also covers the non-dry-run MCP-origin capture path with injected dependencies: `source=mcp:...` is passed to append-only capture storage with MCP origin metadata, `processCapture` runs on the stored capture, and no task mutation tool is involved. This is repo/API contract coverage; a live Hetzner MCP `capture_note` dry-run passed on 2026-06-10.
- As of 2026-06-08, production `/api/captures` dry-run smoke passed for `source=mcp:live-smoke`: the response had `dryRun: true`, `origin.channel: "mcp"`, `origin.via: "captures_api"`, `origin.source: "mcp:live-smoke"`, `activeTasksSource: "none"`, and `activeTasksCount: 0`. This proves the deployed capture API origin path without Firestore writes or live task reads; it is not yet a dedicated Hetzner MCP capture tool.
- As of 2026-06-08, live Hetzner MCP includes `capture_note`, a dedicated MCP tool for sending raw notes to `/api/captures`. Safety defaults are `dry_run: true`, `include_live_tasks: false`, optional explicit `active_tasks` snapshot, and required `idempotency_key` for `dry_run:false`. Deploy/auth-boundary smoke passed; authenticated dry-run tool-call smoke passed on 2026-06-10.
- As of 2026-06-08, `capture_note` now uses `services/mcp-server/src/capture-client.js` for request construction/posting. `tests/mcp-capture-client.test.mjs` covers source normalization, dry-run defaults, idempotency guard, active task snapshots, timeout wiring, and capture API error reporting without live Firestore reads or writes. The MCP deploy helper now syncs both `index.js` and `capture-client.js`.
- As of 2026-06-08, MCP version reporting uses one `MCP_SERVER_VERSION` constant for both the MCP server metadata and `/healthz`. This avoids stale healthcheck version evidence after source deploys.
- As of 2026-06-06, `docs/mcp-live-smoke-checklist.md` is the canonical real-client procedure for Hetzner MCP verification. It separates read-only task listing, one disposable add-subtask mutation, web refresh/bootstrap evidence, cleanup, and `capture_note` dry-run smoke. The authenticated task read/write/cleanup piece first passed in a fresh post-OAuth Codex thread, and the deployed capture API dry-run origin smoke passed on 2026-06-08.
- As of 2026-06-10, the full authenticated MCP/web refresh smoke passed. A live MCP client ran `capture_note`, `get_tasks`, `add_task`, `add_subtask`, and `delete_task` on a disposable `QA MCP smoke — delete after test` task only. Web QA packets proved `972e7261 -> c6faf840` after the MCP write, then hard refresh kept `c6faf840` with the QA task/subtask still latest. MCP cleanup returned task count `62 -> 61` and confirmed the QA task absent; web task-data fields returned to baseline fingerprint `972e7261`. Final cleanup QA packets were copied while bootstrap was still loading, so watch bootstrap latency if it repeats, but the task cleanup itself is confirmed.
- As of 2026-06-10, web planner bootstrap calls have a 15s client-side timeout, deployed in Vercel production deployment `dpl_768iWqGQif1CoGfF2VMX43fje3zN`. If `/api/planner-client-actions` hangs, `plannerBootstrapStatus` should move from `loading` to an explicit failure instead of leaving QA packets indefinitely at `planner-bootstrap-pending`.
- As of 2026-06-06, scheduled Telegram nudge outbox payloads include Berlin timing diagnostics (`scheduledForLocal`, `triggeredLocal`, `retryWindow`). This helps explain late-looking messages such as 09:44 as either an intentional retry inside the 09:00 slot window or a real scheduler anomaly.
- As of 2026-06-06, Telegram fallback intent parsing no longer depends on JavaScript ASCII word boundaries for core Cyrillic actions, and it also recognizes Telegram-button-style English phrases such as `done`, `pin today`, `unpin from today`, `return to active`, `send to cemetery`, and `critical`. If OpenRouter is unavailable, these should route deterministically instead of falling through as accidental new-task adds. Live Telegram smoke is still required to prove the deployed bot path with real messages.
- As of 2026-06-06, Telegram fallback intent parsing also recognizes `I'm stuck` / `я застряла` variants and task-specific forms like `I'm stuck on "Pay rent"` as panic actions. This prevents visible bot-button language from becoming an accidental new task when OpenRouter is unavailable. Live Telegram smoke is still required for real free-text messages.
- As of 2026-06-02, Progress Decision Safety shows the auth boundary visibly, disables the live safety snapshot action in guest/local sessions, and writes `liveQaReady` / `stopReason` into copied baseline and trace exports.
- As of 2026-06-09, Progress Decision Safety QA packets include task-data freshness evidence: `taskDataFingerprint`, latest task update timestamp/title/status/subtask count/subtask preview, and a short active-task preview. Use those fields as web-refresh proof after MCP task/subtask writes when a screenshot is not enough.
- As of 2026-06-09, `npm run check:qa-packet` validates copied QA packets and compares baseline/post-write/post-refresh packet files locally. It is intentionally no-network/no-Firestore and should be used for MCP/web refresh proof instead of manual fingerprint comparison.
- As of 2026-06-10, QA packets also include `decisionTraceFingerprint` and `decisionTraceRows`. Use `--expectDecisionStable` only for packet pairs where no Engine/Telegram action should have changed the visible Decision Trace between captures.
- As of 2026-06-10, the Decision Trace fingerprint export is deployed in Vercel production deployment `dpl_AYXEnXoaVwsdtmGYuNNVCVdMsrd5`; live bundle `/static/js/main.a8efebb1.js` contains `decisionTraceFingerprint` and `decisionTraceRows`.
- As of 2026-06-10, QA packet diffs also require `--after` to have a newer `capturedAt` than `--before`; `captured_at_not_after` means the files are reversed, duplicated, or otherwise not usable as chronological evidence.
- As of 2026-06-10, QA packet checker supports `--expectPlannerBootstrapStatus`, `--expectMission`, and `--expectMissionReason`. Use these for focused live QA instead of eyeballing the copied packet.
- As of 2026-05-31, public `/demo` is a portfolio entrypoint for Today Mission -> Rescue -> one tiny step, with demo Angel Lab parsing tuned for the portfolio story.
- This is only the first ingestion slice:
  - no daily angel decision job yet
  - task enrichment exists for Telegram create/update and the web capture safe-upsert path; capture API origin now distinguishes MCP/API sources, but live Hetzner MCP capture wiring is still missing
  - extractor is heuristic only, not LLM-backed

## Current reality

- The project is actively used by a real user, not just as a prototype.
- Stability matters more than adding flashy features.
- Cross-platform direction is now explicit: future Android and iOS clients are planned, so business logic must stay in shared server/domain layers, not in web-only React UI handlers.
- Data loss already happened once because stale local web state overwrote newer Firestore data.
- Firestore still contains two task representations:
  - legacy array field `Users/<uid>.tasks` kept only as rollback safety
  - canonical subcollection `Users/<uid>/tasks`
- On 2026-04-10 the canonical 12-task set was imported into `Users/<uid>/tasks` after a bad migration started from a stale 11-task office state.
- The legacy array was intentionally left untouched and still holds that older 11-task state. Do not treat it as current truth.

## Production endpoints

- Web app: `https://planner.valquilty.com`
- MCP server: `https://mcp.valquilty.com/mcp`

## What was fixed recently

- Firestore sync race in web app
- ghost tasks surviving local cache after cloud deletion
- stale cloud cache older than 30 minutes is now ignored on startup
- Firestore `taskSnapshots` backup layer
- canonical human task set restored into `Users/<uid>/tasks`
- subcollection storage landed in code on `origin/main`
- Telegram duplicate task prevention
- Telegram reopen completed flow
- Telegram contextual actions:
  - reopen last completed
  - complete from free text
  - delete subtask from free text
- server-side Google Calendar flow for Telegram
- today mission rules clarified and aligned across web + Telegram
- Telegram logs written to Firestore `telegramLogs`
- Telegram today-unpin flow now stores the last suggested shortlist in `telegramContext` so follow-ups like `давай последнюю` can resolve against that list
- `api/_lib/planner-agent-router.js`, `api/_lib/telegram-task-memory.js`, and `api/_lib/planner-action-executor.js` now power the live plain-text Telegram path, but slash commands and callback buttons still remain in local webhook handlers

## Very recent commits

- `bc49fe4` Polish public planner demo loop
- `b665569` Clarify today mission rules
- `406f2b4` Improve Telegram task context and logging
- `00e97a4` Fix deadline and Telegram task actions
- `6d40dcf` Add Firestore planner snapshots
- `a629985` Fix ghost tasks after cloud deletions

## Current today mission model

Selection order:

1. overdue or due-today tasks
2. manually pinned `isToday` tasks
3. `isVital` tasks
4. fallback auto-priority

Important:
- `isToday` is now a shortlist, not a vague soft hint
- web UI limits `isToday` to max 3 tasks

## What still feels risky

1. Telegram NLP still needs real-world testing.
   - The bot now has more context, but natural language can still misfire.
   - Telegram flows now share one action-executor path, but intent quality still needs ongoing prompt/routing tuning with real messages.

2. Scheduled nudges need deployment verification before being trusted.
   - Later work moved Telegram nudges to Hetzner while Vercel still hosts the sending route.
   - Verify Hetzner cron, Vercel route, and outbox/delivery status before treating timing as reliable.

3. Heat model is still product-incomplete.
   - `deadlineAt` affects mission priority and nudges
   - it does not directly raise `heatCurrent`
   - as of 2026-04-10, tasks with `deadlineAt`, `isToday`, or `isVital` are protected from automatic cemetery moves caused only by cooling
   - urgency decay windows were relaxed to `low=21d`, `medium=14d`, `high=10d`

4. Manual task movement between heat zones does not exist yet.

5. Cloud cache still exists as a fast-start fallback.
   - It is now capped to 30 minutes max age.
   - If the UI ever shows obviously old tasks again, verify Firestore before trusting local cache.

6. Deployment state may be mixed across environments.
   - `origin/main` contains the subcollection migration.
   - Vercel should follow git deploys, but Hetzner may still lag until explicitly updated.
   - Treat `Users/<uid>/tasks` as the canonical live task set.
   - Do not trust `Users/<uid>.tasks` as current truth.

## Live-server note

The Hetzner MCP server is a standalone manual deployment at `/root/adhd-mcp`, not a git checkout.

It was patched live to add safer mutation behavior:

- `add_subtask` updates `lastUpdated`
- MCP state mutations now also create Firestore `taskSnapshots`
- as of 2026-04-10 11:15 Europe/Berlin, the live MCP server reads/writes `Users/<uid>/tasks` subcollection instead of the legacy root `tasks` array
- server backup file exists at `/root/adhd-mcp/index.array-storage-backup-2026-04-10.js`

This was applied directly on the server and restarted via PM2.
Do not assume every live Hetzner change is already represented elsewhere unless you verify it.

Telegram webhook is separate from that server:

- live Telegram webhook runs on Vercel at `/api/telegram-webhook`
- on 2026-04-10 it was verified end-to-end with a synthetic message that explicit `add_task` requests write to `Users/<uid>/tasks`
- the temporary debug task was removed immediately after verification
- this means "Telegram is broken" should now be treated as a behavior/debugging issue, not as proof that the whole route is dead

## How to debug Telegram now

Look in Firestore under the user document:

- `telegramLogs`
- `taskSnapshots`

Useful log kinds:

- `message_in`
- `intent`
- `action`
- `callback_in`
- `callback_out`
- `error`

Useful Telegram `action` values now include:

- `upsert_task_created`
- `upsert_task_updated`
- `add_subtask_from_text`
- `delete_subtask`
- `complete_from_text`
- `reopen_latest_completed`

If the bot does something stupid, inspect logs before changing prompts.

## Handoff discipline

- `SESSION_HANDOFF.md` should describe the current stable state
- `AGENT_LOG.md` should record each meaningful session
- if you changed live Hetzner/Vercel behavior outside git, write it down in both places

## Safe verification checklist

When starting a new session, verify this sequence:

1. Add a task in web
2. Add a task in Telegram
3. Add a subtask in Telegram
4. Complete task from Telegram text
5. Reopen task from Telegram text
6. Delete subtask from Telegram text
7. Verify web reflects all of it without reload weirdness

## Current data architecture (as of 2026-04-10)

Canonical storage is the subcollection. Structure:
```
Users/{userId}/tasks/{taskId}   ← each task is its own document ✅
Users/{userId}                  ← root doc: score, telegramContext, telegramChatId only
Users/{userId}/taskSnapshots/   ← backup trail (unchanged)
Users/{userId}/telegramLogs/    ← telegram debug logs (unchanged)
```

`Users/{userId}.tasks` still exists as a legacy rollback artifact and currently contains an older 11-task snapshot. Keep it until the new subcollection flow is verified everywhere, then remove it deliberately.

`origin/main` contains the subcollection migration for web + server.
If Hetzner is still on older code, it needs:
```bash
git pull origin main
pm2 restart all
```

## Best next steps

**#1 — Verify every live writer is using the subcollection**
- web app on Vercel
- Telegram on Hetzner
- MCP on Hetzner

MCP on Hetzner is already patched live.
Telegram webhook was confirmed on Vercel, not on the Hetzner MCP process.

## Repeated false-death bug (2026-04-10)

One protected task (`🚨 Anerkennungszuschuss + IHK FOSA — подать заявки`) kept returning to `dead` even after resurrection.

Live snapshot inspection showed this was **not** a normal cooling death:
- the task regressed from a newer active version to an older dead version
- dead snapshots had `deadAt = null`
- current auto-death code always sets `deadAt`, so this points to a stale writer / old tab overwriting newer data

Mitigation now in `main`:
- `src/firestoreUtils.js` refuses stale per-task overwrites when incoming `lastUpdated` is older than the document already in Firestore
- `src/App.js` auto-revives any invalid protected dead task (`status = dead`, `deadAt` missing, and task is protected by `isToday` / `isVital` / `deadlineAt`)
- resurrect / reopen paths now clear `deadAt`
- as of 2026-04-14, web tasks also carry a local base-version marker in memory; `saveTask()` rejects any write when Firestore has already moved beyond that base version, which blocks stale-tab rollbacks even if the stale client generates a newer `Date.now()`
- as of 2026-04-14, accepted web writes normalize `lastUpdated` to at least `base + 1`, so a device with a slightly behind clock does not silently lose its own legitimate change
- as of 2026-04-14, the web cloud cache is only refreshed after a real Firestore snapshot, so stale cache data can no longer keep renewing its own freshness on startup
- as of 2026-04-14, existing-task web mutations no longer depend on assigning `saved` inside `setTasks(...)`; they now compute the updated task synchronously via `mutateSingleTask()` and then call `persistTask(updatedTask)` explicitly
- as of 2026-04-14, task writes triggered before the first Firestore snapshot are queued and flushed once Firestore is ready, instead of being silently dropped by `firestoreReadyRef`

Residual risk:
- a tab that is already open on the old pre-2026-04-14 bundle can still keep attempting bad writes until it is refreshed or closed once
- non-web writers that bypass `src/firestoreUtils.saveTask()` still need live verification if rollbacks continue after refreshing all clients
- as of 2026-04-14 13:05 Europe/Berlin, Vercel server mutations that go through `api/_lib/planner-store.mutatePlanner()` also carry stale-write protection: per-task overwrites/deletes are skipped when Firestore has already advanced beyond the version the server mutation was derived from
- reopen flows in `api/telegram-webhook.js` and `api/_lib/planner-action-executor.js` now pass `__baseLastUpdated` for tasks fetched outside the active-task list so a valid reopen is still allowed while stale revives are blocked

Other steps:
1. **Drag & drop между зонами** (см. ниже)
2. Add restore-from-snapshot UI
3. Stats: показать timeSpent суммарно / за неделю

## Telegram nudges now run from Hetzner

Live state as of 2026-04-11:
- Hetzner root crontab has exact-time jobs at `09:00` and `18:00` with `CRON_TZ=Europe/Berlin`
- bridge script lives at `/root/adhd-mcp/sendTelegramNudge.mjs`
- wrapper lives at `/root/adhd-mcp/runTelegramNudge.sh`
- secret env lives at `/root/adhd-mcp/.telegram-nudge.env`
- Vercel route `/api/telegram-nudge` still does the actual message send, but scheduling is no longer delegated to Vercel cron

Important:
- `vercel.json` was changed to remove Vercel crons; once that deploy lands, duplicate nudges from Vercel should stop
- `CRON_SECRET` is now shared between Vercel and Hetzner; rotate it later in both places

## Telegram shortlist follow-up bug

Resolved in local code on 2026-04-11:
- live `telegramLogs` proved that after `suggest_unpin_today`, the follow-up `давай последнюю` was still being parsed as AI intent `set_today`
- root cause was not Firestore context loss: `telegramContext.lastAction='suggest_unpin_today'` and `candidateTaskIds` were present in Firestore
- root cause was a router regex bug: JavaScript `\b` did not match Cyrillic follow-up phrases like `давай последнюю`, so the selection-context override never ran
- fix lives in `api/_lib/planner-agent-router.js` and replaces those checks with Unicode-safe `(\s|$)` boundaries

If this bug appears again:
1. inspect `telegramLogs`
2. compare `message_in` + `intent`
3. if the follow-up intent becomes `set_today`/`chat` instead of `unset_today`, inspect router phrase matching first before changing Firestore logic

## Drag & drop — план для следующего агента

Пользователь хочет:
- Перетаскивать задачи мышью/пальцем между зонами (🔥 → 🧊 → 🥶)
- Бросать задачу на иконку чёртика → отправляется на кладбище (как handleKill)
- Бросать задачу на иконку ангела → отправляется в рай (как handleComplete)
- Обратно: из рая/кладбища перетащить обратно в активные

Реализация:
- Установить `@dnd-kit/core` + `@dnd-kit/sortable` (легче чем react-beautiful-dnd)
- Зоны становятся drop targets
- Компоненты ангела/чёртика в Companions.js становятся drop targets
- При drop на зону: менять heatBase задачи (hot=80, passive=40, purgatory=10) и вызывать persistTask
- При drop на чёртика: вызывать handleKill
- При drop на ангела: вызывать handleComplete (с подтверждением)
- timeSpent уже хранится в задаче — трекинг готов

## Things agents should not do casually

- do not reintroduce client-side secret usage
- do not “optimize” away backup snapshots
- do not change mission-selection logic in web without mirroring it in server code
- do not overwrite Firestore with stale bulk task arrays
