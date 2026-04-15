# ADHD Planner Execution Plan

Last updated: 2026-04-15

This is the working execution plan for the next product layer.

It turns the "angel / executive-function companion" direction into concrete deliverables that agents can execute and mark as done.

## How to use this file

- `[ ]` = not started
- `[~]` = in progress
- `[x]` = done
- Keep this file factual.
- When an agent completes meaningful work related to one of these items, update the checkbox in this file in the same session.
- If the scope changes, append a short note under the relevant phase instead of rewriting product history.

## Non-negotiable product rules

- The product is not a generic todo app. It is a persistent executive-function companion for ADHD.
- Do not require the user to manually model their life in structured forms before the system becomes useful.
- `isToday` stays the user's manual shortlist. AI must not silently hijack it.
- Angel decisions must be explainable and bounded. Picking 1-2 tasks is preferred; 3 is the hard max.
- LLMs should classify, extract, and explain. They should not be the sole source of prioritization truth.
- Firestore writes must stay per-document and stale-safe. Do not introduce new bulk planner overwrite paths.
- Raw user brain dumps should land in append-only capture storage before they become structured memory.

## Already true in the product

- [x] Canonical task storage is `Users/{uid}/tasks/{taskId}`, not the legacy root `tasks` array.
- [x] Web and Vercel task writes now include stale-write protection.
- [x] Today mission logic already exists in web and server code.
- [x] Telegram text already goes through `route -> execute` instead of a single monolithic handler.
- [x] Panic / rescue flow already exists and can be reused for micro-steps.

## Phase 0 - Foundation guardrails

Goal: make sure the new memory layer is built on safe mutation rules instead of the old overwrite patterns.

- [ ] Write a short architecture note that defines the new source-of-truth boundaries for:
  - `tasks`
  - `captures`
  - `commitments`
  - `angelDecisions`
- [ ] Explicitly document that new angel features must not depend on legacy `Users/{uid}.tasks`.
- [ ] Add or reuse a server-side safe per-task writer for any new agent/angel mutations instead of batch planner rewrites.
- [ ] Define the minimal observability needed to debug angel actions:
  - decision log
  - capture processing log
  - task mutation trace

Done when:
- a new agent can implement on top of this plan without guessing where state is allowed to live
- no planned angel feature relies on whole-planner overwrite behavior

## Phase 1 - Brain-dump intake (`captures`)

Goal: let the user dump chaos into the system without first organizing it.

- [ ] Add `Users/{uid}/captures/{captureId}` schema to the plan/docs.
- [ ] Support append-only capture creation from Telegram free text.
- [ ] Support append-only capture creation from web input.
- [ ] Support append-only capture creation from MCP-originated notes/facts.
- [ ] Track capture lifecycle:
  - `new`
  - `processed`
  - `failed`
- [ ] Preserve raw input and transcript/origin metadata instead of flattening too early.

Done when:
- a free-form dump can be saved without immediately mutating planner state
- raw capture data can be reprocessed later if extraction logic changes

## Phase 2 - Extraction pipeline

Goal: turn raw captures into structured memory without making the LLM the only brain.

- [ ] Define extractor output shape for:
  - `commitments`
  - `candidateTasks`
  - `facts`
- [ ] Implement extraction from capture text into those three output groups.
- [ ] Upsert extracted task hints into existing task fields where safe:
  - `urgency`
  - `resistance`
  - `isVital`
  - `deadlineAt`
  - `lifeArea`
  - `commitmentIds`
- [ ] Store extraction confidence and source capture linkage.
- [ ] Keep extraction idempotent enough that re-running it does not spray duplicate tasks.

Done when:
- a single messy text dump can create or enrich structured planner context
- extraction can be inspected after the fact instead of being hidden inside one prompt

## Phase 3 - Commitment memory

Goal: remember life obligations even when individual tasks die.

- [ ] Add `Users/{uid}/commitments/{commitmentId}` schema.
- [ ] Support commitment upsert from extraction output.
- [ ] Track:
  - `kind`
  - `whyMatters`
  - `failureCost`
  - `pressureStyle`
  - `lastMentionedAt`
  - `lastTouchedAt`
  - `nextReviewAt`
- [ ] Link tasks to commitments with `commitmentIds`.
- [ ] Add the rule: if an important commitment has no live next step for too long, the system should surface that explicitly.

