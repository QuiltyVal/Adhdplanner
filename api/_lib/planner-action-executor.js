const {
  buildTelegramTaskLine,
  createTask,
  escapeHtml,
  getFirstOpenSubtask,
  getDeadlineInfo,
  getNonActiveTasks,
  pickRescueTask,
  sortTasksByPriority,
} = require("./planner-store");
const { PLANNER_ACTIONS } = require("./planner-action-types");
const { executePlannerActionCommand } = require("./planner-command-runner");
const {
  RESCUE_ROUTE_TYPES,
  TASK_TUNING_ROUTE_TYPES,
} = require("./planner-action-command-map");
const { buildPlannerActionRouteCommand } = require("./planner-command-builders");
const {
  buildGoogleCalendarConnectUrl,
  createCalendarEvent,
  hasGoogleCalendarConnection,
} = require("./google-calendar");
const { getCommitmentsNeedingLiveTask } = require("./commitment-store");
const { setPlannerContextFromTelegram } = require("./planner-telegram-context");
const {
  buildAddSubtaskMessage,
  buildAddTaskMessage,
  buildAddTimeMessage,
  buildBulkMoveCompletedMessage,
  buildCompletedTaskMessage,
  buildDeleteSubtaskMessage,
  buildDeleteForeverMessage,
  buildEditSubtaskMessage,
  buildKillTaskMessage,
  buildReorderTaskMessage,
  buildRescueActionMessage,
  buildRestoreSnapshotMessage,
  buildTaskTuningMessage,
  buildToggleSubtaskMessage,
  buildTouchTaskMessage,
} = require("./planner-telegram-copy");

const TELEGRAM_DATE_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getBerlinDateKey(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return TELEGRAM_DATE_FORMAT.format(date);
}

const OVERDUE_COMPLETION_REWARD_TIERS = [
  { days: 3, bonus: 3 },
  { days: 2, bonus: 2 },
  { days: 1, bonus: 1 },
];

function normalizeTaskText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(мне|надо|нужно|хочу|задача|задачу|пожалуйста)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTaskLookupText(text = "") {
  return normalizeTaskText(text)
    .replace(/[«»"'`]/g, " ")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getExplicitRouteTaskRef(route = {}) {
  return String(route?.taskRef || route?.taskText || "").trim();
}

function isNoopCommandResult(result = {}) {
  return String(result?.outcome || "").toLowerCase() === "noop";
}

function getStaleTaskNoopMessage(action = "action") {
  if (action === "complete") return "This task is no longer active, so I did not complete anything else.";
  if (action === "rescue") return "This task is no longer active, so I did not start rescue on another task.";
  if (action === "touch") return "This task is no longer active, so I did not record movement on another task.";
  if (action === "kill") return "This task is already out of the active list, so I did not move another task.";
  return "This task is no longer in the right state, so I did not change another task.";
}

function getNextStatusPosition(tasks = [], status = "active", excludeTaskId = "") {
  const positions = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task.status === status && task.id !== excludeTaskId)
    .map((task) => Number(task.position))
    .filter(Number.isFinite);
  return positions.length > 0 ? Math.max(...positions) + 1 : 0;
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

  const byId = candidates.find((task) => String(task.id) === query);
  if (byId) return byId;

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

function getOverdueCompletionRewardMeta(task) {
  const deadlineInfo = getDeadlineInfo(task);
  if (!deadlineInfo || deadlineInfo.tone !== "overdue") {
    return { bonus: 0, overdueDays: 0, tier: "none" };
  }
  if (!Number.isFinite(deadlineInfo.daysLeft)) {
    return { bonus: 0, overdueDays: 0, tier: "none" };
  }
  const overdueDays = Math.max(0, Math.ceil(-deadlineInfo.daysLeft));
  for (const tier of OVERDUE_COMPLETION_REWARD_TIERS) {
    if (overdueDays >= tier.days) {
      return { bonus: tier.bonus, overdueDays, tier: tier.tier };
    }
  }
  return { bonus: 0, overdueDays, tier: "none" };
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
    "🆘 <b>Rescue mode</b>",
    "",
    "We take: <b>" + escapeHtml(task.text) + "</b>",
  ];

  if (firstOpenSubtask) {
    lines.push("First step: " + escapeHtml(firstOpenSubtask.text));
    lines.push("Do only this. Stop after two imperfect minutes if you want.");
  } else {
    lines.push("No subtasks yet. Open anything related to this task and make one imperfect two-minute move.");
  }

  return lines.join("\n");
}

function formatDays(days) {
  if (days === 1) return "1 day";
  return `${days} days`;
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
    "⭐ <b>Important right now</b>",
    "",
    ...shortlist.map((task, index) => `${index + 1}. ${escapeHtml(task.text)}`),
  ].join("\n");
}

