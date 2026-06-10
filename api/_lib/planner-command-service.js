const { createHash } = require("node:crypto");
const { admin, getDb } = require("./firebase-admin");
const { PLANNER_COMMAND_TYPES } = require("./planner-command-types");
const { PLANNER_EVENT_TYPES } = require("./planner-event-types");
const { isTaskStatusTransitionAllowed } = require("./planner-status-transition-rules");
const {
  buildTelegramContext,
  createTask,
  getDeadlineInfo,
  getNonActiveTasks,
  getPlannerData,
} = require("./planner-store");
const {
  assertValidPlannerDeadline,
  buildInvalidPlannerDeadlineWarning,
  normalizePlannerDeadlineForStorage,
  validatePlannerDeadline,
} = require("./planner-deadline");
const {
  buildBulkCompletedToCemeteryReportSpec,
  buildProtectedTasksRepairedReportSpec,
  buildSingleTaskCommandReportSpec,
  buildSnapshotRestoredReportSpec,
  writeCommandReportItem,
} = require("./planner-command-report-specs");
const {
  buildPlannerCommandRecord,
  reusePlannerCommand,
  writePlannerCommandRecord,
} = require("./planner-command-records");
const {
  normalizeNotYourMoveMetadata,
} = require("./planner-angel-engagement-contract");
const { getTelegramChatHash } = require("./telegram-chat-identity");
const {
  buildBulkCompletedMovedToCemeteryCommandEvent,
  buildExtractionHintsAppliedCommandEvent,
  buildPlannerCommandEvent,
  buildProtectedTasksRepairedCommandEvent,
  buildSnapshotCreatedCommandEvent,
  buildSnapshotRestoredCommandEvent,
  buildSingleTaskMutationCommandEvent,
  buildTaskDeletedForeverCommandEvent,
  buildTaskReorderedCommandEvent,
} = require("./planner-command-event-specs");

const TASK_TITLE_INDEX_COLLECTION = "taskTitleIndex";
const PLANNER_COMMAND_COLLECTION = "plannerCommands";
const OVERDUE_COMPLETION_REWARD_TIERS = [
  { days: 7, bonus: 10, tier: "legendary" },
  { days: 3, bonus: 6, tier: "heroic" },
  { days: 1, bonus: 3, tier: "late" },
];
const TOUCH_HEAT_BONUS = 12;
const SUBTASK_COMPLETION_CAP = 18;
const URGENCY_VALUES = new Set(["low", "medium", "high"]);
const RESISTANCE_VALUES = new Set(["low", "medium", "high"]);
const HEAT_ZONE_VALUES = new Set(["focus", "background", "purgatory"]);
const HEAT_ZONE_VALUES_BY_ZONE = {
  focus: 80,
  background: 40,
  purgatory: 10,
};

function isAutoDeathProtectedTask(task = {}) {
  return Boolean(task?.isToday || task?.isVital || task?.deadlineAt);
}

function shouldRepairProtectedDeadTask(task = {}) {
  return task?.status === "dead" && !task?.deadAt && isAutoDeathProtectedTask(task);
}

function normalizeCommandTaskTitle(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(мне|надо|нужно|хочу|задача|задачу|пожалуйста|please|task|todo)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableDocId(value = "") {
  return createHash("sha1").update(String(value || "")).digest("hex");
}

function normalizeIdempotencyKey(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return stableDocId(raw).slice(0, 40);
}

function isTelegramUnreachableOutboxItem(data = {}) {
  if (String(data.channel || "").toLowerCase() !== "telegram") return false;
  const diagnostic = data.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic : {};
  const code = String(
    diagnostic.code ||
    data.errorCode ||
    data.error_code ||
    data.payload?.errorCode ||
    data.payload?.error_code ||
    "",
  ).toLowerCase();
  const message = String(
    diagnostic.message ||
    data.last_error ||
    data.lastError ||
    data.payload?.error ||
    "",
  ).toLowerCase();
  return code === "telegram_chat_unreachable" ||
    message.includes("chat not found") ||
    message.includes("bot was blocked") ||
    message.includes("forbidden");
}

async function recoverTelegramOutboxAfterRelink({ userRef, chatId, now = Date.now(), limitPerStatus = 50 } = {}) {
  if (!userRef || !chatId) {
    return { resolvedUnreachable: 0, retargetedPending: 0, checked: 0 };
  }

  const statuses = ["retry", "dead", "pending"];
  let batch = getDb().batch();
  let writes = 0;
  let checked = 0;
  let resolvedUnreachable = 0;
  let retargetedPending = 0;

  async function flush() {
    if (!writes) return;
    await batch.commit();
    batch = getDb().batch();
    writes = 0;
  }

  for (const status of statuses) {
    const snap = await userRef.collection("outbox")
      .where("status", "==", status)
      .limit(limitPerStatus)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (String(data.channel || "").toLowerCase() !== "telegram") continue;
      checked += 1;

      const payload = data.payload && typeof data.payload === "object" ? data.payload : {};
      const previousChatId = String(payload.chatId || payload.chat_id || "");

      if ((status === "retry" || status === "dead") && isTelegramUnreachableOutboxItem(data)) {
        batch.set(doc.ref, {
          status: "sent",
          sentAt: now,
          sent_at: now,
          availableAt: null,
          available_at: null,
          resolvedAt: now,
          resolved_at: now,
          delivery: {
            skipped: true,
            reason: "telegram_relinked_after_unreachable",
            previousStatus: status,
            previousChatId,
            chatId: String(chatId),
            relinkedAt: now,
          },
        }, { merge: true });
        writes += 1;
        resolvedUnreachable += 1;
      } else if (status === "pending" && previousChatId && previousChatId !== String(chatId)) {
        batch.set(doc.ref, {
          payload: {
            ...payload,
            chatId: String(chatId),
          },
          retargetedAt: now,
          retargeted_at: now,
          retargetedReason: "telegram_relinked",
          retargeted_reason: "telegram_relinked",
        }, { merge: true });
        writes += 1;
        retargetedPending += 1;
      }

      if (writes >= 450) await flush();
    }
  }

  await flush();
  return { resolvedUnreachable, retargetedPending, checked };
}

function normalizeSubtaskText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSubtasks(value = []) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => normalizeSubtaskText(typeof item === "string" ? item : item?.text))
      .filter(Boolean),
  )].slice(0, 12);
}

function normalizeCommitmentIds(value = []) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  )].slice(0, 10);
}

function stripCommandTaskState(task) {
  if (!task || typeof task !== "object") return task;
  const { __baseLastUpdated, __pendingSyncAt, ...cleanTask } = task;
  return cleanTask;
}

function stripCommandTaskStateList(tasks = []) {
  return (Array.isArray(tasks) ? tasks : [])
    .map((task) => stripCommandTaskState(task))
    .filter((task) => task && typeof task === "object" && task.id);
}

function normalizeCommandCheckInAt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function getCommandNotYourMoveMetadata(command = {}, existingTask = {}, now = Date.now()) {
  const current = existingTask?.blocked && typeof existingTask.blocked === "object"
    ? existingTask.blocked
    : existingTask?.notYourMove && typeof existingTask.notYourMove === "object"
      ? existingTask.notYourMove
      : {};
  return normalizeNotYourMoveMetadata({
    ...current,
    reason: command.reason || current.reason,
    waitingFor: command.waitingFor || current.waitingFor,
    lastUserAction: command.lastUserAction || current.lastUserAction,
    nextCheckInAt: normalizeCommandCheckInAt(command.nextCheckInAt) || current.nextCheckInAt || null,
  }, now);
}

function isSameNotYourMoveMetadata(left = {}, right = {}) {
  return String(left?.status || "") === String(right?.status || "") &&
    String(left?.reason || "") === String(right?.reason || "") &&
    String(left?.waitingFor || "") === String(right?.waitingFor || "") &&
    String(left?.lastUserAction || "") === String(right?.lastUserAction || "") &&
    Number(left?.nextCheckInAt || 0) === Number(right?.nextCheckInAt || 0);
}

function getDayKeyFromTimestamp(now = Date.now()) {
  return new Date(Number(now) || Date.now()).toISOString().slice(0, 10);
}

