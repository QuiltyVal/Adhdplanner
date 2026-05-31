const {
  PLANNER_CLIENT_RESPONSE_CONTRACT_VERSION,
  PLANNER_CLIENT_RESPONSE_SHAPE,
} = require("./planner-client-response-contract");
const {
  buildPlannerCommandHealth,
  compactPlannerCommandDoc,
} = require("./planner-command-health");
const {
  buildOutboxBacklogCounts,
  compactOutboxQueueDoc,
} = require("./planner-outbox-contract");
const { buildEngineContractStatus } = require("./planner-engine-contract-status");
const {
  buildPlannerHealthSnapshot,
  compactEngineLock,
} = require("./planner-health-snapshot");
const { buildAngelEntryBootstrapProjection } = require("./planner-angel-entry-bootstrap-contract");
const { isReportItemAcknowledged } = require("./planner-report-projector");
const {
  getTelegramChatHash,
  getTelegramTargetChatId,
  getTelegramTargetSource,
} = require("./telegram-chat-identity");

function docsToData(docs = []) {
  return docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function buildPlannerBootstrapPayload({
  userId = "",
  plannerData = {},
  rootData = {},
  tasksSnap,
  reportSnap,
  reportHistorySnap,
  eventSnap,
  engineRunSnap,
  outboxRunSnap,
  outboxStatusSnaps = {},
  commandSnap,
  reportCursor = null,
  language = "",
  now = Date.now(),
} = {}) {
  const latestEngineRun = engineRunSnap?.docs?.[0]
    ? { id: engineRunSnap.docs[0].id, ...engineRunSnap.docs[0].data() }
    : null;
  const latestOutboxRun = outboxRunSnap?.docs?.[0]
    ? { id: outboxRunSnap.docs[0].id, ...outboxRunSnap.docs[0].data() }
    : null;
  const debugRuns = {
    engine: docsToData(engineRunSnap?.docs || []),
    outbox: docsToData(outboxRunSnap?.docs || []),
  };
  const outboxBacklogCounts = buildOutboxBacklogCounts(outboxStatusSnaps);
  const outboxQueue = {
    pending: (outboxStatusSnaps.pending?.docs || []).slice(0, 8).map(compactOutboxQueueDoc),
    retry: (outboxStatusSnaps.retry?.docs || []).slice(0, 8).map(compactOutboxQueueDoc),
    dead: (outboxStatusSnaps.dead?.docs || []).slice(0, 8).map(compactOutboxQueueDoc),
    sending: (outboxStatusSnaps.sending?.docs || []).slice(0, 8).map(compactOutboxQueueDoc),
    updatedAt: now,
  };
  const commandHistory = {
    items: (commandSnap?.docs || []).map(compactPlannerCommandDoc),
    updatedAt: now,
  };
  const commandHealth = buildPlannerCommandHealth(commandHistory.items, now);
  const reportHistoryItems = docsToData(reportHistorySnap?.docs || [])
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
  const plannerMeta = {
    ...(rootData.plannerMeta || {}),
    telegram_link_status: {
      ...(rootData.plannerMeta?.telegram_link_status || {
      status: rootData.telegramChatId ? "linked" : "missing",
      chatLinked: Boolean(rootData.telegramChatId),
      linkedAt: Number(rootData.telegramLinkedAtMs || 0),
      lastSeenAt: Number(rootData.telegramLastSeenAtMs || rootData.telegramLinkedAtMs || 0),
      source: rootData.telegramChatId ? "root" : "",
      }),
      chatHash: getTelegramChatHash(getTelegramTargetChatId(rootData)),
      targetSource: getTelegramTargetSource(rootData),
    },
    last_engine_run: latestEngineRun || rootData.plannerMeta?.last_engine_run || null,
    last_outbox_drain: latestOutboxRun || rootData.plannerMeta?.last_outbox_drain || null,
    engine_lock: compactEngineLock(rootData.plannerEngineLock || {}, now),
    debug_runs: debugRuns,
    outbox_queue: outboxQueue,
    command_history: commandHistory,
    command_health: commandHealth,
    outbox_backlog: {
      ...outboxBacklogCounts,
      updatedAt: now,
    },
  };

  const tasks = (tasksSnap?.docs || []).map((doc) => doc.data() || {});
  const rawEventItems = docsToData(eventSnap?.docs || []);
  const angelEntrySession = await buildAngelEntryBootstrapProjection({
    userId,
    rootData,
    tasks,
    events: rawEventItems,
    language,
    now,
    source: "login",
  });
  plannerMeta.engine_contract_status = buildEngineContractStatus({
    commandHealth,
    outboxQueue,
    debugRuns,
    deliveryStatus: rootData.plannerMeta?.delivery_status || null,
    reportItems: reportHistoryItems,
    angelEntrySession,
    now,
  });
  plannerMeta.angel_entry_session = angelEntrySession;
  plannerMeta.health_snapshot = buildPlannerHealthSnapshot(plannerMeta, now);
  const reportItems = docsToData(reportSnap?.docs || [])
    .filter((item) => String(item.surface || "login") === "login")
    .filter((item) => !isReportItemAcknowledged(item))
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
  const eventItems = rawEventItems
    .filter((event) => event.visible_in_feed !== false)
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
    .slice(0, 20);

  return {
    ok: true,
    contractVersion: PLANNER_CLIENT_RESPONSE_CONTRACT_VERSION,
    responseShape: PLANNER_CLIENT_RESPONSE_SHAPE,
    userId,
    tasks,
    score: plannerData.score,
    planner_meta: plannerMeta,
    angel_entry_session: angelEntrySession,
    report_items: reportItems,
    report_history_items: reportHistoryItems,
    event_items: eventItems,
    report_cursor: reportCursor || null,
  };
}

module.exports = {
  buildPlannerBootstrapPayload,
};
