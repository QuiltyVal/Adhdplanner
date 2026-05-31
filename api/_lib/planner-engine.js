const { createHash, randomUUID } = require("node:crypto");
const { getDb, admin } = require("./firebase-admin");
const {
  getFirstOpenSubtask,
  getMissionSelection,
  getPlannerData,
  getTaskHeat,
} = require("./planner-store");
const {
  buildOutboxCandidate,
  getOutboxStatusSnapshots,
  writeOutboxIfMissing,
} = require("./planner-outbox-contract");
const {
  buildPlannerHealthSnapshot,
} = require("./planner-health-snapshot");
const { buildPlannerBootstrapPayload } = require("./planner-bootstrap-contract");
const {
  buildPlannerDecisionSnapshot,
  buildPlannerInboxSnapshot,
} = require("./planner-engine-snapshots");
const {
  buildEngineRunSummaryContract,
  buildEngineTriggerMetaPatch,
} = require("./planner-engine-run-contract");
const {
  buildReportAckPatch,
  buildReportAckResponse,
  isReportItemAcknowledged,
} = require("./planner-report-projector");
const {
  buildAtRiskReportSpec,
  buildDevilDeathReportSpec,
  buildEngineRunSummaryReportSpec,
  buildMissionReportSpec,
  buildRescueReportSpec,
} = require("./planner-engine-report-specs");
const {
  buildDeliveryStatus,
  buildOutboxDrainResponse,
  buildOutboxDrainRun,
  buildOutboxDeliveryEventSpec,
  buildOutboxQueuedEventSpec,
  buildOutboxRunResult,
  classifyDeliveryError,
  deliverOutboxItem,
} = require("./planner-delivery-runtime");
const {
  getTelegramChatHash,
  getTelegramTargetChatId,
  getTelegramTargetSource,
} = require("./telegram-chat-identity");
const {
  normalizeEvent,
  writeEvent,
  writeEventBatch,
  writeEventDirect,
  writeReportItem,
} = require("./planner-event-contract");
const {
  buildCounts,
  buildPlannerReasonExplanation,
  buildPlannerReasonLine,
  calculateTaskHeat,
  compactIdPart,
  getAtRiskTasks,
  getNextStatusPosition,
  isAutoDeathProtected,
  pickSuggestedRescueTask,
} = require("./planner-engine-rules");
const {
  getBerlinParts,
  getScheduledNudgeSlot,
} = require("./planner-nudge-schedule");
const { buildDeathNotificationOutboxPayloads } = require("./planner-death-notification-outbox");
const { buildScheduledNudgeOutboxPayload } = require("./planner-scheduled-nudge-outbox");

const ENGINE_LOCK_MS = 60 * 1000;
const DEVIL_AUTO_CLEAN_THRESHOLD = 5;
const DEVIL_AUTO_CLEAN_COOLDOWN_MS = 30 * 60 * 1000;
const OUTBOX_DELIVERY_DEDUPE_LOCK_MS = 2 * 60 * 60 * 1000;

function userRef(userId) {
  return getDb().collection("Users").doc(String(userId));
}

function buildOutboxDrainDedupeKey(item = {}) {
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const channel = String(item.channel || "");
  const topic = String(item.topic || "");
  const explicitDeliveryKey = String(
    item.delivery_dedupe_key ||
    item.deliveryDedupeKey ||
    payload.deliveryDedupeKey ||
    payload.delivery_dedupe_key ||
    "",
  ).trim();
  if (channel && topic && explicitDeliveryKey) return [channel, topic, explicitDeliveryKey].join("|");
  const messageKey = String(payload.messageKey || payload.message_key || "");
  const slot = String(payload.params?.slot || "");
  const taskText = String(payload.taskText || "");
  const text = String(payload.text || "").slice(0, 240);
  if (!channel || !topic || (!messageKey && !slot && !taskText && !text)) return "";
  return [channel, topic, messageKey, slot, taskText, text].join("|");
}

function buildOutboxDeliveryDedupeId(duplicateKey = "") {
  return createHash("sha256").update(String(duplicateKey || "")).digest("hex").slice(0, 48);
}

async function claimOutboxDeliveryDedupe(baseUserRef, duplicateKey, itemId, now = Date.now()) {
  if (!duplicateKey) return { claimed: true, duplicateKey: "" };
  const ref = baseUserRef.collection("outboxDeliveryDedupe").doc(buildOutboxDeliveryDedupeId(duplicateKey));
  return getDb().runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists ? snap.data() || {} : {};
    const existingStatus = String(existing.status || "");
    const existingExpiresAt = Number(existing.expiresAt || existing.expires_at || 0);
    if (snap.exists && existingExpiresAt > now && (existingStatus === "sending" || existingStatus === "sent")) {
      return {
        claimed: false,
        duplicateKey,
        reason: existingStatus === "sent" ? "duplicate_delivery_already_sent" : "duplicate_delivery_in_flight",
        existingItemId: existing.itemId || existing.item_id || null,
      };
    }
    transaction.set(ref, {
      duplicateKey,
      duplicate_key: duplicateKey,
      itemId: String(itemId || ""),
      item_id: String(itemId || ""),
      status: "sending",
      claimedAt: now,
      claimed_at: now,
      expiresAt: now + OUTBOX_DELIVERY_DEDUPE_LOCK_MS,
      expires_at: now + OUTBOX_DELIVERY_DEDUPE_LOCK_MS,
      updatedAt: now,
      updated_at: now,
    }, { merge: true });
    return { claimed: true, duplicateKey, ref };
  });
}

