const ANGEL_ENTRY_ACK_CONTRACT_VERSION = "angel_entry_ack_v1";

const ANGEL_ENTRY_ACK_ACTIONS = Object.freeze({
  DISMISSED: "dismissed",
  ACTED: "acted",
  DEFERRED: "deferred",
  OPENED_FULL_PLANNER: "opened_full_planner",
});

const DEFAULT_ANGEL_ENTRY_DISMISS_MS = 6 * 60 * 60 * 1000;
const DEFAULT_ANGEL_ENTRY_ACTED_MS = 18 * 60 * 60 * 1000;

function normalizeAngelEntryAckAction(action) {
  const normalized = String(action || "").trim().toLowerCase();
  return Object.values(ANGEL_ENTRY_ACK_ACTIONS).includes(normalized)
    ? normalized
    : ANGEL_ENTRY_ACK_ACTIONS.DISMISSED;
}

function getAngelEntryAckTtlMs(action) {
  const normalized = normalizeAngelEntryAckAction(action);
  if (normalized === ANGEL_ENTRY_ACK_ACTIONS.ACTED) return DEFAULT_ANGEL_ENTRY_ACTED_MS;
  if (normalized === ANGEL_ENTRY_ACK_ACTIONS.DEFERRED) return DEFAULT_ANGEL_ENTRY_ACTED_MS;
  return DEFAULT_ANGEL_ENTRY_DISMISS_MS;
}

function buildAngelEntryAckKey(session = {}) {
  const userId = String(session.userId || session.user_id || "unknown-user");
  const trigger = String(session.trigger || "unknown-trigger");
  const mode = String(session.mode || "unknown-mode");
  const taskId = session.taskId || session.task_id || "no-task";
  const dedupeKey = session.dedupeKey || session.dedupe_key || `${trigger}:${taskId}`;
  return `${ANGEL_ENTRY_ACK_CONTRACT_VERSION}:${userId}:${mode}:${dedupeKey}`;
}

function buildAngelEntryAckRecord({ session, action, now = Date.now(), note = null } = {}) {
  const normalizedAction = normalizeAngelEntryAckAction(action);
  const ttlMs = getAngelEntryAckTtlMs(normalizedAction);
  return {
    contractVersion: ANGEL_ENTRY_ACK_CONTRACT_VERSION,
    ackKey: buildAngelEntryAckKey(session),
    sessionId: session?.id || null,
    userId: session?.userId || session?.user_id || null,
    taskId: session?.taskId || session?.task_id || null,
    trigger: session?.trigger || null,
    mode: session?.mode || null,
    action: normalizedAction,
    note: note ? String(note) : null,
    createdAt: now,
    suppressUntil: now + ttlMs,
  };
}

function isAngelEntrySuppressed({ session, ackRecord, now = Date.now() } = {}) {
  if (!session || !ackRecord) return false;
  if (ackRecord.contractVersion !== ANGEL_ENTRY_ACK_CONTRACT_VERSION) return false;
  if (ackRecord.ackKey !== buildAngelEntryAckKey(session)) return false;
  return Number(ackRecord.suppressUntil || 0) > now;
}

module.exports = {
  ANGEL_ENTRY_ACK_ACTIONS,
  ANGEL_ENTRY_ACK_CONTRACT_VERSION,
  DEFAULT_ANGEL_ENTRY_ACTED_MS,
  DEFAULT_ANGEL_ENTRY_DISMISS_MS,
  buildAngelEntryAckKey,
  buildAngelEntryAckRecord,
  getAngelEntryAckTtlMs,
  isAngelEntrySuppressed,
  normalizeAngelEntryAckAction,
};
