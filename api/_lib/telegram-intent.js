const { PLANNER_ACTIONS } = require("./planner-action-types");
const { openRouterChatCompletion } = require("./openrouter");
const { validatePlannerDeadline } = require("./planner-deadline");

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
  PLANNER_ACTIONS.ADD_TASK,
  PLANNER_ACTIONS.COMPLETE_TASK,
  PLANNER_ACTIONS.KILL_TASK,
  PLANNER_ACTIONS.REOPEN_TASK,
  PLANNER_ACTIONS.DELETE_SUBTASK,
  PLANNER_ACTIONS.ADD_SUBTASK,
  PLANNER_ACTIONS.SET_TODAY,
  PLANNER_ACTIONS.UNSET_TODAY,
  PLANNER_ACTIONS.SET_VITAL,
  PLANNER_ACTIONS.UNSET_VITAL,
  PLANNER_ACTIONS.SUGGEST_UNPIN,
  PLANNER_ACTIONS.SHOW_TODAY,
  PLANNER_ACTIONS.PANIC,
  PLANNER_ACTIONS.PANIC_TASK,
  PLANNER_ACTIONS.SCHEDULE_TASK,
  PLANNER_ACTIONS.CHAT,
]);

function normalizeForIntent(text = "") {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[«»]/g, "\"")
    .replace(/\s+/g, " ");
}

function normalizeIntentDeadline(value) {
  const validation = validatePlannerDeadline(value || "");
  return validation.ok ? validation.deadlineAt || null : null;
}

