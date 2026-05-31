import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PLANNER_COMMAND_TYPES } = require("../api/_lib/planner-command-types.js");
const {
  getTaskStatusTransition,
  isTaskStatusTransitionAllowed,
} = require("../api/_lib/planner-status-transition-rules.js");

function assertTransition(title, commandType, currentStatus, expected) {
  const transition = getTaskStatusTransition(commandType, currentStatus);
  assert.equal(transition.allowed, expected.allowed, `${title}: allowed`);
  assert.equal(transition.nextStatus, expected.nextStatus, `${title}: nextStatus`);
  assert.equal(isTaskStatusTransitionAllowed(commandType, currentStatus), expected.allowed, `${title}: helper allowed`);
}

assertTransition("active can complete to Heaven", PLANNER_COMMAND_TYPES.TASK_COMPLETE, "active", {
  allowed: true,
  nextStatus: "completed",
});

assertTransition("completed cannot complete again", PLANNER_COMMAND_TYPES.TASK_COMPLETE, "completed", {
  allowed: false,
  nextStatus: "completed",
});

assertTransition("dead cannot complete to Heaven", PLANNER_COMMAND_TYPES.TASK_COMPLETE, "dead", {
  allowed: false,
  nextStatus: "dead",
});

assertTransition("active can move to Cemetery", PLANNER_COMMAND_TYPES.TASK_MOVE_TO_CEMETERY, "active", {
  allowed: true,
  nextStatus: "dead",
});

assertTransition("completed can move to Cemetery", PLANNER_COMMAND_TYPES.TASK_MOVE_TO_CEMETERY, "completed", {
  allowed: true,
  nextStatus: "dead",
});

assertTransition("dead does not move to Cemetery again", PLANNER_COMMAND_TYPES.TASK_MOVE_TO_CEMETERY, "dead", {
  allowed: false,
  nextStatus: "dead",
});

assertTransition("completed can reopen to Active", PLANNER_COMMAND_TYPES.TASK_REOPEN, "completed", {
  allowed: true,
  nextStatus: "active",
});

assertTransition("dead can reopen to Active", PLANNER_COMMAND_TYPES.TASK_REOPEN, "dead", {
  allowed: true,
  nextStatus: "active",
});

assertTransition("active does not reopen again", PLANNER_COMMAND_TYPES.TASK_REOPEN, "active", {
  allowed: false,
  nextStatus: "active",
});

console.log("planner engine status stability tests passed");
