const TELEGRAM_API_BASE = "https://api.telegram.org";
const PLANNER_WEB_URL = process.env.PLANNER_WEB_URL || "https://planner.valquilty.com";
const PLANNER_WEB_BUTTON = { text: "🌐 Open planner", url: PLANNER_WEB_URL };

function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return token;
}

async function telegramRequest(method, body) {
  const token = getTelegramBotToken();
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`Telegram API ${response.status}: ${data.description || "Unknown error"}`);
  }

  return data.result;
}

function plannerTaskKeyboard(taskId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Done", callback_data: `done:${taskId}` },
        { text: "📌 Pin today", callback_data: `today:${taskId}` },
      ],
      [
        { text: "🚨 Critical", callback_data: `vital:${taskId}` },
        { text: "🆘 I’m stuck", callback_data: `panic:${taskId}` },
      ],
      [
        PLANNER_WEB_BUTTON,
      ],
    ],
  };
}

function completedTaskKeyboard(taskId) {
  return {
    inline_keyboard: [
      [{ text: "↩️ Return to active", callback_data: `reopen:${taskId}` }],
      [PLANNER_WEB_BUTTON],
    ],
  };
}

function calendarConnectKeyboard(url) {
  return {
    inline_keyboard: [
      [{ text: "📅 Connect Google Calendar", url }],
      [PLANNER_WEB_BUTTON],
    ],
  };
}

function plannerOpenKeyboard() {
  return {
    inline_keyboard: [[PLANNER_WEB_BUTTON]],
  };
}

module.exports = {
  calendarConnectKeyboard,
  completedTaskKeyboard,
  plannerOpenKeyboard,
  plannerTaskKeyboard,
  telegramRequest,
};
