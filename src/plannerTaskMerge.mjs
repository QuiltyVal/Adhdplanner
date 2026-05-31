export const DEFAULT_PENDING_SYNC_TTL_MS = 15 * 1000;

function defaultResolveTaskOrderValue(task) {
  if (typeof task?.position === "number" && Number.isFinite(task.position)) {
    return task.position;
  }
  if (typeof task?.order === "number" && Number.isFinite(task.order)) {
    return task.order;
  }
  if (typeof task?.createdAt === "number" && Number.isFinite(task.createdAt)) {
    return task.createdAt;
  }
  return 0;
}

function defaultSortTasks(tasks) {
  return [...tasks].sort(
    (a, b) => defaultResolveTaskOrderValue(a) - defaultResolveTaskOrderValue(b),
  );
}

function identityDedupe(tasks) {
  return tasks;
}

export function stripLocalTaskState(task = {}) {
  const {
    __pendingSyncAt,
    __baseLastUpdated,
    ...cleanTask
  } = task;
  return cleanTask;
}

export function stripLocalTaskStateList(tasks = []) {
  return tasks.map(stripLocalTaskState);
}

export function mergeSubtasks(localSubtasks = [], remoteSubtasks = [], preferRemote = true) {
  const localById = new Map(localSubtasks.map((subtask) => [String(subtask.id), subtask]));
  const remoteIds = new Set(remoteSubtasks.map((subtask) => String(subtask.id)));

  const mergedRemote = remoteSubtasks.map((remoteSubtask) => {
    const localSubtask = localById.get(String(remoteSubtask.id));
    if (!localSubtask) return remoteSubtask;
    return preferRemote
      ? { ...localSubtask, ...remoteSubtask }
      : { ...remoteSubtask, ...localSubtask };
  });

  const localOnly = localSubtasks.filter((subtask) => !remoteIds.has(String(subtask.id)));
  return [...mergedRemote, ...localOnly];
}

export function getTaskBaseLastUpdated(task) {
  if (typeof task?.__baseLastUpdated === "number") return task.__baseLastUpdated;
  return typeof task?.lastUpdated === "number" ? task.lastUpdated : 0;
}

export function hasFreshPendingSync(
  task,
  now = Date.now(),
  pendingSyncTtlMs = DEFAULT_PENDING_SYNC_TTL_MS,
) {
  return (
    typeof task?.__pendingSyncAt === "number" &&
    task.__pendingSyncAt > 0 &&
    now - task.__pendingSyncAt <= pendingSyncTtlMs
  );
}

function getFreshPendingStatusIntent(
  taskId,
  pendingTaskStatusIntents = new Map(),
  now = Date.now(),
  pendingSyncTtlMs = DEFAULT_PENDING_SYNC_TTL_MS,
) {
  if (!(pendingTaskStatusIntents instanceof Map)) return null;
  const key = String(taskId || "");
  if (!key) return null;
  const rawIntent = pendingTaskStatusIntents.get(key);
  if (!rawIntent) return null;

  const status = String(rawIntent.status || "").trim();
  const at = Number(rawIntent.at || rawIntent.createdAt || rawIntent.timestamp || 0);
  if (!status || !at || !Number.isFinite(at)) {
    pendingTaskStatusIntents.delete(key);
    return null;
  }

  if (now - at > pendingSyncTtlMs) {
    pendingTaskStatusIntents.delete(key);
    return null;
  }

  return { status, at };
}

function applyPendingStatusIntent(task, intent) {
  if (!task || !intent?.status) return task;
  const next = {
    ...task,
    status: intent.status,
    lastUpdated: Math.max(Number(task.lastUpdated || 0), intent.at),
    __pendingSyncAt: Math.max(Number(task.__pendingSyncAt || 0), intent.at),
  };

  if (intent.status === "active") {
    next.deadAt = null;
  }
  if (intent.status === "completed") {
    next.isToday = false;
    next.deadAt = null;
    next.completedAt = next.completedAt || intent.at;
  }
  if (intent.status === "dead") {
    next.isToday = false;
    next.deadAt = next.deadAt || intent.at;
  }

  return next;
}

export function markTaskFromCloud(task, options = {}) {
  const resolveTaskOrderValue = options.resolveTaskOrderValue || defaultResolveTaskOrderValue;
  const cleanTask = stripLocalTaskState(task);
  return {
    ...cleanTask,
    position: resolveTaskOrderValue(cleanTask),
    __baseLastUpdated: typeof cleanTask?.lastUpdated === "number" ? cleanTask.lastUpdated : 0,
    __pendingSyncAt: 0,
  };
}

