const { buildAngelEntryNotificationCopy } = require("./planner-angel-engagement-copy");
const { buildAngelEntryDedupeKey } = require("./planner-angel-engagement-contract");

function buildAngelEntryOutboxPayload({
  baseUserRef,
  rootData = {},
  session = null,
  task = null,
  channel = "telegram",
  now = Date.now(),
} = {}) {
  if (!baseUserRef || !session) return null;

  const safeChannel = String(channel || "telegram").toLowerCase();
  const userId = String(baseUserRef.id || session.userId || "");
  const deliveryDedupeKey = buildAngelEntryDedupeKey({
    userId,
    trigger: session.trigger,
    taskId: session.taskId,
    now: session.createdAt || now,
  });
  const language = String(rootData.language || rootData.preferredLanguage || session.language || "en");
  const copy = buildAngelEntryNotificationCopy(session, {
    language,
    task,
    taskTitle: task?.text || task?.title || "",
  });

  if (safeChannel === "telegram") {
    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID || rootData.telegramChatId || "";
    if (!chatId) return null;
    return {
      channel: "telegram",
      topic: "angel_entry_session",
      dedupe_key: `telegram_${deliveryDedupeKey}`,
      delivery_dedupe_key: `telegram:${deliveryDedupeKey}`,
      payload: {
        chatId: String(chatId),
        text: `${copy.subject}\n${copy.body}`,
        deliveryDedupeKey: `telegram:${deliveryDedupeKey}`,
        messageKey: "angel_entry_session",
        persona: "angel",
        tone: copy.tone,
        cta: copy.cta,
        sessionId: session.id,
        sessionTrigger: session.trigger,
        sessionMode: session.mode,
        taskId: session.taskId || "",
        taskText: String(task?.text || task?.title || ""),
      },
      createdAt: now,
    };
  }

  if (safeChannel === "email") {
    const email = rootData.email || rootData.userEmail || "";
    if (!email) return null;
    return {
      channel: "email",
      topic: "angel_entry_session",
      dedupe_key: `email_${deliveryDedupeKey}`,
      delivery_dedupe_key: `email:${deliveryDedupeKey}`,
      payload: {
        to: String(email),
        subject: copy.subject,
        text: copy.body,
        deliveryDedupeKey: `email:${deliveryDedupeKey}`,
        messageKey: "angel_entry_session",
        persona: "angel",
        tone: copy.tone,
        cta: copy.cta,
        sessionId: session.id,
        sessionTrigger: session.trigger,
        sessionMode: session.mode,
        taskId: session.taskId || "",
        taskText: String(task?.text || task?.title || ""),
      },
      createdAt: now,
    };
  }

  return null;
}

module.exports = {
  buildAngelEntryOutboxPayload,
};
