#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
  sources: [
    "services/mcp-server/src/index.js",
    "services/mcp-server/src/capture-client.js",
  ],
  host: "root@mcp.valquilty.com",
  remoteDir: "/root/adhd-mcp",
  processName: "adhd-mcp",
  publicBaseUrl: "https://mcp.valquilty.com",
  postcheckAttempts: 8,
  postcheckDelayMs: 1000,
};

function getArgValue(name, argv = process.argv) {
  const index = argv.indexOf(name);
  if (index === -1) return "";
  return String(argv[index + 1] || "");
}

function getArgValues(name, argv = process.argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      values.push(String(argv[index + 1] || ""));
    }
  }
  return values.filter(Boolean);
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
    "  --source <path>          Source file. Repeatable. Default: services/mcp-server/src/index.js plus capture-client.js",
    "  --host <ssh-host>        SSH host. Default: root@mcp.valquilty.com",
    "  --remote-dir <path>      Remote MCP dir. Default: /root/adhd-mcp",
    "  --process <name>         PM2 process name. Default: adhd-mcp",
    "  --public-base-url <url>  Public base URL. Default: https://mcp.valquilty.com",
    "  --help                  Show this help.",
    "",
    "Safety:",
    "  - Dry-run by default.",
    "  - Does not copy secrets or live data.",
    "  - Checks syntax locally and on the server before replacing source files.",
    "  - Creates remote source backups before replacing existing files.",
    "  - Verifies /healthz and the /mcp Bearer auth boundary after apply, with short retries for PM2/nginx warmup.",
  ].join("\n");
}

function parseDeployOptions(argv = process.argv, cwd = process.cwd(), now = new Date()) {
  if (hasArg("--help", argv)) {
    return { help: true };
  }

  const sources = getArgValues("--source", argv);
  const sourceFiles = sources.length > 0 ? sources : DEFAULTS.sources;
  const host = getArgValue("--host", argv) || DEFAULTS.host;
  const remoteDir = getArgValue("--remote-dir", argv) || DEFAULTS.remoteDir;
  const processName = getArgValue("--process", argv) || DEFAULTS.processName;
  const publicBaseUrl = getArgValue("--public-base-url", argv) || DEFAULTS.publicBaseUrl;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
  const files = sourceFiles.map(source => {
    const targetName = path.basename(source);
    const stem = targetName.replace(/\.js$/, "");
    const candidateName = `${stem}.codex-candidate-${stamp}.js`;
    const backupName = `${targetName}.backup-deploy-${stamp}`;

    return {
      source,
      sourcePath: path.resolve(cwd, source),
      targetName,
      candidateName,
      backupName,
    };
  });

  return {
    help: false,
    apply: hasArg("--apply", argv),
    source: files[0]?.source ?? "",
    sourcePath: files[0]?.sourcePath ?? "",
    sourceFiles,
    sourcePaths: files.map(file => file.sourcePath),
    files,
    host,
    remoteDir,
    processName,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
    candidateName: files[0]?.candidateName ?? "",
    backupName: files[0]?.backupName ?? "",
    backupNames: files.map(file => file.backupName),
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function buildRemoteDeployScript(plan) {
  return [
    `cd ${shellQuote(plan.remoteDir)}`,
    ...plan.files.map(file => `node --check ${shellQuote(file.candidateName)}`),
    ...plan.files.map(file => (
      `if [ -f ${shellQuote(file.targetName)} ]; then cp -p ${shellQuote(file.targetName)} ${shellQuote(file.backupName)}; fi`
    )),
    ...plan.files.map(file => `mv ${shellQuote(file.candidateName)} ${shellQuote(file.targetName)}`),
    `pm2 restart ${shellQuote(plan.processName)} --update-env >/dev/null`,
    `echo ${shellQuote(plan.backupNames.join(","))}`,
  ].join(" && ");
}

function buildDeployPlan(options) {
  const files = options.files.map(file => ({
    ...file,
    remoteCandidatePath: `${options.remoteDir}/${file.candidateName}`,
    remoteTargetPath: `${options.remoteDir}/${file.targetName}`,
  }));
  const remoteCandidatePath = files[0]?.remoteCandidatePath ?? "";

  return {
    apply: options.apply,
    source: options.source,
    sourcePath: options.sourcePath,
    sourceFiles: options.sourceFiles,
    sourcePaths: options.sourcePaths,
    files,
    host: options.host,
    remoteDir: options.remoteDir,
    remoteCandidatePath,
    candidateName: options.candidateName,
    backupName: options.backupName,
    backupNames: options.backupNames,
    processName: options.processName,
    publicBaseUrl: options.publicBaseUrl,
    commands: [
      ...files.map(file => ({
        step: "local_syntax_check",
        command: "node",
        args: ["--check", file.sourcePath],
      })),
      ...files.map(file => ({
        step: "upload_candidate",
        command: "scp",
        args: [file.sourcePath, `${options.host}:${file.remoteCandidatePath}`],
      })),
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
  return runPostChecksWithRetry(publicBaseUrl);
}

function postChecksPassed(checks) {
  return Boolean(checks?.healthz?.ok && checks?.mcpAuthBoundary?.ok);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runPostChecksOnce(publicBaseUrl, { fetchImpl = fetch } = {}) {
  const health = await fetchImpl(`${publicBaseUrl}/healthz`);
  const healthJson = await health.json().catch(() => null);
  const auth = await fetchImpl(`${publicBaseUrl}/mcp`);
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

async function runPostChecksWithRetry(
  publicBaseUrl,
  {
    attempts = DEFAULTS.postcheckAttempts,
    delayMs = DEFAULTS.postcheckDelayMs,
    fetchImpl = fetch,
    waitFn = wait,
  } = {},
) {
  let lastChecks = null;
  const maxAttempts = Math.max(1, Number.parseInt(attempts, 10) || DEFAULTS.postcheckAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      lastChecks = await runPostChecksOnce(publicBaseUrl, { fetchImpl });
    } catch (error) {
      lastChecks = {
        healthz: {
          ok: false,
          status: 0,
          body: null,
          error: error.message,
        },
        mcpAuthBoundary: {
          ok: false,
          status: 0,
          bearer: false,
          scopeAdvertised: false,
          error: error.message,
        },
      };
    }

    if (postChecksPassed(lastChecks)) {
      return {
        ...lastChecks,
        attempts: attempt,
      };
    }

    if (attempt < maxAttempts) {
      await waitFn(delayMs);
    }
  }

  return {
    ...lastChecks,
    attempts: maxAttempts,
  };
}

async function executeDeploy(plan, { run = runExecFile, postChecks = runPostChecks } = {}) {
  const localCheck = plan.files.map(file => run("node", ["--check", file.sourcePath]));
  const upload = plan.files.map(file => run("scp", [file.sourcePath, `${plan.host}:${file.remoteCandidatePath}`]));
  const remoteOutput = run("ssh", [plan.host, buildRemoteDeployScript(plan)]);
  const checks = await postChecks(plan.publicBaseUrl);

  return {
    ok: postChecksPassed(checks),
    applied: true,
    backupName: remoteOutput || plan.backupNames.join(","),
    backupNames: remoteOutput ? remoteOutput.split(",").filter(Boolean) : plan.backupNames,
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
      sourceFiles: plan.sourceFiles,
      host: plan.host,
      remoteDir: plan.remoteDir,
      backupName: result.backupName,
      backupNames: result.backupNames,
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
  postChecksPassed,
  runPostChecksWithRetry,
  shellQuote,
};
