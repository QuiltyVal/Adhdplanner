import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  BACKUP_SCHEMA,
  DEFAULT_COLLECTIONS,
  buildBackupComparison,
  buildBackupPreflightReport,
  buildBackupSafetyMetadata,
  buildBackupSafetyCheck,
  buildBackupPlan,
  buildFirebaseCredentialsPreflight,
  buildLatestRestorePlan,
  buildRestorePlan,
  listPlannerBackups,
  normalizeFirestoreValue,
  parseBackupOptions,
  parseCollections,
  prepareFirebaseCredentials,
  resolveFirebaseCredentialsRaw,
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

assert.deepEqual(buildBackupSafetyMetadata("dry-run"), {
  mode: "dry-run",
  firestoreRead: false,
  firestoreWrite: false,
  localFileRead: false,
  localFileWrite: false,
  verifiedReadback: false,
});
assert.deepEqual(buildBackupSafetyMetadata("preflight"), {
  mode: "preflight",
  firestoreRead: false,
  firestoreWrite: false,
  localFileRead: false,
  localFileWrite: false,
  verifiedReadback: false,
  credentialEnvRead: true,
  credentialFileRead: false,
});
assert.deepEqual(buildBackupSafetyMetadata("verify-file"), {
  mode: "verify-file",
  firestoreRead: false,
  firestoreWrite: false,
  localFileRead: true,
  localFileWrite: false,
  verifiedReadback: true,
});
assert.deepEqual(buildBackupSafetyMetadata("restore-plan"), {
  mode: "restore-plan",
  firestoreRead: false,
  firestoreWrite: false,
  localFileRead: true,
  localFileWrite: false,
  verifiedReadback: true,
  restorePlanOnly: true,
});
assert.deepEqual(buildBackupSafetyMetadata("restore-latest"), {
  mode: "restore-latest",
  firestoreRead: false,
  firestoreWrite: false,
  localFileRead: true,
  localFileWrite: false,
  verifiedReadback: true,
  restorePlanOnly: true,
});
assert.deepEqual(buildBackupSafetyMetadata("safety-check"), {
  mode: "safety-check",
  firestoreRead: false,
  firestoreWrite: false,
  localFileRead: true,
  localFileWrite: false,
  verifiedReadback: true,
});
assert.deepEqual(buildBackupSafetyMetadata("compare-backups"), {
  mode: "compare-backups",
  firestoreRead: false,
  firestoreWrite: false,
  localFileRead: true,
  localFileWrite: false,
  verifiedReadback: true,
});
assert.deepEqual(buildBackupSafetyMetadata("list-backups"), {
  mode: "list-backups",
  firestoreRead: false,
  firestoreWrite: false,
  localFileRead: true,
  localFileWrite: false,
  verifiedReadback: true,
});
assert.deepEqual(buildBackupSafetyMetadata("export"), {
  mode: "export",
  firestoreRead: true,
  firestoreWrite: false,
  localFileRead: true,
  localFileWrite: true,
  verifiedReadback: true,
});
assert.throws(() => buildBackupSafetyMetadata("delete"), /Unsupported backup safety mode/);

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
  assert.equal(options.preflight, false);
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

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--userId",
    "user-1",
    "--collections",
    "tasks,plannerEvents",
    "--preflight",
  ], {});

  assert.equal(options.dryRun, false);
  assert.equal(options.preflight, true);
  assert.equal(options.userId, "user-1");
  assert.deepEqual(options.collections, ["tasks", "plannerEvents"]);
}

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--userId",
    "user-1",
    "--credentials-file",
    "/tmp/service-account.json",
    "--preflight",
  ], {});

  assert.equal(options.credentialsFile, "/tmp/service-account.json");
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

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--restore-latest",
    "--expectUserId",
    "user-1",
  ], {});

  assert.equal(options.restoreLatestDir, "backups");
  assert.equal(options.expectedUserId, "user-1");
}

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--restore-latest",
    "custom-backups",
  ], {});

  assert.equal(options.restoreLatestDir, "custom-backups");
}

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--safety-check",
    "custom-backups",
    "--expectUserId",
    "user-1",
    "--maxBackupAgeHours",
    "24",
    "--minTotalDocs",
    "10",
    "--requireCollections",
    "tasks,plannerEvents",
  ], {});

  assert.equal(options.safetyCheckDir, "custom-backups");
  assert.equal(options.expectedUserId, "user-1");
  assert.equal(options.maxBackupAgeHours, 24);
  assert.equal(options.minTotalDocs, 10);
  assert.deepEqual(options.requiredCollections, ["tasks", "plannerEvents"]);
}

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--compare-backups",
    "before.json",
    "after.json",
    "--expectUserId",
    "user-1",
  ], {});

  assert.deepEqual(options.compareBackupFiles, ["before.json", "after.json"]);
  assert.equal(options.expectedUserId, "user-1");
}

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--compare-backups=before.json,after.json",
  ], {});

  assert.deepEqual(options.compareBackupFiles, ["before.json", "after.json"]);
}

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--restore-plan",
    "backups/manual.json",
    "--expectUserId",
    "user-1",
  ], {});

  assert.equal(options.restorePlanFile, "backups/manual.json");
  assert.equal(options.expectedUserId, "user-1");
}

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--list-backups",
    "--expectUserId",
    "user-1",
  ], {});

  assert.equal(options.listBackupsDir, "backups");
  assert.equal(options.expectedUserId, "user-1");
}

