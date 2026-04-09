const { randomUUID } = require("node:crypto");
const { getDb, admin } = require("./firebase-admin");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TASK_HEAT = 35;
const BERLIN_DATE_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function userDoc(userId) {
  return getDb().collection("Users").doc(userId);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensurePlannerDoc(data = {}, userId) {
  return {
    ...data,
    name: data.name || "",
    email: data.email || "",
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    score: typeof data.score === "number" ? data.score : 0,
    telegramChatId: data.telegramChatId || null,
    telegramLinkedAt: data.telegramLinkedAt || null,
    telegramContext: data.telegramContext && typeof data.telegramContext === "object"
      ? {
          lastTaskId: data.telegramContext.lastTaskId || null,
          lastTaskText: data.telegramContext.lastTaskText || "",
          lastAction: data.telegramContext.lastAction || "",
          updatedAt: typeof data.telegramContext.updatedAt === "number" ? data.telegramContext.updatedAt : 0,
        }
      : {
          lastTaskId: null,
          lastTaskText: "",
          lastAction: "",
          updatedAt: 0,
        },
    id: userId,
  };
}

function normalizeSubtaskForFingerprint(subtask = {}) {
  return {
    id: String(subtask.id || ""),
    text: String(subtask.text || "").trim(),
    completed: Boolean(subtask.completed),
  };
}

function normalizeTaskForFingerprint(task = {}) {
  return {
    id: String(task.id || ""),
    text: String(task.text || "").trim(),
    status: String(task.status || "active"),
    urgency: String(task.urgency || "medium"),
    resistance: String(task.resistance || "medium"),
    isToday: Boolean(task.isToday),
    isVital: Boolean(task.isVital),
    deadlineAt: String(task.deadlineAt || ""),
    source: String(task.source || ""),
    subtasks: Array.isArray(task.subtasks)
      ? task.subtasks.map(normalizeSubtaskForFingerprint)
      : [],
  };
}

function buildPlannerFingerprint(data = {}) {
  const safe = ensurePlannerDoc(data, data.id || "");
  return JSON.stringify({
    score: typeof safe.score === "number" ? safe.score : 0,
    tasks: Array.isArray(safe.tasks) ? safe.tasks.map(normalizeTaskForFingerprint) : [],
  });
}

function hasMeaningfulPlannerState(data = {}) {
  const safe = ensurePlannerDoc(data, data.id || "");
  return (Array.isArray(safe.tasks) && safe.tasks.length > 0) || Number(safe.score || 0) !== 0;
}

function getTaskHeat(task) {
  return typeof task?.heatCurrent === "number" ? task.heatCurrent : task?.heatBase || 0;
}

function getDayNumberFromIsoDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function getBerlinIsoDate(now = new Date()) {
  return BERLIN_DATE_FORMAT.format(now);
}

function parseDeadline(deadlineAt) {
  if (!deadlineAt || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineAt)) return null;
  const [year, month, day] = deadlineAt.split("-").map(Number);
  const deadline = new Date(year, month - 1, day);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

function getDeadlineInfo(task) {
  const deadline = parseDeadline(task?.deadlineAt);
  if (!deadline) return null;

  const deadlineDayNumber = getDayNumberFromIsoDate(task?.deadlineAt);
  const todayDayNumber = getDayNumberFromIsoDate(getBerlinIsoDate());
  if (deadlineDayNumber === null || todayDayNumber === null) return null;
  const daysLeft = deadlineDayNumber - todayDayNumber;
  const shortDate = deadline.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });

  if (daysLeft < 0) {
    return {
      daysLeft,
      tone: "overdue",
      label: `Просрочено · ${shortDate}`,
      priorityScore: 400,
    };
  }

  if (daysLeft === 0) {
    return {
      daysLeft,
      tone: "today",
      label: `Сегодня · ${shortDate}`,
      priorityScore: 350,
    };
  }

  if (daysLeft === 1) {
    return {
      daysLeft,
      tone: "soon",
      label: `Завтра · ${shortDate}`,
      priorityScore: 300,
    };
  }

  if (daysLeft <= 3) {
    return {
      daysLeft,
      tone: "soon",
      label: `${daysLeft} дн. · ${shortDate}`,
      priorityScore: 250,
    };
  }

  if (daysLeft <= 7) {
    return {
      daysLeft,
      tone: "watch",
      label: `${daysLeft} дн. · ${shortDate}`,
      priorityScore: 200,
    };
  }

  if (daysLeft <= 14) {
    return {
      daysLeft,
      tone: "watch",
      label: `${daysLeft} дн. · ${shortDate}`,
      priorityScore: 120,
    };
  }

  return {
    daysLeft,
    tone: "calm",
    label: `До ${shortDate}`,
    priorityScore: 40,
  };
}

