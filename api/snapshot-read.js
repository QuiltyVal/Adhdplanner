// GET  /api/snapshot-read?limit=10          — list recent snapshots (no tasks array)
// GET  /api/snapshot-read?id=<docId>         — get one snapshot with full tasks
// POST /api/snapshot-read  body: { snapshotId } — restore tasks from snapshot

const { getDb } = require("./_lib/firebase-admin");
const {
  buildPlannerClientErrorResponse,
  withPlannerClientResponseContract,
} = require("./_lib/planner-client-response-contract");
const { buildRestoreSnapshotCommand } = require("./_lib/planner-command-builders");
const { executePlannerActionCommand } = require("./_lib/planner-command-runner");
const { getPlannerBootstrap } = require("./_lib/planner-engine");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;
const SNAPSHOT_RESTORE_IDEMPOTENCY_WINDOW_MS = 4000;

function getShortIdempotencyBucket(now = Date.now(), windowMs = SNAPSHOT_RESTORE_IDEMPOTENCY_WINDOW_MS) {
  return Math.floor(Number(now || Date.now()) / windowMs);
}

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
    return res.status(401).json(buildPlannerClientErrorResponse({ error: "Unauthorized" }));
  }

  const userId = req.query.userId || DEFAULT_USER_ID;
  if (!userId) {
    return res.status(400).json(buildPlannerClientErrorResponse({ error: "userId required" }));
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
        return res.status(404).json(buildPlannerClientErrorResponse({ error: "Snapshot not found" }));
      }
      return res.status(200).json({ ok: true, snapshot: { id: doc.id, ...doc.data() } });
    } catch (err) {
      return res.status(500).json(buildPlannerClientErrorResponse({ error: err.message }));
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
      return res.status(500).json(buildPlannerClientErrorResponse({ error: err.message }));
    }
  }

  // ── POST: restore from snapshot id ──────────────────────────────────────
  if (req.method === "POST") {
    const { snapshotId, idempotencyKey: explicitIdempotencyKey } = req.body || {};
    if (!snapshotId) {
      return res.status(400).json(buildPlannerClientErrorResponse({ error: "snapshotId required in body" }));
    }

    try {
      const idempotencyKey = explicitIdempotencyKey
        ? String(explicitIdempotencyKey)
        : `snapshot_read_restore_${snapshotId}_${getShortIdempotencyBucket()}`;
      const route = {
        type: "RESTORE_SNAPSHOT",
        source: "snapshot-read-api",
        snapshotId,
        idempotencyKey,
      };
      const result = await executePlannerActionCommand({
        userId,
        command: buildRestoreSnapshotCommand(route),
        route,
        actorType: "system",
      });

      if (!result?.ok) {
        return res.status(404).json(buildPlannerClientErrorResponse({
          error: result?.message || "Snapshot restore failed",
        }));
      }

      const bootstrap = await getPlannerBootstrap(userId, { reportLimit: 10 });
      return res.status(200).json(withPlannerClientResponseContract({
        ...bootstrap,
        ok: true,
        message: `Restored ${result.restoredCount || 0} tasks from snapshot ${snapshotId}`,
        taskCount: result.restoredCount || 0,
        restoredFrom: {
          id: snapshotId,
        },
        commandResult: result,
      }));
    } catch (err) {
      return res.status(500).json(buildPlannerClientErrorResponse({
        error: err.message,
      }));
    }
  }

  return res.status(405).json(buildPlannerClientErrorResponse({ error: "Method not allowed" }));
};
