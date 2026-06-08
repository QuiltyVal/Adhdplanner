import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildBackupPath,
  generatePassword,
  hashPassword,
  parseArgs,
  resetPassword,
  timestampForBackup,
  validatePassword,
  verifyPassword,
  writePasswordOutputFile,
} from "../scripts/set-mcp-oauth-password.mjs";

assert.equal(timestampForBackup(new Date("2026-06-08T05:04:03Z")), "20260608050403");
assert.equal(
  buildBackupPath("/root/adhd-mcp/auth-secrets.json", new Date("2026-06-08T05:04:03Z")),
  "/root/adhd-mcp/auth-secrets.json.backup-20260608050403",
);

assert.throws(() => validatePassword("too-short"), /at least 16/);
const generated = generatePassword();
assert.ok(generated.length >= 24);
assert.doesNotThrow(() => validatePassword(generated));

{
  const password = "correct horse battery staple";
  const hashed = hashPassword(password, "abc123");
  assert.equal(hashed.passwordSalt, "abc123");
  assert.equal(hashed.passwordHash.length, 128);
  assert.equal(verifyPassword(password, hashed), true);
  assert.equal(verifyPassword("wrong password value", hashed), false);
}

assert.deepEqual(parseArgs([
  "node",
  "scripts/set-mcp-oauth-password.mjs",
  "--generate",
  "--auth-secrets",
  "/tmp/auth.json",
  "--password-output-file",
  "/tmp/password.txt",
  "--pm2-restart",
  "adhd-mcp",
]), {
  authSecretsPath: "/tmp/auth.json",
  generate: true,
  passwordStdin: false,
  printPassword: false,
  passwordOutputFile: "/tmp/password.txt",
  pm2Restart: "adhd-mcp",
  help: false,
});

{
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "mcp-password-reset-test-"));
  try {
    const authPath = path.join(tmpDir, "auth-secrets.json");
    const initialPassword = "initial password value";
    const initialHash = hashPassword(initialPassword, "initial-salt");
    const initialSecrets = {
      allowedEmail: "owner@example.com",
      passwordSalt: initialHash.passwordSalt,
      passwordHash: initialHash.passwordHash,
      sessionSecret: "session-secret",
      accessTokenSecret: "access-token-secret",
      refreshTokenSecret: "refresh-token-secret",
    };
    writeFileSync(authPath, `${JSON.stringify(initialSecrets, null, 2)}\n`, { mode: 0o600 });

    const report = resetPassword({
      authSecretsPath: authPath,
      password: "new password value that is long enough",
      now: new Date("2026-06-08T05:04:03Z"),
    });

    assert.equal(report.ok, true);
    assert.equal(report.backupPath, `${authPath}.backup-20260608050403`);
    assert.deepEqual(report.changedFields, ["passwordSalt", "passwordHash"]);
    assert.deepEqual(report.preservedFields, [
      "allowedEmail",
      "sessionSecret",
      "accessTokenSecret",
      "refreshTokenSecret",
    ]);

    const backup = JSON.parse(readFileSync(report.backupPath, "utf8"));
    assert.deepEqual(backup, initialSecrets);

    const updated = JSON.parse(readFileSync(authPath, "utf8"));
    assert.equal(updated.allowedEmail, initialSecrets.allowedEmail);
    assert.equal(updated.sessionSecret, initialSecrets.sessionSecret);
    assert.equal(updated.accessTokenSecret, initialSecrets.accessTokenSecret);
    assert.equal(updated.refreshTokenSecret, initialSecrets.refreshTokenSecret);
    assert.notEqual(updated.passwordSalt, initialSecrets.passwordSalt);
    assert.notEqual(updated.passwordHash, initialSecrets.passwordHash);
    assert.equal(verifyPassword("new password value that is long enough", updated), true);
    assert.equal(verifyPassword(initialPassword, updated), false);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

{
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "mcp-password-output-test-"));
  try {
    const passwordPath = path.join(tmpDir, "password.txt");
    const password = "generated-password-without-newline";
    const writtenPath = writePasswordOutputFile(passwordPath, password);
    assert.equal(writtenPath, passwordPath);
    assert.equal(readFileSync(passwordPath, "utf8"), password);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log("mcp oauth password reset tests passed");
