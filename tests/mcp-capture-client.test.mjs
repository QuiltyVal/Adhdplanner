import assert from "node:assert/strict";
import {
  buildPlannerCaptureRequest,
  normalizeCaptureTaskSnapshot,
  normalizeCaptureTaskSnapshots,
  normalizeCaptureToolSource,
  postPlannerCapture,
  resolveCaptureTimeoutMs,
} from "../services/mcp-server/src/capture-client.js";

assert.equal(normalizeCaptureToolSource("Live Smoke"), "mcp:live_smoke");
assert.equal(normalizeCaptureToolSource(""), "mcp:tool");
assert.equal(normalizeCaptureToolSource("MCP capture!? yes"), "mcp:mcp_capture___yes");

{
  const task = normalizeCaptureTaskSnapshot({
    id: " task-1 ",
    text: " Write a note ",
    status: "",
    is_today: true,
    is_vital: true,
    urgency: " high ",
    resistance: " medium ",
    deadline_at: "2026-06-09",
    subtasks: [
      { id: " sub-1 ", text: " First subtask ", completed: true },
      { id: " sub-2 ", text: "   ", completed: false },
    ],
  });

  assert.deepEqual(task, {
    id: "task-1",
    text: "Write a note",
    status: "active",
    subtasks: [
      { id: "sub-1", text: "First subtask", completed: true },
    ],
    isToday: true,
    isVital: true,
    urgency: "high",
    resistance: "medium",
    deadlineAt: "2026-06-09",
  });
}

{
  const task = normalizeCaptureTaskSnapshot({
    id: "task-2",
    text: "Camel case flags",
    isToday: true,
    isVital: false,
    deadlineAt: "2026-06-10",
  });

  assert.equal(task.isToday, true);
  assert.equal(task.isVital, false);
  assert.equal(task.deadlineAt, "2026-06-10");
}

assert.deepEqual(normalizeCaptureTaskSnapshots([
  { id: "ok", text: "Keep" },
  { id: "", text: "Drop no id" },
  { id: "drop", text: "" },
]), [
  {
    id: "ok",
    text: "Keep",
    status: "active",
    subtasks: [],
    isToday: false,
    isVital: false,
    urgency: "",
    resistance: "",
    deadlineAt: null,
  },
]);

{
  const request = buildPlannerCaptureRequest({ text: " note " });
  assert.deepEqual(request.body, {
    text: "note",
    source: "mcp:tool",
    dryRun: true,
    includeLiveTasks: false,
  });
  assert.equal(request.idempotencyKeyPresent, false);
  assert.equal(request.activeTasksCount, 0);
}

assert.throws(
  () => buildPlannerCaptureRequest({ text: "write it", dryRun: false }),
  /idempotency_key is required when dry_run=false/,
);
assert.throws(
  () => buildPlannerCaptureRequest({ text: "   " }),
  /Capture text is required/,
);

{
  const request = buildPlannerCaptureRequest({
    text: "write it",
    dryRun: false,
    idempotencyKey: "capture-123",
  });

  assert.equal(request.body.dryRun, false);
  assert.equal(request.body.idempotencyKey, "capture-123");
  assert.equal(request.idempotencyKeyPresent, true);
}

assert.equal(resolveCaptureTimeoutMs("", 123), 123);
assert.equal(resolveCaptureTimeoutMs("not-a-number", 123), 123);
assert.equal(resolveCaptureTimeoutMs("42", 123), 42);

{
  const calls = [];
  let abortCalled = false;
  let clearedTimer = "";
  const result = await postPlannerCapture({
    captureApiUrl: "https://planner.example/api/captures",
    timeoutMs: 42,
    text: "MCP dry-run note",
    dryRun: true,
    sourceLabel: "live-smoke",
    activeTasks: [
      { id: "task-1", text: "Active task", is_today: true },
    ],
    abortControllerFactory() {
      return {
        signal: { name: "signal" },
        abort() {
          abortCalled = true;
        },
      };
    },
    setTimeoutFn(fn, ms) {
      assert.equal(ms, 42);
      assert.equal(typeof fn, "function");
      return "timer-1";
    },
    clearTimeoutFn(timer) {
      clearedTimer = timer;
    },
    async fetchImpl(url, options) {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            dryRun: true,
            origin: { channel: "mcp" },
            activeTasksSource: "request",
          });
        },
      };
    },
  });

  assert.equal(abortCalled, false);
  assert.equal(clearedTimer, "timer-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, "https://planner.example/api/captures");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(calls[0].options.signal, { name: "signal" });
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    text: "MCP dry-run note",
    source: "mcp:live-smoke",
    dryRun: true,
    includeLiveTasks: false,
    activeTasks: [
      {
        id: "task-1",
        text: "Active task",
        status: "active",
        subtasks: [],
        isToday: true,
        isVital: false,
        urgency: "",
        resistance: "",
        deadlineAt: null,
      },
    ],
  });
  assert.equal(result.captureApi.status, 200);
  assert.equal(result.captureApi.url, "https://planner.example/api/captures");
  assert.equal(result.request.source, "mcp:live-smoke");
  assert.equal(result.request.activeTasksCount, 1);
  assert.equal(result.response.origin.channel, "mcp");
}

await assert.rejects(
  () => postPlannerCapture({
    captureApiUrl: "https://planner.example/api/captures",
    text: "bad response",
    setTimeoutFn() {
      return "timer";
    },
    clearTimeoutFn() {},
    abortControllerFactory() {
      return {
        signal: {},
        abort() {},
      };
    },
    async fetchImpl() {
      return {
        ok: false,
        status: 500,
        async text() {
          return JSON.stringify({ error: "server failed" });
        },
      };
    },
  }),
  /Capture API returned HTTP 500/,
);

console.log("mcp capture client tests passed");
