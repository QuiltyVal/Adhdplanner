import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let nonActiveTasks = [];
const commandCalls = [];
const actionLogs = [];

const plannerStorePath = require.resolve("../api/_lib/planner-store.js");
const actualPlannerStore = require(plannerStorePath);
require.cache[plannerStorePath].exports = {
  ...actualPlannerStore,
  getNonActiveTasks: async () => nonActiveTasks,
};

const commandRunnerPath = require.resolve("../api/_lib/planner-command-runner.js");
require.cache[commandRunnerPath] = {
  id: commandRunnerPath,
  filename: commandRunnerPath,
  loaded: true,
  exports: {
    executePlannerActionCommand: async (input = {}) => {
      commandCalls.push(input);
      const taskId = input.command?.taskId;
      const sourceTask = nonActiveTasks.find((task) => String(task.id) === String(taskId));
      return sourceTask
        ? {
            task: {
              ...sourceTask,
              status: "active",
              lastUpdated: Number(sourceTask.lastUpdated || 0) + 1,
            },
          }
        : { task: null };
    },
  },
};

const { executePlannerAction } = require("../api/_lib/planner-action-executor.js");
const { PLANNER_ACTIONS } = require("../api/_lib/planner-action-types.js");
const { PLANNER_COMMAND_TYPES } = require("../api/_lib/planner-command-types.js");
const {
  calendarConnectKeyboard,
  completedTaskKeyboard,
  plannerTaskKeyboard,
} = require("../api/_lib/telegram.js");

function buildAdapter(messages = []) {
  return {
    sendText: async (text, extra = {}) => {
      messages.push({ text: String(text || ""), extra });
    },
    taskKeyboard: plannerTaskKeyboard,
    completedTaskKeyboard,
    calendarConnectKeyboard,
  };
}

function keyboardHasPlannerLink(keyboard) {
  return Boolean((keyboard?.inline_keyboard || [])
    .flat()
    .some((button) => button?.text === "🌐 Open planner" && button?.url === "https://planner.valquilty.com"));
}

function keyboardHasCallback(keyboard, callbackData) {
  return Boolean((keyboard?.inline_keyboard || [])
    .flat()
    .some((button) => button?.callback_data === callbackData));
}

{
  nonActiveTasks = [
    { id: "done-old", text: "Older completed task", status: "completed", lastUpdated: 20 },
    { id: "dead-new", text: "Newest Cemetery task", status: "dead", lastUpdated: 70 },
    { id: "done-new", text: "Newest completed task", status: "completed", lastUpdated: 60 },
  ];
  commandCalls.length = 0;
  actionLogs.length = 0;

  const messages = [];
  await executePlannerAction({
    userId: "user-1",
    chatId: "chat-1",
    plannerData: { tasks: [] },
    route: { type: PLANNER_ACTIONS.REOPEN_TASK, taskRef: "", source: "slash_command" },
    adapter: buildAdapter(messages),
    log: async (entry) => actionLogs.push(entry),
  });

  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0].command.type, PLANNER_COMMAND_TYPES.TASK_REOPEN);
  assert.equal(commandCalls[0].command.taskId, "dead-new");
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /Newest Cemetery task/);
  assert.equal(keyboardHasPlannerLink(messages[0].extra.reply_markup), true);
  assert.equal(keyboardHasCallback(messages[0].extra.reply_markup, "done:dead-new"), true);
  assert.equal(actionLogs[0].action, "reopen_from_text");
  assert.equal(actionLogs[0].taskId, "dead-new");
}

{
  nonActiveTasks = [
    { id: "done-1", text: "Pay rent", status: "completed", lastUpdated: 20 },
    { id: "dead-1", text: "Old dead task", status: "dead", lastUpdated: 30 },
  ];
  commandCalls.length = 0;

  const messages = [];
  await executePlannerAction({
    userId: "user-1",
    chatId: "chat-1",
    plannerData: { tasks: [] },
    route: { type: PLANNER_ACTIONS.REOPEN_TASK, taskRef: "Pay rent", source: "slash_command" },
    adapter: buildAdapter(messages),
  });

  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0].command.type, PLANNER_COMMAND_TYPES.TASK_REOPEN);
  assert.equal(commandCalls[0].command.taskId, "done-1");
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /Pay rent/);
  assert.equal(keyboardHasPlannerLink(messages[0].extra.reply_markup), true);
  assert.equal(keyboardHasCallback(messages[0].extra.reply_markup, "done:done-1"), true);
}

console.log("planner telegram reopen action tests passed");
