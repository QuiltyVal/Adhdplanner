import assert from "node:assert/strict";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  buildMcpReadinessReport,
  compactConfigReport,
  compactEndpointReport,
  parseMcpReadinessOptions,
} = require("../scripts/check-mcp-readiness.js");

const healthyEndpointReport = {
  ok: true,
  mcpUrl: "https://mcp.valquilty.com/mcp",
  status: 401,
  authProtected: true,
  authScheme: "Bearer",
  requiredScope: "mcp:tools",
  scopeAdvertised: "mcp:tools",
  scopeOk: true,
  resourceMetadataOk: true,
  resourceMetadata: {
    resourceName: "ADHD Planner MCP",
  },
};

const healthyConfigReport = {
  ok: true,
  configPath: "/Users/valquilty/.codex/config.toml",
  expectedUrl: "https://mcp.valquilty.com/mcp",
  found: true,
  matchingServers: [
    {
      name: "adhd_planner",
      url: "https://mcp.valquilty.com/mcp",
    },
  ],
  mcpServers: [],
};

assert.deepEqual(compactEndpointReport(healthyEndpointReport), {
  ok: true,
  mcpUrl: "https://mcp.valquilty.com/mcp",
  status: 401,
  authProtected: true,
  authScheme: "Bearer",
  requiredScope: "mcp:tools",
  scopeAdvertised: "mcp:tools",
  scopeOk: true,
  resourceMetadataOk: true,
  resourceName: "ADHD Planner MCP",
});

assert.deepEqual(compactConfigReport(healthyConfigReport), {
  ok: true,
  configPath: "/Users/valquilty/.codex/config.toml",
  expectedUrl: "https://mcp.valquilty.com/mcp",
  found: true,
  matchingServers: [
    {
      name: "adhd_planner",
      url: "https://mcp.valquilty.com/mcp",
    },
  ],
});

{
  const report = buildMcpReadinessReport({
    endpointReport: healthyEndpointReport,
    configReport: healthyConfigReport,
  });

  assert.equal(report.ok, true);
  assert.equal(report.readyForCodexToolUse, true);
  assert.deepEqual(report.missing, []);
  assert.match(report.nextActions[0], /real authenticated MCP read\/write smoke/);
  assert.match(report.boundary, /no bearer token/);
}

{
  const report = buildMcpReadinessReport({
    endpointReport: healthyEndpointReport,
    configReport: {
      ...healthyConfigReport,
      ok: false,
      found: false,
      matchingServers: [],
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.readyForCodexToolUse, false);
  assert.deepEqual(report.missing, ["codex_config"]);
  assert.match(report.nextActions.join("\n"), /Add \[mcp_servers\.adhd_planner\]/);
}

{
  const report = buildMcpReadinessReport({
    endpointReport: {
      ...healthyEndpointReport,
      ok: false,
      status: 500,
      authProtected: false,
      scopeOk: false,
    },
    configReport: healthyConfigReport,
  });

  assert.equal(report.ok, false);
  assert.equal(report.readyForCodexToolUse, false);
  assert.deepEqual(report.missing, ["mcp_endpoint"]);
  assert.match(report.nextActions.join("\n"), /Fix the live MCP endpoint/);
}

{
  const report = buildMcpReadinessReport({
    endpointReport: {
      ...healthyEndpointReport,
      ok: false,
      status: 500,
    },
    configReport: {
      ...healthyConfigReport,
      ok: false,
      found: false,
      matchingServers: [],
    },
  });

  assert.deepEqual(report.missing, ["mcp_endpoint", "codex_config"]);
}

{
  const options = parseMcpReadinessOptions([
    "node",
    "scripts/check-mcp-readiness.js",
    "--url",
    "https://example.com/mcp",
    "--config",
    "~/codex-config.toml",
    "--requiredScope",
    "planner:tools",
    "--timeoutMs",
    "1000",
  ], {});

  assert.equal(options.endpointOptions.url, "https://example.com/mcp");
  assert.equal(options.endpointOptions.requiredScope, "planner:tools");
  assert.equal(options.endpointOptions.timeoutMs, 1000);
  assert.equal(options.configOptions.configPath, path.join(os.homedir(), "codex-config.toml"));
  assert.equal(options.configOptions.expectedUrl, "https://example.com/mcp");
}

console.log("mcp readiness check tests passed");
