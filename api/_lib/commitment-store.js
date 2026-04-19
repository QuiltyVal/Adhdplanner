const { getDb, admin } = require("./firebase-admin");

const DAY_MS = 24 * 60 * 60 * 1000;
const IMPORTANT_FAILURE_COSTS = new Set(["high", "catastrophic"]);

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

function toMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === "function") {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : 0;
  }
  if (value && typeof value.seconds === "number") {
    return Number(value.seconds) * 1000;
  }
  return 0;
}

function getFailureCostRank(failureCost = "medium") {
  if (failureCost === "catastrophic") return 4;
  if (failureCost === "high") return 3;
  if (failureCost === "medium") return 2;
  return 1;
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

async function getCommitmentsByIds(userId, ids = []) {
  const uniqueIds = normalizeStringList(ids);
  if (!uniqueIds.length) return [];

  const snapshots = await Promise.all(
    uniqueIds.map((id) => commitmentsCol(userId).doc(id).get()),
  );

  return snapshots
    .filter((snap) => snap.exists)
    .map((snap) => snap.data() || {});
}

async function upsertCommitmentsFromExtraction(userId, extraction = {}, options = {}) {
  const now = Date.now();
  const dedupeCaptureId = normalizeText(options.captureId || "");
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
      const existingSourceCaptureIds = Array.isArray(existing.sourceCaptureIds) ? existing.sourceCaptureIds : [];
      const alreadySeenCapture = Boolean(dedupeCaptureId) && existingSourceCaptureIds.includes(dedupeCaptureId);

      const failureCost = incoming.failureCost || existing.failureCost || "medium";
      const mergedSourceCaptureIds = normalizeStringList([
        ...existingSourceCaptureIds,
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

      const totalMentionCount = alreadySeenCapture
        ? (typeof existing.totalMentionCount === "number" ? existing.totalMentionCount : 0)
        : (typeof existing.totalMentionCount === "number" ? existing.totalMentionCount : 0) + 1;
      const mentionCount30d = alreadySeenCapture
        ? (typeof existing.mentionCount30d === "number" ? existing.mentionCount30d : 0)
        : (typeof existing.mentionCount30d === "number" ? existing.mentionCount30d : 0) + 1;

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
        lastMentionedAt: alreadySeenCapture
          ? (typeof existing.lastMentionedAt === "number" ? existing.lastMentionedAt : now)
          : now,
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

function collectActiveCommitmentIds(tasks = []) {
  const linked = new Set();

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task || task.status !== "active") continue;
    for (const id of normalizeStringList(task.commitmentIds)) {
      linked.add(id);
    }
  }

  return linked;
}

async function getCommitmentsNeedingLiveTask(userId, activeTasks = [], options = {}) {
  const now = toMillis(options.now) || Date.now();
  const maxCount =
    Number.isInteger(options.maxCount) && options.maxCount > 0
      ? options.maxCount
      : 2;
  const linkedCommitmentIds = collectActiveCommitmentIds(activeTasks);

  const snapshot = await commitmentsCol(userId)
    .where("state", "==", "active")
    .get();

  const candidates = [];
  snapshot.forEach((doc) => {
    const commitment = doc.data() || {};
    const id = normalizeText(commitment.id || doc.id);
    if (!id || linkedCommitmentIds.has(id)) return;

    const failureCost = normalizeText(commitment.failureCost || "medium").toLowerCase() || "medium";
    if (!IMPORTANT_FAILURE_COSTS.has(failureCost)) return;

    const needsTaskIfSilentDays =
      typeof commitment.needsTaskIfSilentDays === "number" && commitment.needsTaskIfSilentDays > 0
        ? commitment.needsTaskIfSilentDays
        : inferNeedsTaskIfSilentDays(failureCost);

    const lastSignalAt = Math.max(
      toMillis(commitment.lastTouchedAt),
      toMillis(commitment.lastMentionedAt),
      toMillis(commitment.updatedAt),
      toMillis(commitment.createdAt),
    ) || now;

    const silentForDays = Math.floor(Math.max(0, now - lastSignalAt) / DAY_MS);
    if (silentForDays < needsTaskIfSilentDays) return;

    candidates.push({
      id,
      title: normalizeText(commitment.title || id),
      kind: normalizeText(commitment.kind || "unknown").toLowerCase() || "unknown",
      failureCost,
      needsTaskIfSilentDays,
      silentForDays,
      overdueDays: silentForDays - needsTaskIfSilentDays,
      lastSignalAt,
    });
  });

  return candidates
    .sort((left, right) => {
      const byFailureCost = getFailureCostRank(right.failureCost) - getFailureCostRank(left.failureCost);
      if (byFailureCost !== 0) return byFailureCost;

      const byOverdue = right.overdueDays - left.overdueDays;
      if (byOverdue !== 0) return byOverdue;

      return left.lastSignalAt - right.lastSignalAt;
    })
    .slice(0, maxCount);
}

module.exports = {
  getCommitmentsNeedingLiveTask,
  getCommitmentsByIds,
  upsertCommitmentsFromExtraction,
};
