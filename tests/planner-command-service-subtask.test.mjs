import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class FakeDocSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this._data = data;
    this.exists = typeof data !== "undefined";
  }

  data() {
    return clone(this._data);
  }
}

class FakeDocRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").pop();
  }

  collection(name) {
    return new FakeCollectionRef(this.db, `${this.path}/${name}`);
  }
}

class FakeCollectionRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").pop();
  }

  doc(id) {
    const docId = id || `auto-${this.db.autoId += 1}`;
    return new FakeDocRef(this.db, `${this.path}/${docId}`);
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
  }

  async get(ref) {
    return new FakeDocSnapshot(ref, this.db.get(ref.path));
  }

  set(ref, data, options = {}) {
    this.db.set(ref.path, data, options);
    this.db.writes.push({ path: ref.path, data: clone(data), options: clone(options) });
  }

  delete(ref) {
    this.db.store.delete(ref.path);
    this.db.writes.push({ path: ref.path, deleted: true });
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.store = new Map(Object.entries(seed).map(([key, value]) => [key, clone(value)]));
    this.writes = [];
    this.autoId = 0;
  }

  collection(name) {
    return new FakeCollectionRef(this, name);
  }

  async runTransaction(callback) {
    return callback(new FakeTransaction(this));
  }

  get(path) {
    return clone(this.store.get(path));
  }

  set(path, data, options = {}) {
    const next = options?.merge
      ? { ...(this.store.get(path) || {}), ...clone(data) }
      : clone(data);
    this.store.set(path, next);
  }

  collectionDocs(prefix) {
    return Array.from(this.store.entries())
      .filter(([path]) => path.startsWith(`${prefix}/`))
      .map(([path, data]) => ({ path, data: clone(data) }));
  }
}

let fakeDb;

const firebaseAdminPath = require.resolve("../api/_lib/firebase-admin.js");
require.cache[firebaseAdminPath] = {
  id: firebaseAdminPath,
  filename: firebaseAdminPath,
  loaded: true,
  exports: {
    admin: {
      firestore: {
        FieldValue: {
          serverTimestamp: () => ({ __serverTimestamp: true }),
          increment: (value) => ({ __increment: value }),
        },
      },
    },
    getDb: () => fakeDb,
  },
};

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const plannerStorePath = require.resolve("../api/_lib/planner-store.js");
require.cache[plannerStorePath] = {
  id: plannerStorePath,
  filename: plannerStorePath,
  loaded: true,
  exports: {
    buildTelegramContext: (task, action) => ({
      action,
      taskId: String(task?.id || ""),
      taskText: String(task?.text || ""),
    }),
    createTask: (text) => ({ text: String(text || "") }),
    escapeHtml,
    getDeadlineInfo: () => ({ hasDeadline: false }),
    getNonActiveTasks: async () => [],
    getPlannerData: async (userId) => ({
      tasks: fakeDb
        .collectionDocs(`Users/${userId}/tasks`)
        .map((entry) => entry.data),
    }),
  },
};

const { runPlannerCommand } = require("../api/_lib/planner-command-service.js");
const { PLANNER_COMMAND_TYPES } = require("../api/_lib/planner-command-types.js");
const { PLANNER_EVENT_TYPES } = require("../api/_lib/planner-event-types.js");

fakeDb = new FakeDb({
  "Users/user-1": { score: 0 },
  "Users/user-1/tasks/task-1": {
    id: "task-1",
    text: "QA MCP smoke",
    normalizedTitle: "qa mcp smoke",
    status: "active",
    subtasks: [],
    heatBase: 35,
    heatCurrent: 35,
    lastUpdated: 100,
  },
});

const firstNow = 1780700000000;
const firstResult = await runPlannerCommand({
  userId: "user-1",
  actor: { type: "agent", ref: "mcp" },
  now: firstNow,
  command: {
    type: PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK,
    taskId: "task-1",
    subtaskText: "QA MCP subtask write",
    source: "mcp_live_smoke",
  },
});

assert.equal(firstResult.ok, true);
assert.equal(firstResult.outcome, "updated");
assert.equal(firstResult.createdSubtask.id, "task-1-sub-1780700000000-1");
assert.equal(firstResult.createdSubtask.text, "QA MCP subtask write");
assert.equal(firstResult.createdSubtask.completed, false);

const updatedTask = fakeDb.get("Users/user-1/tasks/task-1");
assert.equal(updatedTask.lastUpdated, firstNow);
assert.equal(updatedTask.subtasks.length, 1);
assert.equal(updatedTask.subtasks[0].text, "QA MCP subtask write");
assert.equal(updatedTask.activeDays.length, 1);

const userRoot = fakeDb.get("Users/user-1");
assert.deepEqual(userRoot.telegramContext, {
  action: "add_subtask",
  taskId: "task-1",
  taskText: "QA MCP smoke",
});

const eventId = "task_subtask_added_task-1_1780700000000";
const event = fakeDb.get(`Users/user-1/plannerEvents/${eventId}`);
assert.equal(event.event_type, PLANNER_EVENT_TYPES.TASK_SUBTASK_ADDED);
assert.equal(event.command_type, PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK);
assert.equal(event.actor_type, "agent");
assert.equal(event.actor_ref, "mcp");
assert.equal(event.source, "mcp_live_smoke");
assert.equal(event.payload.extra.createdSubtask.id, "task-1-sub-1780700000000-1");
assert.equal(event.payload.extra.createdSubtask.text, "QA MCP subtask write");

const titleIndexWrites = fakeDb.collectionDocs("Users/user-1/taskTitleIndex");
assert.equal(titleIndexWrites.length, 1);
assert.equal(titleIndexWrites[0].data.taskId, "task-1");
assert.equal(titleIndexWrites[0].data.status, "active");

const secondResult = await runPlannerCommand({
  userId: "user-1",
  actor: { type: "agent", ref: "mcp" },
  now: firstNow + 1,
  command: {
    type: PLANNER_COMMAND_TYPES.TASK_ADD_SUBTASK,
    taskId: "task-1",
    subtaskText: "QA MCP subtask write",
    source: "mcp_live_smoke",
  },
});

assert.equal(secondResult.ok, true);
assert.equal(secondResult.outcome, "noop");
assert.equal(secondResult.eventId, null);
assert.equal(fakeDb.get("Users/user-1/tasks/task-1").subtasks.length, 1);
assert.equal(fakeDb.collectionDocs("Users/user-1/plannerEvents").length, 1);

console.log("planner command service subtask tests passed");