function buildImportantNowReferenceText(importantCount = 0) {
  const count = Math.max(0, Number(importantCount) || 0);
  if (!count) return "";
  if (count === 1) {
    return [
      "⭐ <b>Important right now</b>",
      "",
      "This is item 1 from the list above.",
    ].join("\n");
  }
  if (count === 2) {
    return [
      "⭐ <b>Important right now</b>",
      "",
      "Items 1 and 2 are already in the list above.",
    ].join("\n");
  }
  return [
    "⭐ <b>Important right now</b>",
    "",
    `The first ${count} items are already in the list above.`,
  ].join("\n");
}

function buildAngelReasonText(reason) {
  const value = reason && typeof reason === "object"
    ? String(reason.angelReason || reason.missionReason || reason.plannerNudgeReason || "")
    : String(reason || "");
  if (!value.trim()) return "🤖 Angel picked this as the current priority.";
  return `🤖 Why angel picked this: ${escapeHtml(value)}`;
}

function getPlannerMeta(plannerData = {}) {
  const meta = plannerData?.plannerMeta || plannerData?.planner_meta || {};
  return meta && typeof meta === "object" ? meta : {};
}

function resolveMetaTask(plannerData = {}, fieldName = "", allowedStatuses = ["active"]) {
  const meta = getPlannerMeta(plannerData);
  const taskId = String(meta[fieldName] || "").trim();
  if (!taskId) return null;
  return (Array.isArray(plannerData?.tasks) ? plannerData.tasks : [])
    .find((task) => String(task?.id || "") === taskId && allowedStatuses.includes(task?.status || "active")) || null;
}

function buildPlannerMetaAngelDecision(plannerData = {}) {
  const meta = getPlannerMeta(plannerData);
  const tasks = Array.isArray(plannerData?.tasks) ? plannerData.tasks : [];
  const taskIds = [
    {
      taskId: String(meta.mission_task_id || "").trim(),
      reason: String(meta.mission_explanation || meta.mission_reason || "").trim(),
      score: 100,
    },
    {
      taskId: String(meta.suggested_rescue_task_id || "").trim(),
      reason: String(meta.suggested_rescue_explanation || meta.suggested_rescue_reason || "").trim(),
      score: 85,
    },
  ];
  const seen = new Set();
  const items = taskIds
    .filter((item) => item.taskId && !seen.has(item.taskId) && seen.add(item.taskId))
    .filter((item) => tasks.some((task) => String(task?.id || "") === item.taskId && task?.status === "active"))
    .map((item) => ({
      taskId: item.taskId,
      angelReason: item.reason,
      angelScore: item.score,
    }));

  if (items.length === 0) return null;
  return {
    source: "planner_meta",
    dateKey: String(meta.dateKey || meta.date_key || getBerlinDateKey()),
    items,
  };
}

function applyAngelPinsToTasks(tasks = [], decisionItems = [], options = {}) {
  const now = Date.now();
  const touchLastUpdated = Boolean(options.touchLastUpdated);
  const byTaskId = new Map(
    (Array.isArray(decisionItems) ? decisionItems : [])
      .map((item) => [String(item?.taskId || "").trim(), item]),
  );

  let changed = false;
  const nextTasks = (Array.isArray(tasks) ? tasks : []).map((task) => {
    if (!task || task.status !== "active") return task;

    const decision = byTaskId.get(String(task.id || ""));
    if (decision) {
      const nextReason = String(decision.angelReason || "").trim();
      const nextScore = Number.isFinite(Number(decision.angelScore)) ? Number(decision.angelScore) : 0;
      if (
        task.angelPinned === true &&
        String(task.angelReason || "") === nextReason &&
        Number(task.angelScore || 0) === nextScore
      ) {
        return task;
      }
      changed = true;
      return {
        ...task,
        angelPinned: true,
        angelReason: nextReason,
        angelScore: nextScore,
        ...(touchLastUpdated ? { lastUpdated: now } : {}),
      };
    }

    if (!task.angelPinned && !task.angelReason && Number(task.angelScore || 0) === 0) {
      return task;
    }
    changed = true;
    return {
      ...task,
      angelPinned: false,
      angelReason: "",
      angelScore: 0,
      ...(touchLastUpdated ? { lastUpdated: now } : {}),
    };
  });

  return { changed, tasks: nextTasks };
}