async function finishOutboxDeliveryDedupe(baseUserRef, duplicateKey, status, itemId, now = Date.now()) {
  if (!duplicateKey) return;
  const ref = baseUserRef.collection("outboxDeliveryDedupe").doc(buildOutboxDeliveryDedupeId(duplicateKey));
  const successful = status === "sent";
  await ref.set({
    duplicateKey,
    duplicate_key: duplicateKey,
    itemId: String(itemId || ""),
    item_id: String(itemId || ""),
    status,
    updatedAt: now,
    updated_at: now,
    expiresAt: successful ? now + OUTBOX_DELIVERY_DEDUPE_LOCK_MS : now,
    expires_at: successful ? now + OUTBOX_DELIVERY_DEDUPE_LOCK_MS : now,
    ...(successful ? { sentAt: now, sent_at: now } : {}),
  }, { merge: true });
}

function buildMaintenancePlan(tasks = [], rootData = {}, now = Date.now()) {
  const activeTasks = tasks.filter((task) => task?.status === "active");
  const deadByDecay = [];
  const deadByClean = [];
  const taskUpdates = new Map();
  let deadPosition = getNextStatusPosition(tasks, "dead", now);

  for (const task of activeTasks) {
    const heatCurrent = calculateTaskHeat(task, now);
    if (heatCurrent <= 0 && !isAutoDeathProtected(task)) {
      const deadTask = {
        ...task,
        status: "dead",
        deadAt: now,
        isToday: false,
        heatCurrent: 0,
        lastUpdated: now,
        position: deadPosition,
      };
      deadPosition += 1;
      deadByDecay.push(deadTask);
      taskUpdates.set(String(task.id), { type: "dead", task: deadTask, source: "auto_decay" });
      continue;
    }

    if (Math.abs(getTaskHeat(task) - heatCurrent) > 0.5) {
      taskUpdates.set(String(task.id), {
        type: "heat",
        task: {
          ...task,
          heatCurrent,
          serverHeatUpdatedAt: now,
        },
      });
    }
  }

  const lastAutoCleanAt = Number(rootData?.devilMaintenance?.lastAutoCleanAt || 0);
  const canAutoClean = now - lastAutoCleanAt >= DEVIL_AUTO_CLEAN_COOLDOWN_MS;
  const alreadyDeadIds = new Set(deadByDecay.map((task) => String(task.id)));
  const coldUnprotected = activeTasks
    .filter((task) => !alreadyDeadIds.has(String(task.id)))
    .map((task) => taskUpdates.get(String(task.id))?.task || task)
    .filter((task) => task.status === "active" && getTaskHeat(task) <= 25 && !isAutoDeathProtected(task));

  if (canAutoClean && coldUnprotected.length >= DEVIL_AUTO_CLEAN_THRESHOLD) {
    const toKill = [...coldUnprotected]
      .sort((left, right) => getTaskHeat(left) - getTaskHeat(right))
      .slice(0, 2);

    for (const task of toKill) {
      const deadTask = {
        ...task,
        status: "dead",
        deadAt: now,
        isToday: false,
        heatCurrent: 0,
        lastUpdated: now,
        position: deadPosition,
      };
      deadPosition += 1;
      deadByClean.push(deadTask);
      taskUpdates.set(String(task.id), { type: "dead", task: deadTask, source: "auto_clean" });
    }
  }

  const deadCount = deadByDecay.length + deadByClean.length;
  return {
    taskUpdates,
    deadByDecay,
    deadByClean,
    scorePenalty: deadCount * 5,
    lastAutoCleanAt: deadByClean.length > 0 ? now : lastAutoCleanAt,
  };
}

async function queueDeathNotifications(transaction, baseUserRef, rootData, task, source, event) {
  const payloads = buildDeathNotificationOutboxPayloads(rootData, task, source, event);
  for (const payload of payloads) {
    await writeOutboxIfMissing(transaction, baseUserRef, payload);
  }
}

function buildDeathNotificationCandidates(baseUserRef, rootData, task, source, event) {
  return buildDeathNotificationOutboxPayloads(rootData, task, source, event)
    .map((payload) => buildOutboxCandidate(baseUserRef, payload));
}

