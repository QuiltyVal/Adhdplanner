const { randomUUID } = require("node:crypto");
const { admin } = require("./firebase-admin");

const OUTBOX_QUEUE_STATUSES = ["pending", "retry", "dead", "sending"];

function sanitizeOutboxFirestoreValue(value) {
  if (value === undefined) return undefined;
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeOutboxFirestoreValue(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const output = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const cleanValue = sanitizeOutboxFirestoreValue(nestedValue);
      if (cleanValue !== undefined) output[key] = cleanValue;
    }
    return output;
  }
  return value;
}

function normalizeOutboxPayloadForStorage(payload = {}, channel = "telegram") {
  const source = payload && typeof payload === "object" ? { ...payload } : {};
  if (channel === "telegram" && source.replyMarkup !== undefined) {
    if (source.replyMarkup) {
      source.replyMarkupJson = JSON.stringify(source.replyMarkup);
    }
    delete source.replyMarkup;
  }
  return sanitizeOutboxFirestoreValue(source) || {};
}

function buildPlannerOutboxItem({ userId = "", payload = {} } = {}) {
  const now = Number(payload.createdAt || Date.now());
  const dedupeKey = String(payload.dedupe_key || payload.dedupeKey || payload.id || randomUUID())
    .replace(/[\/\s]+/g, "_")
    .slice(0, 180);
  const deliveryDedupeKey = String(
    payload.delivery_dedupe_key ||
    payload.deliveryDedupeKey ||
    payload.payload?.deliveryDedupeKey ||
    payload.payload?.delivery_dedupe_key ||
    "",
  ).trim();
  const channel = String(payload.channel || "telegram");
  return {
    id: dedupeKey,
    outbox_id: dedupeKey,
    user_id: String(userId || ""),
    channel,
    topic: String(payload.topic || "planner_notification"),
    payload: normalizeOutboxPayloadForStorage(payload.payload, channel),
    status: "pending",
    attempts: 0,
    available_at: Number(payload.available_at || payload.availableAt || now),
    availableAt: Number(payload.available_at || payload.availableAt || now),
    last_error: "",
    dedupe_key: dedupeKey,
    ...(deliveryDedupeKey ? {
      delivery_dedupe_key: deliveryDedupeKey,
      deliveryDedupeKey,
    } : {}),
    caused_by_event_id: payload.caused_by_event_id || null,
    created_at: now,
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function writeOutboxIfMissing(transaction, baseUserRef, payload = {}) {
  const outbox = buildPlannerOutboxItem({ userId: baseUserRef.id, payload });
  const ref = baseUserRef.collection("outbox").doc(outbox.id);
  const existing = await transaction.get(ref);
  if (existing.exists) return null;
  transaction.set(ref, outbox);
  return outbox;
}

function buildOutboxCandidate(baseUserRef, payload = {}) {
  const outbox = buildPlannerOutboxItem({ userId: baseUserRef.id, payload });
  return {
    ref: baseUserRef.collection("outbox").doc(outbox.id),
    outbox,
  };
}

async function getOutboxStatusSnapshots(baseUserRef) {
  const snaps = await Promise.all(
    OUTBOX_QUEUE_STATUSES.map((status) => baseUserRef.collection("outbox").where("status", "==", status).get()),
  );
  return OUTBOX_QUEUE_STATUSES.reduce((result, status, index) => {
    result[status] = snaps[index];
    return result;
  }, {});
}

function buildOutboxBacklogCounts(snaps = {}) {
  const pending = Number(snaps.pending?.size || 0);
  const retry = Number(snaps.retry?.size || 0);
  const dead = Number(snaps.dead?.size || 0);
  const sending = Number(snaps.sending?.size || 0);
  return {
    pending,
    retry,
    dead,
    sending,
    total: pending + retry + dead + sending,
  };
}

function compactOutboxQueueDoc(doc) {
  const data = doc?.data ? doc.data() || {} : {};
  const payload = data.payload && typeof data.payload === "object" ? data.payload : {};
  const diagnostic = data.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic : null;
  return {
    id: String(doc?.id || data.id || ""),
    channel: String(data.channel || ""),
    topic: String(data.topic || ""),
    status: String(data.status || ""),
    attempts: Number(data.attempts || 0),
    availableAt: Number(data.availableAt || data.available_at || 0),
    createdAt: Number(data.createdAt || data.created_at || 0),
    sentAt: Number(data.sentAt || data.sent_at || 0),
    lastError: String(data.lastError || data.last_error || ""),
    diagnostic,
    messageKey: String(payload.messageKey || payload.message_key || ""),
    persona: String(payload.persona || ""),
    taskText: String(payload.taskText || ""),
  };
}

module.exports = {
  OUTBOX_QUEUE_STATUSES,
  buildOutboxBacklogCounts,
  buildOutboxCandidate,
  buildPlannerOutboxItem,
  compactOutboxQueueDoc,
  getOutboxStatusSnapshots,
  normalizeOutboxPayloadForStorage,
  sanitizeOutboxFirestoreValue,
  writeOutboxIfMissing,
};
