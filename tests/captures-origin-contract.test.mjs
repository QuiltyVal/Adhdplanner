import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.ANGEL_LAB_OPENAI_DRAFTS = "0";

const require = createRequire(import.meta.url);
const capturesHandler = require("../api/captures.js");

assert.equal(typeof capturesHandler._test?.buildCaptureOrigin, "function");
assert.equal(typeof capturesHandler._test?.normalizeCaptureSource, "function");
assert.equal(typeof capturesHandler._test?.validateInput, "function");

const {
  buildCaptureOrigin,
  normalizeCaptureSource,
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
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.input.origin.channel, "mcp");
  assert.equal(validation.input.origin.via, "captures_api");
  assert.equal(validation.input.origin.source, "mcp:claude-notes");
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
  const req = {
    method: "POST",
    body: {
      text: "remember to check the documents folder",
      source: "mcp:claude-notes",
      dryRun: true,
      activeTasks: [],
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
  assert.match(res.payload.captureId, /^dryrun-/);
}

console.log("captures origin contract tests passed");
