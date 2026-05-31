const { admin, getAdminApp } = require("./_lib/firebase-admin");
const {
  parseBody,
  parseBooleanFlag,
  runPlannerRouteForUser,
} = require("./_lib/planner-actions-runtime");
const {
  buildPlannerBootstrapClientResponse,
  buildPlannerClientErrorResponse,
  buildPlannerDebugRunClientResponse,
  buildPlannerRouteClientResponse,
  withPlannerClientResponseContract,
} = require("./_lib/planner-client-response-contract");
const { PLANNER_CLIENT_MODES } = require("./_lib/planner-client-modes");
const { validatePlannerActionRequest } = require("./_lib/planner-contract");
const { ackReportItems, drainOutbox, getPlannerBootstrap, runPlannerTick } = require("./_lib/planner-engine");
const { classifyRescueIntent, suggestClarifyStep } = require("./_lib/rescue-intent-classifier");
const { runPlannerSelfTest } = require("./_lib/planner-self-test");
const { runPlannerDeliveryWatchdog } = require("./_lib/planner-delivery-watchdog");

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
    return res.status(405).json(buildPlannerClientErrorResponse({ error: "Method not allowed" }));
  }

  const auth = await verifyClientUser(req);
  if (!auth.ok) {
    return res.status(auth.statusCode).json(buildPlannerClientErrorResponse({ error: auth.error }));
  }

  const { parsed, error: parseError } = parseBody(req.body);
  if (parseError) {
    return res.status(400).json(buildPlannerClientErrorResponse({
      error: "Invalid request body",
      errors: [{ field: "body", message: parseError }],
    }));
  }

  const mode = String(parsed?.mode || parsed?.action || "").trim();
  if (mode === PLANNER_CLIENT_MODES.BOOTSTRAP) {
    try {
      let engine = null;
      try {
        engine = await runPlannerTick({
          userId: auth.uid,
          now: Date.now(),
          trigger: "bootstrap",
          allowScheduledNudge: false,
        });
      } catch (tickError) {
        console.warn("[planner-client-actions:bootstrap-tick]", tickError);
      }

      const reportLimit = Math.min(20, Math.max(1, Number(parsed?.reportLimit || parsed?.report_limit || 10)));
      const payload = await getPlannerBootstrap(auth.uid, {
        reportCursor: parsed?.reportCursor || parsed?.report_cursor || null,
        reportLimit,
        language: parsed?.language || parsed?.locale || "",
      });
      return res.status(200).json(buildPlannerBootstrapClientResponse({ payload, engine }));
    } catch (error) {
      console.error("[planner-client-actions:bootstrap]", error);
      return res.status(500).json(buildPlannerClientErrorResponse({
        error: error.message || "Failed to load planner bootstrap",
      }));
    }
  }

  if (mode === PLANNER_CLIENT_MODES.REPORT_ACK) {
    try {
      const ids = Array.isArray(parsed?.reportItemIds)
        ? parsed.reportItemIds
        : Array.isArray(parsed?.ids)
          ? parsed.ids
          : [];
      const result = await ackReportItems(auth.uid, ids, Date.now(), {
        ackAllUnread: parseBooleanFlag(parsed?.ackAllUnread ?? parsed?.ack_all_unread, false),
      });
      return res.status(200).json(withPlannerClientResponseContract(result));
    } catch (error) {
      console.error("[planner-client-actions:report-ack]", error);
      return res.status(500).json(buildPlannerClientErrorResponse({
        error: error.message || "Failed to acknowledge report items",
      }));
    }
  }

  if (mode === PLANNER_CLIENT_MODES.DEBUG_RUN) {
    try {
      const target = String(parsed?.target || "").trim();
      const now = Date.now();
      let result = null;
      if (target === "engine") {
        result = await runPlannerTick({
          userId: auth.uid,
          now,
          trigger: "manual",
          allowScheduledNudge: false,
        });
      } else if (target === "telegram-nudge" || target === "telegram_nudge") {
        const tick = await runPlannerTick({
          userId: auth.uid,
          now,
          trigger: "telegram_nudge_manual",
          forceNudge: true,
          slot: "evening",
          allowScheduledNudge: true,
        });
        const outbox = await drainOutbox({
          userId: auth.uid,
          now: Date.now(),
          limit: 20,
        });
        const drainStats = outbox?.outboxDrain?.stats && typeof outbox.outboxDrain.stats === "object"
          ? outbox.outboxDrain.stats
          : {};
        result = {
          ok: tick?.ok !== false && outbox?.ok !== false,
          status: outbox?.outboxDrain?.status || "ok",
          trigger: "telegram_nudge_manual",
          tick,
          outbox,
          stats: {
            heatUpdated: Number(tick?.heatUpdated || 0),
            deadCount: Array.isArray(tick?.deadTasks) ? tick.deadTasks.length : Number(tick?.deadCount || 0),
            outboxQueued: Number(tick?.outboxQueued || 0),
            claimed: Number(drainStats.claimed || outbox?.claimed || 0),
            sent: Number(drainStats.sent || 0),
            retry: Number(drainStats.retry || 0),
            dead: Number(drainStats.dead || 0),
          },
        };
      } else if (target === "outbox") {
        result = await drainOutbox({
          userId: auth.uid,
          now,
          limit: 20,
        });
      } else if (target === "self-test" || target === "self_test") {
        result = await runPlannerSelfTest({
          userId: auth.uid,
          now,
        });
      } else if (target === "delivery-watchdog" || target === "delivery_watchdog" || target === "watchdog") {
        result = await runPlannerDeliveryWatchdog({
          userId: auth.uid,
          now,
          slot: parsed?.slot || parsed?.deliverySlot || parsed?.delivery_slot || "",
        });
      } else {
        return res.status(400).json(buildPlannerClientErrorResponse({ error: "Unknown debug target" }));
      }

      const payload = await getPlannerBootstrap(auth.uid, {
        reportCursor: parsed?.reportCursor || parsed?.report_cursor || null,
        reportLimit: 10,
        language: parsed?.language || parsed?.locale || "",
      });
      return res.status(200).json(buildPlannerDebugRunClientResponse({ payload, debugRun: result }));
    } catch (error) {
      console.error("[planner-client-actions:planner-debug-run]", error);
      return res.status(500).json(buildPlannerClientErrorResponse({
        error: error.message || "Failed to run planner debug action",
      }));
    }
  }

  if (mode === PLANNER_CLIENT_MODES.RESCUE_INTENT) {
    try {
      const result = await classifyRescueIntent({
        text: parsed?.text || "",
        taskTitle: parsed?.taskTitle || parsed?.task_title || "",
        language: parsed?.language || parsed?.locale || "auto",
      });
      if (!result.ok) {
        return res.status(400).json(buildPlannerClientErrorResponse({
          error: result.error || "Failed to classify rescue intent",
        }));
      }
      return res.status(200).json(withPlannerClientResponseContract({
        ok: true,
        mode: PLANNER_CLIENT_MODES.RESCUE_INTENT,
        rescueIntent: result,
      }));
    } catch (error) {
      console.error("[planner-client-actions:rescue-intent]", error);
      return res.status(500).json(buildPlannerClientErrorResponse({
        error: error.message || "Failed to classify rescue intent",
      }));
    }
  }

  if (mode === PLANNER_CLIENT_MODES.CLARIFY_STEP) {
    try {
      const result = await suggestClarifyStep({
        taskTitle: parsed?.taskTitle || parsed?.task_title || "",
        confusion: parsed?.confusion || parsed?.reason || "",
        language: parsed?.language || parsed?.locale || "auto",
      });
      return res.status(200).json(withPlannerClientResponseContract({
        ok: true,
        mode: PLANNER_CLIENT_MODES.CLARIFY_STEP,
        clarifyStep: result,
      }));
    } catch (error) {
      console.error("[planner-client-actions:clarify-step]", error);
      return res.status(500).json(buildPlannerClientErrorResponse({
        error: error.message || "Failed to suggest a clarification step",
      }));
    }
  }

  const validation = validatePlannerActionRequest(parsed);
  if (!validation.ok) {
    return res.status(400).json(buildPlannerClientErrorResponse({
      error: "Invalid planner action",
      errors: validation.errors,
    }));
  }

  const request = validation.request || {};
  const requestUserId = String(request.userId || "").trim();
  const userId = requestUserId || auth.uid;

  if (requestUserId && requestUserId !== auth.uid) {
    return res.status(403).json(buildPlannerClientErrorResponse({
      error: "Forbidden user scope",
      details: "userId must match authenticated user",
    }));
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
    return res.status(200).json(buildPlannerRouteClientResponse({
      userId,
      route: request.route,
      result,
      includeState,
    }));
  } catch (error) {
    console.error("[planner-client-actions]", error);
    return res.status(500).json(buildPlannerClientErrorResponse({
      error: error.message || "Failed to execute planner action",
    }));
  }
};