function extractQuotedSegments(text = "") {
  return Array.from(String(text).matchAll(/[«"]([^«»"]+)[»"]/g))
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function inferTaskReference(text = "") {
  return String(text || "")
    .replace(/^(переведи|отправь|перенеси|закинь|заверши|выполни|выполнить|открепи|сними|снять|верни|сделай|закрепи|пометь|запланируй|добавь|добавить|удали|удалить|убей|похорони)\s+/i, "")
    .replace(/^(mark|send|move|put|complete|completed|finish|finished|done|pin|unpin|remove|restore|reopen|return|revive|bring back|kill|bury|trash|delete|make|set|unset|clear)\s+/i, "")
    .replace(/^(задач[ауи]?|дело|таск)\s+/i, "")
    .replace(/^(task|quest|thing)\s+/i, "")
    .replace(/^(to|from)\s+(active|heaven|completed|cemetery|today)\s+/i, "")
    .replace(/(?:^|\s)(на|в|с)\s+сегодня(?=\s|$)/giu, " ")
    .replace(/(?:^|\s)(for|on|to|from)\s+(today|active|heaven|completed|cemetery)(?=\s|$)/giu, " ")
    .replace(/(?:^|\s)(критичн|критичност|выполненн|в\s+рай|в\s+ад(?:у)?|на\s+кладбище|в\s+кладбище|в\s+мусор|в\s+помойку|в\s+небытие|сейчас|сегодня\s+в\s+раю)(?=\s|$)/giu, " ")
    .replace(/(?:^|\s)(critical|priority|urgent|vital|important|done|completed|finished|heaven|cemetery|trash|active|today)(?=\s|$)/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickReferencedTask({ text = "", normalized = "", quoted = [], normalizeGeneric = false } = {}) {
  const quotedRef = quoted[0] || "";
  if (quotedRef) return quotedRef;
  const inferred = inferTaskReference(text || normalized);
  return normalizeGeneric ? normalizeGenericTaskRef(inferred) : inferred;
}

function normalizeGenericTaskRef(taskRef = "") {
  const cleaned = normalizeForIntent(taskRef)
    .replace(/[«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^(задач[ауи]?|дело|таск|ее|её|эту|эта|последн(?:юю|яя|ей)?|текущ(?:ую|ая|ей)?)$/iu.test(cleaned)) {
    return "";
  }
  return taskRef;
}

function inferPanicTaskReference(text = "") {
  const quoted = extractQuotedSegments(text);
  if (quoted.length > 0) return quoted[0];

  const cleaned = String(text || "")
    .replace(/[’‘`´]/g, "'")
    .replace(/^[\s🆘🚨❗!]+/u, "")
    .replace(/^(sos|help)\s*/iu, "")
    .replace(/^(ну\s+)?/iu, "")
    .replace(/^(включи|вруби|запусти|дай|сделай|переключи)\s+/iu, "")
    .replace(/^(паника|паник|panic)\s*/iu, "")
    .replace(/^(я\s+)?застрял[ао]?\s*/iu, "")
    .replace(/^(i\s*'?m|i\s+am|im)\s+stuck\s*/iu, "")
    .replace(/^stuck\s*/iu, "")
    .replace(/^(on|with)\s+/iu, "")
    .replace(/^(на|с|по)\s+/iu, "")
    .replace(/^(по|для)\s+(задач[еи]|делу)\s+/iu, "")
    .replace(/^(задач[еи]|делу)\s+/iu, "")
    .replace(/^(task|quest)\s+/iu, "")
    .replace(/^(режим|mode)\s+/iu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  if (/^(у меня|мне|сейчас|просто|пожалуйста)$/iu.test(cleaned)) return "";
  return cleaned;
}

function inferQuickIntent(text = "") {
  const normalized = normalizeForIntent(text);
  if (!normalized) return null;
  const quoted = extractQuotedSegments(text);

  if (/(показ|что.*сегодня|что.*сейчас|главн|горит|главное|сегодняшн)/u.test(normalized)) {
    return {
      intent: PLANNER_ACTIONS.SHOW_TODAY,
      task_text: "",
      task_ref: null,
      subtask_text: null,
    };
  }

  if (/(паник|паника|panic|застрял|застряла|застряло|затык|(?:^|\s)sos(?:\s|$)|🆘|i\s*'?m\s+stuck|i\s+am\s+stuck|im\s+stuck|stuck)/u.test(normalized)) {
    const panicTaskRef = inferPanicTaskReference(text);
    if (panicTaskRef) {
      return {
        intent: PLANNER_ACTIONS.PANIC_TASK,
        task_ref: panicTaskRef,
        task_text: "",
        subtask_text: null,
      };
    }
    return {
      intent: PLANNER_ACTIONS.PANIC,
      task_text: "",
      task_ref: null,
      subtask_text: null,
    };
  }

  if (/(в\s+ад|в\s+аду|кладбищ|мусор|помойк|небыт|похорон|убей|умертв|снеси|выкинь|сдохни|умри|удали из актив|cemetery|trash|bury|kill|delete from active|remove from active)/u.test(normalized)) {
    const taskRef = pickReferencedTask({ text, normalized, quoted, normalizeGeneric: true });
    return {
      intent: PLANNER_ACTIONS.KILL_TASK,
      task_ref: taskRef || null,
      subtask_text: null,
      task_text: "",
    };
  }

  if (/(выполн|готов(?:а|о|ы|ой|ым|ыми)?(?:\s|$)|заверш|в\s+рай|done(?:\s|$)|complete|completed|finish|finished|heaven)/u.test(normalized)) {
    const taskRef = pickReferencedTask({ text, normalized, quoted });
    return {
      intent: PLANNER_ACTIONS.COMPLETE_TASK,
      task_ref: taskRef || null,
      subtask_text: null,
      task_text: "",
    };
  }

  if (/(верн|возврат|воскрес|восстанов|спаси|return.*active|restore|reopen|bring back|revive)/u.test(normalized)) {
    return {
      intent: PLANNER_ACTIONS.REOPEN_TASK,
      task_ref: pickReferencedTask({ text, normalized, quoted }) || null,
      subtask_text: null,
      task_text: "",
    };
  }

  if (/((сегодня|сегодняшн).*(закреп|прикреп)|(закреп|прикреп).*(сегодня|сегодняшн)|today.*(?:^|\s)pin(?:\s|$)|(?:^|\s)pin(?:\s|$).*today)/u.test(normalized)) {
    return {
      intent: PLANNER_ACTIONS.SET_TODAY,
      task_ref: pickReferencedTask({ text, normalized, quoted }) || null,
      subtask_text: null,
      task_text: "",
    };
  }

  if (/(сними|откреп|убер|удали|снять).*(сегодня|сегодняшн)|unpin.*today|remove.*from today|clear.*today/u.test(normalized)) {
    return {
      intent: PLANNER_ACTIONS.UNSET_TODAY,
      task_ref: pickReferencedTask({ text, normalized, quoted }) || null,
      subtask_text: null,
      task_text: "",
    };
  }

  if (/(сними|снять|убери|убрать|без|не).*(критич|критичност|жизненн|важн|срочн)|(remove|clear|unset|not).*(critical|urgent|vital|important)/u.test(normalized)) {
    return {
      intent: PLANNER_ACTIONS.UNSET_VITAL,
      task_ref: pickReferencedTask({ text, normalized, quoted }) || null,
      subtask_text: null,
      task_text: "",
    };
  }

  if (/(критич|жизненн|срочно|critical|urgent|vital)/u.test(normalized)) {
    return {
      intent: PLANNER_ACTIONS.SET_VITAL,
      task_ref: pickReferencedTask({ text, normalized, quoted }) || null,
      subtask_text: null,
      task_text: "",
    };
  }

  const addSubtaskQuoted = /^(добавь|добавить).*(подзадач|шаг)/u.test(normalized);
  if (addSubtaskQuoted && quoted.length >= 2) {
    return {
      intent: PLANNER_ACTIONS.ADD_SUBTASK,
      task_ref: quoted[0],
      subtask_text: quoted[1],
      task_text: "",
    };
  }

  const deleteSubtaskQuoted = /^(удал|удали|снес|убери?).*(подзадач|шаг)/u.test(normalized);
  if (deleteSubtaskQuoted && quoted.length >= 2) {
    return {
      intent: PLANNER_ACTIONS.DELETE_SUBTASK,
      task_ref: quoted[0],
      subtask_text: quoted[1],
      task_text: "",
    };
  }

  if (/(посоветуй|что.*откреп|какую.*откреп|сними.*сегодня|предложи)/u.test(normalized)) {
    return {
      intent: PLANNER_ACTIONS.SUGGEST_UNPIN,
      task_text: "",
      task_ref: null,
      subtask_text: null,
    };
  }

  if (/(заплан|календ|распис|создай.*событи)/u.test(normalized)) {
    return {
      intent: PLANNER_ACTIONS.SCHEDULE_TASK,
      task_text: "",
      task_ref: quoted[0] || normalized,
      subtask_text: null,
    };
  }

  if (/^(добавь|добавить|поставь|напомни|напиши|нужно|надо|хочу|сделай|запиши|позже)(\s|$)/u.test(normalized)) {
    return {
      intent: PLANNER_ACTIONS.ADD_TASK,
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
      intent: PLANNER_ACTIONS.CHAT,
      reply_text: "Сформулируй это как задачу, или просто напиши /today или /panic.",
      task_text: "",
    };
  }

  if (/^(привет|как|что|когда|почему|как-то|помог|помоги|что-то)(\s|$)/u.test(normalized) && normalized.length < 20) {
    return {
      intent: PLANNER_ACTIONS.CHAT,
      reply_text: "Сформулируй это как задачу или просто выбери /today или /panic.",
      task_text: "",
    };
  }

  const quick = inferQuickIntent(text);
  if (quick) {
    return quick;
  }

  return {
    intent: PLANNER_ACTIONS.ADD_TASK,
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
    "- kill_task: отправить активную задачу в ад/кладбище/мусор, убрать из активных без завершения",
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
    "- panic_task: паника по конкретной задаче (task_ref обязателен)",
    "- schedule_task: создать событие в Google Calendar",
    "- chat: просто разговор без действия",
    "",
    "## ПРАВИЛА",
    "- task_ref: ТОЧНЫЙ текст существующей задачи из списков выше, или null",
    "- Если пользователь ссылается на задачу приблизительно — подбери точное совпадение из списка",
    "- После suggest_unpin: 'последнюю' = последняя задача из показанного списка (наибольший номер)",
    "- После suggest_unpin: 'первую/вторую/третью' = задача по номеру из показанного списка",
    "- 'её', 'эту', 'последнюю' без контекста = задача из 'Последняя задача' выше",
    "- Если пользователь пишет 'паника <название задачи>' или 'panic <название задачи>' — это panic_task, task_ref = название задачи",
    "- task_text только для add_task (текст новой задачи), для остальных — task_ref",
    "- Если пользователь говорит 'в ад', 'в аду', 'на кладбище', 'в мусор', 'в небытие', 'похорони', 'убей задачу', 'удали из активных' — это kill_task, НЕ complete_task",
    "- Если в одном тексте есть и 'рай', и 'ад/кладбище', приоритет у 'ад/кладбище': это kill_task",
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
    deadline_at: normalizeIntentDeadline(payload.deadline_at),
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
