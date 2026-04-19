export function resolveTaskOrderValue(task) {
  const taskPosition = task?.position;
  if (typeof taskPosition === "number" && Number.isFinite(taskPosition)) return taskPosition;

  const lastUpdated = task?.lastUpdated;
  if (typeof lastUpdated === "number" && Number.isFinite(lastUpdated)) return lastUpdated;

  const createdAt =
    typeof task?.createdAt === "number" && Number.isFinite(task.createdAt) ? task.createdAt : null;
  if (createdAt) return createdAt;

  return 0;
}

export function compareTasksByOrder(left, right) {
  const leftOrder = resolveTaskOrderValue(left);
  const rightOrder = resolveTaskOrderValue(right);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;

  const leftUpdatedAt = typeof left?.lastUpdated === "number" ? left.lastUpdated : 0;
  const rightUpdatedAt = typeof right?.lastUpdated === "number" ? right.lastUpdated : 0;
  if (leftUpdatedAt !== rightUpdatedAt) return leftUpdatedAt - rightUpdatedAt;

  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

export function sortTasksByOrder(tasks) {
  return [...tasks].sort(compareTasksByOrder);
}

export function getNextTaskOrder(tasks, status, excludeTaskId = null) {
  let maxOrder = 0;
  for (const task of tasks) {
    if (task?.status !== status) continue;
    if (excludeTaskId != null && String(task.id) === String(excludeTaskId)) continue;
    const taskOrder = resolveTaskOrderValue(task);
    if (taskOrder > maxOrder) maxOrder = taskOrder;
  }
  return maxOrder + 1;
}
