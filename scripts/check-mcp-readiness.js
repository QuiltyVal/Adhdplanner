#!/usr/bin/env node

const {
  DEFAULT_MCP_URL,
  REQUIRED_SCOPE,
  getHelpText: getEndpointHelpText,
  parseMcpProbeOptions,
  probeMcpEndpoint,
} = require("./check-mcp-endpoint");
const {
  DEFAULT_CODEX_CONFIG_PATH,
  DEFAULT_EXPECTED_URL,
  checkCodexMcpConfig,
  parseCodexMcpConfigOptions,
} = require("./check-codex-mcp-config");

function getArgValue(name, argv = process.argv) {
  const direct = argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);

  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")) return argv[index + 1];
  return "";
}

function hasFlag(name, argv = process.argv) {
  return argv.includes(name);
}

function parseMcpReadinessOptions(argv = process.argv, env = process.env) {
  if (hasFlag("--help", argv)) return { help: true };

  const endpointOptions = parseMcpProbeOptions([
    argv[0] || "node",
    argv[1] || "scripts/check-mcp-readiness.js",
    "--url",
    getArgValue("--url", argv) || env.PLANNER_MCP_URL || DEFAULT_MCP_URL,
    "--requiredScope",
    getArgValue("--requiredScope", argv) || REQUIRED_SCOPE,
    "--timeoutMs",
    getArgValue("--timeoutMs", argv) || "15000",
  ], env);

  const configOptions = parseCodexMcpConfigOptions([
    argv[0] || "node",
    argv[1] || "scripts/check-mcp-readiness.js",
    "--config",
    getArgValue("--config", argv) || env.CODEX_CONFIG_PATH || DEFAULT_CODEX_CONFIG_PATH,
    "--expectedUrl",
    getArgValue("--expectedUrl", argv) || endpointOptions.url || DEFAULT_EXPECTED_URL,
  ], env);

  return {
    help: false,
    endpointOptions,
    configOptions,
  };
}

function getHelpText() {
  return [
    "Usage:",
    "  npm run check:mcp-readiness",
    "  npm run check:mcp-readiness -- --config ~/.codex/config.toml",
    "",
    "Options:",
    "  --url <mcp-url>",
    "  --config <codex-config-path>",
    "  --requiredScope mcp:tools",
    "  --timeoutMs 15000",
    "",
    "This readiness check is read-only. It does not send bearer tokens, call MCP tools, or mutate planner data.",
    "",
    "Endpoint check:",
    getEndpointHelpText().split("\n").slice(7).join("\n"),
  ].join("\n");
}

function compactEndpointReport(report = {}) {
  return {
    ok: Boolean(report.ok),
    mcpUrl: report.mcpUrl || "",
    status: report.status || 0,
    authProtected: Boolean(report.authProtected),
    authScheme: report.authScheme || "",
    requiredScope: report.requiredScope || REQUIRED_SCOPE,
    scopeAdvertised: report.scopeAdvertised || "",
    scopeOk: Boolean(report.scopeOk),
    resourceMetadataOk: report.resourceMetadataOk,
    resourceName: report.resourceMetadata?.resourceName || "",
  };
}

function compactConfigReport(report = {}) {
  return {
    ok: Boolean(report.ok),
    configPath: report.configPath || "",
    expectedUrl: report.expectedUrl || "",
    found: Boolean(report.found),
    matchingServers: Array.isArray(report.matchingServers) ? report.matchingServers : [],
  };
}

function buildMcpReadinessReport({ endpointReport = {}, configReport = {} } = {}) {
  const endpoint = compactEndpointReport(endpointReport);
  const codexConfig = compactConfigReport(configReport);
  const missing = [];
  if (!endpoint.ok) missing.push("mcp_endpoint");
  if (!codexConfig.ok) missing.push("codex_config");

  const nextActions = [];
  if (!endpoint.ok) {
    nextActions.push("Fix the live MCP endpoint/auth metadata before testing clients.");
  }
  if (!codexConfig.ok) {
    nextActions.push("Add [mcp_servers.adhd_planner] with the Planner MCP URL to Codex config, then restart or reload Codex.");
  }
  if (endpoint.ok && codexConfig.ok) {
    nextActions.push("Restart or reload Codex if needed, then run the real authenticated MCP read/write smoke.");
  }

  return {
    ok: endpoint.ok && codexConfig.ok,
    readyForCodexToolUse: endpoint.ok && codexConfig.ok,
    endpoint,
    codexConfig,
    missing,
    nextActions,
    boundary: "Read-only readiness only: no bearer token, no MCP tool call, no planner data mutation.",
  };
}

async function checkMcpReadiness(options = {}) {
  const endpointReport = await probeMcpEndpoint(options.endpointOptions || {});
  const configReport = await checkCodexMcpConfig(options.configOptions || {});
  return buildMcpReadinessReport({ endpointReport, configReport });
}

async function main() {
  const options = parseMcpReadinessOptions();
  if (options.help) {
    console.log(getHelpText());
    return;
  }

  const report = await checkMcpReadiness(options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[check:mcp-readiness] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildMcpReadinessReport,
  checkMcpReadiness,
  compactConfigReport,
  compactEndpointReport,
  getHelpText,
  parseMcpReadinessOptions,
};
