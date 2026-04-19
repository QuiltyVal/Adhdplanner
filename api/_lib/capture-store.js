const { writeCapture } = require("./planner-store");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

async function appendCapture({
  userId,
  text,
  source = "web_capture",
  transcript = "",
  idempotencyKey = "",
  selfTest = null,
  origin = { channel: "web" },
} = {}) {
  const uid = normalizeString(userId);
  const rawText = normalizeString(text);
  const safeTranscript = normalizeString(transcript);
  const safeSource = normalizeString(source) || "web_capture";
  const safeIdempotencyKey = normalizeString(idempotencyKey);
  const safeOrigin = normalizeObject(origin);
  const safeSelfTest =
    selfTest && typeof selfTest === "object" && !Array.isArray(selfTest)
      ? {
        overloadBefore: Number(selfTest.overloadBefore),
        overloadAfter: Number(selfTest.overloadAfter),
      }
      : null;

  if (!uid) {
    throw new Error("userId is required");
  }
  if (!rawText && !safeTranscript) {
    throw new Error("text is required");
  }

  const capture = await writeCapture(uid, {
    source: safeSource,
    kind: "text_dump",
    rawText,
    transcript: safeTranscript,
    status: "new",
    idempotencyKey: safeIdempotencyKey,
    meta: {
      channel: "web",
      ...safeOrigin,
      ...(safeSelfTest ? { selfTest: safeSelfTest } : {}),
    },
  });

  return {
    captureId: String(capture?.id || ""),
    capture,
  };
}

module.exports = {
  appendCapture,
};
