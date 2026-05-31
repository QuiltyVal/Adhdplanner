const { createHash } = require("node:crypto");
const { getDb } = require("./firebase-admin");
const { runPlannerTick } = require("./planner-engine");
const {
  buildOutboxBacklogCounts,
  getOutboxStatusSnapshots,
} = require("./planner-outbox-contract");
const { projectReportItemsFromRecentEvents } = require("./planner-report-projector");

const POST_COMMAND_HOOK_CONTRACT_VERSION = 1;
const POST_COMMAND_HOOK_SHAPE = "planner_post_command_hook_v1";

function stableDocId(value = "") {
  return createHash("sha1").update(String(value || "")).digest("hex");
}

function normalizeIdempotencyKey(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return stableDocId(raw).slice(0, 40);
}

function compactPostCommandHook(postCommand = {}) {
  const status = postCommand.status
    ? String(postCommand.status)
    : postCommand.ok
      ? "ok"
      : "unknown";
  return {
    contractVersion: POST_COMMAND_HOOK_CONTRACT_VERSION,
    responseShape: POST_COMMAND_HOOK_SHAPE,
    ok: Boolean(postCommand.ok),
    status,
    skipped: Boolean(postCommand.skipped),
    trigger: String(postCommand.trigger || "command"),
    ranAt: Number(postCommand.ranAt || Date.now()),
    runId: String(postCommand.runId || ""),
    locked: Boolean(postCommand.locked),
    error: String(postCommand.error || ""),
    reportProjected: Number(postCommand.reportProjection?.projected || 0),
    reportChecked: Number(postCommand.reportProjection?.checked || 0),
    reportProjectionOk: postCommand.reportProjection ? Boolean(postCommand.reportProjection.ok) : null,
    outboxQueued: Number(postCommand.engine?.stats?.outboxQueued || postCommand.engine?.outboxQueued || 0),
    outboxCheckOk: postCommand.outboxCheck ? Boolean(postCommand.outboxCheck.ok) : null,
    outboxPending: Number(postCommand.outboxCheck?.pending || 0),
    outboxRetry: Number(postCommand.outboxCheck?.retry || 0),
    outboxDead: Number(postCommand.outboxCheck?.dead || 0),
    outboxSending: Number(postCommand.outboxCheck?.sending || 0),
    outboxTotal: Number(postCommand.outboxCheck?.total || 0),
  };
}

async function inspectOutboxBacklog({ userId } = {}) {
  if (!userId) {
    return {
      ok: false,
      error: "missing userId",
    };
  }

  const baseUserRef = getDb().collection("Users").doc(String(userId));
  const counts = buildOutboxBacklogCounts(await getOutboxStatusSnapshots(baseUserRef));

  return {
    ok: true,
    ...counts,
  };
}

async function runPostCommandPlannerEngine({
  userId,
  now = Date.now(),
  trigger = "command",
} = {}) {
  if (!userId) {
    return {
      ok: false,
      status: "skipped",
      skipped: true,
      trigger,
      ranAt: now,
      error: "missing userId",
    };
  }

  try {
    const engine = await runPlannerTick({
      userId,
      now,
      trigger,
      allowScheduledNudge: false,
    });
    let reportProjection = null;
    try {
      reportProjection = await projectReportItemsFromRecentEvents({
        userId,
        now,
        limit: 40,
      });
    } catch (error) {
      console.warn("[planner-post-command-hook] report projection failed:", error);
      reportProjection = {
        ok: false,
        error: error?.message || "report projection failed",
      };
    }
    let outboxCheck = null;
    try {
      outboxCheck = await inspectOutboxBacklog({ userId });
    } catch (error) {
      console.warn("[planner-post-command-hook] outbox check failed:", error);
      outboxCheck = {
        ok: false,
        error: error?.message || "outbox check failed",
      };
    }
    return {
      ok: true,
      status: engine?.locked ? "locked" : "ok",
      skipped: false,
      trigger,
      ranAt: now,
      engine,
      reportProjection,
      outboxCheck,
      locked: Boolean(engine?.locked),
      runId: engine?.runId || engine?.run_id || "",
    };
  } catch (error) {
    console.warn("[planner-post-command-hook] engine tick failed:", error);
    return {
      ok: false,
      status: "failed",
      skipped: false,
      trigger,
      ranAt: now,
      error: error?.message || "post-command engine tick failed",
    };
  }
}

async function writePostCommandStatus({
  userId,
  command = {},
  postCommand = {},
} = {}) {
  const commandKey = normalizeIdempotencyKey(command.idempotencyKey || "");
  if (!userId || !commandKey) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_user_or_command_key",
    };
  }

  const compact = compactPostCommandHook(postCommand);
  await getDb()
    .collection("Users")
    .doc(String(userId))
    .collection("plannerCommands")
    .doc(commandKey)
    .set({
      postCommand: compact,
      post_command: compact,
      postCommandUpdatedAt: Date.now(),
    }, { merge: true });

  return {
    ok: true,
    postCommand: compact,
  };
}

async function runAndWritePostCommandStatus({
  userId,
  command = {},
  now = Date.now(),
  trigger = "command",
  logPrefix = "planner-post-command-hook",
} = {}) {
  let postCommand = null;
  let postCommandWrite = null;
  try {
    postCommand = await runPostCommandPlannerEngine({
      userId,
      now,
      trigger,
    });
    postCommandWrite = await writePostCommandStatus({
      userId,
      command,
      postCommand,
    });
  } catch (error) {
    console.warn(`[${logPrefix}] post-command status write failed:`, error);
    postCommandWrite = {
      ok: false,
      skipped: false,
      error: error?.message || "post-command status write failed",
    };
    if (!postCommand) {
      postCommand = {
        ok: false,
        status: "failed",
        skipped: false,
        trigger,
        ranAt: now,
        error: error?.message || "post-command hook failed",
      };
    }
  }

  return {
    postCommand,
    postCommandWrite,
  };
}

module.exports = {
  POST_COMMAND_HOOK_CONTRACT_VERSION,
  POST_COMMAND_HOOK_SHAPE,
  compactPostCommandHook,
  inspectOutboxBacklog,
  runAndWritePostCommandStatus,
  runPostCommandPlannerEngine,
  writePostCommandStatus,
};
