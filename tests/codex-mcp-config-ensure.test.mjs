import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  DEFAULT_SERVER_NAME,
  appendServerEntry,
  buildEnsureCodexMcpReport,
  buildMcpServerEntry,
  ensureCodexMcpConfig,
  parseEnsureCodexMcpOptions,
} = require("../scripts/ensure-codex-mcp-config.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

assert.equal(DEFAULT_SERVER_NAME, "adhd_planner");
assert.equal(
  buildMcpServerEntry({
    serverName: "adhd_planner",
    url: "https://mcp.valquilty.com/mcp",
  }),
  '[mcp_servers.adhd_planner]\nurl = "https://mcp.valquilty.com/mcp"\n',
);
assert.throws(
  () => buildMcpServerEntry({ serverName: "bad.name", url: "https://mcp.valquilty.com/mcp" }),
  /MCP server name/,
);
assert.throws(
  () => buildMcpServerEntry({ serverName: "adhd_planner", url: 'https://bad"value' }),
  /quotes or newlines/,
);

assert.equal(
  appendServerEntry('[mcp_servers.stitch]\nurl = "https://stitch.googleapis.com/mcp"\n', '[mcp_servers.adhd_planner]\nurl = "https://mcp.valquilty.com/mcp"\n'),
  '[mcp_servers.stitch]\nurl = "https://stitch.googleapis.com/mcp"\n\n[mcp_servers.adhd_planner]\nurl = "https://mcp.valquilty.com/mcp"\n',
);

{
  const report = buildEnsureCodexMcpReport({
    configPath: "/tmp/config.toml",
    url: "https://mcp.valquilty.com/mcp",
    serverName: "adhd_planner",
    configText: '[mcp_servers.stitch]\nurl = "https://stitch.googleapis.com/mcp"\n',
    apply: false,
  });

  assert.equal(report.ok, true);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.alreadyConfigured, false);
  assert.equal(report.wouldChange, true);
  assert.equal(report.changed, false);
  assert.match(report.entry, /\[mcp_servers\.adhd_planner\]/);
  assert.match(report.nextAction, /--apply/);
}

{
  const report = buildEnsureCodexMcpReport({
    configPath: "/tmp/config.toml",
    url: "https://mcp.valquilty.com/mcp",
    serverName: "adhd_planner",
    configText: '[mcp_servers.adhd_planner]\nurl = "https://mcp.valquilty.com/mcp"\n',
    apply: false,
  });

  assert.equal(report.ok, true);
  assert.equal(report.alreadyConfigured, true);
  assert.equal(report.wouldChange, false);
  assert.equal(report.entry, "");
}

{
  const report = buildEnsureCodexMcpReport({
    configPath: "/tmp/config.toml",
    url: "https://mcp.valquilty.com/mcp",
    serverName: "adhd_planner",
    configText: '[mcp_servers.adhd_planner]\nurl = "https://other.example/mcp"\n',
    apply: false,
  });

  assert.equal(report.ok, false);
  assert.equal(report.nameConflict, true);
  assert.equal(report.conflict.currentUrl, "https://other.example/mcp");
  assert.equal(report.wouldChange, false);
  assert.match(report.nextAction, /different --serverName/);
}

{
  const options = parseEnsureCodexMcpOptions([
    "node",
    "scripts/ensure-codex-mcp-config.js",
    "--config",
    "~/codex-config.toml",
    "--url",
    "https://example.com/mcp",
    "--serverName",
    "planner",
    "--apply",
  ], {});

  assert.equal(options.configPath, path.join(os.homedir(), "codex-config.toml"));
  assert.equal(options.url, "https://example.com/mcp");
  assert.equal(options.serverName, "planner");
  assert.equal(options.apply, true);
}

assert.throws(
  () => parseEnsureCodexMcpOptions(["node", "script", "--serverName", "bad.name"], {}),
  /--serverName/,
);

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-mcp-ensure-test-"));
  const configPath = path.join(tmpDir, "config.toml");
  fs.writeFileSync(configPath, '[mcp_servers.stitch]\nurl = "https://stitch.googleapis.com/mcp"\n', "utf8");

  const dryRun = await ensureCodexMcpConfig({
    configPath,
    url: "https://mcp.valquilty.com/mcp",
    serverName: "adhd_planner",
    apply: false,
  });
  assert.equal(dryRun.wouldChange, true);
  assert.equal(dryRun.changed, false);
  assert.equal(fs.readFileSync(configPath, "utf8").includes("mcp.valquilty.com"), false);

  const applied = await ensureCodexMcpConfig({
    configPath,
    url: "https://mcp.valquilty.com/mcp",
    serverName: "adhd_planner",
    apply: true,
  });
  assert.equal(applied.changed, true);
  assert.equal(applied.alreadyConfigured, true);
  assert.match(fs.readFileSync(configPath, "utf8"), /mcp\.valquilty\.com\/mcp/);

  const secondRun = await ensureCodexMcpConfig({
    configPath,
    url: "https://mcp.valquilty.com/mcp",
    serverName: "adhd_planner",
    apply: true,
  });
  assert.equal(secondRun.changed, false);
  assert.equal(secondRun.alreadyConfigured, true);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-mcp-cli-test-"));
  const configPath = path.join(tmpDir, "config.toml");
  fs.writeFileSync(configPath, "", "utf8");

  const output = execFileSync("node", [
    "scripts/ensure-codex-mcp-config.js",
    "--config",
    configPath,
  ], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    },
    encoding: "utf8",
  });

  const report = JSON.parse(output);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.wouldChange, true);
  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(configPath, "utf8"), "");
}

console.log("codex mcp config ensure tests passed");
