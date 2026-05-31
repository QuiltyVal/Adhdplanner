export function updateGuestTaskFields(task, fields = {}, options = {}) {
  const markTaskPendingSync = options.markTaskPendingSync;
  if (typeof markTaskPendingSync !== "function") {
    throw new Error("updateGuestTaskFields requires markTaskPendingSync");
  }

  return markTaskPendingSync(
    {
      ...task,
      ...fields,
      lastUpdated: Date.now(),
    },
    task,
  );
}

export function toggleGuestTaskBoolean(task, fieldName, options = {}) {
  return updateGuestTaskFields(
    task,
    { [fieldName]: !Boolean(task?.[fieldName]) },
    options,
  );
}

export function touchGuestTask(task, options = {}) {
  const touchHeatBonus = Number(options.touchHeatBonus || 0);
  const defaultTaskHeat = Number(options.defaultTaskHeat || 35);
  const withActiveDay = options.withActiveDay;
  const currentHeat = typeof task?.heatCurrent === "number"
    ? task.heatCurrent
    : typeof task?.heatBase === "number"
      ? task.heatBase
      : defaultTaskHeat;
  const newHeatBase = Math.min(100, currentHeat + touchHeatBonus);
  const nextTask = {
    ...task,
    heatBase: newHeatBase,
    heatCurrent: newHeatBase,
  };
  return updateGuestTaskFields(
    typeof withActiveDay === "function" ? withActiveDay(nextTask) : nextTask,
    {},
    options,
  );
}

export function editGuestTaskTitle(task, cleanText, options = {}) {
  const previousText = String(task?.text || "");
  if (previousText.trim() === String(cleanText || "").trim()) return null;
  const withActiveDay = options.withActiveDay;
  const nextTask = {
    ...task,
    text: String(cleanText || "").trim(),
  };
  return updateGuestTaskFields(
    typeof withActiveDay === "function" ? withActiveDay(nextTask) : nextTask,
    {},
    options,
  );
}

export function addGuestTaskTime(task, elapsedMs, dayKey, options = {}) {
  const cleanElapsedMs = Number(elapsedMs || 0);
  if (!cleanElapsedMs || cleanElapsedMs <= 0) return null;
  const cleanDayKey = String(dayKey || "").trim();
  const withActiveDay = options.withActiveDay;
  const timeByDay = { ...(task?.timeByDay || {}) };
  if (cleanDayKey) {
    timeByDay[cleanDayKey] = (timeByDay[cleanDayKey] || 0) + cleanElapsedMs;
  }
  const nextTask = {
    ...task,
    timeSpent: (task?.timeSpent || 0) + cleanElapsedMs,
    timeByDay,
  };
  return updateGuestTaskFields(
    typeof withActiveDay === "function" ? withActiveDay(nextTask) : nextTask,
    {},
    options,
  );
}

export function createGuestTask({
  id,
  text,
  subtasks = [],
  urgency = "medium",
  resistance = "medium",
  tasks = [],
  defaultTaskHeat = 35,
  getNextTaskOrder,
  markTaskPendingSync,
} = {}) {
  if (typeof markTaskPendingSync !== "function") {
    throw new Error("createGuestTask requires markTaskPendingSync");
  }
  const cleanText = String(text || "").trim();
  if (!cleanText) return null;
  const now = Number(id || Date.now());
  return markTaskPendingSync({
    id: String(id || now),
    text: cleanText,
    createdAt: now,
    lastUpdated: now,
    heatBase: defaultTaskHeat,
    heatCurrent: defaultTaskHeat,
    status: "active",
    position: typeof getNextTaskOrder === "function" ? getNextTaskOrder(tasks, "active") : undefined,
    subtasks: Array.isArray(subtasks) ? subtasks : [],
    urgency,
    resistance,
    isToday: false,
    isVital: false,
  });
}

export function addGuestSubtask(task, text, options = {}) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return null;
  const subtaskId = String(options.subtaskId || Date.now());
  return updateGuestTaskFields(
    task,
    {
      subtasks: [
        ...(Array.isArray(task?.subtasks) ? task.subtasks : []),
        { id: subtaskId, text: cleanText, completed: false },
      ],
    },
    options,
  );
}

