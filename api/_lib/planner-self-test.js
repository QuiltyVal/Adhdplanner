const { createHash, randomUUID } = require("node:crypto");
const { PLANNER_ACTIONS } = require("./planner-action-types");
const { getPlannerBootstrap } = require("./planner-engine");
const { runPlannerRouteForUser } = require("./planner-actions-runtime");

const SELF_TEST_CONTRACT_VERSION = 1;

function buildSelfTestUserId(userId = "") {
  const digest = createHash("sha256")
    .update(String(userId || "anonymous"))
    .digest("hex")
    .slice(0, 24);
  return `planner_self_test_${digest}`;
}

function findTask(tasks = [], taskId = "", title = "") {
  const taskIdText = String(taskId || "");
  const titleText = String(title || "");
  return (Array.isArray(tasks) ? tasks : []).find((task) => {
    if (taskIdText && String(task?.id || "") === taskIdText) return true;
    return titleText && String(task?.text || "") === titleText;
  }) || null;
}

async function readTask(userId, taskId, title) {
  const bootstrap = await getPlannerBootstrap(userId, { reportLimit: 1 });
  return {
    bootstrap,
    task: findTask(bootstrap.tasks, taskId, title),
  };
}

function buildRoute(runId, stepName, route) {
  return {
    ...route,
    source: "self_test",
    idempotencyKey: `${runId}:${stepName}`,
  };
}

function buildStepResult({ name, ok, expected = "", actual = "", taskId = "", error = "" }) {
  return {
    name,
    ok: Boolean(ok),
    expected,
    actual,
    taskId,
    ...(error ? { error: String(error) } : {}),
  };
}

async function runSelfTestRoute({ userId, runId, stepName, route }) {
  return runPlannerRouteForUser({
    userId,
    chatId: "planner_self_test",
    route: buildRoute(runId, stepName, route),
    includeState: true,
    includeNonActive: true,
  });
}

async function runPlannerSelfTest({ userId, now = Date.now() } = {}) {
  const realUserId = String(userId || "").trim();
  if (!realUserId) throw new Error("runPlannerSelfTest requires userId");

  const selfTestUserId = buildSelfTestUserId(realUserId);
  const runId = `self_test_${now}_${randomUUID().slice(0, 8)}`;
  const title = `__SELF_TEST__ status loop ${runId}`;
  const startedAt = now;
  const steps = [];
  let taskId = "";
  let cleanupNeeded = false;

  async function recordStatusStep(name, expectedStatus) {
    const { task } = await readTask(selfTestUserId, taskId, title);
    const actualStatus = task ? String(task.status || "active") : "missing";
    const ok = expectedStatus === "missing" ? !task : actualStatus === expectedStatus;
    steps.push(buildStepResult({
      name,
      ok,
      expected: expectedStatus,
      actual: actualStatus,
      taskId,
    }));
    return task;
  }

  try {
    await runSelfTestRoute({
      userId: selfTestUserId,
      runId,
      stepName: "create",
      route: {
        type: PLANNER_ACTIONS.ADD_TASK,
        rawText: title,
        taskText: title,
        urgency: "medium",
        resistance: "medium",
        isToday: false,
        isVital: false,
      },
    });

    const created = await recordStatusStep("create_active_task", "active");
    if (!created?.id) throw new Error("self-test task was not created");
    taskId = String(created.id);
    cleanupNeeded = true;

    await runSelfTestRoute({
      userId: selfTestUserId,
      runId,
      stepName: "complete",
      route: {
        type: PLANNER_ACTIONS.COMPLETE_TASK,
        taskRef: taskId,
        taskText: taskId,
      },
    });
    await recordStatusStep("active_to_heaven", "completed");

    await runSelfTestRoute({
      userId: selfTestUserId,
      runId,
      stepName: "move_to_cemetery",
      route: {
        type: PLANNER_ACTIONS.KILL_TASK,
        taskRef: taskId,
        taskText: taskId,
      },
    });
    await recordStatusStep("heaven_to_cemetery", "dead");

    await runSelfTestRoute({
      userId: selfTestUserId,
      runId,
      stepName: "reopen",
      route: {
        type: PLANNER_ACTIONS.REOPEN_TASK,
        taskRef: taskId,
        taskText: taskId,
      },
    });
    await recordStatusStep("cemetery_to_active", "active");

    await runSelfTestRoute({
      userId: selfTestUserId,
      runId,
      stepName: "delete_forever",
      route: {
        type: PLANNER_ACTIONS.DELETE_TASK_FOREVER,
        taskIds: [taskId],
      },
    });
    cleanupNeeded = false;
    await recordStatusStep("delete_forever_removes_task", "missing");
  } catch (error) {
    steps.push(buildStepResult({
      name: "self_test_error",
      ok: false,
      expected: "no error",
      actual: "error",
      taskId,
      error: error.message || String(error),
    }));
  } finally {
    if (cleanupNeeded && taskId) {
      try {
        await runSelfTestRoute({
          userId: selfTestUserId,
          runId,
          stepName: "cleanup_delete_forever",
          route: {
            type: PLANNER_ACTIONS.DELETE_TASK_FOREVER,
            taskIds: [taskId],
          },
        });
      } catch (cleanupError) {
        steps.push(buildStepResult({
          name: "cleanup_delete_forever",
          ok: false,
          expected: "cleanup ok",
          actual: "cleanup failed",
          taskId,
          error: cleanupError.message || String(cleanupError),
        }));
      }
    }
  }

  const passed = steps.filter((step) => step.ok).length;
  const failed = steps.length - passed;
  const finishedAt = Date.now();

  return {
    ok: failed === 0,
    contractVersion: SELF_TEST_CONTRACT_VERSION,
    kind: "planner_self_test",
    id: runId,
    realUserId,
    selfTestUserId,
    startedAt,
    finishedAt,
    taskId,
    steps,
    summary: {
      passed,
      failed,
      total: steps.length,
    },
  };
}

module.exports = {
  SELF_TEST_CONTRACT_VERSION,
  buildSelfTestUserId,
  runPlannerSelfTest,
};
