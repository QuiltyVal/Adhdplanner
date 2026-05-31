const {
  NOT_YOUR_MOVE_STATUS,
  isTaskNotYourMove,
} = require("./planner-angel-engagement-contract");

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNotYourMoveMetadata(task = {}) {
  const blocked = task?.blocked && typeof task.blocked === "object" ? task.blocked : {};
  const legacy = task?.notYourMove && typeof task.notYourMove === "object" ? task.notYourMove : {};
  const metadata = {
    ...legacy,
    ...blocked,
  };
  return String(metadata.status || "").toLowerCase() === NOT_YOUR_MOVE_STATUS ? metadata : null;
}

function getNotYourMoveCheckInAt(task = {}) {
  const metadata = getNotYourMoveMetadata(task);
  return toMillis(metadata?.nextCheckInAt || metadata?.next_check_in_at);
}

function isNotYourMoveCheckInDue(task = {}, now = Date.now()) {
  const checkInAt = getNotYourMoveCheckInAt(task);
  return checkInAt > 0 && checkInAt <= Number(now || Date.now());
}

function shouldSuppressTaskExecutionPressure(task = {}, now = Date.now()) {
  if (!isTaskNotYourMove(task)) return false;
  return !isNotYourMoveCheckInDue(task, now);
}

function shouldExcludeFromMissionPressure(task = {}, now = Date.now()) {
  return isTaskNotYourMove(task);
}

function shouldExcludeFromAutoCemeteryForStaleness(task = {}) {
  return isTaskNotYourMove(task);
}

function getAllowedNotYourMoveActions(task = {}, now = Date.now()) {
  if (!isTaskNotYourMove(task)) return [];
  const due = isNotYourMoveCheckInDue(task, now);
  return [
    due ? "check_status" : "keep_waiting",
    "write_followup",
    "save_evidence",
    "set_checkin",
    "clear_not_your_move",
  ];
}

function getForbiddenNotYourMoveNudges(task = {}) {
  if (!isTaskNotYourMove(task)) return [];
  return [
    "finish_today",
    "do_main_task_now",
    "auto_cemetery_for_staleness",
    "shame_for_no_progress",
  ];
}

module.exports = {
  getAllowedNotYourMoveActions,
  getForbiddenNotYourMoveNudges,
  getNotYourMoveCheckInAt,
  getNotYourMoveMetadata,
  isNotYourMoveCheckInDue,
  shouldExcludeFromAutoCemeteryForStaleness,
  shouldExcludeFromMissionPressure,
  shouldSuppressTaskExecutionPressure,
};
