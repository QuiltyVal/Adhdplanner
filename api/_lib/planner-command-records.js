const { admin } = require("./firebase-admin");

function reusePlannerCommand(transaction, commandRef, commandSnap, now = Date.now()) {
  if (transaction && commandRef) {
    transaction.set(commandRef, {
      lastReusedAt: now,
      reuseCount: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
  }
  return {
    ...(commandSnap.data()?.result || {}),
    reused: true,
  };
}

function buildPlannerCommandRecord({
  id = "",
  commandType = "",
  source = "command_service",
  actor = {},
  outcome = "updated",
  result = {},
  now = Date.now(),
  extra = {},
} = {}) {
  return {
    id,
    commandType,
    source,
    actor_type: String(actor?.type || "user"),
    actor_ref: String(actor?.ref || source || "unknown"),
    outcome,
    result,
    ...extra,
    createdAt: now,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function writePlannerCommandRecord(transaction, commandRef, record = {}, options) {
  if (!transaction || !commandRef) return null;
  if (options) {
    transaction.set(commandRef, record, options);
  } else {
    transaction.set(commandRef, record);
  }
  return record;
}

module.exports = {
  buildPlannerCommandRecord,
  reusePlannerCommand,
  writePlannerCommandRecord,
};