async function ensureDailyAngelPins(userId, plannerData, source = "telegram_today") {
  const tasks = Array.isArray(plannerData?.tasks) ? plannerData.tasks : [];
  const metaDecision = buildPlannerMetaAngelDecision(plannerData);
  if (metaDecision) {
    const metaApplied = applyAngelPinsToTasks(tasks, metaDecision.items, { touchLastUpdated: false });
    return {
      plannerData: metaApplied.changed
        ? {
            ...plannerData,
            tasks: metaApplied.tasks,
          }
        : plannerData,
      decision: metaDecision,
    };
  }

  return {
    plannerData,
    decision: {
      source: source || "planner_meta",
      dateKey: getBerlinDateKey(),
      items: [],
    },
  };
}

function buildCommitmentGapText(commitments = []) {
  if (!Array.isArray(commitments) || commitments.length === 0) return "";

  return [
    commitments.length === 1
      ? "⚠️ There is an important commitment without an active step:"
      : "⚠️ There are important commitments without active steps:",
    ...commitments.map((commitment, index) => {
      const overdue = Number(commitment.overdueDays) || 0;
      const silent = Number(commitment.silentForDays) || 0;
      const statusText = overdue > 0
        ? `overdue by ${formatDays(overdue)}`
        : `without a step for ${formatDays(silent)}`;

      return `${index + 1}. ${escapeHtml(commitment.title)} — ${statusText}`;
    }),
    "",
    "Tell me plainly what happens next, and I will add the next step.",
  ].join("\n");
}

function getEngineOrderedActiveTasks(plannerData = {}) {
  const activeTasks = Array.isArray(plannerData?.tasks)
    ? plannerData.tasks.filter((task) => task?.status === "active")
    : [];
  const preferredTasks = [
    resolveMetaTask(plannerData, "mission_task_id", ["active"]),
    resolveMetaTask(plannerData, "suggested_rescue_task_id", ["active"]),
  ].filter(Boolean);
  const byId = new Set();
  return [
    ...preferredTasks,
    ...sortTasksByPriority(activeTasks),
  ].filter((task) => {
    const taskId = String(task?.id || "");
    if (!taskId || byId.has(taskId)) return false;
    byId.add(taskId);
    return true;
  });
}

