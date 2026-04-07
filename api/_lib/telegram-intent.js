const { openRouterChatCompletion } = require("./openrouter");

const DEFAULT_TELEGRAM_INTENT_MODEL = "google/gemma-4-26b-a4b-it";
const BERLIN_DATE_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getTodayIsoDate() {
  return BERLIN_DATE_FORMAT.format(new Date());
}

function extractJsonObject(rawText = "") {
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const startIndex = trimmed.indexOf("{");
  const endIndex = trimmed.lastIndexOf("}");
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return trimmed.slice(startIndex, endIndex + 1);
  }

  throw new Error("Model did not return a JSON object");
}

function normalizeIntent(payload = {}) {
  const allowedIntents = new Set(["add_task", "show_today", "panic", "chat"]);
  const intent = allowedIntents.has(payload.intent) ? payload.intent : "chat";

  const urgency =
    payload.urgency === "high" || payload.urgency === "medium" || payload.urgency === "low"
      ? payload.urgency
      : null;

  return {
    intent,
    task_text: typeof payload.task_text === "string" ? payload.task_text.trim() : "",
    deadline_at:
      typeof payload.deadline_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.deadline_at)
        ? payload.deadline_at
        : null,
    urgency,
    is_today: Boolean(payload.is_today),
    is_vital: Boolean(payload.is_vital),
    reply_text:
      typeof payload.reply_text === "string" && payload.reply_text.trim()
        ? payload.reply_text.trim()
        : null,
  };
}

async function parseTelegramIntent({ text, tasks = [] }) {
  const compactTasks = tasks
    .filter((task) => task.status === "active")
    .slice(0, 8)
    .map((task) => ({
      text: task.text,
      isToday: !!task.isToday,
      isVital: !!task.isVital,
      urgency: task.urgency || "medium",
      deadlineAt: task.deadlineAt || "",
    }));

  const systemPrompt = [
    "Ты разбираешь сообщения для Telegram-бота планировщика задач для человека с СДВГ.",
    "Твоя работа — вернуть только JSON без markdown и без пояснений.",
    "Сегодня в Europe/Berlin дата " + getTodayIsoDate() + ".",
    "Разрешённые intent: add_task, show_today, panic, chat.",
    "Если пользователь просит сохранить, занести, не забыть, добавить, напомнить — чаще всего это add_task.",
    "Если пользователь спрашивает, что сейчас главное, что горит, что сегодня — это show_today.",
    "Если пользователь пишет, что завис, не знает с чего начать, просит выбрать одно — это panic.",
    "Если это приветствие, уточнение, маленький разговор — это chat.",
    "Если фраза двусмысленная, но выглядит как дело, которое нельзя потерять, предпочти add_task.",
    "Для add_task сократи task_text до ясной короткой формулировки задачи на русском.",
    "Если в тексте есть дедлайн, верни deadline_at в формате YYYY-MM-DD. Иначе null.",
    "Если задача звучит очень срочно или с жёстким сроком, urgency=high. Если обычная — medium. Если можно потом — low.",
    "Если пользователь явно просит на сегодня — is_today=true.",
    "Если задача звучит жизненно критично — is_vital=true.",
    "Для chat верни короткий ответ по-русски в reply_text.",
    "JSON-схема ответа:",
    '{"intent":"add_task|show_today|panic|chat","task_text":"string","deadline_at":"YYYY-MM-DD|null","urgency":"low|medium|high|null","is_today":false,"is_vital":false,"reply_text":"string|null"}',
    "Вот краткий контекст активных задач пользователя:",
    JSON.stringify(compactTasks),
  ].join("\n");

  const data = await openRouterChatCompletion({
    model: process.env.TELEGRAM_INTENT_MODEL || DEFAULT_TELEGRAM_INTENT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    maxTokens: 220,
    responseFormat: { type: "json_object" },
  });

  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = JSON.parse(extractJsonObject(content));
  return normalizeIntent(parsed);
}

module.exports = {
  DEFAULT_TELEGRAM_INTENT_MODEL,
  parseTelegramIntent,
};
