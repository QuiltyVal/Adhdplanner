const {
  buildEngineNarrationReportSpec,
} = require("./planner-report-projector");
const { formatReportMessage } = require("./planner-delivery-messages");

function getTaskText(task = {}) {
  return String(task?.text || "Untitled task");
}

function buildDevilDeathReportSpec({
  event = {},
  task = {},
  source = "auto_death",
  now = Date.now(),
} = {}) {
  const isAutoClean = source === "auto_clean";
  return buildEngineNarrationReportSpec({
    event,
    kind: "system_change",
    persona: "devil",
    severity: source === "auto_decay" ? 3 : 2,
    title: isAutoClean ? "Devil cleaned the active list" : "Devil buried a cold task",
    messageKey: isAutoClean ? "devil_auto_clean" : "devil_auto_buried",
    params: { taskText: getTaskText(task) },
    createdAt: task.deadAt || now,
  });
}

function buildMissionReportSpec({
  event = {},
  mission = {},
  explanation = "",
  now = Date.now(),
} = {}) {
  return buildEngineNarrationReportSpec({
    event,
    kind: "system_change",
    persona: "angel",
    severity: 1,
    title: "Angel picked the day mission",
    messageKey: "angel_mission_selected",
    params: {
      taskText: getTaskText(mission.task),
      explanation: String(explanation || ""),
    },
    createdAt: now,
  });
}

function buildRescueReportSpec({
  event = {},
  rescue = {},
  explanation = "",
  now = Date.now(),
} = {}) {
  return buildEngineNarrationReportSpec({
    event,
    kind: "system_change",
    persona: "angel",
    severity: 1,
    title: "Angel prepared a rescue target",
    messageKey: "angel_rescue_prepared",
    params: {
      taskText: getTaskText(rescue.task),
      explanation: String(explanation || ""),
    },
    createdAt: now,
  });
}

function buildAtRiskReportSpec({
  event = {},
  atRiskTaskIds = [],
  atRiskTasks = [],
  now = Date.now(),
} = {}) {
  const firstTask = atRiskTasks[0] || null;
  return buildEngineNarrationReportSpec({
    event,
    kind: "warning",
    persona: "devil",
    severity: atRiskTaskIds.length >= 3 ? 3 : 2,
    title: "Devil sees cold tasks",
    messageKey: "devil_tasks_at_risk",
    params: {
      count: atRiskTaskIds.length,
      taskText: String(firstTask?.text || ""),
    },
    createdAt: now,
  });
}

function buildEngineRunSummaryReportSpec({
  runId = "",
  summaryIdPart = "",
  angelCount = 0,
  devilCount = 0,
  deliveryCount = 0,
  engineRunSummary = {},
  now = Date.now(),
} = {}) {
  const summaryParams = {
    angelCount,
    devilCount,
    deliveryCount,
    contractVersion: engineRunSummary.contractVersion,
    runId: engineRunSummary.runId,
  };
  return {
    id: `report_summary_${summaryIdPart || runId || now}`,
    source_event_id: runId,
    kind: "summary",
    persona: devilCount > 0 ? "devil" : angelCount > 0 ? "angel" : "system",
    severity: devilCount > 0 ? 2 : 1,
    title: "Planner engine summary",
    body: formatReportMessage({ messageKey: "engine_run_summary", params: summaryParams }),
    message_key: "engine_run_summary",
    params: summaryParams,
    sourceType: "engine_run_summary",
    sourceEventType: "ENGINE_RUN_SUMMARY",
    projection: {
      version: 1,
      projectedAt: now,
      projector: "planner-engine",
      sourceEventType: "ENGINE_RUN_SUMMARY",
      summary: engineRunSummary,
    },
    createdAt: now + 1,
  };
}

module.exports = {
  buildAtRiskReportSpec,
  buildDevilDeathReportSpec,
  buildEngineRunSummaryReportSpec,
  buildMissionReportSpec,
  buildRescueReportSpec,
};