function getPriorityScore(task) {
  const deadlineScore = getDeadlineInfo(task)?.priorityScore || 0;
  const vitalScore = task?.isVital ? 160 : 0;
  const urgencyScore = task?.urgency === "high" ? 90 : task?.urgency === "medium" ? 45 : 0;
  const resistanceScore =
    task?.resistance === "high" ? 55 : task?.resistance === "medium" ? 25 : 0;
  const todayScore = task?.isToday ? 40 : 0;
  const heatScore = Math.max(0, 100 - getTaskHeat(task)) * 0.35;
  const staleScore = Math.min(40, Math.max(0, (Date.now() - (task?.lastUpdated || Date.now())) / DAY_MS) * 4);

  return vitalScore + deadlineScore + urgencyScore + resistanceScore + todayScore + heatScore + staleScore;
}

function sortTasksByPriority(tasks = []) {
  return [...tasks].sort((left, right) => {
    const priorityDelta = getPriorityScore(right) - getPriorityScore(left);
    if (priorityDelta !== 0) return priorityDelta;

    const leftDeadline = parseDeadline(left.deadlineAt)?.getTime() || Number.MAX_SAFE_INTEGER;
    const rightDeadline = parseDeadline(right.deadlineAt)?.getTime() || Number.MAX_SAFE_INTEGER;
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;

    const heatDelta = getTaskHeat(left) - getTaskHeat(right);
    if (heatDelta !== 0) return heatDelta;

    return (left.lastUpdated || 0) - (right.lastUpdated || 0);
  });
}

function pickRescueTask(tasks = []) {
  const activeTasks = tasks.filter((task) => task.status === "active");
  return sortTasksByPriority(activeTasks)[0] || null;
}

function getFirstOpenSubtask(task) {
  return (task?.subtasks || []).find((subtask) => !subtask.completed) || null;
}

function buildTelegramTaskLine(task) {
  const deadlineInfo = getDeadlineInfo(task);
  const bits = [];

  if (task.isVital) bits.push("🚨 критично");
  if (task.isToday) bits.push("📌 сегодня");
  if (deadlineInfo) bits.push(`📅 ${deadlineInfo.label}`);
  if (task.urgency === "high") bits.push("⏰ срочно");
  if (task.resistance === "high") bits.push("🧠 страшно");

  const openSubtasks = (task.subtasks || []).filter((subtask) => !subtask.completed).length;
  if (openSubtasks > 0) bits.push(`шагов: ${openSubtasks}`);

  return `• ${escapeHtml(task.text)}${bits.length ? `\n  ${bits.join(" · ")}` : ""}`;
}