function normalizePlannerAngelOverridesForDate(rawOverrides = {}, dateKey = "", now = Date.now()) {
  const currentDateKey = String(dateKey || getDayKeyFromTimestamp(now));
  const source = rawOverrides && typeof rawOverrides === "object" ? rawOverrides : {};
  if (String(source.dateKey || "") !== currentDateKey) {
    return {
      dateKey: currentDateKey,
      dismissedTaskIds: [],
      emergencyTaskId: "",
      updatedAt: Number(source.updatedAt || 0),
    };
  }

  return {
    dateKey: currentDateKey,
    dismissedTaskIds: Array.isArray(source.dismissedTaskIds)
      ? [...new Set(source.dismissedTaskIds.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 24)
      : [],
    emergencyTaskId: String(source.emergencyTaskId || "").trim(),
    updatedAt: Number(source.updatedAt || 0),
  };
}

function buildPlannerAngelOverridesPatch(currentOverrides = {}, patch = {}, dateKey = "", now = Date.now()) {
  const base = normalizePlannerAngelOverridesForDate(currentOverrides, dateKey, now);
  const removeDismissed = new Set(
    (Array.isArray(patch.removeDismissedTaskIds) ? patch.removeDismissedTaskIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const dismissedTaskIds = Array.isArray(patch.dismissedTaskIds)
    ? [...new Set(patch.dismissedTaskIds.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 24)
    : base.dismissedTaskIds.filter((value) => !removeDismissed.has(String(value)));

  return {
    ...base,
    dismissedTaskIds,
    emergencyTaskId: patch.emergencyTaskId !== undefined
      ? String(patch.emergencyTaskId || "").trim()
      : base.emergencyTaskId,
    updatedAt: now,
  };
}

function withActiveDay(task = {}, now = Date.now()) {
  const today = getDayKeyFromTimestamp(now);
  const activeDays = Array.isArray(task.activeDays) ? task.activeDays : [];
  if (activeDays.includes(today)) return task;
  return {
    ...task,
    activeDays: [...activeDays, today].sort(),
  };
}

function getNextStatusPosition(tasks = [], status = "active", excludeTaskId = "") {
  const positions = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task.status === status && String(task.id) !== String(excludeTaskId))
    .map((task) => Number(task.position))
    .filter(Number.isFinite);
  return positions.length > 0 ? Math.max(...positions) + 1 : Date.now();
}

function resolveHeatZoneValue(task = {}) {
  const heat = typeof task.heatCurrent === "number"
    ? task.heatCurrent
    : typeof task.heatBase === "number"
      ? task.heatBase
      : 40;
  if (heat >= 70) return HEAT_ZONE_VALUES_BY_ZONE.focus;
  if (heat <= 20) return HEAT_ZONE_VALUES_BY_ZONE.purgatory;
  return HEAT_ZONE_VALUES_BY_ZONE.background;
}

function getUrgencyRank(urgency) {
  if (urgency === "high") return 3;
  if (urgency === "medium") return 2;
  if (urgency === "low") return 1;
  return 0;
}

function getResistanceRank(resistance) {
  if (resistance === "high") return 3;
  if (resistance === "medium") return 2;
  if (resistance === "low") return 1;
  return 0;
}

function mergeDeadline(existingDeadline = "", incomingDeadline = "") {
  if (!incomingDeadline) return existingDeadline || "";
  if (!existingDeadline) return incomingDeadline;
  return incomingDeadline < existingDeadline ? incomingDeadline : existingDeadline;
}

function mergeSubtasks(existingSubtasks = [], incomingSubtasks = [], taskId = "task") {
  const result = Array.isArray(existingSubtasks) ? [...existingSubtasks] : [];
  const existingLookup = new Set(result.map((subtask) => normalizeCommandTaskTitle(subtask?.text || "")).filter(Boolean));

  for (const text of normalizeSubtasks(incomingSubtasks)) {
    const normalized = normalizeCommandTaskTitle(text);
    if (!normalized || existingLookup.has(normalized)) continue;
    result.push({
      id: `${taskId}-sub-${Date.now()}-${result.length + 1}`,
      text,
      completed: false,
    });
    existingLookup.add(normalized);
  }

  return result;
}

function mergeIncomingIntoTask(existingTask = {}, incoming = {}, now = Date.now()) {
  const incomingDeadlineAt = normalizePlannerDeadlineForStorage(incoming.deadlineAt || "");
  const nextUrgency = getUrgencyRank(incoming.urgency) > getUrgencyRank(existingTask.urgency)
    ? incoming.urgency
    : existingTask.urgency;
  const nextResistance = getResistanceRank(incoming.resistance) > getResistanceRank(existingTask.resistance)
    ? incoming.resistance
    : existingTask.resistance;
  const nextCommitmentIds = [...new Set([
    ...normalizeCommitmentIds(existingTask.commitmentIds),
    ...normalizeCommitmentIds(incoming.commitmentIds),
  ])].slice(0, 10);

  return {
    ...existingTask,
    urgency: nextUrgency || existingTask.urgency || "medium",
    resistance: nextResistance || existingTask.resistance || "medium",
    isToday: Boolean(existingTask.isToday || incoming.isToday),
    isVital: Boolean(existingTask.isVital || incoming.isVital),
    deadlineAt: mergeDeadline(existingTask.deadlineAt || "", incomingDeadlineAt),
    lifeArea: existingTask.lifeArea || incoming.lifeArea || "",
    commitmentIds: nextCommitmentIds,
    subtasks: mergeSubtasks(existingTask.subtasks, incoming.subtasks, existingTask.id),
    source: existingTask.source || incoming.source || "command_service",
    normalizedTitle: existingTask.normalizedTitle || normalizeCommandTaskTitle(existingTask.text),
    lastUpdated: now,
  };
}

function buildExtractionHintsPatch(existingTask = {}, command = {}, now = Date.now()) {
  const next = { ...existingTask };
  const changedFields = [];
  const warnings = [];

  const incomingUrgency = String(command.urgency || "").trim().toLowerCase();
  if (URGENCY_VALUES.has(incomingUrgency) && getUrgencyRank(incomingUrgency) > getUrgencyRank(existingTask.urgency)) {
    next.urgency = incomingUrgency;
    changedFields.push("urgency");
  }

  const incomingResistance = String(command.resistance || "").trim().toLowerCase();
  if (RESISTANCE_VALUES.has(incomingResistance) && getResistanceRank(incomingResistance) > getResistanceRank(existingTask.resistance)) {
    next.resistance = incomingResistance;
    changedFields.push("resistance");
  }

  if (command.isVital === true && !existingTask.isVital) {
    next.isVital = true;
    changedFields.push("isVital");
  }

  const deadlineAt = String(command.deadlineAt || "").trim();
  if (deadlineAt) {
    const deadlineValidation = validatePlannerDeadline(deadlineAt);
    if (deadlineValidation.ok) {
      const mergedDeadline = mergeDeadline(existingTask.deadlineAt || "", deadlineValidation.deadlineAt);
      if (mergedDeadline !== (existingTask.deadlineAt || "")) {
        next.deadlineAt = mergedDeadline;
        changedFields.push("deadlineAt");
      }
    } else {
      const warning = buildInvalidPlannerDeadlineWarning(deadlineAt);
      if (warning) warnings.push(warning);
    }
  }

  const lifeArea = String(command.lifeArea || "").trim();
  if (lifeArea && !String(existingTask.lifeArea || "").trim()) {
    next.lifeArea = lifeArea;
    changedFields.push("lifeArea");
  }

  const currentCommitmentIds = normalizeCommitmentIds(existingTask.commitmentIds || []);
  const nextCommitmentIds = [...new Set([
    ...currentCommitmentIds,
    ...normalizeCommitmentIds(command.commitmentIds || []),
  ])].slice(0, 10);
  if (nextCommitmentIds.join("|") !== currentCommitmentIds.join("|")) {
    next.commitmentIds = nextCommitmentIds;
    changedFields.push("commitmentIds");
  }

  if (changedFields.length === 0 && warnings.length === 0) return null;
  return {
    task: changedFields.length > 0
      ? {
          ...next,
          lastUpdated: now,
        }
      : null,
    changedFields,
    warnings,
  };
}

function getOverdueCompletionRewardMeta(task) {
  const deadlineInfo = getDeadlineInfo(task);
  if (!deadlineInfo || deadlineInfo.tone !== "overdue") {
    return { bonus: 0, overdueDays: 0, tier: "none" };
  }
  const overdueDays = Math.max(0, Math.ceil(-Number(deadlineInfo.daysLeft || 0)));
  for (const tier of OVERDUE_COMPLETION_REWARD_TIERS) {
    if (overdueDays >= tier.days) {
      return { bonus: tier.bonus, overdueDays, tier: tier.tier };
    }
  }
  return { bonus: 0, overdueDays, tier: "none" };
}

async function createOrMergeTaskCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  const taskText = normalizeSubtaskText(command.taskText || command.rawText || command.title || "");
  const normalizedTitle = normalizeCommandTaskTitle(taskText);
  if (!userId) throw new Error("userId is required");
  if (!normalizedTitle) throw new Error("taskText is required");

  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const indexRef = userRef.collection(TASK_TITLE_INDEX_COLLECTION).doc(stableDocId(normalizedTitle));
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;
  const current = await getPlannerData(userId);
  const existingFromSnapshot = (current.tasks || []).find(
    (task) => task.status === "active" && normalizeCommandTaskTitle(task.text) === normalizedTitle,
  ) || null;
  const source = String(command.source || actor?.ref || "command_service");
  const deadlineAt = assertValidPlannerDeadline(command.deadlineAt || "");
  const incoming = {
    urgency: command.urgency || "medium",
    resistance: command.resistance || "medium",
    isToday: Boolean(command.isToday),
    isVital: Boolean(command.isVital),
    deadlineAt,
    lifeArea: command.lifeArea || "",
    commitmentIds: command.commitmentIds || [],
    subtasks: command.subtasks || [],
    source,
  };

  return db.runTransaction(async (transaction) => {
    if (commandRef) {
      const commandSnap = await transaction.get(commandRef);
      if (commandSnap.exists) {
        return reusePlannerCommand(transaction, commandRef, commandSnap, now);
      }
    }

    const indexSnap = await transaction.get(indexRef);
    let targetTaskId = "";
    if (indexSnap.exists && indexSnap.data()?.status === "active") {
      targetTaskId = String(indexSnap.data()?.taskId || "");
    }
    if (!targetTaskId && existingFromSnapshot) {
      targetTaskId = String(existingFromSnapshot.id);
    }

    let outcome = "created";
    let task = null;
    let taskRef = null;
    let existingTask = null;

    if (targetTaskId) {
      taskRef = userRef.collection("tasks").doc(targetTaskId);
      const taskSnap = await transaction.get(taskRef);
      if (taskSnap.exists && taskSnap.data()?.status === "active") {
        existingTask = taskSnap.data() || {};
      }
    }

    if (existingTask) {
      outcome = "updated";
      task = mergeIncomingIntoTask(existingTask, incoming, now);
      transaction.set(taskRef, task, { merge: true });
    } else {
      task = createTask(taskText, {
        source,
        position: getNextStatusPosition(current.tasks, "active"),
        deadlineAt,
        urgency: command.urgency || "medium",
        resistance: command.resistance || "medium",
        isToday: command.isToday,
        isVital: command.isVital,
        lifeArea: command.lifeArea || "",
        commitmentIds: command.commitmentIds || [],
      });
      task.normalizedTitle = normalizedTitle;
      task.subtasks = mergeSubtasks([], command.subtasks || [], task.id);
      taskRef = userRef.collection("tasks").doc(String(task.id));
      transaction.set(taskRef, task);
    }

    transaction.set(indexRef, {
      normalizedTitle,
      taskId: String(task.id),
      taskText: String(task.text || ""),
      status: "active",
      updatedAt: now,
      updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(userRef, {
      telegramContext: buildTelegramContext(task, outcome === "created" ? "create_task" : "upsert"),
    }, { merge: true });

    const eventId = `${outcome}_task_${task.id}_${now}`;
    const event = buildPlannerCommandEvent({
      eventId,
      commandType: PLANNER_COMMAND_TYPES.CREATE_OR_MERGE_TASK,
      outcome,
      task,
      actor,
      source,
      now,
    });
    transaction.set(userRef.collection("plannerEvents").doc(eventId), event);
    const commandReportSpec = buildSingleTaskCommandReportSpec({
      eventType: event.event_type,
      task,
      actorType: String(actor?.type || "user"),
      extra: {},
    });
    if (commandReportSpec) {
      writeCommandReportItem(transaction, userRef, event, commandReportSpec);
    }

    const result = {
      ok: true,
      outcome,
      task,
      eventId,
      reused: false,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType: PLANNER_COMMAND_TYPES.CREATE_OR_MERGE_TASK,
        source,
        actor,
        outcome,
        result,
        now,
        extra: {
          normalizedTitle,
          taskId: String(task.id),
        },
      }));
    }

    return result;
  });
}

async function setPlannerContextCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  if (!userId) throw new Error("userId is required");
  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const source = String(command.source || actor?.ref || "command_service");
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;

  return db.runTransaction(async (transaction) => {
    if (commandRef) {
      const commandSnap = await transaction.get(commandRef);
      if (commandSnap.exists) {
        return reusePlannerCommand(transaction, commandRef, commandSnap, now);
      }
    }

    const rootSnap = await transaction.get(userRef);
    const rootData = rootSnap.exists ? rootSnap.data() || {} : {};
    const rootPatch = {};
    const contextTask = command.telegramContextTask && typeof command.telegramContextTask === "object"
      ? command.telegramContextTask
      : null;
    const contextAction = String(command.telegramContextAction || "").trim();
    if (contextTask || contextAction) {
      rootPatch.telegramContext = buildTelegramContext(
        contextTask,
        contextAction || "context",
        command.telegramContextExtra && typeof command.telegramContextExtra === "object"
          ? command.telegramContextExtra
          : {},
      );
    }

    if (command.angelOverridesPatch && typeof command.angelOverridesPatch === "object") {
      rootPatch.angelOverrides = buildPlannerAngelOverridesPatch(
        rootData.angelOverrides,
        command.angelOverridesPatch,
        command.dateKey || "",
        now,
      );
    }

    if (Object.keys(rootPatch).length > 0) {
      transaction.set(userRef, rootPatch, { merge: true });
    }

    const result = {
      ok: true,
      outcome: Object.keys(rootPatch).length > 0 ? "updated" : "noop",
      updatedFields: Object.keys(rootPatch),
      reused: false,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType: PLANNER_COMMAND_TYPES.SET_PLANNER_CONTEXT,
        source,
        actor,
        outcome: result.outcome,
        result,
        now,
        extra: {
          visible_in_feed: false,
          visible_in_report: false,
          debug_only: true,
        },
      }), { merge: true });
    }

    return result;
  });
}

