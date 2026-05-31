const {
  getConfiguredTelegramChatId,
  getTelegramChatHash,
} = require("./telegram-chat-identity");

function firstString(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function compactDeliveryChannel(value = null) {
  if (!value || typeof value !== "object") return null;
  return {
    contractVersion: Number(value.contractVersion || 0),
    outboxId: String(value.outboxId || value.outbox_id || ""),
    channel: String(value.channel || ""),
    topic: String(value.topic || ""),
    status: String(value.status || ""),
    attempt: Number(value.attempt || 0),
    updatedAt: Number(value.updatedAt || value.updated_at || value.resultAt || value.result_at || value.sentAt || value.sent_at || 0),
    resultAt: Number(value.resultAt || value.result_at || value.updatedAt || value.updated_at || value.sentAt || value.sent_at || 0),
    taskText: String(value.taskText || value.task_text || ""),
    messageKey: String(value.messageKey || value.message_key || ""),
    persona: String(value.persona || ""),
    errorCode: String(value.errorCode || value.error_code || value.diagnostic?.code || ""),
    errorHint: String(value.errorHint || value.error_hint || value.diagnostic?.hint || ""),
    lastError: String(value.lastError || value.last_error || ""),
    chatHash: firstString(value.chatHash, value.chat_hash),
    targetChatHash: firstString(value.targetChatHash, value.target_chat_hash, value.chatHash, value.chat_hash),
    targetSource: String(value.targetSource || value.target_source || ""),
    targetHash: firstString(value.targetHash, value.target_hash),
    telegramMessageId: value.telegramMessageId || value.telegram_message_id || "",
    emailMessageId: value.emailMessageId || value.email_message_id || "",
    subject: String(value.subject || ""),
    provider: String(value.provider || ""),
    slot: String(value.slot || ""),
    dateKey: String(value.dateKey || value.date_key || ""),
    acceptedCount: Number(value.acceptedCount || value.accepted_count || 0),
    rejectedCount: Number(value.rejectedCount || value.rejected_count || 0),
  };
}

function toTimestamp(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    const text = String(value || "").trim();
    if (!text) continue;
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function compactWatchdogChannel(value = null) {
  if (!value || typeof value !== "object") return null;
  return {
    ok: Boolean(value.ok),
    channel: String(value.channel || ""),
    status: String(value.status || ""),
    messageKey: String(value.messageKey || value.message_key || ""),
    outboxId: String(value.outboxId || value.outbox_id || ""),
    resultAt: toTimestamp(value.resultAt, value.result_at, value.updatedAt, value.updated_at),
    expectedToken: String(value.expectedToken || value.expected_token || ""),
    reason: String(value.reason || ""),
  };
}

function compactDeliveryWatchdog(value = null) {
  if (!value || typeof value !== "object") return null;
  return {
    contractVersion: Number(value.contractVersion || value.contract_version || 1),
    ok: Boolean(value.ok),
    checkedAt: toTimestamp(value.checkedAt, value.checked_at, value.checkedAtIso, value.checked_at_iso, value.updatedAt, value.updated_at),
    checkedAtIso: String(value.checkedAtIso || value.checked_at_iso || value.checkedAt || value.checked_at || ""),
    dateKey: String(value.dateKey || value.date_key || ""),
    slot: String(value.slot || ""),
    failures: Array.isArray(value.failures) ? value.failures.map((item) => String(item || "")).filter(Boolean).slice(0, 4) : [],
    telegram: compactWatchdogChannel(value.telegram),
    email: compactWatchdogChannel(value.email),
    error: String(value.error || ""),
  };
}

function compactDeliveryWatchdogHistory(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map(compactDeliveryWatchdog)
    .filter(Boolean)
    .slice(0, 10);
}

function compactDeliveryChannelHistory(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map(compactDeliveryChannel)
    .filter(Boolean)
    .slice(0, 10);
}

function buildPlannerHealthSnapshot(meta = {}, now = Date.now()) {
  const lastEngineRun = meta.last_engine_run && typeof meta.last_engine_run === "object" ? meta.last_engine_run : null;
  const lastBootstrapTick = meta.last_bootstrap_tick && typeof meta.last_bootstrap_tick === "object" ? meta.last_bootstrap_tick : null;
  const lastCronTick = meta.last_cron_tick && typeof meta.last_cron_tick === "object" ? meta.last_cron_tick : null;
  const lastOutboxDrain = meta.last_outbox_drain && typeof meta.last_outbox_drain === "object" ? meta.last_outbox_drain : null;
  const backlog = meta.outbox_backlog && typeof meta.outbox_backlog === "object" ? meta.outbox_backlog : {};
  const delivery = meta.delivery_status && typeof meta.delivery_status === "object" ? meta.delivery_status : null;
  const deliveryChannels = meta.delivery_channels && typeof meta.delivery_channels === "object" ? meta.delivery_channels : {};
  const deliveryEmailHistory = compactDeliveryChannelHistory(meta.delivery_email_history);
  const deliveryTelegramHistory = compactDeliveryChannelHistory(meta.delivery_telegram_history);
  const deliveryWatchdog = meta.delivery_watchdog_status && typeof meta.delivery_watchdog_status === "object" ? meta.delivery_watchdog_status : null;
  const deliveryWatchdogHistory = compactDeliveryWatchdogHistory(meta.delivery_watchdog_history);
  const telegramLinkStatus = meta.telegram_link_status && typeof meta.telegram_link_status === "object" ? meta.telegram_link_status : null;
  const decisionSnapshot = meta.engine_decisions && typeof meta.engine_decisions === "object" ? meta.engine_decisions : {};
  const inboxSnapshot = meta.engine_inbox && typeof meta.engine_inbox === "object" ? meta.engine_inbox : {};
  const engineLock = meta.engine_lock && typeof meta.engine_lock === "object" ? meta.engine_lock : null;
  const angelEntry = meta.angel_entry_session && typeof meta.angel_entry_session === "object" ? meta.angel_entry_session : null;

  const engineAt = Number(lastEngineRun?.finished_at || lastEngineRun?.finishedAt || meta.lastTickAt || 0);
  const cronAt = Number(lastCronTick?.finished_at || lastCronTick?.finishedAt || 0);
  const outboxAt = Number(lastOutboxDrain?.finished_at || lastOutboxDrain?.finishedAt || 0);
  const engineStatus = String(lastEngineRun?.status || "").toLowerCase();
  const cronStatus = String(lastCronTick?.status || "").toLowerCase();
  const outboxStatus = String(lastOutboxDrain?.status || "").toLowerCase();
  const retry = Number(backlog.retry || 0);
  const dead = Number(backlog.dead || 0);
  const pending = Number(backlog.pending || 0);
  const sending = Number(backlog.sending || 0);
  const deliveryStatus = String(delivery?.status || "").toLowerCase();
  const deliveryErrorCode = String(delivery?.errorCode || delivery?.error_code || delivery?.diagnostic?.code || "");
  const deliveryChannel = String(delivery?.channel || "").toLowerCase();
  const deliveryAt = Number(delivery?.updatedAt || delivery?.updated_at || delivery?.createdAt || delivery?.created_at || delivery?.lastAt || delivery?.last_at || delivery?.sentAt || delivery?.sent_at || delivery?.resultAt || delivery?.result_at || 0);
  const telegramLinkedAt = Number(telegramLinkStatus?.lastSeenAt || telegramLinkStatus?.linkedAt || 0);
  const configuredChatHash = getTelegramChatHash(getConfiguredTelegramChatId());
  const currentChatHash = firstString(
    configuredChatHash,
    telegramLinkStatus?.currentChatHash,
    telegramLinkStatus?.current_chat_hash,
    telegramLinkStatus?.chatHash,
    telegramLinkStatus?.chat_hash,
    meta.telegramChatHash,
    meta.telegram_chat_hash,
  );
  const lastNudgeChatHash = deliveryChannel === "telegram"
    ? firstString(
      delivery?.chatHash,
      delivery?.chat_hash,
      delivery?.targetChatHash,
      delivery?.target_chat_hash,
      delivery?.payloadChatHash,
      delivery?.payload_chat_hash,
    )
    : "";
  const telegramTargetMismatch = Boolean(currentChatHash && lastNudgeChatHash && currentChatHash !== lastNudgeChatHash);
  const telegramRecoveredAfterFailure = deliveryChannel === "telegram"
    && deliveryErrorCode === "telegram_chat_unreachable"
    && telegramLinkedAt > 0
    && (!deliveryAt || telegramLinkedAt >= deliveryAt);

  let status = "ok";
  let reason = "healthy";
  if (telegramTargetMismatch) {
    status = "warning";
    reason = "telegram_target_mismatch";
  } else if (engineStatus === "failed") {
    status = "warning";
    reason = "engine_failed";
  } else if (cronStatus === "failed") {
    status = "warning";
    reason = "scheduled_worker_failed";
  } else if (((deliveryStatus === "dead" && dead > 0) || (deliveryErrorCode && dead > 0)) && !telegramRecoveredAfterFailure) {
    status = "warning";
    reason = "delivery_dead";
  } else if (((deliveryStatus === "retry" && retry > 0) || (deliveryErrorCode && retry > 0)) && !telegramRecoveredAfterFailure) {
    status = "warning";
    reason = "delivery_retry";
  } else if (dead > 0 && !telegramRecoveredAfterFailure) {
    status = "warning";
    reason = "outbox_dead";
  } else if (retry > 0 && !telegramRecoveredAfterFailure) {
    status = "warning";
    reason = "outbox_retry";
  } else if (engineAt && now - engineAt > 6 * 60 * 60 * 1000) {
    status = "warning";
    reason = "engine_stale";
  } else if (cronAt && now - cronAt > 14 * 60 * 60 * 1000) {
    status = "warning";
    reason = "scheduled_worker_stale";
  } else if (!engineAt) {
    status = "unknown";
    reason = "engine_missing";
  } else if (!cronAt) {
    status = "unknown";
    reason = "scheduled_worker_missing";
  }

  return {
    status,
    reason,
    updatedAt: now,
    engine: {
      status: engineStatus || "missing",
      lastAt: engineAt || 0,
      trigger: String(lastEngineRun?.trigger || ""),
      stats: lastEngineRun?.stats && typeof lastEngineRun.stats === "object" ? lastEngineRun.stats : {},
      lock: engineLock,
    },
    bootstrap: {
      status: String(lastBootstrapTick?.status || "missing").toLowerCase(),
      lastAt: Number(lastBootstrapTick?.finished_at || lastBootstrapTick?.finishedAt || 0),
    },
    scheduledWorker: {
      status: cronStatus || "missing",
      lastAt: cronAt || 0,
      trigger: String(lastCronTick?.trigger || ""),
    },
    outbox: {
      status: outboxStatus || "missing",
      lastAt: outboxAt || 0,
      backlog: { pending, retry, dead, sending, total: pending + retry + dead + sending },
    },
    delivery: delivery ? {
      contractVersion: Number(delivery.contractVersion || 0),
      outboxId: String(delivery.outboxId || delivery.outbox_id || ""),
      channel: String(delivery.channel || ""),
      topic: String(delivery.topic || ""),
      status: telegramRecoveredAfterFailure ? "recovered" : deliveryStatus || "unknown",
      recovered: telegramRecoveredAfterFailure,
      staleFailure: telegramRecoveredAfterFailure,
      attempt: Number(delivery.attempt || 0),
      updatedAt: Number(delivery.updatedAt || delivery.updated_at || delivery.resultAt || delivery.result_at || 0),
      resultAt: Number(delivery.resultAt || delivery.result_at || delivery.updatedAt || delivery.updated_at || 0),
      chatHash: firstString(delivery.chatHash, delivery.chat_hash),
      targetChatHash: firstString(delivery.targetChatHash, delivery.target_chat_hash, delivery.chatHash, delivery.chat_hash),
      targetSource: String(delivery.targetSource || delivery.target_source || ""),
      telegramMessageId: delivery.telegramMessageId || delivery.telegram_message_id || "",
      taskText: String(delivery.taskText || delivery.task_text || ""),
      messageKey: String(delivery.messageKey || delivery.message_key || ""),
      persona: String(delivery.persona || ""),
      errorCode: deliveryErrorCode,
      errorHint: String(delivery.errorHint || delivery.error_hint || delivery.diagnostic?.hint || ""),
      lastError: String(delivery.lastError || delivery.last_error || ""),
    } : null,
    deliveryChannels: {
      telegram: compactDeliveryChannel(deliveryChannels.telegram || (deliveryChannel === "telegram" ? delivery : null)),
      email: compactDeliveryChannel(deliveryChannels.email || (deliveryChannel === "email" ? delivery : null)),
    },
    deliveryEmailHistory,
    deliveryTelegramHistory,
    deliveryWatchdog: compactDeliveryWatchdog(deliveryWatchdog),
    deliveryWatchdogHistory,
    telegram: {
      status: String(telegramLinkStatus?.status || (telegramLinkStatus?.chatLinked ? "linked" : "missing")).toLowerCase(),
      linkedAt: Number(telegramLinkStatus?.linkedAt || 0),
      lastSeenAt: Number(telegramLinkStatus?.lastSeenAt || 0),
      recoveredAfterFailure: telegramRecoveredAfterFailure,
      currentChatHash,
      lastNudgeChatHash,
      targetMismatch: telegramTargetMismatch,
    },
    decisions: Array.isArray(decisionSnapshot.decisions) ? decisionSnapshot.decisions.slice(0, 6) : [],
    decisionsUpdatedAt: Number(decisionSnapshot.updatedAt || 0),
    inbox: Array.isArray(inboxSnapshot.items) ? inboxSnapshot.items.slice(0, 8) : [],
    inboxUpdatedAt: Number(inboxSnapshot.updatedAt || 0),
    angelEntry: angelEntry ? {
      contractVersion: String(angelEntry.contractVersion || ""),
      id: String(angelEntry.id || ""),
      trigger: String(angelEntry.trigger || ""),
      mode: String(angelEntry.mode || ""),
      taskId: String(angelEntry.taskId || ""),
      source: String(angelEntry.source || ""),
      createdAt: Number(angelEntry.createdAt || 0),
      expiresAt: Number(angelEntry.expiresAt || 0),
    } : null,
  };
}

function compactEngineLock(lock = {}, now = Date.now()) {
  if (!lock || typeof lock !== "object") {
    return { status: "missing", active: false, remainingMs: 0 };
  }
  const expiresAt = Number(lock.expiresAt || lock.expires_at || 0);
  const acquiredAt = Number(lock.acquiredAt || lock.acquired_at || 0);
  const releasedAt = Number(lock.releasedAt || lock.released_at || 0);
  const active = expiresAt > now && !releasedAt;
  return {
    status: active ? "active" : releasedAt ? "released" : expiresAt ? "expired" : "missing",
    active,
    runId: String(lock.runId || lock.run_id || ""),
    trigger: String(lock.trigger || ""),
    acquiredAt,
    expiresAt,
    releasedAt,
    remainingMs: active ? Math.max(0, expiresAt - now) : 0,
  };
}

module.exports = {
  buildPlannerHealthSnapshot,
  compactEngineLock,
};