{
  const options = parseBackupOptions([
    "node",
    "scripts/export-firestore-planner.js",
    "--list-backups",
    "custom-backups",
  ], {});

  assert.equal(options.listBackupsDir, "custom-backups");
}

assert.throws(
  () => parseBackupOptions(["node", "script", "--verify-file", "backup.json", "--expectUserId", "bad/user"], {}),
  /Expected user id cannot contain/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--verify-file"], {}),
  /Missing backup file/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--restore-plan"], {}),
  /Missing backup file/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--userId", "user-1", "--dry-run", "--preflight"], {}),
  /either --dry-run or --preflight/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--verify-file", "backup.json", "--preflight"], {}),
  /either --verify-file or --preflight/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--restore-plan", "backup.json", "--preflight"], {}),
  /either --restore-plan or --preflight/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--verify-file", "backup.json", "--restore-plan", "backup.json"], {}),
  /either --verify-file or --restore-plan/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--list-backups", "--restore-plan", "backup.json"], {}),
  /Use only one of --list-backups/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--restore-latest", "--restore-plan", "backup.json"], {}),
  /Use only one of --restore-latest/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--safety-check", "--list-backups"], {}),
  /Use only one of --safety-check/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--compare-backups", "before.json"], {}),
  /Pass exactly two backup files/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--compare-backups", "before.json", "after.json", "--verify-file", "backup.json"], {}),
  /Use only one of --compare-backups/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--compare-backups", "before.json", "after.json", "--dry-run"], {}),
  /already non-mutating/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--safety-check", "--preflight"], {}),
  /either --safety-check or --preflight/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--safety-check", "--dry-run"], {}),
  /already non-mutating/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--safety-check", "--maxBackupAgeHours", "0"], {}),
  /must be a positive integer/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--safety-check", "--minTotalDocs", "0"], {}),
  /must be a positive integer/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--safety-check", "--minTotalDocs"], {}),
  /Missing minimum total docs/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--list-backups", "--minTotalDocs", "10"], {}),
  /only with --safety-check/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--verify-file", "backup.json", "--requireCollections", "tasks"], {}),
  /only with --safety-check/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--safety-check", "--requireCollections"], {}),
  /Missing required collections/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--safety-check", "--requireCollections", "tasks/secret"], {}),
  /Invalid collection name/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--restore-plan", "backup.json", "--dry-run"], {}),
  /already non-mutating/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--list-backups", "--dry-run"], {}),
  /already non-mutating/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--restore-latest", "--dry-run"], {}),
  /already non-mutating/,
);

