const { PLANNER_EVENT_TYPES } = require("./planner-event-types");
const { escapeHtml } = require("./planner-store");
const {
  buildPlannerReportItem,
  writePlannerReportItemTransaction,
} = require("./planner-report-projector");

function writeCommandReportItem(transaction, userRef, event = {}, item = {}) {
  if (!transaction || !userRef || !event?.id) return null;
  const createdAt = Number(event.createdAt || item.createdAt || Date.now());
  const id = String(item.id || `report_${event.id}`);
  const report = buildPlannerReportItem({
    id,
    createdAt,
    userId: userRef.id,
    kind: String(item.kind || "command_summary"),
    sourceEventId: String(event.id || ""),
    sourceType: "planner_command",
    projector: "planner-command-service",
    sourceEventType: String(event.event_type || event.eventType || event.type || ""),
    title: String(item.title || event.message || "Planner update"),
    body: String(item.body || event.message || ""),
    persona: String(item.persona || "neutral"),
    surface: String(item.surface || "history"),
    messageKey: String(item.message_key || item.messageKey || ""),
    params: item.params && typeof item.params === "object" ? item.params : {},
    seenAt: createdAt,
    severity: Number.isFinite(Number(item.severity)) ? Number(item.severity) : 1,
  });
  return writePlannerReportItemTransaction(transaction, userRef, report, { merge: true });
}

function buildSingleTaskCommandReportSpec({ eventType = "", task = {}, actorType = "user", extra = {} } = {}) {
  const title = String(task?.text || "task");
  const quotedTitle = `“${escapeHtml(title)}”`;
  const normalizedEventType = String(eventType || "").toUpperCase();
  const normalizedActorType = String(actorType || "user").toLowerCase();
  const isUserAuthored = normalizedActorType === "user";
  const taskActionPersona = isUserAuthored ? "user" : "angel";

  if (normalizedEventType === PLANNER_EVENT_TYPES.TASK_CREATED) {
    return {
      persona: taskActionPersona,
      title: isUserAuthored ? "Task created" : "Angel captured a task",
      body: isUserAuthored
        ? `You created ${quotedTitle}.`
        : `I captured ${quotedTitle} as an active task.`,
      message_key: isUserAuthored ? "user_task_created" : "angel_task_created",
      params: { taskText: title },
      severity: 1,
    };
  }

  if (normalizedEventType === PLANNER_EVENT_TYPES.TASK_TOUCHED || normalizedEventType === PLANNER_EVENT_TYPES.RESCUE_SHIFT_RECORDED) {
    return {
      persona: taskActionPersona,
      title: isUserAuthored ? "Movement recorded" : "Angel counted movement",
      body: isUserAuthored
        ? `You recorded movement on ${quotedTitle}.`
        : `Movement recorded on ${quotedTitle}. One tiny shift counts.`,
      message_key: isUserAuthored ? "user_task_moved" : "angel_task_moved",
      params: { taskText: title },
      severity: 1,
    };
  }

  if (normalizedEventType === PLANNER_EVENT_TYPES.RESCUE_CLOSED_LATER || normalizedEventType === PLANNER_EVENT_TYPES.RESCUE_ABORTED) {
    const closedLater = normalizedEventType === PLANNER_EVENT_TYPES.RESCUE_CLOSED_LATER;
    return {
      persona: "angel",
      title: closedLater ? "Rescue paused" : "Rescue exited",
      body: closedLater
        ? `You paused rescue for ${quotedTitle}. I will treat that as a signal, not a failure.`
        : `You exited rescue for ${quotedTitle}. I will not count that as done; it just means this entry point may need to be gentler.`,
      message_key: closedLater ? "angel_rescue_closed_later" : "angel_rescue_aborted",
      params: { taskText: title },
      severity: 1,
    };
  }

  if (normalizedEventType === PLANNER_EVENT_TYPES.TASK_COMPLETED || normalizedEventType === PLANNER_EVENT_TYPES.RESCUE_COMPLETED) {
    const rewardBonus = Number(extra?.rewardBonus || extra?.overdueCompletionMeta?.bonus || 0);
    return {
      persona: rewardBonus > 0 ? "angel" : taskActionPersona,
      title: rewardBonus > 0 ? "Angel fanfare" : "Angel counted the win",
      body: rewardBonus > 0
        ? `You finished ${quotedTitle} after it was overdue. I counted the win and added +${rewardBonus} extra points.`
        : `You finished ${quotedTitle}. I counted it, no extra drama required.`,
      message_key: rewardBonus > 0 ? "angel_overdue_completed" : isUserAuthored ? "user_task_completed" : "angel_task_completed",
      params: { taskText: title, bonus: rewardBonus },
      severity: rewardBonus > 0 ? 2 : 1,
    };
  }

  if (normalizedEventType === PLANNER_EVENT_TYPES.TASK_REOPENED) {
    return {
      persona: taskActionPersona,
      title: isUserAuthored ? "Task restored" : "Angel restored a task",
      body: isUserAuthored
        ? `You returned ${quotedTitle} to the active list.`
        : `${quotedTitle} is back in the active list. Second chances are allowed here.`,
      message_key: isUserAuthored ? "user_task_reopened" : "angel_task_reopened",
      params: { taskText: title },
      severity: 1,
    };
  }

  if (normalizedEventType === PLANNER_EVENT_TYPES.TASK_MOVED_TO_CEMETERY) {
    return {
      persona: normalizedActorType === "engine" ? "devil" : isUserAuthored ? "user" : "neutral",
      title: normalizedActorType === "engine" ? "Devil moved a cold task" : "Moved to Cemetery",
      body: normalizedActorType === "engine"
        ? `I moved ${quotedTitle} to Cemetery so it stops poisoning the active list.`
        : isUserAuthored
          ? `You moved ${quotedTitle} to Cemetery.`
          : `${quotedTitle} left the active list. You can restore it from Cemetery if needed.`,
      message_key: normalizedActorType === "engine" ? "devil_task_moved_cemetery" : isUserAuthored ? "user_task_moved_cemetery" : "neutral_task_moved_cemetery",
      params: { taskText: title },
      severity: normalizedActorType === "engine" ? 2 : 1,
    };
  }

  if (normalizedEventType === PLANNER_EVENT_TYPES.TASK_MARKED_NOT_YOUR_MOVE) {
    return {
      persona: "angel",
      title: "Not your move",
      body: `${quotedTitle} is waiting on someone or something outside you. I will hold the context without pushing you to finish it today.`,
      message_key: "angel_task_not_your_move",
      params: { taskText: title },
      severity: 1,
    };
  }

  if (normalizedEventType === PLANNER_EVENT_TYPES.TASK_CLEARED_NOT_YOUR_MOVE) {
    return {
      persona: taskActionPersona,
      title: isUserAuthored ? "Back in your hands" : "Task is active again",
      body: isUserAuthored
        ? `You returned ${quotedTitle} from Not your move.`
        : `${quotedTitle} is no longer waiting on an external dependency.`,
      message_key: isUserAuthored ? "user_task_cleared_not_your_move" : "angel_task_cleared_not_your_move",
      params: { taskText: title },
      severity: 1,
    };
  }

  if (normalizedEventType === PLANNER_EVENT_TYPES.TASK_CHECKIN_SET) {
    return {
      persona: "angel",
      title: "Check-in saved",
      body: `I saved a gentle check-in for ${quotedTitle}. This is not pressure to finish; it is context held for later.`,
      message_key: "angel_task_checkin_set",
      params: { taskText: title },
      severity: 1,
    };
  }

  return null;
}

