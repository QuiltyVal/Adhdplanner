import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  DEFAULT_EXPECTED_URL,
  buildCodexMcpConfigReport,
  expandHome,
  parseCodexMcpConfigOptions,
  parseCodexMcpServers,
  parseMcpServerSection,
  parseSimpleTomlAssignment,
  unquoteTomlString,
} = require("../scripts/check-codex-mcp-config.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

assert.equal(DEFAULT_EXPECTED_URL, "https://mcp.valquilty.com/mcp");
assert.equal(expandHome("~"), os.homedir());
assert.equal(expandHome("~/config.toml"), path.join(os.homedir(), "config.toml"));
assert.equal(unquoteTomlString('"hello\\\"world"'), 'hello"world');
assert.equal(parseMcpServerSection("[mcp_servers.adhd_planner]"), "adhd_planner");
assert.equal(parseMcpServerSection('[mcp_servers."adhd-planner"]'), "adhd-planner");
assert.equal(parseMcpServerSection("[plugins.foo]"), "");
assert.deepEqual(parseSimpleTomlAssignment('url = "https://mcp.valquilty.com/mcp"'), {
  key: "url",
  value: "https://mcp.valquilty.com/mcp",
});

{
  const servers = parseCodexMcpServers(`
[mcp_servers.stitch]
url = "https://stitch.googleapis.com/mcp"

[mcp_servers.adhd_planner]
url = "https://mcp.valquilty.com/mcp"

[mcp_servers.node_repl]
command = "/Applications/Codex.app/Contents/Resources/node_repl"

[mcp_servers.adhd_planner.http_headers]
Authorization = "Bearer secret"
`);

  assert.deepEqual(servers, [
    {
      name: "stitch",
      url: "https://stitch.googleapis.com/mcp",
      command: "",
    },
    {
      name: "adhd_planner",
      url: "https://mcp.valquilty.com/mcp",
      command: "",
    },
    {
      name: "node_repl",
      url: "",
      command: "/Applications/Codex.app/Contents/Resources/node_repl",
    },
  ]);
}

{
  const report = buildCodexMcpConfigReport({
    configPath: "/tmp/config.toml",
    expectedUrl: "https://mcp.valquilty.com/mcp",
    configText: `
[mcp_servers.stitch]
url = "https://stitch.googleapis.com/mcp"

[mcp_servers.adhd_planner]
url = "https://mcp.valquilty.com/mcp"
`,
  });

  assert.equal(report.ok, true);
  assert.equal(report.found, true);
  assert.deepEqual(report.matchingServers, [{
    name: "adhd_planner",
    url: "https://mcp.valquilty.com/mcp",
  }]);
  assert.match(report.nextAction, /Restart or reload Codex/);
}

{
  const report = buildCodexMcpConfigReport({
    configPath: "/tmp/config.toml",
    expectedUrl: "https://mcp.valquilty.com/mcp",
    configText: `
[mcp_servers.stitch]
url = "https://stitch.googleapis.com/mcp"
`,
  });

  assert.equal(report.ok, false);
  assert.equal(report.found, false);
  assert.equal(report.matchingServers.length, 0);
  assert.match(report.nextAction, /Add an mcp_servers entry/);
}

{
  const options = parseCodexMcpConfigOptions([
    "node",
    "scripts/check-codex-mcp-config.js",
    "--config",
    "~/custom-codex.toml",
    "--expectedUrl",
    "https://example.com/mcp",
  ], {});

  assert.equal(options.configPath, path.join(os.homedir(), "custom-codex.toml"));
  assert.equal(options.expectedUrl, "https://example.com/mcp");
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-mcp-config-test-"));
  const configPath = path.join(tmpDir, "config.toml");
  fs.writeFileSync(configPath, `
[mcp_servers.adhd_planner]
url = "https://mcp.valquilty.com/mcp"
`, "utf8");

  const output = execFileSync("node", [
    "scripts/check-codex-mcp-config.js",
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
  assert.equal(report.ok, true);
  assert.equal(report.matchingServers[0].name, "adhd_planner");
}

console.log("codex mcp config check tests passed");
