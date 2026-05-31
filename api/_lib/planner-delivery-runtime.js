const { telegramRequest } = require("./telegram");

function buildDeliveryStatus(item = {}, status = "queued", now = Date.now(), extra = {}) {
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const params = payload.params && typeof payload.params === "object" ? payload.params : {};
  const diagnostic = extra.diagnostic && typeof extra.diagnostic === "object" ? extra.diagnostic : null;
  return {
    contractVersion: 1,
    outboxId: String(item.id || item.outbox_id || item.outboxId || ""),
    channel: String(item.channel || extra.channel || "delivery"),
    topic: String(item.topic || extra.topic || "planner_notification"),
    status: String(status || "queued"),
    lastError: String(extra.error || extra.last_error || ""),
    errorCode: String(diagnostic?.code || extra.errorCode || extra.error_code || ""),
    errorHint: String(diagnostic?.hint || extra.errorHint || extra.error_hint || ""),
    attempt: Number(item.attempts || item.attempt || extra.attempt || 0),
    updatedAt: Number(now || Date.now()),
    resultAt: Number(now || Date.now()),
    chatHash: String(payload.chatHash || payload.chat_hash || extra.chatHash || extra.chat_hash || ""),
    targetChatHash: String(payload.targetChatHash || payload.target_chat_hash || payload.chatHash || payload.chat_hash || extra.targetChatHash || extra.target_chat_hash || extra.chatHash || extra.chat_hash || ""),
    targetSource: String(payload.targetSource || payload.target_source || extra.targetSource || extra.target_source || ""),
    telegramMessageId: extra.telegramMessageId || extra.messageId || extra.message_id || "",
    emailMessageId: extra.emailMessageId || extra.id || extra.messageId || extra.message_id || "",
    targetHash: String(payload.targetHash || payload.target_hash || extra.targetHash || extra.target_hash || ""),
    taskText: String(payload.taskText || extra.taskText || ""),
    messageKey: String(payload.messageKey || payload.message_key || extra.messageKey || extra.message_key || ""),
    persona: String(payload.persona || extra.persona || ""),
    slot: String(payload.slot || payload.nudgeSlot || payload.nudge_slot || params.slot || extra.slot || ""),
    dateKey: String(payload.dateKey || payload.date_key || params.dateKey || params.date_key || extra.dateKey || extra.date_key || ""),
    diagnostic,
  };
}

function buildOutboxRunResult(item = {}, status = "unknown", extra = {}) {
  const diagnostic = extra.diagnostic && typeof extra.diagnostic === "object" ? extra.diagnostic : null;
  return {
    contractVersion: 1,
    id: String(item.id || item.outbox_id || item.outboxId || ""),
    outboxId: String(item.id || item.outbox_id || item.outboxId || ""),
    channel: String(item.channel || extra.channel || ""),
    topic: String(item.topic || extra.topic || ""),
    status: String(status || "unknown"),
    attempt: Number(item.attempts || item.attempt || extra.attempt || 0),
    error: String(extra.error || extra.lastError || extra.last_error || ""),
    errorCode: String(diagnostic?.code || extra.errorCode || extra.error_code || ""),
    errorHint: String(diagnostic?.hint || extra.errorHint || extra.error_hint || ""),
    diagnostic,
    updatedAt: Date.now(),
  };
}

function buildOutboxDrainRun({
  runId = "",
  startedAt = Date.now(),
  finishedAt = Date.now(),
  claimed = 0,
  results = [],
  serverTimestamp = null,
} = {}) {
  const sentCount = results.filter((item) => item.status === "sent").length;
  const retryCount = results.filter((item) => item.status === "retry").length;
  const deadCount = results.filter((item) => item.status === "dead").length;
  const failedCount = retryCount + deadCount;
  return {
    id: String(runId || `outbox_${startedAt}`),
    run_id: String(runId || `outbox_${startedAt}`),
    started_at: Number(startedAt || Date.now()),
    finished_at: Number(finishedAt || Date.now()),
    status: failedCount > 0 ? "warning" : "ok",
    stats: {
      claimed: Number(claimed || 0),
      sent: sentCount,
      retry: retryCount,
      dead: deadCount,
      failed: failedCount,
    },
    results: results.slice(0, 20),
    createdAt: Number(startedAt || Date.now()),
    createdAtServer: serverTimestamp,
  };
}

function buildOutboxDrainResponse({ runId = "", claimed = 0, results = [], run = null } = {}) {
  return {
    ok: true,
    runId: String(runId || run?.run_id || run?.id || ""),
    claimed: Number(claimed || 0),
    results: Array.isArray(results) ? results : [],
    outboxDrain: run || null,
  };
}

