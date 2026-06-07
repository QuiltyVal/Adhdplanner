#!/usr/bin/env node

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_CODEX_CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml");
const DEFAULT_EXPECTED_URL = "https://mcp.valquilty.com/mcp";

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

function getHelpText() {
  return [
    "Usage:",
    "  npm run check:codex-mcp",
    "  npm run check:codex-mcp -- --config ~/.codex/config.toml",
    "",
    "Options:",
    "  --config <path>",
    "  --expectedUrl https://mcp.valquilty.com/mcp",
    "",
    "This check reads only MCP server names and URLs from Codex config.",
    "It does not print headers, tokens, or secrets.",
  ].join("\n");
}

function expandHome(inputPath) {
  const value = String(inputPath || "").trim();
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function parseCodexMcpConfigOptions(argv = process.argv, env = process.env) {
  if (hasFlag("--help", argv)) return { help: true };

  return {
    help: false,
    configPath: path.resolve(expandHome(
      getArgValue("--config", argv) ||
      env.CODEX_CONFIG_PATH ||
      DEFAULT_CODEX_CONFIG_PATH,
    )),
    expectedUrl: getArgValue("--expectedUrl", argv) || env.PLANNER_MCP_URL || DEFAULT_EXPECTED_URL,
  };
}

function unquoteTomlString(value = "") {
  const trimmed = String(value || "").trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function parseMcpServerSection(sectionLine = "") {
  const match = String(sectionLine || "").trim().match(/^\[mcp_servers\.((?:"[^"]+")|[A-Za-z0-9_-]+)\]$/);
  if (!match) return "";
  return unquoteTomlString(match[1].trim());
}

function parseSimpleTomlAssignment(line = "") {
  const match = String(line || "").match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/);
  if (!match) return null;
  return {
    key: match[1],
    value: unquoteTomlString(match[2]),
  };
}

function parseCodexMcpServers(configText = "") {
  const servers = [];
  let currentServer = null;

  for (const rawLine of String(configText || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("[")) {
      const serverName = parseMcpServerSection(line);
      currentServer = serverName
        ? {
          name: serverName,
          url: "",
          command: "",
        }
        : null;
      if (currentServer) servers.push(currentServer);
      continue;
    }

    if (!currentServer) continue;
    const assignment = parseSimpleTomlAssignment(line);
    if (!assignment) continue;
    if (assignment.key === "url") currentServer.url = assignment.value;
    if (assignment.key === "command") currentServer.command = assignment.value;
  }

  return servers;
}

function buildCodexMcpConfigReport({ configPath, expectedUrl, configText }) {
  const mcpServers = parseCodexMcpServers(configText);
  const matchingServers = mcpServers.filter((server) => server.url === expectedUrl);

  return {
    ok: matchingServers.length > 0,
    configPath,
    expectedUrl,
    found: matchingServers.length > 0,
    matchingServers: matchingServers.map((server) => ({
      name: server.name,
      url: server.url,
    })),
    mcpServers: mcpServers.map((server) => ({
      name: server.name,
      transport: server.url ? "http" : server.command ? "command" : "unknown",
      url: server.url || "",
      urlMatchesExpected: server.url === expectedUrl,
    })),
    nextAction: matchingServers.length > 0
      ? "Restart or reload Codex so the MCP server is exposed as callable tools in this session."
      : "Add an mcp_servers entry for the expected URL, then restart or reload Codex.",
  };
}

async function checkCodexMcpConfig(options = {}) {
  const configPath = options.configPath || DEFAULT_CODEX_CONFIG_PATH;
  const expectedUrl = options.expectedUrl || DEFAULT_EXPECTED_URL;
  const configText = await fs.readFile(configPath, "utf8");
  return buildCodexMcpConfigReport({
    configPath,
    expectedUrl,
    configText,
  });
}

async function main() {
  const options = parseCodexMcpConfigOptions();
  if (options.help) {
    console.log(getHelpText());
    return;
  }

  const report = await checkCodexMcpConfig(options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[check:codex-mcp] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_CODEX_CONFIG_PATH,
  DEFAULT_EXPECTED_URL,
  buildCodexMcpConfigReport,
  checkCodexMcpConfig,
  expandHome,
  getHelpText,
  parseCodexMcpConfigOptions,
  parseCodexMcpServers,
  parseMcpServerSection,
  parseSimpleTomlAssignment,
  unquoteTomlString,
};
