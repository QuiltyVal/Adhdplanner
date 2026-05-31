import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  classifyDeliveryError,
} = require("../api/_lib/planner-delivery-runtime.js");
const {
  buildPlannerHealthSnapshot,
} = require("../api/_lib/planner-health-snapshot.js");

{
  const diagnostic = classifyDeliveryError(
    new Error("Telegram API 403: Forbidden: bot was blocked by the user"),
    { channel: "telegram" },
  );

  assert.equal(diagnostic.code, "telegram_chat_unreachable");
  assert.equal(diagnostic.retryable, false);
  assert.equal(diagnostic.requiresRelink, true);
}

{
  const diagnostic = classifyDeliveryError(
    new Error("Telegram API 429: Too Many Requests"),
    { channel: "telegram" },
  );

  assert.equal(diagnostic.code, "telegram_rate_limited");
  assert.equal(diagnostic.retryable, true);
  assert.equal(diagnostic.requiresRelink, false);
}

{
  const snapshot = buildPlannerHealthSnapshot({
    last_engine_run: { status: "ok", finished_at: 1000 },
    last_cron_tick: { status: "ok", finished_at: 1000 },
    outbox_backlog: { pending: 0, retry: 1, dead: 0, sending: 0 },
    telegram_link_status: { status: "linked", linkedAt: 900, lastSeenAt: 1200 },
    delivery_status: {
      contractVersion: 1,
      channel: "telegram",
      status: "retry",
      updatedAt: 1100,
      resultAt: 1100,
      errorCode: "telegram_chat_unreachable",
      errorHint: "Telegram chat is unavailable. Re-link the bot or check whether the user blocked it.",
    },
  }, 1300);

  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.reason, "healthy");
  assert.equal(snapshot.delivery.status, "recovered");
  assert.equal(snapshot.telegram.recoveredAfterFailure, true);
}

{
  const snapshot = buildPlannerHealthSnapshot({
    last_engine_run: { status: "ok", finished_at: 1000 },
    last_cron_tick: { status: "ok", finished_at: 1000 },
    outbox_backlog: { pending: 0, retry: 1, dead: 0, sending: 0 },
    telegram_link_status: { status: "linked", linkedAt: 800, lastSeenAt: 900 },
    delivery_status: {
      contractVersion: 1,
      channel: "telegram",
      status: "retry",
      updatedAt: 1100,
      resultAt: 1100,
      errorCode: "telegram_chat_unreachable",
    },
  }, 1300);

  assert.equal(snapshot.status, "warning");
  assert.equal(snapshot.reason, "delivery_retry");
  assert.equal(snapshot.delivery.status, "retry");
}

console.log("planner delivery runtime tests passed");
