import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  BACKUP_SCHEMA,
  DEFAULT_COLLECTIONS,
  buildBackupPlan,
  normalizeFirestoreValue,
  parseBackupOptions,
  parseCollections,
  sanitizePathSegment,
  validateBackupPayload,
  verifyBackupFile,
} = require("../scripts/export-firestore-planner.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

assert.ok(DEFAULT_COLLECTIONS.includes("tasks"), "default export should include tasks");
assert.ok(DEFAULT_COLLECTIONS.includes("plannerEvents"), "default export should include planner events");

assert.deepEqual(parseCollections("tasks, plannerEvents"), ["tasks", "plannerEvents"]);
assert.throws(() => parseCollections("tasks,../secrets"), /Invalid collection name/);
assert.throws(() => parseCollections(","), /At least one collection/);

assert.equal(sanitizePathSegment("user/id with spaces"), "user_id_with_spaces");

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--userId",
    "user-1",
    "--collections",
    "tasks,plannerEvents",
    "--maxDocs",
    "3",
    "--out",
    "backups/manual.json",
    "--dry-run",
  ], {});

  assert.equal(options.dryRun, true);
  assert.equal(options.userId, "user-1");
  assert.deepEqual(options.collections, ["tasks", "plannerEvents"]);
  assert.equal(options.maxDocs, 3);

  const plan = buildBackupPlan({
    options,
    exportedAt: "2026-06-06T08:00:00.000Z",
    cwd: "/tmp/planner",
  });
  assert.equal(plan.rootPath, "Users/user-1");
  assert.equal(plan.outputPath, "/tmp/planner/backups/manual.json");
}

assert.throws(
  () => parseBackupOptions(["node", "script", "--userId", "bad/user"], {}),
  /User id cannot contain/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--userId", "--dry-run"], {}),
  /Missing user id/,
);

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--verify-file",
    "backups/manual.json",
    "--expectUserId",
    "user-1",
  ], {});

  assert.equal(options.verifyFile, "backups/manual.json");
  assert.equal(options.expectedUserId, "user-1");
}

assert.throws(
  () => parseBackupOptions(["node", "script", "--verify-file", "backup.json", "--expectUserId", "bad/user"], {}),
  /Expected user id cannot contain/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--verify-file"], {}),
  /Missing backup file/,
);

{
  const fakeTimestamp = {
    toDate() {
      return new Date("2026-06-06T08:00:00.000Z");
    },
  };
  const fakeRef = {
    path: "Users/user-1/tasks/task-1",
    isEqual() {
      return false;
    },
  };

  assert.deepEqual(
    normalizeFirestoreValue({
      createdAt: fakeTimestamp,
      linkedRef: fakeRef,
      nested: [{ updatedAt: fakeTimestamp }],
    }),
    {
      createdAt: "2026-06-06T08:00:00.000Z",
      linkedRef: { __refPath: "Users/user-1/tasks/task-1" },
      nested: [{ updatedAt: "2026-06-06T08:00:00.000Z" }],
    },
  );
}

{
  const backupPayload = {
    schema: BACKUP_SCHEMA,
    exportedAt: "2026-06-06T08:00:00.000Z",
    userId: "user-1",
    rootPath: "Users/user-1",
    root: { displayName: "Planner user" },
    collections: {
      tasks: [
        {
          id: "task-1",
          path: "Users/user-1/tasks/task-1",
          data: { text: "Task" },
        },
      ],
      plannerEvents: [],
    },
  };

  assert.deepEqual(validateBackupPayload(backupPayload, { expectedUserId: "user-1" }), {
    schema: BACKUP_SCHEMA,
    userId: "user-1",
    rootPath: "Users/user-1",
    collections: {
      tasks: 1,
      plannerEvents: 0,
    },
    totalDocs: 1,
  });

  assert.throws(
    () => validateBackupPayload({ ...backupPayload, rootPath: "Users/other" }),
    /rootPath mismatch/,
  );
  assert.throws(
    () => validateBackupPayload({
      ...backupPayload,
      collections: {
        tasks: [{ id: "task-1", path: "Users/user-1/other/task-1", data: {} }],
      },
    }),
    /unexpected path/,
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-backup-test-"));
  const backupPath = path.join(tmpDir, "backup.json");
  fs.writeFileSync(backupPath, `${JSON.stringify(backupPayload, null, 2)}\n`, "utf8");

  const verification = await verifyBackupFile(backupPath, { expectedUserId: "user-1" });
  assert.equal(verification.outputPath, backupPath);
  assert.equal(verification.totalDocs, 1);
}

{
  const output = execFileSync("node", [
    "scripts/export-firestore-planner.js",
    "--userId",
    "user-1",
    "--collections",
    "tasks,plannerEvents",
    "--maxDocs",
    "3",
    "--dry-run",
  ], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    },
    encoding: "utf8",
  });

  const dryRun = JSON.parse(output);
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.userId, "user-1");
  assert.equal(dryRun.rootPath, "Users/user-1");
  assert.equal(dryRun.collections.tasks, "planned");
  assert.equal(dryRun.collections.plannerEvents, "planned");
  assert.equal(dryRun.maxDocs, 3);
  assert.match(dryRun.outputPath, /backups\/firestore-planner-user-1-/);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-backup-cli-test-"));
  const backupPath = path.join(tmpDir, "backup.json");
  fs.writeFileSync(backupPath, JSON.stringify({
    schema: BACKUP_SCHEMA,
    exportedAt: "2026-06-06T08:00:00.000Z",
    userId: "user-1",
    rootPath: "Users/user-1",
    root: {},
    collections: {
      tasks: [],
    },
  }), "utf8");

  const output = execFileSync("node", [
    "scripts/export-firestore-planner.js",
    "--verify-file",
    backupPath,
    "--expectUserId",
    "user-1",
  ], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    },
    encoding: "utf8",
  });

  const verification = JSON.parse(output);
  assert.equal(verification.ok, true);
  assert.equal(verification.verified, true);
  assert.equal(verification.userId, "user-1");
  assert.equal(verification.collections.tasks, 0);
}

console.log("firestore backup export tests passed");
