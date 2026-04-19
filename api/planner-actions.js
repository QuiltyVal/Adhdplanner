const {
  parseBody,
  parseBooleanFlag,
  runPlannerRouteForUser,
} = require("./_lib/planner-actions-runtime");
const { validatePlannerActionRequest } = require("./_lib/planner-contract");

const DEFAULT_USER_ID = String(process.env.PLANNER_DEFAULT_USER_ID || "").trim();
const ACTIONS_API_SECRET = String(
  process.env.PLANNER_ACTIONS_SECRET ||
  process.env.TELEGRAM_CRON_SECRET ||
  process.env.CRON_SECRET ||
  "",
).trim();

function getAuthToken(req) {
  const authorization = String(req.headers?.authorization || "").trim();
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  const direct = String(req.headers?.["x-planner-actions-secret"] || "").trim();
  if (direct) return direct;

  return "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!ACTIONS_API_SECRET) {
    return res.status(503).json({
      ok: false,
      error: "planner actions API is not configured",
      details: "Set PLANNER_ACTIONS_SECRET (or CRON_SECRET/TELEGRAM_CRON_SECRET) on the server",
    });
  }

  const authToken = getAuthToken(req);
  if (!authToken || authToken !== ACTIONS_API_SECRET) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
  }

  const { parsed, error: parseError } = parseBody(req.body);
  if (parseError) {
    return res.status(400).json({
      ok: false,
      errors: [{ field: "body", message: parseError }],
    });
  }

  const validation = validatePlannerActionRequest(parsed);
  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      errors: validation.errors,
    });
  }

  const request = validation.request || {};
  const userId = request.userId || DEFAULT_USER_ID;
  if (!userId) {
    return res.status(400).json({
      ok: false,
      errors: [{
        field: "userId",
        message: "userId is required when PLANNER_DEFAULT_USER_ID is not configured",
      }],
    });
  }

  try {
    const includeState = parseBooleanFlag(
      parsed?.includeState ?? parsed?.include_state,
      false,
    );
    const includeNonActive = parseBooleanFlag(
      parsed?.includeNonActive ?? parsed?.include_non_active,
      includeState,
    );

    const result = await runPlannerRouteForUser({
      userId,
      chatId: request.chatId || "planner_actions_api",
      route: request.route,
      includeState,
      includeNonActive,
      log: null,
    });

    return res.status(200).json({
      ok: true,
      route: request.route,
      messages: result.messages,
      state: includeState ? result.state : undefined,
    });
  } catch (error) {
    console.error("[planner-actions]", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to execute planner action",
    });
  }
};
