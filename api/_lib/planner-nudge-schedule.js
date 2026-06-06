const { buildNudgeMessage } = require("./planner-store");
const { buildScheduledNudgeSpec } = require("./planner-delivery-messages");
const { buildPlannerReasonLine } = require("./planner-engine-rules");

const NUDGE_TIMEZONE = "Europe/Berlin";
const NUDGE_SLOT_HOURS = {
  morning: 9,
  evening: 18,
};

function formatHour(hour = 0) {
  return String(Number(hour || 0)).padStart(2, "0");
}

function getBerlinParts(now = Date.now()) {
  const date = new Date(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NUDGE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${byType.year}-${byType.month}-${byType.day}`,
    hour: Number(byType.hour || "0"),
    minute: Number(byType.minute || "0"),
  };
}

function getScheduledNudgeSlot(now = Date.now()) {
  const { hour } = getBerlinParts(now);
  if (hour === NUDGE_SLOT_HOURS.morning) return "morning";
  if (hour === NUDGE_SLOT_HOURS.evening) return "evening";
  return null;
}

function buildScheduledNudgeTiming(slot = "checkin", now = Date.now()) {
  const safeSlot = slot || "checkin";
  const parts = getBerlinParts(now);
  const targetHour = NUDGE_SLOT_HOURS[safeSlot] ?? parts.hour;
  const inScheduledHour = parts.hour === targetHour;
  const scheduledForLocal = `${parts.dateKey} ${formatHour(targetHour)}:00 ${NUDGE_TIMEZONE}`;
  const triggeredLocal = `${parts.dateKey} ${formatHour(parts.hour)}:${formatHour(parts.minute)} ${NUDGE_TIMEZONE}`;

  return {
    dateKey: parts.dateKey,
    slot: safeSlot,
    timezone: NUDGE_TIMEZONE,
    scheduledForLocal,
    triggeredLocal,
    triggeredHour: parts.hour,
    triggeredMinute: parts.minute,
    targetHour,
    inScheduledHour,
    retryWindow: inScheduledHour && parts.minute > 0,
  };
}

function buildScheduledNudgeText(task, slot) {
  const base = buildNudgeMessage(task);
  const reason = buildPlannerReasonLine(task?.plannerNudgeReason || task?.missionReason || "", task, "rescue");
  return buildScheduledNudgeSpec(task, slot, base, reason).text;
}

module.exports = {
  NUDGE_TIMEZONE,
  buildScheduledNudgeTiming,
  buildScheduledNudgeText,
  getBerlinParts,
  getScheduledNudgeSlot,
};
