const { PLANNER_EVENT_TYPES } = require("./planner-event-types");
const { getMissionSelection } = require("./planner-store");
const { pickSuggestedRescueTask } = require("./planner-engine-rules");
const { getBerlinParts } = require("./planner-nudge-schedule");
const { shouldExcludeFromMissionPressure } = require("./planner-not-your-move-rules");
const { validatePlannerDeadline } = require("./planner-deadline");

const DAILY_DECISION_OVERRIDE_RULES = Object.freeze({
  HARD_DEADLINE_NEW: "hard_deadline_new",
  MISSION_TASK_GONE: "mission_task_gone",
  MANUAL_DISMISSAL: "manual_dismissal",
  EMERGENCY_MODE: "emergency_mode",
});

function normalizeDecision(decision = null) {
  if (!decision || typeof decision !== "object") return null;
  return {
    dateKey: String(decision.dateKey || ""),
    missionTaskId: String(decision.missionTaskId || ""),
    missionReason: String(decision.missionReason || "empty"),
    rescueTaskId: String(decision.rescueTaskId || ""),
    decidedAt: Number(decision.decidedAt || 0),
    source: String(decision.source || "new"),
  };
}

function compactDecision(decision = null) {
  const normalized = normalizeDecision(decision);
  if (!normalized) return null;
  return {
    dateKey: normalized.dateKey,
    missionTaskId: normalized.missionTaskId || null,
    missionReason: normalized.missionReason || "empty",
    rescueTaskId: normalized.rescueTaskId || null,
    decidedAt: normalized.decidedAt || 0,
    source: normalized.source || "new",
  };
}

function taskId(task = {}) {
  return String(task?.id || "");
}

function isActiveMissionCandidate(task = {}, now = Date.now()) {
  return task?.status === "active" && !shouldExcludeFromMissionPressure(task, now);
}

function compareIsoDate(left = "", right = "") {
  const leftDate = String(left || "");
  const rightDate = String(right || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leftDate) || !/^\d{4}-\d{2}-\d{2}$/.test(rightDate)) return null;
  return leftDate.localeCompare(rightDate);
}

function hasHardDeadlineTodayOrOverdue(task = {}, dateKey = "") {
  if (task?.status !== "active") return false;
  if (shouldExcludeFromMissionPressure(task)) return false;
  const validation = validatePlannerDeadline(task?.deadlineAt || "", { allowEmpty: true });
  if (!validation.ok || !validation.deadlineAt) return false;
  const comparison = compareIsoDate(validation.deadlineAt, dateKey);
  return comparison !== null && comparison <= 0;
}

function hasHardDeadlineOutsideStoredDecision(tasks = [], storedDecision = null, dateKey = "") {
  const storedIds = new Set([
    String(storedDecision?.missionTaskId || ""),
    String(storedDecision?.rescueTaskId || ""),
  ].filter(Boolean));
  return (Array.isArray(tasks) ? tasks : []).some((task) => (
    hasHardDeadlineTodayOrOverdue(task, dateKey) && !storedIds.has(taskId(task))
  ));
}

function findActiveTaskById(tasks = [], id = "", now = Date.now()) {
  const normalizedId = String(id || "");
  if (!normalizedId) return null;
  return (Array.isArray(tasks) ? tasks : []).find((task) => (
    taskId(task) === normalizedId && isActiveMissionCandidate(task, now)
  )) || null;
}

function buildNewDecision(tasks = [], now = Date.now(), source = "new") {
  const dateKey = getBerlinParts(now).dateKey;
  const activeTasks = (Array.isArray(tasks) ? tasks : []).filter((task) => task?.status === "active");
  const mission = getMissionSelection(activeTasks);
  const rescue = pickSuggestedRescueTask(activeTasks, mission.task);
  return {
    dateKey,
    missionTaskId: mission.task?.id ? String(mission.task.id) : "",
    missionReason: String(mission.reason || "empty"),
    rescueTaskId: rescue.task?.id ? String(rescue.task.id) : "",
    decidedAt: now,
    source,
  };
}

function selectDailyDecision({ tasks = [], existingDecision = null, now = Date.now() } = {}) {
  const dateKey = getBerlinParts(now).dateKey;
  const storedDecision = normalizeDecision(existingDecision);

  if (!storedDecision || storedDecision.dateKey !== dateKey) {
    return buildNewDecision(tasks, now, "new");
  }

  const storedMissionTask = findActiveTaskById(tasks, storedDecision.missionTaskId, now);
  if (!storedMissionTask) {
    return buildNewDecision(tasks, now, `override:${DAILY_DECISION_OVERRIDE_RULES.MISSION_TASK_GONE}`);
  }

  if (hasHardDeadlineOutsideStoredDecision(tasks, storedDecision, dateKey)) {
    return buildNewDecision(tasks, now, `override:${DAILY_DECISION_OVERRIDE_RULES.HARD_DEADLINE_NEW}`);
  }

  return {
    dateKey: storedDecision.dateKey,
    missionTaskId: storedDecision.missionTaskId,
    missionReason: storedDecision.missionReason || "empty",
    rescueTaskId: storedDecision.rescueTaskId,
    decidedAt: storedDecision.decidedAt || now,
    source: "reused",
  };
}

function getDailyDecisionRule(source = "") {
  const normalized = String(source || "");
  if (!normalized.startsWith("override:")) return normalized || "new";
  return normalized.slice("override:".length) || "override";
}

function buildDailyDecisionChangedEventSpec({
  previousDecision = null,
  nextDecision = null,
  missionTask = null,
  now = Date.now(),
} = {}) {
  const next = compactDecision(nextDecision);
  if (!next) return null;
  const previous = compactDecision(previousDecision);
  const rule = getDailyDecisionRule(next.source);
  const dateKey = next.dateKey || getBerlinParts(now).dateKey;
  const missionTaskId = next.missionTaskId || null;
  return {
    id: `engine_daily_decision_${dateKey}_${rule}_${missionTaskId || "none"}`,
    event_type: PLANNER_EVENT_TYPES.ENGINE_DAILY_DECISION_CHANGED,
    type: "engine_daily_decision_changed",
    actor_type: "engine",
    actor_ref: "angel",
    source: "daily_decision",
    entity_type: missionTaskId ? "task" : "planner",
    entity_id: missionTaskId || "daily_decision",
    taskId: missionTaskId,
    taskText: missionTask?.text || "",
    message: missionTaskId
      ? `Planner daily decision selected “${missionTask?.text || "task"}”.`
      : "Planner daily decision has no active mission.",
    visible_in_report: false,
    payload: {
      rule,
      source: next.source || "new",
      previous,
      next,
    },
    createdAt: now,
  };
}

module.exports = {
  DAILY_DECISION_OVERRIDE_RULES,
  buildDailyDecisionChangedEventSpec,
  getDailyDecisionRule,
  hasHardDeadlineOutsideStoredDecision,
  selectDailyDecision,
};
