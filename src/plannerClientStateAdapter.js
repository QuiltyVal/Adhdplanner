import { normalizeBootstrapPlannerEvents } from "./plannerEventContract";
import { buildPlannerReportPanel, normalizeReportItemEvent } from "./plannerReportPanel";

const EXPECTED_RESPONSE_SHAPE = "planner_client_update_v1";
const EXPECTED_CONTRACT_VERSION = 1;

function buildClientResponseContractStatus(payload = {}) {
  const payloadOk = payload?.ok !== false;
  const responseShape = String(payload.responseShape || payload.response_shape || "");
  const contractVersion = Number(payload.contractVersion || payload.contract_version || 0);
  const postCommand = payload?.postCommand && typeof payload.postCommand === "object"
    ? payload.postCommand
    : payload?.post_command && typeof payload.post_command === "object"
      ? payload.post_command
      : null;
  const postCommandWrite = payload?.postCommandWrite && typeof payload.postCommandWrite === "object"
    ? payload.postCommandWrite
    : payload?.post_command_write && typeof payload.post_command_write === "object"
      ? payload.post_command_write
      : null;
  const shapeOk = responseShape === EXPECTED_RESPONSE_SHAPE;
  const versionOk = contractVersion >= EXPECTED_CONTRACT_VERSION;
  const ok = payloadOk && shapeOk && versionOk;
  return {
    ok,
    payloadOk,
    shapeOk,
    versionOk,
    expectedShape: EXPECTED_RESPONSE_SHAPE,
    expectedContractVersion: EXPECTED_CONTRACT_VERSION,
    responseShape,
    contractVersion,
    postCommand,
    postCommandWrite,
    postCommandStatus: String(postCommand?.status || ""),
    postCommandShape: String(postCommand?.responseShape || postCommand?.response_shape || ""),
    postCommandContractVersion: Number(postCommand?.contractVersion || postCommand?.contract_version || 0),
    postCommandWriteOk: postCommandWrite ? Boolean(postCommandWrite.ok) : null,
    postCommandWriteSkipped: postCommandWrite ? Boolean(postCommandWrite.skipped) : null,
    postCommandWriteReason: String(postCommandWrite?.reason || postCommandWrite?.error || ""),
    tone: ok ? "ok" : "warning",
    message: !payloadOk
      ? "Backend returned ok:false for planner_client_update_v1."
      : ok
        ? "Frontend received planner_client_update_v1."
        : "Frontend received a legacy or incomplete planner response.",
  };
}

export function normalizePlannerReportFeed(rawItems = []) {
  const seen = new Set();
  return (Array.isArray(rawItems) ? rawItems : [])
    .map(normalizeReportItemEvent)
    .filter((event) => {
      const reportItemId = String(event?.reportItemId || "").trim();
      if (!reportItemId || seen.has(reportItemId)) return false;
      seen.add(reportItemId);
      return true;
    });
}

