const ANGEL_ENTRY_TRIGGERS = Object.freeze({
  DAILY_CHECKIN: "daily_checkin",
  USER_WAS_AWAY: "user_was_away",
  TASK_GETTING_COLD: "task_getting_cold",
  DEADLINE_NEAR: "deadline_near",
  IMPORTANT_TASK_WITHOUT_STEP: "important_task_without_step",
  NOT_YOUR_MOVE_CHECKIN_DUE: "not_your_move_checkin_due",
  PANIC_OR_STUCK_DETECTED: "panic_or_stuck_detected",
  REPEATED_RESISTANCE: "repeated_resistance",
});

const ANGEL_ENTRY_MODES = Object.freeze({
  BRAIN_DUMP: "brain_dump",
  MAKE_IT_SMALLER: "make_it_smaller",
  TINY_FOCUS: "tiny_focus",
  CLARIFY_TASK: "clarify_task",
  RESCUE_ME: "rescue_me",
  NOT_YOUR_MOVE_CHECKIN: "not_your_move_checkin",
  DIAGNOSE_RESISTANCE: "diagnose_resistance",
});

const ANGEL_ENTRY_SOURCES = Object.freeze({
  ENGINE: "engine",
  TELEGRAM: "telegram",
  EMAIL: "email",
  PUSH: "push",
  LOGIN: "login",
});

const NOT_YOUR_MOVE_STATUS = "not_your_move";

const NOT_YOUR_MOVE_REASONS = Object.freeze({
  WAITING_FOR_PERSON: "waiting_for_person",
  WAITING_FOR_ORGANIZATION: "waiting_for_organization",
  WAITING_FOR_DOCUMENT: "waiting_for_document",
  WAITING_FOR_ACCESS: "waiting_for_access",
  WAITING_FOR_MONEY: "waiting_for_money",
  OTHER: "other",
});

const TRIGGER_MODE_DEFAULTS = Object.freeze({
  [ANGEL_ENTRY_TRIGGERS.DAILY_CHECKIN]: ANGEL_ENTRY_MODES.TINY_FOCUS,
  [ANGEL_ENTRY_TRIGGERS.USER_WAS_AWAY]: ANGEL_ENTRY_MODES.BRAIN_DUMP,
  [ANGEL_ENTRY_TRIGGERS.TASK_GETTING_COLD]: ANGEL_ENTRY_MODES.MAKE_IT_SMALLER,
  [ANGEL_ENTRY_TRIGGERS.DEADLINE_NEAR]: ANGEL_ENTRY_MODES.RESCUE_ME,
  [ANGEL_ENTRY_TRIGGERS.IMPORTANT_TASK_WITHOUT_STEP]: ANGEL_ENTRY_MODES.CLARIFY_TASK,
  [ANGEL_ENTRY_TRIGGERS.NOT_YOUR_MOVE_CHECKIN_DUE]: ANGEL_ENTRY_MODES.NOT_YOUR_MOVE_CHECKIN,
  [ANGEL_ENTRY_TRIGGERS.PANIC_OR_STUCK_DETECTED]: ANGEL_ENTRY_MODES.RESCUE_ME,
  [ANGEL_ENTRY_TRIGGERS.REPEATED_RESISTANCE]: ANGEL_ENTRY_MODES.DIAGNOSE_RESISTANCE,
});

const DEFAULT_ANGEL_ENTRY_TTL_MS = 1000 * 60 * 60 * 8;

function normalizeEnumValue(value, allowedValues, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function getDayBucket(now = Date.now()) {
  const date = new Date(Number(now) || Date.now());
  return date.toISOString().slice(0, 10);
}

function normalizeAngelEntryTrigger(value) {
  return normalizeEnumValue(
    value,
    Object.values(ANGEL_ENTRY_TRIGGERS),
    ANGEL_ENTRY_TRIGGERS.DAILY_CHECKIN,
  );
}

function normalizeAngelEntryMode(value, trigger) {
  const normalizedTrigger = normalizeAngelEntryTrigger(trigger);
  return normalizeEnumValue(
    value,
    Object.values(ANGEL_ENTRY_MODES),
    TRIGGER_MODE_DEFAULTS[normalizedTrigger] || ANGEL_ENTRY_MODES.TINY_FOCUS,
  );
}

function normalizeAngelEntrySource(value) {
  return normalizeEnumValue(value, Object.values(ANGEL_ENTRY_SOURCES), ANGEL_ENTRY_SOURCES.ENGINE);
}

function normalizeNotYourMoveReason(value) {
  return normalizeEnumValue(value, Object.values(NOT_YOUR_MOVE_REASONS), NOT_YOUR_MOVE_REASONS.OTHER);
}

function isTaskNotYourMove(task) {
  const blocked = task?.blocked || task?.notYourMove || {};
  return String(blocked.status || "").toLowerCase() === NOT_YOUR_MOVE_STATUS;
}

function buildAngelEntryDedupeKey({ userId, trigger, taskId, now } = {}) {
  const safeUserId = String(userId || "unknown_user").trim() || "unknown_user";
  const safeTaskId = String(taskId || "none").trim() || "none";
  const safeTrigger = normalizeAngelEntryTrigger(trigger);
  return `angel-entry:${safeUserId}:${safeTrigger}:${safeTaskId}:${getDayBucket(now)}`;
}

function buildAngelEntrySession(input = {}) {
  const now = Number(input.now || Date.now());
  const trigger = normalizeAngelEntryTrigger(input.trigger);
  const mode = normalizeAngelEntryMode(input.mode, trigger);
  const source = normalizeAngelEntrySource(input.source);
  const taskId = input.taskId ? String(input.taskId) : null;
  const id = String(input.id || buildAngelEntryDedupeKey({
    userId: input.userId,
    trigger,
    taskId,
    now,
  }));

  return {
    id,
    userId: String(input.userId || ""),
    trigger,
    mode,
    taskId,
    message: String(input.message || ""),
    primaryCta: String(input.primaryCta || "Open Angel View"),
    secondaryCta: input.secondaryCta ? String(input.secondaryCta) : "",
    source,
    createdAt: now,
    expiresAt: Number(input.expiresAt || now + DEFAULT_ANGEL_ENTRY_TTL_MS),
    dedupeKey: buildAngelEntryDedupeKey({ userId: input.userId, trigger, taskId, now }),
    contractVersion: "angel_entry_session_v1",
  };
}

function normalizeNotYourMoveMetadata(input = {}, now = Date.now()) {
  return {
    status: NOT_YOUR_MOVE_STATUS,
    reason: normalizeNotYourMoveReason(input.reason),
    waitingFor: String(input.waitingFor || "").trim(),
    lastUserAction: String(input.lastUserAction || "").trim(),
    nextCheckInAt: input.nextCheckInAt ? Number(input.nextCheckInAt) : null,
    updatedAt: Number(now) || Date.now(),
    contractVersion: "not_your_move_v1",
  };
}

module.exports = {
  ANGEL_ENTRY_MODES,
  ANGEL_ENTRY_SOURCES,
  ANGEL_ENTRY_TRIGGERS,
  DEFAULT_ANGEL_ENTRY_TTL_MS,
  NOT_YOUR_MOVE_REASONS,
  NOT_YOUR_MOVE_STATUS,
  TRIGGER_MODE_DEFAULTS,
  buildAngelEntryDedupeKey,
  buildAngelEntrySession,
  getDayBucket,
  isTaskNotYourMove,
  normalizeAngelEntryMode,
  normalizeAngelEntrySource,
  normalizeAngelEntryTrigger,
  normalizeNotYourMoveMetadata,
  normalizeNotYourMoveReason,
};
