import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const previousDefaultUserId = process.env.PLANNER_DEFAULT_USER_ID;
process.env.PLANNER_DEFAULT_USER_ID = "user-1";

let plannerDataCalls = 0;
const plannerStorePath = require.resolve("../api/_lib/planner-store.js");
const actualPlannerStore = require(plannerStorePath);
require.cache[plannerStorePath].exports = {
  ...actualPlannerStore,
  getPlannerData: async () => {
    plannerDataCalls += 1;
    return {
      tasks: [
        {
          id: "task-1",
          text: "Pay rent",
          status: "active",
          isToday: false,
          isVital: false,
        },
      ],
    };
  },
};

const telegramWebhook = require("../api/telegram-webhook.js");
const { PLANNER_ACTIONS } = require("../api/_lib/planner-action-types.js");

assert.equal(typeof telegramWebhook._test?.resolveUnifiedCallbackRoute, "function");

try {
  {
    const result = await telegramWebhook._test.resolveUnifiedCallbackRoute({
      id: "callback-cancel-1",
      data: "cancel:task-1",
      message: { message_id: 123 },
    });

    assert.equal(result.errorText, "Cancelled. No change.");
    assert.equal(result.callbackRoute, null);
    assert.equal(result.feedback, "");
    assert.equal(result.plannerData, null);
    assert.equal(result.suppressMessages, true);
    assert.equal(plannerDataCalls, 1);
  }

  {
    const result = await telegramWebhook._test.resolveUnifiedCallbackRoute({
      id: "callback-kill-1",
      data: "confirm_kill:task-1",
      message: { message_id: 124 },
    });

    assert.equal(result.errorText, "");
    assert.equal(result.callbackRoute.type, PLANNER_ACTIONS.KILL_TASK);
    assert.match(result.callbackRoute.idempotencyKey, /^telegram_callback:callback-kill-1$/);
    assert.equal(result.feedback, "Confirmed. Task moved to Cemetery.");
    assert.equal(result.suppressMessages, false);
  }

  {
    const result = await telegramWebhook._test.resolveUnifiedCallbackRoute({
      id: "callback-done-1",
      data: "confirm_done:task-1",
      message: { message_id: 125 },
    });

    assert.equal(result.errorText, "");
    assert.equal(result.callbackRoute.type, PLANNER_ACTIONS.COMPLETE_TASK);
    assert.match(result.callbackRoute.idempotencyKey, /^telegram_callback:callback-done-1$/);
    assert.equal(result.plannerData.telegramContext.lastAction, "callback_confirm_done");
    assert.equal(result.feedback, "Confirmed. Task moved to completed.");
    assert.equal(result.suppressMessages, false);
  }
} finally {
  if (previousDefaultUserId === undefined) {
    delete process.env.PLANNER_DEFAULT_USER_ID;
  } else {
    process.env.PLANNER_DEFAULT_USER_ID = previousDefaultUserId;
  }
}

console.log("telegram callback confirmation tests passed");