async function linkTelegramChatCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  if (!userId) throw new Error("userId is required");
  const chatId = String(command.chatId || command.telegramChatId || "").trim();
  if (!chatId) throw new Error("chatId is required");

  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const source = String(command.source || actor?.ref || "telegram");
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;

  const result = await db.runTransaction(async (transaction) => {
    let commandSnap = null;
    if (commandRef) {
      commandSnap = await transaction.get(commandRef);
    }

    const rootSnap = await transaction.get(userRef);
    const rootData = rootSnap.exists ? rootSnap.data() || {} : {};
    const currentChatId = String(rootData.telegramChatId || "").trim();
    const changed = currentChatId !== chatId;
    const previousLinkStatus = rootData.plannerMeta?.telegram_link_status && typeof rootData.plannerMeta.telegram_link_status === "object"
      ? rootData.plannerMeta.telegram_link_status
      : {};
    const previousLinkedAt = Number(previousLinkStatus.linkedAt || rootData.telegramLinkedAtMs || 0);
    const linkedAt = changed || !previousLinkedAt ? now : previousLinkedAt;
    const shouldRefreshLinkedAt = changed || !Number(rootData.telegramLinkedAtMs || 0);

    const userPatch = {
      telegramChatId: chatId,
      telegramLastSeenAtMs: now,
      plannerMeta: {
        telegram_link_status: {
          status: "linked",
          chatLinked: true,
          linkedAt,
          lastSeenAt: now,
          source,
          outcome: changed ? "linked" : "confirmed",
          chatHash: getTelegramChatHash(chatId),
        },
      },
    };
    if (shouldRefreshLinkedAt) {
      userPatch.telegramLinkedAt = admin.firestore.FieldValue.serverTimestamp();
      userPatch.telegramLinkedAtMs = now;
    }

    transaction.set(userRef, userPatch, { merge: true });

    if (commandRef && commandSnap?.exists) {
      return reusePlannerCommand(transaction, commandRef, commandSnap, now);
    }

    const result = {
      ok: true,
      outcome: changed ? "linked" : "confirmed",
      chatId,
      updatedFields: [
        "telegramChatId",
        "telegramLastSeenAtMs",
        "plannerMeta.telegram_link_status",
        ...(shouldRefreshLinkedAt ? ["telegramLinkedAt", "telegramLinkedAtMs"] : []),
      ],
      reused: false,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType: PLANNER_COMMAND_TYPES.LINK_TELEGRAM_CHAT,
        source,
        actor: { type: String(actor?.type || "system"), ref: String(actor?.ref || source || "telegram") },
        outcome: result.outcome,
        result,
        now,
        extra: {
          visible_in_feed: false,
          visible_in_report: false,
          debug_only: true,
        },
      }), { merge: true });
    }

    return result;
  });

  const telegramOutboxRecovery = await recoverTelegramOutboxAfterRelink({
    userRef,
    chatId,
    now,
  });

  return {
    ...result,
    telegramOutboxRecovery,
  };
}

