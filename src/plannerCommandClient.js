import { PLANNER_CLIENT_MODES } from "./plannerCommandContract.js";

export const DEFAULT_PLANNER_BOOTSTRAP_TIMEOUT_MS = 15000;

export class PlannerClientActionError extends Error {
  constructor(message, payload = {}, responseStatus = 0) {
    super(message);
    this.name = "PlannerClientActionError";
    this.payload = payload;
    this.responseStatus = responseStatus;
  }
}

export function normalizePlannerClientTimeoutMs(value = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function createAbortErrorMessage(label = "Planner command", timeoutMs = 0) {
  return `${label} timed out after ${timeoutMs}ms`;
}

export async function postPlannerClientAction({
  authUser,
  body = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = 0,
  timeoutLabel = "Planner command",
}) {
  if (!authUser) {
    throw new Error("Missing authenticated Firebase user");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available");
  }

  const idToken = await authUser.getIdToken();
  if (!idToken) {
    throw new Error("Missing Firebase id token");
  }

  const safeTimeoutMs = normalizePlannerClientTimeoutMs(timeoutMs);
  const controller = safeTimeoutMs > 0 && typeof AbortController !== "undefined"
    ? new AbortController()
    : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), safeTimeoutMs)
    : null;
  let response;

  try {
    response = await fetchImpl("/api/planner-client-actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const message = createAbortErrorMessage(timeoutLabel, safeTimeoutMs);
      throw new PlannerClientActionError(message, {
        ok: false,
        error: message,
        timeoutMs: safeTimeoutMs,
      }, 0);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    throw new PlannerClientActionError(
      payload?.error || payload?.errors?.[0]?.message || "Planner command failed",
      payload,
      response.status,
    );
  }

  return payload;
}

export async function runPlannerClientCommand({
  authUser,
  action,
  payload = {},
  source = "web",
  includeState = true,
  fetchImpl = globalThis.fetch,
}) {
  return postPlannerClientAction({
    authUser,
    fetchImpl,
    body: {
      action,
      source,
      payload,
      includeState,
    },
  });
}

export async function runPlannerBootstrap({
  authUser,
  reportLimit = 10,
  language = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_PLANNER_BOOTSTRAP_TIMEOUT_MS,
}) {
  return postPlannerClientAction({
    authUser,
    fetchImpl,
    timeoutMs,
    timeoutLabel: "Planner bootstrap",
    body: {
      mode: PLANNER_CLIENT_MODES.BOOTSTRAP,
      reportLimit,
      language,
    },
  });
}

export async function runPlannerDebug({ authUser, target, reportLimit = 10 }) {
  return postPlannerClientAction({
    authUser,
    body: {
      mode: PLANNER_CLIENT_MODES.DEBUG_RUN,
      target,
      reportLimit,
    },
  });
}

export async function ackPlannerReportItems({ authUser, reportItemIds = [], reportLimit = 10, ackAllUnread = false }) {
  return postPlannerClientAction({
    authUser,
    body: {
      mode: PLANNER_CLIENT_MODES.REPORT_ACK,
      reportItemIds,
      reportLimit,
      ackAllUnread,
    },
  });
}
