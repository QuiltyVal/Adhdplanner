export function normalizeReportItemEvent(item = {}) {
  const createdAt = Number(item.createdAt || item.created_at || Date.now());
  const persona = String(item.persona || "").toLowerCase();
  const actor = persona === "user"
    ? "user"
    : persona === "devil"
    ? "devil"
    : persona === "angel"
      ? "angel"
      : "system";

  return {
    id: String(item.id || item.report_item_id || `report_${createdAt}`),
    reportItemId: String(item.report_item_id || item.id || ""),
    contractVersion: Number(item.contractVersion || item.contract_version || 0),
    seenAt: Number(item.seenAt || item.seen_at || item.ack?.ackedAt || 0),
    type: "report_item",
    actor,
    source: "report_items",
    taskId: item.entity_id || item.taskId || null,
    taskText: String(item.title || ""),
    message: String(item.body || item.title || "Planner report"),
    payload: {
      title: String(item.title || ""),
      kind: String(item.kind || ""),
      severity: Number(item.severity || 0),
      sourceEventId: String(item.sourceEventId || item.source_event_id || ""),
      sourceType: String(item.sourceType || item.source_type || ""),
      projection: item.projection && typeof item.projection === "object" ? item.projection : null,
      messageKey: String(item.messageKey || item.message_key || ""),
      params: item.params && typeof item.params === "object" ? item.params : {},
      surface: String(item.surface || ""),
    },
    createdAt,
  };
}

export function buildPlannerReportPanel(events = [], { onlyUnseen = false } = {}) {
  const reportEvents = (Array.isArray(events) ? events : [])
    .filter((event) => event?.reportItemId)
    .filter((event) => !onlyUnseen || !event.seenAt);
  if (reportEvents.length === 0) return null;

  const summaryReportEvent = reportEvents.find((event) => event.payload?.messageKey === "engine_run_summary");
  const panelEvents = summaryReportEvent
    ? [
        summaryReportEvent,
        ...reportEvents.filter((event) => event.id !== summaryReportEvent.id).slice(0, 2),
      ]
    : reportEvents.slice(0, 3);

  if (panelEvents.length === 0) return null;

  return {
    events: panelEvents,
    reportItemIds: panelEvents.map((event) => event.reportItemId).filter(Boolean),
    source: "report_items",
  };
}
