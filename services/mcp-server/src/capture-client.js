export const DEFAULT_CAPTURE_API_URL = "https://planner.valquilty.com/api/captures";
export const DEFAULT_CAPTURE_API_TIMEOUT_MS = 15000;

export function normalizeCaptureToolSource(value) {
  const suffix = String(value || "tool")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 40) || "tool";
  return `mcp:${suffix}`;
}

export function normalizeCaptureTaskSnapshot(task) {
  return {
    id: String(task?.id || "").trim(),
    text: String(task?.text || "").trim(),
    status: String(task?.status || "active").trim() || "active",
    subtasks: Array.isArray(task?.subtasks)
      ? task.subtasks
        .map(subtask => ({
          id: String(subtask?.id || "").trim(),
          text: String(subtask?.text || "").trim(),
          completed: Boolean(subtask?.completed),
        }))
        .filter(subtask => subtask.text)
        .slice(0, 50)
      : [],
    isToday: Boolean(task?.is_today ?? task?.isToday),
    isVital: Boolean(task?.is_vital ?? task?.isVital),
    urgency: String(task?.urgency || "").trim(),
    resistance: String(task?.resistance || "").trim(),
    deadlineAt: task?.deadline_at ?? task?.deadlineAt ?? task?.deadline ?? null,
  };
}

export function normalizeCaptureTaskSnapshots(activeTasks) {
  return Array.isArray(activeTasks)
    ? activeTasks.map(normalizeCaptureTaskSnapshot).filter(task => task.id && task.text).slice(0, 300)
    : [];
}

export function resolveCaptureTimeoutMs(value, fallback = DEFAULT_CAPTURE_API_TIMEOUT_MS) {
  const timeoutMs = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : fallback;
}

export function buildPlannerCaptureRequest({
  text,
  dryRun = true,
  includeLiveTasks = false,
  activeTasks = [],
  idempotencyKey = "",
  sourceLabel = "tool",
  selfTest = null,
}) {
  const cleanText = String(text || "").trim();
  if (!cleanText) {
    throw new Error("Capture text is required.");
  }

  const cleanDryRun = dryRun !== false;
  const cleanIdempotencyKey = String(idempotencyKey || "").trim();
  if (!cleanDryRun && !cleanIdempotencyKey) {
    throw new Error("idempotency_key is required when dry_run=false.");
  }

  const source = normalizeCaptureToolSource(sourceLabel);
  const normalizedActiveTasks = normalizeCaptureTaskSnapshots(activeTasks);
  const body = {
    text: cleanText,
    source,
    dryRun: cleanDryRun,
    includeLiveTasks: includeLiveTasks === true,
  };

  if (cleanIdempotencyKey) {
    body.idempotencyKey = cleanIdempotencyKey;
  }

  if (normalizedActiveTasks.length > 0) {
    body.activeTasks = normalizedActiveTasks;
  }

  if (selfTest && typeof selfTest === "object") {
    body.selfTest = selfTest;
  }

  return {
    body,
    source,
    idempotencyKeyPresent: Boolean(cleanIdempotencyKey),
    activeTasksCount: normalizedActiveTasks.length,
  };
}

export async function postPlannerCapture({
  captureApiUrl = DEFAULT_CAPTURE_API_URL,
  timeoutMs = DEFAULT_CAPTURE_API_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  abortControllerFactory = () => new AbortController(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  ...requestInput
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is not available in this Node.js runtime.");
  }

  const captureUrl = captureApiUrl instanceof URL ? captureApiUrl : new URL(String(captureApiUrl));
  const request = buildPlannerCaptureRequest(requestInput);
  const controller = abortControllerFactory();
  const timeout = setTimeoutFn(
    () => controller.abort(),
    resolveCaptureTimeoutMs(timeoutMs),
  );

  try {
    const response = await fetchImpl(captureUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let payload;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = { raw: responseText };
    }

    if (!response.ok) {
      throw new Error(`Capture API returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
    }

    return {
      ok: true,
      captureApi: {
        status: response.status,
        url: captureUrl.href,
      },
      request: {
        dryRun: request.body.dryRun,
        includeLiveTasks: request.body.includeLiveTasks,
        source: request.source,
        idempotencyKeyPresent: request.idempotencyKeyPresent,
        activeTasksCount: request.activeTasksCount,
      },
      response: payload,
    };
  } finally {
    clearTimeoutFn(timeout);
  }
}
