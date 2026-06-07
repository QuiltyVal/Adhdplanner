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

{
  const event = buildSingleTaskMutationCommandEvent({
    eventId: "event-3",
    eventName: "subtask_added",
    eventType: PLANNER_EVENT_TYPES.TASK_SUBTASK_ADDED,
    commandType: PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK,
    previousTask: {
      id: "task-3",
      text: "Ship planner",
      status: "active",
      subtasks: [],
    },
    task: {
      id: "task-3",
      text: "Ship planner",
      status: "active",
      subtasks: [
        {
          id: "task-3-sub-1",
          text: "Verify MCP subtask write",
          completed: false,
        },
      ],
    },
    actor: { type: "agent", ref: "mcp" },
    source: "mcp_add_subtask",
    extra: {
      createdSubtask: {
        id: "task-3-sub-1",
        text: "Verify MCP subtask write",
        completed: false,
      },
    },
    now: 1780700000002,
  });

  assert.equal(event.event_type, PLANNER_EVENT_TYPES.TASK_SUBTASK_ADDED);
  assert.equal(event.command_type, PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK);
  assert.equal(event.payload.extra.createdSubtask.id, "task-3-sub-1");
  assert.equal(event.payload.extra.createdSubtask.text, "Verify MCP subtask write");
  assert.equal("previousStatus" in event.payload, false);
}

{
  const event = buildSingleTaskMutationCommandEvent({
    eventId: "event-4",
    eventName: "subtask_toggled",
    eventType: PLANNER_EVENT_TYPES.TASK_SUBTASK_TOGGLED,
    commandType: PLANNER_COMMAND_TYPES.TASK_SUBTASK_TOGGLED,
    previousTask: {
      id: "task-4",
      text: "Keep event trace clean",
      status: "active",
      subtasks: [
        {
          id: "task-4-sub-1",
          text: "Check constants",
          completed: false,
        },
      ],
    },
    task: {
      id: "task-4",
      text: "Keep event trace clean",
      status: "active",
      subtasks: [
        {
          id: "task-4-sub-1",
          text: "Check constants",
          completed: true,
        },
      ],
    },
    actor: { type: "agent", ref: "mcp" },
    source: "mcp_toggle_subtask",
    extra: {
      subtaskId: "task-4-sub-1",
      subtaskText: "Check constants",
      completed: true,
    },
    now: 1780700000003,
  });

  assert.equal(event.event_type, PLANNER_EVENT_TYPES.TASK_SUBTASK_TOGGLED);
  assert.equal(event.command_type, PLANNER_COMMAND_TYPES.TASK_SUBTASK_TOGGLED);
  assert.equal(event.message, "Updated a step in “Keep event trace clean”.");
  assert.equal(event.payload.extra.subtaskId, "task-4-sub-1");
  assert.equal(event.payload.extra.completed, true);
}

console.log("planner command event specs tests passed");
