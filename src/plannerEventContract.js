export function normalizePlannerEventItem(item = {}) {
  const createdAt = Number(item.createdAt || item.created_at || Date.now());
  const actorType = String(item.actor_type || item.actor || "").toLowerCase();
  const actorRef = String(item.actor_ref || item.source || item.persona || "").toLowerCase();
  const rawActor = String(item.actor || "").toLowerCase();
  const eventType = String(item.event_type || item.type || "planner_event").toUpperCase();
  const assistantSource = actorRef.includes("angel") || actorRef.includes("assistant") || actorRef.includes("telegram");
  const engineCemeteryEvent = actorType === "engine" && (eventType.includes("CEMETERY") || eventType.includes("DEAD"));
  const actor = rawActor === "devil" || actorRef === "devil" || engineCemeteryEvent
    ? "devil"
    : actorType === "user" && !assistantSource
      ? "user"
      : rawActor === "angel" || assistantSource
        ? "angel"
        : "system";

  return {
    id: String(item.id || item.event_id || `${item.event_type || item.type || "event"}_${item.entity_id || item.taskId || createdAt}`),
    type: String(item.type || item.event_type || "planner_event"),
    eventType: String(item.event_type || item.type || "planner_event"),
    actor,
    actorType,
    actorRef,
    source: String(item.source || item.actor_ref || "planner_events"),
    taskId: item.taskId || item.entity_id || null,
    taskText: String(item.taskText || ""),
    message: String(item.message || item.taskText || item.event_type || "Planner event"),
    payload: item.payload && typeof item.payload === "object" ? item.payload : {},
    visibleInReport: Boolean(item.visible_in_report || item.visibleInReport),
    createdAt,
  };
}

export function normalizeBootstrapPlannerEvents(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(normalizePlannerEventItem)
    .filter((event) => event.id);
}
