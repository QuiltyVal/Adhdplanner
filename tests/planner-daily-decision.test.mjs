import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DAILY_DECISION_OVERRIDE_RULES,
  buildDailyDecisionChangedEventSpec,
  selectDailyDecision,
} = require("../api/_lib/planner-daily-decision.js");
const { PLANNER_EVENT_TYPES } = require("../api/_lib/planner-event-types.js");

const NOW = Date.parse("2026-06-10T10:00:00.000Z");
const NEXT_DAY = Date.parse("2026-06-11T10:00:00.000Z");

function task(id, extra = {}) {
  return {
    id,
    text: extra.text || id,
    status: extra.status || "active",
    heatBase: extra.heatBase ?? 40,
    heatCurrent: extra.heatCurrent ?? extra.heatBase ?? 40,
    lastUpdated: extra.lastUpdated ?? NOW,
    urgency: extra.urgency || "medium",
    resistance: extra.resistance || "medium",
    isToday: Boolean(extra.isToday),
    isVital: Boolean(extra.isVital),
    angelPinned: Boolean(extra.angelPinned),
    deadlineAt: extra.deadlineAt || "",
    subtasks: extra.subtasks || [],
    blocked: extra.blocked,
  };
}

function stored(overrides = {}) {
  return {
    dateKey: "2026-06-10",
    missionTaskId: "mission",
    missionReason: "critical_priority",
    rescueTaskId: "rescue",
    decidedAt: NOW - 1000,
    source: "new",
    ...overrides,
  };
}

{
  const decision = selectDailyDecision({
    tasks: [
      task("mission", { isVital: true, heatCurrent: 10 }),
      task("rescue", { heatCurrent: 5 }),
      task("hotter-after-edit", { heatCurrent: 99, lastUpdated: NOW + 500 }),
    ],
    existingDecision: stored(),
    now: NOW,
  });

  assert.equal(decision.source, "reused");
  assert.equal(decision.dateKey, "2026-06-10");
  assert.equal(decision.missionTaskId, "mission");
  assert.equal(decision.missionReason, "critical_priority");
  assert.equal(decision.rescueTaskId, "rescue");
  assert.equal(decision.decidedAt, NOW - 1000);
}

{
  const decision = selectDailyDecision({
    tasks: [
      task("mission", { isVital: true }),
      task("new-day-mission", { isToday: true }),
    ],
    existingDecision: stored(),
    now: NEXT_DAY,
  });

  assert.equal(decision.source, "new");
  assert.equal(decision.dateKey, "2026-06-11");
  assert.equal(decision.decidedAt, NEXT_DAY);
}

{
  const decision = selectDailyDecision({
    tasks: [
      task("mission", { isVital: true }),
      task("deadline", { deadlineAt: "2026-06-10" }),
    ],
    existingDecision: stored({ rescueTaskId: "rescue" }),
    now: NOW,
  });

  assert.equal(decision.source, `override:${DAILY_DECISION_OVERRIDE_RULES.HARD_DEADLINE_NEW}`);
  assert.equal(decision.missionTaskId, "deadline");
  assert.equal(decision.missionReason, "hard_deadline");
}

{
  const decision = selectDailyDecision({
    tasks: [
      task("mission", { isVital: true }),
      task("legacy-bad-deadline", { deadlineAt: "0020-02-07" }),
    ],
    existingDecision: stored({ rescueTaskId: "rescue" }),
    now: NOW,
  });

  assert.equal(decision.source, "reused");
  assert.equal(decision.missionTaskId, "mission");
}

{
  const decision = selectDailyDecision({
    tasks: [
      task("mission", { status: "completed", isVital: true }),
      task("replacement", { isVital: true }),
    ],
    existingDecision: stored(),
    now: NOW,
  });

  assert.equal(decision.source, `override:${DAILY_DECISION_OVERRIDE_RULES.MISSION_TASK_GONE}`);
  assert.equal(decision.missionTaskId, "replacement");
}

{
  const decision = selectDailyDecision({
    tasks: [
      task("mission", { status: "dead", isVital: true }),
      task("replacement", { isVital: true }),
    ],
    existingDecision: stored(),
    now: NOW,
  });

  assert.equal(decision.source, `override:${DAILY_DECISION_OVERRIDE_RULES.MISSION_TASK_GONE}`);
  assert.equal(decision.missionTaskId, "replacement");
}

{
  const decision = selectDailyDecision({
    tasks: [
      task("mission", {
        isVital: true,
        blocked: {
          status: "not_your_move",
          nextCheckInAt: NOW - 1000,
        },
      }),
      task("replacement", { isVital: true }),
    ],
    existingDecision: stored(),
    now: NOW,
  });

  assert.equal(decision.source, `override:${DAILY_DECISION_OVERRIDE_RULES.MISSION_TASK_GONE}`);
  assert.equal(decision.missionTaskId, "replacement");
}

{
  const decision = selectDailyDecision({
    tasks: [
      task("mission", { isVital: true }),
      task("rescue", { heatCurrent: 5 }),
      task("extra", { isToday: true }),
    ],
    existingDecision: null,
    now: NOW,
  });

  assert.equal(typeof decision.missionTaskId, "string");
  assert.equal(typeof decision.rescueTaskId, "string");
  assert.equal(Array.isArray(decision.missionTaskIds), false);
  assert.equal(Array.isArray(decision.rescueTaskIds), false);
}

{
  const previousDecision = stored();
  const nextDecision = selectDailyDecision({
    tasks: [
      task("mission", { isVital: true }),
      task("deadline", { deadlineAt: "2026-06-10" }),
    ],
    existingDecision: previousDecision,
    now: NOW,
  });
  const event = buildDailyDecisionChangedEventSpec({
    previousDecision,
    nextDecision,
    missionTask: task("deadline", { text: "Deadline task", deadlineAt: "2026-06-10" }),
    now: NOW,
  });

  assert.equal(event.event_type, PLANNER_EVENT_TYPES.ENGINE_DAILY_DECISION_CHANGED);
  assert.equal(event.payload.rule, DAILY_DECISION_OVERRIDE_RULES.HARD_DEADLINE_NEW);
  assert.equal(event.payload.previous.missionTaskId, "mission");
  assert.equal(event.payload.next.missionTaskId, "deadline");
}

console.log("planner daily decision tests passed");