function buildNudgeMessage(task) {
  if (!task) {
    return "Planner снова здесь. Открой его и выбери одну задачу.";
  }

  const deadlineInfo = getDeadlineInfo(task);
  const heat = Math.floor(getTaskHeat(task));
  const openSubtask = getFirstOpenSubtask(task);

  if (deadlineInfo?.tone === "overdue") {
    return `⛔ "${task.text}" уже просрочена (${deadlineInfo.label}). Возвращайся к ней сейчас.${openSubtask ? ` Начни с: ${openSubtask.text}.` : ""}`;
  }

  if (deadlineInfo?.tone === "today") {
    return `📅 Сегодня дедлайн по "${task.text}" (${deadlineInfo.label}).${openSubtask ? ` Первый шаг: ${openSubtask.text}.` : ""}`;
  }

  if (deadlineInfo?.tone === "soon") {
    return `⚠️ Срок по "${task.text}" уже рядом: ${deadlineInfo.label}.${openSubtask ? ` Первый шаг: ${openSubtask.text}.` : ""}`;
  }

  if (heat <= 15) {
    return `💀 "${task.text}" почти умерла. Сделай один шаг и верни ей пульс.`;
  }

  if (heat <= 35) {
    return `🧯 "${task.text}" опасно остыла. Одного касания уже хватит, чтобы спасти.`;
  }

  return `🎯 "${task.text}" сейчас главная. Вернись и сдвинь её.`;
}

function createTask(text, options = {}) {
  const now = Date.now();
  return {
    id: `${now}`,
    text,
    lastUpdated: now,
    heatBase: DEFAULT_TASK_HEAT,
    heatCurrent: DEFAULT_TASK_HEAT,
    status: "active",
    subtasks: [],
    urgency: options.urgency || "medium",
    resistance: options.resistance || "medium",
    isToday: Boolean(options.isToday),
    isVital: Boolean(options.isVital),
    deadlineAt: options.deadlineAt || "",
    source: options.source || "telegram",
  };
}

async function getPlannerData(userId) {
  const snapshot = await userDoc(userId).get();
  return ensurePlannerDoc(snapshot.data(), userId);
}

function buildTelegramContext(task, action = "focus") {
  return {
    lastTaskId: task?.id || null,
    lastTaskText: task?.text || "",
    lastAction: action,
    updatedAt: Date.now(),
  };
}

async function mutatePlanner(userId, mutator, options = {}) {
  const ref = userDoc(userId);
  return getDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = ensurePlannerDoc(snapshot.data(), userId);
    const next = await mutator(current);
    const nextSafe = ensurePlannerDoc(next, userId);
    const currentFingerprint = buildPlannerFingerprint(current);
    const nextFingerprint = buildPlannerFingerprint(nextSafe);

    if (currentFingerprint !== nextFingerprint && hasMeaningfulPlannerState(current)) {
      const snapshotRef = ref.collection("taskSnapshots").doc();
      transaction.set(snapshotRef, {
        source: options.source || "server",
        kind: "pre_mutation",
        reason: options.reason || "mutation",
        userId,
        taskCount: current.tasks.length,
        score: current.score,
        fingerprint: currentFingerprint,
        capturedAt: Date.now(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        tasks: current.tasks,
      });
    }
    transaction.set(ref, nextSafe, { merge: true });
    return nextSafe;
  });
}

async function linkTelegramChat(userId, chatId) {
  return mutatePlanner(userId, (current) => ({
    ...current,
    telegramChatId: String(chatId),
    telegramLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
  }), {
    source: "telegram",
    reason: "link_telegram_chat",
  });
}

async function writeTelegramLog(userId, payload = {}) {
  const logRef = userDoc(userId).collection("telegramLogs").doc();
  await logRef.set({
    id: logRef.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    capturedAt: Date.now(),
    ...payload,
  });
}

module.exports = {
  DEFAULT_TASK_HEAT,
  buildTelegramContext,
  buildNudgeMessage,
  buildTelegramTaskLine,
  createTask,
  escapeHtml,
  getDeadlineInfo,
  getFirstOpenSubtask,
  getPlannerData,
  getPriorityScore,
  getTaskHeat,
  linkTelegramChat,
  mutatePlanner,
  pickRescueTask,
  sortTasksByPriority,
  writeTelegramLog,
};
