# Angel Architecture Note

Last updated: 2026-04-15

This note defines the safe storage boundaries for the next product layer: captures, commitments, angel pinning, and daily angel decisions.

It exists so future agents do not guess where state should live or accidentally build new features on top of stale planner patterns.

## Source-of-truth boundaries

### Tasks

Canonical storage:

- `Users/{uid}/tasks/{taskId}`

Purpose:

- active / completed / dead planner tasks
- task flags like `isToday`, `isVital`, `deadlineAt`
- future angel task-level fields like `angelPinned`, `angelScore`, `angelReason`

Rules:

- task writes must stay stale-safe
- do not build new features on top of legacy `Users/{uid}.tasks`
- do not add new bulk planner overwrite flows for angel logic

### Root user doc

Storage:

- `Users/{uid}`

Purpose:

- compact profile fields like `score`, `telegramChatId`, `telegramContext`
- future small `angelProfile` fields only

Rules:

- keep this compact
- do not turn the root doc into a blob of memory state

### Captures

Canonical storage:

- `Users/{uid}/captures/{captureId}`

Purpose:

- append-only inbox for messy raw user input
- free text from Telegram, web, MCP, and future channels
- reprocessable source material for extraction

Minimum schema:

```js
Users/{uid}/captures/{captureId} {
  id,
  source,          // telegram | web | mcp
  kind,            // text_dump | voice_dump | mcp_fact
  rawText,
  transcript,
  status,          // new | processed | failed
  processedAt,
  extraction,      // null or extracted structure
  meta,            // transport/debug metadata
  capturedAt,
  createdAt
}
```

Rules:

- append-only by default
- raw input must survive extraction mistakes
- capture creation must not require immediate task mutation
- Telegram capture ingestion should be idempotent per inbound message/update so retries do not inflate memory state

### Commitments

Canonical storage:

- `Users/{uid}/commitments/{commitmentId}`

Purpose:

- durable memory of life obligations that should survive individual task death

Examples:

- documents
- money
- health
- cat care
- work obligations

Rules:

- not every capture must become a commitment
- if the extractor is unsure, it is better to produce zero commitments than to create fake durable memory from random chat text

Minimum schema:

```js
Users/{uid}/commitments/{commitmentId} {
  id,
  title,
  kind,
  whyMatters,
  failureCost,
  pressureStyle,
  state,
  confidence,
  mentionCount30d,
  totalMentionCount,
  lastMentionedAt,
  lastTouchedAt,
  nextReviewAt,
  needsTaskIfSilentDays,
  sourceCaptureIds,
  keywordsMatched,
  createdAt,
  updatedAt
}
```

### Angel decisions

Planned canonical storage:

- `Users/{uid}/angelDecisions/{dateKey}`

Purpose:

- stable daily record of what the angel selected and why

Rules:

- one stored daily decision should be preferred over re-deciding every few minutes
- the decision must be explainable

## Safe mutation rules for the angel layer

- `captures` should be append-only
- `commitments` should be upserted per document
- task updates should stay per-task and stale-safe
- if a future angel feature needs to mutate tasks server-side, do not reintroduce broad planner rewrites as a shortcut

## Explicit anti-patterns

Do not use these as the base for new angel features:

- legacy `Users/{uid}.tasks` as current truth
- silent LLM-only priority decisions with no explicit score inputs
- root-doc memory blobs
- new bulk overwrite flows that rebuild the whole planner from stale state

## Current implemented slice

As of 2026-04-15:

- Telegram plain-text intake now creates append-only `captures` documents before continuing with normal intent handling when the input looks like a new task or open-ended brain dump
- those captures are then post-processed into an `extraction` payload with:
  - `commitments`
  - `candidateTasks`
  - `facts`
- extracted commitments are upserted into `Users/{uid}/commitments/{commitmentId}`
- Telegram capture creation is now idempotent by inbound Telegram message/update identity to avoid replay inflating commitments
- the extractor no longer creates fallback commitments from arbitrary unmatched text
- Telegram task create/update flows now carry `lifeArea` and `commitmentIds` into canonical task docs so memory can start attaching to real planner items
- this is only the first ingestion slice, not the full extraction / commitment / angel loop
