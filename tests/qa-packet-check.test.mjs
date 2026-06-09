import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  diffQaPackets,
  parseQaPacketCheckOptions,
  parseQaPacketText,
  validateQaPacket,
} from "../scripts/check-qa-packet.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "check-qa-packet.mjs");

function makePacket({
  capturedAt = "2026-06-09T12:00:00.000Z",
  mode = "cloud-authenticated",
  liveQaReady = "yes",
  fingerprint = "fingerprint-before",
  latestTaskUpdatedAt = "2026-06-09T11:59:00.000Z",
  latestTaskUpdatedTitle = "Old task",
  latestTaskUpdatedStatus = "active",
  latestTaskUpdatedSubtasks = 1,
  latestTaskUpdatedSubtaskPreview = "Old step",
  activeTaskPreview = "Old task | Another task",
} = {}) {
  return [
    "ADHD Planner live QA packet",
    `capturedAt: ${capturedAt}`,
    "url: https://planner.valquilty.com/main",
    `mode: ${mode}`,
    `liveQaReady: ${liveQaReady}`,
    "stopReason: none",
    "userId: U2geUdbvWyVRNLWnSZBnftOMSU22",
    "active: 7",
    "actionsToday: 0",
    `taskDataFingerprint: ${fingerprint}`,
    `latestTaskUpdatedAt: ${latestTaskUpdatedAt}`,
    `latestTaskUpdatedTitle: ${latestTaskUpdatedTitle}`,
    `latestTaskUpdatedStatus: ${latestTaskUpdatedStatus}`,
    `latestTaskUpdatedSubtasks: ${latestTaskUpdatedSubtasks}`,
    `latestTaskUpdatedSubtaskPreview: ${latestTaskUpdatedSubtaskPreview}`,
    `activeTaskPreview: ${activeTaskPreview}`,
    "",
    "=== Decision trace ===",
    "mission: Existing task",
    "missionReason: hard_deadline",
    "",
  ].join("\n");
}

const beforePacketText = makePacket();
const afterPacketText = makePacket({
  capturedAt: "2026-06-09T12:02:00.000Z",
  fingerprint: "fingerprint-after",
  latestTaskUpdatedAt: "2026-06-09T12:01:45.000Z",
  latestTaskUpdatedTitle: "QA MCP smoke - delete after test",
  latestTaskUpdatedSubtasks: 2,
  latestTaskUpdatedSubtaskPreview: "QA MCP subtask write - delete after test",
  activeTaskPreview: "QA MCP smoke - delete after test | Old task",
});
const refreshPacketText = makePacket({
  capturedAt: "2026-06-09T12:04:00.000Z",
  fingerprint: "fingerprint-after",
  latestTaskUpdatedAt: "2026-06-09T12:01:45.000Z",
  latestTaskUpdatedTitle: "QA MCP smoke - delete after test",
  latestTaskUpdatedSubtasks: 2,
  latestTaskUpdatedSubtaskPreview: "QA MCP subtask write - delete after test",
  activeTaskPreview: "QA MCP smoke - delete after test | Old task",
});
const guestPacketText = makePacket({
  mode: "guest-or-local",
  liveQaReady: "no",
  fingerprint: "guest-fingerprint",
});

{
  const packet = parseQaPacketText(afterPacketText);
  assert.equal(packet.summary.mode, "cloud-authenticated");
  assert.equal(packet.summary.liveQaReady, "yes");
  assert.equal(packet.summary.taskDataFingerprint, "fingerprint-after");
  assert.equal(packet.summary.latestTaskUpdatedSubtasks, 2);
  assert.equal(packet.summary.latestTaskUpdatedTitle, "QA MCP smoke - delete after test");
}

