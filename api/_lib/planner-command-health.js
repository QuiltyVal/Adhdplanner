function compactPlannerCommandDoc(doc) {
  const data = doc?.data ? doc.data() || {} : {};
  const result = data.result && typeof data.result === "object" ? data.result : {};
  const task = result.task && typeof result.task === "object" ? result.task : {};
  const outcome = String(data.outcome || result.outcome || "");
  const reuseCount = Number(data.reuseCount || 0);
  const postCommand = data.postCommand && typeof data.postCommand === "object"
    ? data.postCommand
    : data.post_command && typeof data.post_command === "object"
      ? data.post_command
      : null;
  return {
    id: String(doc?.id || data.id || ""),
    commandType: String(data.commandType || data.command_type || ""),
    source: String(data.source || ""),
    actorType: String(data.actor_type || ""),
    actorRef: String(data.actor_ref || ""),
    outcome,
    status: reuseCount > 0 ? "reused" : outcome === "noop" ? "noop" : outcome ? "ok" : "unknown",
    reuseCount,
    taskId: String(data.taskId || task.id || ""),
    taskText: String(data.taskText || task.text || ""),
    createdAt: Number(data.createdAt || data.created_at || 0),
    lastReusedAt: Number(data.lastReusedAt || 0),
    postCommand,
  };
}

function buildPlannerCommandHealth(commands = [], now = Date.now()) {
  const items = Array.isArray(commands) ? commands : [];
  const latest = items[0] || null;
  const recent = items.filter((item) => Number(item?.createdAt || 0) > now - 60 * 60 * 1000);
  const noopCount = recent.filter((item) => item?.status === "noop").length;
  const reusedCount = recent.reduce((sum, item) => sum + Number(item?.reuseCount || 0), 0);
  const unknownCount = recent.filter((item) => item?.status === "unknown").length;
  const postCommandFailedCount = recent.filter((item) => String(item?.postCommand?.status || "") === "failed").length;
  const postCommandLockedCount = recent.filter((item) => String(item?.postCommand?.status || "") === "locked").length;
  const reportProjectionFailedCount = recent.filter((item) => item?.postCommand?.reportProjectionOk === false).length;
  const reportProjectedCount = recent.reduce((sum, item) => sum + Number(item?.postCommand?.reportProjected || 0), 0);
  const reportCheckedCount = recent.reduce((sum, item) => sum + Number(item?.postCommand?.reportChecked || 0), 0);
  const outboxCheckFailedCount = recent.filter((item) => item?.postCommand?.outboxCheckOk === false).length;
  const outboxQueuedCount = recent.reduce((sum, item) => sum + Number(item?.postCommand?.outboxQueued || 0), 0);
  const latestOutboxPending = Number(latest?.postCommand?.outboxPending || 0);
  const latestOutboxRetry = Number(latest?.postCommand?.outboxRetry || 0);
  const latestOutboxDead = Number(latest?.postCommand?.outboxDead || 0);
  const latestOutboxSending = Number(latest?.postCommand?.outboxSending || 0);
  const latestOutboxTotal = Number(latest?.postCommand?.outboxTotal || 0);
  const lastCommandAt = Number(latest?.lastReusedAt || latest?.createdAt || 0);
  const lastStatus = String(latest?.status || "missing");
  const lastPostCommandStatus = String(latest?.postCommand?.status || "");
  const latestPostCommandShape = String(latest?.postCommand?.responseShape || latest?.postCommand?.response_shape || "");
  const latestPostCommandContractVersion = Number(latest?.postCommand?.contractVersion || latest?.postCommand?.contract_version || 0);
  let status = "idle";
  let reason = "no_recent_commands";

  if (outboxCheckFailedCount > 0) {
    status = "warning";
    reason = "outbox_check_failed";
  } else if (latestOutboxRetry > 0 || latestOutboxDead > 0) {
    status = "warning";
    reason = "outbox_backlog_attention";
  } else if (reportProjectionFailedCount > 0) {
    status = "warning";
    reason = "report_projection_failed";
  } else if (postCommandFailedCount > 0) {
    status = "warning";
    reason = "post_command_hook_failed";
  } else if (unknownCount > 0) {
    status = "warning";
    reason = "unknown_command_result";
  } else if (postCommandLockedCount > 0) {
    status = "locked";
    reason = "post_command_engine_locked";
  } else if (lastStatus === "noop") {
    status = "noop";
    reason = "latest_command_noop";
  } else if (reusedCount > 0) {
    status = "reused";
    reason = "idempotency_reused";
  } else if (lastStatus === "ok") {
    status = "ok";
    reason = "latest_command_ok";
  }

  return {
    status,
    reason,
    lastCommandAt,
    lastCommandType: String(latest?.commandType || ""),
    lastOutcome: String(latest?.outcome || ""),
    lastPostCommandStatus,
    latestPostCommandShape,
    latestPostCommandContractVersion,
    recentCount: recent.length,
    noopCount,
    reusedCount,
    unknownCount,
    postCommandFailedCount,
    postCommandLockedCount,
    reportProjectionFailedCount,
    reportProjectedCount,
    reportCheckedCount,
    outboxCheckFailedCount,
    outboxQueuedCount,
    latestOutboxPending,
    latestOutboxRetry,
    latestOutboxDead,
    latestOutboxSending,
    latestOutboxTotal,
    updatedAt: now,
  };
}

module.exports = {
  buildPlannerCommandHealth,
  compactPlannerCommandDoc,
};
