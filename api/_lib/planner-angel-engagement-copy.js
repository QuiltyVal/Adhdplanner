const {
  ANGEL_ENTRY_TRIGGERS,
  normalizeAngelEntryMode,
  normalizeAngelEntryTrigger,
} = require("./planner-angel-engagement-contract");

function getTaskTitle(input = {}) {
  return String(input.taskTitle || input.title || input.task?.text || input.task?.title || "").trim();
}

function buildAngelEntryNotificationCopy(session = {}, options = {}) {
  const language = String(options.language || session.language || "en").toLowerCase();
  const isRussian = language.startsWith("ru");
  const trigger = normalizeAngelEntryTrigger(session.trigger);
  const mode = normalizeAngelEntryMode(session.mode, trigger);
  const taskTitle = getTaskTitle(options);

  if (isRussian) {
    if (trigger === ANGEL_ENTRY_TRIGGERS.NOT_YOUR_MOVE_CHECKIN_DUE) {
      return {
        subject: "Angel Planner: gentle check-in",
        body: taskTitle
          ? `Angel is holding context for "${taskTitle}". This may still be not your move; check it without pressure.`
          : "Angel is holding one waiting task. Check it without pressure.",
        cta: "Open Angel check-in",
        tone: "gentle",
        mode,
      };
    }

    if (trigger === ANGEL_ENTRY_TRIGGERS.TASK_GETTING_COLD) {
      return {
        subject: "Angel found a tiny entry point",
        body: taskTitle
          ? `"${taskTitle}" is getting cold. No full planner: just one tiny safe re-entry.`
          : "One task is getting cold. No full planner: just one tiny safe re-entry.",
        cta: "Open one safe step",
        tone: "rescue",
        mode,
      };
    }

    return {
      subject: "Angel found one safe step",
      body: "No full planner right now. Angel can help you enter through one tiny step.",
      cta: "Open Angel session",
      tone: "gentle",
      mode,
    };
  }

  if (trigger === ANGEL_ENTRY_TRIGGERS.NOT_YOUR_MOVE_CHECKIN_DUE) {
    return {
      subject: "Angel Planner: gentle check-in",
      body: taskTitle
        ? `Angel is holding context for "${taskTitle}". This may still be not your move; check it without pressure.`
        : "Angel is holding one waiting task. Check it without pressure.",
      cta: "Open Angel check-in",
      tone: "gentle",
      mode,
    };
  }

  if (trigger === ANGEL_ENTRY_TRIGGERS.DEADLINE_NEAR) {
    return {
      subject: "Angel found a safe rescue point",
      body: taskTitle
        ? `"${taskTitle}" may need a small rescue. No full planner, just one safe step.`
        : "One task may need a small rescue. No full planner, just one safe step.",
      cta: "Start tiny rescue",
      tone: "rescue",
      mode,
    };
  }

  if (trigger === ANGEL_ENTRY_TRIGGERS.IMPORTANT_TASK_WITHOUT_STEP) {
    return {
      subject: "Angel can make this smaller",
      body: taskTitle
        ? `"${taskTitle}" looks important but foggy. Angel can turn it into one first step.`
        : "One important task looks foggy. Angel can turn it into one first step.",
      cta: "Make it smaller",
      tone: "gentle",
      mode,
    };
  }

  if (trigger === ANGEL_ENTRY_TRIGGERS.TASK_GETTING_COLD) {
    return {
      subject: "Angel found a tiny entry point",
      body: taskTitle
        ? `"${taskTitle}" is getting cold. No full planner: just one tiny safe re-entry.`
        : "One task is getting cold. No full planner: just one tiny safe re-entry.",
      cta: "Open one safe step",
      tone: "rescue",
      mode,
    };
  }

  return {
    subject: "Angel found one safe step",
    body: "No full planner right now. Angel can help you enter through one tiny step.",
    cta: "Open Angel session",
    tone: "gentle",
    mode,
  };
}

module.exports = {
  buildAngelEntryNotificationCopy,
};
