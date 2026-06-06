import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildScheduledNudgeTiming,
  getBerlinParts,
  getScheduledNudgeSlot,
} = require("../api/_lib/planner-nudge-schedule.js");
const {
  buildScheduledNudgeOutboxPayload,
} = require("../api/_lib/planner-scheduled-nudge-outbox.js");
const {
  buildDeliveryStatus,
} = require("../api/_lib/planner-delivery-runtime.js");

{
  const now = Date.parse("2026-06-06T07:00:00.000Z");
  const parts = getBerlinParts(now);

  assert.equal(parts.dateKey, "2026-06-06");
  assert.equal(parts.hour, 9);
  assert.equal(parts.minute, 0);
  assert.equal(getScheduledNudgeSlot(now), "morning");
}

{
  const now = Date.parse("2026-12-06T08:00:00.000Z");
  const parts = getBerlinParts(now);

  assert.equal(parts.dateKey, "2026-12-06");
  assert.equal(parts.hour, 9);
  assert.equal(parts.minute, 0);
  assert.equal(getScheduledNudgeSlot(now), "morning");
}

{
  const now = Date.parse("2026-06-06T07:44:00.000Z");
  const timing = buildScheduledNudgeTiming("morning", now);

  assert.equal(getScheduledNudgeSlot(now), "morning");
  assert.equal(timing.scheduledForLocal, "2026-06-06 09:00 Europe/Berlin");
  assert.equal(timing.triggeredLocal, "2026-06-06 09:44 Europe/Berlin");
  assert.equal(timing.inScheduledHour, true);
  assert.equal(timing.retryWindow, true);
}

{
  const previousAllowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  process.env.TELEGRAM_ALLOWED_CHAT_ID = "allowed-chat";
  try {
    const payload = buildScheduledNudgeOutboxPayload(
      { id: "user-1" },
      { telegramChatId: "stale-chat" },
      { id: "task-1", text: "Check planner" },
      "morning",
      Date.parse("2026-06-06T07:44:00.000Z"),
    );

    assert.equal(payload.payload.dateKey, "2026-06-06");
    assert.equal(payload.payload.slot, "morning");
    assert.equal(payload.payload.timing.scheduledForLocal, "2026-06-06 09:00 Europe/Berlin");
    assert.equal(payload.payload.timing.triggeredLocal, "2026-06-06 09:44 Europe/Berlin");
    assert.equal(payload.payload.timing.retryWindow, true);
    assert.equal(payload.payload.params.dateKey, "2026-06-06");
    assert.equal(payload.payload.params.scheduledForLocal, "2026-06-06 09:00 Europe/Berlin");
    assert.equal(payload.payload.params.triggeredLocal, "2026-06-06 09:44 Europe/Berlin");

    const status = buildDeliveryStatus({
      id: payload.dedupe_key,
      channel: payload.channel,
      topic: payload.topic,
      payload: payload.payload,
    }, "queued", Date.parse("2026-06-06T07:44:01.000Z"));

    assert.equal(status.slot, "morning");
    assert.equal(status.dateKey, "2026-06-06");
  } finally {
    if (previousAllowedChatId === undefined) {
      delete process.env.TELEGRAM_ALLOWED_CHAT_ID;
    } else {
      process.env.TELEGRAM_ALLOWED_CHAT_ID = previousAllowedChatId;
    }
  }
}

console.log("planner nudge schedule tests passed");
