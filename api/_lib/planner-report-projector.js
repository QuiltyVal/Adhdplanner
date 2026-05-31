const { getDb, admin } = require("./firebase-admin");
const { formatReportMessage } = require("./planner-delivery-messages");

function getReportPersonaFromEvent(event = {}) {
  const actor = String(event.actor || event.actor_type || event.actorType || "").toLowerCase();
  if (actor === "angel" || actor === "devil" || actor === "system" || actor === "user") return actor;
  const eventType = String(event.event_type || event.eventType || event.type || "").toUpperCase();
  if (eventType.includes("CEMETERY") || eventType.includes("DEAD")) return "devil";
  if (eventType.includes("OUTBOX")) return "system";
  return "angel";
}

function buildPlannerReportItem({
  userId = "",
  id = "",
  createdAt = Date.now(),
  kind = "system_change",
  sourceEventId = null,
  sourceType = "planner_event",
  projector = "planner-report-projector",
  sourceEventType = "PLANNER_EVENT",
  projection = {},
  title = "",
  body = "",
  persona = "neutral",
  surface = "login",
  messageKey = "",
  params = {},
  seenAt = null,
  severity = 1,
} = {}) {
  const normalizedCreatedAt = Number(createdAt || Date.now());
  const normalizedId = String(id || `report_${sourceEventId || `${sourceEventType}_${normalizedCreatedAt}`}`);
  const normalizedMessageKey = String(messageKey || "event_projection");
  const normalizedSeenAt = seenAt === null || typeof seenAt === "undefined"
    ? null
    : Number(seenAt || normalizedCreatedAt);
  return {
    contractVersion: 1,
    id: normalizedId,
    report_item_id: normalizedId,
    user_id: String(userId || ""),
    created_at: normalizedCreatedAt,
    createdAt: normalizedCreatedAt,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
    kind: String(kind || "system_change"),
    source_event_id: sourceEventId || null,
    sourceEventId: sourceEventId || null,
    sourceType: String(sourceType || "planner_event"),
    projection: {
      version: 1,
      projectedAt: Date.now(),
      projector: String(projector || "planner-report-projector"),
      sourceEventType: String(sourceEventType || "PLANNER_EVENT"),
      ...(projection && typeof projection === "object" ? projection : {}),
    },
    title: String(title || ""),
    body: String(body || title || ""),
    persona: String(persona || "neutral"),
    surface: String(surface || "login"),
    message_key: normalizedMessageKey,
    messageKey: normalizedMessageKey,
    params: params && typeof params === "object" ? params : {},
    seen_at: normalizedSeenAt,
    seenAt: normalizedSeenAt,
    severity: Number.isFinite(Number(severity)) ? Number(severity) : 1,
  };
}

function buildReportAckPatch({ now = Date.now(), source = "client" } = {}) {
  const acknowledgedAt = Number(now || Date.now());
  return {
    seenAt: acknowledgedAt,
    seen_at: acknowledgedAt,
    ack: {
      contractVersion: 1,
      ackedAt: acknowledgedAt,
      source: String(source || "client"),
    },
  };
}

function buildReportAckResponse({ acknowledged = 0, eventId = "", acknowledgedAt = null } = {}) {
  const response = {
    ok: true,
    contractVersion: 1,
    acknowledged: Number(acknowledged || 0),
    eventId: String(eventId || ""),
  };
  if (acknowledgedAt !== null && typeof acknowledgedAt !== "undefined") {
    response.acknowledgedAt = Number(acknowledgedAt || Date.now());
  }
  return response;
}

function getReportItemAckTime(item = {}) {
  const seenAt = Number(item?.seenAt || item?.seen_at || 0);
  if (seenAt > 0) return seenAt;

  const ackedAt = Number(item?.ack?.ackedAt || item?.ack?.acked_at || 0);
  if (ackedAt > 0) return ackedAt;

  return 0;
}

function isReportItemAcknowledged(item = {}) {
  return getReportItemAckTime(item) > 0;
}