async function sendTodayDigest(adapter, plannerData) {
  const topTasks = getEngineOrderedActiveTasks(plannerData).slice(0, 3);

  if (topTasks.length === 0) {
    await adapter.sendText("No active tasks today. You can breathe or add a new one.");
    return null;
  }

  const [topTask, ...restTasks] = topTasks;
  const header = [
    "☀️ <b>What needs attention today</b>",
    "",
    ...topTasks.map((task, index) => `${index + 1}. ${buildTelegramTaskLine(task).slice(2)}`),
  ].join("\n");

  await adapter.sendText(header);

  await adapter.sendText(
    [
      `🎯 <b>Main right now:</b> ${escapeHtml(topTask.text)}`,
      restTasks.length
        ? `Also in the background: ${restTasks.map((task) => escapeHtml(task.text)).join(" · ")}`
        : "If you only have energy for one move, tap “I’m stuck”.",
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
        "I did not understand that command.",
        "",
        "Available commands now:",
        "/start",
        "/today",
        "/completed",
        "/cemetery",
        "/calendar",
        "/reopen [title]",
        "/panic",
        "/add text",
      ].join("\n"),
    );
    return;
  }

  if (route.type === PLANNER_ACTIONS.CHAT) {
    await adapter.sendText(route.replyText || "Write it as a task, or send /today or /panic.");
    return;
  }

  if (route.type === PLANNER_ACTIONS.SHOW_TODAY) {
    const { plannerData: plannerDataWithAngel } = await ensureDailyAngelPins(userId, plannerData, "show_today");
    const topTask = await sendTodayDigest(adapter, plannerDataWithAngel);
    if (!topTask) return;
    await setPlannerContextFromTelegram(userId, {
      task: topTask,
      action: "today",
      source: "telegram",
      chatId,
    });

    const activeTasks = Array.isArray(plannerDataWithAngel?.tasks)
      ? plannerDataWithAngel.tasks.filter((task) => task?.status === "active")
      : [];
    const todayTopTasks = getEngineOrderedActiveTasks(plannerDataWithAngel).slice(0, 3);
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

  if (route.type === PLANNER_ACTIONS.SHOW_COMPLETED) {
    const nonActiveTasks = await getNonActiveTasks(userId);
    const completedTasks = nonActiveTasks
      .filter((task) => task.status === "completed")
      .sort((left, right) => (right.lastUpdated || 0) - (left.lastUpdated || 0))
      .slice(0, 5);

    if (completedTasks.length === 0) {
      await adapter.sendText("Completed list is empty for now.");
      return;
    }

    await adapter.sendText(
      [
        "☁️ <b>Recently completed tasks</b>",
        "",
        ...completedTasks.map((task, index) => `${index + 1}. ${escapeHtml(task.text)}`),
        "",
        "If something was completed by mistake, use the restore button.",
      ].join("\n"),
    );

    for (const task of completedTasks) {
      await adapter.sendText(`☁️ <b>${escapeHtml(task.text)}</b>`, {
        reply_markup: adapter.completedTaskKeyboard(task.id),
      });
    }
    return;
  }

  if (route.type === PLANNER_ACTIONS.SHOW_CEMETERY) {
    const nonActiveTasks = await getNonActiveTasks(userId);
    const cemeteryTasks = nonActiveTasks
      .filter((task) => task.status === "dead")
      .sort((left, right) => (right.lastUpdated || 0) - (left.lastUpdated || 0))
      .slice(0, 5);

    if (cemeteryTasks.length === 0) {
      await adapter.sendText("Cemetery is empty for now.");
      return;
    }

    await adapter.sendText(
      [
        "🪦 <b>Cemetery tasks</b>",
        "",
        ...cemeteryTasks.map((task, index) => `${index + 1}. ${escapeHtml(task.text)}`),
        "",
        "If something still matters, use the restore button.",
      ].join("\n"),
    );

    for (const task of cemeteryTasks) {
      await adapter.sendText(`🪦 <b>${escapeHtml(task.text)}</b>`, {
        reply_markup: adapter.completedTaskKeyboard(task.id),
      });
    }
    return;
  }

  if (route.type === PLANNER_ACTIONS.PANIC) {
    const task =
      resolveMetaTask(plannerData, "suggested_rescue_task_id", ["active"]) ||
      resolveMetaTask(plannerData, "mission_task_id", ["active"]) ||
      pickRescueTask(plannerData.tasks);
    if (!task) {
      await adapter.sendText("There is no active task for rescue mode right now.");
      return;
    }

    await adapter.sendText(buildPanicText(task), {
      reply_markup: adapter.taskKeyboard(task.id),
    });

    const overrideDateKey = getBerlinDateKey();
    const taskId = String(task.id || "");
    await setPlannerContextFromTelegram(userId, {
      task,
      action: "panic",
      angelOverridesPatch: {
        removeDismissedTaskIds: [taskId],
        emergencyTaskId: taskId,
      },
      dateKey: overrideDateKey,
      source: "telegram",
      chatId,
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.PANIC_TASK) {
    const task =
      resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]) ||
      resolveContextTask(plannerData, { statuses: ["active"] }) ||
      pickRescueTask(plannerData.tasks);

    if (!task) {
      await adapter.sendText("There is no active task for rescue mode right now.");
      return;
    }

    await adapter.sendText(buildPanicText(task), {
      reply_markup: adapter.taskKeyboard(task.id),
    });

    const overrideDateKey = getBerlinDateKey();
    const taskId = String(task.id || "");
    await setPlannerContextFromTelegram(userId, {
      task,
      action: "panic",
      angelOverridesPatch: {
        removeDismissedTaskIds: [taskId],
        emergencyTaskId: taskId,
      },
      dateKey: overrideDateKey,
      source: "telegram",
      chatId,
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.SCHEDULE_TASK) {
    const hasConnection = await hasGoogleCalendarConnection(userId);
    if (!hasConnection) {
      const url = buildGoogleCalendarConnectUrl(userId);
      await adapter.sendText(
        "Connect Google Calendar first. Then I can create events there directly from Telegram.",
        {
          reply_markup: adapter.calendarConnectKeyboard(url),
        },
      );
      return;
    }

    if (!route.deadlineAt || !route.startTime) {
      await adapter.sendText("For calendar scheduling I need a date and time. Example: schedule the thesis task tomorrow at 14:00.");
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
      description: "Created from ADHD Planner Telegram bot",
    });

    await adapter.sendText(
      `📅 Added to calendar: <b>${escapeHtml(createdEvent.summary || eventTitle)}</b>\n${escapeHtml(route.deadlineAt)} ${escapeHtml(route.startTime)}`,
    );
    return;
  }

  if (route.type === PLANNER_ACTIONS.DELETE_SUBTASK) {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText(`I could not find an active task: <b>${escapeHtml(route.taskRef || route.taskText || "")}</b>`);
      return;
    }

    const subtask = (Array.isArray(task.subtasks) ? task.subtasks : [])
      .find((item) => {
        if (route.subtaskId && String(item?.id) === String(route.subtaskId)) return true;
        if (
          route.subtaskText &&
          String(item?.text || "").trim().toLowerCase() === String(route.subtaskText || "").trim().toLowerCase()
        ) return true;
        return false;
      });

    if (!subtask) {
      await adapter.sendText(`I could not find that subtask in <b>${escapeHtml(task.text || "task")}</b>.`);
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task, subtask }),
    });

    const updatedTask = commandResult?.task || null;
    const deletedSubtask = commandResult?.deletedSubtask || subtask;
    if (!updatedTask) {
      await adapter.sendText("I could not delete the subtask. Try again.");
      return;
    }

    await adapter.sendText(buildDeleteSubtaskMessage(updatedTask || task, deletedSubtask || subtask), {
      reply_markup: adapter.taskKeyboard(updatedTask.id || task.id),
    });

    await logAction(log, {
      kind: "action",
      action: "delete_subtask",
      chatId: String(chatId),
      taskId: updatedTask.id || task.id,
      taskText: updatedTask.text || task.text,
      subtaskId: deletedSubtask.id || route.subtaskId || subtask.id,
      subtaskText: deletedSubtask.text || subtask.text || "",
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.ADD_SUBTASK) {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText(`I could not find an active task: <b>${escapeHtml(route.taskRef || route.taskText || "")}</b>`);
      return;
    }

    const subtaskText = String(route.subtaskText || route.taskText || "").trim();
    if (!subtaskText) {
      await adapter.sendText("The subtask is empty. Write the step text after “subtask”.");
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task, subtaskText }),
    });
    const updatedTask = commandResult?.task || null;
    const createdSubtask = commandResult?.createdSubtask || null;

    if (!updatedTask) {
      await adapter.sendText("I could not add the subtask. Try again.");
      return;
    }

    if (!createdSubtask) {
      await adapter.sendText(
        `Task <b>${escapeHtml(updatedTask.text || task.text)}</b> already has this subtask, or it is not active.`,
        { reply_markup: adapter.taskKeyboard(updatedTask.id || task.id) },
      );
      return;
    }

    await adapter.sendText(buildAddSubtaskMessage(updatedTask || task, createdSubtask), {
      reply_markup: adapter.taskKeyboard(updatedTask.id),
    });

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

  if (route.type === PLANNER_ACTIONS.EDIT_TASK) {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText(`I could not find an active task: <b>${escapeHtml(route.taskRef || route.taskText || "")}</b>`);
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task }),
    });

    const updatedTask = commandResult?.task || null;
    if (!updatedTask) {
      await adapter.sendText("I could not rename the task. Try again.");
      return;
    }

    await adapter.sendText(
      `✏️ Renamed task: <b>${escapeHtml(updatedTask.text || route.newTaskText || task.text)}</b>`,
      { reply_markup: adapter.taskKeyboard(updatedTask.id || task.id) },
    );
    return;
  }

  if (route.type === PLANNER_ACTIONS.EDIT_SUBTASK) {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText(`I could not find an active task: <b>${escapeHtml(route.taskRef || route.taskText || "")}</b>`);
      return;
    }

    const subtask = (Array.isArray(task.subtasks) ? task.subtasks : [])
      .find((item) => String(item?.id) === String(route.subtaskId || ""));
    if (!subtask) {
      await adapter.sendText(`I could not find that subtask in <b>${escapeHtml(task.text || "task")}</b>.`);
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task }),
    });

    const updatedTask = commandResult?.task || null;
    if (!updatedTask) {
      await adapter.sendText("I could not edit the subtask. Try again.");
      return;
    }

    await adapter.sendText(buildEditSubtaskMessage(updatedTask || task, route.newSubtaskText), {
      reply_markup: adapter.taskKeyboard(updatedTask.id || task.id),
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.REOPEN_TASK) {
    const task = await resolveTaskReferenceIncludingNonActive(
      userId,
      plannerData,
      route.taskRef || route.taskText,
      ["completed", "dead"],
    );
    if (!task) {
      await adapter.sendText("I could not find a task to return to active.");
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task }),
    });
    const reopenedTask = commandResult?.task || null;

    if (!reopenedTask) {
      await adapter.sendText("I could not return the task to active.");
      return;
    }

    await adapter.sendText(
      `↩️ <b>${escapeHtml(reopenedTask.text)}</b> is active again.`,
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

  if (route.type === PLANNER_ACTIONS.COMPLETE_TASK) {
    const explicitTaskRef = getExplicitRouteTaskRef(route);
    const task = explicitTaskRef
      ? await resolveTaskReferenceIncludingNonActive(
        userId,
        plannerData,
        explicitTaskRef,
        ["active", "completed", "dead"],
      )
      : resolveContextTask(plannerData, { statuses: ["active"] });

    if (!task) {
      await adapter.sendText("I could not find the active task to complete.");
      return;
    }

    let overdueCompletionMeta = { bonus: 0, overdueDays: 0, tier: "none" };
    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task }),
    });
    const completedTask = commandResult?.task || null;
    overdueCompletionMeta = commandResult?.overdueCompletionMeta || overdueCompletionMeta;

    if (isNoopCommandResult(commandResult)) {
      await adapter.sendText(getStaleTaskNoopMessage("complete"));
      return;
    }

    if (!completedTask) {
      await adapter.sendText("I could not move this task to completed.");
      return;
    }

    await adapter.sendText(buildCompletedTaskMessage(completedTask, overdueCompletionMeta), {
      reply_markup: adapter.completedTaskKeyboard(completedTask.id),
    });

    await logAction(log, {
      kind: "action",
      action: "complete_task",
      chatId: String(chatId),
      taskId: completedTask.id,
      taskText: completedTask.text,
    });
    return;
  }

  if (RESCUE_ROUTE_TYPES.includes(route.type)) {
    const explicitTaskRef = getExplicitRouteTaskRef(route);
    const task = explicitTaskRef
      ? await resolveTaskReferenceIncludingNonActive(
        userId,
        plannerData,
        explicitTaskRef,
        ["active", "completed", "dead"],
      )
      : resolveContextTask(plannerData, { statuses: ["active"] });

    if (!task) {
      await adapter.sendText("I could not find the active task for rescue.");
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route: { ...route, source: route.source || "rescue" },
      actorType: "angel",
      command: buildPlannerActionRouteCommand({ route, task }),
    });
    const rescueTask = commandResult?.task || null;

    if (isNoopCommandResult(commandResult)) {
      await adapter.sendText(getStaleTaskNoopMessage("rescue"));
      return;
    }

    if (!rescueTask) {
      await adapter.sendText("I could not record this rescue action.");
      return;
    }

    await adapter.sendText(buildRescueActionMessage(route.type, rescueTask, task), {
      reply_markup: route.type === PLANNER_ACTIONS.RESCUE_COMPLETED
        ? adapter.completedTaskKeyboard(rescueTask.id || task.id)
        : adapter.taskKeyboard(rescueTask.id || task.id),
    });

    await logAction(log, {
      kind: "action",
      action: route.type,
      chatId: String(chatId),
      taskId: rescueTask.id || task.id,
      taskText: rescueTask.text || task.text,
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.TOUCH_TASK) {
    const explicitTaskRef = getExplicitRouteTaskRef(route);
    const task = explicitTaskRef
      ? await resolveTaskReferenceIncludingNonActive(
        userId,
        plannerData,
        explicitTaskRef,
        ["active", "completed", "dead"],
      )
      : resolveContextTask(plannerData, { statuses: ["active"] });

    if (!task) {
      await adapter.sendText("I could not find the active task to record movement.");
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route: { ...route, source: "telegram_touch" },
      command: buildPlannerActionRouteCommand({ route, task }),
    });
    const touchedTask = commandResult?.task || null;

    if (isNoopCommandResult(commandResult)) {
      await adapter.sendText(getStaleTaskNoopMessage("touch"));
      return;
    }

    if (!touchedTask) {
      await adapter.sendText("I could not record movement for this task.");
      return;
    }

    await adapter.sendText(buildTouchTaskMessage(touchedTask), {
      reply_markup: adapter.taskKeyboard(touchedTask.id),
    });

    await logAction(log, {
      kind: "action",
      action: "touch_task",
      chatId: String(chatId),
      taskId: touchedTask.id,
      taskText: touchedTask.text,
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.KILL_TASK) {
    const explicitTaskRef = getExplicitRouteTaskRef(route);
    const task = explicitTaskRef
      ? await resolveTaskReferenceIncludingNonActive(
        userId,
        plannerData,
        explicitTaskRef,
        ["active", "completed", "dead"],
      )
      : resolveContextTask(plannerData, { statuses: ["active"] });

    if (!task) {
      await adapter.sendText("I could not find the task to move to Cemetery.");
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route: { ...route, source: "telegram_manual_kill" },
      command: buildPlannerActionRouteCommand({ route, task }),
    });
    const killedTask = commandResult?.task || null;

    if (isNoopCommandResult(commandResult)) {
      await adapter.sendText(getStaleTaskNoopMessage("kill"));
      return;
    }

    if (!killedTask) {
      await adapter.sendText("I could not move the task to Cemetery.");
      return;
    }

    await adapter.sendText(buildKillTaskMessage(killedTask), {
      reply_markup: adapter.completedTaskKeyboard(killedTask.id),
    });

    await logAction(log, {
      kind: "action",
      action: "kill_task",
      chatId: String(chatId),
      taskId: killedTask.id,
      taskText: killedTask.text,
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.REORDER_TASK) {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    const overTask = resolveTaskReference(plannerData, route.overTaskRef, ["active"]);
    if (!task || !overTask) {
      await adapter.sendText("I could not find the active tasks to reorder.");
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task, overTask }),
    });

    if (!commandResult?.task) {
      await adapter.sendText("I could not reorder this task.");
      return;
    }

    await adapter.sendText(buildReorderTaskMessage(commandResult.task || task), {
      reply_markup: adapter.taskKeyboard(commandResult.task.id),
    });

    await logAction(log, {
      kind: "action",
      action: "reorder_task",
      task: { id: commandResult.task.id, text: commandResult.task.text },
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.BULK_MOVE_COMPLETED_TO_CEMETERY) {
    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route }),
    });

    const movedCount = Array.isArray(commandResult?.movedTaskIds)
      ? commandResult.movedTaskIds.length
      : Array.isArray(commandResult?.movedTasks)
        ? commandResult.movedTasks.length
        : 0;

    await adapter.sendText(buildBulkMoveCompletedMessage(movedCount));

    await logAction(log, {
      kind: "action",
      action: "bulk_move_completed_to_cemetery",
      movedCount,
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.DELETE_TASK_FOREVER) {
    const directTaskIds = Array.isArray(route.taskIds) ? route.taskIds.filter(Boolean) : [];
    const task = directTaskIds.length > 0
      ? null
      : await resolveTaskReferenceIncludingNonActive(
        userId,
        plannerData,
        route.taskRef || route.taskText,
        ["active", "completed", "dead"],
      );
    if (directTaskIds.length === 0 && !task) {
      await adapter.sendText("I could not find this task to delete forever.");
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task, directTaskIds }),
    });

    const deletedCount = Array.isArray(commandResult?.deletedTaskIds)
      ? commandResult.deletedTaskIds.length
      : 0;
    await adapter.sendText(buildDeleteForeverMessage(deletedCount));
    await logAction(log, {
      kind: "action",
      action: "delete_task_forever",
      deletedCount,
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.RESTORE_SNAPSHOT) {
    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route }),
    });

    if (!commandResult?.ok) {
      await adapter.sendText("I could not restore this snapshot.");
      return;
    }

    await adapter.sendText(buildRestoreSnapshotMessage(commandResult.restoredCount || 0));
    await logAction(log, {
      kind: "action",
      action: "restore_snapshot",
      snapshotId: route.snapshotId,
      restoredCount: commandResult.restoredCount || 0,
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.CREATE_SNAPSHOT) {
    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route }),
    });

    await logAction(log, {
      kind: "action",
      action: "create_snapshot",
      snapshotId: commandResult?.snapshotId || "",
      taskCount: commandResult?.taskCount || 0,
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.REPAIR_PROTECTED_TASKS) {
    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route: { ...route, source: route.source || "system_repair" },
      actorType: "system",
      command: buildPlannerActionRouteCommand({ route }),
    });

    await logAction(log, {
      kind: "action",
      action: "repair_protected_tasks",
      repairedCount: commandResult?.repairedCount || 0,
    });
    return;
  }

  if (TASK_TUNING_ROUTE_TYPES.includes(route.type)) {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText("I could not find the active task to update.");
      return;
    }

    if (route.type === PLANNER_ACTIONS.SET_TODAY && !task.isToday) {
      const todayTasks = plannerData.tasks.filter((item) => item.status === "active" && item.isToday);
      if (todayTasks.length >= 3) {
        const sortedToday = sortTasksByPriority(todayTasks);
        const recommendedToUnpin = sortedToday[sortedToday.length - 1] || todayTasks[0] || null;

        await setPlannerContextFromTelegram(userId, {
          task: recommendedToUnpin || task,
          action: "today_limit",
          extra: {
            suggestedTaskId: recommendedToUnpin?.id || null,
            candidateTaskIds: todayTasks.map((item) => item.id),
          },
          source: "telegram",
          chatId,
        });

        await adapter.sendText(
          [
            "There are already 3 tasks pinned for today.",
            recommendedToUnpin
              ? `I would unpin first: <b>${escapeHtml(recommendedToUnpin.text)}</b>`
              : "Unpin something extra first.",
            "If you want, write: <b>suggest what to unpin</b>.",
          ].join("\n"),
        );

        if (recommendedToUnpin) {
          await adapter.sendText(`📌 <b>${escapeHtml(recommendedToUnpin.text)}</b>`, {
            reply_markup: adapter.taskKeyboard(recommendedToUnpin.id),
          });
        }
        return;
      }
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task }),
    });
    const updatedTask = commandResult?.task || null;

    if (!updatedTask) {
      await adapter.sendText("I could not update this task.");
      return;
    }

    await adapter.sendText(buildTaskTuningMessage(route.type, updatedTask, route), {
      reply_markup: adapter.taskKeyboard(updatedTask.id),
    });

    await logAction(log, {
      kind: "action",
      action: `${route.type}_from_text`,
      chatId: String(chatId),
      taskId: updatedTask.id,
      taskText: updatedTask.text,
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.SUGGEST_UNPIN) {
    const todayTasks = plannerData.tasks.filter((task) => task.status === "active" && task.isToday);
    if (todayTasks.length === 0) {
      await adapter.sendText("Nothing is pinned for today right now.");
      return;
    }

    const sortedToday = sortTasksByPriority(todayTasks);
    const recommendedToUnpin = sortedToday[sortedToday.length - 1] || todayTasks[0];

    await setPlannerContextFromTelegram(userId, {
      task: recommendedToUnpin,
      action: "suggest_unpin_today",
      extra: {
        suggestedTaskId: recommendedToUnpin.id,
        candidateTaskIds: todayTasks.map((task) => task.id),
      },
      source: "telegram",
      chatId,
    });

    await adapter.sendText(
      [
        `I would unpin: <b>${escapeHtml(recommendedToUnpin.text)}</b>`,
        "Here are the current today tasks. Tap 📌 on the one you want to unpin.",
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

  if (route.type === PLANNER_ACTIONS.ADD_TIME) {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText(`I could not find an active task: <b>${escapeHtml(route.taskRef || route.taskText || "")}</b>`);
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task }),
    });
    const updatedTask = commandResult?.task || null;

    if (!updatedTask) {
      await adapter.sendText("I could not record time for this task.");
      return;
    }

    const minutes = Math.max(1, Math.round(Number(route.elapsedMs || 0) / 60000));
    await adapter.sendText(buildAddTimeMessage(updatedTask || task, minutes), {
      reply_markup: adapter.taskKeyboard(updatedTask.id || task.id),
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.ADD_TASK) {
    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route }),
    });
    const outcome = commandResult?.ok
      ? { type: commandResult.outcome, task: commandResult.task }
      : null;

    const task = outcome?.task;
    if (!task || !outcome?.type) {
      await logAction(log, {
        kind: "error",
        chatId: String(chatId),
        errorMessage: "add_task finished without outcome",
        incomingText: route.rawText || route.taskText,
      });
      await adapter.sendText("I could not save the task. Try again.");
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
      await adapter.sendText(buildAddTaskMessage(task, outcome.type), {
        reply_markup: adapter.taskKeyboard(task.id),
      });
      return;
    }

    await adapter.sendText(buildAddTaskMessage(task, outcome.type), {
      reply_markup: adapter.taskKeyboard(task.id),
    });
    return;
  }

  if (route.type === PLANNER_ACTIONS.TOGGLE_SUBTASK) {
    const task = resolveTaskReference(plannerData, route.taskRef || route.taskText, ["active"]);
    if (!task) {
      await adapter.sendText(`I could not find an active task: <b>${escapeHtml(route.taskRef || route.taskText || "")}</b>`);
      return;
    }

    const subtask = (Array.isArray(task.subtasks) ? task.subtasks : [])
      .find((item) => String(item?.id) === String(route.subtaskId || ""));
    if (!subtask) {
      await adapter.sendText(`I could not find that subtask in <b>${escapeHtml(task.text || "task")}</b>.`);
      return;
    }

    const commandResult = await executePlannerActionCommand({
      userId,
      chatId,
      route,
      command: buildPlannerActionRouteCommand({ route, task }),
    });

    const updatedTask = commandResult?.task || null;
    if (!updatedTask) {
      await adapter.sendText("I could not update the subtask. Try again.");
      return;
    }

    const nextCompleted = Boolean(commandResult?.completed);
    await adapter.sendText(buildToggleSubtaskMessage(updatedTask || task, subtask, nextCompleted), {
      reply_markup: adapter.taskKeyboard(updatedTask.id || task.id),
    });

    await logAction(log, {
      kind: "action",
      action: "toggle_subtask",
      chatId: String(chatId),
      taskId: updatedTask.id || task.id,
      taskText: updatedTask.text || task.text,
      subtaskId: route.subtaskId,
      subtaskText: subtask.text || "",
      completed: nextCompleted,
    });
    return;
  }

  await adapter.sendText("Write it as a task, or send /today or /panic.");
}

module.exports = {
  executePlannerAction,
};
