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

function getArgPair(name, argv = process.argv) {
  const direct = argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) {
    const value = direct.slice(name.length + 1);
    const [first = "", second = ""] = value.split(",");
    return [first, second].map((item) => item.trim()).filter(Boolean);
  }

  const index = argv.indexOf(name);
  if (index < 0) return [];
  const first = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "";
  const second = argv[index + 2] && !argv[index + 2].startsWith("--") ? argv[index + 2] : "";
  return [first, second].filter(Boolean);
}

function hasFlag(name, argv = process.argv) {
  return argv.includes(name);
}

function hasOption(name, argv = process.argv) {
  return argv.includes(name) || argv.some((arg) => arg.startsWith(`${name}=`));
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
  const restorePlanFile = getArgValue("--restore-plan", argv);
  const listBackups = hasFlag("--list-backups", argv);
  const listBackupsDir = listBackups ? (getArgValue("--list-backups", argv) || "backups") : "";
  const restoreLatest = hasFlag("--restore-latest", argv);
  const restoreLatestDir = restoreLatest ? (getArgValue("--restore-latest", argv) || "backups") : "";
  const safetyCheck = hasFlag("--safety-check", argv);
  const safetyCheckDir = safetyCheck ? (getArgValue("--safety-check", argv) || "backups") : "";
  const compareBackups = hasFlag("--compare-backups", argv) || argv.some((arg) => arg.startsWith("--compare-backups="));
  const compareBackupFiles = compareBackups ? getArgPair("--compare-backups", argv) : [];
  const maxBackupAgeHoursRaw = getArgValue("--maxBackupAgeHours", argv);
  const maxBackupAgeHours = maxBackupAgeHoursRaw ? Number.parseInt(maxBackupAgeHoursRaw, 10) : 72;
  const minTotalDocsRaw = getArgValue("--minTotalDocs", argv);
  const minTotalDocs = minTotalDocsRaw ? Number.parseInt(minTotalDocsRaw, 10) : 0;
  const requireCollectionsArg = getArgValue("--requireCollections", argv);
  const minTotalDocsRequested = hasOption("--minTotalDocs", argv);
  const requireCollectionsRequested = hasOption("--requireCollections", argv);
  if (maxBackupAgeHoursRaw && (!Number.isFinite(maxBackupAgeHours) || maxBackupAgeHours <= 0)) {
    throw new Error("--maxBackupAgeHours must be a positive integer.");
  }
  if (minTotalDocsRequested && !minTotalDocsRaw) {
    throw new Error("Missing minimum total docs. Pass --minTotalDocs 1000.");
  }
  if (minTotalDocsRaw && (!Number.isFinite(minTotalDocs) || minTotalDocs <= 0)) {
    throw new Error("--minTotalDocs must be a positive integer.");
  }
  if (!safetyCheck && minTotalDocsRequested) {
    throw new Error("Use --minTotalDocs only with --safety-check.");
  }
  if (!safetyCheck && requireCollectionsRequested) {
    throw new Error("Use --requireCollections only with --safety-check.");
  }
  if (safetyCheck && requireCollectionsRequested && !requireCollectionsArg) {
    throw new Error("Missing required collections. Pass --requireCollections tasks,plannerEvents.");
  }
  if (compareBackups && compareBackupFiles.length !== 2) {
    throw new Error("Pass exactly two backup files: --compare-backups <before.json> <after.json>.");
  }
  if (hasFlag("--verify-file", argv) && !verifyFile) {
    throw new Error("Missing backup file. Pass --verify-file <path>.");
  }
  if (hasFlag("--restore-plan", argv) && !restorePlanFile) {
    throw new Error("Missing backup file. Pass --restore-plan <path>.");
  }
  if (verifyFile && restorePlanFile) {
    throw new Error("Use either --verify-file or --restore-plan, not both.");
  }
  if (listBackups && (verifyFile || restorePlanFile)) {
    throw new Error("Use only one of --list-backups, --verify-file, or --restore-plan.");
  }
  if (restoreLatest && (verifyFile || restorePlanFile || listBackups)) {
    throw new Error("Use only one of --restore-latest, --list-backups, --verify-file, or --restore-plan.");
  }
  if (safetyCheck && (verifyFile || restorePlanFile || listBackups || restoreLatest)) {
    throw new Error("Use only one of --safety-check, --restore-latest, --list-backups, --verify-file, or --restore-plan.");
  }
  if (compareBackups && (verifyFile || restorePlanFile || listBackups || restoreLatest || safetyCheck)) {
    throw new Error("Use only one of --compare-backups, --safety-check, --restore-latest, --list-backups, --verify-file, or --restore-plan.");
  }
  if (verifyFile && preflight) {
    throw new Error("Use either --verify-file or --preflight, not both.");
  }
  if (restorePlanFile && preflight) {
    throw new Error("Use either --restore-plan or --preflight, not both.");
  }
  if (listBackups && preflight) {
    throw new Error("Use either --list-backups or --preflight, not both.");
  }
  if (restoreLatest && preflight) {
    throw new Error("Use either --restore-latest or --preflight, not both.");
  }
  if (safetyCheck && preflight) {
    throw new Error("Use either --safety-check or --preflight, not both.");
  }
  if (compareBackups && preflight) {
    throw new Error("Use either --compare-backups or --preflight, not both.");
  }
  if ((verifyFile || restorePlanFile) && dryRun) {
    throw new Error("--verify-file and --restore-plan are already non-mutating; do not combine them with --dry-run.");
  }
  if (listBackups && dryRun) {
    throw new Error("--list-backups is already non-mutating; do not combine it with --dry-run.");
  }
  if (restoreLatest && dryRun) {
    throw new Error("--restore-latest is already non-mutating; do not combine it with --dry-run.");
  }
  if (safetyCheck && dryRun) {
    throw new Error("--safety-check is already non-mutating; do not combine it with --dry-run.");
  }
  if (compareBackups && dryRun) {
    throw new Error("--compare-backups is already non-mutating; do not combine it with --dry-run.");
  }
  if (verifyFile || restorePlanFile || listBackups || restoreLatest || safetyCheck || compareBackups) {
    const expectedUserId = getArgValue("--expectUserId", argv);
    if (expectedUserId && String(expectedUserId).includes("/")) {
      throw new Error("Expected user id cannot contain '/'.");
    }

    return {
      help: false,
      dryRun: false,
      verifyFile,
      restorePlanFile,
      listBackupsDir,
      restoreLatestDir,
      safetyCheckDir,
      compareBackupFiles,
      maxBackupAgeHours,
      minTotalDocs,
      requiredCollections: requireCollectionsArg ? parseCollections(requireCollectionsArg) : [],
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
    "  --list-backups [backups-dir] [--expectUserId <uid>]",
    "  --verify-file backups/file.json [--expectUserId <uid>]",
    "  --restore-plan backups/file.json [--expectUserId <uid>]",
    "  --restore-latest [backups-dir] [--expectUserId <uid>]",
    "  --safety-check [backups-dir] [--expectUserId <uid>] [--maxBackupAgeHours 72]",
    "  --safety-check [backups-dir] [--minTotalDocs 100] [--requireCollections tasks,plannerEvents]",
    "  --compare-backups before.json after.json [--expectUserId <uid>]",
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
    case "restore-plan":
      return {
        mode,
        firestoreRead: false,
        firestoreWrite: false,
        localFileRead: true,
        localFileWrite: false,
        verifiedReadback: true,
        restorePlanOnly: true,
      };
    case "restore-latest":
      return {
        mode,
        firestoreRead: false,
        firestoreWrite: false,
        localFileRead: true,
        localFileWrite: false,
        verifiedReadback: true,
        restorePlanOnly: true,
      };
    case "safety-check":
      return {
        mode,
        firestoreRead: false,
        firestoreWrite: false,
        localFileRead: true,
        localFileWrite: false,
        verifiedReadback: true,
      };
    case "compare-backups":
      return {
        mode,
        firestoreRead: false,
        firestoreWrite: false,
        localFileRead: true,
        localFileWrite: false,
        verifiedReadback: true,
      };
    case "list-backups":
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
  if (!payload.exportedAt || typeof payload.exportedAt !== "string") {
    throw new Error("Backup file is missing exportedAt.");
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
    exportedAt: payload.exportedAt,
    userId: payload.userId,
    rootPath: payload.rootPath,
    collections: collectionCounts,
    totalDocs,
  };
}

async function readVerifiedBackupPayload(filePath, { expectedUserId = "", cwd = process.cwd() } = {}) {
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
    payload,
    summary: validateBackupPayload(payload, { expectedUserId }),
  };
}

async function verifyBackupFile(filePath, { expectedUserId = "", cwd = process.cwd() } = {}) {
  const { payload, summary, ...file } = await readVerifiedBackupPayload(filePath, { expectedUserId, cwd });
  return {
    ...file,
    ...summary,
  };
}

function stableJsonStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableJsonStringify(nestedValue)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashBackupDocumentData(data) {
  return createHash("sha256").update(stableJsonStringify(data || {})).digest("hex");
}

function buildBackupDocumentIndex(payload) {
  const index = new Map();
  for (const [collectionName, docs] of Object.entries(payload.collections || {})) {
    for (const doc of docs || []) {
      const key = `${collectionName}/${doc.id}`;
      index.set(key, {
        key,
        collectionName,
        id: doc.id,
        path: doc.path,
        dataHash: hashBackupDocumentData(doc.data || {}),
      });
    }
  }
  return index;
}

function summarizeBackupForComparison(file, summary) {
  return {
    outputPath: file.outputPath,
    exportedAt: summary.exportedAt,
    userId: summary.userId,
    totalDocs: summary.totalDocs,
    fileSha256: file.fileSha256,
    collections: summary.collections,
  };
}

function buildChangePreview(paths, limit = 20) {
  const safePaths = paths.slice().sort();
  return {
    count: safePaths.length,
    shown: safePaths.slice(0, limit),
    truncated: safePaths.length > limit,
  };
}

async function buildBackupComparison(
  beforeFile,
  afterFile,
  { expectedUserId = "", cwd = process.cwd(), previewLimit = 20 } = {},
) {
  const before = await readVerifiedBackupPayload(beforeFile, { expectedUserId, cwd });
  const after = await readVerifiedBackupPayload(afterFile, { expectedUserId, cwd });
  if (before.summary.userId !== after.summary.userId) {
    throw new Error(`Backup userId mismatch: ${before.summary.userId} vs ${after.summary.userId}.`);
  }

  const beforeIndex = buildBackupDocumentIndex(before.payload);
  const afterIndex = buildBackupDocumentIndex(after.payload);
  const beforeKeys = new Set(beforeIndex.keys());
  const afterKeys = new Set(afterIndex.keys());
  const allCollections = new Set([
    ...Object.keys(before.summary.collections || {}),
    ...Object.keys(after.summary.collections || {}),
  ]);

  const added = [];
  const removed = [];
  const changed = [];
  let unchanged = 0;

  for (const [key, afterDoc] of afterIndex.entries()) {
    const beforeDoc = beforeIndex.get(key);
    if (!beforeDoc) {
      added.push(afterDoc.path);
    } else if (beforeDoc.dataHash !== afterDoc.dataHash) {
      changed.push(afterDoc.path);
    } else {
      unchanged += 1;
    }
  }
  for (const [key, beforeDoc] of beforeIndex.entries()) {
    if (!afterKeys.has(key)) {
      removed.push(beforeDoc.path);
    }
  }

  const collections = {};
  for (const collectionName of Array.from(allCollections).sort()) {
    const beforeCollectionDocs = Array.from(beforeIndex.values())
      .filter((doc) => doc.collectionName === collectionName);
    const afterCollectionDocs = Array.from(afterIndex.values())
      .filter((doc) => doc.collectionName === collectionName);
    const afterCollectionKeys = new Set(afterCollectionDocs.map((doc) => doc.key));
    const beforeCollectionKeys = new Set(beforeCollectionDocs.map((doc) => doc.key));
    collections[collectionName] = {
      before: beforeCollectionDocs.length,
      after: afterCollectionDocs.length,
      added: afterCollectionDocs.filter((doc) => !beforeCollectionKeys.has(doc.key)).length,
      removed: beforeCollectionDocs.filter((doc) => !afterCollectionKeys.has(doc.key)).length,
      changed: afterCollectionDocs.filter((doc) => {
        const beforeDoc = beforeIndex.get(doc.key);
        return Boolean(beforeDoc && beforeDoc.dataHash !== doc.dataHash);
      }).length,
    };
  }

  const beforeRootHash = hashBackupDocumentData(before.payload.root || {});
  const afterRootHash = hashBackupDocumentData(after.payload.root || {});

  return {
    ok: true,
    compareBackups: true,
    before: summarizeBackupForComparison(before, before.summary),
    after: summarizeBackupForComparison(after, after.summary),
    sameUserId: true,
    rootChanged: beforeRootHash !== afterRootHash,
    totals: {
      beforeDocs: before.summary.totalDocs,
      afterDocs: after.summary.totalDocs,
      totalDocsDelta: after.summary.totalDocs - before.summary.totalDocs,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged,
    },
    collections,
    changePreview: {
      added: buildChangePreview(added, previewLimit),
      removed: buildChangePreview(removed, previewLimit),
      changed: buildChangePreview(changed, previewLimit),
    },
    safety: buildBackupSafetyMetadata("compare-backups"),
    nextAction: added.length || removed.length || changed.length || beforeRootHash !== afterRootHash
      ? "Review the counts and path-only preview before deciding whether the backup delta is expected."
      : "Backups have the same root hash and document hashes.",
  };
}

async function buildRestorePlan(filePath, { expectedUserId = "", cwd = process.cwd() } = {}) {
  const { payload, summary, ...file } = await readVerifiedBackupPayload(filePath, { expectedUserId, cwd });
  const collections = {};
  for (const [collectionName, docs] of Object.entries(payload.collections)) {
    collections[collectionName] = {
      targetPath: `${payload.rootPath}/${collectionName}`,
      documents: docs.length,
      operation: "set_each_document_by_id",
    };
  }

  return {
    ...file,
    schema: summary.schema,
    exportedAt: summary.exportedAt,
    userId: summary.userId,
    rootPath: summary.rootPath,
    totalDocs: summary.totalDocs,
    targetRootPath: summary.rootPath,
    plannedOperations: {
      rootUserDocument: {
        targetPath: summary.rootPath,
        operation: "set_root_user_document",
      },
      collectionDocuments: {
        total: summary.totalDocs,
        collections,
      },
    },
    warnings: [
      "This command does not write Firestore.",
      "No restore apply command exists yet; use this as a review artifact before a separate confirmed restore path.",
      "This plan would set documents present in the backup; it does not plan deletion of documents absent from the backup.",
    ],
  };
}

async function listPlannerBackups(directory = "backups", { expectedUserId = "", cwd = process.cwd() } = {}) {
  const backupDir = path.resolve(cwd, directory || "backups");
  let entries;
  try {
    entries = await fs.readdir(backupDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        backupDir,
        missingDirectory: true,
        count: 0,
        validCount: 0,
        invalidCount: 0,
        latest: null,
        backups: [],
      };
    }
    throw error;
  }

  const backupFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(backupDir, entry.name));
  const backups = [];

  for (const filePath of backupFiles) {
    try {
      const verification = await verifyBackupFile(filePath, { expectedUserId, cwd });
      backups.push({
        fileName: path.basename(filePath),
        valid: true,
        ...verification,
      });
    } catch (error) {
      const stat = await fs.stat(filePath).catch(() => null);
      backups.push({
        fileName: path.basename(filePath),
        outputPath: filePath,
        valid: false,
        sizeBytes: stat?.size ?? null,
        issue: error.message,
      });
    }
  }

  backups.sort((left, right) => {
    if (left.valid !== right.valid) return left.valid ? -1 : 1;
    const leftTime = Date.parse(left.exportedAt || "") || 0;
    const rightTime = Date.parse(right.exportedAt || "") || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.fileName.localeCompare(right.fileName);
  });

  const validBackups = backups.filter((backup) => backup.valid);

  return {
    backupDir,
    missingDirectory: false,
    count: backups.length,
    validCount: validBackups.length,
    invalidCount: backups.length - validBackups.length,
    latest: validBackups[0] || null,
    backups,
  };
}

