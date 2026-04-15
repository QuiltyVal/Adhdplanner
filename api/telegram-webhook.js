const { buildTelegramContext, buildTelegramTaskLine, createTask, escapeHtml, getFirstOpenSubtask, getNonActiveTasks, getTaskById, getPlannerData, linkTelegramChat, mutatePlanner, pickRescueTask, sortTasksByPriority, writeTelegramLog } = require("./_lib/planner-store");
const { buildGoogleCalendarConnectUrl, createCalendarEvent, hasGoogleCalendarConnection } = require("./_lib/google-calendar");
const { buildTaskMemoryEnrichment, processTelegramTaskCapture } = require("./_lib/telegram-task-memory");
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
  const allNonActive = await getNonActiveTasks(userId);
  const completedTasks = allNonActive
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
  const enrichment = buildTaskMemoryEnrichment(processing, argText);

  await upsertTask(chatId, {
    text: argText,
    source: "telegram",
    urgency: enrichment.urgency || "medium",
    resistance: enrichment.resistance || "medium",
    lifeArea: enrichment.lifeArea || "",
    commitmentIds: enrichment.commitmentIds || [],
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

  const intent = await parseTelegramIntent({
    text: cleaned,
    tasks: plannerData.tasks,
    telegramContext: plannerData.telegramContext,
  });

  await safeWriteTelegramLog({
    kind: "intent",
    chatId: String(chatId),
    messageText: cleaned,
    intent,
  });

  const captureProcessing =
    ["add_task", "chat"].includes(intent.intent)
      ? await processTelegramTaskCapture({
          userId,
          chatId,
          rawText: cleaned,
          intent: intent.intent,
          taskText: intent.task_text || "",
          taskRef: intent.task_ref || "",
          urgency: intent.urgency || "",
          isToday: Boolean(intent.is_today),
          isVital: Boolean(intent.is_vital),
          deadlineAt: intent.deadline_at || "",
          subtasks: Array.isArray(intent.subtasks) ? intent.subtasks : [],
          telegramMessageId: options.telegramMessageId || null,
          telegramUpdateId: options.telegramUpdateId || null,
          writeLog: safeWriteTelegramLog,
        })
      : null;

  if (intent.intent === "show_today") {
    await handleToday(chatId);
    return;
  }

  if (intent.intent === "panic") {
    await handlePanic(chatId);
    return;
  }

  if (intent.intent === "suggest_unpin") {
    await handleSuggestUnpin(chatId, plannerData);
    return;
  }

  if (intent.intent === "set_today") {
    await handleSetToday(chatId, plannerData, intent.task_ref);
    return;
  }

  if (intent.intent === "unset_today") {
    await handleUnsetToday(chatId, plannerData, intent.task_ref);
    return;
  }

  if (intent.intent === "set_vital") {
    await handleSetVital(chatId, plannerData, intent.task_ref);
    return;
  }

  if (intent.intent === "complete_task") {
    await handleCompleteTaskRequest(chatId, plannerData, intent.task_ref || "");
    return;
  }

  if (intent.intent === "reopen_task") {
    await handleReopenTask(chatId, plannerData, intent.task_ref);
    return;
  }

  if (intent.intent === "add_subtask") {
    await handleAddSubtask(chatId, plannerData, intent.task_ref, intent.subtask_text);
    return;
  }

  if (intent.intent === "delete_subtask") {
    await handleDeleteSubtaskRequest(chatId, plannerData, {
      taskText: intent.task_ref || "",
      subtaskText: intent.subtask_text || "",
    });
    return;
  }

  if (intent.intent === "schedule_task") {
    const hasConnection = await hasGoogleCalendarConnection(userId);
    if (!hasConnection) {
      const url = buildGoogleCalendarConnectUrl(userId);
      await sendText(
        chatId,
        "Сначала подключи Google Calendar. Потом я смогу создавать там события прямо из Telegram.",
        { reply_markup: calendarConnectKeyboard(url) },
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

    const taskTitle = intent.task_ref || intent.task_text || cleaned;
    const createdEvent = await createCalendarEvent(userId, {
      title: taskTitle,
      date: intent.deadline_at,
      startTime: intent.start_time,
      durationMinutes: intent.duration_minutes || 60,
      description: "Создано из ADHD Planner Telegram bot",
    });

    await sendText(
      chatId,
      `📅 Поставила в календарь: <b>${escapeHtml(createdEvent.summary || taskTitle)}</b>\n${escapeHtml(intent.deadline_at)} ${escapeHtml(intent.start_time)}`,
    );
    return;
  }

  if (intent.intent === "chat") {
    await sendText(
      chatId,
      intent.reply_text || "Сформулируй это как задачу, или напиши /today или /panic.",
    );
    return;
  }

  // Default: add_task
  const taskText = intent.task_text || cleaned;
  const enrichment = buildTaskMemoryEnrichment(captureProcessing, taskText);
  await upsertTask(chatId, {
    text: taskText,
    source: "telegram",
    deadlineAt: intent.deadline_at || "",
    urgency: intent.urgency || enrichment.urgency || "medium",
    resistance: enrichment.resistance || "medium",
    isToday: intent.is_today,
    isVital: intent.is_vital,
    lifeArea: enrichment.lifeArea || "",
    commitmentIds: enrichment.commitmentIds || [],
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

  // "reopen" must fetch from Firestore by ID because completed/dead tasks are
  // not included in the active-only list returned by getPlannerData.
  if (action === "reopen") {
    const source = await getTaskById(userId, taskId);
    if (!source) {
      await answerCallback(callbackQuery.id, "Задача не найдена.");
      return;
    }
    let reopenedTask = null;
    await mutatePlanner(userId, (current) => {
      reopenedTask = {
        ...source,
        __baseLastUpdated: typeof source?.lastUpdated === "number" ? source.lastUpdated : 0,
        status: "active",
        isToday: false,
        deadAt: null,
        heatBase: typeof source.heatBase === "number" ? source.heatBase : 35,
        heatCurrent: typeof source.heatCurrent === "number" ? source.heatCurrent : (typeof source.heatBase === "number" ? source.heatBase : 35),
        lastUpdated: Date.now(),
      };
      // Add to active list (source was completed, not in current.tasks)
      const exists = current.tasks.some((t) => t.id === reopenedTask.id);
      const tasks = exists
        ? current.tasks.map((t) => (t.id === reopenedTask.id ? reopenedTask : t))
        : [reopenedTask, ...current.tasks];
      return { ...current, tasks, telegramContext: buildTelegramContext(reopenedTask, "reopen") };
    }, { source: "telegram", reason: "callback_reopen" });
    await answerCallback(callbackQuery.id, "Вернул задачу в активные.");
    if (reopenedTask) {
      await sendText(chatId, `↩️ <b>${escapeHtml(reopenedTask.text)}</b> снова в активных.`, {
        reply_markup: plannerTaskKeyboard(reopenedTask.id),
      });
    }
    return;
  }

  let feedback = "Сделано.";
  let panicTask = null;
  let completedTask = null;

  await mutatePlanner(userId, (current) => {
    const nextTasks = current.tasks.map((task) => {
      if (task.id !== taskId) return task;

      if (action === "done") {
        feedback = "Задача отправлена в выполненные.";
        completedTask = {
          ...task,
          status: "completed",
          isToday: false,
          deadAt: null,
          heatBase: 100,
          heatCurrent: 100,
          lastUpdated: Date.now(),
        };
        return completedTask;
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
      await handleAdd(chatId, argText, {
        telegramMessageId: message?.message_id || null,
        telegramUpdateId: update?.update_id || null,
      });
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
