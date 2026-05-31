function buildEngineContractStatus({
  commandHealth = {},
  outboxQueue = {},
  debugRuns = {},
  deliveryStatus = null,
  reportItems = [],
  angelEntrySession = null,
  now = Date.now(),
} = {}) {
  const outboxBacklog =
    Number((outboxQueue.pending || []).length || 0) +
    Number((outboxQueue.retry || []).length || 0) +
    Number((outboxQueue.dead || []).length || 0) +
    Number((outboxQueue.sending || []).length || 0);
  const latestEngineRun = Array.isArray(debugRuns.engine) ? debugRuns.engine[0] : null;
  const latestOutboxRun = Array.isArray(debugRuns.outbox) ? debugRuns.outbox[0] : null;
  const latestEngineRunSummary = latestEngineRun?.engineRunSummary && typeof latestEngineRun.engineRunSummary === "object"
    ? latestEngineRun.engineRunSummary
    : latestEngineRun?.summary && typeof latestEngineRun.summary === "object"
      ? latestEngineRun.summary
      : null;
  const latestEngineRunSummaryVersion = Number(latestEngineRunSummary?.contractVersion || latestEngineRunSummary?.contract_version || 0);
  const commandStatus = String(commandHealth.status || "idle");
  const latestPostCommandShape = String(commandHealth.latestPostCommandShape || "");
  const latestPostCommandVersion = Number(commandHealth.latestPostCommandContractVersion || 0);
  const delivery = deliveryStatus && typeof deliveryStatus === "object" ? deliveryStatus : null;
  const deliveryContractVersion = Number(delivery?.contractVersion || 0);
  const deliveryState = String(delivery?.status || "").toLowerCase();
  const recentReports = Array.isArray(reportItems) ? reportItems : [];
  const versionedReports = recentReports.filter((item) => Number(item?.contractVersion || item?.contract_version || 0) >= 1);
  const ackedReports = recentReports.filter((item) => item?.ack && typeof item.ack === "object");
  const versionedAckReports = ackedReports.filter((item) => Number(item?.ack?.contractVersion || item?.ack?.contract_version || 0) >= 1);
  const reportContractReady = recentReports.length === 0 || versionedReports.length > 0;
  const angelEntry = angelEntrySession && typeof angelEntrySession === "object" ? angelEntrySession : null;
  const angelEntryContractVersion = String(angelEntry?.contractVersion || "");
  const angelEntryVersionOk = angelEntryContractVersion === "angel_entry_bootstrap_v1";

  const layers = [
    {
      key: "command_service",
      status: commandStatus === "warning" || commandStatus === "locked" ? "warning" : "ok",
      title: "PlannerCommandService",
      body: "Web, Telegram, Angel Lab, rescue, subtasks, snapshots, cleanup, and task mutations should enter through backend commands.",
    },
    {
      key: "idempotency",
      status: Number(commandHealth.reusedCount || 0) > 0 ? "ok" : "ready",
      title: "Idempotency",
      body: Number(commandHealth.reusedCount || 0) > 0
        ? "Recent duplicate commands were collapsed."
        : "Bucketed keys are enabled; no recent duplicate reuse observed.",
    },
    {
      key: "post_command_hook_contract",
      status: latestPostCommandVersion >= 1 ? "ok" : "ready",
      title: "Post-command hook contract",
      body: latestPostCommandVersion >= 1
        ? `Latest post-command hook uses ${latestPostCommandShape || "planner_post_command_hook_v1"} v${latestPostCommandVersion}.`
        : "No versioned post-command hook observed yet.",
    },
    {
      key: "event_log",
      status: "ok",
      title: "Event log",
      body: "User/system/delivery/debug events are separated; technical traces stay out of human report.",
    },
    {
      key: "outbox",
      status: outboxBacklog > 0 ? "warning" : "ok",
      title: "Outbox",
      body: outboxBacklog > 0
        ? `${outboxBacklog} delivery item(s) are waiting/retrying/dead/sending.`
        : "Delivery queue is clear.",
    },
    {
      key: "delivery_contract",
      status: deliveryContractVersion >= 1
        ? (deliveryState === "retry" || deliveryState === "dead" ? "warning" : "ok")
        : "ready",
      title: "Delivery contract",
      body: deliveryContractVersion >= 1
        ? `Latest delivery contract v${deliveryContractVersion}: ${String(delivery?.channel || "delivery")} ${deliveryState || "unknown"}${delivery?.errorCode ? ` (${delivery.errorCode})` : ""}.`
        : "No versioned delivery status observed yet.",
    },
    {
      key: "report_projection",
      status: "ok",
      title: "Report projection",
      body: "Planner Report and while-away digest are generated from backend events/projections.",
    },
    {
      key: "report_items_contract",
      status: reportContractReady ? (versionedReports.length > 0 ? "ok" : "ready") : "warning",
      title: "Report items contract",
      body: versionedReports.length > 0
        ? `${versionedReports.length}/${recentReports.length} recent report item(s) use contract v1.`
        : recentReports.length > 0
          ? "Recent report items exist, but none use the versioned contract yet."
          : "No recent report items observed yet.",
    },
    {
      key: "report_ack_contract",
      status: ackedReports.length > 0 ? (versionedAckReports.length > 0 ? "ok" : "warning") : "ready",
      title: "Report ack contract",
      body: versionedAckReports.length > 0
        ? `${versionedAckReports.length}/${ackedReports.length} acknowledged report item(s) use ack contract v1.`
        : ackedReports.length > 0
          ? "Acknowledged report items exist, but none use ack contract v1."
          : "No acknowledged report items observed yet.",
    },
    {
      key: "engine_tick",
      status: latestEngineRun ? "ok" : "warning",
      title: "Planner tick",
      body: latestEngineRun
        ? `Latest engine run: ${String(latestEngineRun.status || "unknown")}.`
        : "No engine run snapshot is available yet.",
    },
    {
      key: "engine_run_summary_contract",
      status: latestEngineRunSummaryVersion >= 1 ? "ok" : "ready",
      title: "Engine run summary contract",
      body: latestEngineRunSummaryVersion >= 1
        ? `Latest engine run summary uses contract v${latestEngineRunSummaryVersion}; ${Number(latestEngineRunSummary?.meaningfulChangeCount || 0)} meaningful change(s).`
        : "No versioned engine run summary observed yet.",
    },
    {
      key: "direct_client_writes",
      status: "ok",
      title: "Direct client writes",
      body: "Client Firestore mutation helpers block direct cloud writes unless explicitly marked as maintenance/migration.",
    },
    {
      key: "legacy_risk",
      status: "ready",
      title: "Legacy risk",
      body: "Guest/offline fallback code still exists in App.js, but cloud local fallbacks are explicitly blocked when backend commands do not start.",
    },
    {
      key: "angel_entry_projection",
      status: angelEntry ? (angelEntryVersionOk ? "ok" : "warning") : "ready",
      title: "Angel Entry projection",
      body: angelEntry
        ? `Bootstrap projected one Angel Entry candidate (${angelEntry.trigger || "trigger"} / ${angelEntry.mode || "mode"}, ${angelEntryContractVersion || "unversioned"}).`
        : "Angel Entry projection contract exists; no candidate is currently projected.",
    },
  ];

  const warningCount = layers.filter((layer) => layer.status === "warning").length;
  const okCount = layers.filter((layer) => layer.status === "ok").length;
  return {
    status: warningCount > 0 ? "warning" : "ok",
    okCount,
    warningCount,
    readyCount: layers.filter((layer) => layer.status === "ready").length,
    layers,
    latestEngineRunAt: Number(latestEngineRun?.finished_at || latestEngineRun?.finishedAt || latestEngineRun?.createdAt || 0),
    latestOutboxRunAt: Number(latestOutboxRun?.finished_at || latestOutboxRun?.finishedAt || latestOutboxRun?.createdAt || 0),
    updatedAt: now,
  };
}

module.exports = {
  buildEngineContractStatus,
};