export function deleteGuestSubtask(task, subtaskId, options = {}) {
  const currentSubtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  const targetSubtask = currentSubtasks.find((subtask) => String(subtask.id) === String(subtaskId));
  if (!targetSubtask) return null;
  return updateGuestTaskFields(
    task,
    {
      subtasks: currentSubtasks.filter((subtask) => String(subtask.id) !== String(subtaskId)),
    },
    options,
  );
}

export function editGuestSubtask(task, subtaskId, cleanText, options = {}) {
  const nextText = String(cleanText || "").trim();
  if (!nextText) return null;
  const currentSubtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  const targetSubtask = currentSubtasks.find((subtask) => String(subtask.id) === String(subtaskId));
  if (!targetSubtask) return null;
  if (String(targetSubtask.text || "").trim() === nextText) return null;
  const withActiveDay = options.withActiveDay;
  const nextTask = {
    ...task,
    subtasks: currentSubtasks.map((subtask) => (
      String(subtask.id) === String(subtaskId)
        ? { ...subtask, text: nextText }
        : subtask
    )),
  };
  return updateGuestTaskFields(
    typeof withActiveDay === "function" ? withActiveDay(nextTask) : nextTask,
    {},
    options,
  );
}

export function toggleGuestSubtask(task, subtaskId, options = {}) {
  const subtaskCompletionCap = Number(options.subtaskCompletionCap || 18);
  const withActiveDay = options.withActiveDay;
  const currentSubtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  const targetSubtask = currentSubtasks.find((subtask) => String(subtask.id) === String(subtaskId));
  if (!targetSubtask) return null;

  const nextCompleted = !Boolean(targetSubtask.completed);
  const completedBefore = currentSubtasks.filter((subtask) => subtask.completed).length;
  const newSubtasks = currentSubtasks.map((subtask) => (
    String(subtask.id) === String(subtaskId)
      ? { ...subtask, completed: nextCompleted }
      : subtask
  ));
  const completedAfter = newSubtasks.filter((subtask) => subtask.completed).length;
  const completionDelta = completedAfter - completedBefore;
  const subtaskWeight = newSubtasks.length > 0 ? (subtaskCompletionCap / newSubtasks.length) : 0;
  const currentHeat = typeof task?.heatCurrent === "number"
    ? task.heatCurrent
    : typeof task?.heatBase === "number"
      ? task.heatBase
      : 35;
  const newHeatBase = Math.min(100, Math.max(0, currentHeat + completionDelta * subtaskWeight));
  const nextTask = {
    ...task,
    subtasks: newSubtasks,
    heatBase: newHeatBase,
    heatCurrent: newHeatBase,
  };
  return updateGuestTaskFields(
    typeof withActiveDay === "function" ? withActiveDay(nextTask) : nextTask,
    {},
    options,
  );
}

export function appendGuestUniqueSubtasks(task, stepTexts = [], options = {}) {
  const normalizeText = typeof options.normalizeText === "function"
    ? options.normalizeText
    : (value) => String(value || "").trim();
  const isNearDuplicate = typeof options.isNearDuplicate === "function"
    ? options.isNearDuplicate
    : (left, right) => normalizeText(left).toLowerCase() === normalizeText(right).toLowerCase();
  const withActiveDay = options.withActiveDay;
  const existingSubtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  const now = Date.now();
  const appendedSubtasks = [];

  for (const stepText of Array.isArray(stepTexts) ? stepTexts : []) {
    const normalizedStep = normalizeText(stepText);
    if (!normalizedStep) continue;
    if (isNearDuplicate(normalizedStep, task?.text || "")) continue;

    const duplicateInTask = existingSubtasks.some((subtask) => (
      isNearDuplicate(subtask.text || "", normalizedStep)
    ));
    if (duplicateInTask) continue;

    const duplicateInAppend = appendedSubtasks.some((subtask) => (
      isNearDuplicate(subtask.text || "", normalizedStep)
    ));
    if (duplicateInAppend) continue;

    appendedSubtasks.push({
      id: `${task.id}-sub-${now}-${appendedSubtasks.length + 1}`,
      text: normalizedStep,
      completed: false,
    });
  }

  if (appendedSubtasks.length === 0) {
    return { task: null, addedCount: 0 };
  }

  const nextTask = {
    ...task,
    subtasks: [...existingSubtasks, ...appendedSubtasks],
    lastUpdated: Date.now(),
  };

  return {
    task: updateGuestTaskFields(
      typeof withActiveDay === "function" ? withActiveDay(nextTask) : nextTask,
      {},
      options,
    ),
    addedCount: appendedSubtasks.length,
  };
}

