const {
  buildSkipPostCommandHookRoute,
  executePlannerActionCommand,
} = require("./planner-command-runner");
const { PLANNER_COMMAND_TYPES } = require("./planner-command-types");

function buildTelegramContextCommand({
  task = null,
  action = "context",
  extra = {},
  angelOverridesPatch = null,
  dateKey = "",
  source = "telegram",
  idempotencyKey = "",
} = {}) {
  return {
    type: PLANNER_COMMAND_TYPES.SET_PLANNER_CONTEXT,
    source,
    telegramContextTask: task ? { id: task.id || null, text: task.text || "" } : null,
    telegramContextAction: action,
    telegramContextExtra: extra && typeof extra === "object" ? extra : {},
    angelOverridesPatch,
    dateKey,
    idempotencyKey,
  };
}

function buildTelegramContextActor({ source = "telegram", chatId = "" } = {}) {
  return {
    type: "user",
    ref: source,
    chatId: String(chatId || ""),
  };
}

function setPlannerContextFromTelegram(userId, options = {}) {
  const source = String(options.source || "telegram");
  const command = buildTelegramContextCommand({ ...options, source });
  return executePlannerActionCommand({
    userId,
    command,
    route: buildSkipPostCommandHookRoute({
      type: command.type,
      source,
      idempotencyKey: command.idempotencyKey,
    }),
    actorType: "user",
  });
}

module.exports = {
  buildTelegramContextActor,
  buildTelegramContextCommand,
  setPlannerContextFromTelegram,
};
