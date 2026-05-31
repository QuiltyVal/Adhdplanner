const { buildScheduledNudgeText, getBerlinParts } = require("./planner-nudge-schedule");
const { plannerTaskKeyboard } = require("./telegram");
const {
  getTelegramChatDedupePart,
  getTelegramChatHash,
  getTelegramTargetChatId,
  getTelegramTargetSource,
} = require("./telegram-chat-identity");

function buildScheduledNudgeOutboxPayload(baseUserRef, rootData = {}, task = null, slot = "checkin", now = Date.now(), forceNudge = false) {
  const chatId = getTelegramTargetChatId(rootData);
  if (!chatId) return null;

  const { dateKey, hour } = getBerlinParts(now);
  const safeSlot = slot || "checkin";
  const chatHash = getTelegramChatHash(chatId);
  const chatDedupePart = getTelegramChatDedupePart(chatId);
  const dedupePart = forceNudge ? `force_${dateKey}_${hour}_${chatDedupePart}` : `${dateKey}_${safeSlot}_${chatDedupePart}`;
  const deliveryDedupeKey = `scheduled_nudge:${baseUserRef.id}:${dedupePart}`;
  return {
    channel: "telegram",
    topic: "scheduled_nudge",
    dedupe_key: `telegram_scheduled_nudge_${baseUserRef.id}_${dedupePart}`,
    delivery_dedupe_key: deliveryDedupeKey,
    payload: {
      chatId: String(chatId),
      chatHash,
      targetSource: getTelegramTargetSource(rootData),
      text: buildScheduledNudgeText(task, safeSlot),
      deliveryDedupeKey,
      messageKey: "scheduled_nudge",
      params: {
        taskText: String(task?.text || ""),
        slot: String(safeSlot),
      },
      persona: "angel",
      taskText: String(task?.text || ""),
      replyMarkup: task ? plannerTaskKeyboard(task.id) : undefined,
    },
    createdAt: now,
  };
}

module.exports = {
  buildScheduledNudgeOutboxPayload,
};
