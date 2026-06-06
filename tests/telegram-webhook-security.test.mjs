import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const telegramWebhook = require("../api/telegram-webhook.js");
const {
  buildScheduledNudgeOutboxPayload,
} = require("../api/_lib/planner-scheduled-nudge-outbox.js");
const {
  calendarConnectKeyboard,
  completedTaskKeyboard,
  plannerOpenKeyboard,
  plannerTaskKeyboard,
} = require("../api/_lib/telegram.js");

const {
  buildTelegramCalendarResponse,
  buildTelegramHelpResponse,
  buildTelegramHelpText,
  buildTelegramSecurityDecision,
  isAllowedChat,
} = telegramWebhook._test;

assert.equal(typeof buildTelegramCalendarResponse, "function");
assert.equal(typeof buildTelegramHelpResponse, "function");
assert.equal(typeof buildTelegramHelpText, "function");
assert.equal(typeof buildTelegramSecurityDecision, "function");
assert.equal(typeof isAllowedChat, "function");

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

{
  const helpText = buildTelegramHelpText();
  assert.match(helpText, /\/help/);
  assert.match(helpText, /\/calendar/);
  assert.match(helpText, /\/cemetery/);
}

{
  const helpResponse = buildTelegramHelpResponse();
  assert.match(helpResponse.text, /\/today/);
  assert.match(helpResponse.text, /\/completed/);
  assert.match(helpResponse.text, /\/calendar/);
  assert.match(helpResponse.text, /\/cemetery/);
  assert.equal(keyboardHasPlannerLink(helpResponse.reply_markup), true);
}

{
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const previousRedirectUri = process.env.GOOGLE_REDIRECT_URI;
  const previousStateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-google-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  process.env.GOOGLE_REDIRECT_URI = "https://planner.valquilty.com/api/google-calendar-callback";
  process.env.GOOGLE_OAUTH_STATE_SECRET = "test-state-secret";

  try {
    const calendarResponse = buildTelegramCalendarResponse({ userId: "user-1" });
    const flatButtons = calendarResponse.reply_markup.inline_keyboard.flat();
    const calendarButton = flatButtons.find((button) => button?.text === "📅 Connect Google Calendar");

    assert.match(calendarResponse.text, /Google Calendar access/);
    assert.equal(keyboardHasPlannerLink(calendarResponse.reply_markup), true);
    assert.equal(Boolean(calendarButton), true);
    assert.match(calendarButton.url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    assert.match(calendarButton.url, /client_id=test-google-client/);
    assert.match(calendarButton.url, /scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar/);
  } finally {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
    if (previousRedirectUri === undefined) delete process.env.GOOGLE_REDIRECT_URI;
    else process.env.GOOGLE_REDIRECT_URI = previousRedirectUri;
    if (previousStateSecret === undefined) delete process.env.GOOGLE_OAUTH_STATE_SECRET;
    else process.env.GOOGLE_OAUTH_STATE_SECRET = previousStateSecret;
  }
}

{
  const taskKeyboard = plannerTaskKeyboard("task-1");
  assert.equal(keyboardHasPlannerLink(plannerOpenKeyboard()), true);
  assert.equal(keyboardHasPlannerLink(taskKeyboard), true);
  assert.equal(keyboardHasCallback(taskKeyboard, "kill:task-1"), true);
  assert.equal(keyboardHasCallback(taskKeyboard, "confirm_kill:task-1"), false);
  assert.equal(keyboardHasPlannerLink(completedTaskKeyboard("task-1")), true);
  assert.equal(keyboardHasPlannerLink(calendarConnectKeyboard("https://calendar.example/connect")), true);
}

console.log("telegram webhook security tests passed");
