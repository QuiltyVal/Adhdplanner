const { buildTelegramContext, buildTelegramTaskLine, createTask, escapeHtml, getFirstOpenSubtask, getNonActiveTasks, getTaskById, getPlannerData, linkTelegramChat, mutatePlanner, pickRescueTask, sortTasksByPriority, writeTelegramLog } = require("./_lib/planner-store");
const { buildGoogleCalendarConnectUrl, createCalendarEvent, hasGoogleCalendarConnection } = require("./_lib/google-calendar");
const { buildTaskMemoryEnrichment, mergeTelegramTaskMemoryIntoRoute, processTelegramTaskCapture } = require("./_lib/telegram-task-memory");
const { routePlannerAgentInput } = require("./_lib/planner-agent-router");
const { executePlannerAction } = require("./_lib/planner-action-executor");
const { calendarConnectKeyboard, completedTaskKeyboard, plannerTaskKeyboard, telegramRequest } = require("./_lib/telegram");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;
const ALLOWED_CHAT_ID = process.env.TELEGRAM_ALLOWED_CHAT_ID || "";

function getTargetUserId() {
  if (!DEFAULT_USER_ID) {
    throw new Error("PLANNER_DEFAULT_USER_ID is not configured");
  }
  return DEFAULT_USER_ID;
}

function isAllowedChat(chatId) {
  if (!ALLOWED_CHAT_ID) return true;
  return String(chatId) === String(ALLOWED_CHAT_ID);
}

function parseCommand(text = "") {
  const trimmed = text.trim();
  const [command, ...rest] = trimmed.split(/\s+/);
  const normalizedCommand = (command || "").split("@")[0].toLowerCase();
  return {
    command: normalizedCommand,
    argText: rest.join(" ").trim(),
  };
}

function normalizeTaskText(text = "") {
  return String(text).trim().toLowerCase().replace(/\s+/g, " ");
}

function parseNaturalReopen(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return { isReopen: false, taskRef: "" };

  const lowered = raw.toLowerCase();
  const looksLikeReopen = /(верни|вернуть|восстанов|переоткрой|reopen|undo|uncomplete)/i.test(lowered);
  const mentionsTask = /(задач|дело|таск|task)/i.test(lowered);

  if (!looksLikeReopen && !mentionsTask) {
    return { isReopen: false, taskRef: "" };
  }

  if (!looksLikeReopen) {
    return { isReopen: false, taskRef: "" };
  }

  const quoted =
    raw.match(/["“«](.+?)["”»]/)?.[1] ||
    raw.match(/'(.+?)'/)?.[1] ||
    "";
  if (quoted.trim()) {
    return { isReopen: true, taskRef: quoted.trim() };
  }

  const afterVerb =
    raw.match(/(?:верни|вернуть|восстанови|восстановить|переоткрой|reopen)\s+(.+)$/i)?.[1] ||
    "";

  const cleaned = String(afterVerb || "")
    .replace(/^(мне|пожалуйста|плиз|эту|эту задачу|задачу|таск)\s+/i, "")
    .replace(/\s+(назад|обратно|в активные|пожалуйста)$/i, "")
    .trim();

  const genericOnly = /^(задачу|таск|е[её]|последнюю|любую)$/i.test(cleaned);
  if (!cleaned || genericOnly) {
    return { isReopen: true, taskRef: "" };
  }

  return { isReopen: true, taskRef: cleaned };
}

function findTaskByText(tasks = [], query, allowedStatuses = ["active"]) {
  const normalizedQuery = normalizeTaskText(query);
  if (!normalizedQuery) return null;

  return (
    tasks.find(
      (task) =>
        allowedStatuses.includes(task.status) &&
        normalizeTaskText(task.text) === normalizedQuery,
    ) ||
    tasks.find(
      (task) =>
        allowedStatuses.includes(task.status) &&
        normalizeTaskText(task.text).includes(normalizedQuery),
    ) ||
    null
  );
}

function findSubtaskByText(subtasks = [], query) {
  const normalizedQuery = normalizeTaskText(query);
  if (!normalizedQuery) return null;

  return (
    subtasks.find((subtask) => normalizeTaskText(subtask.text) === normalizedQuery) ||
    subtasks.find((subtask) => normalizeTaskText(subtask.text).includes(normalizedQuery)) ||
    null
  );
}

function getUrgencyRank(urgency) {
  if (urgency === "high") return 3;
  if (urgency === "medium") return 2;
  return 1;
}

function pickMergedUrgency(existingUrgency, incomingUrgency) {
  return getUrgencyRank(incomingUrgency) > getUrgencyRank(existingUrgency)
    ? incomingUrgency
    : existingUrgency;
}