async function mutateSingleTaskCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  if (!userId) throw new Error("userId is required");
  const commandType = String(command.type || command.commandType || "").trim().toUpperCase();
  const taskId = String(command.taskId || command.targetTaskId || "").trim();
  if (!taskId) throw new Error("taskId is required");

  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const taskRef = userRef.collection("tasks").doc(taskId);
  const current = await getPlannerData(userId);
  const source = String(command.source || actor?.ref || "command_service");
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;

  return db.runTransaction(async (transaction) => {
    if (commandRef) {
      const commandSnap = await transaction.get(commandRef);
      if (commandSnap.exists) {
        return reusePlannerCommand(transaction, commandRef, commandSnap, now);
      }
    }

    const taskSnap = await transaction.get(taskRef);
    if (!taskSnap.exists) {
      return {
        ok: false,
        outcome: "missing",
        task: null,
        message: "Task not found",
        reused: false,
      };
    }

    const existingTask = taskSnap.data() || {};
    let task = existingTask;
    let scoreDelta = 0;
    let outcome = "updated";
    let eventType = PLANNER_EVENT_TYPES.TASK_UPDATED;
    let eventName = "task_updated";
    let actionName = "update";
    let extra = {};

    if (commandType === PLANNER_COMMAND_TYPES.TASK_COMPLETE) {
      if (!isTaskStatusTransitionAllowed(commandType, existingTask.status)) {
        outcome = "noop";
      } else {
        const reward = getOverdueCompletionRewardMeta(existingTask);
        scoreDelta = 10 + reward.bonus;
        task = {
          ...existingTask,
          status: "completed",
          isToday: false,
          deadAt: null,
          heatBase: 100,
          heatCurrent: 100,
          lastUpdated: now,
          position: getNextStatusPosition(current.tasks, "completed", taskId),
        };
        eventType = PLANNER_EVENT_TYPES.TASK_COMPLETED;
        eventName = "task_completed";
        actionName = "complete";
        extra = { overdueCompletionMeta: reward };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_MOVE_TO_CEMETERY) {
      if (!isTaskStatusTransitionAllowed(commandType, existingTask.status)) {
        outcome = "noop";
      } else {
        scoreDelta = existingTask.status === "active" ? -5 : 0;
        task = {
          ...existingTask,
          status: "dead",
          isToday: false,
          deadAt: now,
          lastUpdated: now,
          position: getNextStatusPosition(current.tasks, "dead", taskId),
        };
        eventType = PLANNER_EVENT_TYPES.TASK_MOVED_TO_CEMETERY;
        eventName = "task_dead";
        actionName = "kill";
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_REOPEN) {
      if (!isTaskStatusTransitionAllowed(commandType, existingTask.status)) {
        outcome = "noop";
      } else {
        scoreDelta = 0;
        task = {
          ...existingTask,
          status: "active",
          isToday: false,
          heatBase: typeof existingTask.heatBase === "number" ? existingTask.heatBase : 35,
          heatCurrent:
            typeof existingTask.heatCurrent === "number"
              ? existingTask.heatCurrent
              : typeof existingTask.heatBase === "number"
                ? existingTask.heatBase
                : 35,
          position: getNextStatusPosition(current.tasks, "active", taskId),
          lastUpdated: now,
          deadAt: null,
        };
        eventType = PLANNER_EVENT_TYPES.TASK_REOPENED;
        eventName = "task_reopened";
        actionName = "reopen";
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_TOUCH) {
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const currentHeat = typeof existingTask.heatCurrent === "number"
          ? existingTask.heatCurrent
          : typeof existingTask.heatBase === "number"
            ? existingTask.heatBase
            : 35;
        const nextHeat = Math.min(100, currentHeat + TOUCH_HEAT_BONUS);
        task = withActiveDay({
          ...existingTask,
          heatBase: nextHeat,
          heatCurrent: nextHeat,
          lastUpdated: now,
        }, now);
        eventType = PLANNER_EVENT_TYPES.TASK_TOUCHED;
        eventName = "task_touched";
        actionName = "touch";
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_RESCUE_STARTED) {
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        eventType = PLANNER_EVENT_TYPES.RESCUE_STARTED;
        eventName = "rescue_started";
        actionName = "rescue_started";
        extra = {
          microstepText: String(command.microstepText || "").trim(),
          durationMs: Number(command.durationMs || 0) || 0,
        };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_RESCUE_CLOSED_LATER) {
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        eventType = PLANNER_EVENT_TYPES.RESCUE_CLOSED_LATER;
        eventName = "rescue_closed_later";
        actionName = "rescue_closed_later";
        extra = {
          microstepText: String(command.microstepText || "").trim(),
          durationMs: Number(command.durationMs || 0) || 0,
          closeReason: String(command.closeReason || "later").trim(),
          secondsLeft: Number(command.secondsLeft || 0) || 0,
        };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_RESCUE_ABORTED) {
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        eventType = PLANNER_EVENT_TYPES.RESCUE_ABORTED;
        eventName = "rescue_aborted";
        actionName = "rescue_aborted";
        extra = {
          microstepText: String(command.microstepText || "").trim(),
          durationMs: Number(command.durationMs || 0) || 0,
          closeReason: String(command.closeReason || "exit").trim(),
          secondsLeft: Number(command.secondsLeft || 0) || 0,
        };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_RESCUE_SHIFT_RECORDED) {
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const currentHeat = typeof existingTask.heatCurrent === "number"
          ? existingTask.heatCurrent
          : typeof existingTask.heatBase === "number"
            ? existingTask.heatBase
            : 35;
        const nextHeat = Math.min(100, currentHeat + TOUCH_HEAT_BONUS);
        task = withActiveDay({
          ...existingTask,
          heatBase: nextHeat,
          heatCurrent: nextHeat,
          lastUpdated: now,
        }, now);
        eventType = PLANNER_EVENT_TYPES.RESCUE_SHIFT_RECORDED;
        eventName = "rescue_shift_recorded";
        actionName = "rescue_shift";
        extra = {
          microstepText: String(command.microstepText || "").trim(),
          durationMs: Number(command.durationMs || 0) || 0,
        };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_RESCUE_COMPLETED) {
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const reward = getOverdueCompletionRewardMeta(existingTask);
        scoreDelta = 10 + reward.bonus;
        task = {
          ...existingTask,
          status: "completed",
          isToday: false,
          deadAt: null,
          heatBase: 100,
          heatCurrent: 100,
          lastUpdated: now,
          position: getNextStatusPosition(current.tasks, "completed", taskId),
        };
        eventType = PLANNER_EVENT_TYPES.RESCUE_COMPLETED;
        eventName = "rescue_completed";
        actionName = "rescue_completed";
        extra = {
          microstepText: String(command.microstepText || "").trim(),
          durationMs: Number(command.durationMs || 0) || 0,
          overdueCompletionMeta: reward,
        };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_ADD_TIME) {
      const elapsedMs = Number(command.elapsedMs || command.durationMs || 0);
      if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
        throw new Error("elapsedMs is required");
      }

      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const dayKey = getDayKeyFromTimestamp(now);
        const timeByDay = {
          ...(existingTask.timeByDay && typeof existingTask.timeByDay === "object" ? existingTask.timeByDay : {}),
        };
        timeByDay[dayKey] = Number(timeByDay[dayKey] || 0) + elapsedMs;
        task = withActiveDay({
          ...existingTask,
          timeSpent: Number(existingTask.timeSpent || 0) + elapsedMs,
          timeByDay,
          lastUpdated: now,
        }, now);
        eventType = PLANNER_EVENT_TYPES.TASK_TIME_ADDED;
        eventName = "task_time_added";
        actionName = "add_time";
        extra = {
          elapsedMs,
          dayKey,
        };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_EDIT_TASK) {
      const newTaskText = normalizeSubtaskText(command.newTaskText || command.taskText || command.text || command.title || "");
      if (!newTaskText) {
        throw new Error("newTaskText is required");
      }

      if (existingTask.status !== "active") {
        outcome = "noop";
      } else if (String(existingTask.text || "").trim() === newTaskText) {
        outcome = "noop";
      } else {
        task = withActiveDay({
          ...existingTask,
          text: newTaskText,
          normalizedTitle: normalizeCommandTaskTitle(newTaskText),
          lastUpdated: now,
        }, now);
        eventType = PLANNER_EVENT_TYPES.TASK_TITLE_CHANGED;
        eventName = "task_title_changed";
        actionName = "edit_task";
        extra = {
          oldText: existingTask.text || "",
          newText: newTaskText,
        };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK) {
      const subtaskText = normalizeSubtaskText(command.subtaskText || command.text || command.subtask || "");
      if (!subtaskText) {
        throw new Error("subtaskText is required");
      }

      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const existingSubtasks = Array.isArray(existingTask.subtasks) ? existingTask.subtasks : [];
        const normalizedSubtask = normalizeCommandTaskTitle(subtaskText);
        const duplicate = existingSubtasks.some((subtask) => (
          normalizeCommandTaskTitle(subtask?.text || "") === normalizedSubtask
        ));

        if (duplicate) {
          outcome = "noop";
        } else {
          const createdSubtask = {
            id: `${taskId}-sub-${now}-${existingSubtasks.length + 1}`,
            text: subtaskText,
            completed: false,
          };
          task = withActiveDay({
            ...existingTask,
            subtasks: [...existingSubtasks, createdSubtask],
            lastUpdated: now,
          }, now);
          eventType = PLANNER_EVENT_TYPES.TASK_SUBTASK_ADDED;
          eventName = "subtask_added";
          actionName = "add_subtask";
          extra = { createdSubtask };
        }
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_EDIT_SUBTASK) {
      const subtaskId = String(command.subtaskId || command.subtask_id || "").trim();
      const newSubtaskText = normalizeSubtaskText(command.newSubtaskText || command.subtaskText || command.text || command.subtask || "");
      if (!subtaskId) {
        throw new Error("subtaskId is required");
      }
      if (!newSubtaskText) {
        throw new Error("newSubtaskText is required");
      }

      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const existingSubtasks = Array.isArray(existingTask.subtasks) ? existingTask.subtasks : [];
        const targetSubtask = existingSubtasks.find((subtask) => String(subtask?.id) === subtaskId);
        const normalizedNewSubtask = normalizeCommandTaskTitle(newSubtaskText);
        const duplicate = existingSubtasks.some((subtask) => (
          String(subtask?.id) !== subtaskId &&
          normalizeCommandTaskTitle(subtask?.text || "") === normalizedNewSubtask
        ));

        if (!targetSubtask || duplicate || String(targetSubtask.text || "").trim() === newSubtaskText) {
          outcome = "noop";
          extra = {
            subtaskId,
            ...(duplicate ? { duplicateSubtaskText: newSubtaskText } : {}),
            ...(!targetSubtask ? { missingSubtaskId: subtaskId } : {}),
          };
        } else {
          const nextSubtasks = existingSubtasks.map((subtask) => (
            String(subtask?.id) === subtaskId
              ? { ...subtask, text: newSubtaskText }
              : subtask
          ));
          task = withActiveDay({
            ...existingTask,
            subtasks: nextSubtasks,
            lastUpdated: now,
          }, now);
          eventType = PLANNER_EVENT_TYPES.TASK_SUBTASK_EDITED;
          eventName = "subtask_edited";
          actionName = "edit_subtask";
          extra = {
            subtaskId,
            oldSubtaskText: targetSubtask.text || "",
            newSubtaskText,
          };
        }
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_SUBTASK_TOGGLED) {
      const subtaskId = String(command.subtaskId || command.subtask_id || "").trim();
      if (!subtaskId) {
        throw new Error("subtaskId is required");
      }

      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const existingSubtasks = Array.isArray(existingTask.subtasks) ? existingTask.subtasks : [];
        const targetSubtask = existingSubtasks.find((subtask) => String(subtask?.id) === subtaskId);

        if (!targetSubtask) {
          outcome = "noop";
          extra = { missingSubtaskId: subtaskId };
        } else {
          const hasExplicitCompleted = typeof command.completed === "boolean";
          const nextCompleted = hasExplicitCompleted ? command.completed : !Boolean(targetSubtask.completed);

          if (Boolean(targetSubtask.completed) === nextCompleted) {
            outcome = "noop";
            extra = { subtaskId, completed: nextCompleted };
          } else {
            const completedBefore = existingSubtasks.filter((subtask) => subtask.completed).length;
            const nextSubtasks = existingSubtasks.map((subtask) => (
              String(subtask?.id) === subtaskId
                ? { ...subtask, completed: nextCompleted }
                : subtask
            ));
            const completedAfter = nextSubtasks.filter((subtask) => subtask.completed).length;
            const subtasksCount = nextSubtasks.length;
            const completionDelta = completedAfter - completedBefore;
            const subtaskWeight = subtasksCount > 0 ? (SUBTASK_COMPLETION_CAP / subtasksCount) : 0;
            const currentHeat = typeof existingTask.heatCurrent === "number"
              ? existingTask.heatCurrent
              : typeof existingTask.heatBase === "number"
                ? existingTask.heatBase
                : 35;
            const nextHeat = Math.min(100, Math.max(0, currentHeat + completionDelta * subtaskWeight));

            task = withActiveDay({
              ...existingTask,
              subtasks: nextSubtasks,
              heatBase: nextHeat,
              heatCurrent: nextHeat,
              lastUpdated: now,
            }, now);
            eventType = PLANNER_EVENT_TYPES.TASK_SUBTASK_TOGGLED;
            eventName = "subtask_toggled";
            actionName = "toggle_subtask";
            extra = {
              subtaskId,
              subtaskText: targetSubtask.text || "",
              completed: nextCompleted,
            };
          }
        }
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_DELETE_SUBTASK) {
      const subtaskId = String(command.subtaskId || command.subtask_id || "").trim();
      const subtaskText = normalizeSubtaskText(command.subtaskText || command.text || command.subtask || "");
      if (!subtaskId && !subtaskText) {
        throw new Error("subtaskId or subtaskText is required");
      }

      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const existingSubtasks = Array.isArray(existingTask.subtasks) ? existingTask.subtasks : [];
        const normalizedSubtaskText = normalizeCommandTaskTitle(subtaskText);
        const targetSubtask = existingSubtasks.find((subtask) => {
          if (subtaskId && String(subtask?.id) === subtaskId) return true;
          if (normalizedSubtaskText && normalizeCommandTaskTitle(subtask?.text || "") === normalizedSubtaskText) return true;
          return false;
        });

        if (!targetSubtask) {
          outcome = "noop";
          extra = { missingSubtaskId: subtaskId, missingSubtaskText: subtaskText };
        } else {
          task = withActiveDay({
            ...existingTask,
            subtasks: existingSubtasks.filter((subtask) => String(subtask?.id) !== String(targetSubtask.id)),
            lastUpdated: now,
          }, now);
          eventType = PLANNER_EVENT_TYPES.TASK_SUBTASK_DELETED;
          eventName = "subtask_deleted";
          actionName = "delete_subtask";
          extra = { deletedSubtask: targetSubtask };
        }
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_SET_TODAY || commandType === PLANNER_COMMAND_TYPES.TASK_UNSET_TODAY) {
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const nextIsToday = commandType === PLANNER_COMMAND_TYPES.TASK_SET_TODAY;
        if (Boolean(existingTask.isToday) === nextIsToday) {
          outcome = "noop";
        } else {
          task = {
            ...existingTask,
            isToday: nextIsToday,
            lastUpdated: now,
          };
          eventType = nextIsToday ? PLANNER_EVENT_TYPES.TASK_PINNED_TODAY : PLANNER_EVENT_TYPES.TASK_UNPINNED_TODAY;
          eventName = nextIsToday ? "task_pinned_today" : "task_unpinned_today";
          actionName = nextIsToday ? "today" : "unset_today";
        }
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_SET_VITAL || commandType === PLANNER_COMMAND_TYPES.TASK_UNSET_VITAL) {
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const nextIsVital = commandType === PLANNER_COMMAND_TYPES.TASK_SET_VITAL;
        if (Boolean(existingTask.isVital) === nextIsVital) {
          outcome = "noop";
        } else {
          task = {
            ...existingTask,
            isVital: nextIsVital,
            ...(nextIsVital ? { urgency: "high" } : {}),
            lastUpdated: now,
          };
          eventType = nextIsVital ? PLANNER_EVENT_TYPES.TASK_MARKED_VITAL : PLANNER_EVENT_TYPES.TASK_UNMARKED_VITAL;
          eventName = nextIsVital ? "task_marked_vital" : "task_unmarked_vital";
          actionName = nextIsVital ? "vital" : "unset_vital";
        }
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_SET_URGENCY) {
      const urgency = String(command.urgency || "").trim().toLowerCase();
      if (!URGENCY_VALUES.has(urgency)) {
        throw new Error("urgency must be low, medium, or high");
      }
      if (existingTask.status !== "active" || existingTask.urgency === urgency) {
        outcome = "noop";
      } else {
        task = {
          ...existingTask,
          urgency,
          lastUpdated: now,
        };
        eventType = PLANNER_EVENT_TYPES.TASK_URGENCY_SET;
        eventName = "task_urgency_set";
        actionName = "set_urgency";
        extra = { urgency };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_SET_RESISTANCE) {
      const resistance = String(command.resistance || "").trim().toLowerCase();
      if (!RESISTANCE_VALUES.has(resistance)) {
        throw new Error("resistance must be low, medium, or high");
      }
      if (existingTask.status !== "active" || existingTask.resistance === resistance) {
        outcome = "noop";
      } else {
        task = {
          ...existingTask,
          resistance,
          lastUpdated: now,
        };
        eventType = PLANNER_EVENT_TYPES.TASK_RESISTANCE_SET;
        eventName = "task_resistance_set";
        actionName = "set_resistance";
        extra = { resistance };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_SET_DEADLINE) {
      const deadlineAt = assertValidPlannerDeadline(command.deadlineAt || "");
      if (existingTask.status !== "active" || String(existingTask.deadlineAt || "") === deadlineAt) {
        outcome = "noop";
      } else {
        task = {
          ...existingTask,
          deadlineAt,
          lastUpdated: now,
        };
        eventType = deadlineAt ? PLANNER_EVENT_TYPES.TASK_DEADLINE_SET : PLANNER_EVENT_TYPES.TASK_DEADLINE_CLEARED;
        eventName = deadlineAt ? "task_deadline_set" : "task_deadline_cleared";
        actionName = "set_deadline";
        extra = { deadlineAt };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_SET_HEAT_ZONE) {
      const heatZone = String(command.heatZone || command.zone || "").trim().toLowerCase();
      if (!HEAT_ZONE_VALUES.has(heatZone)) {
        throw new Error("heatZone must be focus, background, or purgatory");
      }
      const nextHeat = HEAT_ZONE_VALUES_BY_ZONE[heatZone];
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else if (Number(existingTask.heatBase) === nextHeat && Number(existingTask.heatCurrent) === nextHeat) {
        outcome = "noop";
      } else {
        task = withActiveDay({
          ...existingTask,
          heatBase: nextHeat,
          heatCurrent: nextHeat,
          lastUpdated: now,
        }, now);
        eventType = PLANNER_EVENT_TYPES.TASK_HEAT_ZONE_SET;
        eventName = "task_heat_zone_set";
        actionName = "set_heat_zone";
        extra = { heatZone, heat: nextHeat };
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_MARK_NOT_YOUR_MOVE) {
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const blocked = getCommandNotYourMoveMetadata(command, existingTask, now);
        const currentBlocked = existingTask.blocked || existingTask.notYourMove || {};
        if (isSameNotYourMoveMetadata(currentBlocked, blocked) && existingTask.isToday === false) {
          outcome = "noop";
        } else {
          task = {
            ...existingTask,
            blocked,
            notYourMove: null,
            isToday: false,
            lastUpdated: now,
          };
          eventType = PLANNER_EVENT_TYPES.TASK_MARKED_NOT_YOUR_MOVE;
          eventName = "task_marked_not_your_move";
          actionName = "mark_not_your_move";
          extra = blocked;
        }
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_SET_CHECKIN) {
      const nextCheckInAt = normalizeCommandCheckInAt(command.nextCheckInAt);
      if (!nextCheckInAt) {
        throw new Error("nextCheckInAt is required for set_checkin");
      }
      if (existingTask.status !== "active") {
        outcome = "noop";
      } else {
        const blocked = getCommandNotYourMoveMetadata({ ...command, nextCheckInAt }, existingTask, now);
        const currentBlocked = existingTask.blocked || existingTask.notYourMove || {};
        if (isSameNotYourMoveMetadata(currentBlocked, blocked)) {
          outcome = "noop";
        } else {
          task = {
            ...existingTask,
            blocked,
            notYourMove: null,
            lastUpdated: now,
          };
          eventType = PLANNER_EVENT_TYPES.TASK_CHECKIN_SET;
          eventName = "task_checkin_set";
          actionName = "set_checkin";
          extra = blocked;
        }
      }
    } else if (commandType === PLANNER_COMMAND_TYPES.TASK_CLEAR_NOT_YOUR_MOVE) {
      if (existingTask.status !== "active" || (!existingTask.blocked && !existingTask.notYourMove)) {
        outcome = "noop";
      } else {
        task = {
          ...existingTask,
          blocked: null,
          notYourMove: null,
          lastUpdated: now,
        };
        eventType = PLANNER_EVENT_TYPES.TASK_CLEARED_NOT_YOUR_MOVE;
        eventName = "task_cleared_not_your_move";
        actionName = "clear_not_your_move";
      }
    } else {
      throw new Error(`Unsupported single task command: ${commandType}`);
    }

    if (outcome !== "noop") {
      transaction.set(taskRef, task, { merge: true });
    }

    if (outcome === "noop") {
      const actorType = String(actor?.type || "user");
      const actorRef = String(actor?.ref || source || "unknown");
      const result = {
        ok: true,
        outcome,
        task,
        scoreDelta,
        eventId: null,
        reused: false,
        ...extra,
      };

      if (commandRef) {
        writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
          id: commandKey,
          commandType,
          source,
          actor: { type: actorType, ref: actorRef },
          outcome,
          result,
          now,
          extra: {
            taskId: String(task.id),
          },
        }));
      }

      return result;
    }

    if (outcome !== "noop" && eventType === PLANNER_EVENT_TYPES.TASK_TITLE_CHANGED) {
      const oldNormalizedTitle = normalizeCommandTaskTitle(existingTask.text || "");
      const newNormalizedTitle = normalizeCommandTaskTitle(task.text || "");
      if (oldNormalizedTitle && oldNormalizedTitle !== newNormalizedTitle) {
        transaction.set(userRef.collection(TASK_TITLE_INDEX_COLLECTION).doc(stableDocId(oldNormalizedTitle)), {
          normalizedTitle: oldNormalizedTitle,
          taskId: String(task.id),
          taskText: String(existingTask.text || ""),
          status: "renamed",
          updatedAt: now,
          updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }

    const rootPatch = {
      telegramContext: buildTelegramContext(task, actionName),
    };
    if (scoreDelta !== 0) {
      rootPatch.score = admin.firestore.FieldValue.increment(scoreDelta);
    }
    transaction.set(userRef, rootPatch, { merge: true });

    if (task.status !== "active") {
      const normalizedTitle = normalizeCommandTaskTitle(task.text || "");
      if (normalizedTitle) {
        transaction.set(userRef.collection(TASK_TITLE_INDEX_COLLECTION).doc(stableDocId(normalizedTitle)), {
          normalizedTitle,
          taskId: String(task.id),
          taskText: String(task.text || ""),
          status: String(task.status || ""),
          updatedAt: now,
          updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    } else {
      const normalizedTitle = normalizeCommandTaskTitle(task.text || "");
      if (normalizedTitle) {
        transaction.set(userRef.collection(TASK_TITLE_INDEX_COLLECTION).doc(stableDocId(normalizedTitle)), {
          normalizedTitle,
          taskId: String(task.id),
          taskText: String(task.text || ""),
          status: "active",
          updatedAt: now,
          updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }

    const actorType = String(actor?.type || "user");
    const actorRef = String(actor?.ref || source || "unknown");
    const eventId = `${eventType.toLowerCase()}_${task.id}_${now}`;
    const event = buildSingleTaskMutationCommandEvent({
      eventId,
      eventName,
      eventType,
      commandType,
      task,
      previousTask: existingTask,
      actor,
      source,
      extra,
      scoreDelta,
      now,
    });
    transaction.set(userRef.collection("plannerEvents").doc(eventId), event);
    const commandReportSpec = buildSingleTaskCommandReportSpec({
      eventType,
      task,
      actorType,
      extra,
    });
    if (commandReportSpec) {
      writeCommandReportItem(transaction, userRef, event, commandReportSpec);
    }

    const result = {
      ok: true,
      outcome,
      task,
      scoreDelta,
      eventId,
      reused: false,
      ...extra,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType,
        source,
        actor: { type: actorType, ref: actorRef },
        outcome,
        result,
        now,
        extra: {
          taskId: String(task.id),
        },
      }));
    }

    return result;
  });
}

async function applyExtractionHintsCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  if (!userId) throw new Error("userId is required");
  const taskId = String(command.taskId || command.targetTaskId || "").trim();
  if (!taskId) throw new Error("taskId is required");

  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const taskRef = userRef.collection("tasks").doc(taskId);
  const source = String(command.source || actor?.ref || "capture_extractor");
  const commandType = PLANNER_COMMAND_TYPES.TASK_APPLY_EXTRACTION_HINTS;
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;

  return db.runTransaction(async (transaction) => {
    if (commandRef) {
      const commandSnap = await transaction.get(commandRef);
      if (commandSnap.exists) {
        return reusePlannerCommand(transaction, commandRef, commandSnap, now);
      }
    }

    const taskSnap = await transaction.get(taskRef);
    if (!taskSnap.exists) {
      return {
        ok: false,
        outcome: "missing",
        task: null,
        changedFields: [],
        message: "Task not found",
        reused: false,
      };
    }

    const existingTask = taskSnap.data() || {};
    let task = existingTask;
    let outcome = "noop";
    let changedFields = [];
    let warnings = [];

    if (existingTask.status === "active") {
      const patch = buildExtractionHintsPatch(existingTask, command, now);
      warnings = Array.isArray(patch?.warnings) ? patch.warnings : [];
      if (patch?.task) {
        task = patch.task;
        changedFields = patch.changedFields;
        outcome = "updated";
        transaction.set(taskRef, task, { merge: true });
      }
    }

    const actorType = String(actor?.type || "engine");
    const actorRef = String(actor?.ref || source || "capture_extractor");
    const eventId = `task_extraction_hints_applied_${taskId}_${now}`;
    const event = buildExtractionHintsAppliedCommandEvent({
      eventId,
      commandType,
      task,
      taskId,
      actor,
      source,
      changedFields,
      now,
    });
    if (outcome !== "noop") {
      transaction.set(userRef.collection("plannerEvents").doc(eventId), event);
    }

    const result = {
      ok: true,
      outcome,
      task,
      changedFields,
      warnings,
      eventId: outcome === "noop" ? "" : eventId,
      reused: false,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType,
        source,
        actor: { type: actorType, ref: actorRef },
        outcome,
        result,
        now,
        extra: {
          taskId: String(task.id || taskId),
        },
      }));
    }

    return result;
  });
}

async function reorderActiveTaskCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  if (!userId) throw new Error("userId is required");
  const taskId = String(command.taskId || command.targetTaskId || "").trim();
  const overTaskId = String(command.overTaskId || command.overTaskRef || command.targetOverTaskId || "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (!overTaskId) throw new Error("overTaskId is required");

  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const current = await getPlannerData(userId);
  const source = String(command.source || actor?.ref || "command_service");
  const commandType = PLANNER_COMMAND_TYPES.TASK_REORDER;
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;

  return db.runTransaction(async (transaction) => {
    if (commandRef) {
      const commandSnap = await transaction.get(commandRef);
      if (commandSnap.exists) {
        return reusePlannerCommand(transaction, commandRef, commandSnap, now);
      }
    }

    const activeOrdered = (Array.isArray(current.tasks) ? current.tasks : [])
      .filter((task) => task.status === "active")
      .sort((left, right) => {
        const leftPosition = Number(left.position);
        const rightPosition = Number(right.position);
        if (Number.isFinite(leftPosition) && Number.isFinite(rightPosition) && leftPosition !== rightPosition) {
          return leftPosition - rightPosition;
        }
        return Number(left.createdAt || 0) - Number(right.createdAt || 0);
      });

    const fromIndex = activeOrdered.findIndex((task) => String(task.id) === taskId);
    const toIndex = activeOrdered.findIndex((task) => String(task.id) === overTaskId);

    if (fromIndex === -1 || toIndex === -1) {
      const result = {
        ok: false,
        outcome: "missing",
        task: null,
        message: "Task not found",
        reused: false,
      };
      if (commandRef) {
        writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
          id: commandKey,
          commandType,
          source,
          actor,
          outcome: result.outcome,
          result,
          now,
          extra: { command },
        }), { merge: true });
      }
      return result;
    }

    if (fromIndex === toIndex) {
      const task = activeOrdered[fromIndex];
      const result = {
        ok: true,
        outcome: "noop",
        task,
        changedTaskIds: [],
        scoreDelta: 0,
        reused: false,
      };
      if (commandRef) {
        writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
          id: commandKey,
          commandType,
          source,
          actor,
          outcome: result.outcome,
          result,
          now,
          extra: { command },
        }), { merge: true });
      }
      return result;
    }

    const movedTask = activeOrdered[fromIndex];
    const targetTask = activeOrdered[toIndex];
    const targetHeat = resolveHeatZoneValue(targetTask);
    const reordered = [...activeOrdered];
    const [item] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, item);

    const changedTasks = [];
    reordered.forEach((task, index) => {
      const nextPosition = index + 1;
      const isMovedTask = String(task.id) === taskId;
      const nextHeatPatch = isMovedTask
        ? { heatBase: targetHeat, heatCurrent: targetHeat }
        : {};
      const needsPosition = Number(task.position) !== nextPosition;
      const needsHeat = isMovedTask && (
        Number(task.heatBase) !== targetHeat ||
        Number(task.heatCurrent) !== targetHeat
      );
      if (!needsPosition && !needsHeat) return;

      changedTasks.push({
        ...task,
        ...nextHeatPatch,
        position: nextPosition,
        lastUpdated: now,
      });
    });

    changedTasks.forEach((task) => {
      transaction.set(userRef.collection("tasks").doc(String(task.id)), task, { merge: true });
    });

    const eventId = `task_reordered_${taskId}_${now}`;
    const event = buildTaskReorderedCommandEvent({
      eventId,
      task: movedTask,
      taskId,
      overTaskId,
      changedTaskIds: changedTasks.map((task) => task.id),
      actor,
      source,
      now,
    });
    transaction.set(userRef.collection("plannerEvents").doc(eventId), event);

    const updatedMovedTask = changedTasks.find((task) => String(task.id) === taskId) || movedTask;
    const result = {
      ok: true,
      outcome: "updated",
      task: updatedMovedTask,
      changedTaskIds: changedTasks.map((task) => String(task.id)),
      eventId,
      scoreDelta: 0,
      reused: false,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType,
        source,
        actor,
        outcome: result.outcome,
        result,
        now,
        extra: { command },
      }), { merge: true });
    }

    return result;
  });
}

async function bulkMoveCompletedToCemeteryCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  if (!userId) throw new Error("userId is required");
  const taskIds = [...new Set(
    (Array.isArray(command.taskIds) ? command.taskIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  )].slice(0, 80);
  if (taskIds.length === 0) throw new Error("taskIds are required");

  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const [current, nonActiveTasks] = await Promise.all([
    getPlannerData(userId),
    getNonActiveTasks(userId),
  ]);
  const source = String(command.source || actor?.ref || "command_service");
  const commandType = PLANNER_COMMAND_TYPES.BULK_MOVE_COMPLETED_TO_CEMETERY;
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;

  return db.runTransaction(async (transaction) => {
    if (commandRef) {
      const commandSnap = await transaction.get(commandRef);
      if (commandSnap.exists) {
        return reusePlannerCommand(transaction, commandRef, commandSnap, now);
      }
    }

    const tasks = [
      ...(Array.isArray(current.tasks) ? current.tasks : []),
      ...(Array.isArray(nonActiveTasks) ? nonActiveTasks : []),
    ];
    const tasksById = new Map(tasks.map((task) => [String(task.id), task]));
    const candidateTasks = taskIds
      .map((taskId) => tasksById.get(String(taskId)))
      .filter((task) => task && task.status === "completed");
    const protectedCount = Math.max(0, Number.parseInt(String(command.protectedCount || 0), 10) || 0);

    if (candidateTasks.length === 0) {
      const result = {
        ok: true,
        outcome: "noop",
        movedTasks: [],
        movedTaskIds: [],
        protectedCount,
        scoreDelta: 0,
        reused: false,
      };
      if (commandRef) {
        writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
          id: commandKey,
          commandType,
          source,
          actor,
          outcome: result.outcome,
          result,
          now,
        }), { merge: true });
      }
      return result;
    }

    let nextDeadPosition = getNextStatusPosition(tasks, "dead");
    const movedTasks = candidateTasks.map((task) => {
      const nextTask = {
        ...task,
        status: "dead",
        isToday: false,
        lastUpdated: now,
        deadAt: now,
        position: nextDeadPosition,
      };
      nextDeadPosition += 1;
      return nextTask;
    });

    movedTasks.forEach((task) => {
      transaction.set(userRef.collection("tasks").doc(String(task.id)), task, { merge: true });
    });

    const scoreDelta = -10 * movedTasks.length;
    transaction.set(userRef, {
      score: admin.firestore.FieldValue.increment(scoreDelta),
    }, { merge: true });

    const eventId = `bulk_completed_to_cemetery_${now}`;
    const event = buildBulkCompletedMovedToCemeteryCommandEvent({
      eventId,
      movedTasks,
      protectedCount,
      actor,
      source,
      now,
    });
    transaction.set(userRef.collection("plannerEvents").doc(eventId), event);
    writeCommandReportItem(transaction, userRef, event, buildBulkCompletedToCemeteryReportSpec({ movedCount: movedTasks.length }));

    const result = {
      ok: true,
      outcome: "updated",
      movedTasks,
      movedTaskIds: movedTasks.map((task) => String(task.id)),
      protectedCount,
      scoreDelta,
      eventId,
      reused: false,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType,
        source,
        actor,
        outcome: result.outcome,
        result,
        now,
      }), { merge: true });
    }

    return result;
  });
}

