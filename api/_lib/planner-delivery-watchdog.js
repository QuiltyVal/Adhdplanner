const { getDb } = require("./firebase-admin");

const USERS_COLLECTION = "Users";
const SLOT_HOURS = { morning: 9, evening: 18 };

function getBerlinParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function berlinDateToUtcMillis(dateKey, hour, minute = 0) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) return 0;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const actualParts = getBerlinParts(new Date(utcGuess));
  const actualMinutes = actualParts.hour * 60 + actualParts.minute;
  const targetMinutes = hour * 60 + minute;
  return utcGuess - (actualMinutes - targetMinutes) * 60 * 1000;
}

function resolveSlot(now = new Date(), requestedSlot = "") {
  const normalized = String(requestedSlot || "").trim().toLowerCase();
  if (SLOT_HOURS[normalized]) return normalized;
  const { hour } = getBerlinParts(now);
  return hour >= SLOT_HOURS.evening ? "evening" : "morning";
}

function toTimestamp(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    const text = String(value || "").trim();
    if (!text) continue;
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function compactChannel(value = null) {
  if (!value || typeof value !== "object") return {};
  return {
    channel: String(value.channel || ""),
    status: String(value.status || ""),
    messageKey: String(value.messageKey || value.message_key || ""),
    topic: String(value.topic || ""),
    outboxId: String(value.outboxId || value.outbox_id || value.id || ""),
    resultAt: toTimestamp(value.resultAt, value.result_at, value.updatedAt, value.updated_at, value.sentAt, value.sent_at),
    slot: String(value.slot || ""),
    dateKey: String(value.dateKey || value.date_key || ""),
  };
}

function isCurrentSlotSignal(channel = {}, { dateKey, slot, slotStart = 0, expectedToken = "" } = {}) {
  const status = String(channel.status || "").toLowerCase();
  if (status !== "sent") return false;
  const resultAt = Number(channel.resultAt || 0);
  const channelSlot = String(channel.slot || "").toLowerCase();
  const channelDateKey = String(channel.dateKey || "");
  const outboxId = String(channel.outboxId || "");
  if (channelDateKey === dateKey && channelSlot === slot) return true;
  if (expectedToken && outboxId.includes(expectedToken)) return true;
  return Boolean(resultAt && slotStart && resultAt >= slotStart);
}

function checkTelegram(meta = {}, dateKey, slot) {
  const channels = meta.delivery_channels && typeof meta.delivery_channels === "object" ? meta.delivery_channels : {};
  const delivery = compactChannel(channels.telegram || meta.delivery_status || {});
  const slotStart = berlinDateToUtcMillis(dateKey, SLOT_HOURS[slot], 0);
  const expectedToken = `${dateKey}_${slot}`;
  const ok = String(delivery.channel || "telegram").toLowerCase() === "telegram"
    && isCurrentSlotSignal(delivery, { dateKey, slot, slotStart, expectedToken });
  return {
    ok,
    channel: delivery.channel || "telegram",
    status: delivery.status || null,
    messageKey: delivery.messageKey || null,
    outboxId: delivery.outboxId || "",
    resultAt: delivery.resultAt || null,
    expectedToken,
    reason: ok ? "telegram_scheduled_nudge_sent" : "missing_current_slot_telegram_scheduled_nudge",
  };
}

function checkEmail(meta = {}, dateKey, slot) {
  const channels = meta.delivery_channels && typeof meta.delivery_channels === "object" ? meta.delivery_channels : {};
  const email = compactChannel(channels.email || {});
  const slotStart = berlinDateToUtcMillis(dateKey, SLOT_HOURS[slot], 0);
  const ok = isCurrentSlotSignal(email, { dateKey, slot, slotStart, expectedToken: `${dateKey}_${slot}` });
  return {
    ok,
    channel: "email",
    status: email.status || null,
    messageKey: email.messageKey || null,
    outboxId: email.outboxId || "",
    resultAt: email.resultAt || null,
    expectedToken: `${dateKey}_${slot}`,
    reason: ok ? "email_digest_signal_present" : "missing_current_slot_email_digest_signal",
  };
}

function compactWatchdogStatus(status = {}) {
  if (!status || typeof status !== "object") return null;
  return {
    contractVersion: Number(status.contractVersion || status.contract_version || 1),
    ok: Boolean(status.ok),
    checkedAt: toTimestamp(status.checkedAt, status.checked_at, status.checkedAtIso, status.checked_at_iso, status.updatedAt, status.updated_at),
    checkedAtIso: String(status.checkedAtIso || status.checked_at_iso || status.checkedAt || status.checked_at || ""),
    updatedAt: toTimestamp(status.updatedAt, status.updated_at, status.checkedAt, status.checked_at),
    dateKey: String(status.dateKey || status.date_key || ""),
    slot: String(status.slot || ""),
    source: String(status.source || ""),
    failures: Array.isArray(status.failures) ? status.failures.map((item) => String(item || "")).filter(Boolean).slice(0, 4) : [],
    telegram: status.telegram && typeof status.telegram === "object" ? status.telegram : null,
    email: status.email && typeof status.email === "object" ? status.email : null,
  };
}

function buildWatchdogHistory(previousHistory = [], status = {}) {
  const current = compactWatchdogStatus(status);
  if (!current) return [];
  const currentKey = `${current.dateKey}:${current.slot}`;
  const previous = Array.isArray(previousHistory) ? previousHistory : [];
  return [
    current,
    ...previous
      .map(compactWatchdogStatus)
      .filter(Boolean)
      .filter((item) => `${item.dateKey}:${item.slot}` !== currentKey),
  ].slice(0, 10);
}

async function runPlannerDeliveryWatchdog({ userId, now = Date.now(), slot = "" } = {}) {
  const db = getDb();
  const userRef = db.collection(USERS_COLLECTION).doc(String(userId || ""));
  const snap = await userRef.get();
  const data = snap.data() || {};
  const meta = data.plannerMeta && typeof data.plannerMeta === "object" ? data.plannerMeta : {};
  const runDate = new Date(Number(now || Date.now()));
  const { dateKey } = getBerlinParts(runDate);
  const resolvedSlot = resolveSlot(runDate, slot);
  const telegram = checkTelegram(meta, dateKey, resolvedSlot);
  const email = checkEmail(meta, dateKey, resolvedSlot);
  const failures = [];
  if (!telegram.ok) failures.push("telegram");
  if (!email.ok) failures.push("email");
  const status = {
    contractVersion: 1,
    ok: failures.length === 0,
    checkedAt: Number(now || Date.now()),
    checkedAtIso: new Date(Number(now || Date.now())).toISOString(),
    updatedAt: Date.now(),
    dateKey,
    slot: resolvedSlot,
    source: "manual_progress_button",
    failures,
    telegram,
    email,
  };
  const history = buildWatchdogHistory(meta.delivery_watchdog_history, status);
  await userRef.set({
    plannerMeta: {
      delivery_watchdog_status: status,
      delivery_watchdog_history: history,
    },
  }, { merge: true });
  return {
    ok: status.ok,
    status: status.ok ? "ok" : "warning",
    trigger: "delivery_watchdog_manual",
    stats: {
      telegramOk: telegram.ok ? 1 : 0,
      emailOk: email.ok ? 1 : 0,
      failed: failures.length,
    },
    deliveryWatchdog: status,
  };
}

module.exports = {
  runPlannerDeliveryWatchdog,
};
