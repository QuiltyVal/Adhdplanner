const { PLANNER_COMMAND_TYPES } = require("./planner-command-types");

const TASK_STATUS = Object.freeze({
  ACTIVE: "active",
  COMPLETED: "completed",
  DEAD: "dead",
});

const TASK_STATUS_TRANSITIONS = Object.freeze({
  [PLANNER_COMMAND_TYPES.TASK_COMPLETE]: Object.freeze({
    from: Object.freeze([TASK_STATUS.ACTIVE]),
    to: TASK_STATUS.COMPLETED,
    noopWhen: "task_not_active",
  }),
  [PLANNER_COMMAND_TYPES.TASK_MOVE_TO_CEMETERY]: Object.freeze({
    from: Object.freeze([TASK_STATUS.ACTIVE, TASK_STATUS.COMPLETED, ""]),
    to: TASK_STATUS.DEAD,
    noopWhen: "task_already_dead",
  }),
  [PLANNER_COMMAND_TYPES.TASK_REOPEN]: Object.freeze({
    from: Object.freeze([TASK_STATUS.COMPLETED, TASK_STATUS.DEAD, ""]),
    to: TASK_STATUS.ACTIVE,
    noopWhen: "task_already_active",
  }),
});

function normalizeTaskStatus(status = "") {
  return String(status || "").trim();
}

function getTaskStatusTransitionRule(commandType = "") {
  return TASK_STATUS_TRANSITIONS[String(commandType || "").trim()] || null;
}

function isTaskStatusTransitionAllowed(commandType = "", currentStatus = "") {
  const rule = getTaskStatusTransitionRule(commandType);
  if (!rule) return true;
  return rule.from.includes(normalizeTaskStatus(currentStatus));
}

function getTaskStatusTransition(commandType = "", currentStatus = "") {
  const rule = getTaskStatusTransitionRule(commandType);
  if (!rule) {
    return {
      commandType,
      allowed: true,
      currentStatus: normalizeTaskStatus(currentStatus),
      nextStatus: normalizeTaskStatus(currentStatus),
      noopReason: "",
    };
  }

  const allowed = isTaskStatusTransitionAllowed(commandType, currentStatus);
  return {
    commandType,
    allowed,
    currentStatus: normalizeTaskStatus(currentStatus),
    nextStatus: allowed ? rule.to : normalizeTaskStatus(currentStatus),
    noopReason: allowed ? "" : rule.noopWhen,
  };
}

module.exports = {
  TASK_STATUS,
  TASK_STATUS_TRANSITIONS,
  getTaskStatusTransition,
  getTaskStatusTransitionRule,
  isTaskStatusTransitionAllowed,
};