async function restoreSnapshotCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  if (!userId) throw new Error("userId is required");
  const snapshotId = String(command.snapshotId || command.id || "").trim();
  if (!snapshotId) throw new Error("snapshotId is required");

  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const snapshotRef = userRef.collection("taskSnapshots").doc(snapshotId);
  const [current, nonActiveTasks] = await Promise.all([
    getPlannerData(userId),
    getNonActiveTasks(userId),
  ]);
  const currentTasks = [
    ...(Array.isArray(current.tasks) ? current.tasks : []),
    ...(Array.isArray(nonActiveTasks) ? nonActiveTasks : []),
  ];
  const source = String(command.source || actor?.ref || "command_service");
  const commandType = PLANNER_COMMAND_TYPES.RESTORE_SNAPSHOT;
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;

  return db.runTransaction(async (transaction) => {
    if (commandRef) {
      const commandSnap = await transaction.get(commandRef);
      if (commandSnap.exists) {
        return reusePlannerCommand(transaction, commandRef, commandSnap, now);
      }
    }

    const snapshotSnap = await transaction.get(snapshotRef);
    if (!snapshotSnap.exists) {
      const result = {
        ok: false,
        outcome: "missing",
        task: null,
        message: "Snapshot not found",
        reused: false,
      };
      if (commandRef) {
        writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
          id: commandKey,
          commandType,
          source,
          actor,
          outcome: result.outcome,
          result,
          now,
          extra: { snapshotId },
        }), { merge: true });
      }
      return result;
    }

    const snapshotData = snapshotSnap.data() || {};
    if (!Array.isArray(snapshotData.tasks)) {
      throw new Error("Snapshot has no tasks array");
    }

    const restoredTasks = stripCommandTaskStateList(snapshotData.tasks).map((task) => ({
      ...task,
      lastUpdated: now,
    }));
    const restoredTaskIds = new Set(restoredTasks.map((task) => String(task.id)));
    const currentFingerprint = stableDocId(JSON.stringify(currentTasks.map((task) => stripCommandTaskState(task))));

    if (currentTasks.length > 0) {
      const backupRef = userRef.collection("taskSnapshots").doc();
      transaction.set(backupRef, {
        source: "pre_restore_backup",
        kind: "pre_restore_backup",
        reason: `before_restore_${snapshotId}`,
        userId,
        taskCount: currentTasks.length,
        score: typeof current.score === "number" ? current.score : 0,
        fingerprint: currentFingerprint,
        capturedAt: now,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        tasks: stripCommandTaskStateList(currentTasks),
      });
    }

    restoredTasks.forEach((task) => {
      transaction.set(userRef.collection("tasks").doc(String(task.id)), task);
    });

    currentTasks.forEach((task) => {
      const taskId = String(task?.id || "");
      if (!taskId || restoredTaskIds.has(taskId)) return;
      transaction.delete(userRef.collection("tasks").doc(taskId));
    });

    const nextScore = typeof snapshotData.score === "number"
      ? snapshotData.score
      : typeof current.score === "number"
        ? current.score
        : 0;
    transaction.set(userRef, {
      score: nextScore,
      telegramContext: buildTelegramContext(restoredTasks[0] || null, "snapshot_restore"),
    }, { merge: true });

    const eventId = `snapshot_restored_${snapshotId}_${now}`;
    const event = buildSnapshotRestoredCommandEvent({
      eventId,
      snapshotId,
      restoredTasks,
      currentTasks,
      snapshotData,
      actor,
      source,
      now,
    });
    transaction.set(userRef.collection("plannerEvents").doc(eventId), event);
    writeCommandReportItem(transaction, userRef, event, buildSnapshotRestoredReportSpec({ restoredCount: restoredTasks.length }));

    const result = {
      ok: true,
      outcome: "restored",
      restoredTaskIds: restoredTasks.map((task) => String(task.id)),
      restoredCount: restoredTasks.length,
      score: nextScore,
      eventId,
      reused: false,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType,
        source,
        actor,
        outcome: result.outcome,
        result,
        now,
        extra: { snapshotId },
      }));
    }

    return result;
  });
}