async function buildLatestRestorePlan(directory = "backups", { expectedUserId = "", cwd = process.cwd() } = {}) {
  const inventory = await listPlannerBackups(directory, { expectedUserId, cwd });
  if (!inventory.latest) {
    throw new Error(`No valid backup files found in ${inventory.backupDir}.`);
  }

  const restorePlan = await buildRestorePlan(inventory.latest.outputPath, { expectedUserId, cwd });

  return {
    ...restorePlan,
    restoreLatest: true,
    selectedBackup: {
      fileName: inventory.latest.fileName,
      outputPath: inventory.latest.outputPath,
      exportedAt: inventory.latest.exportedAt,
      fileSha256: inventory.latest.fileSha256,
      totalDocs: inventory.latest.totalDocs,
    },
    backupInventory: {
      backupDir: inventory.backupDir,
      count: inventory.count,
      validCount: inventory.validCount,
      invalidCount: inventory.invalidCount,
    },
  };
}

async function buildBackupSafetyCheck(
  directory = "backups",
  {
    expectedUserId = "",
    cwd = process.cwd(),
    now = new Date(),
    maxBackupAgeHours = 72,
    minTotalDocs = 0,
    requiredCollections = [],
  } = {},
) {
  if (!Number.isFinite(maxBackupAgeHours) || maxBackupAgeHours <= 0) {
    throw new Error("maxBackupAgeHours must be a positive number.");
  }
  if (!Number.isFinite(minTotalDocs) || minTotalDocs < 0) {
    throw new Error("minTotalDocs must be zero or a positive number.");
  }
  const requiredCollectionInput = Array.isArray(requiredCollections)
    ? requiredCollections
    : String(requiredCollections || "").split(",");
  const safeRequiredCollections = requiredCollectionInput.filter(Boolean).length > 0
    ? parseCollections(requiredCollectionInput.join(","))
    : [];

  const inventory = await listPlannerBackups(directory, { expectedUserId, cwd });
  const checkedAt = now.toISOString();
  const blockers = [];
  const warnings = [];
  let latest = null;

  if (!inventory.latest) {
    blockers.push(`No valid backup files found in ${inventory.backupDir}.`);
  } else {
    const exportedAtMs = Date.parse(inventory.latest.exportedAt || "");
    const checkedAtMs = now.getTime();
    const ageHours = Number.isFinite(exportedAtMs)
      ? Math.max(0, (checkedAtMs - exportedAtMs) / 3600000)
      : null;
    const stale = ageHours === null || ageHours > maxBackupAgeHours;
    latest = {
      fileName: inventory.latest.fileName,
      outputPath: inventory.latest.outputPath,
      exportedAt: inventory.latest.exportedAt,
      ageHours: ageHours === null ? null : Number(ageHours.toFixed(2)),
      stale,
      maxBackupAgeHours,
      userId: inventory.latest.userId,
      totalDocs: inventory.latest.totalDocs,
      sizeBytes: inventory.latest.sizeBytes,
      fileSha256: inventory.latest.fileSha256,
      collections: inventory.latest.collections,
    };

    if (stale) {
      blockers.push(`Latest backup is older than ${maxBackupAgeHours} hour(s).`);
    }
    if (minTotalDocs > 0 && inventory.latest.totalDocs < minTotalDocs) {
      blockers.push(`Latest backup has ${inventory.latest.totalDocs} document(s), below required minimum ${minTotalDocs}.`);
    }
    const missingRequiredCollections = safeRequiredCollections.filter(
      (collectionName) => !(collectionName in (inventory.latest.collections || {})),
    );
    if (missingRequiredCollections.length > 0) {
      blockers.push(`Latest backup is missing required collection(s): ${missingRequiredCollections.join(", ")}.`);
    }
  }

  if (inventory.missingDirectory) {
    blockers.push(`Backup directory is missing: ${inventory.backupDir}.`);
  }
  if (inventory.invalidCount > 0) {
    warnings.push(`${inventory.invalidCount} invalid backup file(s) were ignored.`);
  }

  const readyForRiskyQa = blockers.length === 0;
  return {
    ok: readyForRiskyQa,
    safetyCheck: true,
    readyForRiskyQa,
    checkedAt,
    backupDir: inventory.backupDir,
    validCount: inventory.validCount,
    invalidCount: inventory.invalidCount,
    requirements: {
      maxBackupAgeHours,
      minTotalDocs,
      requiredCollections: safeRequiredCollections,
    },
    latest,
    blockers,
    warnings,
    nextAction: readyForRiskyQa
      ? "Create a safety snapshot or QA packet, then proceed with the smallest risky step."
      : "Run a fresh read-only backup export before risky QA or migration work.",
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

  if (options.listBackupsDir) {
    const list = await listPlannerBackups(options.listBackupsDir, {
      expectedUserId: options.expectedUserId,
    });
    console.log(JSON.stringify({
      ok: true,
      listBackups: true,
      safety: buildBackupSafetyMetadata("list-backups"),
      ...list,
    }, null, 2));
    return;
  }

  if (options.restoreLatestDir) {
    const restorePlan = await buildLatestRestorePlan(options.restoreLatestDir, {
      expectedUserId: options.expectedUserId,
    });
    console.log(JSON.stringify({
      ok: true,
      restorePlan: true,
      restoreLatest: true,
      safety: buildBackupSafetyMetadata("restore-latest"),
      ...restorePlan,
    }, null, 2));
    return;
  }

  if (options.safetyCheckDir) {
    const safetyCheck = await buildBackupSafetyCheck(options.safetyCheckDir, {
      expectedUserId: options.expectedUserId,
      maxBackupAgeHours: options.maxBackupAgeHours,
      minTotalDocs: options.minTotalDocs,
      requiredCollections: options.requiredCollections,
    });
    console.log(JSON.stringify({
      safety: buildBackupSafetyMetadata("safety-check"),
      ...safetyCheck,
    }, null, 2));
    if (!safetyCheck.ok) process.exitCode = 1;
    return;
  }

  if (options.compareBackupFiles?.length === 2) {
    const comparison = await buildBackupComparison(options.compareBackupFiles[0], options.compareBackupFiles[1], {
      expectedUserId: options.expectedUserId,
    });
    console.log(JSON.stringify(comparison, null, 2));
    return;
  }

  if (options.restorePlanFile) {
    const restorePlan = await buildRestorePlan(options.restorePlanFile, {
      expectedUserId: options.expectedUserId,
    });
    console.log(JSON.stringify({
      ok: true,
      restorePlan: true,
      safety: buildBackupSafetyMetadata("restore-plan"),
      ...restorePlan,
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
  buildBackupSafetyCheck,
  buildBackupComparison,
  buildFirebaseCredentialsPreflight,
  buildLatestRestorePlan,
  buildRestorePlan,
  listPlannerBackups,
  prepareFirebaseCredentials,
  readVerifiedBackupPayload,
  resolveFirebaseCredentialsRaw,
  getHelpText,
  normalizeFirestoreValue,
  parseBackupOptions,
  parseCollections,
  sanitizePathSegment,
  validateBackupPayload,
  verifyBackupFile,
};
