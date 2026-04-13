// GET  /api/snapshot-read?limit=10          — list recent snapshots (no tasks array)
// GET  /api/snapshot-read?id=<docId>         — get one snapshot with full tasks
// POST /api/snapshot-read  body: { snapshotId } — restore tasks from snapshot

const { getDb, admin } = require("./_lib/firebase-admin");
const { mutatePlanner } = require("./_lib/planner-store");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  const legacySecret = process.env.TELEGRAM_CRON_SECRET;
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const bearerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  const headerSecret = req.headers["x-telegram-cron-secret"];
  const querySecret = req.query?.secret;

  if (cronSecret && bearerToken === cronSecret) return true;
  if (
    legacySecret &&
    (headerSecret === legacySecret ||
      querySecret === legacySecret ||
      bearerToken === legacySecret)
  )
    return true;
  if (!cronSecret && !legacySecret) return true;
  return false;
}

module.exports = async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = req.query.userId || DEFAULT_USER_ID;
  if (!userId) {
    return res.status(400).json({ error: "userId required" });
  }

  const db = getDb();
  const snapshotsRef = db
    .collection("Users")
    .doc(userId)
    .collection("taskSnapshots");

  // ── GET: single snapshot by id ───────────────────────────────────────────
  if (req.method === "GET" && req.query.id) {
    try {
      const doc = await snapshotsRef.doc(req.query.id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: "Snapshot not found" });
      }
      return res.status(200).json({ ok: true, snapshot: { id: doc.id, ...doc.data() } });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET: list recent snapshots (without task arrays to keep response small) ─
  if (req.method === "GET") {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);
      const snap = await snapshotsRef.orderBy("capturedAt", "desc").limit(limit).get();
      const snapshots = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          capturedAt: d.capturedAt,
          taskCount: d.taskCount,
          score: d.score,
          source: d.source,
          reason: d.reason,
          fingerprint: d.fingerprint,
        };
      });
      return res.status(200).json({ ok: true, count: snapshots.length, snapshots });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: restore from snapshot id ──────────────────────────────────────
  if (req.method === "POST") {
    const { snapshotId } = req.body || {};
    if (!snapshotId) {
      return res.status(400).json({ error: "snapshotId required in body" });
    }

    try {
      const doc = await snapshotsRef.doc(snapshotId).get();
      if (!doc.exists) {
        return res.status(404).json({ error: "Snapshot not found" });
      }
      const snapshotData = doc.data();
      if (!Array.isArray(snapshotData.tasks)) {
        return res.status(400).json({ error: "Snapshot has no tasks array" });
      }

      // mutatePlanner creates a snapshot of current state before writing,
      // so this restore is itself reversible.
      const next = await mutatePlanner(
        userId,
        (current) => ({
          ...current,
          tasks: snapshotData.tasks,
          score: typeof snapshotData.score === "number" ? snapshotData.score : current.score,
        }),
        { source: "snapshot-restore", reason: `restore_from_${snapshotId}` }
      );

      return res.status(200).json({
        ok: true,
        message: `Restored ${snapshotData.tasks.length} tasks from snapshot ${snapshotId}`,
        taskCount: next.tasks.length,
        restoredFrom: {
          id: snapshotId,
          capturedAt: snapshotData.capturedAt,
          source: snapshotData.source,
          reason: snapshotData.reason,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
