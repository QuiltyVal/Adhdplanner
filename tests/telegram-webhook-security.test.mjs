import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const telegramWebhook = require("../api/telegram-webhook.js");
const {
  buildScheduledNudgeOutboxPayload,
} = require("../api/_lib/planner-scheduled-nudge-outbox.js");

const { buildTelegramSecurityDecision, isAllowedChat } = telegramWebhook._test;

assert.equal(typeof buildTelegramSecurityDecision, "function");
assert.equal(typeof isAllowedChat, "function");

{
  const decision = buildTelegramSecurityDecision({
    chatId: "spam-chat",
    text: "cheap accounts spam",
    allowedChatId: "real-chat",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.rejected, true);
  assert.equal(decision.reason, "rejected_unknown_chat");
  assert.equal(decision.canLinkChat, false);
}

{
  const decision = buildTelegramSecurityDecision({
    chatId: "real-chat",
    text: "plain message from the allowed chat",
    allowedChatId: "real-chat",
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.rejected, false);
  assert.equal(decision.command, "plain");
  assert.equal(decision.canLinkChat, false);
}

{
  const decision = buildTelegramSecurityDecision({
    chatId: "real-chat",
    text: "/start",
    allowedChatId: "real-chat",
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.rejected, false);
  assert.equal(decision.command, "/start");
  assert.equal(decision.canLinkChat, true);
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
      Date.parse("2026-05-27T07:00:00.000Z"),
    );

    assert.equal(payload.payload.chatId, "allowed-chat");
    assert.match(payload.dedupe_key, /chat_/);
  } finally {
    if (previousAllowedChatId === undefined) {
      delete process.env.TELEGRAM_ALLOWED_CHAT_ID;
    } else {
      process.env.TELEGRAM_ALLOWED_CHAT_ID = previousAllowedChatId;
    }
  }
}

console.log("telegram webhook security tests passed");
