const {
  buildTelegramContext,
  buildTelegramTaskLine,
  createTask,
  escapeHtml,
  getFirstOpenSubtask,
  getNonActiveTasks,
  mutatePlanner,
  pickRescueTask,
  sortTasksByPriority,
} = require("./planner-store");
const {
  buildGoogleCalendarConnectUrl,
  createCalendarEvent,
  hasGoogleCalendarConnection,
} = require("./google-calendar");
const { getCommitmentsNeedingLiveTask } = require("./commitment-store");

function normalizeTaskText(text = "") {
  return String(text).trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeTaskLookupText(text = "") {
  return normalizeTaskText(text)
    .replace(/[«»"'`]/g, " ")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left = "", right = "") {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);

  for (let i = 0; i < left.length; i += 1) {
    current[0] = i + 1;
    for (let j = 0; j < right.length; j += 1) {
      const substitutionCost = left[i] === right[j] ? 0 : 1;
      current[j + 1] = Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + substitutionCost,
      );
    }

    for (let j = 0; j < current.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}

function findTaskByText(tasks = [], query, allowedStatuses = ["active"]) {
  const normalizedQuery = normalizeTaskText(query);
  if (!normalizedQuery) return null;

  const normalizedLookupQuery = normalizeTaskLookupText(query);
  const candidates = tasks.filter((task) => allowedStatuses.includes(task.status));

  const exact =
    candidates.find((task) => normalizeTaskText(task.text) === normalizedQuery) ||
    candidates.find((task) => normalizeTaskLookupText(task.text) === normalizedLookupQuery);
  if (exact) return exact;

  const contains =
    candidates.find((task) => normalizeTaskText(task.text).includes(normalizedQuery)) ||
    candidates.find((task) => normalizeTaskLookupText(task.text).includes(normalizedLookupQuery));
  if (contains) return contains;

  if (!normalizedLookupQuery || normalizedLookupQuery.length < 5) return null;

  let bestMatch = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const task of candidates) {
    const candidateText = normalizeTaskLookupText(task.text);
    if (!candidateText) continue;
    const distance = levenshteinDistance(candidateText, normalizedLookupQuery);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = task;
    }
  }

  const threshold = Math.min(3, Math.max(1, Math.floor(normalizedLookupQuery.length * 0.2)));
  return bestDistance <= threshold ? bestMatch : null;
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

function resolveTaskReference(plannerData, taskQuery, allowedStatuses = ["active"]) {
  const query = String(taskQuery || "").trim();
  if (!query || query === "last_task" || looksLikeContextTaskQuery(query)) {
    return resolveContextTask(plannerData, { statuses: allowedStatuses });
  }

  return findTaskByText(plannerData.tasks, query, allowedStatuses);
}

function resolveTodayTaskReference(plannerData, taskQuery = "") {
  const todayTasks = Array.isArray(plannerData?.tasks)
    ? plannerData.tasks.filter((task) => task.status === "active" && task.isToday)
    : [];
  const query = String(taskQuery || "").trim();
  const lowered = normalizeTaskText(query);

  if (!todayTasks.length) return null;

  if (!query || query === "last_task") {
    const contextTask = resolveContextTask(plannerData, { statuses: ["active"], fallbackLatest: false });
    return contextTask?.isToday ? contextTask : todayTasks[todayTasks.length - 1];
  }

  if (/последн/.test(lowered)) return todayTasks[todayTasks.length - 1] || null;
  if (/перв/.test(lowered)) return todayTasks[0] || null;

  if (looksLikeContextTaskQuery(query)) {
    const contextTask = resolveContextTask(plannerData, { statuses: ["active"], fallbackLatest: false });
    if (contextTask?.isToday) return contextTask;
  }

  return findTaskByText(todayTasks, query, ["active"]);
}

function resolveSuggestedTodayTaskReference(plannerData, taskQuery = "") {
  const context = plannerData?.telegramContext || {};
  const tasks = Array.isArray(plannerData?.tasks) ? plannerData.tasks : [];
  const candidateTaskIds = Array.isArray(context.candidateTaskIds) ? context.candidateTaskIds : [];
  const candidateTasks = candidateTaskIds
    .map((taskId) => tasks.find((task) => task.id === taskId && task.status === "active" && task.isToday))
    .filter(Boolean);

  if (!candidateTasks.length) {
    return resolveTodayTaskReference(plannerData, taskQuery);
  }

  const query = String(taskQuery || "").trim();
  const lowered = normalizeTaskText(query);

  if (!query) {
    return candidateTasks.find((task) => task.id === context.suggestedTaskId) || candidateTasks[candidateTasks.length - 1];
  }

  if (/последн/.test(lowered)) return candidateTasks[candidateTasks.length - 1] || null;
  if (/перв/.test(lowered)) return candidateTasks[0] || null;
  if (/втор/.test(lowered)) return candidateTasks[1] || null;
  if (/треть/.test(lowered)) return candidateTasks[2] || null;

  if (looksLikeContextTaskQuery(query)) {
    return candidateTasks.find((task) => task.id === context.suggestedTaskId) || candidateTasks[0] || null;
  }

  return findTaskByText(candidateTasks, query, ["active"]);
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
  const existingSubtaskTexts = new Set(existingSubtasks.map((subtask) => normalizeTaskText(subtask.text)));

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

function formatDays(value = 0) {
  const days = Math.max(0, Math.floor(Number(value) || 0));
  if (days === 1) return "1 день";
  if (days >= 2 && days <= 4) return `${days} дня`;
  return `${days} дней`;
}

function isImportantNowTask(task = {}) {
  if (!task || task.status !== "active") return false;
  if (task.isVital) return true;
  if (task.urgency === "high") return true;
  if (task.deadlineAt) return true;
  return false;
}

function buildImportantNowText(tasks = []) {
  const shortlist = Array.isArray(tasks) ? tasks.filter(Boolean).slice(0, 2) : [];
  if (!shortlist.length) return "";

  return [
    "⭐ <b>Важное сейчас</b>",
    "",
    ...shortlist.map((task, index) => `${index + 1}. ${escapeHtml(task.text)}`),
  ].join("\n");
}

function buildImportantNowReferenceText(importantCount = 0) {
  const count = Math.max(0, Number(importantCount) || 0);
  if (!count) return "";
  if (count === 1) {
    return [
      "⭐ <b>Важное сейчас</b>",
      "",
      "Это пункт 1 из списка выше.",
    ].join("\n");
  }
  if (count === 2) {
    return [
      "⭐ <b>Важное сейчас</b>",
      "",
      "Пункты 1 и 2 уже в списке выше.",
    ].join("\n");
  }
  return [
    "⭐ <b>Важное сейчас</b>",
    "",
    `Первые ${count} пункта уже в списке выше.`,
  ].join("\n");
}

function buildAngelReasonText(task = null) {
  if (!task || !task.angelPinned) return "";
  const reason = String(task.angelReason || "").trim();
  if (!reason) return "🤖 Ангел выбрал это как приоритет сейчас.";
  return `🤖 Почему ангел выбрал это: ${escapeHtml(reason)}`;
}

function buildCommitmentGapText(commitments = []) {
  if (!Array.isArray(commitments) || commitments.length === 0) return "";

  return [
    commitments.length === 1
      ? "⚠️ Есть важное обязательство без активного шага:"
      : "⚠️ Есть важные обязательства без активного шага:",
    ...commitments.map((commitment, index) => {
      const overdue = Number(commitment.overdueDays) || 0;
      const silent = Number(commitment.silentForDays) || 0;
      const statusText = overdue > 0
        ? `просрочено на ${formatDays(overdue)}`
        : `без шага уже ${formatDays(silent)}`;

      return `${index + 1}. ${escapeHtml(commitment.title)} — ${statusText}`;
    }),
    "",
    "Напиши просто по-человечески, что делаем дальше, и я добавлю следующий шаг.",
  ].join("\n");
}

async function sendTodayDigest(adapter, plannerData) {
  const activeTasks = plannerData.tasks.filter((task) => task.status === "active");
  const topTasks = sortTasksByPriority(activeTasks).slice(0, 3);

  if (topTasks.length === 0) {
    await adapter.sendText("Сегодня активных задач нет. Можно выдохнуть или добавить новую.");
    return null;
  }

  const [topTask, ...restTasks] = topTasks;
  const header = [
    "☀️ <b>Что у тебя сегодня горит</b>",
    "",
    ...topTasks.map((task, index) => `${index + 1}. ${buildTelegramTaskLine(task).slice(2)}`),
  ].join("\n");

  await adapter.sendText(header);

  await adapter.sendText(
    [
      `🎯 <b>Главная сейчас:</b> ${escapeHtml(topTask.text)}`,
      restTasks.length
        ? `Ещё в фоне: ${restTasks.map((task) => escapeHtml(task.text)).join(" · ")}`
        : "Если хочется только одного действия, жми Panic.",
    ].join("\n"),
    {
      reply_markup: adapter.taskKeyboard(topTask.id),
    },
  );

  const angelReasonText = buildAngelReasonText(topTask);
  if (angelReasonText) {
    await adapter.sendText(angelReasonText);
  }

  return topTask;
}

async function logAction(log, payload) {
  if (typeof log === "function") {
    await log(payload);
  }
}

async function resolveTaskReferenceIncludingNonActive(userId, plannerData, taskQuery, allowedStatuses = ["active"]) {
  const allowed = Array.isArray(allowedStatuses) ? allowedStatuses : ["active"];
  const activeMatch = resolveTaskReference(plannerData, taskQuery, allowed);
  if (activeMatch) return activeMatch;

  const needsNonActive = allowed.some((status) => status === "completed" || status === "dead");
  if (!needsNonActive) return null;

  const nonActiveTasks = await getNonActiveTasks(userId);
  const nonActiveAllowed = nonActiveTasks.filter((task) => allowed.includes(task.status));
  const query = String(taskQuery || "").trim();

  if (!query || query === "last_task" || looksLikeContextTaskQuery(query)) {
    return [...nonActiveAllowed]
      .sort((left, right) => (right.lastUpdated || 0) - (left.lastUpdated || 0))[0] || null;
  }

  return findTaskByText(nonActiveAllowed, query, allowed) || null;
}

async function executePlannerAction({
  userId,
  chatId,
  plannerData,
  route,
  adapter,
  log,
}) {
  if (route.type === "unknown_command") {
    await adapter.sendText(
      [
        "Я не поняла эту команду.",
        "",
        "Рабочие команды сейчас:",
        "/start",
        "/today",
        "/completed",
        "/reopen [название]",
        "/panic",
        "/add текст",
      ].join("\n"),
    );
    return;
  }

  if (route.type === "chat") {
    await adapter.sendText(route.replyText || "Сформулируй это как задачу, или просто напиши /today или /panic.");
    return;
  }

  if (route.type === "show_today") {
    const topTask = await sendTodayDigest(adapter, plannerData);
    if (!topTask) return;
    await mutatePlanner(userId, (current) => ({
      ...current,
      telegramContext: buildTelegramContext(topTask, "today"),
    }), {
      source: "telegram",
      reason: "show_today",
    });

    const activeTasks = Array.isArray(plannerData?.tasks)
      ? plannerData.tasks.filter((task) => task?.status === "active")
      : [];
    const todayTopTasks = sortTasksByPriority(activeTasks).slice(0, 3);
    const explicitImportant = sortTasksByPriority(
      activeTasks.filter((task) => isImportantNowTask(task) || task.angelPinned),
    );
    const importantNow = (explicitImportant.length > 0 ? explicitImportant : sortTasksByPriority(activeTasks)).slice(0, 2);
    const repeatsTopPrefix = importantNow.every((task, index) => todayTopTasks[index]?.id === task.id);
    if (importantNow.length > 0 && !repeatsTopPrefix) {
      await adapter.sendText(buildImportantNowText(importantNow));
    }

    const commitmentsNeedingTask = await getCommitmentsNeedingLiveTask(userId, plannerData.tasks, {
      maxCount: 2,
    });
    if (commitmentsNeedingTask.length > 0) {
      await adapter.sendText(buildCommitmentGapText(commitmentsNeedingTask));
    }
    return;
  }

  if (route.type === "show_completed") {
    const nonActiveTasks = await getNonActiveTasks(userId);
    const completedTasks = nonActiveTasks
      .filter((task) => task.status === "completed")
      .sort((left, right) => (right.lastUpdated || 0) - (left.lastUpdated || 0))
      .slice(0, 5);

    if (completedTasks.length === 0) {
      await adapter.sendText("В раю пока пусто. Завершённых задач нет.");
      return;
    }

    await adapter.sendText(
      [
        "☁️ <b>Последние завершённые задачи</b>",
        "",
        ...completedTasks.map((task, index) => `${index + 1}. ${escapeHtml(task.text)}`),
        "",
        "Если бот отправил что-то в рай по ошибке, жми кнопку возврата.",
      ].join("\n"),
    );

    for (const task of completedTasks) {
      await adapter.sendText(`☁️ <b>${escapeHtml(task.text)}</b>`, {
        reply_markup: adapter.completedTaskKeyboard(task.id),
      });
    }
    return;
  }

  if (route.type === "panic") {
    const task = pickRescueTask(plannerData.tasks);
    if (!task) {
      await adapter.sendText("Сейчас нет активной задачи для panic mode.");
      return;
    }

    await adapter.sendText(buildPanicText(task), {
      reply_markup: adapter.taskKeyboard(task.id),
    });

    await mutatePlanner(userId, (current) => ({
      ...current,
      telegramContext: buildTelegramContext(task, "panic"),
    }), {
      source: "telegram",
      reason: "show_panic",
    });
    return;
  }

  if (route.type === "panic_task") {
    const task =
      resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]) ||
      resolveContextTask(plannerData, { statuses: ["active"] }) ||
      pickRescueTask(plannerData.tasks);

    if (!task) {
      await adapter.sendText("Сейчас нет активной задачи для panic mode.");
      return;
    }

    await adapter.sendText(buildPanicText(task), {
      reply_markup: adapter.taskKeyboard(task.id),
    });

    await mutatePlanner(userId, (current) => ({
      ...current,
      telegramContext: buildTelegramContext(task, "panic"),
    }), {
      source: "telegram",
      reason: "show_panic_task",
    });
    return;
  }

  if (route.type === "schedule_task") {
    const hasConnection = await hasGoogleCalendarConnection(userId);
    if (!hasConnection) {
      const url = buildGoogleCalendarConnectUrl(userId);
      await adapter.sendText(
        "Сначала подключи Google Calendar. Потом я смогу создавать там события прямо из Telegram.",
        {
          reply_markup: adapter.calendarConnectKeyboard(url),
        },
      );
      return;
    }

    if (!route.deadlineAt || !route.startTime) {
      await adapter.sendText("Для календаря мне нужны дата и время. Например: запланируй на завтра в 14:00 задачу про диплом.");
      return;
    }

    const referencedTask = await resolveTaskReferenceIncludingNonActive(
      userId,
      plannerData,
      route.taskRef || "",
      ["active", "completed", "dead"],
    );
    const eventTitle = referencedTask?.text || route.taskText || route.rawText || "";

    const createdEvent = await createCalendarEvent(userId, {
      title: eventTitle,
      date: route.deadlineAt,
      startTime: route.startTime,
      durationMinutes: route.durationMinutes || 60,
      description: "Создано из ADHD Planner Telegram bot",
    });

    await adapter.sendText(
      `📅 Поставила в календарь: <b>${escapeHtml(createdEvent.summary || eventTitle)}</b>\n${escapeHtml(route.deadlineAt)} ${escapeHtml(route.startTime)}`,
    );
    return;
  }

  if (route.type === "delete_subtask") {
    const task = findTaskByText(plannerData.tasks, route.taskText, ["active", "completed", "dead"]);
    if (!task) {
      await adapter.sendText(`Не нашла задачу: <b>${escapeHtml(route.taskText)}</b>`);
      return;
    }

    const subtask = findSubtaskByText(task.subtasks || [], route.subtaskText);
    if (!subtask) {
      await adapter.sendText(
        `В задаче <b>${escapeHtml(task.text)}</b> не нашла подзадачу: <b>${escapeHtml(route.subtaskText)}</b>`,
      );
      return;
    }

    await mutatePlanner(
      userId,
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

    await adapter.sendText(`🗑️ Удалила подзадачу <b>${escapeHtml(subtask.text)}</b> из <b>${escapeHtml(task.text)}</b>.`);
    await logAction(log, {
      kind: "action",
      action: "delete_subtask",
      chatId: String(chatId),
      taskId: task.id,
      taskText: task.text,
      subtaskId: subtask.id,
      subtaskText: subtask.text,
    });
    return;
  }

  if (route.type === "add_subtask") {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText(`Не нашла активную задачу: <b>${escapeHtml(route.taskRef || route.taskText || "")}</b>`);
      return;
    }

    const subtaskText = String(route.subtaskText || route.taskText || "").trim();
    if (!subtaskText) {
      await adapter.sendText("Подзадача пустая. Напиши текст шага после слова «подзадачу».");
      return;
    }

    const duplicate = findSubtaskByText(task.subtasks || [], subtaskText);
    if (duplicate) {
      await adapter.sendText(
        `В задаче <b>${escapeHtml(task.text)}</b> уже есть похожая подзадача: <b>${escapeHtml(duplicate.text)}</b>.`,
        { reply_markup: adapter.taskKeyboard(task.id) },
      );
      return;
    }

    let updatedTask = null;
    let createdSubtask = null;
    await mutatePlanner(
      userId,
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
      await adapter.sendText("Не смогла добавить подзадачу. Попробуй ещё раз.");
      return;
    }

    await adapter.sendText(
      `🪜 Добавила подзадачу <b>${escapeHtml(createdSubtask.text)}</b> в <b>${escapeHtml(updatedTask.text)}</b>.`,
      { reply_markup: adapter.taskKeyboard(updatedTask.id) },
    );

    await logAction(log, {
      kind: "action",
      action: "add_subtask_from_text",
      chatId: String(chatId),
      taskId: updatedTask.id,
      taskText: updatedTask.text,
      subtaskId: createdSubtask.id,
      subtaskText: createdSubtask.text,
    });
    return;
  }

  if (route.type === "reopen_task") {
    const task = await resolveTaskReferenceIncludingNonActive(
      userId,
      plannerData,
      route.taskRef || route.taskText,
      ["completed", "dead"],
    );
    if (!task) {
      await adapter.sendText("Не нашла задачу, которую нужно вернуть в активные.");
      return;
    }

    let reopenedTask = null;
    await mutatePlanner(
      userId,
      (current) => {
        reopenedTask = {
          ...task,
          __baseLastUpdated: typeof task?.lastUpdated === "number" ? task.lastUpdated : 0,
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

        return {
          ...current,
          tasks: [
            reopenedTask,
            ...current.tasks.filter((currentTask) => currentTask.id !== task.id),
          ],
          telegramContext: buildTelegramContext(reopenedTask || task, "reopen"),
        };
      },
      {
        source: "telegram",
        reason: "reopen_from_text",
      },
    );

    if (!reopenedTask) {
      await adapter.sendText("Не смогла вернуть задачу в активные.");
      return;
    }

    await adapter.sendText(
      `↩️ <b>${escapeHtml(reopenedTask.text)}</b> снова в активных.`,
      { reply_markup: adapter.taskKeyboard(reopenedTask.id) },
    );

    await logAction(log, {
      kind: "action",
      action: "reopen_from_text",
      chatId: String(chatId),
      taskId: reopenedTask.id,
      taskText: reopenedTask.text,
    });
    return;
  }

  if (route.type === "complete_task") {
    const task =
      resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]) ||
      resolveContextTask(plannerData, { statuses: ["active"] });

    if (!task) {
      await adapter.sendText("Не нашла активную задачу, которую нужно отправить в рай.");
      return;
    }

    let completedTask = null;
    await mutatePlanner(
      userId,
      (current) => {
        const tasks = current.tasks.map((currentTask) => {
          if (currentTask.id !== task.id) return currentTask;
          completedTask = {
            ...currentTask,
            status: "completed",
            isToday: false,
            deadAt: null,
            heatBase: 100,
            heatCurrent: 100,
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
        reason: "complete_task",
      },
    );

    if (!completedTask) {
      await adapter.sendText("Не смогла отправить задачу в рай.");
      return;
    }

    await adapter.sendText(
      `☁️ <b>${escapeHtml(completedTask.text)}</b> теперь в раю. Если это была ошибка, верни её кнопкой ниже.`,
      { reply_markup: adapter.completedTaskKeyboard(completedTask.id) },
    );

    await logAction(log, {
      kind: "action",
      action: "complete_task",
      chatId: String(chatId),
      taskId: completedTask.id,
      taskText: completedTask.text,
    });
    return;
  }

  if (route.type === "suggest_unpin") {
    const todayTasks = plannerData.tasks.filter((task) => task.status === "active" && task.isToday);
    if (todayTasks.length === 0) {
      await adapter.sendText("На сегодня сейчас ничего не закреплено.");
      return;
    }

    const sortedToday = sortTasksByPriority(todayTasks);
    const recommendedToUnpin = sortedToday[sortedToday.length - 1] || todayTasks[0];

    await mutatePlanner(
      userId,
      (current) => ({
        ...current,
        telegramContext: buildTelegramContext(recommendedToUnpin, "suggest_unpin_today", {
          suggestedTaskId: recommendedToUnpin.id,
          candidateTaskIds: todayTasks.map((task) => task.id),
        }),
      }),
      {
        source: "telegram",
        reason: "suggest_unpin_today",
      },
    );

    await adapter.sendText(
      [
        `Я бы открепила: <b>${escapeHtml(recommendedToUnpin.text)}</b>`,
        "Ниже присылаю текущие задачи на сегодня. Нажми 📌 у той, которую хочешь снять.",
      ].join("\n"),
    );

    for (const task of todayTasks) {
      await adapter.sendText(`📌 <b>${escapeHtml(task.text)}</b>`, {
        reply_markup: adapter.taskKeyboard(task.id),
      });
    }

    await logAction(log, {
      kind: "action",
      action: "suggest_unpin_today",
      chatId: String(chatId),
      taskId: recommendedToUnpin.id,
      taskText: recommendedToUnpin.text,
    });
    return;
  }

  if (route.type === "unset_today") {
    const task =
      ["today_limit", "suggest_unpin_today"].includes(plannerData?.telegramContext?.lastAction || "")
        ? resolveSuggestedTodayTaskReference(plannerData, route.taskRef || route.taskText)
        : resolveTodayTaskReference(plannerData, route.taskRef || route.taskText);

    if (!task) {
      await adapter.sendText("Не нашла задачу на сегодня, которую нужно открепить.");
      return;
    }

    if (!task.isToday) {
      await adapter.sendText(`📌 <b>${escapeHtml(task.text)}</b> уже не закреплена на сегодня.`);
      return;
    }

    let updatedTask = null;
    await mutatePlanner(
      userId,
      (current) => {
        const tasks = current.tasks.map((currentTask) => {
          if (currentTask.id !== task.id) return currentTask;
          updatedTask = {
            ...currentTask,
            isToday: false,
            lastUpdated: Date.now(),
          };
          return updatedTask;
        });

        return {
          ...current,
          tasks,
          telegramContext: buildTelegramContext(updatedTask || task, "unset_today"),
        };
      },
      {
        source: "telegram",
        reason: "unset_today_from_text",
      },
    );

    if (!updatedTask) {
      await adapter.sendText("Не смогла открепить задачу от сегодня.");
      return;
    }

    await adapter.sendText(
      `📌 Сняла с сегодня: <b>${escapeHtml(updatedTask.text)}</b>`,
      { reply_markup: adapter.taskKeyboard(updatedTask.id) },
    );

    await logAction(log, {
      kind: "action",
      action: "unset_today_from_text",
      chatId: String(chatId),
      taskId: updatedTask.id,
      taskText: updatedTask.text,
    });
    return;
  }

  if (route.type === "set_today") {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText("Не нашла активную задачу, которую нужно закрепить на сегодня.");
      return;
    }

    if (task.isToday) {
      await adapter.sendText(`📌 <b>${escapeHtml(task.text)}</b> уже закреплена на сегодня.`, {
        reply_markup: adapter.taskKeyboard(task.id),
      });
      return;
    }

    const todayTasks = plannerData.tasks.filter((item) => item.status === "active" && item.isToday);
    if (todayTasks.length >= 3) {
      const sortedToday = sortTasksByPriority(todayTasks);
      const recommendedToUnpin = sortedToday[sortedToday.length - 1] || todayTasks[0] || null;

      await mutatePlanner(
        userId,
        (current) => ({
          ...current,
          telegramContext: buildTelegramContext(recommendedToUnpin || task, "today_limit", {
            suggestedTaskId: recommendedToUnpin?.id || null,
            candidateTaskIds: todayTasks.map((item) => item.id),
          }),
        }),
        {
          source: "telegram",
          reason: "today_limit_reached",
        },
      );

      await adapter.sendText(
        [
          "На сегодня уже закреплены 3 задачи.",
          recommendedToUnpin
            ? `Я бы сначала открепила: <b>${escapeHtml(recommendedToUnpin.text)}</b>`
            : "Сначала открепи что-то лишнее.",
          "Если хочешь, напиши: <b>предложи что открепить</b>.",
        ].join("\n"),
      );

      if (recommendedToUnpin) {
        await adapter.sendText(`📌 <b>${escapeHtml(recommendedToUnpin.text)}</b>`, {
          reply_markup: adapter.taskKeyboard(recommendedToUnpin.id),
        });
      }
      return;
    }

    let updatedTask = null;
    await mutatePlanner(
      userId,
      (current) => {
        const tasks = current.tasks.map((currentTask) => {
          if (currentTask.id !== task.id) return currentTask;
          updatedTask = {
            ...currentTask,
            isToday: true,
            lastUpdated: Date.now(),
          };
          return updatedTask;
        });

        return {
          ...current,
          tasks,
          telegramContext: buildTelegramContext(updatedTask || task, "today"),
        };
      },
      {
        source: "telegram",
        reason: "set_today_from_text",
      },
    );

    if (!updatedTask) {
      await adapter.sendText("Не смогла закрепить задачу на сегодня.");
      return;
    }

    await adapter.sendText(`📌 Закрепила на сегодня: <b>${escapeHtml(updatedTask.text)}</b>`, {
      reply_markup: adapter.taskKeyboard(updatedTask.id),
    });

    await logAction(log, {
      kind: "action",
      action: "set_today_from_text",
      chatId: String(chatId),
      taskId: updatedTask.id,
      taskText: updatedTask.text,
    });
    return;
  }

  if (route.type === "set_vital") {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText("Не нашла активную задачу, которую нужно сделать критичной.");
      return;
    }

    if (task.isVital) {
      await adapter.sendText(`🚨 <b>${escapeHtml(task.text)}</b> уже помечена как критичная.`, {
        reply_markup: adapter.taskKeyboard(task.id),
      });
      return;
    }

    let updatedTask = null;
    await mutatePlanner(
      userId,
      (current) => {
        const tasks = current.tasks.map((currentTask) => {
          if (currentTask.id !== task.id) return currentTask;
          updatedTask = {
            ...currentTask,
            isVital: true,
            urgency: "high",
            lastUpdated: Date.now(),
          };
          return updatedTask;
        });

        return {
          ...current,
          tasks,
          telegramContext: buildTelegramContext(updatedTask || task, "vital"),
        };
      },
      {
        source: "telegram",
        reason: "set_vital_from_text",
      },
    );

    if (!updatedTask) {
      await adapter.sendText("Не смогла пометить задачу как критичную.");
      return;
    }

    await adapter.sendText(`🚨 Пометила как критичную: <b>${escapeHtml(updatedTask.text)}</b>`, {
      reply_markup: adapter.taskKeyboard(updatedTask.id),
    });

    await logAction(log, {
      kind: "action",
      action: "set_vital_from_text",
      chatId: String(chatId),
      taskId: updatedTask.id,
      taskText: updatedTask.text,
    });
    return;
  }

  if (route.type === "unset_vital") {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText("Не нашла активную задачу, с которой нужно снять критичный приоритет.");
      return;
    }

    if (!task.isVital) {
      await adapter.sendText(`⚪ <b>${escapeHtml(task.text)}</b> уже без критичного приоритета.`, {
        reply_markup: adapter.taskKeyboard(task.id),
      });
      return;
    }

    let updatedTask = null;
    await mutatePlanner(
      userId,
      (current) => {
        const tasks = current.tasks.map((currentTask) => {
          if (currentTask.id !== task.id) return currentTask;
          updatedTask = {
            ...currentTask,
            isVital: false,
            lastUpdated: Date.now(),
          };
          return updatedTask;
        });

        return {
          ...current,
          tasks,
          telegramContext: buildTelegramContext(updatedTask || task, "unset_vital"),
        };
      },
      {
        source: "telegram",
        reason: "unset_vital_from_text",
      },
    );

    if (!updatedTask) {
      await adapter.sendText("Не смогла снять критичный приоритет.");
      return;
    }

    await adapter.sendText(`⚪ Сняла критичный приоритет: <b>${escapeHtml(updatedTask.text)}</b>`, {
      reply_markup: adapter.taskKeyboard(updatedTask.id),
    });

    await logAction(log, {
      kind: "action",
      action: "unset_vital_from_text",
      chatId: String(chatId),
      taskId: updatedTask.id,
      taskText: updatedTask.text,
    });
    return;
  }

  if (route.type === "add_task") {
    const normalizedIncomingText = normalizeTaskText(route.taskText || route.rawText || "");
    let outcome = null;

    await mutatePlanner(userId, (current) => {
      const existingIndex = current.tasks.findIndex(
        (task) => task.status === "active" && normalizeTaskText(task.text) === normalizedIncomingText,
      );

      if (existingIndex !== -1) {
        const existingTask = current.tasks[existingIndex];
        const updatedTask = mergeIncomingIntoTask(existingTask, {
          urgency: route.urgency,
          resistance: route.resistance,
          isToday: route.isToday,
          isVital: route.isVital,
          deadlineAt: route.deadlineAt,
          lifeArea: route.lifeArea || "",
          commitmentIds: route.commitmentIds || [],
          subtasks: route.subtasks || [],
        });
        const tasks = [...current.tasks];
        tasks[existingIndex] = updatedTask;
        outcome = { type: "updated", task: updatedTask };
        return {
          ...current,
          tasks,
          telegramContext: buildTelegramContext(updatedTask, "upsert"),
        };
      }

      const created = createTask(route.taskText || route.rawText || "", {
        source: "telegram",
        deadlineAt: route.deadlineAt || "",
        urgency: route.urgency || "medium",
        resistance: route.resistance || "medium",
        isToday: route.isToday,
        isVital: route.isVital,
        lifeArea: route.lifeArea || "",
        commitmentIds: route.commitmentIds || [],
      });

      if (Array.isArray(route.subtasks) && route.subtasks.length > 0) {
        created.subtasks = route.subtasks.map((text, index) => ({
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
      await logAction(log, {
        kind: "error",
        chatId: String(chatId),
        errorMessage: "add_task finished without outcome",
        incomingText: route.rawText || route.taskText,
      });
      await adapter.sendText("Не смогла сохранить задачу. Попробуй ещё раз.");
      return;
    }

    await logAction(log, {
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

    if (outcome.type === "updated") {
      await adapter.sendText(
        [
          `🧩 Такая активная задача уже была. Я обновила её: <b>${escapeHtml(task.text)}</b>`,
          meta.length ? meta.join(" · ") : "",
        ].filter(Boolean).join("\n"),
        { reply_markup: adapter.taskKeyboard(task.id) },
      );
      return;
    }

    await adapter.sendText(
      [
        `➕ Добавила задачу: <b>${escapeHtml(task.text)}</b>`,
        meta.length ? meta.join(" · ") : "",
      ].filter(Boolean).join("\n"),
      { reply_markup: adapter.taskKeyboard(task.id) },
    );
    return;
  }

  await adapter.sendText("Сформулируй это как задачу, или просто напиши /today или /panic.");
}

module.exports = {
  executePlannerAction,
};
