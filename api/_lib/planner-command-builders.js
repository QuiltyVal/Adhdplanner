const { PLANNER_COMMAND_TYPES } = require("./planner-command-types");
const { PLANNER_ACTIONS } = require("./planner-action-types");
const {
  RESCUE_ROUTE_TYPES,
  TASK_TUNING_ROUTE_TYPES,
  getRescueCommandType,
  getTaskTuningCommandType,
} = require("./planner-action-command-map");

function buildDeleteSubtaskCommand(task = {}, route = {}, subtask = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.TASK_DELETE_SUBTASK,
    taskId: task.id,
    subtaskId: route.subtaskId || subtask.id,
    subtaskText: route.subtaskText || subtask.text || "",
  };
}

function buildAddSubtaskCommand(task = {}, subtaskText = "") {
  return {
    type: PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK,
    taskId: task.id,
    subtaskText,
  };
}

function buildEditTaskCommand(task = {}, route = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.TASK_EDIT_TASK,
    taskId: task.id,
    newTaskText: route.newTaskText,
  };
}

function buildEditSubtaskCommand(task = {}, route = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.TASK_EDIT_SUBTASK,
    taskId: task.id,
    subtaskId: route.subtaskId,
    newSubtaskText: route.newSubtaskText,
  };
}

function buildTaskIdCommand(type = "", task = {}) {
  return {
    type,
    taskId: task.id,
  };
}

function buildRescueCommand(type = "", task = {}, route = {}) {
  return {
    type,
    taskId: task.id,
    microstepText: route.microstepText || "",
    durationMs: route.durationMs || 0,
    closeReason: route.closeReason || "",
    secondsLeft: route.secondsLeft || 0,
  };
}

function buildReorderCommand(task = {}, overTask = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.TASK_REORDER,
    taskId: task.id,
    overTaskId: overTask.id,
  };
}

function buildBulkMoveCompletedToCemeteryCommand(route = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.BULK_MOVE_COMPLETED_TO_CEMETERY,
    taskIds: route.taskIds,
    protectedCount: route.protectedCount,
  };
}

function buildDeleteForeverCommand(task = {}, directTaskIds = []) {
  return {
    type: PLANNER_COMMAND_TYPES.TASK_DELETE_FOREVER,
    taskId: task?.id || "",
    taskIds: directTaskIds,
  };
}

function buildRestoreSnapshotCommand(route = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.RESTORE_SNAPSHOT,
    snapshotId: route.snapshotId,
  };
}

function buildCreateSnapshotCommand(route = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.CREATE_SNAPSHOT,
    snapshotSource: route.snapshotSource || "manual_web",
    reason: route.reason || "manual_snapshot",
  };
}

function buildLinkTelegramChatCommand(route = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.LINK_TELEGRAM_CHAT,
    chatId: String(route.chatId || ""),
  };
}

function buildRepairProtectedTasksCommand(route = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.REPAIR_PROTECTED_TASKS,
    taskIds: route.taskIds || [],
    reason: route.reason || "protected_dead_without_deadAt",
  };
}

function buildTaskTuningCommand(type = "", task = {}, route = {}) {
  return {
    type,
    taskId: task.id,
    urgency: route.urgency,
    resistance: route.resistance,
    deadlineAt: route.deadlineAt,
    heatZone: route.heatZone,
    reason: route.reason,
    waitingFor: route.waitingFor,
    lastUserAction: route.lastUserAction,
    nextCheckInAt: route.nextCheckInAt,
  };
}

function buildAddTimeCommand(task = {}, route = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.TASK_ADD_TIME,
    taskId: task.id,
    elapsedMs: route.elapsedMs,
  };
}

function buildCreateOrMergeTaskCommand(route = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.CREATE_OR_MERGE_TASK,
    taskText: route.taskText || route.rawText || "",
    rawText: route.rawText || "",
    deadlineAt: route.deadlineAt || "",
    urgency: route.urgency || "medium",
    resistance: route.resistance || "medium",
    isToday: route.isToday,
    isVital: route.isVital,
    lifeArea: route.lifeArea || "",
    commitmentIds: route.commitmentIds || [],
    subtasks: route.subtasks || [],
  };
}

function buildToggleSubtaskCommand(task = {}, route = {}) {
  const hasExplicitCompleted = typeof route.completed === "boolean";
  return {
    type: PLANNER_COMMAND_TYPES.TASK_SUBTASK_TOGGLED,
    taskId: task.id,
    subtaskId: route.subtaskId,
    ...(hasExplicitCompleted ? { completed: route.completed } : {}),
  };
}

