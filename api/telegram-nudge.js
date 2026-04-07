const { buildNudgeMessage, getPlannerData, pickRescueTask } = require("./_lib/planner-store");
const { plannerTaskKeyboard, telegramRequest } = require("./_lib/telegram");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;

function isAuthorized(req) {
  const secret = process.env.TELEGRAM_CRON_SECRET;
  if (!secret) return true;

  const headerSecret = req.headers["x-telegram-cron-secret"];
  const querySecret = req.query?.secret;
  return headerSecret === secret || querySecret === secret;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
    const text = buildNudgeMessage(task);

    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: task ? plannerTaskKeyboard(task.id) : undefined,
    });

    return res.status(200).json({
      ok: true,
      taskId: task?.id || null,
      text,
    });
  } catch (error) {
    console.error("[telegram-nudge]", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
};
