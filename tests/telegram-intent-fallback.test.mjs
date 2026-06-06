import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const originalConsoleError = console.error;
console.error = () => {};

const openRouterPath = require.resolve("../api/_lib/openrouter.js");
require.cache[openRouterPath] = {
  id: openRouterPath,
  filename: openRouterPath,
  loaded: true,
  exports: {
    openRouterChatCompletion: async () => {
      throw new Error("mock_openrouter_unavailable");
    },
  },
};

const { parseTelegramIntent } = require("../api/_lib/telegram-intent.js");
const { PLANNER_ACTIONS } = require("../api/_lib/planner-action-types.js");

async function assertIntent(text, expected = {}) {
  const intent = await parseTelegramIntent({ text });
  assert.equal(intent.intent, expected.intent, `${text} should route to ${expected.intent}`);
  if ("task_ref" in expected) assert.equal(intent.task_ref, expected.task_ref, `${text} task_ref`);
  if ("task_text" in expected) assert.equal(intent.task_text, expected.task_text, `${text} task_text`);
}

await assertIntent("отправь «Pay rent» в рай", {
  intent: PLANNER_ACTIONS.COMPLETE_TASK,
  task_ref: "Pay rent",
});

await assertIntent("верни «Pay rent» из рая", {
  intent: PLANNER_ACTIONS.REOPEN_TASK,
  task_ref: "Pay rent",
});

await assertIntent("убей «Pay rent»", {
  intent: PLANNER_ACTIONS.KILL_TASK,
  task_ref: "Pay rent",
});

await assertIntent("закрепи «Pay rent» на сегодня", {
  intent: PLANNER_ACTIONS.SET_TODAY,
  task_ref: "Pay rent",
});

await assertIntent("сегодня закрепи «Pay rent»", {
  intent: PLANNER_ACTIONS.SET_TODAY,
  task_ref: "Pay rent",
});

await assertIntent("открепи «Pay rent» с сегодня", {
  intent: PLANNER_ACTIONS.UNSET_TODAY,
  task_ref: "Pay rent",
});

await assertIntent("сними критичность с «Pay rent»", {
  intent: PLANNER_ACTIONS.UNSET_VITAL,
  task_ref: "Pay rent",
});

await assertIntent("приготовить ужин", {
  intent: PLANNER_ACTIONS.ADD_TASK,
  task_text: "приготовить ужин",
});

console.error = originalConsoleError;
console.log("telegram intent fallback tests passed");