function buildApplyExtractionHintsCommand(route = {}) {
  const {
    type,
    source,
    idempotencyKey,
    taskId,
    ...patch
  } = route && typeof route === "object" ? route : {};
  return {
    type: PLANNER_COMMAND_TYPES.TASK_APPLY_EXTRACTION_HINTS,
    taskId,
    ...patch,
  };
}

function buildPlannerActionRouteCommand({
  route = {},
  task = {},
  subtask = {},
  overTask = {},
  directTaskIds = [],
  subtaskText = "",
} = {}) {
  if (RESCUE_ROUTE_TYPES.includes(route.type)) {
    return buildRescueCommand(getRescueCommandType(route.type), task, route);
  }

  if (TASK_TUNING_ROUTE_TYPES.includes(route.type)) {
    return buildTaskTuningCommand(getTaskTuningCommandType(route.type), task, route);
  }

  switch (route.type) {
    case PLANNER_ACTIONS.DELETE_SUBTASK:
      return buildDeleteSubtaskCommand(task, route, subtask);
    case PLANNER_ACTIONS.ADD_SUBTASK:
      return buildAddSubtaskCommand(task, subtaskText || route.subtaskText || route.taskText || "");
    case PLANNER_ACTIONS.EDIT_TASK:
      return buildEditTaskCommand(task, route);
    case PLANNER_ACTIONS.EDIT_SUBTASK:
      return buildEditSubtaskCommand(task, route);
    case PLANNER_ACTIONS.REOPEN_TASK:
      return buildTaskIdCommand(PLANNER_COMMAND_TYPES.TASK_REOPEN, task);
    case PLANNER_ACTIONS.COMPLETE_TASK:
      return buildTaskIdCommand(PLANNER_COMMAND_TYPES.TASK_COMPLETE, task);
    case PLANNER_ACTIONS.TOUCH_TASK:
      return buildTaskIdCommand(PLANNER_COMMAND_TYPES.TASK_TOUCH, task);
    case PLANNER_ACTIONS.KILL_TASK:
      return buildTaskIdCommand(PLANNER_COMMAND_TYPES.TASK_MOVE_TO_CEMETERY, task);
    case PLANNER_ACTIONS.REORDER_TASK:
      return buildReorderCommand(task, overTask);
    case PLANNER_ACTIONS.BULK_MOVE_COMPLETED_TO_CEMETERY:
      return buildBulkMoveCompletedToCemeteryCommand(route);
    case PLANNER_ACTIONS.DELETE_TASK_FOREVER:
      return buildDeleteForeverCommand(task, directTaskIds);
    case PLANNER_ACTIONS.RESTORE_SNAPSHOT:
      return buildRestoreSnapshotCommand(route);
    case PLANNER_ACTIONS.CREATE_SNAPSHOT:
      return buildCreateSnapshotCommand(route);
    case PLANNER_COMMAND_TYPES.LINK_TELEGRAM_CHAT:
      return buildLinkTelegramChatCommand(route);
    case PLANNER_ACTIONS.REPAIR_PROTECTED_TASKS:
      return buildRepairProtectedTasksCommand(route);
    case PLANNER_ACTIONS.ADD_TIME:
      return buildAddTimeCommand(task, route);
    case PLANNER_ACTIONS.ADD_TASK:
      return buildCreateOrMergeTaskCommand(route);
    case PLANNER_ACTIONS.TOGGLE_SUBTASK:
      return buildToggleSubtaskCommand(task, route);
    case PLANNER_COMMAND_TYPES.TASK_APPLY_EXTRACTION_HINTS:
      return buildApplyExtractionHintsCommand(route);
    default:
      return {};
  }
}

module.exports = {
  buildAddSubtaskCommand,
  buildAddTimeCommand,
  buildApplyExtractionHintsCommand,
  buildBulkMoveCompletedToCemeteryCommand,
  buildCreateOrMergeTaskCommand,
  buildCreateSnapshotCommand,
  buildDeleteForeverCommand,
  buildDeleteSubtaskCommand,
  buildEditSubtaskCommand,
  buildEditTaskCommand,
  buildLinkTelegramChatCommand,
  buildReorderCommand,
  buildRepairProtectedTasksCommand,
  buildRescueCommand,
  buildRestoreSnapshotCommand,
  buildPlannerActionRouteCommand,
  buildTaskIdCommand,
  buildTaskTuningCommand,
  buildToggleSubtaskCommand,
};