function writePlannerReportItemTransaction(transaction, userRef, report = {}, options = {}) {
  if (!transaction || !userRef || !report?.id) return null;
  const writeOptions = options && Object.keys(options).length > 0 ? options : { merge: true };
  const reportForWrite = { ...report };
  if (writeOptions.merge && reportForWrite.seenAt === null && reportForWrite.seen_at === null) {
    delete reportForWrite.seenAt;
    delete reportForWrite.seen_at;
  }
  transaction.set(userRef.collection("reportItems").doc(String(report.id)), reportForWrite, writeOptions);
  return report;
}

function buildEngineNarrationReportSpec({
  event = {},
  messageKey = "",
  params = {},
  persona = "system",
  title = "Planner update",
  kind = "system_change",
  severity = 1,
  createdAt = Date.now(),
} = {}) {
  const sourceEventId = String(event.id || event.event_id || "");
  return {
    id: `report_${sourceEventId || `${messageKey || "engine"}_${createdAt}`}`,
    source_event_id: sourceEventId,
    kind,
    persona,
    severity,
    title,
    body: formatReportMessage({ messageKey, params }) || String(event.message || title || "Planner update"),
    message_key: messageKey,
    params,
    createdAt,
  };
}

function buildReportItemFromEvent(userId = "", event = {}) {
  const createdAt = Number(event.createdAt || event.created_at || Date.now());
  const eventId = String(event.id || event.event_id || "");
  const eventType = String(event.event_type || event.eventType || event.type || "PLANNER_EVENT");
  const taskText = String(event.taskText || event.payload?.taskText || "").trim();
  const message = String(event.message || "").trim();
  const title = taskText
    ? `${eventType.replace(/_/g, " ").toLowerCase()}: ${taskText}`
    : eventType.replace(/_/g, " ").toLowerCase();
  const id = `report_${eventId || `${eventType}_${createdAt}`}`;

  return buildPlannerReportItem({
    id,
    createdAt,
    userId,
    kind: String(event.kind || "system_change"),
    sourceEventId: eventId || null,
    sourceType: "planner_event",
    projector: "planner-report-projector",
    sourceEventType: eventType,
    title,
    body: message || title,
    persona: getReportPersonaFromEvent(event),
    surface: "login",
    messageKey: String(event.payload?.messageKey || event.payload?.message_key || event.message_key || event.messageKey || "event_projection"),
    params: event.payload && typeof event.payload === "object" ? event.payload : {},
    severity: Number.isFinite(Number(event.severity)) ? Number(event.severity) : 1,
  });
}

async function projectReportItemsFromRecentEvents({
  userId,
  now = Date.now(),
  limit = 40,
} = {}) {
  if (!userId) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_userId",
      projected: 0,
    };
  }

  const userRef = getDb().collection("Users").doc(String(userId));
  const snap = await userRef
    .collection("plannerEvents")
    .orderBy("createdAt", "desc")
    .limit(Math.min(80, Math.max(1, Number(limit || 40))))
    .get();

  const events = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((event) => event?.visible_in_report === true)
    .filter((event) => Number(event.createdAt || event.created_at || 0) > now - 24 * 60 * 60 * 1000);

  if (events.length === 0) {
    return {
      ok: true,
      projected: 0,
      checked: 0,
    };
  }

  let projected = 0;
  const batch = getDb().batch();
  for (const event of events) {
    const report = buildReportItemFromEvent(userId, event);
    const reportRef = userRef.collection("reportItems").doc(report.id);
    const reportSnap = await reportRef.get();
    if (reportSnap.exists) continue;
    batch.set(reportRef, report, { merge: true });
    projected += 1;
  }

  if (projected > 0) {
    await batch.commit();
  }

  return {
    ok: true,
    projected,
    checked: events.length,
  };
}

module.exports = {
  buildReportAckResponse,
  buildReportAckPatch,
  buildPlannerReportItem,
  buildEngineNarrationReportSpec,
  buildReportItemFromEvent,
  getReportItemAckTime,
  isReportItemAcknowledged,
  projectReportItemsFromRecentEvents,
  writePlannerReportItemTransaction,
};
