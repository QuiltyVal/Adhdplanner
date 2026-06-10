#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { validateBackupPayload } = require("./export-firestore-planner.js");

const MIN_DEADLINE_YEAR = 2020;
const MAX_DEADLINE_YEAR = 2100;
const QA_TITLE_PATTERN = /(?:\bQA\s|тестов|smoke)/iu;
const COMPLETED_STATUS = "completed";

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

function normalizePath(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return path.resolve(trimmed);
}

function normalizeTaskTitle(task = {}) {
  return String(task.text || task.title || task.name || "").trim();
}

function parseTimestampMs(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePlannerDeadline(value) {
  if (value === null || value === undefined || value === "") {
    return { present: false, valid: true, value: "" };
  }

  const raw = typeof value === "string" ? value.trim() : value;
  const valueText = String(raw);
  const parsedMs = parseTimestampMs(raw);
  if (!Number.isFinite(parsedMs)) {
    return {
      present: true,
      valid: false,
      reason: "unparsable",
      value: valueText,
    };
  }

  const yearMatch = /^(\d{4})/.exec(valueText);
  const year = yearMatch
    ? Number.parseInt(yearMatch[1], 10)
    : new Date(parsedMs).getUTCFullYear();

  if (!Number.isInteger(year) || year < MIN_DEADLINE_YEAR || year > MAX_DEADLINE_YEAR) {
    return {
      present: true,
      valid: false,
      reason: "year_out_of_range",
      year,
      value: valueText,
    };
  }

  return {
    present: true,
    valid: true,
    year,
    value: valueText,
    parsedMs,
  };
}

function compareDateOnly(deadlineValue, asOfIso) {
  const deadlineText = String(deadlineValue || "").trim();
  const deadlineDate = /^(\d{4}-\d{2}-\d{2})/.exec(deadlineText)?.[1];
  const asOfDate = /^(\d{4}-\d{2}-\d{2})/.exec(String(asOfIso || ""))?.[1];
  if (!deadlineDate || !asOfDate) return null;
  return deadlineDate.localeCompare(asOfDate);
}

function isDeadlineOverdue(deadline, deadlineValue, asOfMs, asOfIso) {
  if (!deadline.present || !deadline.valid) return false;

  const dateOnlyComparison = compareDateOnly(deadlineValue, asOfIso);
  if (dateOnlyComparison !== null) return dateOnlyComparison < 0;

  return Number.isFinite(deadline.parsedMs) && deadline.parsedMs < asOfMs;
}

function buildSafetyMetadata() {
  return {
    mode: "local_planner_integrity_check",
    networkRead: false,
    firestoreRead: false,
    firestoreWrite: false,
    localFileRead: true,
    localFileWrite: false,
    liveDataMutation: false,
  };
}

function truncateValue(value, maxLength = 140) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function createFinding(type, doc, data, details = {}) {
  return {
    type,
    severity: "warning",
    collection: "tasks",
    taskId: doc.id,
    taskPath: doc.path,
    taskTitle: normalizeTaskTitle(data),
    status: data.status || "",
    ...details,
  };
}

function findPlannerIntegrityIssues(payload, { asOf = new Date().toISOString() } = {}) {
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs)) {
    throw new Error(`Invalid --asOf timestamp: ${asOf}`);
  }

  const findings = [];
  const tasks = payload.collections?.tasks || [];

  for (const doc of tasks) {
    const data = doc.data || {};
    const status = String(data.status || "");
    const title = normalizeTaskTitle(data);
    const deadline = parsePlannerDeadline(data.deadlineAt);

    if (status === "dead" && !data.deadAt) {
      findings.push(createFinding("dead_task_without_deadAt", doc, data, {
        field: "deadAt",
        message: "Dead task is missing deadAt; this matches the false-death signature.",
      }));
    }

    if (deadline.present && !deadline.valid) {
      findings.push(createFinding("invalid_deadlineAt", doc, data, {
        field: "deadlineAt",
        value: truncateValue(data.deadlineAt),
        reason: deadline.reason,
        year: Number.isInteger(deadline.year) ? deadline.year : null,
        message: "Task deadlineAt is unparsable or outside the supported 2020..2100 year range.",
      }));
    }

    if (data.angelPinned === true && status !== "active") {
      findings.push(createFinding("angelPinned_on_non_active_task", doc, data, {
        field: "angelPinned",
        value: true,
        message: "Angel pin should not remain true on non-active tasks.",
      }));
    }

    if (
      data.blocked &&
      data.blocked.status === "not_your_move" &&
      parseTimestampMs(data.blocked.nextCheckInAt) !== null &&
      parseTimestampMs(data.blocked.nextCheckInAt) < asOfMs
    ) {
      findings.push(createFinding("stale_not_your_move_block", doc, data, {
        field: "blocked.nextCheckInAt",
        value: truncateValue(data.blocked.nextCheckInAt),
        message: "Not-your-move block has a nextCheckInAt in the past.",
      }));
    }

    if (
      status === "active" &&
      (data.isVital === true || data.angelPinned === true) &&
      isDeadlineOverdue(deadline, data.deadlineAt, asOfMs, asOf)
    ) {
      findings.push(createFinding("overdue_active_pressure_task", doc, data, {
        field: "deadlineAt",
        value: truncateValue(data.deadlineAt),
        isVital: data.isVital === true,
        angelPinned: data.angelPinned === true,
        message: "Active vital/angel-pinned task has an overdue deadline.",
      }));
    }

    if (title && QA_TITLE_PATTERN.test(title) && status !== COMPLETED_STATUS) {
      findings.push(createFinding("qa_or_smoke_title_outside_completed", doc, data, {
        field: "text",
        value: truncateValue(title),
        message: "QA/test/smoke marker remains outside completed status.",
      }));
    }
  }

  return findings;
}

