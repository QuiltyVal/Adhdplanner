import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DEFAULT_MCP_URL,
  REQUIRED_SCOPE,
  includesScope,
  normalizeUrl,
  parseMcpProbeOptions,
  parseWwwAuthenticate,
  probeMcpEndpoint,
  splitHeaderParams,
} = require("../scripts/check-mcp-endpoint.js");

function makeHeaders(values = {}) {
  return {
    get(name) {
      const lowerName = String(name || "").toLowerCase();
      const entry = Object.entries(values).find(([key]) => key.toLowerCase() === lowerName);
      return entry ? entry[1] : "";
    },
  };
}

function makeResponse(status, { headers = {}, body = "" } = {}) {
  return {
    status,
    headers: makeHeaders(headers),
    async text() {
      return body;
    },
  };
}

assert.equal(DEFAULT_MCP_URL, "https://mcp.valquilty.com/mcp");
assert.equal(REQUIRED_SCOPE, "mcp:tools");
assert.equal(normalizeUrl("https://mcp.valquilty.com/mcp"), "https://mcp.valquilty.com/mcp");
assert.throws(() => normalizeUrl("file:///tmp/mcp"), /Unsupported MCP URL protocol/);

assert.deepEqual(
  splitHeaderParams('error="invalid_token", error_description="Missing Authorization header", scope="mcp:tools"'),
  [
    'error="invalid_token"',
    'error_description="Missing Authorization header"',
    'scope="mcp:tools"',
  ],
);

{
  const auth = parseWwwAuthenticate(
    'Bearer error="invalid_token", error_description="Missing Authorization header", scope="mcp:tools", resource_metadata="https://mcp.valquilty.com/.well-known/oauth-protected-resource/mcp"',
  );
  assert.equal(auth.scheme, "Bearer");
  assert.equal(auth.params.error, "invalid_token");
  assert.equal(auth.params.error_description, "Missing Authorization header");
  assert.equal(auth.params.scope, "mcp:tools");
  assert.equal(auth.params.resource_metadata, "https://mcp.valquilty.com/.well-known/oauth-protected-resource/mcp");
}

assert.equal(includesScope("mcp:tools", "mcp:tools"), true);
assert.equal(includesScope("openid profile mcp:tools", "mcp:tools"), true);
assert.equal(includesScope("openid,profile,mcp:tools", "mcp:tools"), true);
assert.equal(includesScope("openid profile", "mcp:tools"), false);

{
  const options = parseMcpProbeOptions([
    "node",
    "scripts/check-mcp-endpoint.js",
    "--url",
    "https://mcp.valquilty.com/mcp",
    "--requiredScope",
    "mcp:tools",
    "--timeoutMs",
    "1000",
  ], {});

  assert.equal(options.url, "https://mcp.valquilty.com/mcp");
  assert.equal(options.requiredScope, "mcp:tools");
  assert.equal(options.timeoutMs, 1000);
}

assert.throws(
  () => parseMcpProbeOptions(["node", "script", "--timeoutMs", "0"], {}),
  /--timeoutMs must be a positive integer/,
);

{
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method });
    if (url === "https://mcp.valquilty.com/mcp") {
      return makeResponse(401, {
        headers: {
          "WWW-Authenticate": 'Bearer error="invalid_token", error_description="Missing Authorization header", scope="mcp:tools", resource_metadata="https://mcp.valquilty.com/.well-known/oauth-protected-resource/mcp"',
        },
      });
    }
    if (url === "https://mcp.valquilty.com/.well-known/oauth-protected-resource/mcp") {
      return makeResponse(200, {
        body: JSON.stringify({
          resource: "https://mcp.valquilty.com/mcp",
          authorization_servers: ["https://mcp.valquilty.com/"],
          scopes_supported: ["mcp:tools"],
          resource_name: "ADHD Planner MCP",
        }),
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await probeMcpEndpoint({
    url: "https://mcp.valquilty.com/mcp",
    fetchImpl,
    timeoutMs: 1000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 401);
  assert.equal(result.authProtected, true);
  assert.equal(result.authScheme, "Bearer");
  assert.equal(result.scopeOk, true);
  assert.equal(result.resourceMetadataStatus, 200);
  assert.equal(result.resourceMetadataOk, true);
  assert.equal(result.resourceMetadata.resourceName, "ADHD Planner MCP");
  assert.deepEqual(calls.map((call) => call.method), ["HEAD", "GET"]);
}

{
  const fetchImpl = async (url) => {
    if (url === "https://mcp.valquilty.com/mcp") {
      return makeResponse(401, {
        headers: {
          "WWW-Authenticate": 'Bearer scope="openid", resource_metadata="https://mcp.valquilty.com/.well-known/oauth-protected-resource/mcp"',
        },
      });
    }
    return makeResponse(200, {
      body: JSON.stringify({
        resource: "https://mcp.valquilty.com/mcp",
        scopes_supported: ["openid"],
      }),
    });
  };

  const result = await probeMcpEndpoint({
    url: "https://mcp.valquilty.com/mcp",
    fetchImpl,
    timeoutMs: 1000,
  });

  assert.equal(result.ok, false);
  assert.equal(result.scopeOk, false);
  assert.equal(result.resourceMetadataOk, false);
}

console.log("mcp endpoint probe tests passed");