function mergeDeadline(existingDeadline, incomingDeadline) {
  if (!existingDeadline) return incomingDeadline || "";
  if (!incomingDeadline) return existingDeadline;
  return incomingDeadline < existingDeadline ? incomingDeadline : existingDeadline;
}

function getResistanceRank(resistance) {
  if (resistance === "high") return 3;
  if (resistance === "medium") return 2;
  return 1;
}

function pickMergedResistance(existingResistance, incomingResistance) {
  return getResistanceRank(incomingResistance) > getResistanceRank(existingResistance)
    ? incomingResistance
    : existingResistance;
}

function normalizeCommitmentIds(value = []) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  )].slice(0, 10);
}

function mergeCommitmentIds(existingIds = [], incomingIds = []) {
  return normalizeCommitmentIds([...(existingIds || []), ...(incomingIds || [])]);
}

function buildSubtask(text, seed) {
  return {
    id: `${seed}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    completed: false,
  };
}

function mergeIncomingIntoTask(task, incoming) {
  const existingSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const existingSubtaskTexts = new Set(
    existingSubtasks.map((subtask) => normalizeTaskText(subtask.text)),
  );

  const incomingSubtasks = Array.isArray(incoming.subtasks) ? incoming.subtasks : [];
  const appendedSubtasks = incomingSubtasks
    .map((text) => String(text).trim())
    .filter(Boolean)
    .filter((text) => {
      const normalized = normalizeTaskText(text);
      if (existingSubtaskTexts.has(normalized)) return false;
      existingSubtaskTexts.add(normalized);
      return true;
    })
    .map((text, index) => buildSubtask(text, `${task.id}-sub-${Date.now()}-${index + 1}`));

  return {
    ...task,
    urgency: pickMergedUrgency(task.urgency || "medium", incoming.urgency || task.urgency || "medium"),
    resistance: pickMergedResistance(task.resistance || "medium", incoming.resistance || task.resistance || "medium"),
    isToday: task.isToday || Boolean(incoming.isToday),
    isVital: task.isVital || Boolean(incoming.isVital),
    deadlineAt: mergeDeadline(task.deadlineAt || "", incoming.deadlineAt || ""),
    lifeArea: incoming.lifeArea || task.lifeArea || "",
    commitmentIds: mergeCommitmentIds(task.commitmentIds || [], incoming.commitmentIds || []),
    subtasks: [...existingSubtasks, ...appendedSubtasks],
    lastUpdated: Date.now(),
  };
}

async function upsertTask(chatId, incoming) {
  const userId = getTargetUserId();
  const normalizedIncomingText = normalizeTaskText(incoming.text);
  let outcome = null;

  await mutatePlanner(userId, (current) => {
    const existingIndex = current.tasks.findIndex(
      (task) => task.status === "active" && normalizeTaskText(task.text) === normalizedIncomingText,
    );

    if (existingIndex !== -1) {
      const existingTask = current.tasks[existingIndex];
      const updatedTask = mergeIncomingIntoTask(existingTask, incoming);
      const tasks = [...current.tasks];
      tasks[existingIndex] = updatedTask;
      outcome = { type: "updated", task: updatedTask };
      return {
        ...current,
        tasks,
        telegramContext: buildTelegramContext(updatedTask, "upsert"),
      };
    }

    const created = createTask(incoming.text, {
      source: incoming.source || "telegram",
      deadlineAt: incoming.deadlineAt || "",
      urgency: incoming.urgency || "medium",
      resistance: incoming.resistance || "medium",
      isToday: incoming.isToday,
      isVital: incoming.isVital,
      lifeArea: incoming.lifeArea || "",
      commitmentIds: incoming.commitmentIds || [],
    });

    if (Array.isArray(incoming.subtasks) && incoming.subtasks.length > 0) {
      created.subtasks = incoming.subtasks.map((text, index) => ({
        id: `${created.id}-sub-${index + 1}`,
        text,
        completed: false,
      }));
    }

    outcome = { type: "created", task: created };
    return {
      ...current,
      tasks: [created, ...current.tasks],
      telegramContext: buildTelegramContext(created, "upsert"),
    };
  }, {
    source: "telegram",
    reason: "upsert_task",
  });

  const task = outcome?.task;
  const meta = [];
  if (task?.deadlineAt) meta.push(`📅 до ${escapeHtml(task.deadlineAt)}`);
  if (task?.isToday) meta.push("📌 сегодня");
  if (task?.isVital) meta.push("🚨 критично");
  if (task?.urgency === "high") meta.push("⏰ срочно");
  if (task?.subtasks?.length) meta.push(`🪜 шагов: ${task.subtasks.length}`);

  if (outcome?.type === "updated") {
    await sendText(
      chatId,
      [
        `🧩 Такая активная задача уже была. Я обновила её: <b>${escapeHtml(task.text)}</b>`,
        meta.length ? meta.join(" · ") : "",
      ].filter(Boolean).join("\n"),
      {
        reply_markup: plannerTaskKeyboard(task.id),
      },
    );
    return;
  }

  await sendText(
    chatId,
    [
      `➕ Добавила задачу: <b>${escapeHtml(task.text)}</b>`,
      meta.length ? meta.join(" · ") : "",
    ].filter(Boolean).join("\n"),
    {
      reply_markup: plannerTaskKeyboard(task.id),
    },
  );
}

function resolveContextTask(plannerData, { statuses = ["active"], fallbackLatest = true } = {}) {
  const tasks = Array.isArray(plannerData?.tasks) ? plannerData.tasks : [];
  const lastTaskId = plannerData?.telegramContext?.lastTaskId;

  if (lastTaskId) {
    const byId = tasks.find((task) => task.id === lastTaskId && statuses.includes(task.status));
    if (byId) return byId;
  }

  if (!fallbackLatest) return null;

  return [...tasks]
    .filter((task) => statuses.includes(task.status))
    .sort((left, right) => (right.lastUpdated || 0) - (left.lastUpdated || 0))[0] || null;
}

async function sendText(chatId, text, extra = {}) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

async function answerCallback(callbackQueryId, text) {
  return telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

async function safeWriteTelegramLog(payload) {
  try {
    await writeTelegramLog(getTargetUserId(), payload);
  } catch (error) {
    console.error("[telegram-log]", error);
  }
}

function buildPlannerActionAdapter(chatId, options = {}) {
  const suppressMessages = options.suppressMessages === true;
  return {
    sendText: async (messageText, extra = {}) => {
      if (suppressMessages) return null;
      return sendText(chatId, messageText, extra);
    },
    taskKeyboard: plannerTaskKeyboard,
    completedTaskKeyboard,
    calendarConnectKeyboard,
  };
}

function plannerDataWithContextTask(plannerData, task, action = "callback_context") {
  return {
    ...plannerData,
    telegramContext: buildTelegramContext(task, action),
  };
}

async function runPlannerRoute(chatId, route, options = {}) {
  const userId = getTargetUserId();
  const plannerData = options.plannerData || await getPlannerData(userId);
  await executePlannerAction({
    userId,
    chatId,
    plannerData,
    route,
    adapter: buildPlannerActionAdapter(chatId, { suppressMessages: options.suppressMessages }),
    log: safeWriteTelegramLog,
  });
}

async function sendTodayDigest(chatId, plannerData) {
  const activeTasks = plannerData.tasks.filter((task) => task.status === "active");
  const topTasks = sortTasksByPriority(activeTasks).slice(0, 3);

  if (topTasks.length === 0) {
    await sendText(chatId, "Сегодня активных задач нет. Можно выдохнуть или добавить новую.");
    return null;
  }

  const [topTask, ...restTasks] = topTasks;
  const header = [
    "☀️ <b>Что у тебя сегодня горит</b>",
    "",
    ...topTasks.map((task, index) => `${index + 1}. ${buildTelegramTaskLine(task).slice(2)}`),
  ].join("\n");

  await sendText(chatId, header);

  await sendText(
    chatId,
    [
      `🎯 <b>Главная сейчас:</b> ${escapeHtml(topTask.text)}`,
      restTasks.length ? `Ещё в фоне: ${restTasks.map((task) => escapeHtml(task.text)).join(" · ")}` : "Если хочется только одного действия, жми Panic.",
    ].join("\n"),
    {
      reply_markup: plannerTaskKeyboard(topTask.id),
    },
  );

  return topTask;
}

function buildPanicText(task) {
  const firstOpenSubtask = getFirstOpenSubtask(task);
  const lines = [
    "🆘 <b>Panic mode</b>",
    "",
    `Берём: <b>${escapeHtml(task.text)}</b>`,
  ];

  if (firstOpenSubtask) {
    lines.push(`Первый шаг: ${escapeHtml(firstOpenSubtask.text)}`);
    lines.push("Сделай только это и остановись, если захочешь.");
  } else {
    lines.push("Подзадач пока нет. Открой всё, что связано с задачей, и сделай один кривой шаг на 2 минуты.");
  }

  return lines.join("\n");
}

async function handleStart(chatId, options = {}) {
  const shouldLinkChat = options.linkChat !== false;
  const userId = getTargetUserId();
  if (shouldLinkChat) {
    await linkTelegramChat(userId, chatId);
  }
  await sendText(
    chatId,
      [
        "Я привязал этот Telegram к planner.",
        "",
        "Команды:",
        "/today — показать 1-3 главные задачи",
        "/completed — показать завершённые и вернуть ошибочно закрытую",
        "/reopen — вернуть последнюю завершённую задачу",
        "/reopen [название] — вернуть задачу по названию",
        "/panic — выбрать одну задачу и один микрошаг",
        "/add текст — добавить задачу",
        "",
        "Любое обычное сообщение я пока тоже складываю как новую задачу.",
      ].join("\n"),
  );
}

async function handleToday(chatId) {
  await runPlannerRoute(chatId, {
    type: "show_today",
    source: "slash_command",
  });
}

async function handleCompleted(chatId) {
  await runPlannerRoute(chatId, {
    type: "show_completed",
    source: "slash_command",
  });
}

async function handlePanic(chatId) {
  await runPlannerRoute(chatId, {
    type: "panic",
    source: "slash_command",
  });
}

async function handleAdd(chatId, argText, options = {}) {
  if (!argText) {
    await sendText(chatId, "Напиши так: /add купить корм");
    return;
  }

  const userId = getTargetUserId();
  const processing = await processTelegramTaskCapture({
    userId,
    chatId,
    rawText: argText,
    intent: "add_task",
    taskText: argText,
    telegramMessageId: options.telegramMessageId || null,
    telegramUpdateId: options.telegramUpdateId || null,
    writeLog: safeWriteTelegramLog,
  });
  const baseRoute = {
    type: "add_task",
    taskText: argText,
    rawText: argText,
    source: "slash_command",
    urgency: "medium",
    resistance: "",
    isToday: false,
    isVital: false,
    deadlineAt: "",
    subtasks: [],
  };
  const enrichedRoute = mergeTelegramTaskMemoryIntoRoute(baseRoute, processing);
  await runPlannerRoute(chatId, enrichedRoute);
}

async function handleCalendar(chatId) {
  const userId = getTargetUserId();
  const url = buildGoogleCalendarConnectUrl(userId);
  await sendText(
    chatId,
    "Открой кнопку ниже, дай доступ к Google Calendar, и после этого я смогу ставить туда задачи прямо из Telegram.",
    {
      reply_markup: calendarConnectKeyboard(url),
    },
  );
}

async function resolveUnifiedInboundRoute(chatId, text, options = {}) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return { route: null, plannerData: null, prefaceText: "", errorText: "" };

  if (cleaned.startsWith("/")) {
    const { command, argText } = parseCommand(cleaned);

    if (command === "/today") {
      return {
        route: {
          type: "show_today",
          source: "slash_command",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    if (command === "/completed") {
      return {
        route: {
          type: "show_completed",
          source: "slash_command",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    if (command === "/reopen") {
      return {
        route: {
          type: "reopen_task",
          taskRef: argText || "",
          source: "slash_command",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    if (command === "/panic") {
      return {
        route: {
          type: "panic",
          source: "slash_command",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    if (command === "/add") {
      if (!argText) {
        return {
          route: null,
          plannerData: null,
          prefaceText: "",
          errorText: "Напиши так: /add купить корм",
        };
      }

      const userId = getTargetUserId();
      const processing = await processTelegramTaskCapture({
        userId,
        chatId,
        rawText: argText,
        intent: "add_task",
        taskText: argText,
        telegramMessageId: options.telegramMessageId || null,
        telegramUpdateId: options.telegramUpdateId || null,
        writeLog: safeWriteTelegramLog,
      });

      const baseRoute = {
        type: "add_task",
        taskText: argText,
        rawText: argText,
        source: "slash_command",
        urgency: "medium",
        resistance: "",
        isToday: false,
        isVital: false,
        deadlineAt: "",
        subtasks: [],
      };

      return {
        route: mergeTelegramTaskMemoryIntoRoute(baseRoute, processing),
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    return {
      route: {
        type: "unknown_command",
        rawText: cleaned,
        source: "slash_command",
      },
      plannerData: null,
      prefaceText: "",
      errorText: "",
    };
  }

  const naturalReopen = parseNaturalReopen(cleaned);
  if (naturalReopen.isReopen) {
    if (naturalReopen.taskRef) {
      return {
        route: {
          type: "reopen_task",
          taskRef: naturalReopen.taskRef,
          source: "natural_text",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    return {
      route: {
        type: "show_completed",
        source: "natural_text",
        rawText: cleaned,
      },
      plannerData: null,
      prefaceText: "Поняла. Хочешь вернуть задачу из завершённых. Вот последние, выбери нужную:",
      errorText: "",
    };
  }

  const userId = getTargetUserId();
  const plannerData = await getPlannerData(userId);
  const route = await routePlannerAgentInput({
    text: cleaned,
    plannerData,
  });

  const captureProcessing =
    ["add_task", "chat"].includes(route.type)
      ? await processTelegramTaskCapture({
          userId,
          chatId,
          rawText: cleaned,
          intent: route.type,
          taskText: route.taskText || "",
          taskRef: route.taskRef || "",
          urgency: route.urgency || "",
          isToday: Boolean(route.isToday),
          isVital: Boolean(route.isVital),
          deadlineAt: route.deadlineAt || "",
          subtasks: Array.isArray(route.subtasks) ? route.subtasks : [],
          telegramMessageId: options.telegramMessageId || null,
          telegramUpdateId: options.telegramUpdateId || null,
          writeLog: safeWriteTelegramLog,
        })
      : null;

  return {
    route: mergeTelegramTaskMemoryIntoRoute(route, captureProcessing),
    plannerData,
    prefaceText: "",
    errorText: "",
  };
}

// Kept for reference — plain-text reopen now goes through handleReopenTask via LLM intent
async function _unusedHandleReopenLatestCompleted(chatId, plannerData) {
  const latestCompleted = resolveContextTask(plannerData, { statuses: ["completed"] });
  if (!latestCompleted) {
    await sendText(chatId, "В раю сейчас нечего возвращать. Завершённых задач нет.");
    return;
  }
  await handleReopenTask(chatId, plannerData, latestCompleted.text);
}

async function handleDeleteSubtaskRequest(chatId, plannerData, request) {
  const task = findTaskByText(plannerData.tasks, request.taskText, ["active", "completed", "dead"]);
  if (!task) {
    await sendText(chatId, `Не нашла задачу: <b>${escapeHtml(request.taskText)}</b>`);
    return;
  }

  const subtask = findSubtaskByText(task.subtasks || [], request.subtaskText);
  if (!subtask) {
    await sendText(
      chatId,
      `В задаче <b>${escapeHtml(task.text)}</b> не нашла подзадачу: <b>${escapeHtml(request.subtaskText)}</b>`,
    );
    return;
  }

  await mutatePlanner(
    getTargetUserId(),
    (current) => {
      const tasks = current.tasks.map((currentTask) => {
        if (currentTask.id !== task.id) return currentTask;
        return {
          ...currentTask,
          subtasks: (currentTask.subtasks || []).filter((item) => item.id !== subtask.id),
          lastUpdated: Date.now(),
        };
      });

      return {
        ...current,
        tasks,
        telegramContext: buildTelegramContext(task, "delete_subtask"),
      };
    },
    {
      source: "telegram",
      reason: "delete_subtask",
    },
  );

  await sendText(
    chatId,
    `🗑️ Удалила подзадачу <b>${escapeHtml(subtask.text)}</b> из <b>${escapeHtml(task.text)}</b>.`,
  );

  await safeWriteTelegramLog({
    kind: "action",
    action: "delete_subtask",
    chatId: String(chatId),
    taskId: task.id,
    taskText: task.text,
    subtaskId: subtask.id,
    subtaskText: subtask.text,
  });
}

async function handleCompleteTaskRequest(chatId, plannerData, taskQuery = "") {
  const task =
    (taskQuery && findTaskByText(plannerData.tasks, taskQuery, ["active"])) ||
    resolveContextTask(plannerData, { statuses: ["active"] });

  if (!task) {
    await sendText(chatId, "Не нашла активную задачу, которую нужно отправить в рай.");
    return;
  }

  let completedTask = null;
  await mutatePlanner(
    getTargetUserId(),
    (current) => {
      const tasks = current.tasks.map((currentTask) => {
        if (currentTask.id !== task.id) return currentTask;
        completedTask = {
          ...currentTask,
          status: "completed",
          isToday: false,
          lastUpdated: Date.now(),
        };
        return completedTask;
      });

      return {
        ...current,
        tasks,
        telegramContext: buildTelegramContext(completedTask || task, "complete"),
      };
    },
    {
      source: "telegram",
      reason: "complete_from_text",
    },
  );

  if (!completedTask) {
    await sendText(chatId, "Не смогла отправить задачу в рай.");
    return;
  }

  await sendText(
    chatId,
    `☁️ <b>${escapeHtml(completedTask.text)}</b> теперь в раю. Если это была ошибка, верни её кнопкой ниже.`,
    { reply_markup: completedTaskKeyboard(completedTask.id) },
  );

  await safeWriteTelegramLog({
    kind: "action",
    action: "complete_from_text",
    chatId: String(chatId),
    taskId: completedTask.id,
    taskText: completedTask.text,
  });
}

async function handleSuggestUnpin(chatId, plannerData) {
  const userId = getTargetUserId();
  const todayTasks = plannerData.tasks.filter((t) => t.status === "active" && t.isToday);

  if (todayTasks.length === 0) {
    await sendText(chatId, "Сейчас нет задач, закреплённых на сегодня.");
    return;
  }

  const suggestedTaskTexts = todayTasks.map((t) => t.text);

  await sendText(
    chatId,
    [
      "📌 <b>Задачи на сегодня:</b>",
      "",
      ...todayTasks.map((t, i) => `${i + 1}. ${escapeHtml(t.text)}`),
      "",
      "Напиши номер или название — и я открепю.",
    ].join("\n"),
  );

  await mutatePlanner(userId, (current) => ({
    ...current,
    telegramContext: buildTelegramContext(todayTasks[0], "suggest_unpin", { suggestedTaskTexts }),
  }), { source: "telegram", reason: "suggest_unpin" });
}

async function handleSetToday(chatId, plannerData, taskRef) {
  const task =
    (taskRef && findTaskByText(plannerData.tasks, taskRef, ["active"])) ||
    resolveContextTask(plannerData, { statuses: ["active"] });

  if (!task) {
    await sendText(chatId, taskRef
      ? `Не нашла задачу: <b>${escapeHtml(taskRef)}</b>`
      : "Не нашла активную задачу, чтобы закрепить на сегодня.");
    return;
  }

  let updated = null;
  await mutatePlanner(getTargetUserId(), (current) => {
    const tasks = current.tasks.map((t) => {
      if (t.id !== task.id) return t;
      updated = { ...t, isToday: true, lastUpdated: Date.now() };
      return updated;
    });
    return { ...current, tasks, telegramContext: buildTelegramContext(updated || task, "set_today") };
  }, { source: "telegram", reason: "set_today" });

  await sendText(chatId, `📌 Закрепила на сегодня: <b>${escapeHtml(task.text)}</b>`, {
    reply_markup: plannerTaskKeyboard(task.id),
  });
}

async function handleUnsetToday(chatId, plannerData, taskRef) {
  const task =
    (taskRef && findTaskByText(plannerData.tasks, taskRef, ["active"])) ||
    resolveContextTask(plannerData, { statuses: ["active"] });

  if (!task) {
    await sendText(chatId, taskRef
      ? `Не нашла задачу: <b>${escapeHtml(taskRef)}</b>`
      : "Не нашла задачу, чтобы открепить от сегодня.");
    return;
  }

  if (!task.isToday) {
    await sendText(chatId, `<b>${escapeHtml(task.text)}</b> и так не закреплена на сегодня.`);
    return;
  }

  let updated = null;
  await mutatePlanner(getTargetUserId(), (current) => {
    const tasks = current.tasks.map((t) => {
      if (t.id !== task.id) return t;
      updated = { ...t, isToday: false, lastUpdated: Date.now() };
      return updated;
    });
    return { ...current, tasks, telegramContext: buildTelegramContext(updated || task, "unset_today") };
  }, { source: "telegram", reason: "unset_today" });

  await sendText(chatId, `🔓 Откреплена от сегодня: <b>${escapeHtml(task.text)}</b>`, {
    reply_markup: plannerTaskKeyboard(task.id),
  });
}

async function handleSetVital(chatId, plannerData, taskRef) {
  const task =
    (taskRef && findTaskByText(plannerData.tasks, taskRef, ["active"])) ||
    resolveContextTask(plannerData, { statuses: ["active"] });

  if (!task) {
    await sendText(chatId, taskRef
      ? `Не нашла задачу: <b>${escapeHtml(taskRef)}</b>`
      : "Не нашла активную задачу, чтобы пометить критичной.");
    return;
  }

  let updated = null;
  await mutatePlanner(getTargetUserId(), (current) => {
    const tasks = current.tasks.map((t) => {
      if (t.id !== task.id) return t;
      updated = { ...t, isVital: true, urgency: "high", lastUpdated: Date.now() };
      return updated;
    });
    return { ...current, tasks, telegramContext: buildTelegramContext(updated || task, "set_vital") };
  }, { source: "telegram", reason: "set_vital" });

  await sendText(chatId, `🚨 Пометила как критичную: <b>${escapeHtml(task.text)}</b>`, {
    reply_markup: plannerTaskKeyboard(task.id),
  });
}

async function handleAddSubtask(chatId, plannerData, taskRef, subtaskText) {
  if (!subtaskText) {
    await sendText(chatId, "Напиши текст подзадачи. Например: добавь шаг «открыть сайт» к задаче «подать заявку».");
    return;
  }

  const task =
    (taskRef && findTaskByText(plannerData.tasks, taskRef, ["active"])) ||
    resolveContextTask(plannerData, { statuses: ["active"] });

  if (!task) {
    await sendText(chatId, taskRef
      ? `Не нашла задачу: <b>${escapeHtml(taskRef)}</b>`
      : "Не нашла активную задачу для добавления подзадачи.");
    return;
  }

  const newSubtask = {
    id: `${task.id}-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text: subtaskText,
    completed: false,
  };

  let updated = null;
  await mutatePlanner(getTargetUserId(), (current) => {
    const tasks = current.tasks.map((t) => {
      if (t.id !== task.id) return t;
      updated = { ...t, subtasks: [...(t.subtasks || []), newSubtask], lastUpdated: Date.now() };
      return updated;
    });
    return { ...current, tasks, telegramContext: buildTelegramContext(updated || task, "add_subtask") };
  }, { source: "telegram", reason: "add_subtask" });

  await sendText(chatId, `🪜 Добавила шаг «<b>${escapeHtml(subtaskText)}</b>» к задаче <b>${escapeHtml(task.text)}</b>.`, {
    reply_markup: plannerTaskKeyboard(task.id),
  });
}

