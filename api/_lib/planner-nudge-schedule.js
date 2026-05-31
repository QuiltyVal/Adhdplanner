const { buildNudgeMessage } = require("./planner-store");
const { buildScheduledNudgeSpec } = require("./planner-delivery-messages");
const { buildPlannerReasonLine } = require("./planner-engine-rules");

const NUDGE_TIMEZONE = "Europe/Berlin";

function getBerlinParts(now = Date.now()) {
  const date = new Date(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NUDGE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${byType.year}-${byType.month}-${byType.day}`,
    hour: Number(byType.hour || "0"),
  };
}

function getScheduledNudgeSlot(now = Date.now()) {
  const { hour } = getBerlinParts(now);
  if (hour === 9) return "morning";
  if (hour === 18) return "evening";
  return null;
}

function buildScheduledNudgeText(task, slot) {
  const base = buildNudgeMessage(task);
  const reason = buildPlannerReasonLine(task?.plannerNudgeReason || task?.missionReason || "", task, "rescue");
  return buildScheduledNudgeSpec(task, slot, base, reason).text;
}

module.exports = {
  NUDGE_TIMEZONE,
  buildScheduledNudgeText,
  getBerlinParts,
  getScheduledNudgeSlot,
};
