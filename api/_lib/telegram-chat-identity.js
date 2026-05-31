const { createHash } = require("node:crypto");

function normalizeTelegramChatId(chatId = "") {
  return String(chatId || "").trim();
}

function getConfiguredTelegramChatId() {
  return normalizeTelegramChatId(process.env.TELEGRAM_ALLOWED_CHAT_ID || "");
}

function getTelegramTargetChatId(rootData = {}) {
  return getConfiguredTelegramChatId() || normalizeTelegramChatId(rootData.telegramChatId || "");
}

function getTelegramChatHash(chatId = "") {
  const normalized = normalizeTelegramChatId(chatId);
  if (!normalized) return "";
  return createHash("sha256").update(normalized).digest("hex").slice(0, 10);
}

function getTelegramChatDedupePart(chatId = "") {
  const chatHash = getTelegramChatHash(chatId);
  return chatHash ? `chat_${chatHash}` : "chat_missing";
}

function getTelegramTargetSource(rootData = {}) {
  return getConfiguredTelegramChatId() ? "allowed_env" : rootData.telegramChatId ? "user_link" : "missing";
}

module.exports = {
  getConfiguredTelegramChatId,
  getTelegramChatDedupePart,
  getTelegramChatHash,
  getTelegramTargetChatId,
  getTelegramTargetSource,
  normalizeTelegramChatId,
};
