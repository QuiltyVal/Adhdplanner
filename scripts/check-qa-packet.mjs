#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_FRESHNESS_FIELDS = [
  "taskDataFingerprint",
  "latestTaskUpdatedAt",
  "latestTaskUpdatedTitle",
  "latestTaskUpdatedStatus",
  "latestTaskUpdatedSubtasks",
  "latestTaskUpdatedSubtaskPreview",
  "activeTaskPreview",
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

function normalizePath(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed === "-") return trimmed;
  return path.resolve(trimmed);
}

function parseQaPacketText(text = "") {
  const rawText = String(text || "");
  const fields = {};
  const occurrences = {};
  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const key = match[1];
    const value = match[2].trim();
    if (!occurrences[key]) occurrences[key] = [];
    occurrences[key].push(value);
    if (!Object.prototype.hasOwnProperty.call(fields, key)) fields[key] = value;
  }

  const latestTaskUpdatedSubtasks = fields.latestTaskUpdatedSubtasks &&
    /^-?\d+$/.test(fields.latestTaskUpdatedSubtasks)
    ? Number.parseInt(fields.latestTaskUpdatedSubtasks, 10)
    : null;
  const decisionTraceRows = fields.decisionTraceRows &&
    /^-?\d+$/.test(fields.decisionTraceRows)
    ? Number.parseInt(fields.decisionTraceRows, 10)
    : null;

  return {
    fields,
    occurrences,
    rawLength: rawText.length,
    lineCount: lines.length,
    summary: {
      capturedAt: fields.capturedAt || "",
      mode: fields.mode || "",
      liveQaReady: fields.liveQaReady || "",
      plannerBootstrapStatus: fields.plannerBootstrapStatus || "",
      plannerBootstrapReason: fields.plannerBootstrapReason || "",
      userId: fields.userId || "",
      active: fields.active || "",
      actionsToday: fields.actionsToday || "",
      mission: fields.mission || "",
      missionReason: fields.missionReason || "",
      taskDataFingerprint: fields.taskDataFingerprint || "",
      latestTaskUpdatedAt: fields.latestTaskUpdatedAt || "",
      latestTaskUpdatedTitle: fields.latestTaskUpdatedTitle || "",
      latestTaskUpdatedStatus: fields.latestTaskUpdatedStatus || "",
      latestTaskUpdatedSubtasks,
      latestTaskUpdatedSubtaskPreview: fields.latestTaskUpdatedSubtaskPreview || "",
      activeTaskPreview: fields.activeTaskPreview || "",
      decisionTraceFingerprint: fields.decisionTraceFingerprint || "",
      decisionTraceRows,
    },
  };
}

function includesExpectation(value = "", expected = "") {
  const expectedText = String(expected || "").trim();
  if (!expectedText) return true;
  return String(value || "").includes(expectedText);
}

