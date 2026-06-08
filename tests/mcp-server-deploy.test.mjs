import assert from "node:assert/strict";
import {
  buildDeployPlan,
  buildRemoteDeployScript,
  executeDeploy,
  getHelpText,
  parseDeployOptions,
  postChecksPassed,
  runPostChecksWithRetry,
  shellQuote,
} from "../scripts/deploy-mcp-server.mjs";

const fixedDate = new Date("2026-06-08T12:13:05.000Z");

{
  const options = parseDeployOptions(["node", "script"], "/repo", fixedDate);
  assert.equal(options.apply, false);
  assert.equal(options.source, "services/mcp-server/src/index.js");
  assert.equal(options.sourcePath, "/repo/services/mcp-server/src/index.js");
  assert.equal(options.host, "root@mcp.valquilty.com");
  assert.equal(options.remoteDir, "/root/adhd-mcp");
  assert.equal(options.processName, "adhd-mcp");
  assert.equal(options.candidateName, "index.codex-candidate-20260608T121305.js");
  assert.equal(options.backupName, "index.js.backup-deploy-20260608T121305");
}

{
  const options = parseDeployOptions([
    "node",
    "script",
    "--apply",
    "--host",
    "root@example.test",
    "--remote-dir",
    "/srv/mcp path",
    "--process",
    "adhd-mcp-prod",
    "--public-base-url",
    "https://mcp.example.test/",
  ], "/repo", fixedDate);

  assert.equal(options.apply, true);
  assert.equal(options.host, "root@example.test");
  assert.equal(options.remoteDir, "/srv/mcp path");
  assert.equal(options.processName, "adhd-mcp-prod");
  assert.equal(options.publicBaseUrl, "https://mcp.example.test");
}

{
  assert.equal(shellQuote("simple"), "'simple'");
  assert.equal(shellQuote("has space"), "'has space'");
  assert.equal(shellQuote("it's ok"), "'it'\\''s ok'");
}

{
  const plan = buildDeployPlan(parseDeployOptions(["node", "script"], "/repo", fixedDate));
  assert.equal(plan.apply, false);
  assert.equal(plan.remoteCandidatePath, "/root/adhd-mcp/index.codex-candidate-20260608T121305.js");
  assert.equal(plan.safety.dryRunDefault, true);
  assert.equal(plan.safety.livePlannerDataTouched, false);
  assert.equal(plan.safety.secretsCopied, false);
  assert.equal(plan.commands.length, 5);
  assert.equal(JSON.stringify(plan).includes("auth-secrets"), false);
}

{
  const plan = buildDeployPlan(parseDeployOptions([
    "node",
    "script",
    "--remote-dir",
    "/srv/mcp path",
    "--process",
    "adhd-mcp-prod",
  ], "/repo", fixedDate));
  const remoteScript = buildRemoteDeployScript(plan);
  assert.match(remoteScript, /cd '\/srv\/mcp path'/);
  assert.match(remoteScript, /node --check 'index\.codex-candidate-20260608T121305\.js'/);
  assert.match(remoteScript, /cp -p index\.js 'index\.js\.backup-deploy-20260608T121305'/);
  assert.match(remoteScript, /pm2 restart 'adhd-mcp-prod' --update-env/);
}

{
  const calls = [];
  const plan = buildDeployPlan(parseDeployOptions(["node", "script", "--apply"], "/repo", fixedDate));
  const result = await executeDeploy(plan, {
    run(command, args) {
      calls.push({ command, args });
      if (command === "ssh") return "index.js.backup-deploy-20260608T121305";
      return "";
    },
    async postChecks(publicBaseUrl) {
      assert.equal(publicBaseUrl, "https://mcp.valquilty.com");
      return {
        healthz: { ok: true, status: 200, body: { ok: true } },
        mcpAuthBoundary: { ok: true, status: 401, bearer: true, scopeAdvertised: true },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.backupName, "index.js.backup-deploy-20260608T121305");
  assert.deepEqual(calls.map(call => call.command), ["node", "scp", "ssh"]);
}

{
  assert.equal(postChecksPassed({
    healthz: { ok: true },
    mcpAuthBoundary: { ok: true },
  }), true);
  assert.equal(postChecksPassed({
    healthz: { ok: true },
    mcpAuthBoundary: { ok: false },
  }), false);
}

{
  const urls = [];
  let attempt = 0;
  const checks = await runPostChecksWithRetry("https://mcp.example.test", {
    attempts: 3,
    delayMs: 0,
    async waitFn() {},
    async fetchImpl(url) {
      urls.push(url);
      const isHealth = url.endsWith("/healthz");
      if (isHealth) attempt += 1;
      if (attempt === 1) {
        return {
          ok: false,
          status: 502,
          async json() {
            return null;
          },
          headers: {
            get() {
              return "";
            },
          },
        };
      }
      return {
        ok: isHealth,
        status: isHealth ? 200 : 401,
        async json() {
          return isHealth ? { ok: true } : null;
        },
        headers: {
          get(name) {
            return name === "www-authenticate"
              ? 'Bearer scope="mcp:tools"'
              : "";
          },
        },
      };
    },
  });

  assert.equal(checks.healthz.ok, true);
  assert.equal(checks.mcpAuthBoundary.ok, true);
  assert.equal(checks.attempts, 2);
  assert.deepEqual(urls, [
    "https://mcp.example.test/healthz",
    "https://mcp.example.test/mcp",
    "https://mcp.example.test/healthz",
    "https://mcp.example.test/mcp",
  ]);
}

{
  const help = getHelpText();
  assert.match(help, /Dry-run by default/);
  assert.match(help, /--apply/);
  assert.match(help, /backup/);
  assert.match(help, /retries/);
}

console.log("mcp server deploy tests passed");
