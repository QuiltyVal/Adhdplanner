const { getDb, admin } = require("./firebase-admin");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TASK_HEAT = 35;

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
    name: data.name || "",
    email: data.email || "",
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    score: typeof data.score === "number" ? data.score : 0,
    telegramChatId: data.telegramChatId || null,
    telegramLinkedAt: data.telegramLinkedAt || null,
    id: userId,
  };
}

function getTaskHeat(task) {
  return typeof task?.heatCurrent === "number" ? task.heatCurrent : task?.heatBase || 0;
}

function parseDeadline(deadlineAt) {
  if (!deadlineAt) return null;
  const deadline = new Date(`${deadlineAt}T23:59:59`);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

function getDeadlineInfo(task) {
  const deadline = parseDeadline(task?.deadlineAt);
  if (!deadline) return null;

  const msLeft = deadline.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / DAY_MS);
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
    return `⛔ "${task.text}" уже просрочена. Возвращайся к ней сейчас.${openSubtask ? ` Начни с: ${openSubtask.text}.` : ""}`;
  }

  if (deadlineInfo?.tone === "today") {
    return `📅 Сегодня дедлайн по "${task.text}".${openSubtask ? ` Первый шаг: ${openSubtask.text}.` : ""}`;
  }

  if (deadlineInfo?.tone === "soon") {
    return `⚠️ Срок по "${task.text}" уже рядом.${openSubtask ? ` Первый шаг: ${openSubtask.text}.` : ""}`;
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

async function mutatePlanner(userId, mutator) {
  const ref = userDoc(userId);
  return getDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = ensurePlannerDoc(snapshot.data(), userId);
    const next = await mutator(current);
    transaction.set(ref, next, { merge: true });
    return next;
  });
}

async function linkTelegramChat(userId, chatId) {
  return mutatePlanner(userId, (current) => ({
    ...current,
    telegramChatId: String(chatId),
    telegramLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
  }));
}

module.exports = {
  DEFAULT_TASK_HEAT,
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
};
