#!/usr/bin/env node

const { createHash } = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { getDb } = require("../api/_lib/firebase-admin");

const BACKUP_SCHEMA = "adhd-planner-firestore-export-v1";

const DEFAULT_COLLECTIONS = [
  "tasks",
  "taskSnapshots",
  "captures",
  "commitments",
  "plannerEvents",
  "reportItems",
  "outbox",
  "engineRuns",
  "outboxRuns",
  "plannerCommands",
  "telegramLogs",
  "angelDecisions",
];

function getArgValue(name, argv = process.argv) {
  const direct = argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);

  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")) return argv[index + 1];
  return "";
}

function hasFlag(name, argv = process.argv) {
  return argv.includes(name);
}

function sanitizePathSegment(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

function parseCollections(collectionsArg) {
  const collections = collectionsArg
    ? collectionsArg.split(",").map((item) => item.trim()).filter(Boolean)
    : DEFAULT_COLLECTIONS;
  if (collections.length === 0) {
    throw new Error("At least one collection is required.");
  }

  const invalid = collections.find((collectionName) => !/^[a-zA-Z0-9_-]+$/.test(collectionName));
  if (invalid) {
    throw new Error(`Invalid collection name: ${invalid}`);
  }

  return collections;
}

function parseBackupOptions(argv = process.argv, env = process.env) {
  if (hasFlag("--help", argv)) {
    return { help: true };
  }

  const dryRun = hasFlag("--dry-run", argv);
  const preflight = hasFlag("--preflight", argv);
  if (dryRun && preflight) {
    throw new Error("Use either --dry-run or --preflight, not both.");
  }

  const verifyFile = getArgValue("--verify-file", argv);
  if (hasFlag("--verify-file", argv) && !verifyFile) {
    throw new Error("Missing backup file. Pass --verify-file <path>.");
  }
  if (verifyFile && preflight) {
    throw new Error("Use either --verify-file or --preflight, not both.");
  }
  if (verifyFile) {
    const expectedUserId = getArgValue("--expectUserId", argv);
    if (expectedUserId && String(expectedUserId).includes("/")) {
      throw new Error("Expected user id cannot contain '/'.");
    }

    return {
      help: false,
      dryRun: false,
      verifyFile,
      expectedUserId: expectedUserId ? String(expectedUserId) : "",
    };
  }

  const userId = getArgValue("--userId", argv) || env.PLANNER_DEFAULT_USER_ID;
  if (!userId) {
    throw new Error("Missing user id. Pass --userId <uid> or set PLANNER_DEFAULT_USER_ID.");
  }
  if (String(userId).includes("/")) {
    throw new Error("User id cannot contain '/'.");
  }

  const maxDocsRaw = getArgValue("--maxDocs", argv);
  const maxDocs = maxDocsRaw ? Number.parseInt(maxDocsRaw, 10) : 0;
  if (maxDocsRaw && (!Number.isFinite(maxDocs) || maxDocs <= 0)) {
    throw new Error("--maxDocs must be a positive integer.");
  }

  return {
    help: false,
    dryRun,
    preflight,
    userId: String(userId),
    collections: parseCollections(getArgValue("--collections", argv)),
    maxDocs,
    outputArg: getArgValue("--out", argv),
    credentialsFile:
      getArgValue("--credentials-file", argv)
      || env.FIREBASE_CREDENTIALS_FILE
      || env.GOOGLE_APPLICATION_CREDENTIALS
      || "",
  };
}

function buildOutputPath({ userId, outputArg, exportedAt, cwd = process.cwd() }) {
  const defaultFileName = `firestore-planner-${sanitizePathSegment(userId)}-${exportedAt.replace(/[:.]/g, "-")}.json`;
  return path.resolve(cwd, outputArg || path.join("backups", defaultFileName));
}

function buildBackupPlan({ options, exportedAt, cwd = process.cwd() }) {
  return {
    schema: BACKUP_SCHEMA,
    exportedAt,
    userId: options.userId,
    rootPath: `Users/${options.userId}`,
    outputPath: buildOutputPath({
      userId: options.userId,
      outputArg: options.outputArg,
      exportedAt,
      cwd,
    }),
    collections: options.collections,
    maxDocs: options.maxDocs,
  };
}

function getHelpText() {
  return [
    "Usage:",
    "  npm run backup:planner -- --userId <uid> [--out backups/file.json]",
    "",
    "Environment:",
    "  FIREBASE_CREDENTIALS must contain the Firebase service account JSON.",
    "  PLANNER_DEFAULT_USER_ID is used when --userId is omitted.",
    "",
    "Options:",
    "  --collections tasks,taskSnapshots,captures",
    "  --maxDocs 100",
    "  --credentials-file /path/to/serviceAccountKey.json",
    "  --dry-run",
    "  --preflight",
    "  --verify-file backups/file.json [--expectUserId <uid>]",
    "",
    "This script is read-only. It does not write to Firestore.",
  ].join("\n");
}

function buildBackupSafetyMetadata(mode) {
  switch (mode) {
    case "dry-run":
      return {
        mode,
        firestoreRead: false,
        firestoreWrite: false,
        localFileRead: false,
        localFileWrite: false,
        verifiedReadback: false,
      };
    case "preflight":
      return {
        mode,
        firestoreRead: false,
        firestoreWrite: false,
        localFileRead: false,
        localFileWrite: false,
        verifiedReadback: false,
        credentialEnvRead: true,
        credentialFileRead: false,
      };
    case "verify-file":
      return {
        mode,
        firestoreRead: false,
        firestoreWrite: false,
        localFileRead: true,
        localFileWrite: false,
        verifiedReadback: true,
      };
    case "export":
      return {
        mode,
        firestoreRead: true,
        firestoreWrite: false,
        localFileRead: true,
        localFileWrite: true,
        verifiedReadback: true,
      };
    default:
      throw new Error(`Unsupported backup safety mode: ${mode}`);
  }
}

function readCredentialsFile(filePath) {
  const safePath = String(filePath || "").trim();
  if (!safePath) {
    return {
      ok: false,
      raw: "",
      issue: "Credentials file path is empty.",
    };
  }

  try {
    return {
      ok: true,
      raw: fsSync.readFileSync(safePath, "utf8"),
    };
  } catch (error) {
    return {
      ok: false,
      raw: "",
      issue: `Credentials file could not be read: ${error.code || "UNKNOWN_ERROR"}`,
    };
  }
}

function resolveFirebaseCredentialsRaw(env = process.env, { credentialsFile = "" } = {}) {
  const envRaw = env.FIREBASE_CREDENTIALS;
  if (envRaw) {
    return {
      raw: envRaw,
      source: "env",
      fileRequested: false,
      fileReadable: false,
      issue: "",
    };
  }

  const filePath = credentialsFile || env.FIREBASE_CREDENTIALS_FILE || env.GOOGLE_APPLICATION_CREDENTIALS || "";
  if (!filePath) {
    return {
      raw: "",
      source: "none",
      fileRequested: false,
      fileReadable: false,
      issue: "FIREBASE_CREDENTIALS is not set.",
    };
  }

  const file = readCredentialsFile(filePath);
  return {
    raw: file.raw,
    source: "file",
    fileRequested: true,
    fileReadable: file.ok,
    issue: file.issue || "",
  };
}

function buildFirebaseCredentialsPreflight(env = process.env, options = {}) {
  const resolved = resolveFirebaseCredentialsRaw(env, options);
  const raw = resolved.raw;
  if (!raw) {
    return {
      ready: false,
      source: resolved.source,
      present: false,
      fileRequested: resolved.fileRequested,
      fileReadable: resolved.fileReadable,
      validJson: false,
      projectIdPresent: false,
      clientEmailPresent: false,
      privateKeyPresent: false,
      issues: [resolved.issue || "FIREBASE_CREDENTIALS is not set."],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ready: false,
      source: resolved.source,
      present: true,
      fileRequested: resolved.fileRequested,
      fileReadable: resolved.fileReadable,
      validJson: false,
      projectIdPresent: false,
      clientEmailPresent: false,
      privateKeyPresent: false,
      issues: ["FIREBASE_CREDENTIALS is not valid JSON."],
    };
  }

  const projectIdPresent = typeof parsed.project_id === "string" && parsed.project_id.trim().length > 0;
  const clientEmailPresent = typeof parsed.client_email === "string" && parsed.client_email.trim().length > 0;
  const privateKeyPresent = typeof parsed.private_key === "string" && parsed.private_key.trim().length > 0;
  const issues = [];
  if (!projectIdPresent) issues.push("FIREBASE_CREDENTIALS.project_id is missing.");
  if (!clientEmailPresent) issues.push("FIREBASE_CREDENTIALS.client_email is missing.");
  if (!privateKeyPresent) issues.push("FIREBASE_CREDENTIALS.private_key is missing.");

  return {
    ready: issues.length === 0,
    source: resolved.source,
    present: true,
    fileRequested: resolved.fileRequested,
    fileReadable: resolved.fileReadable,
    validJson: true,
    projectIdPresent,
    clientEmailPresent,
    privateKeyPresent,
    issues,
  };
}

function buildBackupPreflightReport({ plan, env = process.env, credentialsFile = "" } = {}) {
  if (!plan || typeof plan !== "object") {
    throw new Error("Backup plan is required for preflight.");
  }
  const credentials = buildFirebaseCredentialsPreflight(env, { credentialsFile });
  return {
    ok: credentials.ready,
    preflight: true,
    safety: {
      ...buildBackupSafetyMetadata("preflight"),
      credentialFileRead: Boolean(credentials.fileRequested && credentials.fileReadable),
    },
    outputPath: plan.outputPath,
    userId: plan.userId,
    rootPath: plan.rootPath,
    collections: Object.fromEntries(plan.collections.map((collectionName) => [collectionName, "planned"])),
    maxDocs: plan.maxDocs || null,
    credentials,
    nextAction: credentials.ready
      ? "Run the export command without --preflight to read Firestore and write a local backup file."
      : "Set FIREBASE_CREDENTIALS or pass --credentials-file with a Firebase service account JSON before running a live export.",
  };
}

function prepareFirebaseCredentials(env = process.env, { credentialsFile = "" } = {}) {
  const resolved = resolveFirebaseCredentialsRaw(env, { credentialsFile });
  if (!resolved.raw) {
    throw new Error(resolved.issue || "Firebase credentials are not configured.");
  }
  if (!env.FIREBASE_CREDENTIALS) {
    env.FIREBASE_CREDENTIALS = resolved.raw;
  }
  return {
    source: resolved.source,
    fileRequested: resolved.fileRequested,
    fileReadable: resolved.fileReadable,
  };
}

function normalizeFirestoreValue(value) {
  if (value === null || value === undefined) return value;

  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (typeof value.isEqual === "function" && value.path) {
    return { __refPath: value.path };
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFirestoreValue(item));
  }

  if (typeof value === "object") {
    const output = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = normalizeFirestoreValue(nestedValue);
    }
    return output;
  }

  return value;
}

