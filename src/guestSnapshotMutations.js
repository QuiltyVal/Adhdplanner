export async function createGuestTaskSnapshot({ userId, tasks = [], score = 0, saveTaskSnapshot, loadSnapshots }) {
  if (!userId || typeof saveTaskSnapshot !== "function") return false;
  await saveTaskSnapshot(userId, tasks, score, "manual_web");
  if (typeof loadSnapshots === "function") {
    await loadSnapshots();
  }
  return true;
}

export async function restoreGuestTaskSnapshot({
  userId,
  currentTasks = [],
  currentScore = 0,
  snapshot = null,
  saveTaskSnapshot,
  restoreFromSnapshot,
  normalizeTask,
}) {
  if (!userId || !snapshot || typeof saveTaskSnapshot !== "function") {
    return { tasks: [], score: currentScore, restored: false };
  }

  const snapshotTasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const currentIds = currentTasks.map((task) => task.id);
  await saveTaskSnapshot(userId, currentTasks, currentScore, "pre_restore_backup");

  if (typeof restoreFromSnapshot === "function") {
    await restoreFromSnapshot(userId, currentIds, snapshotTasks);
  }

  const restoredTasks = snapshotTasks.map((task) => (
    typeof normalizeTask === "function"
      ? normalizeTask({ ...task, lastUpdated: Date.now() })
      : { ...task, lastUpdated: Date.now() }
  ));

  return {
    tasks: restoredTasks,
    score: typeof snapshot.score === "number" ? snapshot.score : currentScore,
    restored: true,
  };
}
