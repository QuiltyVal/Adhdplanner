const {
  ALLOWED_PLANNER_ACTIONS,
  ALLOWED_PLANNER_ACTION_SET,
  PLANNER_ACTIONS,
} = require("./planner-action-types");
const ACTIONS_REQUIRING_TASK_REF = new Set([
  PLANNER_ACTIONS.COMPLETE_TASK,
  PLANNER_ACTIONS.KILL_TASK,
  PLANNER_ACTIONS.REOPEN_TASK,
  PLANNER_ACTIONS.TOUCH_TASK,
  PLANNER_ACTIONS.RESCUE_STARTED,
  PLANNER_ACTIONS.RESCUE_SHIFT_RECORDED,
  PLANNER_ACTIONS.RESCUE_COMPLETED,
  PLANNER_ACTIONS.ADD_TIME,
  PLANNER_ACTIONS.SET_TODAY,
  PLANNER_ACTIONS.UNSET_TODAY,
  PLANNER_ACTIONS.SET_VITAL,
  PLANNER_ACTIONS.UNSET_VITAL,
  PLANNER_ACTIONS.SET_URGENCY,
  PLANNER_ACTIONS.SET_RESISTANCE,
  PLANNER_ACTIONS.SET_DEADLINE,
  PLANNER_ACTIONS.MARK_NOT_YOUR_MOVE,
  PLANNER_ACTIONS.CLEAR_NOT_YOUR_MOVE,
  PLANNER_ACTIONS.SET_CHECKIN,
  PLANNER_ACTIONS.TOGGLE_SUBTASK,
  PLANNER_ACTIONS.EDIT_TASK,
  PLANNER_ACTIONS.EDIT_SUBTASK,
]);
const URGENCY_VALUES = new Set(["low", "medium", "high"]);
const RESISTANCE_VALUES = new Set(["low", "medium", "high"]);
const HEAT_ZONE_VALUES = new Set(["focus", "background", "purgatory"]);
const NOT_YOUR_MOVE_REASON_VALUES = new Set([
  "waiting_for_person",
  "waiting_for_organization",
  "waiting_for_document",
  "waiting_for_access",
  "waiting_for_money",
  "other",
]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function pickFirstString(...values) {
  for (const value of values) {
    const text = normalizeString(value);
    if (text) return text;
  }
  return "";
}

function normalizeAction(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(lowered)) return true;
    if (["false", "0", "no", "n", "off"].includes(lowered)) return false;
  }
  return false;
}

function normalizeEnum(value, allowedSet, fallback) {
  const normalized = normalizeString(value).toLowerCase();
  if (allowedSet.has(normalized)) return normalized;
  return fallback;
}

function normalizePositiveInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizePositiveMillis(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function normalizeStringArray(value, maxItems = 20) {
  if (!Array.isArray(value)) return [];

  const output = [];
  const seen = new Set();
  for (const item of value) {
    const text = normalizeString(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= maxItems) break;
  }
  return output;
}

function extractTaskRef(payload) {
  return pickFirstString(
    payload.taskId,
    payload.taskRef,
    payload.taskText,
    payload.task,
    payload.query,
    payload.target,
  );
}

function pushFieldError(errors, field, message) {
  errors.push({ field, message });
}

function buildRoute(action, payload, source, errors) {
  if (action === PLANNER_ACTIONS.SHOW_TODAY) {
    return { type: PLANNER_ACTIONS.SHOW_TODAY, source };
  }

  if (action === PLANNER_ACTIONS.SHOW_COMPLETED) {
    return { type: PLANNER_ACTIONS.SHOW_COMPLETED, source };
  }

  if (action === PLANNER_ACTIONS.PANIC) {
    return { type: PLANNER_ACTIONS.PANIC, source };
  }

  if (action === PLANNER_ACTIONS.PANIC_TASK) {
    const taskRef = extractTaskRef(payload);
    return {
      type: PLANNER_ACTIONS.PANIC_TASK,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
    };
  }

  if (action === PLANNER_ACTIONS.SUGGEST_UNPIN) {
    return { type: PLANNER_ACTIONS.SUGGEST_UNPIN, source };
  }

  if (action === PLANNER_ACTIONS.CHAT) {
    const rawText = pickFirstString(payload.rawText, payload.text);
    return {
      type: PLANNER_ACTIONS.CHAT,
      source,
      rawText,
      replyText: normalizeString(payload.replyText),
    };
  }

  if (action === PLANNER_ACTIONS.ADD_TASK) {
    const taskText = pickFirstString(payload.taskText, payload.text, payload.rawText);
    if (!taskText) {
      pushFieldError(errors, "payload.taskText", "taskText is required for add_task");
    }

    return {
      type: PLANNER_ACTIONS.ADD_TASK,
      source,
      rawText: pickFirstString(payload.rawText, payload.text, taskText),
      taskText,
      urgency: normalizeEnum(payload.urgency, URGENCY_VALUES, "medium"),
      resistance: normalizeEnum(payload.resistance, RESISTANCE_VALUES, "medium"),
      isToday: normalizeBoolean(payload.isToday),
      isVital: normalizeBoolean(payload.isVital),
      deadlineAt: normalizeString(payload.deadlineAt),
      lifeArea: normalizeString(payload.lifeArea),
      commitmentIds: normalizeStringArray(payload.commitmentIds, 10),
      subtasks: normalizeStringArray(payload.subtasks, 20),
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.ADD_TIME) {
    const taskRef = extractTaskRef(payload);
    const elapsedMs = normalizePositiveInt(payload.elapsedMs || payload.durationMs || payload.ms);
    const durationMinutes = normalizePositiveInt(payload.durationMinutes || payload.minutes);
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for add_time");
    }
    if (!elapsedMs && !durationMinutes) {
      pushFieldError(errors, "payload.elapsedMs", "elapsedMs or durationMinutes is required for add_time");
    }

    return {
      type: PLANNER_ACTIONS.ADD_TIME,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      elapsedMs: elapsedMs || durationMinutes * 60 * 1000,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.BULK_MOVE_COMPLETED_TO_CEMETERY) {
    const taskIds = normalizeStringArray(payload.taskIds, 80);
    if (taskIds.length === 0) {
      pushFieldError(errors, "payload.taskIds", "taskIds are required for bulk_move_completed_to_cemetery");
    }

    return {
      type: PLANNER_ACTIONS.BULK_MOVE_COMPLETED_TO_CEMETERY,
      source,
      taskIds,
      protectedCount: normalizePositiveInt(payload.protectedCount) || 0,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.DELETE_TASK_FOREVER) {
    const taskRef = extractTaskRef(payload);
    const taskIds = normalizeStringArray(payload.taskIds, 80);
    if (!taskRef && taskIds.length === 0) {
      pushFieldError(errors, "payload.taskRef", "taskRef or taskIds are required for delete_task_forever");
    }

    return {
      type: PLANNER_ACTIONS.DELETE_TASK_FOREVER,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      taskIds,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.RESTORE_SNAPSHOT) {
    const snapshotId = pickFirstString(payload.snapshotId, payload.id, payload.snapshot_id);
    if (!snapshotId) {
      pushFieldError(errors, "payload.snapshotId", "snapshotId is required for restore_snapshot");
    }
    return {
      type: PLANNER_ACTIONS.RESTORE_SNAPSHOT,
      source,
      rawText: pickFirstString(payload.rawText),
      snapshotId,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.CREATE_SNAPSHOT) {
    return {
      type: PLANNER_ACTIONS.CREATE_SNAPSHOT,
      source,
      rawText: pickFirstString(payload.rawText),
      reason: normalizeString(payload.reason),
      snapshotSource: normalizeString(payload.snapshotSource || payload.sourceLabel),
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.REPAIR_PROTECTED_TASKS) {
    const taskIds = normalizeStringArray(payload.taskIds || payload.ids).slice(0, 80);
    return {
      type: PLANNER_ACTIONS.REPAIR_PROTECTED_TASKS,
      source,
      rawText: pickFirstString(payload.rawText),
      taskIds,
      reason: normalizeString(payload.reason),
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.ADD_SUBTASK) {
    const taskRef = extractTaskRef(payload);
    const subtaskText = pickFirstString(payload.subtaskText, payload.subtask);
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for add_subtask");
    }
    if (!subtaskText) {
      pushFieldError(errors, "payload.subtaskText", "subtaskText is required for add_subtask");
    }

    return {
      type: PLANNER_ACTIONS.ADD_SUBTASK,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      subtaskText,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.EDIT_TASK) {
    const taskRef = extractTaskRef(payload);
    const newTaskText = pickFirstString(payload.newTaskText, payload.newText, payload.title, payload.text);
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for edit_task");
    }
    if (!newTaskText) {
      pushFieldError(errors, "payload.newTaskText", "newTaskText is required for edit_task");
    }

    return {
      type: PLANNER_ACTIONS.EDIT_TASK,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      newTaskText,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.EDIT_SUBTASK) {
    const taskRef = extractTaskRef(payload);
    const subtaskId = pickFirstString(payload.subtaskId, payload.subtaskRef, payload.subtask_id);
    const newSubtaskText = pickFirstString(payload.newSubtaskText, payload.newText, payload.text);
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for edit_subtask");
    }
    if (!subtaskId) {
      pushFieldError(errors, "payload.subtaskId", "subtaskId is required for edit_subtask");
    }
    if (!newSubtaskText) {
      pushFieldError(errors, "payload.newSubtaskText", "newSubtaskText is required for edit_subtask");
    }

    return {
      type: PLANNER_ACTIONS.EDIT_SUBTASK,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      subtaskId,
      newSubtaskText,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.TOGGLE_SUBTASK) {
    const taskRef = extractTaskRef(payload);
    const subtaskId = pickFirstString(payload.subtaskId, payload.subtaskRef, payload.subtask_id);
    const completedValue = payload.completed !== undefined
      ? payload.completed
      : payload.isCompleted !== undefined
        ? payload.isCompleted
        : payload.done;

    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for toggle_subtask");
    }
    if (!subtaskId) {
      pushFieldError(errors, "payload.subtaskId", "subtaskId is required for toggle_subtask");
    }

    return {
      type: PLANNER_ACTIONS.TOGGLE_SUBTASK,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      subtaskId,
      completed: completedValue === undefined || completedValue === null || completedValue === ""
        ? null
        : normalizeBoolean(completedValue),
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.DELETE_SUBTASK) {
    const taskRef = extractTaskRef(payload);
    const taskText = pickFirstString(payload.taskText, payload.taskRef, payload.task, taskRef);
    const subtaskId = pickFirstString(payload.subtaskId, payload.subtaskRef, payload.subtask_id);
    const subtaskText = pickFirstString(payload.subtaskText, payload.subtask);
    if (!taskText) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for delete_subtask");
    }
    if (!subtaskId && !subtaskText) {
      pushFieldError(errors, "payload.subtaskId", "subtaskId or subtaskText is required for delete_subtask");
    }

    return {
      type: PLANNER_ACTIONS.DELETE_SUBTASK,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef: taskRef || taskText,
      taskText,
      subtaskId,
      subtaskText,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.SCHEDULE_TASK) {
    const taskRef = extractTaskRef(payload);
    const taskText = pickFirstString(payload.taskText, payload.text);
    const deadlineAt = pickFirstString(payload.deadlineAt, payload.date);
    const startTime = pickFirstString(payload.startTime, payload.time);
    const durationMinutes = normalizePositiveInt(payload.durationMinutes);

    if (!taskRef && !taskText) {
      pushFieldError(errors, "payload.taskRef", "taskRef or taskText is required for schedule_task");
    }
    if (!deadlineAt) {
      pushFieldError(errors, "payload.deadlineAt", "deadlineAt is required for schedule_task");
    } else if (!ISO_DATE_RE.test(deadlineAt)) {
      pushFieldError(errors, "payload.deadlineAt", "deadlineAt must be in YYYY-MM-DD format");
    }
    if (!startTime) {
      pushFieldError(errors, "payload.startTime", "startTime is required for schedule_task");
    } else if (!TIME_RE.test(startTime)) {
      pushFieldError(errors, "payload.startTime", "startTime must be in HH:MM 24h format");
    }
    if (payload.durationMinutes !== undefined && payload.durationMinutes !== null && durationMinutes === null) {
      pushFieldError(errors, "payload.durationMinutes", "durationMinutes must be a positive integer");
    }

    return {
      type: PLANNER_ACTIONS.SCHEDULE_TASK,
      source,
      rawText: pickFirstString(payload.rawText, payload.text),
      taskRef,
      taskText: taskText || taskRef,
      deadlineAt,
      startTime,
      durationMinutes,
    };
  }

  if (action === PLANNER_ACTIONS.SET_URGENCY) {
    const taskRef = extractTaskRef(payload);
    const urgency = normalizeEnum(payload.urgency, URGENCY_VALUES, "");
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for set_urgency");
    }
    if (!urgency) {
      pushFieldError(errors, "payload.urgency", "urgency must be low, medium, or high");
    }
    return {
      type: PLANNER_ACTIONS.SET_URGENCY,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      urgency,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.SET_RESISTANCE) {
    const taskRef = extractTaskRef(payload);
    const resistance = normalizeEnum(payload.resistance, RESISTANCE_VALUES, "");
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for set_resistance");
    }
    if (!resistance) {
      pushFieldError(errors, "payload.resistance", "resistance must be low, medium, or high");
    }
    return {
      type: PLANNER_ACTIONS.SET_RESISTANCE,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      resistance,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.SET_DEADLINE) {
    const taskRef = extractTaskRef(payload);
    const deadlineAt = normalizeString(payload.deadlineAt);
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for set_deadline");
    }
    if (deadlineAt && !ISO_DATE_RE.test(deadlineAt)) {
      pushFieldError(errors, "payload.deadlineAt", "deadlineAt must be empty or in YYYY-MM-DD format");
    }
    return {
      type: PLANNER_ACTIONS.SET_DEADLINE,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      deadlineAt,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.SET_HEAT_ZONE) {
    const taskRef = extractTaskRef(payload);
    const heatZone = normalizeEnum(payload.heatZone || payload.zone, HEAT_ZONE_VALUES, "");
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for set_heat_zone");
    }
    if (!heatZone) {
      pushFieldError(errors, "payload.heatZone", "heatZone must be focus, background, or purgatory");
    }
    return {
      type: PLANNER_ACTIONS.SET_HEAT_ZONE,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      heatZone,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.MARK_NOT_YOUR_MOVE) {
    const taskRef = extractTaskRef(payload);
    const reason = normalizeEnum(payload.reason || payload.blockedReason, NOT_YOUR_MOVE_REASON_VALUES, "other");
    const nextCheckInAt = normalizePositiveMillis(payload.nextCheckInAt);
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for mark_not_your_move");
    }
    if (payload.nextCheckInAt !== undefined && payload.nextCheckInAt !== null && !nextCheckInAt) {
      pushFieldError(errors, "payload.nextCheckInAt", "nextCheckInAt must be a future timestamp in milliseconds");
    }
    return {
      type: PLANNER_ACTIONS.MARK_NOT_YOUR_MOVE,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      reason,
      waitingFor: normalizeString(payload.waitingFor),
      lastUserAction: normalizeString(payload.lastUserAction),
      nextCheckInAt,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.SET_CHECKIN) {
    const taskRef = extractTaskRef(payload);
    const nextCheckInAt = normalizePositiveMillis(payload.nextCheckInAt);
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for set_checkin");
    }
    if (!nextCheckInAt) {
      pushFieldError(errors, "payload.nextCheckInAt", "nextCheckInAt is required for set_checkin");
    }
    return {
      type: PLANNER_ACTIONS.SET_CHECKIN,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      reason: normalizeEnum(payload.reason || payload.blockedReason, NOT_YOUR_MOVE_REASON_VALUES, "other"),
      waitingFor: normalizeString(payload.waitingFor),
      lastUserAction: normalizeString(payload.lastUserAction),
      nextCheckInAt,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.CLEAR_NOT_YOUR_MOVE) {
    const taskRef = extractTaskRef(payload);
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for clear_not_your_move");
    }
    return {
      type: PLANNER_ACTIONS.CLEAR_NOT_YOUR_MOVE,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if (action === PLANNER_ACTIONS.REORDER_TASK) {
    const taskRef = extractTaskRef(payload);
    const overTaskRef = pickFirstString(
      payload.overTaskId,
      payload.overTaskRef,
      payload.targetTaskId,
      payload.targetTaskRef,
    );
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for reorder_task");
    }
    if (!overTaskRef) {
      pushFieldError(errors, "payload.overTaskRef", "overTaskRef is required for reorder_task");
    }
    return {
      type: PLANNER_ACTIONS.REORDER_TASK,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      overTaskRef,
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  if ([
    PLANNER_ACTIONS.COMPLETE_TASK,
    PLANNER_ACTIONS.KILL_TASK,
    PLANNER_ACTIONS.TOUCH_TASK,
    PLANNER_ACTIONS.RESCUE_ABORTED,
    PLANNER_ACTIONS.RESCUE_CLOSED_LATER,
    PLANNER_ACTIONS.RESCUE_STARTED,
    PLANNER_ACTIONS.RESCUE_SHIFT_RECORDED,
    PLANNER_ACTIONS.RESCUE_COMPLETED,
    PLANNER_ACTIONS.REOPEN_TASK,
    PLANNER_ACTIONS.SET_TODAY,
    PLANNER_ACTIONS.UNSET_TODAY,
    PLANNER_ACTIONS.SET_VITAL,
    PLANNER_ACTIONS.UNSET_VITAL,
  ].includes(action)) {
    const taskRef = extractTaskRef(payload);
    if (ACTIONS_REQUIRING_TASK_REF.has(action) && !taskRef) {
      pushFieldError(errors, "payload.taskRef", `taskRef is required for ${action}`);
    }
    return {
      type: action,
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      microstepText: normalizeString(payload.microstepText || payload.stepText),
      durationMs: normalizePositiveInt(payload.durationMs),
      idempotencyKey: normalizeString(payload.idempotencyKey),
      commandId: normalizeString(payload.commandId),
    };
  }

  return { type: action, source };
}

function validatePlannerActionRequest(input) {
  const errors = [];

  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [{ field: "body", message: "request body must be an object" }],
      request: null,
    };
  }

  const action = normalizeAction(input.action);
  if (!action) {
    pushFieldError(errors, "action", "action is required");
  } else if (!ALLOWED_PLANNER_ACTION_SET.has(action)) {
    pushFieldError(errors, "action", `action must be one of: ${ALLOWED_PLANNER_ACTIONS.join(", ")}`);
  }

  const payloadInput = input.payload === undefined || input.payload === null ? {} : input.payload;
  if (!isPlainObject(payloadInput)) {
    pushFieldError(errors, "payload", "payload must be an object");
  }
  const payload = isPlainObject(payloadInput) ? payloadInput : {};

  const source = pickFirstString(input.source) || "planner_actions_api";
  const userId = normalizeString(input.userId);
  const chatId = normalizeString(input.chatId);

  let route = null;
  if (action && ALLOWED_PLANNER_ACTION_SET.has(action) && isPlainObject(payloadInput)) {
    route = buildRoute(action, payload, source, errors);
  }

  return {
    ok: errors.length === 0,
    errors,
    request: {
      userId,
      chatId,
      action,
      source,
      payload,
      route,
    },
  };
}

module.exports = {
  ALLOWED_PLANNER_ACTIONS,
  PLANNER_ACTIONS,
  validatePlannerActionRequest,
};
