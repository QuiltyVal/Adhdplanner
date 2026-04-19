const { openRouterChatCompletion } = require("./openrouter");

const DEFAULT_TELEGRAM_INTENT_MODEL = "google/gemma-3-27b-it";
const DEFAULT_TELEGRAM_INTENT_TIMEOUT_MS = 12000;

const BERLIN_DATE_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getTodayIsoDate() {
  return BERLIN_DATE_FORMAT.format(new Date());
}

const ALLOWED_INTENTS = new Set([
  "add_task",
  "complete_task",
  "reopen_task",
  "delete_subtask",
  "add_subtask",
  "set_today",
  "unset_today",
  "set_vital",
  "unset_vital",
  "suggest_unpin",
  "show_today",
  "panic",
  "schedule_task",
  "chat",
]);

function normalizeForIntent(text = "") {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[«»]/g, "\"")
    .replace(/\s+/g, " ");
}

function extractQuotedSegments(text = "") {
  return Array.from(String(text).matchAll(/[«"]([^«»"]+)[»"]/g))
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function inferTaskReference(text = "") {
  return String(text || "")
    .replace(/^(переведи|заверши|выполни|выполнить|открепи|сними|снять|верни|сделай|закрепи|пометь|запланируй|добавь|добавить|удали|удалить)\s+/i, "")
    .replace(/(?:^|\s)(на|в)\s+сегодня(?=\s|$)/giu, " ")
    .replace(/(?:^|\s)(критичн|критичност|выполненн|в\s+рай|сейчас|сегодня\s+в\s+раю)(?=\s|$)/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferQuickIntent(text = "") {
  const normalized = normalizeForIntent(text);
  if (!normalized) return null;
  const quoted = extractQuotedSegments(text);

  if (/\b(показ|что.*сегодня|что.*сейчас|главн|горит|главное|сегодняшн)\b/.test(normalized)) {
    return {
      intent: "show_today",
      task_text: "",
      task_ref: null,
      subtask_text: null,
    };
  }

  if (/\b(паник|паника|panic)\b/.test(normalized)) {
    return {
      intent: "panic",
      task_text: "",
      task_ref: null,
      subtask_text: null,
    };
  }

  if (/\b(выполн|готов|заверш|в рай)\b/.test(normalized)) {
    const taskRef = inferTaskReference(normalized);
    return {
      intent: "complete_task",
      task_ref: taskRef || (quoted[0] || null),
      subtask_text: null,
      task_text: "",
    };
  }

  if (/\b(верн|возврат|воскрес|восстанов|спаси)\b/.test(normalized)) {
    return {
      intent: "reopen_task",
      task_ref: inferTaskReference(normalized) || quoted[0] || null,
      subtask_text: null,
      task_text: "",
    };
  }

  if (/\b(сегодня|сегодняшн).*(закреп|прикреп)/.test(normalized)) {
    return {
      intent: "set_today",
      task_ref: inferTaskReference(normalized) || quoted[0] || null,
      subtask_text: null,
      task_text: "",
    };
  }

  if (/(сними|откреп|убер|удали|снять).*(сегодня|сегодняшн)/u.test(normalized)) {
    return {
      intent: "unset_today",
      task_ref: inferTaskReference(normalized) || quoted[0] || null,
      subtask_text: null,
      task_text: "",
    };
  }

  if (/(сними|снять|убери|убрать|без|не).*(критич|критичност|жизненн|важн|срочн)/u.test(normalized)) {
    return {
      intent: "unset_vital",
      task_ref: inferTaskReference(normalized) || quoted[0] || null,
      subtask_text: null,
      task_text: "",
    };
  }

  if (/\b(критич|жизненн|срочно)\b/.test(normalized)) {
    return {
      intent: "set_vital",
      task_ref: inferTaskReference(normalized) || quoted[0] || null,
      subtask_text: null,
      task_text: "",
    };
  }

  const addSubtaskQuoted = /\b(добавь|добавить).*(подзадач|шаг)/.test(normalized);
  if (addSubtaskQuoted && quoted.length >= 2) {
    return {
      intent: "add_subtask",
      task_ref: quoted[0],
      subtask_text: quoted[1],
      task_text: "",
    };
  }

  const deleteSubtaskQuoted = /\b(удал|удали|снес|убери?)\b.*(подзадач|шаг)/.test(normalized);
  if (deleteSubtaskQuoted && quoted.length >= 2) {
    return {
      intent: "delete_subtask",
      task_ref: quoted[0],
      subtask_text: quoted[1],
      task_text: "",
    };
  }

  if (/\b(посоветуй|что.*откреп|какую.*откреп|сними.*сегодня|предложи).*\b/.test(normalized)) {
    return {
      intent: "suggest_unpin",
      task_text: "",
      task_ref: null,
      subtask_text: null,
    };
  }

  if (/\b(заплан|календ|распис|создай.*событи)/.test(normalized)) {
    return {
      intent: "schedule_task",
      task_text: "",
      task_ref: quoted[0] || normalized,
      subtask_text: null,
    };
  }

  if (/^(добавь|добавить|поставь|напомни|напиши|нужно|надо|хочу|сделай|запиши|позже)\b/.test(normalized)) {
    return {
      intent: "add_task",
      task_text: String(text || "").trim(),
      task_ref: null,
      subtask_text: null,
    };
  }

  return null;
}

function inferFallbackIntent(text = "") {
  const normalized = normalizeForIntent(text);
  if (!normalized) {
    return {
      intent: "chat",
      reply_text: "Сформулируй это как задачу, или просто напиши /today или /panic.",
      task_text: "",
    };
  }

  if (/\b(привет|как|что|когда|почему|как-то|помог|помоги|что-то)\b/.test(normalized) && normalized.length < 20) {
    return {
      intent: "chat",
      reply_text: "Сформулируй это как задачу или просто выбери /today или /panic.",
      task_text: "",
    };
  }

  const quick = inferQuickIntent(normalized);
  if (quick) {
    return quick;
  }

  return {
    intent: "add_task",
    task_text: String(text || "").trim(),
    task_ref: null,
    subtask_text: null,
  };
}

function normalizeTimeoutMs(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TELEGRAM_INTENT_TIMEOUT_MS;
}

function buildSystemPrompt({ tasks, telegramContext, todayDate }) {
  const activeTasks = (tasks || []).filter((t) => t.status === "active");
  const completedTasks = (tasks || [])
    .filter((t) => t.status === "completed")
    .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))
    .slice(0, 5);
  const deadTasks = (tasks || [])
    .filter((t) => t.status === "dead")
    .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))
    .slice(0, 3);

  const ctx = telegramContext || {};
  const lines = [
    "Ты — умный роутер для Telegram-бота планировщика задач (ADHD Planner).",
    "Твоя работа: понять что хочет пользователь и вернуть JSON с intent и параметрами.",
    "Отвечай только JSON без markdown, без пояснений.",
    `Сегодня (Europe/Berlin): ${todayDate}`,
    "",
    "## КОНТЕКСТ ПОСЛЕДНЕГО ДЕЙСТВИЯ БОТА",
    `Последнее действие: ${ctx.lastAction || "нет"}`,
    `Последняя задача: ${ctx.lastTaskText ? `"${ctx.lastTaskText}"` : "нет"}`,
  ];

  if (Array.isArray(ctx.suggestedTaskTexts) && ctx.suggestedTaskTexts.length > 0) {
    lines.push(
      `Бот только что показал этот список пользователю: ${ctx.suggestedTaskTexts.map((t, i) => `${i + 1}. "${t}"`).join(", ")}`,
    );
    lines.push(
      "(Если пользователь говорит 'последнюю', 'первую', 'вторую', 'давай её', 'давай вот ту' — это ссылка на задачу из этого списка)",
    );
  }

  lines.push("", "## АКТИВНЫЕ ЗАДАЧИ");
  if (activeTasks.length === 0) {
    lines.push("Активных задач нет.");
  } else {
    for (const t of activeTasks.slice(0, 15)) {
      const flags = [];
      if (t.isToday) flags.push("📌сегодня");
      if (t.isVital) flags.push("🚨критично");
      if (t.urgency === "high") flags.push("⏰срочно");
      if (t.deadlineAt) flags.push(`📅${t.deadlineAt}`);
      const subtaskCount = Array.isArray(t.subtasks) ? t.subtasks.length : 0;
      if (subtaskCount > 0) flags.push(`${subtaskCount}подзадач`);
      lines.push(`- "${t.text}"${flags.length ? ` [${flags.join(" ")}]` : ""}`);
    }
  }

  if (completedTasks.length > 0) {
    lines.push("", `## ВЫПОЛНЕННЫЕ (последние ${completedTasks.length})`);
    for (const t of completedTasks) lines.push(`- "${t.text}"`);
  }

  if (deadTasks.length > 0) {
    lines.push("", `## УДАЛЁННЫЕ (последние ${deadTasks.length})`);
    for (const t of deadTasks) lines.push(`- "${t.text}"`);
  }

  lines.push(
    "",
    "## РАЗРЕШЁННЫЕ INTENT (выбери один)",
    "- add_task: добавить НОВУЮ задачу (сохрани, добавь, не забыть, занеси, напомни)",
    "- complete_task: отправить задачу в рай/выполненные/готово",
    "- reopen_task: вернуть задачу из рая или кладбища обратно в активные",
    "- delete_subtask: удалить подзадачу (нужны task_ref И subtask_text)",
    "- add_subtask: добавить подзадачу к задаче (нужны task_ref И subtask_text)",
    "- set_today: закрепить задачу на сегодня",
    "- unset_today: открепить задачу от сегодня (сними, открепи, убери с сегодня)",
    "- set_vital: пометить задачу критичной/жизненно важной",
    "- unset_vital: снять с задачи критичность/жизненную важность",
    "- suggest_unpin: пользователь спрашивает 'что открепить', 'предложи другое', 'покажи список'",
    "- show_today: показать что горит/главное сегодня",
    "- panic: паника — выбрать одну задачу и один шаг",
    "- schedule_task: создать событие в Google Calendar",
    "- chat: просто разговор без действия",
    "",
    "## ПРАВИЛА",
    "- task_ref: ТОЧНЫЙ текст существующей задачи из списков выше, или null",
    "- Если пользователь ссылается на задачу приблизительно — подбери точное совпадение из списка",
    "- После suggest_unpin: 'последнюю' = последняя задача из показанного списка (наибольший номер)",
    "- После suggest_unpin: 'первую/вторую/третью' = задача по номеру из показанного списка",
    "- 'её', 'эту', 'последнюю' без контекста = задача из 'Последняя задача' выше",
    "- task_text только для add_task (текст новой задачи), для остальных — task_ref",
    "- subtask_text для add_subtask и delete_subtask",
    "- is_today=true если пользователь явно говорит 'на сегодня' для add_task",
    "- Для chat верни короткий ответ по-русски в reply_text",
    "",
    "## JSON СХЕМА ОТВЕТА",
    '{"intent":"add_task","task_ref":null,"subtask_text":null,"task_text":"","deadline_at":null,"start_time":null,"duration_minutes":null,"urgency":null,"is_today":false,"is_vital":false,"subtasks":[],"reply_text":null}',
  );

  return lines.join("\n");
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
  const intent = ALLOWED_INTENTS.has(payload.intent) ? payload.intent : "chat";

  const urgency =
    payload.urgency === "high" || payload.urgency === "medium" || payload.urgency === "low"
      ? payload.urgency
      : null;

  return {
    intent,
    task_ref: typeof payload.task_ref === "string" && payload.task_ref.trim() ? payload.task_ref.trim() : null,
    subtask_text: typeof payload.subtask_text === "string" && payload.subtask_text.trim() ? payload.subtask_text.trim() : null,
    task_text: typeof payload.task_text === "string" ? payload.task_text.trim() : "",
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

async function parseTelegramIntent({ text, tasks = [], telegramContext = {} }) {
  const systemPrompt = buildSystemPrompt({
    tasks,
    telegramContext,
    todayDate: getTodayIsoDate(),
  });

  try {
    const data = await openRouterChatCompletion({
      model: process.env.TELEGRAM_INTENT_MODEL || DEFAULT_TELEGRAM_INTENT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      maxTokens: 300,
      responseFormat: { type: "json_object" },
      timeoutMs: normalizeTimeoutMs(process.env.TELEGRAM_INTENT_TIMEOUT_MS),
    });

    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(extractJsonObject(content));
    return normalizeIntent(parsed);
  } catch (error) {
    console.error("[telegram-intent] fallback:", error.message || String(error));
    const fallback = inferFallbackIntent(text);
    return normalizeIntent({
      ...fallback,
      task_text: fallback.intent === "add_task" ? String(text || "").trim() : fallback.task_text || "",
    });
  }
}

module.exports = {
  DEFAULT_TELEGRAM_INTENT_MODEL,
  parseTelegramIntent,
};
