import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const serviceRoot = path.join(repoRoot, "services", "mcp-server");
const sourcePath = path.join(serviceRoot, "src", "index.js");
const captureClientPath = path.join(serviceRoot, "src", "capture-client.js");
const source = fs.readFileSync(sourcePath, "utf8");
const captureClientSource = fs.readFileSync(captureClientPath, "utf8");

assert.match(source, /app\.get\("\/change-password"/);
assert.match(source, /app\.post\("\/change-password"/);
assert.match(source, /FIRESTORE_DOCUMENT_ID \?\? process\.env\.FIRESTORE_USER_ID \?\? ""/);
assert.match(source, /from "\.\/capture-client\.js"/);
assert.doesNotMatch(source, /async function postPlannerCapture/);
assert.match(source, /PLANNER_CAPTURE_API_URL/);
assert.match(captureClientSource, /https:\/\/planner\.valquilty\.com\/api\/captures/);
assert.match(source, /server\.registerTool\(\s*"capture_note"/);
assert.match(source, /Dry-run is true by default/);
assert.match(source, /dryRun: dry_run !== false/);
assert.match(captureClientSource, /idempotency_key is required when dry_run=false/);
assert.match(captureClientSource, /dryRun: request\.body\.dryRun/);
assert.match(captureClientSource, /includeLiveTasks: request\.body\.includeLiveTasks/);
assert.match(captureClientSource, /activeTasksCount: request\.activeTasksCount/);
const knownLiveUserId = ["U2geUdbv", "WyVRNLWn", "SZBnftOMSU22"].join("");
assert.equal(source.includes(knownLiveUserId), false);

const forbiddenFiles = [
  "auth-secrets.json",
  "oauth-clients.json",
  "serviceAccountKey.json",
  ".mcp-oauth-password-latest",
  "telegram-nudge.log",
];

for (const fileName of forbiddenFiles) {
  assert.equal(
    fs.existsSync(path.join(serviceRoot, fileName)),
    false,
    `${fileName} must not be committed under services/mcp-server`,
  );
}

console.log("mcp server source tests passed");
