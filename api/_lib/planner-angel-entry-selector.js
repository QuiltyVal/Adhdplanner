const {
  ANGEL_ENTRY_MODES,
  ANGEL_ENTRY_TRIGGERS,
  buildAngelEntrySession,
  isTaskNotYourMove,
} = require("./planner-angel-engagement-contract");
const { PLANNER_EVENT_TYPES } = require("./planner-event-types");

const STICKY_RESCUE_SIGNAL_TYPES = new Set([
  PLANNER_EVENT_TYPES.RESCUE_CLOSED_LATER,
  PLANNER_EVENT_TYPES.RESCUE_ABORTED,
]);
const STICKY_SIGNAL_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;
const STICKY_SIGNAL_THRESHOLD = 2;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTaskId(task) {
  return String(task?.id || task?.taskId || task?._id || "").trim();
}

function getTaskTitle(task) {
  return String(task?.text || task?.title || task?.name || "").trim();
}

function isActiveTask(task) {
  const status = String(task?.status || "").toLowerCase();
  if (status === "completed" || status === "done" || status === "dead" || status === "deleted") return false;
  if (task?.completed || task?.done || task?.dead || task?.deleted) return false;
  return true;
}

function hasOpenStep(task) {
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  return subtasks.some((step) => step && !step.done && !step.completed && !step.deleted);
}

function getTaskPressure(task) {
  const heat = Number(task?.heatCurrent ?? task?.heat ?? task?.pulse ?? task?.pulseCurrent ?? 0);
  return Number.isFinite(heat) ? heat : 0;
}

function isTaskImportant(task) {
  return Boolean(
    task?.isToday ||
    task?.today ||
    task?.isVital ||
    task?.vital ||
    String(task?.urgency || "").toLowerCase() === "high" ||
    String(task?.priority || "").toLowerCase() === "critical"
  );
}

function getStickySignalCount(task, events = [], now = Date.now()) {
  const taskId = getTaskId(task);
  if (!taskId || !Array.isArray(events)) return 0;
  const since = Number(now || Date.now()) - STICKY_SIGNAL_WINDOW_MS;
  return events.filter((event) => {
    const eventTaskId = String(event?.taskId || event?.task_id || event?.entity_id || "").trim();
    if (eventTaskId !== taskId) return false;
    const eventType = String(event?.event_type || event?.eventType || "").toUpperCase();
    if (!STICKY_RESCUE_SIGNAL_TYPES.has(eventType)) return false;
    const createdAt = toMillis(event?.createdAt || event?.created_at);
    return !createdAt || createdAt >= since;
  }).length;
}

function isStickyQuest(task, events = [], now = Date.now()) {
  return getStickySignalCount(task, events, now) >= STICKY_SIGNAL_THRESHOLD;
}

function buildAngelEntryMessage(trigger, task) {
  const title = getTaskTitle(task);
  if (trigger === ANGEL_ENTRY_TRIGGERS.NOT_YOUR_MOVE_CHECKIN_DUE) {
    return title
      ? `This may still be waiting on someone else: "${title}". Want to check the status without pressure?`
      : "One waiting task may need a gentle check-in. No pressure to finish it.";
  }
  if (trigger === ANGEL_ENTRY_TRIGGERS.DEADLINE_NEAR) {
    return title
      ? `Angel found one time-sensitive task: "${title}". No full planner, just one safe step.`
      : "Angel found one time-sensitive task. No full planner, just one safe step.";
  }
  if (trigger === ANGEL_ENTRY_TRIGGERS.IMPORTANT_TASK_WITHOUT_STEP) {
    return title
      ? `"${title}" looks important, but it needs a first tiny step. Want me to make it smaller?`
      : "One important task needs a first tiny step. Want me to make it smaller?";
  }
  if (trigger === ANGEL_ENTRY_TRIGGERS.TASK_GETTING_COLD) {
    return title
      ? `"${title}" is getting cold. Angel can help you re-enter it gently.`
      : "One task is getting cold. Angel can help you re-enter it gently.";
  }
  if (trigger === ANGEL_ENTRY_TRIGGERS.REPEATED_RESISTANCE) {
    return title
      ? `"${title}" keeps resisting the direct route. I will not push it again. Want to find where it is sticky?`
      : "One quest keeps resisting the direct route. Want to find where it is sticky?";
  }
  return "Angel found one tiny entry point. No full planner today, just one safe step.";
}

