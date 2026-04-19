const { admin, getAdminApp } = require("./_lib/firebase-admin");
const {
  parseBody,
  parseBooleanFlag,
  runPlannerRouteForUser,
} = require("./_lib/planner-actions-runtime");
const { validatePlannerActionRequest } = require("./_lib/planner-contract");

function getBearerToken(req) {
  const authHeader = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function verifyClientUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, statusCode: 401, error: "Missing authorization token" };
  }

  try {
    getAdminApp();
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = String(decoded?.uid || "").trim();
    if (!uid) {
      return { ok: false, statusCode: 401, error: "Invalid authorization token" };
    }
    return { ok: true, uid };
  } catch (error) {
    return { ok: false, statusCode: 401, error: "Invalid authorization token" };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await verifyClientUser(req);
  if (!auth.ok) {
    return res.status(auth.statusCode).json({
      ok: false,
      error: auth.error,
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
  const requestUserId = String(request.userId || "").trim();
  const userId = requestUserId || auth.uid;

  if (requestUserId && requestUserId !== auth.uid) {
    return res.status(403).json({
      ok: false,
      error: "Forbidden user scope",
      details: "userId must match authenticated user",
    });
  }

  try {
    const includeState = parseBooleanFlag(
      parsed?.includeState ?? parsed?.include_state,
      true,
    );
    const includeNonActive = parseBooleanFlag(
      parsed?.includeNonActive ?? parsed?.include_non_active,
      includeState,
    );

    const result = await runPlannerRouteForUser({
      userId,
      chatId: request.chatId || `planner_client_${userId}`,
      route: request.route,
      includeState,
      includeNonActive,
      log: null,
    });

    return res.status(200).json({
      ok: true,
      userId,
      route: request.route,
      messages: result.messages,
      state: includeState ? result.state : undefined,
    });
  } catch (error) {
    console.error("[planner-client-actions]", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to execute planner action",
    });
  }
};