export function markTaskPendingSync(task, previousTask = null, options = {}) {
  const resolveTaskOrderValue = options.resolveTaskOrderValue || defaultResolveTaskOrderValue;
  const cleanTask = stripLocalTaskState(task);
  const previousBase = getTaskBaseLastUpdated(previousTask);
  const previousUpdatedAt = typeof previousTask?.lastUpdated === "number" ? previousTask.lastUpdated : 0;
  const previousOrder = resolveTaskOrderValue(previousTask);
  const nextOrder = typeof cleanTask?.position === "number" && Number.isFinite(cleanTask.position)
    ? cleanTask.position
    : previousOrder;
  return {
    ...cleanTask,
    position: nextOrder,
    __baseLastUpdated: Math.max(previousBase, previousUpdatedAt),
    __pendingSyncAt: Date.now(),
  };
}

export function mergeTaskLists(localTasks = [], remoteTasks = [], options = {}) {
  const now = typeof options.now === "number" ? options.now : Date.now();
  const authoritativeRemote = Boolean(options.authoritativeRemote);
  const pendingDeletedTaskIds = options.pendingDeletedTaskIds instanceof Map
    ? options.pendingDeletedTaskIds
    : new Map();
  const pendingTaskStatusIntents = options.pendingTaskStatusIntents instanceof Map
    ? options.pendingTaskStatusIntents
    : new Map();
  const pendingSyncTtlMs = typeof options.pendingSyncTtlMs === "number"
    ? options.pendingSyncTtlMs
    : DEFAULT_PENDING_SYNC_TTL_MS;
  const resolveTaskOrderValue = options.resolveTaskOrderValue || defaultResolveTaskOrderValue;
  const sortTasks = options.sortTasks || defaultSortTasks;
  const dedupeTasks = options.dedupeTasks || identityDedupe;
  const localById = new Map(localTasks.map((task) => [String(task.id), task]));
  const remoteTasksForMerge = (Array.isArray(remoteTasks) ? remoteTasks : []).filter((task) => {
    if (authoritativeRemote) return true;
    const pendingDeletedAt = Number(pendingDeletedTaskIds.get(String(task?.id)) || 0);
    if (!pendingDeletedAt) return true;
    if (now - pendingDeletedAt > pendingSyncTtlMs) {
      pendingDeletedTaskIds.delete(String(task?.id));
      return true;
    }
    return false;
  });
  const remoteIds = new Set(remoteTasksForMerge.map((task) => String(task.id)));

  const mergedRemote = remoteTasksForMerge.map((rawRemoteTask) => {
    const remoteTask = markTaskFromCloud(rawRemoteTask, { resolveTaskOrderValue });
    const localTask = localById.get(String(remoteTask.id));
    const statusIntent = authoritativeRemote
      ? null
      : getFreshPendingStatusIntent(remoteTask.id, pendingTaskStatusIntents, now, pendingSyncTtlMs);

    if (!localTask) {
      return statusIntent ? applyPendingStatusIntent(remoteTask, statusIntent) : remoteTask;
    }

    if (statusIntent && localTask.status !== statusIntent.status) {
      const mergedTask = applyPendingStatusIntent({ ...remoteTask, ...localTask }, statusIntent);
      mergedTask.subtasks = mergeSubtasks(
        localTask.subtasks || [],
        remoteTask.subtasks || [],
        false,
      );
      return mergedTask;
    }

    const localIntentIsFresh = hasFreshPendingSync(localTask, now, pendingSyncTtlMs);
    if (!localIntentIsFresh || authoritativeRemote) {
      return remoteTask;
    }

    if (localTask.status !== remoteTask.status) {
      if (localTask.status === "completed" && remoteTask.status === "dead") return remoteTask;
      const mergedTask = { ...remoteTask, ...localTask };
      mergedTask.subtasks = mergeSubtasks(
        localTask.subtasks || [],
        remoteTask.subtasks || [],
        false,
      );
      return mergedTask;
    }

    const remoteUpdatedAt = remoteTask.lastUpdated || 0;
    const localUpdatedAt = localTask.lastUpdated || 0;
    if (remoteUpdatedAt > localUpdatedAt) {
      return remoteTask;
    }

    const mergedTask = { ...remoteTask, ...localTask };
    mergedTask.subtasks = mergeSubtasks(
      localTask.subtasks || [],
      remoteTask.subtasks || [],
      false,
    );
    return mergedTask;
  });

  const localOnly = localTasks.filter(
    (task) => !remoteIds.has(String(task.id)) && hasFreshPendingSync(task, now, pendingSyncTtlMs),
  );
  return dedupeTasks(sortTasks([...localOnly, ...mergedRemote]));
}

export function mergeAuthoritativeTaskLists(localTasks = [], remoteTasks = [], options = {}) {
  return mergeTaskLists(localTasks, remoteTasks, {
    ...options,
    authoritativeRemote: true,
  });
}
