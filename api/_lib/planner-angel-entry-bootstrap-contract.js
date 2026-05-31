const { selectAngelEntrySessionCandidate } = require("./planner-angel-entry-selector");
const { isAngelEntrySuppressed } = require("./planner-angel-entry-ack-contract");
const {
  ANGEL_ENTRY_MODES,
  ANGEL_ENTRY_TRIGGERS,
} = require("./planner-angel-engagement-contract");
const { buildStickyQuestDiagnosis } = require("./planner-sticky-diagnosis");

const ANGEL_ENTRY_BOOTSTRAP_CONTRACT_VERSION = "angel_entry_bootstrap_v1";
const DEFAULT_MIN_AWAY_MS = 1000 * 60 * 60 * 18;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactAngelEntrySessionForBootstrap(session = {}) {
  if (!session || typeof session !== "object") return null;
  const id = String(session.id || "").trim();
  const trigger = String(session.trigger || "").trim();
  const mode = String(session.mode || "").trim();
  if (!id || !trigger || !mode) return null;
  const diagnosisOptions = Array.isArray(session.diagnosisOptions)
    ? session.diagnosisOptions.slice(0, 5)
    : [];
  return {
    id,
    trigger,
    mode,
    taskId: session.taskId ? String(session.taskId) : null,
    message: String(session.message || ""),
    primaryCta: String(session.primaryCta || "Open Angel View"),
    secondaryCta: String(session.secondaryCta || ""),
    diagnosisQuestion: session.diagnosisQuestion ? String(session.diagnosisQuestion) : "",
    diagnosisOptions,
    diagnosisSource: session.diagnosisSource ? String(session.diagnosisSource) : "",
    diagnosisModel: session.diagnosisModel ? String(session.diagnosisModel) : "",
    source: String(session.source || "engine"),
    createdAt: Number(session.createdAt || Date.now()),
    expiresAt: Number(session.expiresAt || 0),
    contractVersion: ANGEL_ENTRY_BOOTSTRAP_CONTRACT_VERSION,
  };
}

function shouldBuildAngelEntryBootstrapProjection({ rootData = {}, now = Date.now(), minAwayMs = DEFAULT_MIN_AWAY_MS } = {}) {
  const lastLoginAt = toMillis(rootData.lastLoginAt || rootData.last_login_at || rootData.lastSeenAt || rootData.last_seen_at);
  const lastAngelEntryAt = toMillis(rootData.lastAngelEntryAt || rootData.last_angel_entry_at);
  const normalizedNow = Number(now || Date.now());

  if (lastAngelEntryAt && normalizedNow - lastAngelEntryAt < minAwayMs) return false;
  if (!lastLoginAt) return true;
  return normalizedNow - lastLoginAt >= minAwayMs;
}

function getAngelEntryAckRecord(rootData = {}) {
  const plannerMeta = rootData.plannerMeta || rootData.planner_meta || {};
  return (
    plannerMeta.angel_entry_ack ||
    plannerMeta.angelEntryAck ||
    rootData.angel_entry_ack ||
    rootData.angelEntryAck ||
    null
  );
}

async function buildAngelEntryBootstrapProjection({
  userId = "",
  rootData = {},
  tasks = [],
  events = [],
  language = "",
  now = Date.now(),
  source = "login",
  minAwayMs = DEFAULT_MIN_AWAY_MS,
} = {}) {
  const session = selectAngelEntrySessionCandidate({
    userId,
    tasks,
    events,
    now,
    source,
  });
  const isStickySession = session?.trigger === ANGEL_ENTRY_TRIGGERS.REPEATED_RESISTANCE;
  if (!isStickySession && !shouldBuildAngelEntryBootstrapProjection({ rootData, now, minAwayMs })) return null;
  if (isAngelEntrySuppressed({ session, ackRecord: getAngelEntryAckRecord(rootData), now })) return null;
  if (session?.mode === ANGEL_ENTRY_MODES.DIAGNOSE_RESISTANCE && session.taskId) {
    const task = (Array.isArray(tasks) ? tasks : []).find((item) => String(item?.id || "") === String(session.taskId));
    const taskEvents = (Array.isArray(events) ? events : []).filter((event) => {
      const eventTaskId = String(event?.taskId || event?.task_id || event?.entity_id || "").trim();
      return eventTaskId === String(session.taskId);
    });
    const diagnosis = await buildStickyQuestDiagnosis({ task, events: taskEvents, language });
    session.diagnosisQuestion = diagnosis.question || "";
    session.diagnosisOptions = diagnosis.options || [];
    session.diagnosisSource = diagnosis.source || "";
    session.diagnosisModel = diagnosis.model || "";
  }
  return compactAngelEntrySessionForBootstrap(session);
}

module.exports = {
  ANGEL_ENTRY_BOOTSTRAP_CONTRACT_VERSION,
  DEFAULT_MIN_AWAY_MS,
  buildAngelEntryBootstrapProjection,
  compactAngelEntrySessionForBootstrap,
  getAngelEntryAckRecord,
  shouldBuildAngelEntryBootstrapProjection,
};
