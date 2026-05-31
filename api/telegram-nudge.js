const {
  buildPlannerWorkerErrorResponse,
  buildPlannerWorkerSuccessResponse,
} = require("./_lib/planner-worker-response-contract");
const { drainOutbox, runPlannerTick } = require("./_lib/planner-engine");
const { getDb } = require("./_lib/firebase-admin");
const { runPlannerSelfTest } = require("./_lib/planner-self-test");
const { telegramRequest } = require("./_lib/telegram");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;

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

function normalizeRequestedSlot(value = "") {
  const lowered = String(value || "").trim().toLowerCase();
  if (lowered === "morning" || lowered === "evening") return lowered;
  return null;
}

function wantsForcedNudge(req, action, requestedSlot) {
  const forceValue = req.query?.force ?? req.body?.force;
  if (forceValue === "1" || forceValue === 1 || forceValue === true || forceValue === "true") return true;
  if (action === "manual-force") return true;
  if (requestedSlot) return false;
  if (req.method === "POST" && action !== "maintenance" && action !== "outbox-drain") return false;
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json(buildPlannerWorkerErrorResponse({
      action: "method_not_allowed",
      error: "Method not allowed",
    }));
  }

  if (!isAuthorized(req)) {
    return res.status(401).json(buildPlannerWorkerErrorResponse({
      action: "unauthorized",
      error: "Unauthorized",
    }));
  }

  if (!DEFAULT_USER_ID) {
    return res.status(500).json(buildPlannerWorkerErrorResponse({
      action: "misconfigured",
      error: "PLANNER_DEFAULT_USER_ID is not configured",
    }));
  }

  const action = String(req.query?.action || req.body?.action || "").trim();

  try {
    if (action === "task-death-notify") {
      return res.status(410).json(buildPlannerWorkerErrorResponse({
        action,
        error: "Deprecated endpoint. System cemetery notifications are emitted by Planner Engine outbox only.",
      }));
    }

    if (action === "planner-self-test") {
      const selfTest = await runPlannerSelfTest({
        userId: "planner_worker_self_test",
        now: Date.now(),
      });
      return res.status(selfTest.ok ? 200 : 500).json(buildPlannerWorkerSuccessResponse({
        action,
        extra: { selfTest },
      }));
    }

    if (action === "outbox-drain") {
      const outbox = await drainOutbox({
        userId: DEFAULT_USER_ID,
        limit: Number(req.query?.limit || req.body?.limit || 20),
      });
      return res.status(200).json(buildPlannerWorkerSuccessResponse({
        action: "outbox-drain",
        extra: { outbox },
      }));
    }

    if (action === "telegram-ping") {
      const userSnap = await getDb().collection("Users").doc(DEFAULT_USER_ID).get();
      const rootData = userSnap.exists ? userSnap.data() || {} : {};
      const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID || rootData.telegramChatId || "";
      if (!chatId) {
        return res.status(500).json(buildPlannerWorkerErrorResponse({
          action,
          error: "Telegram chat id is not configured",
        }));
      }

      const result = await telegramRequest("sendMessage", {
        chat_id: chatId,
        text: `ADHD Planner delivery ping · ${new Date().toISOString()}`,
      });

      return res.status(200).json(buildPlannerWorkerSuccessResponse({
        action,
        extra: {
          telegram: {
            ok: true,
            messageId: result?.message_id || null,
            date: result?.date || null,
            chatType: result?.chat?.type || "",
          },
        },
      }));
    }

    const requestedSlot = normalizeRequestedSlot(req.query?.slot || req.body?.slot);
    const forceNudge = wantsForcedNudge(req, action, requestedSlot);
    const tick = await runPlannerTick({
      userId: DEFAULT_USER_ID,
      trigger: action === "maintenance" ? "telegram_nudge_maintenance" : "telegram_nudge",
      forceNudge,
      slot: requestedSlot,
      allowScheduledNudge: action !== "maintenance",
    });
    const outbox = await drainOutbox({ userId: DEFAULT_USER_ID, limit: 20 });

    return res.status(200).json(buildPlannerWorkerSuccessResponse({
      action: action || "planner_tick",
      extra: { tick, outbox },
    }));
  } catch (error) {
    console.error("[telegram-nudge]", error);
    return res.status(500).json(buildPlannerWorkerErrorResponse({
      action: action || "planner_tick",
      error: error.message || "Internal error",
    }));
  }
};
