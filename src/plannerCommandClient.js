import { PLANNER_CLIENT_MODES } from "./plannerCommandContract";

export class PlannerClientActionError extends Error {
  constructor(message, payload = {}, responseStatus = 0) {
    super(message);
    this.name = "PlannerClientActionError";
    this.payload = payload;
    this.responseStatus = responseStatus;
  }
}

export async function postPlannerClientAction({ authUser, body = {} }) {
  if (!authUser) {
    throw new Error("Missing authenticated Firebase user");
  }

  const idToken = await authUser.getIdToken();
  if (!idToken) {
    throw new Error("Missing Firebase id token");
  }

  const response = await fetch("/api/planner-client-actions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

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
}) {
  return postPlannerClientAction({
    authUser,
    body: {
      action,
      source,
      payload,
      includeState,
    },
  });
}

export async function runPlannerBootstrap({ authUser, reportLimit = 10, language = "" }) {
  return postPlannerClientAction({
    authUser,
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