function buildBulkCompletedToCemeteryReportSpec({ movedCount = 0 } = {}) {
  const count = Number(movedCount || 0);
  return {
    persona: "neutral",
    title: "Heaven cleanup",
    body: `Moved ${count} completed task(s) from Heaven to Cemetery. Finished things still counted; now the list is lighter.`,
    message_key: "neutral_heaven_cleanup",
    params: { count },
    severity: count >= 5 ? 2 : 1,
  };
}

function buildSnapshotRestoredReportSpec({ restoredCount = 0 } = {}) {
  const count = Number(restoredCount || 0);
  return {
    persona: "neutral",
    title: "Snapshot restored",
    body: `Restored ${count} task(s) from snapshot. The planner state rolled back to a saved point.`,
    message_key: "neutral_snapshot_restored",
    params: { count },
    severity: 2,
  };
}

function buildProtectedTasksRepairedReportSpec({ repairedTasks = [] } = {}) {
  const normalizedRepairedTasks = Array.isArray(repairedTasks) ? repairedTasks : [];
  const firstTask = normalizedRepairedTasks[0] || {};
  return {
    persona: "angel",
    title: "Protected task repaired",
    body: normalizedRepairedTasks.length === 1
      ? `I returned “${escapeHtml(firstTask.text || "task")}” to active because protected tasks should not silently disappear.`
      : `I returned ${normalizedRepairedTasks.length} protected task(s) to active because protected tasks should not silently disappear.`,
    message_key: "angel_protected_task_repaired",
    params: {
      count: normalizedRepairedTasks.length,
      taskText: String(firstTask?.text || ""),
    },
    severity: 2,
  };
}

module.exports = {
  buildBulkCompletedToCemeteryReportSpec,
  buildProtectedTasksRepairedReportSpec,
  buildSingleTaskCommandReportSpec,
  buildSnapshotRestoredReportSpec,
  writeCommandReportItem,
};
