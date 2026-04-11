const { buildTelegramContext, buildTelegramTaskLine, createTask, escapeHtml, getFirstOpenSubtask, getPlannerData, linkTelegramChat, mutatePlanner, pickRescueTask, sortTasksByPriority, writeTelegramLog } = require("./_lib/planner-store");
const { buildGoogleCalendarConnectUrl, createCalendarEvent, hasGoogleCalendarConnection } = require("./_lib/google-calendar");
const { parseTelegramIntent } = require("./_lib/telegram-intent");
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

function extractQuotedSegments(text = "") {
  return Array.from(String(text).matchAll(/[«"]([^«»"]+)[»"]/g)).map((match) => match[1].trim()).filter(Boolean);
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

function looksLikeContextTaskQuery(query = "") {
  const lowered = normalizeTaskText(query)
    .replace(/[«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!lowered) return true;

  return (
    /последн.*добавлен.*задач/.test(lowered) ||
    /последн.*задач/.test(lowered) ||
    /текущ.*задач/.test(lowered) ||
    /это[йу]?\s+задач/.test(lowered) ||
    /эту\s+задачу/.test(lowered) ||
    /к ней/.test(lowered) ||
    /к н[её]й задаче/.test(lowered) ||
    /е[её]\s+в\s+активн/.test(lowered) ||
    /^(е[её]|эта|эту|этой|ней|ней задаче|последняя|последнюю|последней)$/.test(lowered)
  );
}

function looksLikeReopenRequest(text = "") {
  const lowered = String(text).toLowerCase();
  return /верни|вернуть|из рая|назад в актив/.test(lowered) && /(задач|е[её]|\bее\b|\bеё\b|\bэту\b)/.test(lowered);
}

function looksLikeCompleteRequest(text = "") {
  const lowered = String(text).toLowerCase();
  return /(в рай|выполненн|готов[ао]|заверши|сделай готов|отправь.*в рай)/.test(lowered);
}

function extractTaskNameForCompletion(text = "") {
  const quoted = extractQuotedSegments(text);
  if (quoted.length > 0) return quoted[0];

  const cleaned = String(text)
    .replace(/^(ну\s+)?(нет\s+)?/i, "")
    .replace(/^(отправь|переведи|сделай|заверши|завершить)\s+/i, "")
    .replace(/\s+(в рай|в выполненные|готовой|готовым|готово)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned && !/^(е[её]|эту|эту задачу)$/i.test(cleaned) ? cleaned : "";
}

function parseDeleteSubtaskRequest(text = "") {
  const lowered = String(text).toLowerCase();
  if (!/удали|удалить/.test(lowered) || !/подзадач|шаг/.test(lowered)) {
    return null;
  }

  const quoted = extractQuotedSegments(text);
  if (quoted.length >= 2) {
    return {
      taskText: quoted[0],
      subtaskText: quoted[1],
    };
  }

  const match = String(text).match(/в задачу\s+(.+?)\s+удали(?:ть)?\s+(?:подзадачу|шаг)\s+(.+)/i);
  if (!match) return null;

  return {
    taskText: match[1].trim(),
    subtaskText: match[2].trim(),
  };
}

function parseAddSubtaskRequest(text = "") {
  const lowered = String(text).toLowerCase();
  if (!/добавь|добавить|добваь|добаьв/.test(lowered) || !/подзадач|шаг/.test(lowered)) {
    return null;
  }

  const quoted = extractQuotedSegments(text);
  if (quoted.length >= 2) {
    return {
      taskText: quoted[0],
      subtaskText: quoted[1],
    };
  }

  const patterns = [
    {
      pattern: /(?:^|\b)(?:добавь|добавить|добваь|добаьв)\s+(?:к|в(?:\s+задачу)?)\s+(.+?)\s+(?:подзачу|подзадачу|шаг)\s+[«"]?(.+?)[»"]?$/i,
      extract: (match) => ({
        taskText: match[1].trim(),
        subtaskText: match[2].trim(),
      }),
    },
    {
      pattern: /(?:^|\b)(?:добавь|добавить|добваь|добаьв)\s+(?:подзачу|подзадачу|шаг)\s+[«"]?(.+?)[»"]?\s+(?:в|к|для)\s+(.+?)$/i,
      extract: (match) => ({
        taskText: match[2].trim(),
        subtaskText: match[1].trim(),
      }),
    },
  ];
  for (const candidate of patterns) {
    const match = String(text).match(candidate.pattern);
    if (match) return candidate.extract(match);
  }

  return null;
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
    isToday: task.isToday || Boolean(incoming.isToday),
    isVital: task.isVital || Boolean(incoming.isVital),
    deadlineAt: mergeDeadline(task.deadlineAt || "", incoming.deadlineAt || ""),
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
      isToday: incoming.isToday,
      isVital: incoming.isVital,
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

  if (!task || !outcome?.type) {
    await safeWriteTelegramLog({
      kind: "error",
      chatId: String(chatId),
      errorMessage: "upsertTask finished without outcome",
      incomingText: incoming.text,
    });
    await sendText(chatId, "Не смогла сохранить задачу. Попробуй ещё раз.");
    return;
  }

  await safeWriteTelegramLog({
    kind: "action",
    action: outcome.type === "updated" ? "upsert_task_updated" : "upsert_task_created",
    chatId: String(chatId),
    taskId: task.id,
    taskText: task.text,
    taskStatus: task.status,
    isToday: Boolean(task.isToday),
    isVital: Boolean(task.isVital),
    deadlineAt: task.deadlineAt || "",
    urgency: task.urgency || "medium",
    subtaskCount: Array.isArray(task.subtasks) ? task.subtasks.length : 0,
  });

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

async function handleStart(chatId) {
  const userId = getTargetUserId();
  await linkTelegramChat(userId, chatId);
  await sendText(
    chatId,
    [
      "Я привязал этот Telegram к planner.",
      "",
      "Команды:",
      "/today — показать 1-3 главные задачи",
      "/completed — показать завершённые и вернуть ошибочно закрытую",
      "/panic — выбрать одну задачу и один микрошаг",
      "/add текст — добавить задачу",
      "",
      "Любое обычное сообщение я пока тоже складываю как новую задачу.",
    ].join("\n"),
  );
}

async function handleToday(chatId) {
  const userId = getTargetUserId();
  const plannerData = await getPlannerData(userId);
  const topTask = await sendTodayDigest(chatId, plannerData);
  if (!topTask) return;
  await mutatePlanner(userId, (current) => ({
    ...current,
    telegramContext: buildTelegramContext(topTask, "today"),
  }), {
    source: "telegram",
    reason: "show_today",
  });
}

async function handleCompleted(chatId) {
  const userId = getTargetUserId();
  const plannerData = await getPlannerData(userId);
  const completedTasks = plannerData.tasks
    .filter((task) => task.status === "completed")
    .sort((left, right) => (right.lastUpdated || 0) - (left.lastUpdated || 0))
    .slice(0, 5);

  if (completedTasks.length === 0) {
    await sendText(chatId, "В раю пока пусто. Завершённых задач нет.");
    return;
  }

  await sendText(
    chatId,
    [
      "☁️ <b>Последние завершённые задачи</b>",
      "",
      ...completedTasks.map((task, index) => `${index + 1}. ${escapeHtml(task.text)}`),
      "",
      "Если бот отправил что-то в рай по ошибке, жми кнопку возврата.",
    ].join("\n"),
  );

  for (const task of completedTasks) {
    await sendText(
      chatId,
      `☁️ <b>${escapeHtml(task.text)}</b>`,
      { reply_markup: completedTaskKeyboard(task.id) },
    );
  }
}

async function handlePanic(chatId) {
  const userId = getTargetUserId();
  const plannerData = await getPlannerData(userId);
  const task = pickRescueTask(plannerData.tasks);

  if (!task) {
    await sendText(chatId, "Сейчас нет активной задачи для panic mode.");
    return;
  }

  await sendText(chatId, buildPanicText(task), {
    reply_markup: plannerTaskKeyboard(task.id),
  });

  await mutatePlanner(userId, (current) => ({
    ...current,
    telegramContext: buildTelegramContext(task, "panic"),
  }), {
    source: "telegram",
    reason: "show_panic",
  });
}

async function handleAdd(chatId, argText) {
  if (!argText) {
    await sendText(chatId, "Напиши так: /add купить корм");
    return;
  }

  await upsertTask(chatId, {
    text: argText,
    source: "telegram",
  });
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

async function handleReopenLatestCompleted(chatId, plannerData) {
  const latestCompleted = resolveContextTask(plannerData, { statuses: ["completed"] });

  if (!latestCompleted) {
    await sendText(chatId, "В раю сейчас нечего возвращать. Завершённых задач нет.");
    return;
  }

  let reopenedTask = null;
  await mutatePlanner(
    getTargetUserId(),
    (current) => {
      const tasks = current.tasks.map((task) => {
        if (task.id !== latestCompleted.id) return task;
        reopenedTask = {
          ...task,
          status: "active",
          isToday: false,
          heatBase: typeof task.heatBase === "number" ? task.heatBase : 35,
          heatCurrent:
            typeof task.heatCurrent === "number"
              ? task.heatCurrent
              : typeof task.heatBase === "number"
                ? task.heatBase
                : 35,
          lastUpdated: Date.now(),
          deadAt: null,
        };
      return reopenedTask;
      });

      return {
        ...current,
        tasks,
        telegramContext: buildTelegramContext(reopenedTask || latestCompleted, "reopen"),
      };
    },
    {
      source: "telegram",
      reason: "reopen_latest_completed",
    },
  );

  if (!reopenedTask) {
    await sendText(chatId, "Не смогла найти последнюю завершённую задачу для возврата.");
    return;
  }

  await sendText(
    chatId,
    `↩️ Вернула в активные: <b>${escapeHtml(reopenedTask.text)}</b>`,
    { reply_markup: plannerTaskKeyboard(reopenedTask.id) },
  );

  await safeWriteTelegramLog({
    kind: "action",
    action: "reopen_latest_completed",
    chatId: String(chatId),
    taskId: reopenedTask.id,
    taskText: reopenedTask.text,
  });
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

async function handleAddSubtaskRequest(chatId, plannerData, request) {
  const task =
    (looksLikeContextTaskQuery(request.taskText)
      ? resolveContextTask(plannerData, { statuses: ["active"] })
      : null) ||
    findTaskByText(plannerData.tasks, request.taskText, ["active"]);
  if (!task) {
    await sendText(chatId, `Не нашла активную задачу: <b>${escapeHtml(request.taskText)}</b>`);
    return;
  }

  const subtaskText = String(request.subtaskText || "").trim();
  if (!subtaskText) {
    await sendText(chatId, "Подзадача пустая. Напиши текст шага после слова «подзадачу».");
    return;
  }

  const duplicate = findSubtaskByText(task.subtasks || [], subtaskText);
  if (duplicate) {
    await sendText(
      chatId,
      `В задаче <b>${escapeHtml(task.text)}</b> уже есть похожая подзадача: <b>${escapeHtml(duplicate.text)}</b>.`,
      { reply_markup: plannerTaskKeyboard(task.id) },
    );
    return;
  }

  let updatedTask = null;
  let createdSubtask = null;
  await mutatePlanner(
    getTargetUserId(),
    (current) => {
      const tasks = current.tasks.map((currentTask) => {
        if (currentTask.id !== task.id) return currentTask;
        createdSubtask = buildSubtask(subtaskText, `${currentTask.id}-sub-${Date.now()}`);
        updatedTask = {
          ...currentTask,
          subtasks: [...(currentTask.subtasks || []), createdSubtask],
          lastUpdated: Date.now(),
        };
        return updatedTask;
      });

      return {
        ...current,
        tasks,
        telegramContext: buildTelegramContext(updatedTask || task, "add_subtask"),
      };
    },
    {
      source: "telegram",
      reason: "add_subtask_from_text",
    },
  );

  if (!updatedTask || !createdSubtask) {
    await sendText(chatId, "Не смогла добавить подзадачу. Попробуй ещё раз.");
    return;
  }

  await sendText(
    chatId,
    `🪜 Добавила подзадачу <b>${escapeHtml(createdSubtask.text)}</b> в <b>${escapeHtml(updatedTask.text)}</b>.`,
    { reply_markup: plannerTaskKeyboard(updatedTask.id) },
  );

  await safeWriteTelegramLog({
    kind: "action",
    action: "add_subtask_from_text",
    chatId: String(chatId),
    taskId: updatedTask.id,
    taskText: updatedTask.text,
    subtaskId: createdSubtask.id,
    subtaskText: createdSubtask.text,
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

async function handlePlainCapture(chatId, text) {
  const cleaned = text.trim();
  if (!cleaned) return;
  if (cleaned.startsWith("/")) {
    await sendText(
      chatId,
      [
        "Я не поняла эту команду.",
        "",
        "Рабочие команды сейчас:",
        "/start",
        "/today",
        "/completed",
        "/panic",
        "/add текст",
      ].join("\n"),
    );
    return;
  }

  const userId = getTargetUserId();
  const plannerData = await getPlannerData(userId);
  const deleteSubtaskRequest = parseDeleteSubtaskRequest(cleaned);
  const addSubtaskRequest = parseAddSubtaskRequest(cleaned);

  if (deleteSubtaskRequest) {
    await handleDeleteSubtaskRequest(chatId, plannerData, deleteSubtaskRequest);
    return;
  }

  if (addSubtaskRequest) {
    await handleAddSubtaskRequest(chatId, plannerData, addSubtaskRequest);
    return;
  }

  if (looksLikeReopenRequest(cleaned)) {
    await handleReopenLatestCompleted(chatId, plannerData);
    return;
  }

  if (looksLikeCompleteRequest(cleaned)) {
    await handleCompleteTaskRequest(chatId, plannerData, extractTaskNameForCompletion(cleaned));
    return;
  }

  const intent = await parseTelegramIntent({
    text: cleaned,
    tasks: plannerData.tasks,
  });

  await safeWriteTelegramLog({
    kind: "intent",
    chatId: String(chatId),
    messageText: cleaned,
    intent,
  });

  if (intent.intent === "show_today") {
    await handleToday(chatId);
    return;
  }

  if (intent.intent === "panic") {
    await handlePanic(chatId);
    return;
  }

  if (intent.intent === "schedule_task") {
    const hasConnection = await hasGoogleCalendarConnection(userId);
    if (!hasConnection) {
      const url = buildGoogleCalendarConnectUrl(userId);
      await sendText(
        chatId,
        "Сначала подключи Google Calendar. Потом я смогу создавать там события прямо из Telegram.",
        {
          reply_markup: calendarConnectKeyboard(url),
        },
      );
      return;
    }

    if (!intent.deadline_at || !intent.start_time) {
      await sendText(
        chatId,
        "Для календаря мне нужны дата и время. Например: запланируй на завтра в 14:00 задачу про диплом.",
      );
      return;
    }

    const createdEvent = await createCalendarEvent(userId, {
      title: intent.task_text || cleaned,
      date: intent.deadline_at,
      startTime: intent.start_time,
      durationMinutes: intent.duration_minutes || 60,
      description: "Создано из ADHD Planner Telegram bot",
    });

    await sendText(
      chatId,
      `📅 Поставила в календарь: <b>${escapeHtml(createdEvent.summary || intent.task_text || cleaned)}</b>\n${escapeHtml(intent.deadline_at)} ${escapeHtml(intent.start_time)}`,
    );
    return;
  }

  if (intent.intent === "chat") {
    await sendText(
      chatId,
      intent.reply_text || "Сформулируй это как задачу, или просто напиши /today или /panic.",
    );
    return;
  }

  const taskText = intent.task_text || cleaned;
  await upsertTask(chatId, {
    text: taskText,
    source: "telegram",
    deadlineAt: intent.deadline_at || "",
    urgency: intent.urgency || "medium",
    isToday: intent.is_today,
    isVital: intent.is_vital,
    subtasks: intent.subtasks || [],
  });
}

async function handleCallback(chatId, callbackQuery) {
  const userId = getTargetUserId();
  const [action, taskId] = String(callbackQuery.data || "").split(":");
  if (!taskId) {
    await answerCallback(callbackQuery.id, "Некорректное действие");
    return;
  }

  let feedback = "Сделано.";
  let panicTask = null;
  let reopenedTask = null;
  let completedTask = null;

  await mutatePlanner(userId, (current) => {
    const nextTasks = current.tasks.map((task) => {
      if (task.id !== taskId) return task;

      if (action === "done") {
        feedback = "Задача отправлена в выполненные.";
        completedTask = { ...task, status: "completed", isToday: false, lastUpdated: Date.now() };
        return completedTask;
      }

      if (action === "reopen") {
        feedback = "Вернул задачу в активные.";
        reopenedTask = {
          ...task,
          status: "active",
          isToday: false,
          heatBase: typeof task.heatBase === "number" ? task.heatBase : 35,
          heatCurrent: typeof task.heatCurrent === "number" ? task.heatCurrent : (typeof task.heatBase === "number" ? task.heatBase : 35),
          lastUpdated: Date.now(),
          deadAt: null,
        };
        return reopenedTask;
      }

      if (action === "today") {
        const nextValue = !task.isToday;
        feedback = nextValue ? "Закрепил на сегодня." : "Открепил от сегодня.";
        return { ...task, isToday: nextValue, lastUpdated: Date.now() };
      }

      if (action === "vital") {
        const nextValue = !task.isVital;
        feedback = nextValue ? "Пометил как критичную." : "Снял критичный приоритет.";
        return {
          ...task,
          isVital: nextValue,
          urgency: nextValue ? "high" : task.urgency,
          lastUpdated: Date.now(),
        };
      }

      if (action === "panic") {
        const firstOpenSubtask = getFirstOpenSubtask(task);
        feedback = firstOpenSubtask
          ? `Первый шаг: ${firstOpenSubtask.text}`
          : "Открой всё по задаче и сделай один кривой шаг на 2 минуты.";
        panicTask = task;
        return task;
      }

      return task;
    });

    return {
      ...current,
      tasks: nextTasks,
      telegramContext:
        completedTask
          ? buildTelegramContext(completedTask, "done")
          : reopenedTask
            ? buildTelegramContext(reopenedTask, "reopen")
            : panicTask
              ? buildTelegramContext(panicTask, "panic")
              : current.telegramContext,
    };
  }, {
    source: "telegram",
    reason: `callback_${action || "unknown"}`,
  });

  await answerCallback(callbackQuery.id, feedback);

  if (action === "panic" && panicTask) {
    await sendText(chatId, buildPanicText(panicTask), {
      reply_markup: plannerTaskKeyboard(panicTask.id),
    });
  }

  if (action === "done" && completedTask) {
    await sendText(
      chatId,
      `☁️ <b>${escapeHtml(completedTask.text)}</b> теперь в раю. Если это была ошибка, верни её кнопкой ниже.`,
      { reply_markup: completedTaskKeyboard(completedTask.id) },
    );
  }

  if (action === "reopen" && reopenedTask) {
    await sendText(
      chatId,
      `↩️ <b>${escapeHtml(reopenedTask.text)}</b> снова в активных.`,
      { reply_markup: plannerTaskKeyboard(reopenedTask.id) },
    );
  }
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
    const { command, argText } = parseCommand(text);

    if (command === "/start") {
      await handleStart(chatId);
    } else if (command === "/today") {
      await handleToday(chatId);
    } else if (command === "/completed") {
      await handleCompleted(chatId);
    } else if (command === "/panic") {
      await handlePanic(chatId);
    } else if (command === "/calendar") {
      await handleCalendar(chatId);
    } else if (command === "/add") {
      await handleAdd(chatId, argText);
    } else if (text) {
      await handlePlainCapture(chatId, text);
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