async function readCollection(userRef, collectionName, maxDocs) {
  let query = userRef.collection(collectionName);
  if (Number.isFinite(maxDocs) && maxDocs > 0) {
    query = query.limit(maxDocs);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    path: doc.ref.path,
    data: normalizeFirestoreValue(doc.data() || {}),
  }));
}

function validateBackupPayload(payload, { expectedUserId = "" } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Backup file must contain a JSON object.");
  }
  if (payload.schema !== BACKUP_SCHEMA) {
    throw new Error(`Unsupported backup schema: ${payload.schema || "missing"}.`);
  }
  if (!payload.userId || typeof payload.userId !== "string") {
    throw new Error("Backup file is missing userId.");
  }
  if (expectedUserId && payload.userId !== expectedUserId) {
    throw new Error(`Backup userId mismatch: expected ${expectedUserId}, got ${payload.userId}.`);
  }
  if (payload.rootPath !== `Users/${payload.userId}`) {
    throw new Error(`Backup rootPath mismatch: expected Users/${payload.userId}.`);
  }
  if (!payload.root || typeof payload.root !== "object" || Array.isArray(payload.root)) {
    throw new Error("Backup file is missing root user document data.");
  }
  if (!payload.collections || typeof payload.collections !== "object" || Array.isArray(payload.collections)) {
    throw new Error("Backup file is missing collections.");
  }

  const collectionCounts = {};
  let totalDocs = 0;
  for (const [collectionName, docs] of Object.entries(payload.collections)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(collectionName)) {
      throw new Error(`Invalid collection name in backup: ${collectionName}`);
    }
    if (!Array.isArray(docs)) {
      throw new Error(`Backup collection ${collectionName} must be an array.`);
    }

    for (const doc of docs) {
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        throw new Error(`Backup collection ${collectionName} contains an invalid document.`);
      }
      if (!doc.id || typeof doc.id !== "string") {
        throw new Error(`Backup collection ${collectionName} contains a document without id.`);
      }
      const expectedPathPrefix = `Users/${payload.userId}/${collectionName}/`;
      if (!doc.path || typeof doc.path !== "string" || !doc.path.startsWith(expectedPathPrefix)) {
        throw new Error(`Backup document ${collectionName}/${doc.id} has an unexpected path.`);
      }
      if (!doc.data || typeof doc.data !== "object" || Array.isArray(doc.data)) {
        throw new Error(`Backup document ${collectionName}/${doc.id} is missing data.`);
      }
    }

    collectionCounts[collectionName] = docs.length;
    totalDocs += docs.length;
  }

  return {
    schema: payload.schema,
    userId: payload.userId,
    rootPath: payload.rootPath,
    collections: collectionCounts,
    totalDocs,
  };
}