async function createSnapshotCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  if (!userId) throw new Error("userId is required");

  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const [current, nonActiveTasks] = await Promise.all([
    getPlannerData(userId),
    getNonActiveTasks(userId),
  ]);
  const snapshotTasks = stripCommandTaskStateList([
    ...(Array.isArray(current.tasks) ? current.tasks : []),
    ...(Array.isArray(nonActiveTasks) ? nonActiveTasks : []),
  ]);
  const source = String(command.source || actor?.ref || "command_service");
  const snapshotSource = String(command.snapshotSource || command.sourceLabel || "manual_web");
  const reason = String(command.reason || "manual_snapshot");
  const commandType = PLANNER_COMMAND_TYPES.CREATE_SNAPSHOT;
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;

  return db.runTransaction(async (transaction) => {
    if (commandRef) {
      const commandSnap = await transaction.get(commandRef);
      if (commandSnap.exists) {
        return reusePlannerCommand(transaction, commandRef, commandSnap, now);
      }
    }

    const snapshotRef = userRef.collection("taskSnapshots").doc();
    const fingerprint = stableDocId(JSON.stringify(snapshotTasks));
    transaction.set(snapshotRef, {
      source: snapshotSource,
      kind: "manual",
      reason,
      userId,
      taskCount: snapshotTasks.length,
      score: typeof current.score === "number" ? current.score : 0,
      fingerprint,
      capturedAt: now,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      tasks: snapshotTasks,
    });

    const eventId = `snapshot_created_${snapshotRef.id}_${now}`;
    const event = buildSnapshotCreatedCommandEvent({
      eventId,
      snapshotId: snapshotRef.id,
      snapshotSource,
      taskCount: snapshotTasks.length,
      reason,
      actor,
      source,
      now,
    });
    transaction.set(userRef.collection("plannerEvents").doc(eventId), event);

    const result = {
      ok: true,
      outcome: "created",
      snapshotId: snapshotRef.id,
      taskCount: snapshotTasks.length,
      eventId,
      reused: false,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType,
        source,
        actor,
        outcome: result.outcome,
        result,
        now,
        extra: { snapshotId: snapshotRef.id },
      }));
    }

    return result;
  });
}

async function repairProtectedTasksCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  if (!userId) throw new Error("userId is required");

  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const [current, nonActiveTasks] = await Promise.all([
    getPlannerData(userId),
    getNonActiveTasks(userId),
  ]);
  const currentTasks = [
    ...(Array.isArray(current.tasks) ? current.tasks : []),
    ...(Array.isArray(nonActiveTasks) ? nonActiveTasks : []),
  ];
  const requestedTaskIds = new Set(
    (Array.isArray(command.taskIds) ? command.taskIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const source = String(command.source || actor?.ref || "command_service");
  const commandType = PLANNER_COMMAND_TYPES.REPAIR_PROTECTED_TASKS;
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;
  const candidateTasks = currentTasks.filter((task) => (
    shouldRepairProtectedDeadTask(task) &&
    (requestedTaskIds.size === 0 || requestedTaskIds.has(String(task.id)))
  ));

  return db.runTransaction(async (transaction) => {
    if (commandRef) {
      const commandSnap = await transaction.get(commandRef);
      if (commandSnap.exists) {
        return reusePlannerCommand(transaction, commandRef, commandSnap, now);
      }
    }

    if (candidateTasks.length === 0) {
      const result = {
        ok: true,
        outcome: "noop",
        repairedTasks: [],
        repairedTaskIds: [],
        repairedCount: 0,
        reused: false,
      };
      if (commandRef) {
        writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
          id: commandKey,
          commandType,
          source,
          actor,
          outcome: result.outcome,
          result,
          now,
        }), { merge: true });
      }
      return result;
    }

    const freshCandidateSnaps = new Map();
    for (const task of candidateTasks) {
      const taskId = String(task.id);
      freshCandidateSnaps.set(taskId, await transaction.get(userRef.collection("tasks").doc(taskId)));
    }

    let nextActivePosition = getNextStatusPosition(currentTasks, "active");
    const repairedTasks = [];

    candidateTasks.forEach((candidateTask) => {
      const taskId = String(candidateTask.id);
      const freshSnap = freshCandidateSnaps.get(taskId);
      const freshTask = freshSnap?.exists ? freshSnap.data() || candidateTask : candidateTask;
      if (!shouldRepairProtectedDeadTask(freshTask)) return;

      const repairedTask = {
        ...freshTask,
        status: "active",
        deadAt: null,
        heatBase: typeof freshTask.heatBase === "number" ? freshTask.heatBase : 35,
        heatCurrent: 35,
        position: nextActivePosition,
        lastUpdated: now,
      };
      nextActivePosition += 1;
      repairedTasks.push(repairedTask);
      transaction.set(userRef.collection("tasks").doc(taskId), repairedTask, { merge: true });

      const normalizedTitle = normalizeCommandTaskTitle(repairedTask.text || "");
      if (normalizedTitle) {
        transaction.set(userRef.collection(TASK_TITLE_INDEX_COLLECTION).doc(stableDocId(normalizedTitle)), {
          normalizedTitle,
          taskId,
          taskText: String(repairedTask.text || ""),
          status: "active",
          updatedAt: now,
          updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });

    if (repairedTasks.length === 0) {
      const result = {
        ok: true,
        outcome: "noop",
        repairedTasks: [],
        repairedTaskIds: [],
        repairedCount: 0,
        reused: false,
      };
      if (commandRef) {
        writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
          id: commandKey,
          commandType,
          source,
          actor,
          outcome: result.outcome,
          result,
          now,
        }), { merge: true });
      }
      return result;
    }

    transaction.set(userRef, {
      telegramContext: buildTelegramContext(repairedTasks[0], "protected_task_repair"),
    }, { merge: true });

    const eventId = `protected_tasks_repaired_${now}`;
    const event = buildProtectedTasksRepairedCommandEvent({
      eventId,
      repairedTasks,
      reason: command.reason,
      actor,
      source,
      now,
    });
    transaction.set(userRef.collection("plannerEvents").doc(eventId), event);
    writeCommandReportItem(transaction, userRef, event, buildProtectedTasksRepairedReportSpec({ repairedTasks }));

    const result = {
      ok: true,
      outcome: "repaired",
      repairedTaskIds: repairedTasks.map((task) => String(task.id)),
      repairedCount: repairedTasks.length,
      eventId,
      reused: false,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType,
        source,
        actor,
        outcome: result.outcome,
        result,
        now,
      }));
    }

    return result;
  });
}

