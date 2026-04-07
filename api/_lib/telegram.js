const TELEGRAM_API_BASE = "https://api.telegram.org";

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
        { text: "✅ Готово", callback_data: `done:${taskId}` },
        { text: "📌 Закрепить", callback_data: `today:${taskId}` },
      ],
      [
        { text: "🚨 Критично", callback_data: `vital:${taskId}` },
        { text: "🆘 Panic", callback_data: `panic:${taskId}` },
      ],
    ],
  };
}

module.exports = {
  plannerTaskKeyboard,
  telegramRequest,
};