{
  const missingCredentials = buildFirebaseCredentialsPreflight({});
  assert.equal(missingCredentials.ready, false);
  assert.equal(missingCredentials.source, "none");
  assert.equal(missingCredentials.present, false);
  assert.equal(missingCredentials.fileRequested, false);
  assert.equal(missingCredentials.fileReadable, false);
  assert.deepEqual(missingCredentials.issues, ["FIREBASE_CREDENTIALS is not set."]);

  const invalidCredentials = buildFirebaseCredentialsPreflight({ FIREBASE_CREDENTIALS: "private-key-fragment" });
  assert.equal(invalidCredentials.ready, false);
  assert.equal(invalidCredentials.source, "env");
  assert.equal(invalidCredentials.present, true);
  assert.equal(invalidCredentials.validJson, false);
  assert.deepEqual(invalidCredentials.issues, ["FIREBASE_CREDENTIALS is not valid JSON."]);
  assert.equal(JSON.stringify(invalidCredentials).includes("private-key-fragment"), false);

  const incompleteCredentials = buildFirebaseCredentialsPreflight({
    FIREBASE_CREDENTIALS: JSON.stringify({ project_id: "demo-project" }),
  });
  assert.equal(incompleteCredentials.ready, false);
  assert.equal(incompleteCredentials.source, "env");
  assert.equal(incompleteCredentials.validJson, true);
  assert.equal(incompleteCredentials.projectIdPresent, true);
  assert.equal(incompleteCredentials.clientEmailPresent, false);
  assert.equal(incompleteCredentials.privateKeyPresent, false);

  const validCredentials = buildFirebaseCredentialsPreflight({
    FIREBASE_CREDENTIALS: JSON.stringify({
      project_id: "demo-project",
      client_email: "firebase-admin@example.test",
      private_key: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
    }),
  });
  assert.deepEqual(validCredentials, {
    ready: true,
    source: "env",
    present: true,
    fileRequested: false,
    fileReadable: false,
    validJson: true,
    projectIdPresent: true,
    clientEmailPresent: true,
    privateKeyPresent: true,
    issues: [],
  });
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-credentials-file-test-"));
  try {
    const credentialsPath = path.join(tmpDir, "service-account.json");
    const credentialsJson = JSON.stringify({
      project_id: "demo-project",
      client_email: "firebase-admin@example.test",
      private_key: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
    });
    fs.writeFileSync(credentialsPath, credentialsJson, "utf8");

    assert.deepEqual(resolveFirebaseCredentialsRaw({}, { credentialsFile: credentialsPath }), {
      raw: credentialsJson,
      source: "file",
      fileRequested: true,
      fileReadable: true,
      issue: "",
    });

    const fileCredentials = buildFirebaseCredentialsPreflight({}, { credentialsFile: credentialsPath });
    assert.equal(fileCredentials.ready, true);
    assert.equal(fileCredentials.source, "file");
    assert.equal(fileCredentials.present, true);
    assert.equal(fileCredentials.fileRequested, true);
    assert.equal(fileCredentials.fileReadable, true);
    assert.equal(JSON.stringify(fileCredentials).includes(credentialsPath), false);
    assert.equal(JSON.stringify(fileCredentials).includes("firebase-admin@example.test"), false);

    const env = {};
    const prepared = prepareFirebaseCredentials(env, { credentialsFile: credentialsPath });
    assert.deepEqual(prepared, {
      source: "file",
      fileRequested: true,
      fileReadable: true,
    });
    assert.equal(env.FIREBASE_CREDENTIALS, credentialsJson);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

{
  const missingFileCredentials = buildFirebaseCredentialsPreflight({}, {
    credentialsFile: "/tmp/does-not-exist/service-account.json",
  });
  assert.equal(missingFileCredentials.ready, false);
  assert.equal(missingFileCredentials.source, "file");
  assert.equal(missingFileCredentials.present, false);
  assert.equal(missingFileCredentials.fileRequested, true);
  assert.equal(missingFileCredentials.fileReadable, false);
  assert.match(missingFileCredentials.issues[0], /Credentials file could not be read/);
  assert.equal(JSON.stringify(missingFileCredentials).includes("does-not-exist"), false);
}

{
  const plan = buildBackupPlan({
    options: {
      userId: "user-1",
      collections: ["tasks", "plannerEvents"],
      maxDocs: 3,
      outputPath: null,
    },
    exportedAt: "2026-06-06T08:00:00.000Z",
    cwd: "/tmp/planner",
  });

  const missingReport = buildBackupPreflightReport({ plan, env: {} });
  assert.equal(missingReport.ok, false);
  assert.equal(missingReport.preflight, true);
  assert.deepEqual(missingReport.safety, buildBackupSafetyMetadata("preflight"));
  assert.equal(missingReport.credentials.ready, false);
  assert.equal(missingReport.collections.tasks, "planned");

  const readyReport = buildBackupPreflightReport({
    plan,
    env: {
      FIREBASE_CREDENTIALS: JSON.stringify({
        project_id: "demo-project",
        client_email: "firebase-admin@example.test",
        private_key: "fake-private-key",
      }),
    },
  });
  assert.equal(readyReport.ok, true);
  assert.equal(readyReport.credentials.ready, true);
  assert.equal(readyReport.safety.credentialFileRead, false);
  assert.equal(JSON.stringify(readyReport).includes("fake-private-key"), false);
  assert.equal(JSON.stringify(readyReport).includes("firebase-admin@example.test"), false);
  assert.equal(JSON.stringify(readyReport).includes("demo-project"), false);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-preflight-file-report-test-"));
  try {
    const credentialsPath = path.join(tmpDir, "service-account.json");
    fs.writeFileSync(credentialsPath, JSON.stringify({
      project_id: "demo-project",
      client_email: "firebase-admin@example.test",
      private_key: "fake-private-key",
    }), "utf8");

    const plan = buildBackupPlan({
      options: {
        userId: "user-1",
        collections: ["tasks"],
        maxDocs: 0,
        outputPath: null,
      },
      exportedAt: "2026-06-06T08:00:00.000Z",
      cwd: "/tmp/planner",
    });
    const report = buildBackupPreflightReport({
      plan,
      env: {},
      credentialsFile: credentialsPath,
    });

    assert.equal(report.ok, true);
    assert.equal(report.safety.credentialFileRead, true);
    assert.equal(JSON.stringify(report).includes(credentialsPath), false);
    assert.equal(JSON.stringify(report).includes("fake-private-key"), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

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
    exportedAt: "2026-06-06T08:00:00.000Z",
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
  assert.equal(verification.sizeBytes, fs.statSync(backupPath).size);
  assert.equal(
    verification.fileSha256,
    createHash("sha256").update(fs.readFileSync(backupPath)).digest("hex"),
  );
  assert.match(verification.fileSha256, /^[a-f0-9]{64}$/);

  const restorePlan = await buildRestorePlan(backupPath, { expectedUserId: "user-1" });
  assert.equal(restorePlan.userId, "user-1");
  assert.equal(restorePlan.exportedAt, "2026-06-06T08:00:00.000Z");
  assert.equal(restorePlan.targetRootPath, "Users/user-1");
  assert.equal(restorePlan.plannedOperations.rootUserDocument.operation, "set_root_user_document");
  assert.equal(restorePlan.plannedOperations.collectionDocuments.total, 1);
  assert.deepEqual(restorePlan.plannedOperations.collectionDocuments.collections.tasks, {
    targetPath: "Users/user-1/tasks",
    documents: 1,
    operation: "set_each_document_by_id",
  });
  assert.match(restorePlan.warnings.join(" "), /does not write Firestore/);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-backup-compare-test-"));
  try {
    const beforePath = path.join(tmpDir, "before.json");
    const afterPath = path.join(tmpDir, "after.json");
    fs.writeFileSync(beforePath, JSON.stringify({
      schema: BACKUP_SCHEMA,
      exportedAt: "2026-06-08T10:00:00.000Z",
      userId: "user-1",
      rootPath: "Users/user-1",
      root: { displayName: "Before" },
      collections: {
        tasks: [
          {
            id: "task-1",
            path: "Users/user-1/tasks/task-1",
            data: { text: "Old task", nested: { b: 2, a: 1 } },
          },
          {
            id: "task-removed",
            path: "Users/user-1/tasks/task-removed",
            data: { text: "Removed" },
          },
        ],
        plannerEvents: [
          {
            id: "event-1",
            path: "Users/user-1/plannerEvents/event-1",
            data: { type: "same" },
          },
        ],
      },
    }), "utf8");
    fs.writeFileSync(afterPath, JSON.stringify({
      schema: BACKUP_SCHEMA,
      exportedAt: "2026-06-08T12:00:00.000Z",
      userId: "user-1",
      rootPath: "Users/user-1",
      root: { displayName: "After" },
      collections: {
        tasks: [
          {
            id: "task-1",
            path: "Users/user-1/tasks/task-1",
            data: { text: "New task", nested: { a: 1, b: 2 } },
          },
          {
            id: "task-added",
            path: "Users/user-1/tasks/task-added",
            data: { text: "Added" },
          },
        ],
        plannerEvents: [
          {
            id: "event-1",
            path: "Users/user-1/plannerEvents/event-1",
            data: { type: "same" },
          },
        ],
      },
    }), "utf8");

    const comparison = await buildBackupComparison(beforePath, afterPath, { expectedUserId: "user-1" });
    assert.equal(comparison.ok, true);
    assert.equal(comparison.compareBackups, true);
    assert.deepEqual(comparison.safety, buildBackupSafetyMetadata("compare-backups"));
    assert.equal(comparison.before.totalDocs, 3);
    assert.equal(comparison.after.totalDocs, 3);
    assert.equal(comparison.rootChanged, true);
    assert.deepEqual(comparison.totals, {
      beforeDocs: 3,
      afterDocs: 3,
      totalDocsDelta: 0,
      added: 1,
      removed: 1,
      changed: 1,
      unchanged: 1,
    });
    assert.deepEqual(comparison.collections.tasks, {
      before: 2,
      after: 2,
      added: 1,
      removed: 1,
      changed: 1,
    });
    assert.deepEqual(comparison.collections.plannerEvents, {
      before: 1,
      after: 1,
      added: 0,
      removed: 0,
      changed: 0,
    });
    assert.deepEqual(comparison.changePreview.added.shown, ["Users/user-1/tasks/task-added"]);
    assert.deepEqual(comparison.changePreview.removed.shown, ["Users/user-1/tasks/task-removed"]);
    assert.deepEqual(comparison.changePreview.changed.shown, ["Users/user-1/tasks/task-1"]);
    assert.equal(JSON.stringify(comparison).includes("New task"), false);

    const sameComparison = await buildBackupComparison(beforePath, beforePath, { expectedUserId: "user-1" });
    assert.equal(sameComparison.rootChanged, false);
    assert.equal(sameComparison.totals.added, 0);
    assert.equal(sameComparison.totals.removed, 0);
    assert.equal(sameComparison.totals.changed, 0);
    assert.equal(sameComparison.totals.unchanged, 3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-backup-list-test-"));
  try {
    const olderBackup = {
      schema: BACKUP_SCHEMA,
      exportedAt: "2026-06-06T08:00:00.000Z",
      userId: "user-1",
      rootPath: "Users/user-1",
      root: {},
      collections: {
        tasks: [],
      },
    };
    const newerBackup = {
      schema: BACKUP_SCHEMA,
      exportedAt: "2026-06-08T12:26:06.380Z",
      userId: "user-1",
      rootPath: "Users/user-1",
      root: {},
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
    fs.writeFileSync(path.join(tmpDir, "older.json"), `${JSON.stringify(olderBackup)}\n`, "utf8");
    fs.writeFileSync(path.join(tmpDir, "newer.json"), `${JSON.stringify(newerBackup)}\n`, "utf8");
    fs.writeFileSync(path.join(tmpDir, "broken.json"), "{bad json", "utf8");
    fs.writeFileSync(path.join(tmpDir, "notes.txt"), "ignore me", "utf8");

    const listed = await listPlannerBackups(tmpDir, { expectedUserId: "user-1" });
    assert.equal(listed.backupDir, tmpDir);
    assert.equal(listed.missingDirectory, false);
    assert.equal(listed.count, 3);
    assert.equal(listed.validCount, 2);
    assert.equal(listed.invalidCount, 1);
    assert.equal(listed.latest.fileName, "newer.json");
    assert.equal(listed.latest.totalDocs, 1);
    assert.equal(listed.latest.collections.tasks, 1);
    assert.match(listed.latest.fileSha256, /^[a-f0-9]{64}$/);
    assert.equal(listed.backups[2].valid, false);
    assert.match(listed.backups[2].issue, /not valid JSON/);

    const latestRestorePlan = await buildLatestRestorePlan(tmpDir, { expectedUserId: "user-1" });
    assert.equal(latestRestorePlan.restoreLatest, true);
    assert.equal(latestRestorePlan.selectedBackup.fileName, "newer.json");
    assert.equal(latestRestorePlan.selectedBackup.totalDocs, 1);
    assert.equal(latestRestorePlan.backupInventory.count, 3);
    assert.equal(latestRestorePlan.backupInventory.validCount, 2);
    assert.equal(latestRestorePlan.backupInventory.invalidCount, 1);
    assert.equal(latestRestorePlan.plannedOperations.collectionDocuments.collections.tasks.documents, 1);

    const safetyCheck = await buildBackupSafetyCheck(tmpDir, {
      expectedUserId: "user-1",
      now: new Date("2026-06-08T18:26:06.380Z"),
      maxBackupAgeHours: 12,
      minTotalDocs: 1,
      requiredCollections: ["tasks", "plannerEvents"],
    });
    assert.equal(safetyCheck.ok, true);
    assert.equal(safetyCheck.readyForRiskyQa, true);
    assert.equal(safetyCheck.latest.fileName, "newer.json");
    assert.equal(safetyCheck.latest.ageHours, 6);
    assert.equal(safetyCheck.latest.stale, false);
    assert.equal(safetyCheck.latest.totalDocs, 1);
    assert.deepEqual(safetyCheck.latest.collections, { tasks: 1, plannerEvents: 0 });
    assert.deepEqual(safetyCheck.requirements, {
      maxBackupAgeHours: 12,
      minTotalDocs: 1,
      requiredCollections: ["tasks", "plannerEvents"],
    });
    assert.equal(safetyCheck.validCount, 2);
    assert.equal(safetyCheck.invalidCount, 1);
    assert.match(safetyCheck.warnings.join(" "), /invalid backup/);

    const tooSmallSafetyCheck = await buildBackupSafetyCheck(tmpDir, {
      expectedUserId: "user-1",
      now: new Date("2026-06-08T18:26:06.380Z"),
      maxBackupAgeHours: 12,
      minTotalDocs: 2,
    });
    assert.equal(tooSmallSafetyCheck.ok, false);
    assert.equal(tooSmallSafetyCheck.readyForRiskyQa, false);
    assert.match(tooSmallSafetyCheck.blockers.join(" "), /below required minimum 2/);

    const missingCollectionSafetyCheck = await buildBackupSafetyCheck(tmpDir, {
      expectedUserId: "user-1",
      now: new Date("2026-06-08T18:26:06.380Z"),
      maxBackupAgeHours: 12,
      requiredCollections: ["tasks", "captures"],
    });
    assert.equal(missingCollectionSafetyCheck.ok, false);
    assert.equal(missingCollectionSafetyCheck.readyForRiskyQa, false);
    assert.match(missingCollectionSafetyCheck.blockers.join(" "), /missing required collection\(s\): captures/);

    const staleSafetyCheck = await buildBackupSafetyCheck(tmpDir, {
      expectedUserId: "user-1",
      now: new Date("2026-06-09T18:26:06.380Z"),
      maxBackupAgeHours: 12,
    });
    assert.equal(staleSafetyCheck.ok, false);
    assert.equal(staleSafetyCheck.readyForRiskyQa, false);
    assert.equal(staleSafetyCheck.latest.stale, true);
    assert.match(staleSafetyCheck.blockers.join(" "), /older than 12/);

    const missing = await listPlannerBackups(path.join(tmpDir, "missing"));
    assert.equal(missing.missingDirectory, true);
    assert.equal(missing.count, 0);
    assert.equal(missing.latest, null);
    const missingSafetyCheck = await buildBackupSafetyCheck(path.join(tmpDir, "missing"), {
      now: new Date("2026-06-08T18:26:06.380Z"),
    });
    assert.equal(missingSafetyCheck.ok, false);
    assert.equal(missingSafetyCheck.readyForRiskyQa, false);
    assert.match(missingSafetyCheck.blockers.join(" "), /No valid backup/);
    await assert.rejects(
      () => buildLatestRestorePlan(path.join(tmpDir, "missing")),
      /No valid backup files found/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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
  assert.deepEqual(dryRun.safety, buildBackupSafetyMetadata("dry-run"));
  assert.equal(dryRun.userId, "user-1");
  assert.equal(dryRun.rootPath, "Users/user-1");
  assert.equal(dryRun.collections.tasks, "planned");
  assert.equal(dryRun.collections.plannerEvents, "planned");
  assert.equal(dryRun.maxDocs, 3);
  assert.match(dryRun.outputPath, /backups\/firestore-planner-user-1-/);
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
    "--preflight",
  ], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      FIREBASE_CREDENTIALS: JSON.stringify({
        project_id: "demo-project",
        client_email: "firebase-admin@example.test",
        private_key: "fake-private-key",
      }),
    },
    encoding: "utf8",
  });

  const preflight = JSON.parse(output);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.preflight, true);
  assert.deepEqual(preflight.safety, buildBackupSafetyMetadata("preflight"));
  assert.equal(preflight.credentials.ready, true);
  assert.equal(preflight.credentials.projectIdPresent, true);
  assert.equal(preflight.credentials.clientEmailPresent, true);
  assert.equal(preflight.credentials.privateKeyPresent, true);
  assert.equal(preflight.userId, "user-1");
  assert.equal(preflight.rootPath, "Users/user-1");
  assert.equal(preflight.collections.tasks, "planned");
  assert.equal(preflight.collections.plannerEvents, "planned");
  assert.equal(preflight.maxDocs, 3);
  assert.match(preflight.outputPath, /backups\/firestore-planner-user-1-/);
  assert.equal(output.includes("fake-private-key"), false);
  assert.equal(output.includes("firebase-admin@example.test"), false);
  assert.equal(output.includes("demo-project"), false);
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
  assert.deepEqual(verification.safety, buildBackupSafetyMetadata("verify-file"));
  assert.equal(verification.userId, "user-1");
  assert.equal(verification.collections.tasks, 0);
  assert.equal(verification.sizeBytes, fs.statSync(backupPath).size);
  assert.match(verification.fileSha256, /^[a-f0-9]{64}$/);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-backup-restore-plan-cli-test-"));
  const backupPath = path.join(tmpDir, "backup.json");
  fs.writeFileSync(backupPath, JSON.stringify({
    schema: BACKUP_SCHEMA,
    exportedAt: "2026-06-06T08:00:00.000Z",
    userId: "user-1",
    rootPath: "Users/user-1",
    root: {},
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
  }), "utf8");

  const output = execFileSync("node", [
    "scripts/export-firestore-planner.js",
    "--restore-plan",
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

  const restorePlan = JSON.parse(output);
  assert.equal(restorePlan.ok, true);
  assert.equal(restorePlan.restorePlan, true);
  assert.deepEqual(restorePlan.safety, buildBackupSafetyMetadata("restore-plan"));
  assert.equal(restorePlan.userId, "user-1");
  assert.equal(restorePlan.plannedOperations.collectionDocuments.total, 1);
  assert.equal(restorePlan.plannedOperations.collectionDocuments.collections.tasks.documents, 1);
  assert.equal(restorePlan.plannedOperations.collectionDocuments.collections.plannerEvents.documents, 0);
  assert.match(restorePlan.warnings.join(" "), /does not write Firestore/);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-backup-compare-cli-test-"));
  const beforePath = path.join(tmpDir, "before.json");
  const afterPath = path.join(tmpDir, "after.json");
  fs.writeFileSync(beforePath, JSON.stringify({
    schema: BACKUP_SCHEMA,
    exportedAt: "2026-06-08T10:00:00.000Z",
    userId: "user-1",
    rootPath: "Users/user-1",
    root: {},
    collections: {
      tasks: [
        {
          id: "task-1",
          path: "Users/user-1/tasks/task-1",
          data: { text: "Task" },
        },
      ],
    },
  }), "utf8");
  fs.writeFileSync(afterPath, JSON.stringify({
    schema: BACKUP_SCHEMA,
    exportedAt: "2026-06-08T12:00:00.000Z",
    userId: "user-1",
    rootPath: "Users/user-1",
    root: {},
    collections: {
      tasks: [
        {
          id: "task-1",
          path: "Users/user-1/tasks/task-1",
          data: { text: "Task changed" },
        },
        {
          id: "task-2",
          path: "Users/user-1/tasks/task-2",
          data: { text: "Task added" },
        },
      ],
    },
  }), "utf8");

  const output = execFileSync("node", [
    "scripts/export-firestore-planner.js",
    "--compare-backups",
    beforePath,
    afterPath,
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

  const comparison = JSON.parse(output);
  assert.equal(comparison.ok, true);
  assert.equal(comparison.compareBackups, true);
  assert.deepEqual(comparison.safety, buildBackupSafetyMetadata("compare-backups"));
  assert.equal(comparison.totals.added, 1);
  assert.equal(comparison.totals.changed, 1);
  assert.equal(comparison.totals.removed, 0);
  assert.deepEqual(comparison.changePreview.added.shown, ["Users/user-1/tasks/task-2"]);
  assert.equal(output.includes("Task changed"), false);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-backup-list-cli-test-"));
  const backupPath = path.join(tmpDir, "backup.json");
  fs.writeFileSync(backupPath, JSON.stringify({
    schema: BACKUP_SCHEMA,
    exportedAt: "2026-06-08T12:26:06.380Z",
    userId: "user-1",
    rootPath: "Users/user-1",
    root: {},
    collections: {
      tasks: [
        {
          id: "task-1",
          path: "Users/user-1/tasks/task-1",
          data: { text: "Task" },
        },
      ],
    },
  }), "utf8");

  const output = execFileSync("node", [
    "scripts/export-firestore-planner.js",
    "--list-backups",
    tmpDir,
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

  const listed = JSON.parse(output);
  assert.equal(listed.ok, true);
  assert.equal(listed.listBackups, true);
  assert.deepEqual(listed.safety, buildBackupSafetyMetadata("list-backups"));
  assert.equal(listed.validCount, 1);
  assert.equal(listed.latest.fileName, "backup.json");
  assert.equal(listed.latest.userId, "user-1");
  assert.match(listed.latest.fileSha256, /^[a-f0-9]{64}$/);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-backup-restore-latest-cli-test-"));
  fs.writeFileSync(path.join(tmpDir, "older.json"), JSON.stringify({
    schema: BACKUP_SCHEMA,
    exportedAt: "2026-06-06T08:00:00.000Z",
    userId: "user-1",
    rootPath: "Users/user-1",
    root: {},
    collections: {
      tasks: [],
    },
  }), "utf8");
  fs.writeFileSync(path.join(tmpDir, "newer.json"), JSON.stringify({
    schema: BACKUP_SCHEMA,
    exportedAt: "2026-06-08T12:26:06.380Z",
    userId: "user-1",
    rootPath: "Users/user-1",
    root: {},
    collections: {
      tasks: [
        {
          id: "task-1",
          path: "Users/user-1/tasks/task-1",
          data: { text: "Task" },
        },
      ],
    },
  }), "utf8");

  const output = execFileSync("node", [
    "scripts/export-firestore-planner.js",
    "--restore-latest",
    tmpDir,
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

  const restorePlan = JSON.parse(output);
  assert.equal(restorePlan.ok, true);
  assert.equal(restorePlan.restorePlan, true);
  assert.equal(restorePlan.restoreLatest, true);
  assert.deepEqual(restorePlan.safety, buildBackupSafetyMetadata("restore-latest"));
  assert.equal(restorePlan.selectedBackup.fileName, "newer.json");
  assert.equal(restorePlan.backupInventory.validCount, 2);
  assert.equal(restorePlan.plannedOperations.collectionDocuments.total, 1);
  assert.equal(restorePlan.plannedOperations.collectionDocuments.collections.tasks.documents, 1);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-backup-safety-check-cli-test-"));
  fs.writeFileSync(path.join(tmpDir, "backup.json"), JSON.stringify({
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    userId: "user-1",
    rootPath: "Users/user-1",
    root: {},
    collections: {
      tasks: [
        {
          id: "task-1",
          path: "Users/user-1/tasks/task-1",
          data: { text: "Task" },
        },
      ],
    },
  }), "utf8");

  const output = execFileSync("node", [
    "scripts/export-firestore-planner.js",
    "--safety-check",
    tmpDir,
    "--expectUserId",
    "user-1",
    "--maxBackupAgeHours",
    "72",
    "--minTotalDocs",
    "1",
    "--requireCollections",
    "tasks",
  ], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    },
    encoding: "utf8",
  });

  const safetyCheck = JSON.parse(output);
  assert.equal(safetyCheck.ok, true);
  assert.equal(safetyCheck.safetyCheck, true);
  assert.equal(safetyCheck.readyForRiskyQa, true);
  assert.deepEqual(safetyCheck.safety, buildBackupSafetyMetadata("safety-check"));
  assert.equal(safetyCheck.validCount, 1);
  assert.deepEqual(safetyCheck.requirements, {
    maxBackupAgeHours: 72,
    minTotalDocs: 1,
    requiredCollections: ["tasks"],
  });
  assert.equal(safetyCheck.latest.fileName, "backup.json");
  assert.equal(safetyCheck.latest.stale, false);
  assert.match(safetyCheck.latest.fileSha256, /^[a-f0-9]{64}$/);
}

console.log("firestore backup export tests passed");