async function verifyBackupFile(filePath, { expectedUserId = "", cwd = process.cwd() } = {}) {
  const outputPath = path.resolve(cwd, filePath);
  const fileBytes = await fs.readFile(outputPath);
  const raw = fileBytes.toString("utf8");
  const fileSha256 = createHash("sha256").update(fileBytes).digest("hex");
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Backup file is not valid JSON: ${error.message}`);
  }

  return {
    outputPath,
    sizeBytes: fileBytes.length,
    fileSha256,
    ...validateBackupPayload(payload, { expectedUserId }),
  };
}

async function main() {
  const options = parseBackupOptions();
  if (options.help) {
    console.log(getHelpText());
    return;
  }

  if (options.verifyFile) {
    const verification = await verifyBackupFile(options.verifyFile, {
      expectedUserId: options.expectedUserId,
    });
    console.log(JSON.stringify({
      ok: true,
      verified: true,
      safety: buildBackupSafetyMetadata("verify-file"),
      ...verification,
    }, null, 2));
    return;
  }

  const exportedAt = new Date().toISOString();
  const plan = buildBackupPlan({ options, exportedAt });
  if (options.preflight) {
    const preflightReport = buildBackupPreflightReport({
      plan,
      env: process.env,
      credentialsFile: options.credentialsFile,
    });
    console.log(JSON.stringify(preflightReport, null, 2));
    if (!preflightReport.ok) process.exitCode = 1;
    return;
  }

  if (options.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      safety: buildBackupSafetyMetadata("dry-run"),
      outputPath: plan.outputPath,
      userId: plan.userId,
      exportedAt,
      rootPath: plan.rootPath,
      collections: Object.fromEntries(plan.collections.map((collectionName) => [collectionName, "planned"])),
      maxDocs: plan.maxDocs || null,
    }, null, 2));
    return;
  }

  prepareFirebaseCredentials(process.env, { credentialsFile: options.credentialsFile });
  const db = getDb();
  const userRef = db.collection("Users").doc(plan.userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new Error(`${plan.rootPath} does not exist.`);
  }

  const exportData = {
    schema: plan.schema,
    exportedAt: plan.exportedAt,
    userId: plan.userId,
    rootPath: userRef.path,
    root: normalizeFirestoreValue(userSnap.data() || {}),
    collections: {},
  };

  for (const collectionName of plan.collections) {
    exportData.collections[collectionName] = await readCollection(userRef, collectionName, plan.maxDocs);
  }

  validateBackupPayload(exportData, { expectedUserId: plan.userId });

  await fs.mkdir(path.dirname(plan.outputPath), { recursive: true });
  await fs.writeFile(plan.outputPath, `${JSON.stringify(exportData, null, 2)}\n`, "utf8");

  const verification = await verifyBackupFile(plan.outputPath, { expectedUserId: plan.userId });

  console.log(JSON.stringify({
    ok: true,
    verified: true,
    safety: buildBackupSafetyMetadata("export"),
    outputPath: plan.outputPath,
    userId: plan.userId,
    exportedAt,
    sizeBytes: verification.sizeBytes,
    fileSha256: verification.fileSha256,
    collections: verification.collections,
    totalDocs: verification.totalDocs,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[backup:planner] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  BACKUP_SCHEMA,
  DEFAULT_COLLECTIONS,
  buildBackupPlan,
  buildOutputPath,
  buildBackupSafetyMetadata,
  buildBackupPreflightReport,
  buildFirebaseCredentialsPreflight,
  prepareFirebaseCredentials,
  resolveFirebaseCredentialsRaw,
  getHelpText,
  normalizeFirestoreValue,
  parseBackupOptions,
  parseCollections,
  sanitizePathSegment,
  validateBackupPayload,
  verifyBackupFile,
};
