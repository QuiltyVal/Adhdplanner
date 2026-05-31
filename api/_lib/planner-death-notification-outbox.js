const {
  buildDeathEmailHtml,
  buildDeathMessageSpec,
  buildDeathTelegramText,
} = require("./planner-delivery-messages");
const { completedTaskKeyboard } = require("./telegram");

function buildDeathNotificationOutboxPayloads(rootData = {}, task = {}, source = "auto_death", event = {}) {
  const payloads = [];
  const messageSpec = buildDeathMessageSpec(task, source);
  const createdAt = Number(event.createdAt || Date.now());
  const eventId = event.id || event.event_id || "";
  const taskId = task.id || event.entity_id || "task";
  const taskText = task.text || "a task";
  const deathDedupePart = `${taskId}:${task.deadAt || eventId || createdAt}`;

  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID || rootData.telegramChatId || "";
  if (chatId) {
    const deliveryDedupeKey = `task_auto_cemetery:telegram:${deathDedupePart}`;
    payloads.push({
      channel: "telegram",
      topic: "task_auto_cemetery",
      dedupe_key: `telegram_task_auto_cemetery_${taskId}_${task.deadAt || createdAt}`,
      delivery_dedupe_key: deliveryDedupeKey,
      caused_by_event_id: eventId,
      payload: {
        chatId: String(chatId),
        text: buildDeathTelegramText(task, source),
        deliveryDedupeKey,
        messageKey: messageSpec.messageKey,
        params: messageSpec.params,
        persona: messageSpec.persona,
        taskText: messageSpec.params.taskText,
        replyMarkup: completedTaskKeyboard(taskId),
      },
      createdAt,
    });
  }

  const to = process.env.DEATH_NOTIFICATION_EMAIL || rootData.email || "";
  const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || "";
  if (process.env.RESEND_API_KEY && from && to) {
    const deliveryDedupeKey = `task_auto_cemetery:email:${deathDedupePart}`;
    payloads.push({
      channel: "email",
      topic: "task_auto_cemetery",
      dedupe_key: `email_task_auto_cemetery_${taskId}_${task.deadAt || createdAt}`,
      delivery_dedupe_key: deliveryDedupeKey,
      caused_by_event_id: eventId,
      payload: {
        from,
        to,
        subject: `ADHD Planner: ${taskText} moved to Cemetery`,
        html: buildDeathEmailHtml(task, source),
        deliveryDedupeKey,
        messageKey: messageSpec.messageKey,
        params: messageSpec.params,
        persona: messageSpec.persona,
        taskText: messageSpec.params.taskText,
      },
      createdAt,
    });
  }

  return payloads;
}

module.exports = {
  buildDeathNotificationOutboxPayloads,
};
