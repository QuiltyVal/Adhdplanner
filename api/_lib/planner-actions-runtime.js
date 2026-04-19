const { executePlannerAction } = require("./planner-action-executor");
const { getNonActiveTasks, getPlannerData } = require("./planner-store");
const { calendarConnectKeyboard, plannerTaskKeyboard } = require("./telegram");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBody(body) {
  if (typeof body !== "string") return { parsed: body || {}, error: null };
  if (!body.trim()) return { parsed: {}, error: null };
  try {
    return { parsed: JSON.parse(body), error: null };
  } catch (error) {
    return { parsed: null, error: "Invalid JSON body" };
  }
}

function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(lowered)) return true;
    if (["false", "0", "no", "n", "off"].includes(lowered)) return false;
  }
  return fallback;
}

function buildActionAdapter(messages = []) {
  return {
    sendText: async (text, extra = {}) => {
      messages.push({
        text: String(text || ""),
        extra: isPlainObject(extra) ? extra : {},
      });
    },
    taskKeyboard: plannerTaskKeyboard,
    calendarConnectKeyboard,
  };
}

async function runPlannerRouteForUser({
  userId,
  chatId,
  route,
  includeState = false,
  includeNonActive = false,
  log = null,
}) {
  const initialPlannerData = await getPlannerData(userId);
  const messages = [];

  await executePlannerAction({
    userId,
    chatId: String(chatId || "planner_actions_api"),
    plannerData: initialPlannerData,
    route,
    adapter: buildActionAdapter(messages),
    log: typeof log === "function" ? log : null,
  });

  if (!includeState) {
    return {
      route,
      messages,
      state: null,
    };
  }

  const plannerData = await getPlannerData(userId);
  const nonActiveTasks = includeNonActive ? await getNonActiveTasks(userId) : [];
  const completedCount = includeNonActive
    ? nonActiveTasks.filter((task) => task.status === "completed").length
    : null;
  const deadCount = includeNonActive
    ? nonActiveTasks.filter((task) => task.status === "dead").length
    : null;

  return {
    route,
    messages,
    state: {
      userId,
      score: typeof plannerData?.score === "number" ? plannerData.score : 0,
      telegramContext: plannerData?.telegramContext || null,
      tasks: Array.isArray(plannerData?.tasks) ? plannerData.tasks : [],
      nonActiveTasks,
      counts: {
        active: Array.isArray(plannerData?.tasks) ? plannerData.tasks.length : 0,
        completed: completedCount,
        dead: deadCount,
      },
    },
  };
}

module.exports = {
  isPlainObject,
  parseBody,
  parseBooleanFlag,
  runPlannerRouteForUser,
};

