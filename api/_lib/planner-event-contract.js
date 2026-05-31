const { randomUUID } = require("node:crypto");
const { admin } = require("./firebase-admin");
const {
  buildPlannerReportItem,
  writePlannerReportItemTransaction,
} = require("./planner-report-projector");

function getPlannerEventActor(input = {}) {
  const actorType = String(input.actorType || input.actor_type || input.actor || "engine").toLowerCase();
  const actorRef = String(input.actorRef || input.actor_ref || input.source || "system").toLowerCase();
  const source = String(input.source || "").toLowerCase();
  const eventType = String(input.eventType || input.event_type || input.type || "").toUpperCase();
  const route = `${actorRef} ${source}`;
  const assistantSource = route.includes("angel") || route.includes("assistant") || route.includes("agent_chat");

  if (actorType === "engine") {
    if (route.includes("devil") || eventType.includes("CEMETERY") || eventType.includes("DEAD")) return "devil";
    if (assistantSource) return "angel";
    return "system";
  }
  if (actorType === "delivery" || actorType === "system") return "system";
  if (actorType === "devil" || route.includes("devil")) return "devil";
  if (actorType === "angel" || assistantSource) return "angel";
  if (actorType === "user") return "user";
  return "system";
}

function normalizeEvent(input = {}) {
  const createdAt = Number(input.createdAt || Date.now());
  const eventType = String(input.event_type || input.eventType || input.type || "PLANNER_EVENT");
  const id = String(input.event_id || input.id || `${eventType}_${input.entity_id || input.taskId || "event"}_${createdAt}`);
  const actorType = String(input.actor_type || input.actorType || input.actor || "engine");
  const actorRef = String(input.actor_ref || input.actorRef || input.source || "system");
  return {
    id,
    event_id: id,
    type: String(input.type || eventType.toLowerCase()),
    event_type: eventType,
    actor: getPlannerEventActor({ actorType, actorRef, source: input.source, eventType }),
    actor_type: actorType,
    actor_ref: actorRef,
    source: actorRef,
    caused_by_event_id: input.caused_by_event_id || null,
    entity_type: input.entity_type || (input.taskId ? "task" : "planner"),
    entity_id: input.entity_id || input.taskId || null,
    taskId: input.taskId || input.entity_id || null,
    taskText: String(input.taskText || ""),
    message: String(input.message || input.taskText || "Planner event"),
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    visible_in_feed: input.visible_in_feed !== false,
    visible_in_report: Boolean(input.visible_in_report),
    createdAt,
    created_at: createdAt,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function writeEvent(transaction, baseUserRef, event) {
  const normalized = normalizeEvent(event);
  transaction.set(baseUserRef.collection("plannerEvents").doc(normalized.id), normalized);
  return normalized;
}

function writeEventBatch(batch, baseUserRef, event, options = {}) {
  const normalized = normalizeEvent(event);
  batch.set(baseUserRef.collection("plannerEvents").doc(normalized.id), normalized, options);
  return normalized;
}

async function writeEventDirect(baseUserRef, event, options = {}) {
  const normalized = normalizeEvent(event);
  await baseUserRef.collection("plannerEvents").doc(normalized.id).set(normalized, options);
  return normalized;
}

function writeReportItem(transaction, baseUserRef, item = {}) {
  const createdAt = Number(item.createdAt || Date.now());
  const id = String(item.report_item_id || item.id || `report_${item.source_event_id || randomUUID()}`);
  const report = buildPlannerReportItem({
    id,
    createdAt,
    userId: baseUserRef.id,
    kind: String(item.kind || "system_change"),
    sourceEventId: item.source_event_id || null,
    sourceType: String(item.sourceType || "planner_engine"),
    projector: "planner-engine",
    sourceEventType: String(item.sourceEventType || item.kind || "system_change"),
    projection: item.projection && typeof item.projection === "object" ? item.projection : {},
    title: String(item.title || ""),
    body: String(item.body || ""),
    persona: String(item.persona || "neutral"),
    surface: String(item.surface || "login"),
    messageKey: String(item.message_key || item.messageKey || ""),
    params: item.params && typeof item.params === "object" ? item.params : {},
    severity: Number.isFinite(Number(item.severity)) ? Number(item.severity) : 1,
  });
  return writePlannerReportItemTransaction(transaction, baseUserRef, report);
}

module.exports = {
  getPlannerEventActor,
  normalizeEvent,
  writeEvent,
  writeEventBatch,
  writeEventDirect,
  writeReportItem,
};
