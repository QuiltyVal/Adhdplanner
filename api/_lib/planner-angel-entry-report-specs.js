const {
  ANGEL_ENTRY_TRIGGERS,
  normalizeAngelEntryMode,
  normalizeAngelEntryTrigger,
} = require("./planner-angel-engagement-contract");

function getTaskTitle(input = {}) {
  return String(input.taskTitle || input.task?.text || input.task?.title || "").trim();
}

function buildAngelEntryReportSpec({ session = {}, action = "created", task = null } = {}) {
  const trigger = normalizeAngelEntryTrigger(session.trigger);
  const mode = normalizeAngelEntryMode(session.mode, trigger);
  const taskTitle = getTaskTitle({ task, taskTitle: session.taskTitle });
  const quotedTask = taskTitle ? `“${taskTitle}”` : "one task";
  const normalizedAction = String(action || "created").toLowerCase();

  if (normalizedAction === "dismissed") {
    return {
      persona: "angel",
      title: "Angel entry dismissed",
      body: "You skipped the entry session. I will not reopen the same prompt immediately.",
      message_key: "angel_entry_dismissed",
      params: { trigger, mode, taskText: taskTitle },
      severity: 1,
    };
  }

  if (normalizedAction === "acted") {
    return {
      persona: "angel",
      title: "Angel entry used",
      body: taskTitle
        ? `You entered through ${quotedTask} instead of opening the full planner first.`
        : "You entered through one safe step instead of opening the full planner first.",
      message_key: "angel_entry_acted",
      params: { trigger, mode, taskText: taskTitle },
      severity: 1,
    };
  }

  if (trigger === ANGEL_ENTRY_TRIGGERS.NOT_YOUR_MOVE_CHECKIN_DUE) {
    return {
      persona: "angel",
      title: "Gentle check-in",
      body: taskTitle
        ? `${quotedTask} may still be waiting on someone else. This is a check-in, not pressure to finish.`
        : "One waiting task may need a check-in. This is not pressure to finish.",
      message_key: "angel_entry_not_your_move_checkin",
      params: { trigger, mode, taskText: taskTitle },
      severity: 1,
    };
  }

  if (trigger === ANGEL_ENTRY_TRIGGERS.TASK_GETTING_COLD) {
    return {
      persona: "angel",
      title: "Tiny re-entry",
      body: taskTitle
        ? `${quotedTask} is getting cold. I offered one small way back in.`
        : "One task is getting cold. I offered one small way back in.",
      message_key: "angel_entry_cold_task",
      params: { trigger, mode, taskText: taskTitle },
      severity: 1,
    };
  }

  return {
    persona: "angel",
    title: "Angel entry prepared",
    body: "I prepared one safe entry point instead of dropping you into the full task list.",
    message_key: "angel_entry_prepared",
    params: { trigger, mode, taskText: taskTitle },
    severity: 1,
  };
}

module.exports = {
  buildAngelEntryReportSpec,
};
