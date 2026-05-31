function getEngineTriggerMetaField(trigger = "") {
  const value = String(trigger || "").toLowerCase();
  if (value === "bootstrap") return "last_bootstrap_tick";
  if (value === "command") return "last_command_tick";
  if (
    value.startsWith("telegram_nudge") ||
    value === "cron" ||
    value === "manual" ||
    value === "nudge" ||
    value === "scheduled"
  ) return "last_cron_tick";
  if (value.startsWith("telegram_")) return "last_command_tick";
  return "";
}

function buildEngineTriggerMetaPatch(trigger = "", run = null) {
  const field = getEngineTriggerMetaField(trigger);
  return field && run ? { [field]: run } : {};
}

function buildEngineRunSummaryContract({
  runId = "",
  trigger = "",
  now = Date.now(),
  heatUpdated = 0,
  deadTasks = [],
  events = [],
  outboxCandidates = [],
  angelCount = 0,
  devilCount = 0,
  deliveryCount = 0,
} = {}) {
  const cemeteryTaskIds = (Array.isArray(deadTasks) ? deadTasks : [])
    .map((item) => String(item?.task?.id || item?.id || ""))
    .filter(Boolean)
    .slice(0, 12);
  const outboxIds = (Array.isArray(outboxCandidates) ? outboxCandidates : [])
    .map((candidate) => String(candidate?.outbox?.id || candidate?.outbox?.outbox_id || ""))
    .filter(Boolean)
    .slice(0, 12);
  const eventTypes = (Array.isArray(events) ? events : [])
    .map((event) => String(event?.event_type || event?.eventType || event?.type || ""))
    .filter(Boolean)
    .slice(0, 12);

  return {
    contractVersion: 1,
    runId: String(runId || ""),
    trigger: String(trigger || ""),
    createdAt: Number(now || Date.now()),
    messageKey: "engine_run_summary",
    meaningfulChangeCount: Number(angelCount || 0) + Number(devilCount || 0) + Number(deliveryCount || 0),
    stats: {
      heatUpdated: Number(heatUpdated || 0),
      cemeteryMoved: cemeteryTaskIds.length,
      outboxQueued: outboxIds.length,
      eventCount: Array.isArray(events) ? events.length : 0,
      angelCount: Number(angelCount || 0),
      devilCount: Number(devilCount || 0),
      deliveryCount: Number(deliveryCount || 0),
    },
    cemeteryTaskIds,
    outboxIds,
    eventTypes,
  };
}

module.exports = {
  buildEngineRunSummaryContract,
  buildEngineTriggerMetaPatch,
  getEngineTriggerMetaField,
};
