import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let nonActiveTasks = [];
const contextWrites = [];

const plannerStorePath = require.resolve("../api/_lib/planner-store.js");
const actualPlannerStore = require(plannerStorePath);
require.cache[plannerStorePath].exports = {
  ...actualPlannerStore,
  getNonActiveTasks: async () => nonActiveTasks,
};

const commitmentStorePath = require.resolve("../api/_lib/commitment-store.js");
require.cache[commitmentStorePath] = {
  id: commitmentStorePath,
  filename: commitmentStorePath,
  loaded: true,
  exports: {
    getCommitmentsNeedingLiveTask: async () => [],
  },
};

const telegramContextPath = require.resolve("../api/_lib/planner-telegram-context.js");
require.cache[telegramContextPath] = {
  id: telegramContextPath,
  filename: telegramContextPath,
  loaded: true,
  exports: {
    setPlannerContextFromTelegram: async (userId, options = {}) => {
      contextWrites.push({ userId, options });
      return { ok: true };
    },
  },
};

const commandRunnerPath = require.resolve("../api/_lib/planner-command-runner.js");
require.cache[commandRunnerPath] = {
  id: commandRunnerPath,
  filename: commandRunnerPath,
  loaded: true,
  exports: {
    executePlannerActionCommand: async () => {
      throw new Error("read-only Telegram action attempted a mutation command");
    },
  },
};

const { executePlannerAction } = require("../api/_lib/planner-action-executor.js");
const { PLANNER_ACTIONS } = require("../api/_lib/planner-action-types.js");
const {
  calendarConnectKeyboard,
  completedTaskKeyboard,
  plannerOpenKeyboard,
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
    plannerOpenKeyboard,
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
  nonActiveTasks = [];

  const messages = [];
  await executePlannerAction({
    userId: "user-1",
    chatId: "chat-1",
    plannerData: { tasks: [] },
    route: { type: PLANNER_ACTIONS.SHOW_COMPLETED },
    adapter: buildAdapter(messages),
  });

  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /Completed list is empty/);
  assert.equal(keyboardHasPlannerLink(messages[0].extra.reply_markup), true);
}

{
  nonActiveTasks = [
    { id: "dead-1", text: "Old dead task", status: "dead", lastUpdated: 30 },
    { id: "done-old", text: "Older completed task", status: "completed", lastUpdated: 20 },
    { id: "done-new", text: "Newest completed task", status: "completed", lastUpdated: 40 },
  ];

  const messages = [];
  await executePlannerAction({
    userId: "user-1",
    chatId: "chat-1",
    plannerData: { tasks: [] },
    route: { type: PLANNER_ACTIONS.SHOW_COMPLETED },
    adapter: buildAdapter(messages),
  });

  assert.equal(messages.length, 3);
  assert.match(messages[0].text, /Recently completed tasks/);
  assert.match(messages[1].text, /Newest completed task/);
  assert.equal(keyboardHasCallback(messages[1].extra.reply_markup, "reopen:done-new"), true);
  assert.equal(keyboardHasPlannerLink(messages[1].extra.reply_markup), true);
  assert.match(messages[2].text, /Older completed task/);
}

{
  nonActiveTasks = [];

  const messages = [];
  await executePlannerAction({
    userId: "user-1",
    chatId: "chat-1",
    plannerData: { tasks: [] },
    route: { type: PLANNER_ACTIONS.SHOW_CEMETERY },
    adapter: buildAdapter(messages),
  });

  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /Cemetery is empty/);
  assert.equal(keyboardHasPlannerLink(messages[0].extra.reply_markup), true);
}

{
  nonActiveTasks = [
    { id: "done-1", text: "Completed task", status: "completed", lastUpdated: 50 },
    { id: "dead-new", text: "Newest cemetery task", status: "dead", lastUpdated: 70 },
    { id: "dead-old", text: "Older cemetery task", status: "dead", lastUpdated: 60 },
  ];

  const messages = [];
  await executePlannerAction({
    userId: "user-1",
    chatId: "chat-1",
    plannerData: { tasks: [] },
    route: { type: PLANNER_ACTIONS.SHOW_CEMETERY },
    adapter: buildAdapter(messages),
  });

  assert.equal(messages.length, 3);
  assert.match(messages[0].text, /Cemetery tasks/);
  assert.match(messages[1].text, /Newest cemetery task/);
  assert.equal(keyboardHasCallback(messages[1].extra.reply_markup, "reopen:dead-new"), true);
  assert.equal(keyboardHasPlannerLink(messages[1].extra.reply_markup), true);
  assert.match(messages[2].text, /Older cemetery task/);
}

{
  nonActiveTasks = [];
  contextWrites.length = 0;
  const messages = [];

  await executePlannerAction({
    userId: "user-1",
    chatId: "chat-1",
    plannerData: {
      plannerMeta: {
        mission_task_id: "active-1",
        mission_reason: "hard_deadline",
        mission_explanation: "deadline pressure",
      },
      tasks: [
        {
          id: "active-1",
          text: "Pay rent",
          status: "active",
          urgency: "high",
          resistance: "medium",
          lastUpdated: 80,
          subtasks: [{ id: "step-1", text: "Open banking app", completed: false }],
        },
      ],
    },
    route: { type: PLANNER_ACTIONS.SHOW_TODAY },
    adapter: buildAdapter(messages),
  });

  assert.equal(messages.length >= 2, true);
  assert.match(messages[0].text, /What needs attention today/);
  assert.match(messages[1].text, /Pay rent/);
  assert.equal(keyboardHasCallback(messages[1].extra.reply_markup, "panic:active-1"), true);
  assert.equal(keyboardHasPlannerLink(messages[1].extra.reply_markup), true);
  assert.equal(contextWrites.length, 1);
  assert.equal(contextWrites[0].options.task.id, "active-1");
  assert.equal(contextWrites[0].options.action, "today");
}

console.log("planner telegram read-only action tests passed");
