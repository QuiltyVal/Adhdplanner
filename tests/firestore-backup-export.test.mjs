import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  DEFAULT_COLLECTIONS,
  buildBackupPlan,
  normalizeFirestoreValue,
  parseBackupOptions,
  parseCollections,
  sanitizePathSegment,
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

console.log("firestore backup export tests passed");
