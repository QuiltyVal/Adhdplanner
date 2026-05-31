const DEFAULT_EVENT_LIMIT = 25;

export function getGuestTasksStorageKey(userId, options = {}) {
  return String(userId || "") === String(options.demoUserId || "")
    ? String(options.demoTasksKey || "adhd_demo_planner_tasks")
    : "adhd_planner_tasks";
}

export function getGuestScoreStorageKey(userId, options = {}) {
  return String(userId || "") === String(options.demoUserId || "")
    ? String(options.demoScoreKey || "adhd_demo_planner_score")
    : "adhd_planner_score";
}

export function getPlannerEventCacheKey(userId) {
  return `adhd_planner_events_${userId || "guest"}`;
}

export function getPulseStorageKey(userId, prefix = "adhd_planner_pulse") {
  return `${prefix}_${userId}`;
}

export function getCloudCacheKey(userId, prefix = "adhd_planner_cloud_cache") {
  return `${prefix}_${userId}`;
}

export function readCachedPlannerEvents(userId) {
  if (!userId || typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(getPlannerEventCacheKey(userId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[Planner] Не удалось прочитать локальный журнал событий:", error);
    return [];
  }
}

export function writeCachedPlannerEvents(userId, events = [], options = {}) {
  if (!userId || typeof window === "undefined") return;
  const limit = Number(options.limit || DEFAULT_EVENT_LIMIT);
  try {
    localStorage.setItem(getPlannerEventCacheKey(userId), JSON.stringify(events.slice(0, limit)));
  } catch (error) {
    console.warn("[Planner] Не удалось сохранить локальный журнал событий:", error);
  }
}

export function loadPulseState(userId, options = {}) {
  const getDefaultPulseState = options.getDefaultPulseState;
  const getDayKey = options.getDayKey;
  const defaultState = typeof getDefaultPulseState === "function" ? getDefaultPulseState() : {};
  if (!userId) return defaultState;

  try {
    const rawState = localStorage.getItem(getPulseStorageKey(userId, options.prefix));
    if (!rawState) return defaultState;

    const parsedState = JSON.parse(rawState);
    const today = typeof getDayKey === "function" ? getDayKey() : null;

    return {
      ...defaultState,
      ...parsedState,
      actionsToday: today && parsedState.lastActionDay === today ? parsedState.actionsToday || 0 : 0,
    };
  } catch (error) {
    console.warn("Не удалось прочитать pulse state:", error);
    return defaultState;
  }
}

export function savePulseState(userId, pulseState, options = {}) {
  if (!userId) return;
  try {
    localStorage.setItem(getPulseStorageKey(userId, options.prefix), JSON.stringify(pulseState));
  } catch (error) {
    console.warn("Не удалось сохранить pulse state:", error);
  }
}

export function loadCloudCache(userId, options = {}) {
  if (!userId) return null;
  const maxAgeMs = Number(options.maxAgeMs || 30 * 60 * 1000);
  const stripTasks = typeof options.stripTasks === "function" ? options.stripTasks : (tasks) => tasks;

  try {
    const cacheKey = getCloudCacheKey(userId, options.prefix);
    const rawState = localStorage.getItem(cacheKey);
    if (!rawState) return null;
    const parsedState = JSON.parse(rawState);
    const savedAt = typeof parsedState.savedAt === "number" ? parsedState.savedAt : 0;

    if (!savedAt || Date.now() - savedAt > maxAgeMs) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return {
      tasks: stripTasks(parsedState.tasks || []),
      score: typeof parsedState.score === "number" ? parsedState.score : 0,
      savedAt,
    };
  } catch (error) {
    console.warn("Не удалось прочитать cloud cache:", error);
    return null;
  }
}

export function saveCloudCache(userId, tasks, score, options = {}) {
  if (!userId) return;
  const stripTasks = typeof options.stripTasks === "function" ? options.stripTasks : (value) => value;

  try {
    localStorage.setItem(
      getCloudCacheKey(userId, options.prefix),
      JSON.stringify({
        tasks: stripTasks(tasks),
        score,
        savedAt: Date.now(),
      }),
    );
  } catch (error) {
    console.warn("Не удалось сохранить cloud cache:", error);
  }
}

export function loadGuestPlannerState(userId, options = {}) {
  const stripTasks = typeof options.stripTasks === "function" ? options.stripTasks : (tasks) => tasks;
  const keys = {
    demoUserId: options.demoUserId,
    demoTasksKey: options.demoTasksKey,
    demoScoreKey: options.demoScoreKey,
  };
  const tasksStorageKey = getGuestTasksStorageKey(userId, keys);
  const scoreStorageKey = getGuestScoreStorageKey(userId, keys);
  try {
    return {
      tasks: stripTasks(JSON.parse(localStorage.getItem(tasksStorageKey) || "[]") || []),
      score: parseInt(localStorage.getItem(scoreStorageKey), 10) || 0,
    };
  } catch (error) {
    console.warn("Не удалось прочитать guest planner state:", error);
    return { tasks: [], score: 0 };
  }
}

export function saveGuestPlannerState(userId, tasks, score, options = {}) {
  const stripTasks = typeof options.stripTasks === "function" ? options.stripTasks : (value) => value;
  const keys = {
    demoUserId: options.demoUserId,
    demoTasksKey: options.demoTasksKey,
    demoScoreKey: options.demoScoreKey,
  };
  localStorage.setItem(getGuestTasksStorageKey(userId, keys), JSON.stringify(stripTasks(tasks)));
  localStorage.setItem(getGuestScoreStorageKey(userId, keys), String(score));
}
