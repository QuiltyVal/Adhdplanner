const { getDb, admin } = require("./firebase-admin");

const DAY_MS = 24 * 60 * 60 * 1000;

function commitmentsCol(userId) {
  return getDb().collection("Users").doc(userId).collection("commitments");
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function clampConfidence(value, fallback = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function normalizeStringList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  )];
}

function inferPressureStyle(failureCost = "medium") {
  if (failureCost === "catastrophic") return "emergency";
  if (failureCost === "high") return "boss";
  return "soft";
}

function inferReviewDays(failureCost = "medium") {
  if (failureCost === "catastrophic") return 1;
  if (failureCost === "high") return 3;
  if (failureCost === "medium") return 7;
  return 14;
}

function inferNeedsTaskIfSilentDays(failureCost = "medium") {
  if (failureCost === "catastrophic") return 1;
  if (failureCost === "high") return 5;
  if (failureCost === "medium") return 10;
  return 14;
}

function normalizeCommitmentInput(commitment = {}, fallbackCaptureId = null) {
  const id = normalizeText(commitment.tempKey || commitment.id);
  if (!id) return null;

  const failureCost = normalizeText(commitment.failureCost || "medium").toLowerCase() || "medium";

  return {
    id,
    title: normalizeText(commitment.title || id),
    kind: normalizeText(commitment.kind || "unknown").toLowerCase() || "unknown",
    whyMatters: normalizeText(commitment.whyMatters || ""),
    failureCost,
    confidence: clampConfidence(commitment.confidence, 0),
    sourceCaptureId: normalizeText(commitment.sourceCaptureId || fallbackCaptureId),
    keywordsMatched: normalizeStringList(commitment.keywordsMatched),
  };
}

async function upsertCommitmentsFromExtraction(userId, extraction = {}, options = {}) {
  const now = Date.now();
  const incomingCommitments = normalizeStringList((extraction.commitments || []).map((commitment) => {
    const normalized = normalizeCommitmentInput(commitment, options.captureId || null);
    return normalized ? JSON.stringify(normalized) : "";
  })).map((serialized) => JSON.parse(serialized));

  if (!incomingCommitments.length) return [];

  const results = [];
  const db = getDb();

  await db.runTransaction(async (transaction) => {
    for (const incoming of incomingCommitments) {
      const ref = commitmentsCol(userId).doc(incoming.id);
      const snap = await transaction.get(ref);
      const existing = snap.exists ? (snap.data() || {}) : {};

      const failureCost = incoming.failureCost || existing.failureCost || "medium";
      const mergedSourceCaptureIds = normalizeStringList([
        ...(Array.isArray(existing.sourceCaptureIds) ? existing.sourceCaptureIds : []),
        incoming.sourceCaptureId,
        options.captureId,
      ]).slice(-20);

      const mergedKeywordsMatched = normalizeStringList([
        ...(Array.isArray(existing.keywordsMatched) ? existing.keywordsMatched : []),
        ...incoming.keywordsMatched,
      ]).slice(0, 30);

      const nextReviewAt =
        typeof existing.nextReviewAt === "number" && existing.nextReviewAt > now
          ? existing.nextReviewAt
          : now + inferReviewDays(failureCost) * DAY_MS;

      const totalMentionCount = (typeof existing.totalMentionCount === "number" ? existing.totalMentionCount : 0) + 1;
      const mentionCount30d = (typeof existing.mentionCount30d === "number" ? existing.mentionCount30d : 0) + 1;

      const merged = {
        id: incoming.id,
        title: incoming.title || existing.title || incoming.id,
        kind: incoming.kind || existing.kind || "unknown",
        whyMatters: incoming.whyMatters || existing.whyMatters || "",
        failureCost,
        pressureStyle: existing.pressureStyle || inferPressureStyle(failureCost),
        state: existing.state || "active",
        confidence: Math.max(
          clampConfidence(existing.confidence, 0),
          clampConfidence(incoming.confidence, 0),
        ),
        mentionCount30d,
        totalMentionCount,
        lastMentionedAt: now,
        lastTouchedAt: typeof existing.lastTouchedAt === "number" ? existing.lastTouchedAt : 0,
        nextReviewAt,
        needsTaskIfSilentDays:
          typeof existing.needsTaskIfSilentDays === "number"
            ? existing.needsTaskIfSilentDays
            : inferNeedsTaskIfSilentDays(failureCost),
        sourceCaptureIds: mergedSourceCaptureIds,
        keywordsMatched: mergedKeywordsMatched,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (!existing.createdAt) {
        merged.createdAt = admin.firestore.FieldValue.serverTimestamp();
      }

      transaction.set(ref, merged, { merge: true });
      results.push({
        ...merged,
        updatedAt: now,
        createdAt: existing.createdAt || now,
      });
    }
  });

  return results;
}

module.exports = {
  upsertCommitmentsFromExtraction,
};