async function queueScheduledNudge(transaction, baseUserRef, rootData, task, slot, now, forceNudge = false) {
  const payload = buildScheduledNudgeOutboxPayload(baseUserRef, rootData, task, slot, now, forceNudge);
  if (!payload) return null;
  return writeOutboxIfMissing(transaction, baseUserRef, payload);
}

function buildScheduledNudgeCandidate(baseUserRef, rootData, task, slot, now, forceNudge = false) {
  const payload = buildScheduledNudgeOutboxPayload(baseUserRef, rootData, task, slot, now, forceNudge);
  return payload ? buildOutboxCandidate(baseUserRef, payload) : null;
}

async function runPlannerTick({ userId, now = Date.now(), trigger = "cron", forceNudge = false, slot = null, allowScheduledNudge = true } = {}) {
  if (!userId) throw new Error("runPlannerTick requires userId");

  const db = getDb();
  const baseUserRef = userRef(userId);
  const allTaskSnap = await baseUserRef.collection("tasks").get();
  const taskRefs = allTaskSnap.docs.map((doc) => doc.ref);
  const runId = `engine_${now}_${randomUUID().slice(0, 8)}`;
  const scheduledSlot = allowScheduledNudge ? (slot || getScheduledNudgeSlot(now)) : null;
  let result = {
    ok: true,
    runId,
    trigger,
    locked: false,
    heatUpdated: 0,
    deadTasks: [],
    events: [],
    outboxQueued: 0,
    plannerMeta: null,
  };

  try {
  await db.runTransaction(async (transaction) => {
    const rootSnap = await transaction.get(baseUserRef);
    const rootData = rootSnap.exists ? rootSnap.data() || {} : {};
    const lock = rootData.plannerEngineLock || {};
    if (Number(lock.expiresAt || 0) > now) {
      const lockedRun = {
        id: runId,
        run_id: runId,
        trigger,
        status: "locked",
        started_at: now,
        finished_at: now,
        stats: {
          heatUpdated: 0,
          deadCount: 0,
          outboxQueued: 0,
          eventCount: 0,
        },
      };
      transaction.set(baseUserRef.collection("engineRuns").doc(runId), {
        ...lockedRun,
        lock,
        createdAt: now,
        createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(baseUserRef, {
        plannerMeta: {
          ...(rootData.plannerMeta || {}),
          last_engine_run: lockedRun,
          ...buildEngineTriggerMetaPatch(trigger, lockedRun),
        },
      }, { merge: true });
      result = { ...result, locked: true, lock };
      return;
    }

    const taskSnaps = [];
    for (const ref of taskRefs) taskSnaps.push(await transaction.get(ref));
    const tasks = taskSnaps.filter((snap) => snap.exists).map((snap) => snap.data() || {});
    const plan = buildMaintenancePlan(tasks, rootData, now);
    const updatedById = new Map();
    let heatUpdated = 0;

    for (const [taskId, update] of plan.taskUpdates.entries()) {
      if (update.type === "heat") {
        heatUpdated += 1;
      }
      updatedById.set(taskId, update.task);
    }

    const nextTasks = tasks.map((task) => updatedById.get(String(task.id)) || task);
    const activeTasks = nextTasks.filter((task) => task?.status === "active");
    const mission = getMissionSelection(activeTasks);
    const rescue = pickSuggestedRescueTask(activeTasks, mission.task);
    const missionExplanation = buildPlannerReasonExplanation(mission.reason || "empty", mission.task, "mission");
    const rescueExplanation = buildPlannerReasonExplanation(rescue.reason || "empty", rescue.task, "rescue");
    const counts = buildCounts(nextTasks);
    const atRiskTasks = getAtRiskTasks(nextTasks);
    const atRiskTaskIds = atRiskTasks.map((task) => String(task.id || "")).filter(Boolean).slice(0, 12);
    const previousMeta = rootData.plannerMeta || {};
    const plannerMeta = {
      ...(previousMeta || {}),
      mission_task_id: mission.task?.id || null,
      mission_reason: mission.reason || "empty",
      mission_explanation: missionExplanation,
      suggested_rescue_task_id: rescue.task?.id || null,
      suggested_rescue_reason: rescue.reason || "empty",
      suggested_rescue_explanation: rescueExplanation,
      at_risk_task_ids: atRiskTaskIds,
      at_risk_count: atRiskTaskIds.length,
      global_counts: counts,
      lastTickAt: now,
      last_engine_run: {
        id: runId,
        run_id: runId,
        trigger,
        status: "ok",
        started_at: now,
        finished_at: now,
        stats: {
          heatUpdated,
          deadCount: 0,
          outboxQueued: 0,
          eventCount: 0,
        },
      },
      updatedAt: now,
    };

    const events = [];
    let outboxQueued = 0;
    const deadTasks = [
      ...plan.deadByDecay.map((task) => ({ task, source: "auto_decay" })),
      ...plan.deadByClean.map((task) => ({ task, source: "auto_clean" })),
    ];
    const deathEventSpecs = deadTasks.map(({ task, source }) => ({
      task,
      source,
      spec: {
        id: `${source}_${String(task.id)}_${task.deadAt || now}`,
        event_type: "TASK_AUTO_MOVED_TO_CEMETERY",
        type: "task_dead",
        actor_type: "engine",
        actor_ref: "devil",
        source,
        entity_type: "task",
        entity_id: String(task.id),
        taskId: String(task.id),
        taskText: String(task.text || ""),
        message: source === "auto_clean"
          ? `Devil cleaned up stale clutter “${String(task.text || "untitled")}” to Cemetery.`
          : `Devil buried stale task “${String(task.text || "untitled")}” to Cemetery.`,
        visible_in_report: true,
        payload: { source, heatCurrent: task.heatCurrent || 0 },
        createdAt: task.deadAt || now,
      },
    }));
    const missionEventSpec =
      previousMeta.mission_task_id !== plannerMeta.mission_task_id && plannerMeta.mission_task_id
        ? {
            id: `mission_selected_${getBerlinParts(now).dateKey}_${plannerMeta.mission_task_id}`,
            event_type: "MISSION_SELECTED",
            type: "mission_selected",
            actor_type: "engine",
            actor_ref: "angel",
            source: "mission_projection",
            entity_type: "task",
            entity_id: plannerMeta.mission_task_id,
            taskId: plannerMeta.mission_task_id,
            taskText: mission.task?.text || "",
            message: `Angel selected today mission: “${mission.task?.text || "task"}”.`,
            visible_in_report: false,
            payload: { reason: plannerMeta.mission_reason },
            createdAt: now,
          }
        : null;
    const rescueEventSpec =
      previousMeta.suggested_rescue_task_id !== plannerMeta.suggested_rescue_task_id && plannerMeta.suggested_rescue_task_id
        ? {
            id: `rescue_selected_${getBerlinParts(now).dateKey}_${plannerMeta.suggested_rescue_task_id}`,
            event_type: "RESCUE_SUGGESTION_SELECTED",
            type: "rescue_suggestion_selected",
            actor_type: "engine",
            actor_ref: "angel",
            source: "rescue_projection",
            entity_type: "task",
            entity_id: plannerMeta.suggested_rescue_task_id,
            taskId: plannerMeta.suggested_rescue_task_id,
            taskText: rescue.task?.text || "",
            message: `Angel selected rescue target: “${rescue.task?.text || "task"}”.`,
            visible_in_report: false,
            payload: { reason: plannerMeta.suggested_rescue_reason },
            createdAt: now,
          }
        : null;
    const previousAtRiskIds = Array.isArray(previousMeta.at_risk_task_ids)
      ? previousMeta.at_risk_task_ids.map((value) => String(value || "")).filter(Boolean)
      : [];
    const atRiskChanged = atRiskTaskIds.join("|") !== previousAtRiskIds.join("|");
    const atRiskEventSpec =
      atRiskChanged && atRiskTaskIds.length > 0
        ? {
            id: `at_risk_${getBerlinParts(now).dateKey}_${atRiskTaskIds.join("_").slice(0, 80)}`,
            event_type: "TASKS_AT_RISK",
            type: "tasks_at_risk",
            actor_type: "engine",
            actor_ref: "devil",
            source: "risk_projection",
            entity_type: "planner",
            entity_id: "at_risk",
            taskId: atRiskTaskIds[0] || null,
            taskText: atRiskTasks[0]?.text || "",
            message: `${atRiskTaskIds.length} task(s) are getting cold.`,
            visible_in_report: false,
            payload: {
              taskIds: atRiskTaskIds,
              taskTitles: atRiskTasks.slice(0, 5).map((task) => task.text || ""),
            },
            createdAt: now,
          }
        : null;
    const outboxCandidates = [];

    for (const { task, source, spec } of deathEventSpecs) {
      const eventForOutbox = normalizeEvent(spec);
      outboxCandidates.push(...buildDeathNotificationCandidates(baseUserRef, rootData, task, source, eventForOutbox));
    }

    if (forceNudge || scheduledSlot) {
      const nudgeTask = rescue.task || mission.task || null;
      const nudgeReason = rescue.task ? rescue.reason : mission.reason;
      const scheduledCandidate = buildScheduledNudgeCandidate(
        baseUserRef,
        rootData,
        nudgeTask ? { ...nudgeTask, plannerNudgeReason: nudgeReason || "" } : null,
        scheduledSlot || "manual",
        now,
        forceNudge,
      );
      if (scheduledCandidate) outboxCandidates.push(scheduledCandidate);
    }

    const uniqueOutboxCandidates = [];
    const seenOutboxCandidateRefs = new Set();
    for (const candidate of outboxCandidates) {
      const refPath = String(candidate?.ref?.path || "");
      if (!refPath || seenOutboxCandidateRefs.has(refPath)) continue;
      seenOutboxCandidateRefs.add(refPath);
      uniqueOutboxCandidates.push(candidate);
    }

    const outboxSnapshots = new Map();
    for (const candidate of uniqueOutboxCandidates) {
      outboxSnapshots.set(candidate.ref.path, await transaction.get(candidate.ref));
    }
    const newOutboxCandidates = uniqueOutboxCandidates.filter((candidate) => {
      const existing = outboxSnapshots.get(candidate.ref.path);
      return !existing?.exists;
    });
    let latestDeliveryStatus = previousMeta.delivery_status || null;

    transaction.set(baseUserRef, {
      plannerEngineLock: {
        runId,
        trigger,
        acquiredAt: now,
        expiresAt: now + ENGINE_LOCK_MS,
      },
    }, { merge: true });

    for (const [taskId, update] of plan.taskUpdates.entries()) {
      const ref = baseUserRef.collection("tasks").doc(taskId);
      if (update.type === "dead") {
        transaction.set(ref, update.task);
      } else if (update.type === "heat") {
        transaction.set(ref, {
          heatCurrent: update.task.heatCurrent,
          serverHeatUpdatedAt: update.task.serverHeatUpdatedAt,
        }, { merge: true });
      }
    }

    for (const { task, source, spec } of deathEventSpecs) {
      const event = writeEvent(transaction, baseUserRef, spec);
      events.push(event);
      writeReportItem(transaction, baseUserRef, buildDevilDeathReportSpec({
        event,
        task,
        source,
        now,
      }));
    }

    if (missionEventSpec) {
      const event = writeEvent(transaction, baseUserRef, missionEventSpec);
      events.push(event);
      writeReportItem(transaction, baseUserRef, buildMissionReportSpec({
        event,
        mission,
        explanation: missionExplanation,
        now,
      }));
    }

    if (rescueEventSpec) {
      const event = writeEvent(transaction, baseUserRef, rescueEventSpec);
      events.push(event);
      writeReportItem(transaction, baseUserRef, buildRescueReportSpec({
        event,
        rescue,
        explanation: rescueExplanation,
        now,
      }));
    }

    if (atRiskEventSpec) {
      const event = writeEvent(transaction, baseUserRef, atRiskEventSpec);
      events.push(event);
      writeReportItem(transaction, baseUserRef, buildAtRiskReportSpec({
        event,
        atRiskTaskIds,
        atRiskTasks,
        now,
      }));
    }

    const summaryAngelCount = [missionEventSpec, rescueEventSpec].filter(Boolean).length;
    const summaryDevilCount = deathEventSpecs.length + (atRiskEventSpec ? 1 : 0);
    const summaryDeliveryCount = newOutboxCandidates.length;
    const summaryTotal = summaryAngelCount + summaryDevilCount + summaryDeliveryCount;
    const engineRunSummary = buildEngineRunSummaryContract({
      runId,
      trigger,
      now,
      heatUpdated,
      deadTasks,
      events,
      outboxCandidates: newOutboxCandidates,
      angelCount: summaryAngelCount,
      devilCount: summaryDevilCount,
      deliveryCount: summaryDeliveryCount,
    });
    if (summaryTotal >= 2) {
      const summaryIdPart = compactIdPart([
        missionEventSpec?.id,
        rescueEventSpec?.id,
        atRiskEventSpec?.id,
        ...deathEventSpecs.map(({ spec }) => spec?.id),
        ...newOutboxCandidates.map((candidate) => candidate?.outbox?.id),
      ].filter(Boolean).join("_")) || runId;
      writeReportItem(transaction, baseUserRef, buildEngineRunSummaryReportSpec({
        runId,
        summaryIdPart,
        angelCount: summaryAngelCount,
        devilCount: summaryDevilCount,
        deliveryCount: summaryDeliveryCount,
        engineRunSummary,
        now,
      }));
    }

    for (const candidate of newOutboxCandidates) {
      transaction.set(candidate.ref, candidate.outbox);
      const queuedEvent = writeEvent(transaction, baseUserRef, buildOutboxQueuedEventSpec(candidate.outbox, now));
      events.push(queuedEvent);
      latestDeliveryStatus = buildDeliveryStatus(candidate.outbox, "queued", now);
      outboxQueued += 1;
    }

    plannerMeta.delivery_status = latestDeliveryStatus;
    plannerMeta.telegram_link_status = {
      ...(plannerMeta.telegram_link_status && typeof plannerMeta.telegram_link_status === "object" ? plannerMeta.telegram_link_status : {}),
      chatHash: getTelegramChatHash(getTelegramTargetChatId(rootData)),
      targetSource: getTelegramTargetSource(rootData),
    };

    plannerMeta.last_engine_run = {
      ...plannerMeta.last_engine_run,
      stats: {
        heatUpdated,
        deadCount: deadTasks.length,
        outboxQueued,
        eventCount: events.length,
      },
      summary: engineRunSummary,
      engineRunSummary,
    };
    Object.assign(plannerMeta, buildEngineTriggerMetaPatch(trigger, plannerMeta.last_engine_run));
    plannerMeta.engine_decisions = buildPlannerDecisionSnapshot({
      mission,
      rescue,
      atRiskTasks,
      deadTasks,
      outboxCandidates: newOutboxCandidates,
      now,
    });
    plannerMeta.engine_inbox = buildPlannerInboxSnapshot({
      activeTasks,
      atRiskTasks,
      deadTasks,
      outboxCandidates: newOutboxCandidates,
      scheduledSlot,
      counts,
      now,
    });
    plannerMeta.health_snapshot = buildPlannerHealthSnapshot(plannerMeta, now);

    const score = typeof rootData.score === "number" ? rootData.score : 0;
    transaction.set(baseUserRef, {
      score: score - plan.scorePenalty,
      plannerMeta,
      plannerEngineLock: {
        runId,
        trigger,
        acquiredAt: now,
        expiresAt: now,
        releasedAt: now,
        status: "released",
      },
      devilMaintenance: {
        ...(rootData.devilMaintenance || {}),
        lastRunAt: now,
        lastAutoCleanAt: plan.lastAutoCleanAt,
        lastDeathTaskIds: deadTasks.map(({ task }) => task.id).slice(0, 10),
        lastDeathCount: deadTasks.length,
      },
    }, { merge: true });

    transaction.set(baseUserRef.collection("engineRuns").doc(runId), {
      id: runId,
      run_id: runId,
      trigger,
      started_at: now,
      finished_at: now,
      status: "ok",
      stats: {
        heatUpdated,
        deadCount: deadTasks.length,
        outboxQueued,
        eventCount: events.length,
      },
      createdAt: now,
      createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
    });

    result = {
      ...result,
      heatUpdated,
      deadTasks: deadTasks.map(({ task, source }) => ({ id: task.id, text: task.text, source })),
      events: events.map((event) => event.id),
      outboxQueued,
      plannerMeta,
    };
  });
  } catch (error) {
    const failedAt = Date.now();
    const failedRun = {
      id: runId,
      run_id: runId,
      trigger,
      status: "failed",
      started_at: now,
      finished_at: failedAt,
      error: error.message || "planner engine failed",
      stats: {
        heatUpdated: 0,
        deadCount: 0,
        outboxQueued: 0,
        eventCount: 0,
      },
    };
    await baseUserRef.collection("engineRuns").doc(runId).set({
      ...failedRun,
      createdAt: now,
      createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await baseUserRef.set({
      plannerEngineLock: {
        runId,
        trigger,
        acquiredAt: now,
        expiresAt: failedAt,
        releasedAt: failedAt,
        status: "failed",
      },
      plannerMeta: {
        last_engine_run: failedRun,
        ...buildEngineTriggerMetaPatch(trigger, failedRun),
      },
    }, { merge: true });
    throw error;
  }

  return result;
}

async function drainOutbox({ userId, now = Date.now(), limit = 20 } = {}) {
  if (!userId) throw new Error("drainOutbox requires userId");

  const db = getDb();
  const baseUserRef = userRef(userId);
  const runId = `outbox_${now}_${randomUUID().slice(0, 8)}`;
  const startedAt = now;
  const statuses = ["pending", "retry"];
  const claimed = [];

  for (const status of statuses) {
    if (claimed.length >= limit) break;
    const snap = await baseUserRef.collection("outbox")
      .where("status", "==", status)
      .limit(limit - claimed.length)
      .get();

    for (const doc of snap.docs) {
      const data = { id: doc.id, ...doc.data() };
      if (Number(data.availableAt || data.available_at || 0) > now) continue;

      const claim = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(doc.ref);
        if (!fresh.exists) return null;
        const item = { id: doc.id, ...fresh.data() };
        if (!["pending", "retry"].includes(item.status)) return null;
        if (Number(item.availableAt || item.available_at || 0) > now) return null;
        transaction.set(doc.ref, {
          status: "sending",
          attempts: Number(item.attempts || 0) + 1,
          claimedAt: now,
          claimed_at: now,
        }, { merge: true });
        return { ...item, attempts: Number(item.attempts || 0) + 1 };
      });

      if (claim) claimed.push({ ref: doc.ref, item: claim });
    }
  }

  const results = [];
  const deliveredKeys = new Set();
  for (const { ref, item } of claimed) {
    const duplicateKey = buildOutboxDrainDedupeKey(item);
    if (duplicateKey && deliveredKeys.has(duplicateKey)) {
      const skippedDelivery = {
        skipped: true,
        reason: "duplicate_outbox_item_in_same_drain",
        duplicateKey,
      };
      await ref.set({
        status: "sent",
        sentAt: Date.now(),
        sent_at: Date.now(),
        delivery_dedupe_key: duplicateKey,
        delivery: skippedDelivery,
      }, { merge: true });
      await writeDeliveryEvent(userId, item, "sent", skippedDelivery);
      results.push(buildOutboxRunResult(item, "sent", { delivery: skippedDelivery }));
      continue;
    }
    if (duplicateKey) deliveredKeys.add(duplicateKey);

    const deliveryDedupe = await claimOutboxDeliveryDedupe(baseUserRef, duplicateKey, item.id, Date.now());
    if (!deliveryDedupe.claimed) {
      const skippedDelivery = {
        skipped: true,
        reason: deliveryDedupe.reason || "duplicate_delivery_suppressed",
        duplicateKey,
        existingItemId: deliveryDedupe.existingItemId || null,
      };
      await ref.set({
        status: "sent",
        sentAt: Date.now(),
        sent_at: Date.now(),
        delivery_dedupe_key: duplicateKey,
        delivery: skippedDelivery,
      }, { merge: true });
      await writeDeliveryEvent(userId, item, "sent", skippedDelivery);
      results.push(buildOutboxRunResult(item, "sent", { delivery: skippedDelivery }));
      continue;
    }

    try {
      const delivery = await deliverOutboxItem(item);
      await finishOutboxDeliveryDedupe(baseUserRef, duplicateKey, "sent", item.id, Date.now());
      await ref.set({
        status: "sent",
        sentAt: Date.now(),
        sent_at: Date.now(),
        delivery_dedupe_key: duplicateKey,
        delivery,
      }, { merge: true });
      await writeDeliveryEvent(userId, item, "sent", delivery);
      results.push(buildOutboxRunResult(item, "sent", { delivery }));
    } catch (error) {
      const diagnostic = classifyDeliveryError(error, item);
      const attempts = Number(item.attempts || 1);
      const permanentFailure = diagnostic.retryable === false;
      const dead = permanentFailure || attempts >= 5;
      const nextStatus = dead ? "dead" : "retry";
      const retryDelayMs = permanentFailure ? 0 : Math.min(60 * 60 * 1000, 2 ** attempts * 60 * 1000);
      await finishOutboxDeliveryDedupe(baseUserRef, duplicateKey, nextStatus, item.id, Date.now());
      await ref.set({
        status: nextStatus,
        last_error: diagnostic.message,
        diagnostic,
        delivery_dedupe_key: duplicateKey,
        availableAt: dead ? null : Date.now() + retryDelayMs,
        available_at: dead ? null : Date.now() + retryDelayMs,
      }, { merge: true });
      await writeDeliveryEvent(userId, item, nextStatus, { error: diagnostic.message, diagnostic });
      results.push(buildOutboxRunResult(item, nextStatus, { error: diagnostic.message, diagnostic }));
    }
  }

  const finishedAt = Date.now();
  const run = buildOutboxDrainRun({
    runId,
    startedAt,
    finishedAt,
    claimed: claimed.length,
    results,
    serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  await baseUserRef.collection("outboxRuns").doc(runId).set(run, { merge: true });
  await baseUserRef.set({
    plannerMeta: {
      last_outbox_drain: run,
    },
  }, { merge: true });

  return buildOutboxDrainResponse({
    runId,
    claimed: claimed.length,
    results,
    run,
  });
}

function getDeliveryHistoryFingerprint(item = {}) {
  return [
    item.outboxId || item.outbox_id || "",
    item.telegramMessageId || item.telegram_message_id || "",
    item.resultAt || item.result_at || item.updatedAt || item.updated_at || "",
  ].map((part) => String(part || "")).join("|");
}

function buildTelegramDeliveryHistory(previousHistory = [], deliveryStatus = {}) {
  const current = deliveryStatus && typeof deliveryStatus === "object" ? deliveryStatus : null;
  if (!current || String(current.channel || "").toLowerCase() !== "telegram") {
    return Array.isArray(previousHistory) ? previousHistory : [];
  }
  const currentKey = getDeliveryHistoryFingerprint(current);
  const previous = Array.isArray(previousHistory) ? previousHistory : [];
  return [
    current,
    ...previous
      .filter((item) => item && typeof item === "object")
      .filter((item) => getDeliveryHistoryFingerprint(item) !== currentKey),
  ].slice(0, 10);
}

async function writeDeliveryEvent(userId, item, status, payload = {}) {
  const baseUserRef = userRef(userId);
  const createdAt = Date.now();
  const rootSnap = await baseUserRef.get();
  const rootData = rootSnap.exists ? rootSnap.data() || {} : {};
  const previousMeta = rootData.plannerMeta && typeof rootData.plannerMeta === "object" ? rootData.plannerMeta : {};
  const deliveryStatus = buildDeliveryStatus(item, status, createdAt, payload);
  const channelKey = String(deliveryStatus.channel || "").toLowerCase();
  const previousChannels = previousMeta.delivery_channels && typeof previousMeta.delivery_channels === "object"
    ? previousMeta.delivery_channels
    : {};
  const deliveryChannels = channelKey
    ? { ...previousChannels, [channelKey]: deliveryStatus }
    : previousChannels;
  const deliveryTelegramHistory = channelKey === "telegram"
    ? buildTelegramDeliveryHistory(previousMeta.delivery_telegram_history, deliveryStatus)
    : previousMeta.delivery_telegram_history;
  const healthSnapshot = buildPlannerHealthSnapshot({
    ...previousMeta,
    delivery_status: deliveryStatus,
    delivery_channels: deliveryChannels,
    ...(channelKey === "telegram" ? { delivery_telegram_history: deliveryTelegramHistory } : {}),
  }, createdAt);
  const event = await writeEventDirect(
    baseUserRef,
    buildOutboxDeliveryEventSpec(item, status, payload, createdAt),
  );
  await baseUserRef.set({
    plannerMeta: {
      delivery_status: deliveryStatus,
      delivery_channels: deliveryChannels,
      ...(channelKey === "telegram" ? { delivery_telegram_history: deliveryTelegramHistory } : {}),
      health_snapshot: healthSnapshot,
    },
  }, { merge: true });
  return event;
}

async function getPlannerBootstrap(userId, { reportCursor = null, reportLimit = 10, language = "" } = {}) {
  const plannerData = await getPlannerData(userId);
  const baseUserRef = userRef(userId);
  const [rootSnap, tasksSnap, reportSnap, reportHistorySnap, eventSnap, engineRunSnap, outboxRunSnap, outboxStatusSnaps, commandSnap] = await Promise.all([
    baseUserRef.get(),
    baseUserRef.collection("tasks").get(),
    baseUserRef.collection("reportItems")
      .where("seenAt", "==", null)
      .limit(reportLimit)
      .get(),
    baseUserRef.collection("reportItems")
      .orderBy("createdAt", "desc")
      .limit(30)
      .get(),
    baseUserRef.collection("plannerEvents")
      .orderBy("createdAt", "desc")
      .limit(60)
      .get(),
    baseUserRef.collection("engineRuns")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get(),
    baseUserRef.collection("outboxRuns")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get(),
    getOutboxStatusSnapshots(baseUserRef),
    baseUserRef.collection("plannerCommands")
      .orderBy("createdAt", "desc")
      .limit(12)
      .get(),
  ]);
  const rootData = rootSnap.exists ? rootSnap.data() || {} : {};
  return await buildPlannerBootstrapPayload({
    userId,
    plannerData,
    rootData,
    tasksSnap,
    reportSnap,
    reportHistorySnap,
    eventSnap,
    engineRunSnap,
    outboxRunSnap,
    outboxStatusSnaps,
    commandSnap,
    reportCursor,
    language,
    now: Date.now(),
  });
}

async function ackReportItems(userId, reportItemIds = [], now = Date.now(), options = {}) {
  const explicitIds = reportItemIds.map((value) => String(value || "").trim()).filter(Boolean);
  const baseUserRef = userRef(userId);
  let unreadIds = [];
  if (options?.ackAllUnread === true) {
    const [nullSeenSnap, recentSnap] = await Promise.all([
      baseUserRef.collection("reportItems")
        .where("seenAt", "==", null)
        .limit(200)
        .get(),
      baseUserRef.collection("reportItems")
        .orderBy("createdAt", "desc")
        .limit(200)
        .get(),
    ]);
    unreadIds = [...nullSeenSnap.docs, ...recentSnap.docs]
      .map((doc) => ({ id: String(doc.id || "").trim(), ...(doc.data() || {}) }))
      .filter((item) => item.id && String(item.surface || "login") === "login")
      .filter((item) => !isReportItemAcknowledged(item))
      .map((item) => item.id);
  }
  const ids = [...new Set([...explicitIds, ...unreadIds])].slice(0, 220);
  if (!ids.length) return buildReportAckResponse({ acknowledged: 0 });
  const batch = getDb().batch();
  ids.forEach((id) => {
    batch.set(baseUserRef.collection("reportItems").doc(id), buildReportAckPatch({ now, source: "client" }), { merge: true });
  });
  const event = writeEventBatch(batch, baseUserRef, {
    id: `report_ack_${now}_${randomUUID().slice(0, 8)}`,
    event_type: "REPORT_ITEMS_ACKED",
    type: "report_items_acked",
    actor_type: "user",
    actor_ref: "client",
    source: "client",
    entity_type: "report_items",
    entity_id: ids[0] || "",
    message: `Acknowledged ${ids.length} report item(s).`,
    visible_in_feed: false,
    visible_in_report: false,
    payload: {
      contractVersion: 1,
      reportItemIds: ids,
      acknowledged: ids.length,
    },
    createdAt: now,
  }, { merge: true });
  await batch.commit();
  return buildReportAckResponse({
    acknowledged: ids.length,
    eventId: event.id,
    acknowledgedAt: now,
  });
}

module.exports = {
  ackReportItems,
  calculateTaskHeat,
  drainOutbox,
  getPlannerBootstrap,
  runPlannerTick,
};