function selectAngelEntrySessionCandidate({ userId, tasks = [], events = [], now = Date.now(), source = "engine" } = {}) {
  const activeTasks = (Array.isArray(tasks) ? tasks : []).filter(isActiveTask);

  const stickyTask = activeTasks
    .filter((task) => !isTaskNotYourMove(task))
    .map((task) => ({
      task,
      stickySignals: getStickySignalCount(task, events, now),
      pressure: getTaskPressure(task),
    }))
    .filter((item) => item.stickySignals >= STICKY_SIGNAL_THRESHOLD)
    .sort((a, b) => b.stickySignals - a.stickySignals || b.pressure - a.pressure)[0]?.task || null;
  if (stickyTask) {
    return buildAngelEntrySession({
      userId,
      now,
      source,
      trigger: ANGEL_ENTRY_TRIGGERS.REPEATED_RESISTANCE,
      mode: ANGEL_ENTRY_MODES.DIAGNOSE_RESISTANCE,
      taskId: getTaskId(stickyTask),
      message: buildAngelEntryMessage(ANGEL_ENTRY_TRIGGERS.REPEATED_RESISTANCE, stickyTask),
      primaryCta: "Find sticky point",
      secondaryCta: "Not today",
    });
  }

  const dueWaitingTask = activeTasks.find((task) => {
    if (!isTaskNotYourMove(task)) return false;
    const nextCheckInAt = toMillis(task?.blocked?.nextCheckInAt || task?.notYourMove?.nextCheckInAt);
    return nextCheckInAt > 0 && nextCheckInAt <= now;
  });
  if (dueWaitingTask) {
    return buildAngelEntrySession({
      userId,
      now,
      source,
      trigger: ANGEL_ENTRY_TRIGGERS.NOT_YOUR_MOVE_CHECKIN_DUE,
      taskId: getTaskId(dueWaitingTask),
      message: buildAngelEntryMessage(ANGEL_ENTRY_TRIGGERS.NOT_YOUR_MOVE_CHECKIN_DUE, dueWaitingTask),
      primaryCta: "Check status gently",
      secondaryCta: "Keep waiting",
    });
  }

  const deadlineTask = activeTasks.find((task) => {
    if (isTaskNotYourMove(task)) return false;
    if (isStickyQuest(task, events, now)) return false;
    const deadlineAt = toMillis(task?.deadlineAt || task?.deadline || task?.dueAt);
    if (!deadlineAt) return false;
    return deadlineAt <= now + 1000 * 60 * 60 * 36;
  });
  if (deadlineTask) {
    return buildAngelEntrySession({
      userId,
      now,
      source,
      trigger: ANGEL_ENTRY_TRIGGERS.DEADLINE_NEAR,
      taskId: getTaskId(deadlineTask),
      message: buildAngelEntryMessage(ANGEL_ENTRY_TRIGGERS.DEADLINE_NEAR, deadlineTask),
      primaryCta: "Start rescue",
      secondaryCta: "Make it smaller",
    });
  }

  const importantWithoutStep = activeTasks.find((task) => (
    !isTaskNotYourMove(task) &&
    isTaskImportant(task) &&
    !hasOpenStep(task)
  ));
  if (importantWithoutStep) {
    return buildAngelEntrySession({
      userId,
      now,
      source,
      trigger: ANGEL_ENTRY_TRIGGERS.IMPORTANT_TASK_WITHOUT_STEP,
      taskId: getTaskId(importantWithoutStep),
      message: buildAngelEntryMessage(ANGEL_ENTRY_TRIGGERS.IMPORTANT_TASK_WITHOUT_STEP, importantWithoutStep),
      primaryCta: "Add first step",
      secondaryCta: "Brain dump first",
    });
  }

  const coldTask = activeTasks
    .filter((task) => !isTaskNotYourMove(task))
    .sort((a, b) => getTaskPressure(a) - getTaskPressure(b))[0];
  if (coldTask && getTaskPressure(coldTask) <= 25) {
    return buildAngelEntrySession({
      userId,
      now,
      source,
      trigger: ANGEL_ENTRY_TRIGGERS.TASK_GETTING_COLD,
      taskId: getTaskId(coldTask),
      message: buildAngelEntryMessage(ANGEL_ENTRY_TRIGGERS.TASK_GETTING_COLD, coldTask),
      primaryCta: "Tiny focus",
      secondaryCta: "Not your move",
    });
  }

  return buildAngelEntrySession({
    userId,
    now,
    source,
    trigger: ANGEL_ENTRY_TRIGGERS.DAILY_CHECKIN,
    taskId: null,
    message: buildAngelEntryMessage(ANGEL_ENTRY_TRIGGERS.DAILY_CHECKIN, null),
    primaryCta: "Find one safe step",
    secondaryCta: "Brain dump",
  });
}

module.exports = {
  buildAngelEntryMessage,
  getStickySignalCount,
  isStickyQuest,
  selectAngelEntrySessionCandidate,
};