Done when:
- the system can remember "documents", "money", "health", "cat", and similar obligations even when no active task is currently visible

## Phase 4 - Angel pin layer

Goal: let the system choose what to push today without stealing the user's own shortlist field.

- [ ] Extend task docs with the planned angel fields:
  - `angelPinned`
  - `angelScore`
  - `angelReason`
  - `angelPressure`
  - `angelDecidedAt`
  - `angelReviewAt`
  - `lastAngelNudgedAt`
- [ ] Keep `isToday` manual and separate from `angelPinned`.
- [ ] Define `Boss Score` inputs at the product level:
  - external consequence
  - deadline pressure
  - neglect
  - recurrence
  - dependency / external people
  - avoidance
  - identity importance
  - overload penalty
- [ ] Let the LLM explain and classify, but keep final ranking grounded in explicit score inputs.

Done when:
- the planner can show "what the user picked" and "what the angel picked" as separate concepts

## Phase 5 - Daily angel decisions

Goal: make one stable daily decision instead of constantly re-deciding and thrashing.

- [ ] Add `Users/{uid}/angelDecisions/{dateKey}` schema.
- [ ] Generate at most 1-2 primary angel picks per day; 3 is the hard cap.
- [ ] Persist reasons for each selected task.
- [ ] Persist the outbound morning message body or message template inputs.
- [ ] Prevent decision thrash by reusing the stored decision for the day unless a real override condition happens.
- [ ] Add explicit override rules for:
  - hard new deadline
  - completed angel task
  - user manual dismissal
  - emergency mode

Done when:
- the system can explain why it is pushing exactly these tasks today
- the angel does not change its mind every few minutes

## Phase 6 - Delivery loop and pressure style

Goal: turn decisions into actual follow-through, not just metadata.

- [ ] Deliver daily angel nudges through the right channel, with Telegram first.
- [ ] Support pressure modes:
  - `soft`
  - `boss`
  - `emergency`
  - micro-step fallback
- [ ] Reuse existing panic/rescue behavior for "just give me the first ugly step".
- [ ] Escalate only after repeated non-response, not immediately.
- [ ] Add evening follow-up behavior:
  - keep pressure on unfinished critical items
  - shrink to a micro-step for tomorrow when needed

Done when:
- the system can pick, explain, pressure, and narrow one important thing instead of dumping a todo pile

## Phase 7 - Product surfaces

Goal: expose the angel layer where the user already lives instead of creating a detached feature island.

- [ ] Show `angelPinned` and `angelReason` in the main planner UI.
- [ ] Show angel picks in Telegram as part of the daily loop.
- [ ] Keep mission UI, panic mode, and angel pressure consistent instead of inventing competing flows.
- [ ] Add enough UI/debug surface to inspect:
  - latest capture
  - latest angel decision
  - latest reason for pinning

Done when:
- the angel feels like an extension of the existing planner, not a separate half-built product inside it

## Phase 8 - Validation and safety

Goal: prove this layer works in real life without reintroducing data loss.

- [ ] Define a manual verification checklist for:
  - capture ingestion
  - extraction
  - commitment linking
  - angel pinning
  - Telegram delivery
  - refresh / cross-device persistence
- [ ] Add regression checks for stale writes on any new task mutation path.
- [ ] Add a lightweight recovery/debug path for bad angel decisions or accidental bad extraction.
- [ ] Record live risks in `SESSION_HANDOFF.md` after each meaningful angel-layer rollout.

Done when:
- new memory/angel behavior can be tested without guessing
- rollback/debug steps exist before wider rollout

## Suggested build order

1. Phase 0 - Foundation guardrails
2. Phase 1 - Brain-dump intake
3. Phase 2 - Extraction pipeline
4. Phase 3 - Commitment memory
5. Phase 4 - Angel pin layer
6. Phase 5 - Daily angel decisions
7. Phase 6 - Delivery loop and pressure style
8. Phase 7 - Product surfaces
9. Phase 8 - Validation and safety

## Agent discipline for this plan

- If you implement something from this file, update the checkbox here before ending the session.
- If you deliberately defer an item, leave it unchecked and explain the reason in `AGENT_LOG.md`.
- If product direction changes, update this plan in small factual edits instead of replacing it with vague aspirations.
