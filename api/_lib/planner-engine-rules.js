const { getMissionSelection, getTaskHeat } = require("./planner-store");
const {
  shouldExcludeFromAutoCemeteryForStaleness,
  shouldExcludeFromMissionPressure,
} = require("./planner-not-your-move-rules");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TASK_HEAT = 35;
const URGENCY_DECAY_WINDOWS_MS = {
  low: 21 * DAY_MS,
  medium: 14 * DAY_MS,
  high: 10 * DAY_MS,
};

function compactIdPart(value = "") {
  return String(value || "")
    .replace(/[^\w-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140);
}

function getTaskDecayWindowMs(task) {
  return URGENCY_DECAY_WINDOWS_MS[task?.urgency || "medium"] || URGENCY_DECAY_WINDOWS_MS.medium;
}

function calculateTaskHeat(task, now = Date.now()) {
  const heatBase = typeof task?.heatBase === "number" ? task.heatBase : DEFAULT_TASK_HEAT;
  const lastUpdated = typeof task?.lastUpdated === "number" ? task.lastUpdated : now;
  const elapsed = Math.max(0, now - lastUpdated);
  return Math.max(0, heatBase * (1 - elapsed / getTaskDecayWindowMs(task)));
}

function isAutoDeathProtected(task) {
  return Boolean(task?.isToday || task?.isVital || task?.deadlineAt);
}

function getNextStatusPosition(tasks = [], status, fallback = Date.now()) {
  const positions = tasks
    .filter((task) => task?.status === status)
    .map((task) => Number(task.position))
    .filter(Number.isFinite);
  if (positions.length === 0) return fallback;
  return Math.max(...positions) + 1;
}

function buildCounts(tasks = []) {
  const active = tasks.filter((task) => task?.status === "active");
  const completed = tasks.filter((task) => task?.status === "completed");
  const dead = tasks.filter((task) => task?.status === "dead");
  return {
    active: active.length,
    focus: active.filter((task) => getTaskHeat(task) > 60).length,
    background: active.filter((task) => getTaskHeat(task) > 25 && getTaskHeat(task) <= 60).length,
    purgatory: active.filter((task) => getTaskHeat(task) <= 25).length,
    today: active.filter((task) => task?.isToday).length,
    danger: active.filter((task) => getTaskHeat(task) <= 25).length,
    completed: completed.length,
    cemetery: dead.length,
  };
}

function getAtRiskTasks(tasks = []) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task?.status === "active")
    .filter((task) => !shouldExcludeFromAutoCemeteryForStaleness(task))
    .filter((task) => getTaskHeat(task) <= 25)
    .sort((left, right) => getTaskHeat(left) - getTaskHeat(right));
}

function pickSuggestedRescueTask(activeTasks = [], missionTask = null) {
  const candidates = activeTasks
    .filter((task) => task?.status === "active")
    .filter((task) => !shouldExcludeFromMissionPressure(task));
  if (candidates.length === 0) return { task: null, reason: "empty" };

  const cold = [...candidates]
    .filter((task) => getTaskHeat(task) <= 35)
    .sort((left, right) => getTaskHeat(left) - getTaskHeat(right));
  if (cold[0]) return { task: cold[0], reason: "cold_task" };

  if (missionTask) return { task: missionTask, reason: "mission" };

  const selection = getMissionSelection(candidates);
  return { task: selection.task || candidates[0], reason: selection.reason || "auto_priority" };
}

function buildPlannerReasonExplanation(reason = "", task = null, kind = "mission") {
  const value = String(reason || "").trim();
  const openSteps = Array.isArray(task?.subtasks)
    ? task.subtasks.filter((subtask) => !subtask?.completed).length
    : 0;
  const suffix = openSteps > 0
    ? ` Open steps: ${openSteps}.`
    : "";

  if (value === "hard_deadline") {
    return `The deadline is driving this choice.${suffix}`;
  }
  if (value === "today_shortlist") {
    return `You pinned this for today, so I am keeping it visible.${suffix}`;
  }
  if (value === "angel_pinned") {
    return `Angel marked this as important for today.${suffix}`;
  }
  if (value === "critical_priority") {
    return `This is marked critical, so it should not sink into the list.${suffix}`;
  }
  if (value === "auto_priority") {
    return `This has the strongest mix of deadline, priority, resistance, and momentum.${suffix}`;
  }
  if (value === "cold_task") {
    return `This task is going cold. A tiny move now can keep it alive.${suffix}`;
  }
  if (value === "mission") {
    return `This follows the current day mission.${suffix}`;
  }
  if (value === "empty") {
    return kind === "rescue"
      ? "There is no rescue target because there are no active tasks."
      : "There is no mission because there are no active tasks.";
  }
  return `I picked this from the current planner state.${suffix}`;
}

function buildPlannerReasonLine(reason = "", task = null, kind = "mission") {
  const explanation = buildPlannerReasonExplanation(reason, task, kind);
  if (!task) return explanation;
  return `Why this now: ${explanation}`;
}

module.exports = {
  DEFAULT_TASK_HEAT,
  URGENCY_DECAY_WINDOWS_MS,
  buildCounts,
  buildPlannerReasonExplanation,
  buildPlannerReasonLine,
  calculateTaskHeat,
  compactIdPart,
  getAtRiskTasks,
  getNextStatusPosition,
  getTaskDecayWindowMs,
  isAutoDeathProtected,
  pickSuggestedRescueTask,
};
