import assert from "node:assert/strict";
import {
  mergeTaskLists,
  mergeAuthoritativeTaskLists,
} from "../src/plannerTaskMerge.mjs";

const now = 1_000_000;
const sortTasks = (tasks) => [...tasks].sort((a, b) => (a.position || 0) - (b.position || 0));
const dedupeTasks = (tasks) => tasks;
const mergeOptions = { now, sortTasks, dedupeTasks };

{
  const merged = mergeTaskLists(
    [
      {
        id: "task-1",
        title: "Move me",
        status: "dead",
        position: 1,
        lastUpdated: 90,
        __pendingSyncAt: now - 100,
      },
    ],
    [
      {
        id: "task-1",
        title: "Move me",
        status: "active",
        position: 1,
        lastUpdated: 200,
      },
    ],
    mergeOptions,
  );

  assert.equal(merged[0].status, "dead");
}

{
  const merged = mergeAuthoritativeTaskLists(
    [
      {
        id: "task-1",
        title: "Move me",
        status: "dead",
        position: 1,
        lastUpdated: 90,
        __pendingSyncAt: now - 100,
      },
    ],
    [
      {
        id: "task-1",
        title: "Move me",
        status: "active",
        position: 1,
        lastUpdated: 200,
      },
    ],
    mergeOptions,
  );

  assert.equal(merged[0].status, "active");
}

{
  const merged = mergeTaskLists(
    [
      {
        id: "task-1",
        title: "Do not resurrect",
        status: "completed",
        position: 1,
        lastUpdated: 300,
        __pendingSyncAt: now - 100,
      },
    ],
    [
      {
        id: "task-1",
        title: "Do not resurrect",
        status: "dead",
        position: 1,
        lastUpdated: 200,
      },
    ],
    mergeOptions,
  );

  assert.equal(merged[0].status, "dead");
}

{
  const merged = mergeTaskLists(
    [
      {
        id: "task-1",
        title: "Old intent",
        status: "dead",
        position: 1,
        lastUpdated: 90,
        __pendingSyncAt: now - 30_000,
      },
    ],
    [
      {
        id: "task-1",
        title: "Old intent",
        status: "active",
        position: 1,
        lastUpdated: 200,
      },
    ],
    mergeOptions,
  );

  assert.equal(merged[0].status, "active");
}

{
  const merged = mergeTaskLists(
    [],
    [
      {
        id: "task-1",
        title: "Deleted locally",
        status: "completed",
        position: 1,
        lastUpdated: 200,
      },
    ],
    {
      ...mergeOptions,
      pendingDeletedTaskIds: new Map([["task-1", now - 100]]),
    },
  );

  assert.equal(merged.length, 0);
}

{
  const merged = mergeAuthoritativeTaskLists(
    [],
    [
      {
        id: "task-1",
        title: "Backend says it still exists",
        status: "completed",
        position: 1,
        lastUpdated: 200,
      },
    ],
    {
      ...mergeOptions,
      pendingDeletedTaskIds: new Map([["task-1", now - 100]]),
    },
  );

  assert.equal(merged.length, 1);
}

{
  const merged = mergeTaskLists(
    [
      {
        id: "task-1",
        title: "Intent says cemetery",
        status: "active",
        position: 1,
        lastUpdated: 90,
      },
    ],
    [
      {
        id: "task-1",
        title: "Intent says cemetery",
        status: "active",
        position: 1,
        lastUpdated: 200,
      },
    ],
    {
      ...mergeOptions,
      pendingTaskStatusIntents: new Map([["task-1", { status: "dead", at: now - 100 }]]),
    },
  );

  assert.equal(merged[0].status, "dead");
}

{
  const merged = mergeAuthoritativeTaskLists(
    [
      {
        id: "task-1",
        title: "Backend still wins",
        status: "dead",
        position: 1,
        lastUpdated: 90,
      },
    ],
    [
      {
        id: "task-1",
        title: "Backend still wins",
        status: "active",
        position: 1,
        lastUpdated: 200,
      },
    ],
    {
      ...mergeOptions,
      pendingTaskStatusIntents: new Map([["task-1", { status: "dead", at: now - 100 }]]),
    },
  );

  assert.equal(merged[0].status, "active");
}

console.log("planner client merge stability contract ok");
