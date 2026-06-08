#!/usr/bin/env node
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_AUTH_SECRETS_PATH = "/root/adhd-mcp/auth-secrets.json";
const DEFAULT_PASSWORD_BYTES = 24;
const HASH_BYTES = 64;
const MIN_PASSWORD_LENGTH = 16;

function usage() {
  return [
    "Usage:",
    "  node scripts/set-mcp-oauth-password.mjs --generate --auth-secrets /root/adhd-mcp/auth-secrets.json",
    "  printf '%s' \"$NEW_PASSWORD\" | node scripts/set-mcp-oauth-password.mjs --password-stdin",
    "",
    "Options:",
    "  --auth-secrets <path>      Path to auth-secrets.json. Default: /root/adhd-mcp/auth-secrets.json",
    "  --generate                 Generate a strong random password.",
    "  --password-stdin           Read the new password from stdin.",
    "  --print-password           Include generated password in stdout JSON. Use only with redirected output.",
    "  --password-output-file <p>  Write generated password to a chmod 600 local file.",
    "  --pm2-restart <name>        Restart a PM2 process after updating secrets.",
    "  --help                     Show this help.",
    "",
    "Safety:",
    "  - Updates only passwordSalt and passwordHash.",
    "  - Creates a chmod 600 backup next to auth-secrets.json before writing.",
    "  - Does not print or store a password unless explicitly requested.",
  ].join("\n");
}

function getArgValue(name, argv = process.argv) {
  const index = argv.indexOf(name);
  if (index === -1) return "";
  return String(argv[index + 1] || "");
}

function hasArg(name, argv = process.argv) {
  return argv.includes(name);
}

function parseArgs(argv = process.argv) {
  const generate = hasArg("--generate", argv);
  const passwordStdin = hasArg("--password-stdin", argv);

  return {
    authSecretsPath:
      getArgValue("--auth-secrets", argv)
      || process.env.AUTH_SECRETS_PATH
      || DEFAULT_AUTH_SECRETS_PATH,
    generate,
    passwordStdin,
    printPassword: hasArg("--print-password", argv),
    passwordOutputFile: getArgValue("--password-output-file", argv),
    pm2Restart: getArgValue("--pm2-restart", argv),
    help: hasArg("--help", argv) || hasArg("-h", argv),
  };
}

function timestampForBackup(now = new Date()) {
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
}

function generatePassword(byteLength = DEFAULT_PASSWORD_BYTES) {
  return randomBytes(byteLength).toString("base64url");
}

function readStdin() {
  return readFileSync(0, "utf8");
}

function normalizePassword(rawPassword) {
  return String(rawPassword || "").replace(/\r?\n$/, "");
}

function validatePassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

function hashPassword(password, salt = randomBytes(32).toString("hex")) {
  validatePassword(password);
  return {
    passwordSalt: salt,
    passwordHash: scryptSync(password, salt, HASH_BYTES).toString("hex"),
  };
}

function verifyPassword(password, { passwordSalt, passwordHash }) {
  const derived = scryptSync(password, passwordSalt, HASH_BYTES);
  return timingSafeEqual(derived, Buffer.from(passwordHash, "hex"));
}

function writeJsonAtomic(filePath, value, mode = 0o600) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode });
  chmodSync(tempPath, mode);
  renameSync(tempPath, filePath);
  chmodSync(filePath, mode);
}

function buildBackupPath(authSecretsPath, now = new Date()) {
  return `${authSecretsPath}.backup-${timestampForBackup(now)}`;
}

function loadAuthSecrets(authSecretsPath) {
  const secrets = JSON.parse(readFileSync(authSecretsPath, "utf8"));
  const requiredKeys = [
    "allowedEmail",
    "passwordSalt",
    "passwordHash",
    "sessionSecret",
    "accessTokenSecret",
    "refreshTokenSecret",
  ];

  for (const key of requiredKeys) {
    if (!secrets[key]) {
      throw new Error(`auth-secrets.json is missing ${key}`);
    }
  }

  return secrets;
}

function resetPassword({
  authSecretsPath = DEFAULT_AUTH_SECRETS_PATH,
  password,
  now = new Date(),
} = {}) {
  validatePassword(password);
  const secrets = loadAuthSecrets(authSecretsPath);
  const backupPath = buildBackupPath(authSecretsPath, now);
  writeJsonAtomic(backupPath, secrets, 0o600);

  const nextPassword = hashPassword(password);
  const nextSecrets = {
    ...secrets,
    ...nextPassword,
  };

  writeJsonAtomic(authSecretsPath, nextSecrets, 0o600);

  if (!verifyPassword(password, nextSecrets)) {
    throw new Error("Password verification failed after updating auth secrets.");
  }

  return {
    ok: true,
    authSecretsPath,
    backupPath,
    changedFields: ["passwordSalt", "passwordHash"],
    preservedFields: ["allowedEmail", "sessionSecret", "accessTokenSecret", "refreshTokenSecret"],
  };
}

function writePasswordOutputFile(filePath, password) {
  if (!filePath) return null;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, password, { mode: 0o600 });
  chmodSync(filePath, 0o600);
  return filePath;
}

function restartPm2(processName) {
  if (!processName) return null;
  const result = spawnSync("pm2", ["restart", processName], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`pm2 restart failed: ${result.stderr || result.stdout || result.status}`);
  }

  return {
    processName,
    status: result.status,
  };
}

async function runCli(argv = process.argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.generate === options.passwordStdin) {
    throw new Error("Choose exactly one of --generate or --password-stdin.");
  }

  if (options.printPassword && !options.generate) {
    throw new Error("--print-password is only allowed with --generate.");
  }

  if (options.passwordOutputFile && !options.generate) {
    throw new Error("--password-output-file is only allowed with --generate.");
  }

  const password = options.generate
    ? generatePassword()
    : normalizePassword(readStdin());

  const report = resetPassword({
    authSecretsPath: options.authSecretsPath,
    password,
  });
  const passwordOutputFile = writePasswordOutputFile(options.passwordOutputFile, password);
  const pm2 = restartPm2(options.pm2Restart);

  const output = {
    ...report,
    passwordOutputFile,
    pm2,
    passwordPrinted: Boolean(options.printPassword),
  };

  if (options.printPassword) {
    output.generatedPassword = password;
  }

  console.log(JSON.stringify(output, null, 2));
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  runCli().catch((error) => {
    console.error(`[set-mcp-oauth-password] ${error.message}`);
    process.exit(1);
  });
}

export {
  buildBackupPath,
  generatePassword,
  hashPassword,
  parseArgs,
  resetPassword,
  timestampForBackup,
  validatePassword,
  verifyPassword,
  writePasswordOutputFile,
};
