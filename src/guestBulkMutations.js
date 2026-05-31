import { resolveTaskOrderValue, sortTasksByOrder } from "./taskOrderUtils";

function requireMarkTaskPendingSync(options = {}, name = "guest bulk mutation") {
  if (typeof options.markTaskPendingSync !== "function") {
    throw new Error(`${name} requires markTaskPendingSync`);
  }
  return options.markTaskPendingSync;
}

export function reorderGuestActiveTasks(tasks = [], dragTaskId, overTaskId, options = {}) {
  const markTaskPendingSync = requireMarkTaskPendingSync(options, "reorderGuestActiveTasks");
  const getActiveZoneHeat = options.getActiveZoneHeat;
  const normalizedDragTaskId = String(dragTaskId || "");
  const normalizedOverTaskId = String(overTaskId || "");
  const activeOrdered = sortTasksByOrder(tasks.filter((task) => task?.status === "active"));
  const fromIndex = activeOrdered.findIndex((task) => String(task.id) === normalizedDragTaskId);
  const toIndex = activeOrdered.findIndex((task) => String(task.id) === normalizedOverTaskId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return { tasks, changedTasks: [] };
  }

  const targetTask = activeOrdered[toIndex];
  const targetHeat = typeof getActiveZoneHeat === "function" ? getActiveZoneHeat(targetTask) : null;
  const now = Date.now();
  const reordered = [...activeOrdered];
  const [item] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, item);

  const nextActiveById = new Map();
  const heatByTaskId = new Map(
    typeof targetHeat === "number" ? [[normalizedDragTaskId, [targetHeat, targetHeat]]] : [],
  );

  reordered.forEach((task, index) => {
    const currentTaskId = String(task.id);
    const nextHeat = heatByTaskId.get(currentTaskId);
    const targetPosition = index + 1;
    const needsPositionFix = resolveTaskOrderValue(task) !== targetPosition;
    const needsHeatFix = Boolean(
      nextHeat && (task.heatBase !== nextHeat[0] || task.heatCurrent !== nextHeat[1]),
    );

    if (!needsPositionFix && !needsHeatFix) return;

    nextActiveById.set(
      currentTaskId,
      markTaskPendingSync(
        {
          ...task,
          ...(needsPositionFix ? { position: targetPosition } : {}),
          ...(needsHeatFix ? { heatBase: nextHeat[0], heatCurrent: nextHeat[1] } : {}),
          lastUpdated: now,
        },
        task,
      ),
    );
  });

  const nextTasks = tasks.map((task) => {
    if (task?.status !== "active") return task;
    return nextActiveById.get(String(task.id)) || task;
  });

  return {
    tasks: nextTasks,
    changedTasks: nextTasks.filter((task) => nextActiveById.has(String(task.id))),
  };
}

export function moveGuestTasksToCemetery(tasks = [], taskIds = [], options = {}) {
  const markTaskPendingSync = requireMarkTaskPendingSync(options, "moveGuestTasksToCemetery");
  const targetIds = new Set(taskIds.map((taskId) => String(taskId)));
  if (targetIds.size === 0) return { tasks, movedTasks: [] };

  const now = Date.now();
  let nextDeadOrder = Number(options.startDeadOrder || 1);
  const movedTasks = [];
  const movedById = new Map();

  tasks.forEach((task) => {
    if (!targetIds.has(String(task?.id))) return;
    const nextTask = markTaskPendingSync(
      {
        ...task,
        status: "dead",
        isToday: false,
        lastUpdated: now,
        deadAt: now,
        position: nextDeadOrder,
      },
      task,
    );
    nextDeadOrder += 1;
    movedTasks.push(nextTask);
    movedById.set(String(task.id), nextTask);
  });

  return {
    tasks: tasks.map((task) => movedById.get(String(task?.id)) || task),
    movedTasks,
  };
}

export function removeGuestTasksById(tasks = [], taskIds = []) {
  const targetIds = new Set(taskIds.map((taskId) => String(taskId)));
  if (targetIds.size === 0) return { tasks, removedTasks: [] };
  const removedTasks = tasks.filter((task) => targetIds.has(String(task?.id)));
  return {
    tasks: tasks.filter((task) => !targetIds.has(String(task?.id))),
    removedTasks,
  };
}
