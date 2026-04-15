const { failCaptureProcessing, processCapture } = require("./capture-extractor");
const { writeCapture } = require("./planner-store");

function normalizeTaskText(text = "") {
  return String(text).trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCommitmentIds(value = []) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  )].slice(0, 10);
}

function pickCaptureCandidateTask(processing, taskText = "") {
  const candidates = Array.isArray(processing?.extraction?.candidateTasks)
    ? processing.extraction.candidateTasks
    : [];
  if (!candidates.length) return null;

  const normalizedTaskText = normalizeTaskText(taskText);
  if (normalizedTaskText) {
    const exact = candidates.find((candidate) => normalizeTaskText(candidate.text) === normalizedTaskText);
    if (exact) return exact;
  }

  return candidates[0] || null;
}

function buildTaskMemoryEnrichment(processing, taskText = "") {
  const candidate = pickCaptureCandidateTask(processing, taskText);
  const commitments = Array.isArray(processing?.commitments) ? processing.commitments : [];
  const knownCommitmentIds = new Set(commitments.map((commitment) => String(commitment.id || "").trim()).filter(Boolean));

  const commitmentIds = normalizeCommitmentIds(
    Array.isArray(candidate?.commitmentTempKeys) && candidate.commitmentTempKeys.length
      ? candidate.commitmentTempKeys.filter((id) => knownCommitmentIds.has(String(id || "").trim()))
      : commitments.map((commitment) => commitment.id),
  );

  return {
    urgency: candidate?.urgency || "",
    resistance: candidate?.resistance || "",
    lifeArea: candidate?.lifeArea || "",
    commitmentIds,
  };
}

function mergeCommitmentIds(existingIds = [], incomingIds = []) {
  return normalizeCommitmentIds([...(existingIds || []), ...(incomingIds || [])]);
}

function mergeTelegramTaskMemoryIntoRoute(route = {}, processing = null) {
  const enrichment = buildTaskMemoryEnrichment(processing, route.taskText || route.rawText || "");
  const explicitUrgency = String(route?.rawIntent?.urgency || "").trim();

  return {
    ...route,
    urgency: explicitUrgency
      ? (route.urgency || explicitUrgency || "medium")
      : (enrichment.urgency || route.urgency || "medium"),
    resistance: enrichment.resistance || route.resistance || "",
    lifeArea: route.lifeArea || enrichment.lifeArea || "",
    commitmentIds: mergeCommitmentIds(route.commitmentIds || [], enrichment.commitmentIds || []),
  };
}

async function processTelegramTaskCapture({
  userId,
  chatId,
  rawText,
  intent,
  taskText = "",
  taskRef = "",
  urgency = "",
  isToday = false,
  isVital = false,
  deadlineAt = "",
  subtasks = [],
  telegramMessageId = null,
  telegramUpdateId = null,
  writeLog = async () => {},
}) {
  let capture = null;

  try {
    const safeMessageId = telegramMessageId ? String(telegramMessageId) : "";
    const safeUpdateId = telegramUpdateId ? String(telegramUpdateId) : "";
    const idempotencyKey =
      safeUpdateId
        ? `telegram_update_${safeUpdateId}`
        : safeMessageId
          ? `telegram_message_${chatId}_${safeMessageId}`
          : "";

    capture = await writeCapture(userId, {
      idempotencyKey,
      source: "telegram",
      kind: "text_dump",
      rawText: rawText,
      status: "new",
      meta: {
        chatId: String(chatId),
        via: "telegram-webhook",
        intake: "plain_text",
        intent,
        telegramMessageId: safeMessageId,
        telegramUpdateId: safeUpdateId,
        taskText: taskText || "",
        taskRef: taskRef || "",
        urgency: urgency || "",
        isToday: Boolean(isToday),
        isVital: Boolean(isVital),
        deadlineAt: deadlineAt || "",
        subtasks: Array.isArray(subtasks) ? subtasks : [],
      },
    });

    const processing = await processCapture(userId, capture);
    const extraction = processing?.extraction || { commitments: [], candidateTasks: [], facts: [] };
    const commitments = Array.isArray(processing?.commitments) ? processing.commitments : [];

    await writeLog({
      kind: "action",
      action: processing?.replayed || capture?.__reused ? "capture_reused" : "capture_created",
      chatId: String(chatId),
      captureId: capture.id,
      captureSource: "telegram",
      captureKind: "text_dump",
      intent,
      extractedCommitmentCount: Array.isArray(extraction?.commitments) ? extraction.commitments.length : 0,
      extractedCandidateTaskCount: Array.isArray(extraction?.candidateTasks) ? extraction.candidateTasks.length : 0,
      extractedFactCount: Array.isArray(extraction?.facts) ? extraction.facts.length : 0,
      upsertedCommitmentCount: commitments.length,
      commitmentIds: commitments.map((commitment) => commitment.id).slice(0, 10),
    });

    return processing;
  } catch (captureError) {
    console.error("[telegram-capture]", captureError);
    if (capture?.id) {
      await failCaptureProcessing(userId, capture.id, captureError);
    }
    await writeLog({
      kind: "error",
      chatId: String(chatId),
      action: "capture_create_failed",
      errorMessage: captureError.message || "capture create failed",
    });
    return null;
  }
}

module.exports = {
  buildTaskMemoryEnrichment,
  mergeTelegramTaskMemoryIntoRoute,
  processTelegramTaskCapture,
};
