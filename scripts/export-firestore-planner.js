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

function getArgValue(name) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return "";
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function sanitizePathSegment(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
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
  if (hasFlag("--help")) {
    console.log([
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
      "",
      "This script is read-only. It does not write to Firestore.",
    ].join("\n"));
    return;
  }

  const userId = getArgValue("--userId") || process.env.PLANNER_DEFAULT_USER_ID;
  if (!userId) {
    throw new Error("Missing user id. Pass --userId <uid> or set PLANNER_DEFAULT_USER_ID.");
  }

  const collectionsArg = getArgValue("--collections");
  const collections = collectionsArg
    ? collectionsArg.split(",").map((item) => item.trim()).filter(Boolean)
    : DEFAULT_COLLECTIONS;

  const maxDocsRaw = getArgValue("--maxDocs");
  const maxDocs = maxDocsRaw ? Number.parseInt(maxDocsRaw, 10) : 0;
  if (maxDocsRaw && (!Number.isFinite(maxDocs) || maxDocs <= 0)) {
    throw new Error("--maxDocs must be a positive integer.");
  }

  const db = getDb();
  const userRef = db.collection("Users").doc(String(userId));
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new Error(`Users/${userId} does not exist.`);
  }

  const exportedAt = new Date().toISOString();
  const exportData = {
    schema: "adhd-planner-firestore-export-v1",
    exportedAt,
    userId: String(userId),
    rootPath: userRef.path,
    root: normalizeFirestoreValue(userSnap.data() || {}),
    collections: {},
  };

  for (const collectionName of collections) {
    exportData.collections[collectionName] = await readCollection(userRef, collectionName, maxDocs);
  }

  const defaultFileName = `firestore-planner-${sanitizePathSegment(userId)}-${exportedAt.replace(/[:.]/g, "-")}.json`;
  const outputPath = path.resolve(process.cwd(), getArgValue("--out") || path.join("backups", defaultFileName));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(exportData, null, 2)}\n`, "utf8");

  const collectionSummary = Object.fromEntries(
    Object.entries(exportData.collections).map(([collectionName, docs]) => [collectionName, docs.length]),
  );

  console.log(JSON.stringify({
    ok: true,
    outputPath,
    userId: String(userId),
    exportedAt,
    collections: collectionSummary,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[backup:planner] ${error.message}`);
  process.exitCode = 1;
});