function summarizeFindings(findings = []) {
  const byType = {};
  for (const finding of findings) {
    byType[finding.type] = (byType[finding.type] || 0) + 1;
  }
  return {
    findingCount: findings.length,
    byType,
  };
}

function buildPlannerIntegrityReport(payload, options = {}) {
  const backup = validateBackupPayload(payload, { expectedUserId: options.expectedUserId || "" });
  const asOf = options.asOf || new Date().toISOString();
  const findings = findPlannerIntegrityIssues(payload, { asOf });

  return {
    ok: findings.length === 0,
    type: "planner_integrity_check",
    asOf,
    backup: {
      schema: backup.schema,
      exportedAt: backup.exportedAt,
      userId: backup.userId,
      rootPath: backup.rootPath,
      taskCount: backup.collections.tasks || 0,
      totalDocs: backup.totalDocs,
    },
    summary: summarizeFindings(findings),
    findings,
    safety: buildSafetyMetadata(),
    nextAction: findings.length === 0
      ? "Backup passed planner integrity checks."
      : "Inspect findings before risky QA, restore, migration, or web-refresh verification.",
  };
}

function readBackupJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function buildPlannerIntegrityReportFromFile(options = {}) {
  const payload = readBackupJson(options.backupPath);
  return {
    source: options.backupPath,
    ...buildPlannerIntegrityReport(payload, options),
  };
}

function getHelpText() {
  return [
    "Usage:",
    "  npm run check:planner-integrity -- --backup backups/firestore-planner-user.json --expectUserId <uid>",
    "",
    "Options:",
    "  --backup <file>       Local backup JSON generated by npm run backup:planner.",
    "  --expectUserId <uid>  Require the backup userId to match.",
    "  --asOf <iso>          Override the clock used for overdue/stale checks.",
    "",
    "This checker is local-only. It reads one backup JSON file, does not use the network, and never reads or writes Firestore.",
  ].join("\n");
}

function parsePlannerIntegrityOptions(argv = process.argv) {
  if (hasFlag("--help", argv)) return { help: true };

  const backupPath = normalizePath(getArgValue("--backup", argv));
  if (!backupPath) {
    throw new Error("Provide --backup <file>.");
  }

  return {
    help: false,
    backupPath,
    expectedUserId: getArgValue("--expectUserId", argv),
    asOf: getArgValue("--asOf", argv),
  };
}

async function main() {
  const options = parsePlannerIntegrityOptions();
  if (options.help) {
    console.log(getHelpText());
    return;
  }

  const report = buildPlannerIntegrityReportFromFile(options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(`[check:planner-integrity] ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  MAX_DEADLINE_YEAR,
  MIN_DEADLINE_YEAR,
  buildPlannerIntegrityReport,
  buildPlannerIntegrityReportFromFile,
  buildSafetyMetadata,
  findPlannerIntegrityIssues,
  getHelpText,
  parsePlannerDeadline,
  parsePlannerIntegrityOptions,
};