export function completeGuestTask(task, options = {}) {
  if (task?.status !== "active") return null;
  const markTaskPendingSync = options.markTaskPendingSync;
  const getNextTaskOrder = options.getNextTaskOrder;
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  if (typeof markTaskPendingSync !== "function") {
    throw new Error("completeGuestTask requires markTaskPendingSync");
  }
  const now = Date.now();
  const completedSubtasks = (Array.isArray(task?.subtasks) ? task.subtasks : [])
    .map((subtask) => ({ ...subtask, completed: true }));
  return markTaskPendingSync(
    {
      ...task,
      status: "completed",
      isToday: false,
      lastUpdated: now,
      completedAt: now,
      deadAt: null,
      subtasks: completedSubtasks,
      heatBase: 100,
      heatCurrent: 100,
      position: typeof getNextTaskOrder === "function"
        ? getNextTaskOrder(tasks, "completed")
        : task.position,
    },
    task,
  );
}

export function setGuestHeatZone(task, heat, options = {}) {
  const getNextTaskOrder = options.getNextTaskOrder;
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const wasInactive = task?.status === "completed" || task?.status === "dead";
  const nextPosition = wasInactive && typeof getNextTaskOrder === "function"
    ? getNextTaskOrder(tasks, "active")
    : task?.position;

  return {
    previousStatus: task?.status || null,
    task: updateGuestTaskFields(
      task,
      {
        heatBase: heat,
        heatCurrent: heat,
        ...(wasInactive
          ? { status: "active", isToday: false, deadAt: null, position: nextPosition }
          : {}),
      },
      options,
    ),
  };
}

export function moveGuestTaskToCemetery(task, options = {}) {
  const markTaskPendingSync = options.markTaskPendingSync;
  const getNextTaskOrder = options.getNextTaskOrder;
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const taskId = options.taskId || task?.id;
  if (typeof markTaskPendingSync !== "function") {
    throw new Error("moveGuestTaskToCemetery requires markTaskPendingSync");
  }
  const now = Date.now();
  return markTaskPendingSync(
    {
      ...task,
      status: "dead",
      isToday: false,
      lastUpdated: now,
      deadAt: now,
      position: typeof getNextTaskOrder === "function"
        ? getNextTaskOrder(tasks, "dead", taskId)
        : task.position,
    },
    task,
  );
}

export function reopenGuestTask(task, options = {}) {
  const markTaskPendingSync = options.markTaskPendingSync;
  const getNextTaskOrder = options.getNextTaskOrder;
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const taskId = options.taskId || task?.id;
  const defaultTaskHeat = Number(options.defaultTaskHeat || 35);
  if (typeof markTaskPendingSync !== "function") {
    throw new Error("reopenGuestTask requires markTaskPendingSync");
  }
  return markTaskPendingSync(
    {
      ...task,
      status: "active",
      heatBase: defaultTaskHeat,
      heatCurrent: defaultTaskHeat,
      lastUpdated: Date.now(),
      isToday: false,
      deadAt: null,
      position: typeof getNextTaskOrder === "function"
        ? getNextTaskOrder(tasks, "active", taskId)
        : task.position,
    },
    task,
  );
}

export function toggleGuestToday(task, currentTasks = [], options = {}) {
  const currentTodayCount = (Array.isArray(currentTasks) ? currentTasks : [])
    .filter((currentTask) => currentTask.status === "active" && currentTask.isToday)
    .length;
  const nextValue = !Boolean(task?.isToday);
  if (nextValue && currentTodayCount >= Number(options.todayLimit || 3)) {
    return { task: null, limitHit: true, nextValue };
  }
  return {
    task: updateGuestTaskFields(task, { isToday: nextValue }, options),
    limitHit: false,
    nextValue,
  };
}
