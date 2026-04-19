const ALLOWED_PLANNER_ACTIONS = [
  "show_today",
  "show_completed",
  "panic",
  "panic_task",
  "add_task",
  "complete_task",
  "reopen_task",
  "set_today",
  "unset_today",
  "set_vital",
  "unset_vital",
  "add_subtask",
  "delete_subtask",
  "suggest_unpin",
  "schedule_task",
  "chat",
];

const ALLOWED_PLANNER_ACTION_SET = new Set(ALLOWED_PLANNER_ACTIONS);
const ACTIONS_REQUIRING_TASK_REF = new Set([
  "complete_task",
  "set_today",
  "unset_today",
  "set_vital",
  "unset_vital",
]);
const URGENCY_VALUES = new Set(["low", "medium", "high"]);
const RESISTANCE_VALUES = new Set(["low", "medium", "high"]);
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
  if (action === "show_today") {
    return { type: "show_today", source };
  }

  if (action === "show_completed") {
    return { type: "show_completed", source };
  }

  if (action === "panic") {
    return { type: "panic", source };
  }

  if (action === "panic_task") {
    const taskRef = extractTaskRef(payload);
    return {
      type: "panic_task",
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
    };
  }

  if (action === "suggest_unpin") {
    return { type: "suggest_unpin", source };
  }

  if (action === "chat") {
    const rawText = pickFirstString(payload.rawText, payload.text);
    return {
      type: "chat",
      source,
      rawText,
      replyText: normalizeString(payload.replyText),
    };
  }

  if (action === "add_task") {
    const taskText = pickFirstString(payload.taskText, payload.text, payload.rawText);
    if (!taskText) {
      pushFieldError(errors, "payload.taskText", "taskText is required for add_task");
    }

    return {
      type: "add_task",
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
    };
  }

  if (action === "add_subtask") {
    const taskRef = extractTaskRef(payload);
    const subtaskText = pickFirstString(payload.subtaskText, payload.subtask);
    if (!taskRef) {
      pushFieldError(errors, "payload.taskRef", "taskRef is required for add_subtask");
    }
    if (!subtaskText) {
      pushFieldError(errors, "payload.subtaskText", "subtaskText is required for add_subtask");
    }

    return {
      type: "add_subtask",
      source,
      rawText: pickFirstString(payload.rawText),
      taskRef,
      taskText: normalizeString(payload.taskText) || taskRef,
      subtaskText,
    };
  }

  if (action === "delete_subtask") {
    const taskText = pickFirstString(payload.taskText, payload.taskRef, payload.task);
    const subtaskText = pickFirstString(payload.subtaskText, payload.subtask);
    if (!taskText) {
      pushFieldError(errors, "payload.taskText", "taskText is required for delete_subtask");
    }
    if (!subtaskText) {
      pushFieldError(errors, "payload.subtaskText", "subtaskText is required for delete_subtask");
    }

    return {
      type: "delete_subtask",
      source,
      rawText: pickFirstString(payload.rawText),
      taskText,
      subtaskText,
    };
  }

  if (action === "schedule_task") {
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
      type: "schedule_task",
      source,
      rawText: pickFirstString(payload.rawText, payload.text),
      taskRef,
      taskText: taskText || taskRef,
      deadlineAt,
      startTime,
      durationMinutes,
    };
  }

  if (["complete_task", "reopen_task", "set_today", "unset_today", "set_vital", "unset_vital"].includes(action)) {
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
  validatePlannerActionRequest,
};
