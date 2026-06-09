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
  buildBackupPreflightReport,
  buildBackupSafetyMetadata,
  buildBackupPlan,
  buildFirebaseCredentialsPreflight,
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
  () => parseBackupOptions(["node", "script", "--restore-plan", "backup.json", "--dry-run"], {}),
  /already non-mutating/,
);
assert.throws(
  () => parseBackupOptions(["node", "script", "--list-backups", "--dry-run"], {}),
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

    const missing = await listPlannerBackups(path.join(tmpDir, "missing"));
    assert.equal(missing.missingDirectory, true);
    assert.equal(missing.count, 0);
    assert.equal(missing.latest, null);
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-backup-list-cli-test-"));
  const backupPath = path.join(tmpDir, "backup.json");
  fs.writeFileSync(backupPath, JSON.stringify({
    schema: BACKUP_SCHEMA,
    exportedAt: "2026-06-08T12:26:06.380Z",
    userId: "user-1",
    rootPath: "Users/user-1",
    root: {},
    collections: {
      tasks: [],
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

console.log("firestore backup export tests passed");
