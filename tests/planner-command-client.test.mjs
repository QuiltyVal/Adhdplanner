import assert from "node:assert/strict";
const originalEmitWarning = process.emitWarning;
process.emitWarning = function emitWarningExceptTypelessModule(warning, ...args) {
  const code = typeof args[0] === "object" ? args[0]?.code : args[1];
  const text = typeof warning === "string" ? warning : warning?.message;
  if (code === "MODULE_TYPELESS_PACKAGE_JSON" || String(text).includes("Module type of file")) {
    return undefined;
  }
  return originalEmitWarning.call(this, warning, ...args);
};

const {
  DEFAULT_PLANNER_BOOTSTRAP_TIMEOUT_MS,
  PlannerClientActionError,
  normalizePlannerClientTimeoutMs,
  runPlannerBootstrap,
} = await import("../src/plannerCommandClient.js");

process.emitWarning = originalEmitWarning;

function createAuthUser(token = "token-123") {
  return {
    async getIdToken() {
      return token;
    },
  };
}

{
  assert.equal(DEFAULT_PLANNER_BOOTSTRAP_TIMEOUT_MS, 15_000);
  assert.equal(normalizePlannerClientTimeoutMs(undefined), 0);
  assert.equal(normalizePlannerClientTimeoutMs("nope"), 0);
  assert.equal(normalizePlannerClientTimeoutMs(-1), 0);
  assert.equal(normalizePlannerClientTimeoutMs(0), 0);
  assert.equal(normalizePlannerClientTimeoutMs(12.9), 12);
}

{
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, planner: { bootstrapped: true } };
      },
    };
  };

  const result = await runPlannerBootstrap({
    authUser: createAuthUser(),
    reportLimit: 7,
    language: "ru",
    fetchImpl,
    timeoutMs: 250,
  });

  assert.deepEqual(result, { ok: true, planner: { bootstrapped: true } });
  assert.equal(request.url, "/api/planner-client-actions");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer token-123");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.equal(request.options.signal instanceof AbortSignal, true);

  const body = JSON.parse(request.options.body);
  assert.equal(body.mode, "planner_bootstrap");
  assert.equal(body.reportLimit, 7);
  assert.equal(body.language, "ru");
}

{
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    });
  });

  await assert.rejects(
    runPlannerBootstrap({
      authUser: createAuthUser(),
      fetchImpl,
      timeoutMs: 5,
    }),
    (error) => {
      assert.equal(error instanceof PlannerClientActionError, true);
      assert.match(error.message, /Planner bootstrap timed out after 5ms/);
      assert.equal(error.responseStatus, 0);
      assert.equal(error.payload.timeoutMs, 5);
      assert.equal(error.payload.ok, false);
      return true;
    },
  );
}

{
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    async json() {
      return { ok: false, error: "server exploded" };
    },
  });

  await assert.rejects(
    runPlannerBootstrap({
      authUser: createAuthUser(),
      fetchImpl,
      timeoutMs: 0,
    }),
    (error) => {
      assert.equal(error instanceof PlannerClientActionError, true);
      assert.equal(error.message, "server exploded");
      assert.equal(error.responseStatus, 500);
      return true;
    },
  );
}

console.log("planner command client tests passed");
