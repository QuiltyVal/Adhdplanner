function buildPlannerRouteState({
  userId = "",
  bootstrap = {},
  initialPlannerData = {},
  includeNonActive = false,
} = {}) {
  const allTasks = Array.isArray(bootstrap.tasks) ? bootstrap.tasks : [];
  const activeTasks = allTasks.filter((task) => task?.status === "active");
  const nonActiveTasks = includeNonActive
    ? allTasks.filter((task) => task?.status !== "active")
    : [];
  const completedCount = includeNonActive
    ? nonActiveTasks.filter((task) => task.status === "completed").length
    : null;
  const deadCount = includeNonActive
    ? nonActiveTasks.filter((task) => task.status === "dead").length
    : null;

  return {
    userId,
    score: typeof bootstrap?.score === "number" ? bootstrap.score : 0,
    plannerMeta: bootstrap?.planner_meta || null,
    eventItems: Array.isArray(bootstrap?.event_items) ? bootstrap.event_items : [],
    telegramContext: initialPlannerData?.telegramContext || null,
    tasks: activeTasks,
    nonActiveTasks,
    counts: {
      active: activeTasks.length,
      completed: completedCount,
      dead: deadCount,
    },
  };
}

function buildPlannerRouteRuntimeResult({
  route = null,
  messages = [],
  engine = null,
  postCommand = null,
  postCommandWrite = null,
  bootstrap = null,
  state = null,
} = {}) {
  return {
    route,
    messages: Array.isArray(messages) ? messages : [],
    engine,
    postCommand,
    postCommandWrite,
    ...(bootstrap ? { bootstrap } : {}),
    state,
  };
}

module.exports = {
  buildPlannerRouteRuntimeResult,
  buildPlannerRouteState,
};