async function handleReopenTask(chatId, plannerData, taskRef) {
  const userId = getTargetUserId();
  // getPlannerData only fetches active tasks; completed/dead must be fetched separately
  const nonActiveTasks = await getNonActiveTasks(userId);
  const task =
    (taskRef && findTaskByText(nonActiveTasks, taskRef, ["completed", "dead"])) ||
    nonActiveTasks
      .filter((t) => t.status === "completed")
      .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))[0] || null;

  if (!task) {
    await sendText(chatId, taskRef
      ? `Не нашла завершённую или удалённую задачу: <b>${escapeHtml(taskRef)}</b>`
      : "В раю сейчас нечего возвращать.");
    return;
  }

  let reopenedTask = null;
  await mutatePlanner(userId, (current) => {
    // Task is not in current.tasks (completed), so add it as active
    reopenedTask = {
      ...task,
      __baseLastUpdated: typeof task?.lastUpdated === "number" ? task.lastUpdated : 0,
      status: "active",
      isToday: false,
      deadAt: null,
      heatBase: typeof task.heatBase === "number" ? task.heatBase : 35,
      heatCurrent: typeof task.heatCurrent === "number" ? task.heatCurrent : (typeof task.heatBase === "number" ? task.heatBase : 35),
      lastUpdated: Date.now(),
    };
    return { ...current, tasks: [reopenedTask, ...current.tasks], telegramContext: buildTelegramContext(reopenedTask, "reopen") };
  }, { source: "telegram", reason: "reopen_task" });

  if (!reopenedTask) {
    await sendText(chatId, "Не смогла вернуть задачу.");
    return;
  }

  await sendText(chatId, `↩️ Вернула в активные: <b>${escapeHtml(reopenedTask.text)}</b>`, {
    reply_markup: plannerTaskKeyboard(reopenedTask.id),
  });
}