async function deleteTasksForeverCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  if (!userId) throw new Error("userId is required");
  const taskIds = [...new Set([
    String(command.taskId || command.targetTaskId || "").trim(),
    ...(Array.isArray(command.taskIds) ? command.taskIds : []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean))].slice(0, 80);
  if (taskIds.length === 0) throw new Error("taskIds are required");

  const db = getDb();
  const userRef = db.collection("Users").doc(userId);
  const [current, nonActiveTasks] = await Promise.all([
    getPlannerData(userId),
    getNonActiveTasks(userId),
  ]);
  const source = String(command.source || actor?.ref || "command_service");
  const commandType = PLANNER_COMMAND_TYPES.TASK_DELETE_FOREVER;
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  const commandRef = commandKey ? userRef.collection(PLANNER_COMMAND_COLLECTION).doc(commandKey) : null;

  return db.runTransaction(async (transaction) => {
    if (commandRef) {
      const commandSnap = await transaction.get(commandRef);
      if (commandSnap.exists) {
        return reusePlannerCommand(transaction, commandRef, commandSnap, now);
      }
    }

    const tasks = [
      ...(Array.isArray(current.tasks) ? current.tasks : []),
      ...(Array.isArray(nonActiveTasks) ? nonActiveTasks : []),
    ];
    const tasksById = new Map(tasks.map((task) => [String(task.id), task]));
    const deletedTasks = taskIds
      .map((taskId) => tasksById.get(String(taskId)))
      .filter(Boolean);

    if (deletedTasks.length === 0) {
      const result = {
        ok: true,
        outcome: "noop",
        deletedTasks: [],
        deletedTaskIds: [],
        scoreDelta: 0,
        reused: false,
      };
      if (commandRef) {
        writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
          id: commandKey,
          commandType,
          source,
          actor,
          outcome: result.outcome,
          result,
          now,
        }), { merge: true });
      }
      return result;
    }

    deletedTasks.forEach((task) => {
      transaction.delete(userRef.collection("tasks").doc(String(task.id)));
      const normalizedTitle = normalizeCommandTaskTitle(task.text || "");
      if (normalizedTitle) {
        transaction.set(userRef.collection(TASK_TITLE_INDEX_COLLECTION).doc(stableDocId(normalizedTitle)), {
          normalizedTitle,
          taskId: String(task.id),
          taskText: String(task.text || ""),
          status: "deleted",
          updatedAt: now,
          updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });

    const scoreDelta = -10 * deletedTasks.filter((task) => task.status === "completed").length;
    if (scoreDelta !== 0) {
      transaction.set(userRef, {
        score: admin.firestore.FieldValue.increment(scoreDelta),
      }, { merge: true });
    }

    const eventId = `task_deleted_forever_${now}`;
    const event = buildTaskDeletedForeverCommandEvent({
      eventId,
      deletedTasks,
      scoreDelta,
      actor,
      source,
      now,
    });
    transaction.set(userRef.collection("plannerEvents").doc(eventId), event);

    const result = {
      ok: true,
      outcome: "deleted",
      deletedTasks,
      deletedTaskIds: deletedTasks.map((task) => String(task.id)),
      scoreDelta,
      eventId,
      reused: false,
    };

    if (commandRef) {
      writePlannerCommandRecord(transaction, commandRef, buildPlannerCommandRecord({
        id: commandKey,
        commandType,
        source,
        actor,
        outcome: result.outcome,
        result,
        now,
      }), { merge: true });
    }

    return result;
  });
}

async function runPlannerCommand({ userId, command = {}, actor = {}, now = Date.now() }) {
  const type = String(command.type || command.commandType || "").trim().toUpperCase();
  if (type === PLANNER_COMMAND_TYPES.CREATE_OR_MERGE_TASK || type === PLANNER_COMMAND_TYPES.TASK_CREATE || type === PLANNER_COMMAND_TYPES.CREATE_TASK) {
    return createOrMergeTaskCommand({ userId, command, actor, now });
  }
  if (type === PLANNER_COMMAND_TYPES.TASK_REORDER) {
    return reorderActiveTaskCommand({ userId, command, actor, now });
  }
  if (type === PLANNER_COMMAND_TYPES.BULK_MOVE_COMPLETED_TO_CEMETERY) {
    return bulkMoveCompletedToCemeteryCommand({ userId, command, actor, now });
  }
  if (type === PLANNER_COMMAND_TYPES.TASK_DELETE_FOREVER) {
    return deleteTasksForeverCommand({ userId, command, actor, now });
  }
  if (type === PLANNER_COMMAND_TYPES.RESTORE_SNAPSHOT) {
    return restoreSnapshotCommand({ userId, command, actor, now });
  }
  if (type === PLANNER_COMMAND_TYPES.CREATE_SNAPSHOT) {
    return createSnapshotCommand({ userId, command, actor, now });
  }
  if (type === PLANNER_COMMAND_TYPES.REPAIR_PROTECTED_TASKS) {
    return repairProtectedTasksCommand({ userId, command, actor, now });
  }
  if (type === PLANNER_COMMAND_TYPES.TASK_APPLY_EXTRACTION_HINTS) {
    return applyExtractionHintsCommand({ userId, command, actor, now });
  }
  if (type === PLANNER_COMMAND_TYPES.SET_PLANNER_CONTEXT) {
    return setPlannerContextCommand({ userId, command, actor, now });
  }
  if (type === PLANNER_COMMAND_TYPES.LINK_TELEGRAM_CHAT) {
    return linkTelegramChatCommand({ userId, command, actor, now });
  }
  if ([
    PLANNER_COMMAND_TYPES.TASK_COMPLETE,
    PLANNER_COMMAND_TYPES.TASK_MOVE_TO_CEMETERY,
    PLANNER_COMMAND_TYPES.TASK_REOPEN,
    PLANNER_COMMAND_TYPES.TASK_TOUCH,
    PLANNER_COMMAND_TYPES.TASK_RESCUE_ABORTED,
    PLANNER_COMMAND_TYPES.TASK_RESCUE_CLOSED_LATER,
    PLANNER_COMMAND_TYPES.TASK_RESCUE_STARTED,
    PLANNER_COMMAND_TYPES.TASK_RESCUE_SHIFT_RECORDED,
    PLANNER_COMMAND_TYPES.TASK_RESCUE_COMPLETED,
    PLANNER_COMMAND_TYPES.TASK_ADD_TIME,
    PLANNER_COMMAND_TYPES.TASK_EDIT_TASK,
    PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK,
    PLANNER_COMMAND_TYPES.TASK_EDIT_SUBTASK,
    PLANNER_COMMAND_TYPES.TASK_SUBTASK_TOGGLED,
    PLANNER_COMMAND_TYPES.TASK_DELETE_SUBTASK,
    PLANNER_COMMAND_TYPES.TASK_SET_TODAY,
    PLANNER_COMMAND_TYPES.TASK_UNSET_TODAY,
    PLANNER_COMMAND_TYPES.TASK_SET_VITAL,
    PLANNER_COMMAND_TYPES.TASK_UNSET_VITAL,
    PLANNER_COMMAND_TYPES.TASK_SET_URGENCY,
    PLANNER_COMMAND_TYPES.TASK_SET_RESISTANCE,
    PLANNER_COMMAND_TYPES.TASK_SET_DEADLINE,
    PLANNER_COMMAND_TYPES.TASK_SET_HEAT_ZONE,
    PLANNER_COMMAND_TYPES.TASK_MARK_NOT_YOUR_MOVE,
    PLANNER_COMMAND_TYPES.TASK_CLEAR_NOT_YOUR_MOVE,
    PLANNER_COMMAND_TYPES.TASK_SET_CHECKIN,
  ].includes(type)) {
    return mutateSingleTaskCommand({ userId, command, actor, now });
  }
  throw new Error(`Unsupported planner command: ${type || "unknown"}`);
}

module.exports = {
  normalizeCommandTaskTitle,
  runPlannerCommand,
};
