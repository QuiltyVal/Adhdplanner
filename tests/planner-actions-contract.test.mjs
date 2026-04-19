import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validatePlannerActionRequest } = require("../api/_lib/planner-contract.js");

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

assertValid("valid reopen_task without taskRef (latest)", {
  action: "reopen_task",
  payload: {},
});

assertValid("valid complete_task with explicit taskRef", {
  action: "complete_task",
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

console.log("planner action contract tests passed");
