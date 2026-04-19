const { getDb } = require("./firebase-admin");
const { sortTasksByPriority } = require("./planner-store");

const BERLIN_DATE_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getBerlinDateKey(now = new Date()) {
  return BERLIN_DATE_FORMAT.format(now);
}

function angelDecisionsCol(userId) {
  return getDb().collection("Users").doc(userId).collection("angelDecisions");
}

function pickAngelReason(task = {}, index = 0) {
  if (task.isToday) return "Из твоего ручного списка на сегодня.";
  if (task.deadlineAt) return "Есть дедлайн, важно не просрочить.";
  if (task.isVital) return "Это критичная задача.";
  if (task.urgency === "high") return "Высокая срочность.";
  if (task.resistance === "high") return "Высокое сопротивление, лучше сдвинуть сейчас.";
  return index === 0 ? "Лучший фокус на сейчас." : "Важная задача в фоне.";
}

function pickAngelScore(task = {}, index = 0) {
  let score = index === 0 ? 100 : 86;
  if (task.isVital) score += 8;
  if (task.deadlineAt) score += 6;
  if (task.urgency === "high") score += 5;
  return Math.min(120, score);
}

function pickDecisionCandidates(tasks = [], maxPrimary = 2) {
  const active = (Array.isArray(tasks) ? tasks : []).filter((task) => task?.status === "active");
  if (!active.length) return [];

  const today = sortTasksByPriority(active.filter((task) => task?.isToday));
  const rest = sortTasksByPriority(active.filter((task) => !task?.isToday));
  const ordered = today.length > 0 ? [...today, ...rest] : sortTasksByPriority(active);

  const selected = [];
  const seen = new Set();
  for (const task of ordered) {
    const taskId = String(task?.id || "").trim();
    if (!taskId || seen.has(taskId)) continue;
    seen.add(taskId);
    selected.push(task);
    if (selected.length >= maxPrimary) break;
  }

  return selected;
}

function normalizeExistingDecision(existing = null, taskById = new Map(), maxPrimary = 2) {
  if (!existing || typeof existing !== "object") return null;
  const items = Array.isArray(existing.items) ? existing.items : [];
  if (!items.length) return null;

  const normalized = [];
  const seen = new Set();
  for (const item of items) {
    const taskId = String(item?.taskId || item?.id || "").trim();
    if (!taskId || seen.has(taskId)) continue;
    const task = taskById.get(taskId);
    if (!task || task.status !== "active") continue;
    seen.add(taskId);
    normalized.push({
      taskId,
      text: String(task.text || ""),
      angelReason: String(item?.angelReason || item?.reason || "").trim() || pickAngelReason(task, normalized.length),
      angelScore: Number.isFinite(Number(item?.angelScore))
        ? Number(item.angelScore)
        : pickAngelScore(task, normalized.length),
    });
    if (normalized.length >= maxPrimary) break;
  }

  if (!normalized.length) return null;
  return normalized;
}

async function resolveDailyAngelDecision(userId, tasks = [], options = {}) {
  const dateKey = String(options.dateKey || getBerlinDateKey());
  const maxPrimary = Math.max(1, Math.min(3, Number(options.maxPrimary) || 2));
  const source = String(options.source || "system");
  const taskById = new Map(
    (Array.isArray(tasks) ? tasks : [])
      .map((task) => [String(task?.id || "").trim(), task]),
  );

  const decisionRef = angelDecisionsCol(userId).doc(dateKey);
  let existing = null;
  try {
    const snap = await decisionRef.get();
    existing = snap.exists ? (snap.data() || null) : null;
  } catch (_error) {
    existing = null;
  }

  const reusedItems = normalizeExistingDecision(existing, taskById, maxPrimary);
  if (reusedItems) {
    return {
      dateKey,
      reused: true,
      source,
      items: reusedItems,
      selectedTaskIds: reusedItems.map((item) => item.taskId),
    };
  }

  const picked = pickDecisionCandidates(tasks, maxPrimary);
  const items = picked.map((task, index) => ({
    taskId: String(task.id),
    text: String(task.text || ""),
    angelReason: pickAngelReason(task, index),
    angelScore: pickAngelScore(task, index),
  }));

  const docPayload = {
    dateKey,
    source,
    decidedAt: Date.now(),
    items,
    selectedTaskIds: items.map((item) => item.taskId),
    version: 1,
  };

  try {
    await decisionRef.set(docPayload, { merge: true });
  } catch (_error) {
    // best-effort persistence; caller still gets computed decision
  }

  return {
    dateKey,
    reused: false,
    source,
    items,
    selectedTaskIds: items.map((item) => item.taskId),
  };
}

module.exports = {
  getBerlinDateKey,
  resolveDailyAngelDecision,
};