async function handlePlainCapture(chatId, text, options = {}) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return;
  const { route, plannerData, prefaceText, errorText } = await resolveUnifiedInboundRoute(chatId, cleaned, options);

  if (errorText) {
    await sendText(chatId, errorText);
    return;
  }

  if (!route) return;

  await safeWriteTelegramLog({
    kind: "intent",
    chatId: String(chatId),
    messageText: cleaned,
    intent: route,
  });

  if (prefaceText) {
    await sendText(chatId, prefaceText);
  }

  await runPlannerRoute(chatId, route, {
    plannerData: plannerData || undefined,
  });
}

async function resolveUnifiedCallbackRoute(callbackQuery) {
  const userId = getTargetUserId();
  const [action, taskId] = String(callbackQuery?.data || "").split(":");

  if (!taskId) {
    return {
      errorText: "Некорректное действие",
      callbackRoute: null,
      feedback: "",
      plannerData: null,
      suppressMessages: true,
    };
  }

  if (action === "reopen") {
    const source = await getTaskById(userId, taskId);
    if (!source) {
      return {
        errorText: "Задача не найдена.",
        callbackRoute: null,
        feedback: "",
        plannerData: null,
        suppressMessages: true,
      };
    }

    const plannerData = await getPlannerData(userId);
    return {
      errorText: "",
      callbackRoute: { type: "reopen_task", taskRef: "", source: "callback" },
      feedback: "Вернул задачу в активные.",
      plannerData: plannerDataWithContextTask({
        ...plannerData,
        tasks: [source, ...(plannerData.tasks || []).filter((task) => task.id !== source.id)],
      }, source, "callback_reopen"),
      suppressMessages: false,
    };
  }

  const plannerData = await getPlannerData(userId);
  const callbackTask = (plannerData.tasks || []).find((task) => task.id === taskId) || null;
  if (!callbackTask) {
    return {
      errorText: "Задача не найдена.",
      callbackRoute: null,
      feedback: "",
      plannerData: null,
      suppressMessages: true,
    };
  }

  let callbackRoute = null;
  let feedback = "Сделано.";
  let contextAction = "callback_context";
  let suppressMessages = true;

  if (action === "done") {
    callbackRoute = { type: "complete_task", taskRef: "", source: "callback" };
    feedback = "Задача отправлена в выполненные.";
    contextAction = "callback_done";
    suppressMessages = false;
  } else if (action === "panic") {
    callbackRoute = { type: "panic_task", taskRef: "", source: "callback" };
    feedback = "Показываю micro-шаг.";
    contextAction = "callback_panic";
    suppressMessages = false;
  } else if (action === "today") {
    if (callbackTask.isToday) {
      callbackRoute = { type: "unset_today", taskRef: "", source: "callback" };
      feedback = "Открепил от сегодня.";
      contextAction = "callback_today_unset";
    } else {
      callbackRoute = { type: "set_today", taskRef: "", source: "callback" };
      feedback = "Закрепил на сегодня.";
      contextAction = "callback_today_set";
    }
  } else if (action === "vital") {
    if (callbackTask.isVital) {
      callbackRoute = { type: "unset_vital", taskRef: "", source: "callback" };
      feedback = "Снял критичный приоритет.";
      contextAction = "callback_vital_unset";
    } else {
      callbackRoute = { type: "set_vital", taskRef: "", source: "callback" };
      feedback = "Пометил как критичную.";
      contextAction = "callback_vital_set";
    }
  } else {
    return {
      errorText: "Неизвестное действие.",
      callbackRoute: null,
      feedback: "",
      plannerData: null,
      suppressMessages: true,
    };
  }

  return {
    errorText: "",
    callbackRoute,
    feedback,
    plannerData: plannerDataWithContextTask(plannerData, callbackTask, contextAction),
    suppressMessages,
  };
}

