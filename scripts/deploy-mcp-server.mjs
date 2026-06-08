#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
  source: "services/mcp-server/src/index.js",
  host: "root@mcp.valquilty.com",
  remoteDir: "/root/adhd-mcp",
  processName: "adhd-mcp",
  publicBaseUrl: "https://mcp.valquilty.com",
};

function getArgValue(name, argv = process.argv) {
  const index = argv.indexOf(name);
  if (index === -1) return "";
  return String(argv[index + 1] || "");
}

function hasArg(name, argv = process.argv) {
  return argv.includes(name);
}

function getHelpText() {
  return [
    "Usage:",
    "  npm run deploy:mcp-server",
    "  npm run deploy:mcp-server -- --apply",
    "",
    "Options:",
    "  --apply                 Execute the deploy. Omit for dry-run.",
    "  --source <path>          Source file. Default: services/mcp-server/src/index.js",
    "  --host <ssh-host>        SSH host. Default: root@mcp.valquilty.com",
    "  --remote-dir <path>      Remote MCP dir. Default: /root/adhd-mcp",
    "  --process <name>         PM2 process name. Default: adhd-mcp",
    "  --public-base-url <url>  Public base URL. Default: https://mcp.valquilty.com",
    "  --help                  Show this help.",
    "",
    "Safety:",
    "  - Dry-run by default.",
    "  - Does not copy secrets or live data.",
    "  - Checks syntax locally and on the server before replacing index.js.",
    "  - Creates a remote index.js backup before replacing it.",
    "  - Verifies /healthz and the /mcp Bearer auth boundary after apply.",
  ].join("\n");
}

function parseDeployOptions(argv = process.argv, cwd = process.cwd(), now = new Date()) {
  if (hasArg("--help", argv)) {
    return { help: true };
  }

  const source = getArgValue("--source", argv) || DEFAULTS.source;
  const host = getArgValue("--host", argv) || DEFAULTS.host;
  const remoteDir = getArgValue("--remote-dir", argv) || DEFAULTS.remoteDir;
  const processName = getArgValue("--process", argv) || DEFAULTS.processName;
  const publicBaseUrl = getArgValue("--public-base-url", argv) || DEFAULTS.publicBaseUrl;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");

  return {
    help: false,
    apply: hasArg("--apply", argv),
    source,
    sourcePath: path.resolve(cwd, source),
    host,
    remoteDir,
    processName,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
    candidateName: `index.codex-candidate-${stamp}.js`,
    backupName: `index.js.backup-deploy-${stamp}`,
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function buildRemoteDeployScript(plan) {
  return [
    `cd ${shellQuote(plan.remoteDir)}`,
    `node --check ${shellQuote(plan.candidateName)}`,
    `cp -p index.js ${shellQuote(plan.backupName)}`,
    `mv ${shellQuote(plan.candidateName)} index.js`,
    `pm2 restart ${shellQuote(plan.processName)} --update-env >/dev/null`,
    `echo ${shellQuote(plan.backupName)}`,
  ].join(" && ");
}

function buildDeployPlan(options) {
  const remoteCandidatePath = `${options.remoteDir}/${options.candidateName}`;
  return {
    apply: options.apply,
    source: options.source,
    sourcePath: options.sourcePath,
    host: options.host,
    remoteDir: options.remoteDir,
    remoteCandidatePath,
    candidateName: options.candidateName,
    backupName: options.backupName,
    processName: options.processName,
    publicBaseUrl: options.publicBaseUrl,
    commands: [
      {
        step: "local_syntax_check",
        command: "node",
        args: ["--check", options.sourcePath],
      },
      {
        step: "upload_candidate",
        command: "scp",
        args: [options.sourcePath, `${options.host}:${remoteCandidatePath}`],
      },
      {
        step: "remote_check_backup_replace_restart",
        command: "ssh",
        args: [options.host, buildRemoteDeployScript(options)],
      },
      {
        step: "postcheck_healthz",
        url: `${options.publicBaseUrl}/healthz`,
      },
      {
        step: "postcheck_auth_boundary",
        url: `${options.publicBaseUrl}/mcp`,
      },
    ],
    safety: {
      dryRunDefault: true,
      localSyntaxCheck: true,
      remoteSyntaxCheck: true,
      remoteBackupBeforeReplace: true,
      pm2RestartOnly: options.processName,
      livePlannerDataTouched: false,
      secretsCopied: false,
    },
  };
}

function runExecFile(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function runPostChecks(publicBaseUrl) {
  const health = await fetch(`${publicBaseUrl}/healthz`);
  const healthJson = await health.json().catch(() => null);
  const auth = await fetch(`${publicBaseUrl}/mcp`);
  const authenticate = auth.headers.get("www-authenticate") || "";

  return {
    healthz: {
      ok: health.ok,
      status: health.status,
      body: healthJson,
    },
    mcpAuthBoundary: {
      ok: auth.status === 401 && authenticate.includes("Bearer") && authenticate.includes("mcp:tools"),
      status: auth.status,
      bearer: authenticate.includes("Bearer"),
      scopeAdvertised: authenticate.includes("mcp:tools"),
    },
  };
}

async function executeDeploy(plan, { run = runExecFile, postChecks = runPostChecks } = {}) {
  const localCheck = run("node", ["--check", plan.sourcePath]);
  const upload = run("scp", [plan.sourcePath, `${plan.host}:${plan.remoteCandidatePath}`]);
  const remoteOutput = run("ssh", [plan.host, buildRemoteDeployScript(plan)]);
  const checks = await postChecks(plan.publicBaseUrl);

  return {
    ok: Boolean(checks.healthz.ok && checks.mcpAuthBoundary.ok),
    applied: true,
    backupName: remoteOutput || plan.backupName,
    localCheck,
    upload,
    postChecks: checks,
  };
}

async function main() {
  const options = parseDeployOptions();
  if (options.help) {
    console.log(getHelpText());
    return;
  }

  const plan = buildDeployPlan(options);

  if (!options.apply) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      plan,
      nextAction: "Run with --apply to upload, check, back up, replace, restart, and post-check the live MCP server.",
    }, null, 2));
    return;
  }

  const result = await executeDeploy(plan);
  console.log(JSON.stringify({
    ok: result.ok,
    dryRun: false,
    plan: {
      source: plan.source,
      host: plan.host,
      remoteDir: plan.remoteDir,
      backupName: result.backupName,
      processName: plan.processName,
      publicBaseUrl: plan.publicBaseUrl,
    },
    result,
  }, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) {
  main().catch(error => {
    console.error(`[deploy-mcp-server] ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  buildDeployPlan,
  buildRemoteDeployScript,
  executeDeploy,
  getHelpText,
  parseDeployOptions,
  shellQuote,
};
