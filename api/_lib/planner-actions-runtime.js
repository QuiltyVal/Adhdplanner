const { executePlannerAction } = require("./planner-action-executor");
const { buildSkipPostCommandHookRoute } = require("./planner-command-runner");
const { getPlannerBootstrap } = require("./planner-engine");
const {
  runAndWritePostCommandStatus,
} = require("./planner-post-command-hook");
const {
  buildPlannerRouteRuntimeResult,
  buildPlannerRouteState,
} = require("./planner-route-result-contract");
const { getPlannerData } = require("./planner-store");
const { calendarConnectKeyboard, completedTaskKeyboard, plannerTaskKeyboard } = require("./telegram");

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
    completedTaskKeyboard,
    calendarConnectKeyboard,
  };
}

function getShortRouteCommandBucket(now = Date.now(), windowMs = 4000) {
  return Math.floor(Number(now || Date.now()) / windowMs);
}

function buildRoutePostCommandKey(route = {}, chatId = "") {
  const explicitKey = route.idempotencyKey || route.commandId || route.id || "";
  if (explicitKey) return String(explicitKey);
  const routeType = String(route.type || route.action || "unknown");
  const target = String(route.taskId || route.targetTaskId || route.task_id || "");
  return `route:${routeType}:${target}:${chatId || "planner_actions_api"}:${getShortRouteCommandBucket()}`;
}

function buildRoutePostCommandDescriptor(route = {}, chatId = "") {
  return {
    idempotencyKey: buildRoutePostCommandKey(route, chatId),
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
    route: buildSkipPostCommandHookRoute(route),
    adapter: buildActionAdapter(messages),
    log: typeof log === "function" ? log : null,
  });

  const { postCommand, postCommandWrite } = await runAndWritePostCommandStatus({
    userId,
    command: buildRoutePostCommandDescriptor(route, chatId),
    trigger: "command",
    logPrefix: "planner-actions-runtime",
  });
  const engineResult = postCommand?.engine || null;

  if (!includeState) {
    return buildPlannerRouteRuntimeResult({
      route,
      messages,
      engine: engineResult,
      postCommand,
      postCommandWrite,
      state: null,
    });
  }

  const bootstrap = await getPlannerBootstrap(userId, { reportLimit: 10 });
  return buildPlannerRouteRuntimeResult({
    route,
    messages,
    engine: engineResult,
    postCommand,
    postCommandWrite,
    bootstrap,
    state: buildPlannerRouteState({
      userId,
      bootstrap,
      initialPlannerData,
      includeNonActive,
    }),
  });
}

module.exports = {
  isPlainObject,
  parseBody,
  parseBooleanFlag,
  buildRoutePostCommandDescriptor,
  buildRoutePostCommandKey,
  runPlannerRouteForUser,
};
