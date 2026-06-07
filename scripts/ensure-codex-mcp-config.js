#!/usr/bin/env node

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_CODEX_CONFIG_PATH,
  DEFAULT_EXPECTED_URL,
  buildCodexMcpConfigReport,
  expandHome,
  parseCodexMcpServers,
} = require("./check-codex-mcp-config");

const DEFAULT_SERVER_NAME = "adhd_planner";

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
    "  npm run setup:codex-mcp",
    "  npm run setup:codex-mcp -- --apply",
    "",
    "Options:",
    "  --config <path>",
    "  --url https://mcp.valquilty.com/mcp",
    "  --serverName adhd_planner",
    "  --apply",
    "",
    "Default mode is dry-run. It prints the exact MCP server entry but does not write files.",
    "With --apply, it appends only the MCP server URL entry. It does not write tokens or headers.",
  ].join("\n");
}

function parseEnsureCodexMcpOptions(argv = process.argv, env = process.env) {
  if (hasFlag("--help", argv)) return { help: true };

  const serverName = getArgValue("--serverName", argv) || DEFAULT_SERVER_NAME;
  if (!/^[A-Za-z0-9_-]+$/.test(serverName)) {
    throw new Error("--serverName must contain only letters, numbers, '_' or '-'.");
  }

  return {
    help: false,
    apply: hasFlag("--apply", argv),
    configPath: path.resolve(expandHome(
      getArgValue("--config", argv) ||
      env.CODEX_CONFIG_PATH ||
      DEFAULT_CODEX_CONFIG_PATH,
    )),
    url: getArgValue("--url", argv) || env.PLANNER_MCP_URL || DEFAULT_EXPECTED_URL,
    serverName,
  };
}

function buildMcpServerEntry({ serverName = DEFAULT_SERVER_NAME, url = DEFAULT_EXPECTED_URL } = {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(serverName)) {
    throw new Error("MCP server name must contain only letters, numbers, '_' or '-'.");
  }
  const safeUrl = String(url || "").trim();
  if (!safeUrl) throw new Error("MCP URL is required.");
  if (safeUrl.includes("\"") || safeUrl.includes("\n") || safeUrl.includes("\r")) {
    throw new Error("MCP URL cannot contain quotes or newlines.");
  }
  return `[mcp_servers.${serverName}]\nurl = "${safeUrl}"\n`;
}

function appendServerEntry(configText = "", entry = "") {
  const prefix = String(configText || "").trimEnd();
  if (!prefix) return `${entry.trimEnd()}\n`;
  return `${prefix}\n\n${entry.trimEnd()}\n`;
}

function findServerByName(servers = [], serverName = DEFAULT_SERVER_NAME) {
  return servers.find((server) => server.name === serverName) || null;
}

function buildEnsureCodexMcpReport({
  configPath,
  url,
  serverName = DEFAULT_SERVER_NAME,
  configText = "",
  apply = false,
  written = false,
} = {}) {
  const entry = buildMcpServerEntry({ serverName, url });
  const currentReport = buildCodexMcpConfigReport({
    configPath,
    expectedUrl: url,
    configText,
  });
  const servers = parseCodexMcpServers(configText);
  const sameNameServer = findServerByName(servers, serverName);
  const nameConflict = Boolean(sameNameServer && sameNameServer.url && sameNameServer.url !== url);
  const alreadyConfigured = currentReport.ok;
  const wouldChange = !alreadyConfigured && !nameConflict;

  return {
    ok: alreadyConfigured || wouldChange,
    mode: apply ? "apply" : "dry-run",
    configPath,
    serverName,
    url,
    alreadyConfigured,
    nameConflict,
    conflict: nameConflict
      ? {
        serverName: sameNameServer.name,
        currentUrl: sameNameServer.url,
        expectedUrl: url,
      }
      : null,
    wouldChange,
    changed: Boolean(apply && written),
    entry: wouldChange ? entry.trimEnd() : "",
    nextAction: alreadyConfigured
      ? "Restart or reload Codex if Planner MCP tools are still not visible."
      : nameConflict
        ? "Choose a different --serverName or edit the existing MCP server entry manually."
        : apply
          ? "Restart or reload Codex, then run npm run check:mcp-readiness."
          : "Run the same command with --apply to append this entry, then restart or reload Codex.",
  };
}

async function readConfigIfExists(configPath) {
  try {
    return await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return "";
    throw error;
  }
}

async function ensureCodexMcpConfig(options = {}) {
  const configPath = options.configPath || DEFAULT_CODEX_CONFIG_PATH;
  const url = options.url || DEFAULT_EXPECTED_URL;
  const serverName = options.serverName || DEFAULT_SERVER_NAME;
  const configText = await readConfigIfExists(configPath);
  const initialReport = buildEnsureCodexMcpReport({
    configPath,
    url,
    serverName,
    configText,
    apply: Boolean(options.apply),
  });

  if (!options.apply || !initialReport.wouldChange) {
    return initialReport;
  }

  const nextConfig = appendServerEntry(configText, initialReport.entry);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, nextConfig, "utf8");

  return buildEnsureCodexMcpReport({
    configPath,
    url,
    serverName,
    configText: nextConfig,
    apply: true,
    written: true,
  });
}

async function main() {
  const options = parseEnsureCodexMcpOptions();
  if (options.help) {
    console.log(getHelpText());
    return;
  }

  const report = await ensureCodexMcpConfig(options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok || report.nameConflict) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[setup:codex-mcp] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_SERVER_NAME,
  appendServerEntry,
  buildEnsureCodexMcpReport,
  buildMcpServerEntry,
  ensureCodexMcpConfig,
  findServerByName,
  getHelpText,
  parseEnsureCodexMcpOptions,
  readConfigIfExists,
};
