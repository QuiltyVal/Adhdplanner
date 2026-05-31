const { runPlannerCommand } = require("./planner-command-service");
const {
  runAndWritePostCommandStatus,
} = require("./planner-post-command-hook");

const SKIP_POST_COMMAND_HOOK_FLAG = "__skipPostCommandHook";
const FALLBACK_COMMAND_IDEMPOTENCY_WINDOW_MS = 4000;

function buildSkipPostCommandHookRoute(route = {}) {
  return {
    ...route,
    [SKIP_POST_COMMAND_HOOK_FLAG]: true,
  };
}

function shouldSkipPostCommandHook(route = {}) {
  return route?.[SKIP_POST_COMMAND_HOOK_FLAG] === true;
}

function getShortCommandBucket(now = Date.now(), windowMs = FALLBACK_COMMAND_IDEMPOTENCY_WINDOW_MS) {
  return Math.floor(Number(now || Date.now()) / windowMs);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function buildFallbackCommandIdempotencyKey(route = {}, command = {}) {
  const commandType = firstNonEmpty(command.type, route.type, route.action, "unknown");
  const target = firstNonEmpty(
    command.taskId,
    command.taskRef,
    command.snapshotId,
    command.chatId,
    route.taskId,
    route.targetTaskId,
    route.task_id,
    route.taskRef,
    route.snapshotId,
    route.chatId,
    command.subtaskId,
    route.subtaskId,
    command.taskText,
    route.taskText,
    command.rawText,
    route.rawText,
    "global",
  ).slice(0, 160);
  const source = firstNonEmpty(command.source, route.source, "command_runner");
  return `planner_command:${commandType}:${target}:${source}:${getShortCommandBucket()}`;
}

function buildPlannerActionCommand(route = {}, command = {}) {
  const explicitIdempotencyKey = command.idempotencyKey || route.idempotencyKey || route.commandId || "";
  return {
    ...command,
    source: command.source || route.source || "telegram",
    idempotencyKey: explicitIdempotencyKey || buildFallbackCommandIdempotencyKey(route, command),
  };
}

function buildPlannerActionActor(route = {}, chatId = "", actorType = "user") {
  const source = String(route.source || "telegram");
  return {
    type: actorType,
    ref: source,
    chatId: String(chatId || ""),
  };
}

function executePlannerActionCommand({
  userId,
  chatId,
  route = {},
  command = {},
  actorType = "user",
} = {}) {
  const actionCommand = buildPlannerActionCommand(route, command);
  const actor = buildPlannerActionActor(route, chatId, actorType);
  return runPlannerCommand({
    userId,
    command: actionCommand,
    actor,
  }).then(async (result) => {
    if (shouldSkipPostCommandHook(route)) return result;
    const { postCommand, postCommandWrite } = await runAndWritePostCommandStatus({
      userId,
      command: actionCommand,
      trigger: "command",
      logPrefix: "planner-command-runner",
    });
    return {
      ...result,
      postCommand,
      postCommandWrite,
      engine: postCommand.engine || null,
      engineError: postCommand.ok ? "" : postCommand.error || "post-command engine tick failed",
    };
  });
}

module.exports = {
  SKIP_POST_COMMAND_HOOK_FLAG,
  buildSkipPostCommandHookRoute,
  buildFallbackCommandIdempotencyKey,
  buildPlannerActionActor,
  buildPlannerActionCommand,
  executePlannerActionCommand,
  shouldSkipPostCommandHook,
};
