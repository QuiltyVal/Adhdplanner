const { PLANNER_ACTIONS } = require("./planner-action-types");
const { escapeHtml } = require("./planner-store");

function buildRescueActionMessage(routeType = "", task = {}, fallbackTask = {}) {
  const taskText = escapeHtml(task?.text || fallbackTask?.text || "task");
  const messages = {
    [PLANNER_ACTIONS.RESCUE_ABORTED]: `🪽 Rescue exited: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.RESCUE_CLOSED_LATER]: `🪽 Rescue paused: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.RESCUE_STARTED]: `🪽 Rescue started: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.RESCUE_SHIFT_RECORDED]: `👀 Rescue shift recorded: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.RESCUE_COMPLETED]: `☁️ Rescue completed: <b>${taskText}</b>`,
  };
  return messages[routeType] || `🪽 Rescue updated: <b>${taskText}</b>`;
}

function buildTaskTuningMessage(routeType = "", task = {}, route = {}) {
  const taskText = escapeHtml(task?.text || "task");
  const messages = {
    [PLANNER_ACTIONS.SET_TODAY]: `📌 Pinned for today: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.UNSET_TODAY]: `📌 Unpinned from today: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.SET_VITAL]: `🚨 Marked as critical: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.UNSET_VITAL]: `⚪ Removed critical priority: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.SET_URGENCY]: `⏰ Urgency set to <b>${escapeHtml(route.urgency)}</b>: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.SET_RESISTANCE]: `🧠 Resistance set to <b>${escapeHtml(route.resistance)}</b>: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.SET_DEADLINE]: route.deadlineAt
      ? `📅 Deadline set to <b>${escapeHtml(route.deadlineAt)}</b>: <b>${taskText}</b>`
      : `📅 Deadline cleared: <b>${taskText}</b>`,
    [PLANNER_ACTIONS.SET_HEAT_ZONE]: `🧭 Zone set to <b>${escapeHtml(route.heatZone || "zone")}</b>: <b>${taskText}</b>`,
  };
  return messages[routeType] || `Updated: <b>${taskText}</b>`;
}

function buildCompletedTaskMessage(task = {}, overdueCompletionMeta = {}) {
  const taskText = escapeHtml(task?.text || "task");
  const bonus = Number(overdueCompletionMeta?.bonus || 0);
  const overdueDays = Number(overdueCompletionMeta?.overdueDays || 0);
  const tier = String(overdueCompletionMeta?.tier || "none");
  const isHeroicOverdueCompletion = tier === "heroic" || tier === "legendary";
  const repeatedMessage = isHeroicOverdueCompletion
    ? `\n\n🎺 You completed a task that was overdue for ${overdueDays} days. Angel is celebrating, and even Devil admits the win. Bonus: +${bonus} support points.`
    : bonus > 0
      ? `\n\n☁️ You completed this after the deadline anyway. That still counts. Bonus: +${bonus} support points.`
      : "";

  return `☁️ <b>${taskText}</b> is now completed. If this was a mistake, restore it with the button below.${repeatedMessage}`;
}

function buildTouchTaskMessage(task = {}) {
  return `👀 Movement recorded: <b>${escapeHtml(task?.text || "task")}</b>. One shift counts.`;
}

function buildKillTaskMessage(task = {}) {
  return `🪦 <b>${escapeHtml(task?.text || "task")}</b> moved to Cemetery. If this was a mistake, you can restore it.`;
}

function buildDeleteForeverMessage(deletedCount = 0) {
  return Number(deletedCount || 0) > 0
    ? `🕳️ Deleted forever: ${Number(deletedCount || 0)} task(s).`
    : "Nothing was deleted.";
}

function buildAddTaskMeta(task = {}) {
  const meta = [];
  if (task?.deadlineAt) meta.push(`📅 due ${escapeHtml(task.deadlineAt)}`);
  if (task?.isToday) meta.push("📌 today");
  if (task?.isVital) meta.push("🚨 critical");
  if (task?.urgency === "high") meta.push("⏰ urgent");
  if (task?.subtasks?.length) meta.push(`🪜 steps: ${task.subtasks.length}`);
  return meta;
}

function buildAddTaskMessage(task = {}, outcomeType = "") {
  const taskText = escapeHtml(task?.text || "task");
  const meta = buildAddTaskMeta(task);
  const headline = outcomeType === "updated"
    ? `🧩 This active task already existed. I updated it: <b>${taskText}</b>`
    : `➕ Added task: <b>${taskText}</b>`;
  return [
    headline,
    meta.length ? meta.join(" · ") : "",
  ].filter(Boolean).join("\n");
}

function buildDeleteSubtaskMessage(task = {}, subtask = {}) {
  return `🗑️ Deleted subtask <b>${escapeHtml(subtask?.text || "step")}</b> from <b>${escapeHtml(task?.text || "task")}</b>.`;
}

function buildAddSubtaskMessage(task = {}, subtask = {}) {
  return `🪜 Added subtask <b>${escapeHtml(subtask?.text || "step")}</b> to <b>${escapeHtml(task?.text || "task")}</b>.`;
}

function buildEditSubtaskMessage(task = {}, newSubtaskText = "") {
  return `✏️ Edited step in <b>${escapeHtml(task?.text || "task")}</b>: ${escapeHtml(newSubtaskText || "step")}`;
}

function buildToggleSubtaskMessage(task = {}, subtask = {}, completed = false) {
  const taskText = escapeHtml(task?.text || "task");
  const subtaskText = escapeHtml(subtask?.text || "step");
  return completed
    ? `✅ Marked step done in <b>${taskText}</b>: ${subtaskText}`
    : `↩️ Reopened step in <b>${taskText}</b>: ${subtaskText}`;
}

function buildReorderTaskMessage(task = {}) {
  return `↕️ Reordered: <b>${escapeHtml(task?.text || "task")}</b>`;
}

function buildBulkMoveCompletedMessage(movedCount = 0) {
  return Number(movedCount || 0) > 0
    ? `🪦 Moved ${Number(movedCount || 0)} completed task(s) to Cemetery.`
    : "Nothing to clean in Heaven.";
}

function buildRestoreSnapshotMessage(restoredCount = 0) {
  return `↩️ Restored ${Number(restoredCount || 0)} task(s) from snapshot.`;
}

function buildAddTimeMessage(task = {}, minutes = 0) {
  return `⏱️ Recorded ${Number(minutes || 0)} min on <b>${escapeHtml(task?.text || "task")}</b>.`;
}

module.exports = {
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
};