{
  const packet = parseQaPacketText(afterPacketText);
  const report = validateQaPacket(packet, {
    expectTaskTitle: "QA MCP smoke",
    expectSubtaskPreview: "QA MCP subtask write",
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.issues, []);
  assert.equal(report.safety.networkRead, false);
  assert.equal(report.safety.firestoreWrite, false);
}

{
  const report = validateQaPacket(parseQaPacketText(guestPacketText));
  assert.equal(report.ok, false);
  assert.match(report.issues.join("\n"), /mode_not_cloud_authenticated/);
  assert.match(report.issues.join("\n"), /live_qa_not_ready/);

  const allowed = validateQaPacket(parseQaPacketText(guestPacketText), { allowGuest: true });
  assert.equal(allowed.ok, true);
}

{
  const missing = parseQaPacketText(afterPacketText.replace(/^latestTaskUpdatedSubtaskPreview:.*\n/m, ""));
  const report = validateQaPacket(missing);
  assert.equal(report.ok, false);
  assert.match(report.issues.join("\n"), /missing_field:latestTaskUpdatedSubtaskPreview/);
}

{
  const report = diffQaPackets(parseQaPacketText(beforePacketText), parseQaPacketText(afterPacketText), {
    expectTaskTitle: "QA MCP smoke",
    expectSubtaskPreview: "QA MCP subtask write",
  });

  assert.equal(report.ok, true);
  assert.equal(report.comparison.fingerprintChanged, true);
  assert.equal(report.comparison.fingerprintStable, false);
  assert.equal(report.comparison.expectedTaskTitleFound, true);
  assert.equal(report.comparison.expectedSubtaskPreviewFound, true);
}

{
  const report = diffQaPackets(parseQaPacketText(afterPacketText), parseQaPacketText(refreshPacketText), {
    expectStable: true,
  });

  assert.equal(report.ok, true);
  assert.equal(report.comparison.fingerprintChanged, false);
  assert.equal(report.comparison.fingerprintStable, true);
}

{
  const report = diffQaPackets(parseQaPacketText(beforePacketText), parseQaPacketText(afterPacketText), {
    expectStable: true,
  });

  assert.equal(report.ok, false);
  assert.match(report.issues.join("\n"), /fingerprint_not_stable/);
}

{
  const options = parseQaPacketCheckOptions([
    "node",
    "scripts/check-qa-packet.mjs",
    "--before",
    "qa-before.txt",
    "--after",
    "qa-after.txt",
    "--expectTaskTitle",
    "QA MCP smoke",
    "--expectSubtaskPreview=QA MCP subtask write",
  ]);

  assert.equal(options.mode, "diff");
  assert.equal(path.basename(options.beforePath), "qa-before.txt");
  assert.equal(path.basename(options.afterPath), "qa-after.txt");
  assert.equal(options.expectTaskTitle, "QA MCP smoke");
  assert.equal(options.expectSubtaskPreview, "QA MCP subtask write");
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-packet-check-"));
  try {
    const beforePath = path.join(tmpDir, "before.txt");
    const afterPath = path.join(tmpDir, "after.txt");
    const refreshPath = path.join(tmpDir, "refresh.txt");
    const guestPath = path.join(tmpDir, "guest.txt");
    fs.writeFileSync(beforePath, beforePacketText);
    fs.writeFileSync(afterPath, afterPacketText);
    fs.writeFileSync(refreshPath, refreshPacketText);
    fs.writeFileSync(guestPath, guestPacketText);

    const singleOutput = execFileSync(process.execPath, [
      scriptPath,
      "--packet",
      afterPath,
      "--expectTaskTitle",
      "QA MCP smoke",
      "--expectSubtaskPreview",
      "QA MCP subtask write",
    ], { encoding: "utf8" });
    const singleReport = JSON.parse(singleOutput);
    assert.equal(singleReport.ok, true);
    assert.equal(singleReport.type, "qa_packet_validation");

    const diffOutput = execFileSync(process.execPath, [
      scriptPath,
      "--before",
      beforePath,
      "--after",
      afterPath,
      "--expectTaskTitle",
      "QA MCP smoke",
      "--expectSubtaskPreview",
      "QA MCP subtask write",
    ], { encoding: "utf8" });
    const diffReport = JSON.parse(diffOutput);
    assert.equal(diffReport.ok, true);
    assert.equal(diffReport.comparison.fingerprintChanged, true);

    const stableOutput = execFileSync(process.execPath, [
      scriptPath,
      "--before",
      afterPath,
      "--after",
      refreshPath,
      "--expectStable",
    ], { encoding: "utf8" });
    const stableReport = JSON.parse(stableOutput);
    assert.equal(stableReport.ok, true);
    assert.equal(stableReport.comparison.fingerprintStable, true);

    assert.throws(
      () => {
        try {
          execFileSync(process.execPath, [scriptPath, "--packet", guestPath], { encoding: "utf8" });
        } catch (error) {
          assert.match(error.stdout, /mode_not_cloud_authenticated/);
          throw error;
        }
      },
      /Command failed/,
    );

    const guestOutput = execFileSync(process.execPath, [
      scriptPath,
      "--packet",
      guestPath,
      "--allowGuest",
    ], { encoding: "utf8" });
    const guestReport = JSON.parse(guestOutput);
    assert.equal(guestReport.ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log("qa packet check tests passed");
