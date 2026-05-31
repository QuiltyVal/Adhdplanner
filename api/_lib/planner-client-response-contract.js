const PLANNER_CLIENT_RESPONSE_CONTRACT_VERSION = 1;
const PLANNER_CLIENT_RESPONSE_SHAPE = "planner_client_update_v1";

function withPlannerClientResponseContract(payload = {}) {
  const state = payload.state && typeof payload.state === "object" ? payload.state : null;
  const stateEventItems = Array.isArray(state?.eventItems)
    ? state.eventItems
    : Array.isArray(state?.event_items)
      ? state.event_items
      : [];
  const stateReportItems = Array.isArray(state?.reportItems)
    ? state.reportItems
    : Array.isArray(state?.report_items)
      ? state.report_items
      : [];
  const stateReportHistoryItems = Array.isArray(state?.reportHistoryItems)
    ? state.reportHistoryItems
    : Array.isArray(state?.report_history_items)
      ? state.report_history_items
      : [];
  return {
    ...payload,
    ok: payload.ok !== false,
    contractVersion: PLANNER_CLIENT_RESPONSE_CONTRACT_VERSION,
    responseShape: PLANNER_CLIENT_RESPONSE_SHAPE,
    state,
    planner_meta: payload.planner_meta && typeof payload.planner_meta === "object"
      ? payload.planner_meta
      : state?.plannerMeta && typeof state.plannerMeta === "object"
        ? state.plannerMeta
        : null,
    report_items: Array.isArray(payload.report_items) ? payload.report_items : stateReportItems,
    report_history_items: Array.isArray(payload.report_history_items) ? payload.report_history_items : stateReportHistoryItems,
    event_items: Array.isArray(payload.event_items) ? payload.event_items : stateEventItems,
  };
}

function buildPlannerRouteClientResponse({
  userId = null,
  route = null,
  result = {},
  includeState = true,
  extra = {},
} = {}) {
  const bootstrap = includeState && result?.bootstrap && typeof result.bootstrap === "object"
    ? result.bootstrap
    : null;
  return withPlannerClientResponseContract({
    ok: true,
    ...(userId ? { userId } : {}),
    route,
    messages: Array.isArray(result?.messages) ? result.messages : [],
    state: includeState ? result?.state || null : null,
    tasks: bootstrap?.tasks,
    score: bootstrap?.score,
    planner_meta: bootstrap?.planner_meta,
    report_items: bootstrap?.report_items,
    report_history_items: bootstrap?.report_history_items,
    event_items: bootstrap?.event_items,
    report_cursor: bootstrap?.report_cursor,
    engine: result?.engine,
    postCommand: result?.postCommand || null,
    post_command: result?.postCommand || null,
    postCommandWrite: result?.postCommandWrite || null,
    post_command_write: result?.postCommandWrite || null,
    ...extra,
  });
}

function buildPlannerClientErrorResponse({
  error = "Planner request failed",
  errors = null,
  details = "",
  extra = {},
} = {}) {
  return withPlannerClientResponseContract({
    ok: false,
    error: String(error || "Planner request failed"),
    ...(Array.isArray(errors) ? { errors } : {}),
    ...(details ? { details: String(details) } : {}),
    ...extra,
  });
}

function buildPlannerBootstrapClientResponse({ payload = {}, engine = null } = {}) {
  return withPlannerClientResponseContract({
    ...(payload && typeof payload === "object" ? payload : {}),
    engine,
  });
}

function buildPlannerDebugRunClientResponse({ payload = {}, debugRun = null } = {}) {
  return withPlannerClientResponseContract({
    ...(payload && typeof payload === "object" ? payload : {}),
    debugRun,
  });
}

module.exports = {
  PLANNER_CLIENT_RESPONSE_CONTRACT_VERSION,
  PLANNER_CLIENT_RESPONSE_SHAPE,
  buildPlannerBootstrapClientResponse,
  buildPlannerClientErrorResponse,
  buildPlannerDebugRunClientResponse,
  buildPlannerRouteClientResponse,
  withPlannerClientResponseContract,
};
