const { openRouterChatCompletion } = require("./openrouter");

const DEFAULT_TELEGRAM_INTENT_MODEL = "google/gemma-4-26b-a4b-it";
const BERLIN_DATE_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MONTH_INDEX = {
  января: 0,
  январь: 0,
  jan: 0,
  февраля: 1,
  февраль: 1,
  фев: 1,
  марта: 2,
  март: 2,
  mar: 2,
  апреля: 3,
  апрель: 3,
  апр: 3,
  мая: 4,
  май: 4,
  июня: 5,
  июнь: 5,
  июн: 5,
  июля: 6,
  июль: 6,
  июл: 6,
  августа: 7,
  август: 7,
  авг: 7,
  сентября: 8,
  сентябрь: 8,
  сен: 8,
  октября: 9,
  октябрь: 9,
  окт: 9,
  ноября: 10,
  ноябрь: 10,
  ноя: 10,
  декабря: 11,
  декабрь: 11,
  дек: 11,
};

function getTodayIsoDate() {
  return BERLIN_DATE_FORMAT.format(new Date());
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function extractRussianDate(text) {
  const normalizedText = String(text || "").toLowerCase();
  const now = new Date();

  const isoMatch = normalizedText.match(/(20\d{2}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const dottedMatch = normalizedText.match(/(^|[^\d])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=$|[^\d])/);
  if (dottedMatch) {
    const day = Number(dottedMatch[2]);
    const month = Number(dottedMatch[3]) - 1;
    let year = dottedMatch[4] ? Number(dottedMatch[4]) : now.getFullYear();
    if (year < 100) year += 2000;

    const candidate = new Date(year, month, day);
    if (!Number.isNaN(candidate.getTime()) && candidate.getDate() === day && candidate.getMonth() === month) {
      if (!dottedMatch[4] && candidate < now) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
      return toIsoDate(candidate);
    }
  }

  const monthMatch = normalizedText.match(/(?:^|[\s,.;:])(до|к|на)?\s*(\d{1,2})\s+(января|январь|февраля|февраль|марта|март|апреля|апрель|мая|май|июня|июнь|июля|июль|августа|август|сентября|сентябрь|октября|октябрь|ноября|ноябрь|декабря|декабрь)(?=$|[\s,.;:!?])/);
  if (monthMatch) {
    const day = Number(monthMatch[2]);
    const month = MONTH_INDEX[monthMatch[3]];
    const candidate = new Date(now.getFullYear(), month, day);
    if (!Number.isNaN(candidate.getTime()) && candidate.getDate() === day && candidate.getMonth() === month) {
      if (candidate < now) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
      return toIsoDate(candidate);
    }
  }

  if (/(^|[\s,.;:!?])сегодня(?=$|[\s,.;:!?])/.test(normalizedText)) {
    return toIsoDate(now);
  }

  if (/(^|[\s,.;:!?])завтра(?=$|[\s,.;:!?])/.test(normalizedText)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return toIsoDate(tomorrow);
  }

  return null;
}

function deriveTaskText(rawText) {
  return String(rawText || "")
    .trim()
    .replace(/^(добавь|добавить|занеси|сохрани|запиши|напомни|мне нужно|надо)\s+(в\s+планер\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validateIntent(rawText, parsedIntent) {
  const text = String(rawText || "").trim();
  const lowered = text.toLowerCase();
  const deadlineFromText = extractRussianDate(lowered);
  const asksToday = lowered.includes("сегодня") || lowered.includes("на сегодня");
  const asksPanic = /паник|panic|зависла|завис|не знаю с чего начать|помоги выбрать одно/.test(lowered);
  const asksShowToday = /что у меня.*сегодня|что у меня.*горит|самое важное|что главное|покажи задачи/.test(lowered);
  const asksSchedule = /запланируй|поставь в календарь|занеси в календарь|создай событие|забронируй время/.test(lowered);
  const asksAddSubtask = /подзадач|шаг/.test(lowered) && /добавь|добавить|добваь|добаьв/.test(lowered);
  const soundsLikeCapture = /добавь|добавить|занеси|запиши|сохрани|напомни|надо|нужно|не забыть/.test(lowered);
  const soundsVital = /критич|жизненно важ|обязательно|любой ценой/.test(lowered);
  const soundsUrgent = /срочно|горит|как можно скорее|немедленно|дедлайн/.test(lowered);
  const timeMatch = lowered.match(/(?:в|на)\s*(\d{1,2})(?::|\.| )?(\d{2})?\b/);
  const durationMatch =
    lowered.match(/(\d+)\s*мин/) ||
    lowered.match(/(\d+(?:[.,]\d+)?)\s*час/);

  const intent = { ...parsedIntent };

  if (asksPanic) {
    intent.intent = "panic";
  } else if (asksAddSubtask) {
    intent.intent = "add_subtask";
  } else if (asksSchedule) {
    intent.intent = "schedule_task";
  } else if (asksShowToday && intent.intent === "chat") {
    intent.intent = "show_today";
  } else if (soundsLikeCapture && intent.intent === "chat") {
    intent.intent = "add_task";
  }

  if (intent.intent === "add_task") {
    intent.task_text = intent.task_text || deriveTaskText(text) || text;
  }

  if (intent.intent === "add_subtask") {
    if (!intent.subtask_text) {
      const cleaned = text
        .replace(/^(добавь|добавить|добваь|добаьв)\s+/i, "")
        .replace(/^(к|в|для)\s+/i, "")
        .replace(/\s+(подзачу|подзадачу|шаг)\s+/i, ": ")
        .trim();
      if (cleaned) {
        const parts = cleaned.split(/\s*:\s*/);
        if (parts.length >= 2) {
          intent.task_ref = intent.task_ref || parts[0].trim();
          intent.subtask_text = parts.slice(1).join(": ").trim();
        }
      }
    }

    if (!intent.task_ref && /последн|эту|этой|эта|ее|её|ней/.test(lowered)) {
      intent.task_ref = "last_task";
    }

    if (!intent.subtask_text && intent.task_text) {
      intent.subtask_text = intent.task_text;
      intent.task_text = "";
    }
  }

  if (!intent.deadline_at && deadlineFromText) {
    intent.deadline_at = deadlineFromText;
  }

  if (!intent.start_time && timeMatch) {
    const hours = Math.min(23, Number(timeMatch[1]));
    const minutes = Math.min(59, Number(timeMatch[2] || "00"));
    intent.start_time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  if (!intent.duration_minutes && durationMatch) {
    if (durationMatch[0].includes("мин")) {
      intent.duration_minutes = Math.max(15, Math.min(480, Number(durationMatch[1])));
    } else {
      const hours = Number(String(durationMatch[1]).replace(",", "."));
      intent.duration_minutes = Math.max(30, Math.min(480, Math.round(hours * 60)));
    }
  }

  if (asksToday) {
    intent.is_today = true;
  }

  if (soundsVital) {
    intent.is_vital = true;
  }

  if (!intent.urgency && soundsUrgent) {
    intent.urgency = "high";
  }

  if (!intent.urgency && intent.deadline_at) {
    const today = new Date(getTodayIsoDate());
    const deadline = new Date(`${intent.deadline_at}T00:00:00`);
    const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (daysLeft <= 3) {
      intent.urgency = "high";
    } else if (daysLeft <= 10) {
      intent.urgency = "medium";
    }
  }

  if (!intent.urgency && intent.intent === "add_task") {
    intent.urgency = "medium";
  }

  if (!intent.duration_minutes && intent.intent === "schedule_task") {
    intent.duration_minutes = 60;
  }

  if (intent.intent === "schedule_task") {
    intent.task_text = intent.task_text || deriveTaskText(text) || text;
  }

  if (!intent.reply_text && intent.intent === "chat") {
    intent.reply_text = "Могу добавить это как задачу, показать что горит, или включить panic mode.";
  }

  return intent;
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
  const allowedIntents = new Set(["add_task", "add_subtask", "show_today", "panic", "schedule_task", "chat"]);
  const intent = allowedIntents.has(payload.intent) ? payload.intent : "chat";

  const urgency =
    payload.urgency === "high" || payload.urgency === "medium" || payload.urgency === "low"
      ? payload.urgency
      : null;

  return {
    intent,
    task_text: typeof payload.task_text === "string" ? payload.task_text.trim() : "",
    task_ref: typeof payload.task_ref === "string" ? payload.task_ref.trim() : "",
    subtask_text: typeof payload.subtask_text === "string" ? payload.subtask_text.trim() : "",
    subtasks: Array.isArray(payload.subtasks)
      ? payload.subtasks
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 7)
      : [],
    deadline_at:
      typeof payload.deadline_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.deadline_at)
        ? payload.deadline_at
        : null,
    start_time:
      typeof payload.start_time === "string" && /^\d{2}:\d{2}$/.test(payload.start_time)
        ? payload.start_time
        : null,
    duration_minutes:
      typeof payload.duration_minutes === "number" && payload.duration_minutes > 0
        ? Math.min(payload.duration_minutes, 480)
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

async function parseTelegramIntent({ text, tasks = [], telegramContext = null }) {
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
    "Разрешённые intent: add_task, add_subtask, show_today, panic, schedule_task, chat.",
    "Если пользователь просит сохранить, занести, не забыть, добавить, напомнить — чаще всего это add_task.",
    "Если пользователь просит добавить шаг или подзадачу к существующей задаче — это add_subtask.",
    "Если пользователь спрашивает, что сейчас главное, что горит, что сегодня — это show_today.",
    "Если пользователь пишет, что завис, не знает с чего начать, просит выбрать одно — это panic.",
    "Если пользователь хочет поставить задачу в календарь, забронировать время, создать событие — это schedule_task.",
    "Если это приветствие, уточнение, маленький разговор — это chat.",
    "Если фраза двусмысленная, но выглядит как дело, которое нельзя потерять, предпочти add_task.",
    "Для add_task сократи task_text до ясной короткой формулировки задачи на русском.",
    "Для add_subtask верни subtask_text и task_ref.",
    "Если пользователь ссылается на последнюю/эту/её задачу, ставь task_ref='last_task'.",
    "Если он называет задачу текстом, клади её название в task_ref.",
    "Для schedule_task верни task_text как название события, deadline_at как дату события, start_time как HH:MM, duration_minutes числом.",
    "Если в сообщении после двоеточия, тире или списка перечислены шаги, верни их как subtasks массивом строк.",
    "Если в тексте есть дедлайн, верни deadline_at в формате YYYY-MM-DD. Иначе null.",
    "Если задача звучит очень срочно или с жёстким сроком, urgency=high. Если обычная — medium. Если можно потом — low.",
    "Если пользователь явно просит на сегодня — is_today=true.",
    "Если задача звучит жизненно критично — is_vital=true.",
    "Для chat верни короткий ответ по-русски в reply_text.",
    "JSON-схема ответа:",
    '{"intent":"add_task|add_subtask|show_today|panic|schedule_task|chat","task_text":"string","task_ref":"string","subtask_text":"string","subtasks":["string"],"deadline_at":"YYYY-MM-DD|null","start_time":"HH:MM|null","duration_minutes":60,"urgency":"low|medium|high|null","is_today":false,"is_vital":false,"reply_text":"string|null"}',
    "Текущий Telegram context:",
    JSON.stringify({
      lastTaskId: telegramContext?.lastTaskId || null,
      lastTaskText: telegramContext?.lastTaskText || "",
      lastAction: telegramContext?.lastAction || "",
    }),
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
  return validateIntent(text, normalizeIntent(parsed));
}

module.exports = {
  DEFAULT_TELEGRAM_INTENT_MODEL,
  extractRussianDate,
  parseTelegramIntent,
};
