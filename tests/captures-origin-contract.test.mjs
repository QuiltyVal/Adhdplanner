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
assert.equal(typeof capturesHandler._test?.createCapturesHandler, "function");

const {
  buildCaptureOrigin,
  createCapturesHandler,
  normalizeCaptureSource,
  resolveCaptureActiveTasks,
  shouldReadLiveActiveTasks,
  validateInput,
} = capturesHandler._test;
const captureExtractor = require("../api/_lib/capture-extractor.js");

assert.equal(typeof captureExtractor._test?.normalizeCandidatePatch, "function");

{
  const warnings = [];
  const patch = captureExtractor._test.normalizeCandidatePatch({
    text: "Buy groceries",
    deadlineAt: "0020-02-07",
  }, [], warnings);

  assert.equal(patch, null);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].type, "ignored_invalid_deadlineAt");
  assert.equal(warnings[0].value, "0020-02-07");
  assert.match(warnings[0].message, /2020.*2100/);
}

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
  const previousDefaultUserId = process.env.PLANNER_DEFAULT_USER_ID;
  const appendCalls = [];
  const processCalls = [];
  const getPlannerDataCalls = [];

  try {
    process.env.PLANNER_DEFAULT_USER_ID = "user-1";

    const handler = createCapturesHandler({
      async appendCapture(input) {
        appendCalls.push(input);
        return {
          captureId: "capture-mcp-1",
          capture: {
            id: "capture-mcp-1",
            rawText: input.text,
            source: input.source,
            meta: input.origin,
            status: "new",
          },
        };
      },
      async processCapture(userId, capture) {
        processCalls.push({ userId, capture });
        return {
          extraction: {
            candidateTasks: [],
          },
          replayed: false,
          taskEnrichment: null,
        };
      },
      async getPlannerData(userId) {
        getPlannerDataCalls.push(userId);
        return {
          tasks: [
            {
              id: "task-1",
              text: "Existing active task",
              status: "active",
              subtasks: [],
            },
          ],
        };
      },
    });

    const req = {
      method: "POST",
      body: {
        text: "MCP note: remember this project context",
        source: "mcp:claude-notes",
        idempotencyKey: "mcp-note-1",
      },
    };
    const res = createMockResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.dryRun, false);
    assert.equal(res.payload.captureId, "capture-mcp-1");
    assert.equal(res.payload.origin.channel, "mcp");
    assert.equal(res.payload.origin.via, "captures_api");
    assert.equal(res.payload.origin.source, "mcp:claude-notes");
    assert.equal(res.payload.activeTasksSource, "live");
    assert.equal(res.payload.activeTasksCount, 1);

    assert.equal(appendCalls.length, 1);
    assert.deepEqual(appendCalls[0], {
      userId: "user-1",
      text: "MCP note: remember this project context",
      source: "mcp:claude-notes",
      idempotencyKey: "mcp-note-1",
      selfTest: null,
      origin: {
        channel: "mcp",
        via: "captures_api",
        source: "mcp:claude-notes",
      },
    });
    assert.equal(processCalls.length, 1);
    assert.equal(processCalls[0].userId, "user-1");
    assert.equal(processCalls[0].capture.id, "capture-mcp-1");
    assert.deepEqual(getPlannerDataCalls, ["user-1"]);
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
