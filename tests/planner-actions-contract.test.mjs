import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validatePlannerActionRequest } = require("../api/_lib/planner-contract.js");
const {
  buildAddSubtaskCommand,
  buildPlannerActionRouteCommand,
} = require("../api/_lib/planner-command-builders.js");
const { PLANNER_COMMAND_TYPES } = require("../api/_lib/planner-command-types.js");

assert.equal(
  typeof validatePlannerActionRequest,
  "function",
  "validatePlannerActionRequest must be exported from api/_lib/planner-contract.js",
);

function assertValid(title, payload) {
  let result;
  assert.doesNotThrow(
    () => {
      result = validatePlannerActionRequest(payload);
    },
    `${title} should be accepted`,
  );

  if (result && typeof result === "object") {
    if ("ok" in result) assert.equal(result.ok, true, `${title} should return ok=true`);
    if ("valid" in result) assert.equal(result.valid, true, `${title} should return valid=true`);
    if (Array.isArray(result.errors)) assert.equal(result.errors.length, 0, `${title} should not contain errors`);
  }

  return result;
}

function assertInvalid(title, payload) {
  const result = validatePlannerActionRequest(payload);

  const invalid =
    (result && typeof result === "object" && result.ok === false) ||
    (result && typeof result === "object" && result.valid === false) ||
    (result && typeof result === "object" && Boolean(result.error)) ||
    (result && typeof result === "object" && Array.isArray(result.errors) && result.errors.length > 0);

  assert.equal(invalid, true, `${title} should be rejected`);
}

assertValid("valid add_task", {
  action: "add_task",
  payload: {
    taskText: "Buy groceries",
  },
});

assertInvalid("invalid reopen_task without taskRef", {
  action: "reopen_task",
  payload: {},
});

assertValid("valid reopen_task with explicit taskRef", {
  action: "reopen_task",
  payload: {
    taskRef: "Buy groceries",
  },
});

assertValid("valid complete_task with explicit taskRef", {
  action: "complete_task",
  payload: {
    taskRef: "Buy groceries",
  },
});

const validAddSubtask = assertValid("valid add_subtask with explicit taskRef and subtaskText", {
  action: "add_subtask",
  payload: {
    taskRef: "Build planner",
    subtaskText: "Smoke Telegram buttons",
  },
}).request.route;

assert.equal(validAddSubtask.type, "add_subtask");
assert.equal(validAddSubtask.taskRef, "Build planner");
assert.equal(validAddSubtask.subtaskText, "Smoke Telegram buttons");

assertInvalid("invalid add_subtask without taskRef", {
  action: "add_subtask",
  payload: {
    subtaskText: "Missing parent task",
  },
});

assertInvalid("invalid add_subtask without subtaskText", {
  action: "add_subtask",
  payload: {
    taskRef: "Build planner",
  },
});

assertValid("valid show_cemetery", {
  action: "show_cemetery",
});

assertInvalid("invalid kill_task without taskRef", {
  action: "kill_task",
  payload: {},
});

assertValid("valid kill_task with explicit taskRef", {
  action: "kill_task",
  payload: {
    taskRef: "Buy groceries",
  },
});

assertValid("valid schedule_task with date/time", {
  action: "schedule_task",
  payload: {
    taskRef: "Plan sprint review",
    deadlineAt: "2026-04-16",
    startTime: "14:30",
  },
});

assertInvalid("invalid unknown action", {
  action: "unknown_action",
});

assertInvalid("invalid missing required fields", {
  action: "add_task",
  payload: {},
});

assertInvalid("invalid complete_task without taskRef", {
  action: "complete_task",
  payload: {},
});

{
  const command = buildAddSubtaskCommand({ id: "task-1" }, "Write MCP regression");
  assert.equal(command.type, PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK);
  assert.equal(command.taskId, "task-1");
  assert.equal(command.subtaskText, "Write MCP regression");
}

{
  const command = buildPlannerActionRouteCommand({
    route: validAddSubtask,
    task: { id: "task-2" },
  });
  assert.equal(command.type, PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK);
  assert.equal(command.taskId, "task-2");
  assert.equal(command.subtaskText, "Smoke Telegram buttons");
}

{
  const command = buildPlannerActionRouteCommand({
    route: validAddSubtask,
    task: { id: "task-3" },
    subtaskText: "Prefer resolved MCP subtask text",
  });
  assert.equal(command.type, PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK);
  assert.equal(command.taskId, "task-3");
  assert.equal(command.subtaskText, "Prefer resolved MCP subtask text");
}

console.log("planner action contract tests passed");
