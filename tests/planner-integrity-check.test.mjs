import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPlannerIntegrityReport,
  buildPlannerIntegrityReportFromFile,
  buildSafetyMetadata,
  parsePlannerDeadline,
  parsePlannerIntegrityOptions,
} from "../scripts/check-planner-integrity.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "check-planner-integrity.mjs");
const userId = "user-1";

function taskDoc(id, data) {
  return {
    id,
    path: `Users/${userId}/tasks/${id}`,
    data: {
      id,
      text: `Task ${id}`,
      status: "active",
      subtasks: [],
      ...data,
    },
  };
}

function makeBackup(tasks) {
  return {
    schema: "adhd-planner-firestore-export-v1",
    exportedAt: "2026-06-10T10:00:00.000Z",
    userId,
    rootPath: `Users/${userId}`,
    root: { score: 521 },
    collections: {
      tasks,
    },
  };
}

const anomalousBackup = makeBackup([
  taskDoc("dead-missing-deadAt", {
    text: "Dead task without deadAt",
    status: "dead",
    deadAt: null,
  }),
  taskDoc("invalid-year", {
    text: "Deadline from bad extraction",
    deadlineAt: "0020-02-07",
  }),
  taskDoc("angel-dead", {
    text: "Angel pin left on dead task",
    status: "dead",
    deadAt: 1779744602935,
    angelPinned: true,
  }),
  taskDoc("stale-block", {
    text: "Wait for reply",
    blocked: {
      status: "not_your_move",
      nextCheckInAt: Date.parse("2026-06-09T08:00:00.000Z"),
    },
  }),
  taskDoc("overdue-vital", {
    text: "Overdue vital task",
    status: "active",
    deadlineAt: "2026-06-01",
    isVital: true,
  }),
  taskDoc("qa-active", {
    text: "QA smoke task",
    status: "active",
  }),
]);

const cleanBackup = makeBackup([
  taskDoc("dead-ok", {
    text: "Dead task with timestamp",
    status: "dead",
    deadAt: Date.parse("2026-06-01T08:00:00.000Z"),
  }),
  taskDoc("future-active", {
    text: "Future active task",
    status: "active",
    deadlineAt: "2026-07-01",
    isVital: true,
  }),
  taskDoc("qa-completed", {
    text: "QA smoke completed",
    status: "completed",
  }),
  taskDoc("blocked-future", {
    text: "Waiting but not stale",
    status: "active",
    blocked: {
      status: "not_your_move",
      nextCheckInAt: "2026-06-11T08:00:00.000Z",
    },
  }),
]);

{
  assert.equal(parsePlannerDeadline("").present, false);
  assert.equal(parsePlannerDeadline("2026-06-10").valid, true);

  const lowYear = parsePlannerDeadline("0020-02-07");
  assert.equal(lowYear.valid, false);
  assert.equal(lowYear.reason, "year_out_of_range");
  assert.equal(lowYear.year, 20);

  const unparsable = parsePlannerDeadline("not a date");
  assert.equal(unparsable.valid, false);
  assert.equal(unparsable.reason, "unparsable");
}

{
  assert.deepEqual(buildSafetyMetadata(), {
    mode: "local_planner_integrity_check",
    networkRead: false,
    firestoreRead: false,
    firestoreWrite: false,
    localFileRead: true,
    localFileWrite: false,
    liveDataMutation: false,
  });
}

{
  const report = buildPlannerIntegrityReport(anomalousBackup, {
    expectedUserId: userId,
    asOf: "2026-06-10T12:00:00.000Z",
  });

  assert.equal(report.ok, false);
  assert.equal(report.backup.taskCount, 6);
  assert.equal(report.summary.findingCount, 6);
  assert.deepEqual(report.summary.byType, {
    dead_task_without_deadAt: 1,
    invalid_deadlineAt: 1,
    angelPinned_on_non_active_task: 1,
    stale_not_your_move_block: 1,
    overdue_active_pressure_task: 1,
    qa_or_smoke_title_outside_completed: 1,
  });
  assert.equal(report.findings.find((finding) => finding.type === "invalid_deadlineAt").value, "0020-02-07");
  assert.match(report.nextAction, /Inspect findings/);
}

{
  const report = buildPlannerIntegrityReport(cleanBackup, {
    expectedUserId: userId,
    asOf: "2026-06-10T12:00:00.000Z",
  });

  assert.equal(report.ok, true);
  assert.equal(report.summary.findingCount, 0);
  assert.deepEqual(report.findings, []);
  assert.match(report.nextAction, /passed/);
}

{
  assert.throws(
    () => parsePlannerIntegrityOptions(["node", "script"]),
    /Provide --backup/,
  );

  const options = parsePlannerIntegrityOptions([
    "node",
    "script",
    "--backup",
    "backups/local.json",
    "--expectUserId",
    userId,
    "--asOf",
    "2026-06-10T12:00:00.000Z",
  ]);
  assert.equal(options.backupPath, path.resolve("backups/local.json"));
  assert.equal(options.expectedUserId, userId);
  assert.equal(options.asOf, "2026-06-10T12:00:00.000Z");
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-integrity-"));
  const backupPath = path.join(tmpDir, "backup.json");
  fs.writeFileSync(backupPath, `${JSON.stringify(anomalousBackup, null, 2)}\n`, "utf8");

  const report = buildPlannerIntegrityReportFromFile({
    backupPath,
    expectedUserId: userId,
    asOf: "2026-06-10T12:00:00.000Z",
  });
  assert.equal(report.source, backupPath);
  assert.equal(report.ok, false);

  let cliError = null;
  try {
    execFileSync("node", [
      scriptPath,
      "--backup",
      backupPath,
      "--expectUserId",
      userId,
      "--asOf",
      "2026-06-10T12:00:00.000Z",
    ], { encoding: "utf8", cwd: repoRoot });
  } catch (error) {
    cliError = error;
  }

  assert.ok(cliError, "CLI should exit non-zero when findings exist");
  const stdoutReport = JSON.parse(cliError.stdout);
  assert.equal(stdoutReport.ok, false);
  assert.equal(stdoutReport.summary.findingCount, 6);
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-integrity-clean-"));
  const backupPath = path.join(tmpDir, "backup.json");
  fs.writeFileSync(backupPath, `${JSON.stringify(cleanBackup, null, 2)}\n`, "utf8");

  const stdout = execFileSync("node", [
    scriptPath,
    "--backup",
    backupPath,
    "--expectUserId",
    userId,
    "--asOf",
    "2026-06-10T12:00:00.000Z",
  ], { encoding: "utf8", cwd: repoRoot });

  const stdoutReport = JSON.parse(stdout);
  assert.equal(stdoutReport.ok, true);
  assert.equal(stdoutReport.safety.firestoreRead, false);
  assert.equal(stdoutReport.safety.liveDataMutation, false);
}

console.log("planner integrity check tests passed");