async function handleCallback(chatId, callbackQuery) {
  const {
    errorText,
    callbackRoute,
    feedback,
    plannerData,
    suppressMessages,
  } = await resolveUnifiedCallbackRoute(callbackQuery);

  if (errorText) {
    await answerCallback(callbackQuery.id, errorText);
    return;
  }

  await safeWriteTelegramLog({
    kind: "intent",
    chatId: String(chatId),
    callbackData: String(callbackQuery.data || ""),
    intent: callbackRoute,
  });

  await runPlannerRoute(chatId, callbackRoute, {
    plannerData: plannerData || undefined,
    suppressMessages: Boolean(suppressMessages),
  });
  await answerCallback(callbackQuery.id, feedback);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const message = update.message;
    const callbackQuery = update.callback_query;
    const chatId = callbackQuery?.message?.chat?.id || message?.chat?.id;

    if (!chatId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const userId = getTargetUserId();
    try {
      await writeTelegramLog(userId, {
        kind: callbackQuery ? "callback_in" : "message_in",
        chatId: String(chatId),
        messageText: String(message?.text || ""),
        callbackData: String(callbackQuery?.data || ""),
      });
    } catch (logError) {
      console.error("[telegram-log:inbound]", logError);
    }

    if (!isAllowedChat(chatId)) {
      if (callbackQuery?.id) {
        await answerCallback(callbackQuery.id, "Этот чат не разрешён.");
      }
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (callbackQuery) {
      await handleCallback(chatId, callbackQuery);
      try {
        await writeTelegramLog(userId, {
          kind: "callback_out",
          chatId: String(chatId),
          callbackData: String(callbackQuery.data || ""),
          status: "ok",
        });
      } catch (logError) {
        console.error("[telegram-log:callback-out]", logError);
      }
      return res.status(200).json({ ok: true });
    }

    const text = String(message?.text || "").trim();
    const { command } = parseCommand(text);

    if (command === "/start") {
      const canLinkChat = Boolean(message?.from?.id || message?.from?.username);
      await handleStart(chatId, { linkChat: canLinkChat });
    } else if (command === "/calendar") {
      await handleCalendar(chatId);
    } else if (text) {
      await handlePlainCapture(chatId, text, {
        telegramMessageId: message?.message_id || null,
        telegramUpdateId: update?.update_id || null,
      });
    }

    try {
      await writeTelegramLog(userId, {
        kind: "message_out",
        chatId: String(chatId),
        messageText: text,
        status: "ok",
      });
    } catch (logError) {
      console.error("[telegram-log:message-out]", logError);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[telegram-webhook]", error);
    try {
      await writeTelegramLog(getTargetUserId(), {
        kind: "error",
        errorMessage: error.message || "Unknown error",
        errorStack: error.stack || "",
      });
    } catch (logError) {
      console.error("[telegram-log:error]", logError);
    }
    return res.status(500).json({ error: error.message || "Internal error" });
  }
};