export function buildPlannerClientUpdate(payload = {}, context = {}) {
  const currentTasks = Array.isArray(context.currentTasks) ? context.currentTasks : [];
  const currentScore = Number(context.currentScore || 0);
  const mergeTaskLists = context.mergeTaskLists;
  const state = payload?.state && typeof payload.state === "object" ? payload.state : null;
  const responseContract = buildClientResponseContractStatus(payload);

  const stateTasks = state
    ? [
      ...(Array.isArray(state.tasks) ? state.tasks : []),
      ...(Array.isArray(state.nonActiveTasks) ? state.nonActiveTasks : []),
    ].filter((task) => task?.id)
    : [];

  const topLevelTasks = [
    ...(Array.isArray(payload.tasks) ? payload.tasks : []),
    ...(Array.isArray(payload.nonActiveTasks) ? payload.nonActiveTasks : []),
    ...(Array.isArray(payload.non_active_tasks) ? payload.non_active_tasks : []),
  ].filter((task) => task?.id);

  const serverTasks = stateTasks.length > 0 ? stateTasks : topLevelTasks;
  const mergedTasks = serverTasks.length > 0 && typeof mergeTaskLists === "function"
    ? mergeTaskLists(currentTasks, serverTasks)
    : null;

  const score = typeof state?.score === "number"
    ? state.score
    : typeof payload.score === "number"
      ? payload.score
      : currentScore;

  const plannerMeta = state?.plannerMeta && typeof state.plannerMeta === "object"
    ? state.plannerMeta
    : payload.planner_meta && typeof payload.planner_meta === "object"
      ? payload.planner_meta
      : null;
  const angelEntrySession = payload.angel_entry_session && typeof payload.angel_entry_session === "object"
    ? payload.angel_entry_session
    : state?.angelEntrySession && typeof state.angelEntrySession === "object"
      ? state.angelEntrySession
      : null;
  const plannerMetaWithAngelEntry = plannerMeta
    ? {
        ...plannerMeta,
        angel_entry_session: plannerMeta.angel_entry_session || angelEntrySession || null,
      }
    : null;

  const reportItems = normalizePlannerReportFeed(payload.report_items);

  const reportHistoryItems = normalizePlannerReportFeed(payload.report_history_items);

  const rawStateEvents = state
    ? (Array.isArray(state.eventItems)
      ? state.eventItems
      : Array.isArray(state.event_items)
        ? state.event_items
        : [])
    : [];
  const rawTopLevelEvents = Array.isArray(payload.event_items) ? payload.event_items : [];
  const eventItems = normalizeBootstrapPlannerEvents([...rawStateEvents, ...rawTopLevelEvents]);
  const reportFeedItems = reportHistoryItems.length > 0 ? reportHistoryItems : reportItems;
  const reportPanel = buildPlannerReportPanel(reportItems, { onlyUnseen: true });
  const hasStatePayload = Boolean(
    state ||
    plannerMetaWithAngelEntry ||
    angelEntrySession ||
    mergedTasks ||
    eventItems.length > 0 ||
    reportFeedItems.length > 0,
  );

  return {
    state,
    score,
    plannerMeta: plannerMetaWithAngelEntry,
    angelEntrySession,
    mergedTasks,
    reportItems,
    reportHistoryItems,
    reportFeedItems,
    reportPanel,
    eventItems,
    responseContract,
    hasStatePayload,
    stateUserId: payload.userId || state?.userId || null,
  };
}

export function applyPlannerClientUpdate(update = {}, handlers = {}) {
  const stateUserId = handlers.userId || update.stateUserId || null;
  if (update.responseContract && typeof handlers.setPlannerClientContractStatus === "function") {
    handlers.setPlannerClientContractStatus(update.responseContract);
  }

  const hasUsefulUpdate = Boolean(
    update.hasStatePayload ||
    update.state ||
    update.plannerMeta ||
    update.mergedTasks ||
    (Array.isArray(update.eventItems) && update.eventItems.length > 0) ||
    (Array.isArray(update.reportFeedItems) && update.reportFeedItems.length > 0),
  );

  if (!hasUsefulUpdate) return null;

  if (update.mergedTasks && typeof handlers.commitTasks === "function") {
    handlers.commitTasks(update.mergedTasks);
  }
  if (typeof handlers.setScore === "function") {
    handlers.setScore(update.score);
  }
  if (update.plannerMeta && typeof handlers.setPlannerMeta === "function") {
    handlers.setPlannerMeta(update.plannerMeta);
  }
  if (Array.isArray(update.reportFeedItems) && update.reportFeedItems.length > 0) {
    if (typeof handlers.setPlannerReportItems === "function") {
      handlers.setPlannerReportItems(update.reportFeedItems);
    }
    if (update.reportPanel && typeof handlers.setPlannerReport === "function") {
      handlers.setPlannerReport(update.reportPanel);
    }
  }
  if (Array.isArray(update.eventItems) && update.eventItems.length > 0 && typeof handlers.mergePlannerEventItemsIntoState === "function") {
    handlers.mergePlannerEventItemsIntoState(update.eventItems, stateUserId);
  }
  if (stateUserId && update.mergedTasks && typeof handlers.saveCloudCache === "function") {
    handlers.saveCloudCache(stateUserId, update.mergedTasks, update.score);
  }

  return {
    ...(update.state || {}),
    mergedTasks: update.mergedTasks || handlers.currentTasks || [],
  };
}
