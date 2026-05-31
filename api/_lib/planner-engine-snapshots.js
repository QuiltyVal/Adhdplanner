function compactEngineTask(task = {}) {
  return {
    id: task?.id ? String(task.id) : "",
    text: String(task?.text || ""),
    status: String(task?.status || ""),
  };
}

function buildPlannerDecisionSnapshot({
  mission = {},
  rescue = {},
  atRiskTasks = [],
  deadTasks = [],
  outboxCandidates = [],
  now = Date.now(),
} = {}) {
  const decisions = [];
  if (mission?.task?.id) {
    decisions.push({
      type: "mission",
      persona: "angel",
      task: compactEngineTask(mission.task),
      reason: String(mission.reason || "auto_priority"),
    });
  }
  if (rescue?.task?.id && String(rescue.task.id) !== String(mission?.task?.id || "")) {
    decisions.push({
      type: "rescue",
      persona: "angel",
      task: compactEngineTask(rescue.task),
      reason: String(rescue.reason || "auto_priority"),
    });
  }
  if (Array.isArray(atRiskTasks) && atRiskTasks.length > 0) {
    decisions.push({
      type: "at_risk",
      persona: "devil",
      count: atRiskTasks.length,
      tasks: atRiskTasks.slice(0, 3).map(compactEngineTask),
    });
  }
  if (Array.isArray(deadTasks) && deadTasks.length > 0) {
    decisions.push({
      type: "cemetery",
      persona: "devil",
      count: deadTasks.length,
      tasks: deadTasks.slice(0, 3).map(({ task }) => compactEngineTask(task)),
      sources: [...new Set(deadTasks.map(({ source }) => String(source || "auto")).filter(Boolean))],
    });
  }
  if (Array.isArray(outboxCandidates) && outboxCandidates.length > 0) {
    decisions.push({
      type: "outbox",
      persona: "system",
      count: outboxCandidates.length,
      topics: [...new Set(outboxCandidates.map((candidate) => String(candidate?.outbox?.topic || "")).filter(Boolean))].slice(0, 4),
      channels: [...new Set(outboxCandidates.map((candidate) => String(candidate?.outbox?.channel || "")).filter(Boolean))].slice(0, 4),
    });
  }
  return {
    updatedAt: now,
    decisions: decisions.slice(0, 6),
  };
}

function buildPlannerInboxSnapshot({
  activeTasks = [],
  atRiskTasks = [],
  deadTasks = [],
  outboxCandidates = [],
  scheduledSlot = null,
  counts = {},
  now = Date.now(),
} = {}) {
  const items = [];
  const overdueTasks = (Array.isArray(activeTasks) ? activeTasks : [])
    .filter((task) => Number(task?.deadlineAt || 0) > 0 && Number(task.deadlineAt) < now)
    .slice(0, 5);
  const tasksWithoutSteps = (Array.isArray(activeTasks) ? activeTasks : [])
    .filter((task) => !Array.isArray(task?.subtasks) || task.subtasks.filter((subtask) => !subtask?.completed).length === 0)
    .slice(0, 5);

  if (overdueTasks.length > 0) {
    items.push({
      type: "overdue",
      persona: "angel",
      severity: 3,
      count: overdueTasks.length,
      tasks: overdueTasks.slice(0, 3).map(compactEngineTask),
    });
  }
  if (Array.isArray(atRiskTasks) && atRiskTasks.length > 0) {
    items.push({
      type: "cold_tasks",
      persona: "devil",
      severity: atRiskTasks.length >= 3 ? 3 : 2,
      count: atRiskTasks.length,
      tasks: atRiskTasks.slice(0, 3).map(compactEngineTask),
    });
  }
  if (tasksWithoutSteps.length > 0) {
    items.push({
      type: "missing_steps",
      persona: "angel",
      severity: 1,
      count: tasksWithoutSteps.length,
      tasks: tasksWithoutSteps.slice(0, 3).map(compactEngineTask),
    });
  }
  if (Array.isArray(deadTasks) && deadTasks.length > 0) {
    items.push({
      type: "cemetery_moves",
      persona: "devil",
      severity: 3,
      count: deadTasks.length,
      tasks: deadTasks.slice(0, 3).map(({ task }) => compactEngineTask(task)),
    });
  }
  if (Array.isArray(outboxCandidates) && outboxCandidates.length > 0) {
    items.push({
      type: "messages_queued",
      persona: "system",
      severity: 1,
      count: outboxCandidates.length,
      topics: [...new Set(outboxCandidates.map((candidate) => String(candidate?.outbox?.topic || "")).filter(Boolean))].slice(0, 4),
    });
  }
  if (scheduledSlot) {
    items.push({
      type: "scheduled_nudge_due",
      persona: "system",
      severity: 1,
      slot: String(scheduledSlot),
    });
  }
  if (items.length === 0) {
    items.push({
      type: "clear",
      persona: "system",
      severity: 0,
      count: Number(counts?.active || 0),
    });
  }

  return {
    updatedAt: now,
    items: items.slice(0, 8),
  };
}

module.exports = {
  buildPlannerDecisionSnapshot,
  buildPlannerInboxSnapshot,
  compactEngineTask,
};
