const { buildNudgeMessage, getPlannerData, pickRescueTask } = require("./_lib/planner-store");
const { plannerTaskKeyboard, telegramRequest } = require("./_lib/telegram");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;
const NUDGE_TIMEZONE = "Europe/Berlin";

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  const legacySecret = process.env.TELEGRAM_CRON_SECRET;
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const headerSecret = req.headers["x-telegram-cron-secret"];
  const querySecret = req.query?.secret;

  if (cronSecret && bearerToken === cronSecret) return true;
  if (legacySecret && (headerSecret === legacySecret || querySecret === legacySecret || bearerToken === legacySecret)) {
    return true;
  }

  if (!cronSecret && !legacySecret) return true;
  return false;
}

function getBerlinHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NUDGE_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hourPart = parts.find((part) => part.type === "hour");
  return Number(hourPart?.value || "0");
}

function getNudgeSlot(now = new Date()) {
  return getBerlinHour(now) < 13 ? "morning" : "evening";
}

function normalizeRequestedSlot(value = "") {
  const lowered = String(value || "").trim().toLowerCase();
  if (lowered === "morning" || lowered === "evening") return lowered;
  return null;
}

function buildScheduledNudgeMessage(task, slot) {
  const base = buildNudgeMessage(task);

  if (slot === "morning") {
    return [
      "🌅 Утренний пинок.",
      base,
      task ? "Сделай один шаг до того, как день размажет внимание." : "",
    ].filter(Boolean).join("\n");
  }

  return [
    "🌙 Вечерний пинок.",
    base,
    task ? "Если сил мало, жми Panic и сделай один кривой шаг." : "Если день разъехался, открой planner и выбери одну живую задачу.",
  ].join("\n");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!DEFAULT_USER_ID) {
    return res.status(500).json({ error: "PLANNER_DEFAULT_USER_ID is not configured" });
  }

  try {
    const plannerData = await getPlannerData(DEFAULT_USER_ID);
    const chatId = plannerData.telegramChatId || process.env.TELEGRAM_ALLOWED_CHAT_ID;
    if (!chatId) {
      return res.status(400).json({ error: "No Telegram chat is linked yet" });
    }

    const task = pickRescueTask(plannerData.tasks);
    const requestedSlot = normalizeRequestedSlot(req.query?.slot || req.body?.slot);
    const slot = requestedSlot || getNudgeSlot();
    const text = buildScheduledNudgeMessage(task, slot);

    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: task ? plannerTaskKeyboard(task.id) : undefined,
    });

    return res.status(200).json({
      ok: true,
      slot,
      taskId: task?.id || null,
      text,
    });
  } catch (error) {
    console.error("[telegram-nudge]", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
};