function buildOutboxQueuedEventSpec(outbox = {}, now = Date.now()) {
  const payload = outbox.payload && typeof outbox.payload === "object" ? outbox.payload : {};
  return {
    id: `outbox_queued_${outbox.id}`,
    event_type: "OUTBOX_QUEUED",
    type: "outbox_queued",
    actor_type: "delivery",
    actor_ref: outbox.channel,
    source: outbox.channel,
    entity_type: "outbox",
    entity_id: outbox.id,
    message: `Outbox ${outbox.channel} queued: ${outbox.topic}`,
    visible_in_feed: true,
    visible_in_report: true,
    payload: {
      outboxId: outbox.id,
      status: "queued",
      channel: outbox.channel,
      topic: outbox.topic,
      messageKey: String(payload.messageKey || payload.message_key || ""),
      params: payload.params && typeof payload.params === "object" ? payload.params : {},
      persona: String(payload.persona || ""),
      taskText: String(payload.taskText || ""),
    },
    createdAt: Number(now || Date.now()),
  };
}

function buildOutboxDeliveryEventSpec(item = {}, status = "unknown", payload = {}, createdAt = Date.now()) {
  return {
    id: `delivery_${item.id}_${status}`,
    event_type: "OUTBOX_DELIVERY",
    type: "outbox_delivery",
    actor_type: "delivery",
    actor_ref: item.channel,
    source: item.channel,
    entity_type: "outbox",
    entity_id: item.id,
    message: `Outbox ${item.channel} ${status}: ${item.topic}`,
    visible_in_feed: true,
    visible_in_report: true,
    payload: {
      outboxId: item.id,
      status,
      channel: item.channel,
      topic: item.topic,
      ...payload,
    },
    createdAt,
  };
}

function classifyDeliveryError(error, item = {}) {
  const message = String(error?.message || error || "delivery failed");
  const lower = message.toLowerCase();
  const channel = String(item?.channel || "").toLowerCase();
  let code = "unknown_delivery_error";
  let hint = "Delivery failed. Check channel credentials and provider logs.";
  let retryable = true;
  let requiresRelink = false;

  if (channel === "telegram") {
    if (lower.includes("chat not found") || lower.includes("bot was blocked") || lower.includes("forbidden")) {
      code = "telegram_chat_unreachable";
      hint = "Telegram chat is unavailable. Re-link the bot or check whether the user blocked it.";
      retryable = false;
      requiresRelink = true;
    } else if (lower.includes("unauthorized") || lower.includes("token") || lower.includes("401")) {
      code = "telegram_token_invalid";
      hint = "Telegram token looks invalid. Check TELEGRAM_BOT_TOKEN.";
      retryable = false;
    } else if (lower.includes("too many requests") || lower.includes("429")) {
      code = "telegram_rate_limited";
      hint = "Telegram rate limit hit. Retry later.";
    } else {
      code = "telegram_send_failed";
      hint = "Telegram send failed. Check bot token, chat id, and Telegram API response.";
    }
  } else if (channel === "email") {
    if (lower.includes("email_not_configured") || lower.includes("resend_api_key") || lower.includes("api key")) {
      code = "email_not_configured";
      hint = "Email provider is not configured. Check RESEND_API_KEY and sender settings.";
    } else if (lower.includes("domain") || lower.includes("sender") || lower.includes("from")) {
      code = "email_sender_invalid";
      hint = "Email sender/domain is not accepted by the provider.";
    } else if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("403")) {
      code = "email_auth_failed";
      hint = "Email provider rejected credentials.";
    } else {
      code = "email_send_failed";
      hint = "Email send failed. Check provider response and recipient settings.";
    }
  } else if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout")) {
    code = "network_error";
    hint = "Network/provider request failed. Retry should handle this if provider recovers.";
  }

  return {
    code,
    hint,
    message,
    channel,
    retryable,
    requiresRelink,
  };
}

async function sendEmail(payload = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { skipped: true, reason: "email_not_configured" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: payload.from || process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM,
      to: payload.to,
      subject: payload.subject || "ADHD Planner",
      html: payload.html || payload.body || "",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${data.message || data.error || "email failed"}`);
  }
  return { ok: true, id: data.id || null };
}

async function deliverOutboxItem(item = {}) {
  const payload = item.payload || {};
  if (item.channel === "telegram") {
    let replyMarkup = payload.replyMarkup;
    if (!replyMarkup && payload.replyMarkupJson) {
      try {
        replyMarkup = JSON.parse(payload.replyMarkupJson);
      } catch {
        replyMarkup = undefined;
      }
    }
    const result = await telegramRequest("sendMessage", {
      chat_id: payload.chatId,
      text: payload.text || "",
      parse_mode: payload.parseMode,
      reply_markup: replyMarkup,
    });
    return {
      ok: true,
      telegramMessageId: result?.message_id || null,
      telegramDate: result?.date || null,
      telegramChatType: result?.chat?.type || "",
    };
  }

  if (item.channel === "email") {
    return sendEmail(payload);
  }

  return { skipped: true, reason: `unsupported_channel:${item.channel}` };
}

module.exports = {
  buildDeliveryStatus,
  buildOutboxDrainResponse,
  buildOutboxDrainRun,
  buildOutboxDeliveryEventSpec,
  buildOutboxQueuedEventSpec,
  buildOutboxRunResult,
  classifyDeliveryError,
  deliverOutboxItem,
  sendEmail,
};
