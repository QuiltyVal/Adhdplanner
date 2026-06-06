const { PLANNER_COMMAND_TYPES } = require("./planner-command-types");
const { PLANNER_EVENT_TYPES } = require("./planner-event-types");
const { getPlannerEventActor } = require("./planner-event-contract");
const { escapeHtml } = require("./planner-store");
const { admin } = require("./firebase-admin");

function buildPlannerCommandEvent({ eventId, commandType, outcome, task, actor, source, now }) {
  const actorType = String(actor?.type || "user");
  const actorRef = String(actor?.ref || source || "unknown");
  const eventType = outcome === "created" ? PLANNER_EVENT_TYPES.TASK_CREATED : PLANNER_EVENT_TYPES.TASK_UPDATED;
  return {
    id: eventId,
    type: outcome === "created" ? "task_created" : "task_updated",
    event_type: eventType,
    actor: getPlannerEventActor({ actorType, actorRef, source, eventType }),
    actor_type: actorType,
    actor_ref: actorRef,
    source: String(source || actorRef || "command_service"),
    entity_type: "task",
    entity_id: String(task.id),
    taskId: String(task.id),
    taskText: String(task.text || ""),
    command_type: commandType,
    message: outcome === "created"
      ? `Created task “${escapeHtml(task.text || "task")}”.`
      : `Updated existing task “${escapeHtml(task.text || "task")}”.`,
    visible_in_feed: true,
    visible_in_report: false,
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildSingleTaskMutationCommandEvent({
  eventId,
  eventName,
  eventType,
  commandType,
  task,
  previousTask = null,
  actor,
  source,
  extra = {},
  scoreDelta = 0,
  now,
} = {}) {
  const actorType = String(actor?.type || "user");
  const actorRef = String(actor?.ref || source || "unknown");
  const taskText = String(task?.text || "task");
  const escapedTask = escapeHtml(taskText);
  const message =
    eventType === PLANNER_EVENT_TYPES.TASK_COMPLETED
      ? `Completed “${escapedTask}”.`
      : eventType === PLANNER_EVENT_TYPES.TASK_MOVED_TO_CEMETERY
        ? `Moved “${escapedTask}” to Cemetery.`
        : eventType === PLANNER_EVENT_TYPES.RESCUE_CLOSED_LATER
          ? `Rescue paused for “${escapedTask}”.`
          : eventType === PLANNER_EVENT_TYPES.RESCUE_ABORTED
            ? `Rescue exited for “${escapedTask}”.`
        : eventType === PLANNER_EVENT_TYPES.TASK_MARKED_NOT_YOUR_MOVE
          ? `Marked “${escapedTask}” as Not your move.`
          : eventType === PLANNER_EVENT_TYPES.TASK_CLEARED_NOT_YOUR_MOVE
            ? `Returned “${escapedTask}” from Not your move.`
            : eventType === PLANNER_EVENT_TYPES.TASK_CHECKIN_SET
              ? `Set check-in for “${escapedTask}”.`
              : eventType === PLANNER_EVENT_TYPES.TASK_REOPENED
                ? `Returned “${escapedTask}” to active.`
                : eventType === PLANNER_EVENT_TYPES.TASK_TOUCHED
                  ? `Recorded movement on “${escapedTask}”.`
                  : eventType === PLANNER_EVENT_TYPES.RESCUE_STARTED
                    ? `Started rescue for “${escapedTask}”.`
                    : eventType === PLANNER_EVENT_TYPES.RESCUE_SHIFT_RECORDED
                      ? `Rescue shift recorded for “${escapedTask}”.`
                      : eventType === PLANNER_EVENT_TYPES.RESCUE_COMPLETED
                        ? `Completed “${escapedTask}” from rescue.`
                        : eventType === PLANNER_EVENT_TYPES.TASK_TIME_ADDED
                          ? `Recorded time on “${escapedTask}”.`
                          : eventType === PLANNER_EVENT_TYPES.TASK_SUBTASK_ADDED
                            ? `Added a step to “${escapedTask}”.`
                            : eventType === PLANNER_EVENT_TYPES.TASK_SUBTASK_EDITED
                              ? `Edited a step in “${escapedTask}”.`
                              : eventType === PLANNER_COMMAND_TYPES.TASK_SUBTASK_TOGGLED
                                ? `Updated a step in “${escapedTask}”.`
                                : eventType === PLANNER_EVENT_TYPES.TASK_SUBTASK_DELETED
                                  ? `Deleted a step from “${escapedTask}”.`
                                  : eventType === PLANNER_EVENT_TYPES.TASK_TITLE_CHANGED
                                    ? `Renamed task to “${escapedTask}”.`
                                    : eventType === PLANNER_EVENT_TYPES.TASK_PINNED_TODAY
                                      ? `Pinned “${escapedTask}” for today.`
                                      : eventType === PLANNER_EVENT_TYPES.TASK_UNPINNED_TODAY
                                        ? `Unpinned “${escapedTask}” from today.`
                                        : eventType === PLANNER_EVENT_TYPES.TASK_MARKED_VITAL
                                          ? `Marked “${escapedTask}” as critical.`
                                          : eventType === PLANNER_EVENT_TYPES.TASK_UNMARKED_VITAL
                                            ? `Removed critical mark from “${escapedTask}”.`
                                            : eventType === PLANNER_EVENT_TYPES.TASK_URGENCY_SET
                                              ? `Changed urgency for “${escapedTask}”.`
                                              : eventType === PLANNER_EVENT_TYPES.TASK_RESISTANCE_SET
                                                ? `Changed resistance for “${escapedTask}”.`
                                                : eventType === PLANNER_EVENT_TYPES.TASK_DEADLINE_SET
                                                  ? `Set deadline for “${escapedTask}”.`
                                                  : eventType === PLANNER_EVENT_TYPES.TASK_DEADLINE_CLEARED
                                                    ? `Cleared deadline for “${escapedTask}”.`
                                                    : eventType === PLANNER_EVENT_TYPES.TASK_HEAT_ZONE_SET
                                                      ? `Moved “${escapedTask}” to ${escapeHtml(extra.heatZone || "zone")}.`
                                                      : `Updated “${escapedTask}”.`;

  const statusChanged =
    previousTask &&
    String(previousTask.status || "") !== String(task?.status || "");
  const payload = {
    ...(statusChanged
      ? {
          previousStatus: String(previousTask.status || ""),
          nextStatus: String(task?.status || ""),
        }
      : {}),
    ...(Number(scoreDelta || 0) !== 0 ? { scoreDelta: Number(scoreDelta || 0) } : {}),
    ...(extra && typeof extra === "object" && Object.keys(extra).length > 0 ? { extra } : {}),
  };

  return {
    id: eventId,
    type: eventName,
    event_type: eventType,
    actor: getPlannerEventActor({ actorType, actorRef, source, eventType }),
    actor_type: actorType,
    actor_ref: actorRef,
    source,
    entity_type: "task",
    entity_id: String(task.id),
    taskId: String(task.id),
    taskText,
    command_type: commandType,
    message,
    ...(Object.keys(payload).length > 0 ? { payload } : {}),
    visible_in_feed: true,
    visible_in_report: false,
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildExtractionHintsAppliedCommandEvent({
  eventId,
  commandType,
  task,
  taskId = "",
  actor,
  source,
  changedFields = [],
  now,
} = {}) {
  const actorType = String(actor?.type || "engine");
  const actorRef = String(actor?.ref || source || "capture_extractor");
  const normalizedTaskId = String(task?.id || taskId);
  return {
    id: eventId,
    type: "task_extraction_hints_applied",
    event_type: PLANNER_EVENT_TYPES.TASK_EXTRACTION_HINTS_APPLIED,
    actor: getPlannerEventActor({ actorType, actorRef, source, eventType: PLANNER_EVENT_TYPES.TASK_EXTRACTION_HINTS_APPLIED }),
    actor_type: actorType,
    actor_ref: actorRef,
    source,
    entity_type: "task",
    entity_id: normalizedTaskId,
    taskId: normalizedTaskId,
    taskText: String(task?.text || ""),
    command_type: commandType,
    message: `Updated task hints for “${escapeHtml(task?.text || "task")}”.`,
    payload: {
      changedFields,
    },
    visible_in_feed: false,
    visible_in_report: false,
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildTaskReorderedCommandEvent({
  eventId,
  task,
  taskId = "",
  overTaskId = "",
  changedTaskIds = [],
  actor,
  source,
  now,
} = {}) {
  const actorType = String(actor?.type || "user");
  const actorRef = String(actor?.ref || source || "unknown");
  const normalizedTaskId = String(task?.id || taskId);
  return {
    id: eventId,
    type: "task_reordered",
    event_type: PLANNER_EVENT_TYPES.TASK_REORDERED,
    actor: getPlannerEventActor({ actorType, actorRef, source, eventType: PLANNER_EVENT_TYPES.TASK_REORDERED }),
    actor_type: actorType,
    actor_ref: actorRef,
    source,
    entity_type: "task",
    entity_id: normalizedTaskId,
    taskId: normalizedTaskId,
    taskText: String(task?.text || ""),
    command_type: PLANNER_COMMAND_TYPES.TASK_REORDER,
    message: `Reordered “${escapeHtml(task?.text || "task")}”.`,
    visible_in_feed: true,
    visible_in_report: false,
    payload: {
      overTaskId: String(overTaskId),
      changedTaskIds: Array.isArray(changedTaskIds) ? changedTaskIds.map((id) => String(id)) : [],
    },
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildBulkCompletedMovedToCemeteryCommandEvent({
  eventId,
  movedTasks = [],
  protectedCount = 0,
  actor,
  source,
  now,
} = {}) {
  const actorType = String(actor?.type || "user");
  const actorRef = String(actor?.ref || source || "unknown");
  const normalizedMovedTasks = Array.isArray(movedTasks) ? movedTasks : [];
  return {
    id: eventId,
    type: "bulk_completed_moved_to_cemetery",
    event_type: PLANNER_EVENT_TYPES.BULK_COMPLETED_MOVED_TO_CEMETERY,
    actor: getPlannerEventActor({ actorType, actorRef, source, eventType: PLANNER_EVENT_TYPES.BULK_COMPLETED_MOVED_TO_CEMETERY }),
    actor_type: actorType,
    actor_ref: actorRef,
    source,
    entity_type: "task_collection",
    entity_id: "completed",
    taskId: "",
    taskText: "",
    command_type: PLANNER_COMMAND_TYPES.BULK_MOVE_COMPLETED_TO_CEMETERY,
    message: `Moved ${normalizedMovedTasks.length} completed task(s) to Cemetery.`,
    visible_in_feed: true,
    visible_in_report: true,
    payload: {
      movedTaskIds: normalizedMovedTasks.map((task) => String(task.id)),
      movedTaskTexts: normalizedMovedTasks.map((task) => String(task.text || "")).filter(Boolean).slice(0, 20),
      movedCount: normalizedMovedTasks.length,
      protectedCount,
    },
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildSnapshotRestoredCommandEvent({
  eventId,
  snapshotId = "",
  restoredTasks = [],
  currentTasks = [],
  snapshotData = {},
  actor,
  source,
  now,
} = {}) {
  const actorType = String(actor?.type || "user");
  const actorRef = String(actor?.ref || source || "unknown");
  const normalizedRestoredTasks = Array.isArray(restoredTasks) ? restoredTasks : [];
  const normalizedCurrentTasks = Array.isArray(currentTasks) ? currentTasks : [];
  const restoredTaskIds = new Set(normalizedRestoredTasks.map((task) => String(task.id)));
  return {
    id: eventId,
    type: "snapshot_restored",
    event_type: PLANNER_EVENT_TYPES.SNAPSHOT_RESTORED,
    actor: getPlannerEventActor({ actorType, actorRef, source, eventType: PLANNER_EVENT_TYPES.SNAPSHOT_RESTORED }),
    actor_type: actorType,
    actor_ref: actorRef,
    source,
    entity_type: "snapshot",
    entity_id: String(snapshotId),
    taskId: "",
    taskText: "",
    command_type: PLANNER_COMMAND_TYPES.RESTORE_SNAPSHOT,
    message: `Restored ${normalizedRestoredTasks.length} task(s) from snapshot.`,
    visible_in_feed: true,
    visible_in_report: true,
    payload: {
      snapshotId: String(snapshotId),
      restoredTaskIds: normalizedRestoredTasks.map((task) => String(task.id)),
      restoredTaskTexts: normalizedRestoredTasks.map((task) => String(task.text || "")).filter(Boolean).slice(0, 20),
      restoredCount: normalizedRestoredTasks.length,
      deletedTaskIds: normalizedCurrentTasks
        .map((task) => String(task?.id || ""))
        .filter((taskId) => taskId && !restoredTaskIds.has(taskId)),
      snapshotCapturedAt: snapshotData?.capturedAt || null,
      snapshotSource: snapshotData?.source || "",
    },
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildSnapshotCreatedCommandEvent({
  eventId,
  snapshotId = "",
  snapshotSource = "",
  taskCount = 0,
  reason = "",
  actor,
  source,
  now,
} = {}) {
  const actorType = String(actor?.type || "user");
  const actorRef = String(actor?.ref || source || "unknown");
  const normalizedTaskCount = Number(taskCount || 0);
  return {
    id: eventId,
    type: "snapshot_created",
    event_type: PLANNER_EVENT_TYPES.SNAPSHOT_CREATED,
    actor: getPlannerEventActor({ actorType, actorRef, source, eventType: PLANNER_EVENT_TYPES.SNAPSHOT_CREATED }),
    actor_type: actorType,
    actor_ref: actorRef,
    source,
    entity_type: "snapshot",
    entity_id: String(snapshotId),
    taskId: "",
    taskText: "",
    command_type: PLANNER_COMMAND_TYPES.CREATE_SNAPSHOT,
    message: `Created snapshot with ${normalizedTaskCount} task(s).`,
    visible_in_feed: true,
    visible_in_report: false,
    payload: {
      snapshotId: String(snapshotId),
      snapshotSource,
      taskCount: normalizedTaskCount,
      reason,
    },
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildProtectedTasksRepairedCommandEvent({
  eventId,
  repairedTasks = [],
  reason = "",
  actor,
  source,
  now,
} = {}) {
  const actorType = String(actor?.type || "system");
  const actorRef = String(actor?.ref || source || "unknown");
  const normalizedRepairedTasks = Array.isArray(repairedTasks) ? repairedTasks : [];
  const firstTask = normalizedRepairedTasks[0] || {};
  return {
    id: eventId,
    type: "protected_tasks_repaired",
    event_type: PLANNER_EVENT_TYPES.PROTECTED_TASKS_REPAIRED,
    actor: getPlannerEventActor({ actorType, actorRef, source, eventType: PLANNER_EVENT_TYPES.PROTECTED_TASKS_REPAIRED }),
    actor_type: actorType,
    actor_ref: actorRef,
    source,
    entity_type: "task_collection",
    entity_id: "protected_tasks",
    taskId: normalizedRepairedTasks.length === 1 ? String(firstTask.id) : "",
    taskText: normalizedRepairedTasks.length === 1 ? String(firstTask.text || "") : "",
    command_type: PLANNER_COMMAND_TYPES.REPAIR_PROTECTED_TASKS,
    message: normalizedRepairedTasks.length === 1
      ? `Repaired protected task “${escapeHtml(firstTask.text || "task")}”.`
      : `Repaired ${normalizedRepairedTasks.length} protected task(s).`,
    visible_in_feed: true,
    visible_in_report: true,
    payload: {
      repairedTaskIds: normalizedRepairedTasks.map((task) => String(task.id)),
      repairedTaskTexts: normalizedRepairedTasks.map((task) => String(task.text || "")).filter(Boolean).slice(0, 20),
      repairedCount: normalizedRepairedTasks.length,
      reason: String(reason || "protected_dead_without_deadAt"),
    },
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildTaskDeletedForeverCommandEvent({
  eventId,
  deletedTasks = [],
  scoreDelta = 0,
  actor,
  source,
  now,
} = {}) {
  const actorType = String(actor?.type || "user");
  const actorRef = String(actor?.ref || source || "unknown");
  const normalizedDeletedTasks = Array.isArray(deletedTasks) ? deletedTasks : [];
  const firstTask = normalizedDeletedTasks[0] || {};
  return {
    id: eventId,
    type: "task_deleted_forever",
    event_type: PLANNER_EVENT_TYPES.TASK_DELETED_FOREVER,
    actor: getPlannerEventActor({ actorType, actorRef, source, eventType: PLANNER_EVENT_TYPES.TASK_DELETED_FOREVER }),
    actor_type: actorType,
    actor_ref: actorRef,
    source,
    entity_type: normalizedDeletedTasks.length === 1 ? "task" : "task_collection",
    entity_id: normalizedDeletedTasks.length === 1 ? String(firstTask.id) : "tasks",
    taskId: normalizedDeletedTasks.length === 1 ? String(firstTask.id) : "",
    taskText: normalizedDeletedTasks.length === 1 ? String(firstTask.text || "") : "",
    command_type: PLANNER_COMMAND_TYPES.TASK_DELETE_FOREVER,
    message: normalizedDeletedTasks.length === 1
      ? `Deleted “${escapeHtml(firstTask.text || "task")}” forever.`
      : `Deleted ${normalizedDeletedTasks.length} task(s) forever.`,
    visible_in_feed: true,
    visible_in_report: true,
    payload: {
      deletedTaskIds: normalizedDeletedTasks.map((task) => String(task.id)),
      deletedTaskTexts: normalizedDeletedTasks.map((task) => String(task.text || "")).filter(Boolean).slice(0, 20),
      deletedCount: normalizedDeletedTasks.length,
      scoreDelta,
    },
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

module.exports = {
  buildBulkCompletedMovedToCemeteryCommandEvent,
  buildExtractionHintsAppliedCommandEvent,
  buildPlannerCommandEvent,
  buildProtectedTasksRepairedCommandEvent,
  buildSnapshotCreatedCommandEvent,
  buildSnapshotRestoredCommandEvent,
  buildSingleTaskMutationCommandEvent,
  buildTaskDeletedForeverCommandEvent,
  buildTaskReorderedCommandEvent,
};
