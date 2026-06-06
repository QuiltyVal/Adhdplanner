import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.ANGEL_LAB_OPENAI_DRAFTS = "0";

const require = createRequire(import.meta.url);
const capturesHandler = require("../api/captures.js");

assert.equal(typeof capturesHandler._test?.buildCaptureOrigin, "function");
assert.equal(typeof capturesHandler._test?.normalizeCaptureSource, "function");
assert.equal(typeof capturesHandler._test?.validateInput, "function");
assert.equal(typeof capturesHandler._test?.shouldReadLiveActiveTasks, "function");
assert.equal(typeof capturesHandler._test?.resolveCaptureActiveTasks, "function");

const {
  buildCaptureOrigin,
  normalizeCaptureSource,
  resolveCaptureActiveTasks,
  shouldReadLiveActiveTasks,
  validateInput,
} = capturesHandler._test;

assert.equal(normalizeCaptureSource("Claude MCP / Notes"), "claude_mcp___notes");
assert.deepEqual(buildCaptureOrigin("mcp"), {
  channel: "mcp",
  via: "captures_api",
  source: "mcp",
});
assert.deepEqual(buildCaptureOrigin("mcp:claude-notes"), {
  channel: "mcp",
  via: "captures_api",
  source: "mcp:claude-notes",
});
assert.deepEqual(buildCaptureOrigin("api:agent"), {
  channel: "api",
  via: "captures_api",
  source: "api:agent",
});
assert.deepEqual(buildCaptureOrigin("web_angel_lab"), {
  channel: "web",
  via: "captures_api",
  source: "web_angel_lab",
});

{
  const validation = validateInput({
    text: "remember that documents need a follow-up",
    source: "mcp:claude-notes",
    dryRun: true,
    includeLiveTasks: true,
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.input.origin.channel, "mcp");
  assert.equal(validation.input.origin.via, "captures_api");
  assert.equal(validation.input.origin.source, "mcp:claude-notes");
  assert.equal(validation.input.includeLiveTasks, true);
}

assert.equal(shouldReadLiveActiveTasks({
  userId: "user-1",
  dryRun: true,
  includeLiveTasks: false,
}), false);
assert.equal(shouldReadLiveActiveTasks({
  userId: "user-1",
  dryRun: true,
  includeLiveTasks: true,
}), true);
assert.equal(shouldReadLiveActiveTasks({
  userId: "user-1",
  dryRun: false,
  includeLiveTasks: false,
}), true);

{
  const resolved = await resolveCaptureActiveTasks({
    userId: "user-1",
    dryRun: true,
    includeLiveTasks: false,
    activeTasks: [],
  });
  assert.deepEqual(resolved, {
    activeTasks: [],
    source: "none",
  });
}

function createMockResponse() {
  return {
    statusCode: 0,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    setHeader() {},
  };
}

{
  const previousDefaultUserId = process.env.PLANNER_DEFAULT_USER_ID;
  try {
    process.env.PLANNER_DEFAULT_USER_ID = "user-1";

    const req = {
      method: "POST",
      body: {
        text: "remember to check the documents folder",
        source: "mcp:claude-notes",
        dryRun: true,
      },
    };
    const res = createMockResponse();

    await capturesHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.dryRun, true);
    assert.equal(res.payload.origin.channel, "mcp");
    assert.equal(res.payload.origin.via, "captures_api");
    assert.equal(res.payload.origin.source, "mcp:claude-notes");
    assert.equal(res.payload.activeTasksSource, "none");
    assert.equal(res.payload.activeTasksCount, 0);
    assert.match(res.payload.captureId, /^dryrun-/);
  } finally {
    if (previousDefaultUserId == null) {
      delete process.env.PLANNER_DEFAULT_USER_ID;
    } else {
      process.env.PLANNER_DEFAULT_USER_ID = previousDefaultUserId;
    }
  }
}

{
  const req = {
    method: "POST",
    body: {
      text: "merge this with a task",
      source: "mcp:claude-notes",
      dryRun: true,
      activeTasks: [
        {
          id: "task-1",
          text: "Check documents folder",
          status: "active",
          subtasks: [{ id: "step-1", text: "Open folder", completed: false }],
        },
      ],
    },
  };
  const res = createMockResponse();

  await capturesHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.dryRun, true);
  assert.equal(res.payload.activeTasksSource, "request");
  assert.equal(res.payload.activeTasksCount, 1);
}

console.log("captures origin contract tests passed");