function parseTimestampMs(value = "") {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildSafetyMetadata() {
  return {
    mode: "local_qa_packet_check",
    networkRead: false,
    firestoreRead: false,
    firestoreWrite: false,
    localFileRead: true,
    localFileWrite: false,
    liveDataMutation: false,
  };
}

function validateQaPacket(packet, options = {}) {
  const issues = [];
  const fields = packet?.fields || {};
  const summary = packet?.summary || {};

  if (!packet || packet.rawLength <= 0) {
    issues.push("packet_empty");
  }

  if (!options.allowGuest) {
    if (summary.mode !== "cloud-authenticated") {
      issues.push(`mode_not_cloud_authenticated:${summary.mode || "missing"}`);
    }
    if (summary.liveQaReady !== "yes") {
      issues.push(`live_qa_not_ready:${summary.liveQaReady || "missing"}`);
    }
  }

  for (const field of REQUIRED_FRESHNESS_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) {
      issues.push(`missing_field:${field}`);
    }
  }

  if (!summary.taskDataFingerprint || ["missing", "unknown", "none"].includes(summary.taskDataFingerprint)) {
    issues.push(`invalid_taskDataFingerprint:${summary.taskDataFingerprint || "missing"}`);
  }

  if (
    Object.prototype.hasOwnProperty.call(fields, "latestTaskUpdatedSubtasks") &&
    (!Number.isInteger(summary.latestTaskUpdatedSubtasks) || summary.latestTaskUpdatedSubtasks < 0)
  ) {
    issues.push(`invalid_latestTaskUpdatedSubtasks:${fields.latestTaskUpdatedSubtasks || "missing"}`);
  }

  if (options.expectTaskTitle && !includesExpectation(summary.latestTaskUpdatedTitle, options.expectTaskTitle)) {
    issues.push(`expected_task_title_not_found:${options.expectTaskTitle}`);
  }

  if (
    options.expectPlannerBootstrapStatus &&
    summary.plannerBootstrapStatus !== options.expectPlannerBootstrapStatus
  ) {
    issues.push(`expected_planner_bootstrap_status_not_found:${options.expectPlannerBootstrapStatus}`);
  }

  if (options.expectMission && !includesExpectation(summary.mission, options.expectMission)) {
    issues.push(`expected_mission_not_found:${options.expectMission}`);
  }

  if (options.expectMissionReason && !includesExpectation(summary.missionReason, options.expectMissionReason)) {
    issues.push(`expected_mission_reason_not_found:${options.expectMissionReason}`);
  }

  if (
    options.expectSubtaskPreview &&
    !includesExpectation(summary.latestTaskUpdatedSubtaskPreview, options.expectSubtaskPreview)
  ) {
    issues.push(`expected_subtask_preview_not_found:${options.expectSubtaskPreview}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    packet: summary,
    safety: buildSafetyMetadata(),
    nextAction: issues.length === 0
      ? "Use this packet as QA evidence, or compare it with another packet using --before/--after."
      : "Fix the packet source or rerun live QA before treating this as evidence.",
  };
}

function diffQaPackets(beforePacket, afterPacket, options = {}) {
  const beforeValidation = validateQaPacket(beforePacket, {
    allowGuest: options.allowGuest,
  });
  const afterValidation = validateQaPacket(afterPacket, {
    allowGuest: options.allowGuest,
    expectTaskTitle: options.expectTaskTitle,
    expectSubtaskPreview: options.expectSubtaskPreview,
    expectPlannerBootstrapStatus: options.expectPlannerBootstrapStatus,
    expectMission: options.expectMission,
    expectMissionReason: options.expectMissionReason,
  });

  const beforeFingerprint = beforePacket?.summary?.taskDataFingerprint || "";
  const afterFingerprint = afterPacket?.summary?.taskDataFingerprint || "";
  const beforeCapturedAt = beforePacket?.summary?.capturedAt || "";
  const afterCapturedAt = afterPacket?.summary?.capturedAt || "";
  const beforeCapturedAtMs = parseTimestampMs(beforeCapturedAt);
  const afterCapturedAtMs = parseTimestampMs(afterCapturedAt);
  const capturedAtOrder = Number.isFinite(beforeCapturedAtMs) && Number.isFinite(afterCapturedAtMs)
    ? afterCapturedAtMs > beforeCapturedAtMs
      ? "after_is_newer"
      : "after_not_newer"
    : "unknown";
  const fingerprintChanged = Boolean(beforeFingerprint && afterFingerprint && beforeFingerprint !== afterFingerprint);
  const fingerprintStable = Boolean(beforeFingerprint && afterFingerprint && beforeFingerprint === afterFingerprint);
  const issues = [
    ...beforeValidation.issues.map((issue) => `before:${issue}`),
    ...afterValidation.issues.map((issue) => `after:${issue}`),
  ];

  if (capturedAtOrder === "after_not_newer") {
    issues.push("captured_at_not_after");
  }

  if (options.expectStable) {
    if (!fingerprintStable) issues.push("fingerprint_not_stable");
  } else if (!fingerprintChanged) {
    issues.push("fingerprint_not_changed");
  }

  const beforeDecisionFingerprint = beforePacket?.summary?.decisionTraceFingerprint || "";
  const afterDecisionFingerprint = afterPacket?.summary?.decisionTraceFingerprint || "";
  const decisionFingerprintChanged = Boolean(
    beforeDecisionFingerprint &&
    afterDecisionFingerprint &&
    beforeDecisionFingerprint !== afterDecisionFingerprint,
  );
  const decisionFingerprintStable = Boolean(
    beforeDecisionFingerprint &&
    afterDecisionFingerprint &&
    beforeDecisionFingerprint === afterDecisionFingerprint,
  );

  if (options.expectDecisionStable && !decisionFingerprintStable) {
    issues.push("decision_fingerprint_not_stable");
  }

  return {
    ok: issues.length === 0,
    issues,
    comparison: {
      expectation: options.expectStable ? "stable_after_refresh" : "changed_after_write",
      before: beforePacket?.summary || {},
      after: afterPacket?.summary || {},
      capturedAtBefore: beforeCapturedAt,
      capturedAtAfter: afterCapturedAt,
      capturedAtOrder,
      fingerprintBefore: beforeFingerprint,
      fingerprintAfter: afterFingerprint,
      fingerprintChanged,
      fingerprintStable,
      decisionFingerprintBefore: beforeDecisionFingerprint,
      decisionFingerprintAfter: afterDecisionFingerprint,
      decisionFingerprintChanged,
      decisionFingerprintStable,
      expectDecisionStable: Boolean(options.expectDecisionStable),
      expectedTaskTitle: options.expectTaskTitle || "",
      expectedTaskTitleFound: includesExpectation(
        afterPacket?.summary?.latestTaskUpdatedTitle || "",
        options.expectTaskTitle || "",
      ),
      expectedPlannerBootstrapStatus: options.expectPlannerBootstrapStatus || "",
      expectedPlannerBootstrapStatusFound: options.expectPlannerBootstrapStatus
        ? afterPacket?.summary?.plannerBootstrapStatus === options.expectPlannerBootstrapStatus
        : true,
      expectedMission: options.expectMission || "",
      expectedMissionFound: includesExpectation(
        afterPacket?.summary?.mission || "",
        options.expectMission || "",
      ),
      expectedMissionReason: options.expectMissionReason || "",
      expectedMissionReasonFound: includesExpectation(
        afterPacket?.summary?.missionReason || "",
        options.expectMissionReason || "",
      ),
      expectedSubtaskPreview: options.expectSubtaskPreview || "",
      expectedSubtaskPreviewFound: includesExpectation(
        afterPacket?.summary?.latestTaskUpdatedSubtaskPreview || "",
        options.expectSubtaskPreview || "",
      ),
    },
    safety: buildSafetyMetadata(),
    nextAction: issues.length === 0
      ? "Record this diff as QA evidence."
      : "Do not close the smoke; rerun the browser packet capture or inspect the stale-state path.",
  };
}

function getHelpText() {
  return [
    "Usage:",
    "  npm run check:qa-packet -- --packet qa-after.txt",
    "  npm run check:qa-packet -- --before qa-before.txt --after qa-after.txt --expectTaskTitle \"QA MCP smoke\" --expectSubtaskPreview \"QA MCP subtask write\"",
    "  npm run check:qa-packet -- --before qa-after.txt --after qa-refresh.txt --expectStable",
    "",
    "Options:",
    "  --packet <file>                 Validate one copied QA packet.",
    "  --before <file> --after <file>  Compare two copied QA packets.",
    "  --expectStable                  Expect fingerprints to match, used for post-refresh stability proof.",
    "  --expectDecisionStable          Expect decisionTraceFingerprint to match when both packets include it.",
    "  --expectPlannerBootstrapStatus <status>",
    "                                  Require plannerBootstrapStatus in the after packet to exactly match status.",
    "  --expectMission <text>          Require mission in the after packet to include text.",
    "  --expectMissionReason <text>    Require missionReason in the after packet to include text.",
    "  --expectTaskTitle <text>        Require latestTaskUpdatedTitle in the after packet to include text.",
    "  --expectSubtaskPreview <text>   Require latestTaskUpdatedSubtaskPreview in the after packet to include text.",
    "  --allowGuest                    Do not require cloud-authenticated/liveQaReady=yes.",
    "",
    "This checker is local-only. It reads text files, does not use the network, and never reads or writes Firestore.",
  ].join("\n");
}

function parseQaPacketCheckOptions(argv = process.argv) {
  if (hasFlag("--help", argv)) return { help: true };

  const packetPath = normalizePath(getArgValue("--packet", argv));
  const beforePath = normalizePath(getArgValue("--before", argv));
  const afterPath = normalizePath(getArgValue("--after", argv));
  const hasPacket = Boolean(packetPath);
  const hasDiff = Boolean(beforePath || afterPath);

  if (hasPacket && hasDiff) {
    throw new Error("Use either --packet or --before/--after, not both.");
  }
  if (!hasPacket && !hasDiff) {
    throw new Error("Provide --packet <file> or --before <file> --after <file>.");
  }
  if (hasDiff && (!beforePath || !afterPath)) {
    throw new Error("Both --before and --after are required for diff mode.");
  }

  return {
    help: false,
    mode: hasPacket ? "packet" : "diff",
    packetPath,
    beforePath,
    afterPath,
    allowGuest: hasFlag("--allowGuest", argv),
    expectStable: hasFlag("--expectStable", argv),
    expectDecisionStable: hasFlag("--expectDecisionStable", argv),
    expectPlannerBootstrapStatus: getArgValue("--expectPlannerBootstrapStatus", argv),
    expectMission: getArgValue("--expectMission", argv),
    expectMissionReason: getArgValue("--expectMissionReason", argv),
    expectTaskTitle: getArgValue("--expectTaskTitle", argv),
    expectSubtaskPreview: getArgValue("--expectSubtaskPreview", argv),
  };
}

function readTextFile(filePath) {
  if (filePath === "-") {
    return fs.readFileSync(0, "utf8");
  }
  return fs.readFileSync(filePath, "utf8");
}

function buildQaPacketCheckReport(options = {}) {
  if (options.mode === "packet") {
    const packet = parseQaPacketText(readTextFile(options.packetPath));
    return {
      type: "qa_packet_validation",
      source: options.packetPath,
      ...validateQaPacket(packet, options),
    };
  }

  const beforePacket = parseQaPacketText(readTextFile(options.beforePath));
  const afterPacket = parseQaPacketText(readTextFile(options.afterPath));
  return {
    type: "qa_packet_diff",
    beforeSource: options.beforePath,
    afterSource: options.afterPath,
    ...diffQaPackets(beforePacket, afterPacket, options),
  };
}

async function main() {
  const options = parseQaPacketCheckOptions();
  if (options.help) {
    console.log(getHelpText());
    return;
  }

  const report = buildQaPacketCheckReport(options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(`[check:qa-packet] ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  REQUIRED_FRESHNESS_FIELDS,
  buildQaPacketCheckReport,
  buildSafetyMetadata,
  diffQaPackets,
  getHelpText,
  parseQaPacketCheckOptions,
  parseQaPacketText,
  validateQaPacket,
};
