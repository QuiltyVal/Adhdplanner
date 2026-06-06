#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { getDb } = require("../api/_lib/firebase-admin");

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
    dryRun: hasFlag("--dry-run", argv),
    userId: String(userId),
    collections: parseCollections(getArgValue("--collections", argv)),
    maxDocs,
    outputArg: getArgValue("--out", argv),
  };
}

function buildOutputPath({ userId, outputArg, exportedAt, cwd = process.cwd() }) {
  const defaultFileName = `firestore-planner-${sanitizePathSegment(userId)}-${exportedAt.replace(/[:.]/g, "-")}.json`;
  return path.resolve(cwd, outputArg || path.join("backups", defaultFileName));
}

function buildBackupPlan({ options, exportedAt, cwd = process.cwd() }) {
  return {
    schema: "adhd-planner-firestore-export-v1",
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
    "  --dry-run",
    "",
    "This script is read-only. It does not write to Firestore.",
  ].join("\n");
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

async function main() {
  const options = parseBackupOptions();
  if (options.help) {
    console.log(getHelpText());
    return;
  }

  const exportedAt = new Date().toISOString();
  const plan = buildBackupPlan({ options, exportedAt });
  if (options.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      outputPath: plan.outputPath,
      userId: plan.userId,
      exportedAt,
      rootPath: plan.rootPath,
      collections: Object.fromEntries(plan.collections.map((collectionName) => [collectionName, "planned"])),
      maxDocs: plan.maxDocs || null,
    }, null, 2));
    return;
  }

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

  await fs.mkdir(path.dirname(plan.outputPath), { recursive: true });
  await fs.writeFile(plan.outputPath, `${JSON.stringify(exportData, null, 2)}\n`, "utf8");

  const collectionSummary = Object.fromEntries(
    Object.entries(exportData.collections).map(([collectionName, docs]) => [collectionName, docs.length]),
  );

  console.log(JSON.stringify({
    ok: true,
    outputPath: plan.outputPath,
    userId: plan.userId,
    exportedAt,
    collections: collectionSummary,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[backup:planner] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_COLLECTIONS,
  buildBackupPlan,
  buildOutputPath,
  getHelpText,
  normalizeFirestoreValue,
  parseBackupOptions,
  parseCollections,
  sanitizePathSegment,
};
