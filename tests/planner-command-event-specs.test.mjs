import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildSingleTaskMutationCommandEvent } = require("../api/_lib/planner-command-event-specs.js");
const { PLANNER_COMMAND_TYPES } = require("../api/_lib/planner-command-types.js");
const { PLANNER_EVENT_TYPES } = require("../api/_lib/planner-event-types.js");

{
  const event = buildSingleTaskMutationCommandEvent({
    eventId: "event-1",
    eventName: "task_dead",
    eventType: PLANNER_EVENT_TYPES.TASK_MOVED_TO_CEMETERY,
    commandType: PLANNER_COMMAND_TYPES.TASK_MOVE_TO_CEMETERY,
    previousTask: {
      id: "task-1",
      text: "Clean stale task",
      status: "active",
    },
    task: {
      id: "task-1",
      text: "Clean stale task",
      status: "dead",
    },
    actor: { type: "user", ref: "telegram" },
    source: "telegram_manual_kill",
    scoreDelta: -5,
    now: 1780700000000,
  });

  assert.equal(event.event_type, PLANNER_EVENT_TYPES.TASK_MOVED_TO_CEMETERY);
  assert.equal(event.payload.previousStatus, "active");
  assert.equal(event.payload.nextStatus, "dead");
  assert.equal(event.payload.scoreDelta, -5);
}

{
  const event = buildSingleTaskMutationCommandEvent({
    eventId: "event-2",
    eventName: "task_reopened",
    eventType: PLANNER_EVENT_TYPES.TASK_REOPENED,
    commandType: PLANNER_COMMAND_TYPES.TASK_REOPEN,
    previousTask: {
      id: "task-2",
      text: "Bring back task",
      status: "completed",
    },
    task: {
      id: "task-2",
      text: "Bring back task",
      status: "active",
    },
    actor: { type: "user", ref: "telegram" },
    source: "callback_reopen",
    now: 1780700000001,
  });

  assert.equal(event.payload.previousStatus, "completed");
  assert.equal(event.payload.nextStatus, "active");
  assert.equal("scoreDelta" in event.payload, false);
}

console.log("planner command event specs tests passed");
