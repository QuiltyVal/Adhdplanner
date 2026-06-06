const {
  buildTelegramContext,
  escapeHtml,
  getTaskById,
  getPlannerData,
  writeTelegramLog,
} = require("./_lib/planner-store");
const { getDb } = require("./_lib/firebase-admin");
const {
  buildSkipPostCommandHookRoute,
  executePlannerActionCommand,
} = require("./_lib/planner-command-runner");
const { buildLinkTelegramChatCommand } = require("./_lib/planner-command-builders");
const { writeEventDirect } = require("./_lib/planner-event-contract");
const { PLANNER_ACTIONS } = require("./_lib/planner-action-types");
const { buildGoogleCalendarConnectUrl } = require("./_lib/google-calendar");
const { buildTaskMemoryEnrichment, mergeTelegramTaskMemoryIntoRoute, processTelegramTaskCapture } = require("./_lib/telegram-task-memory");
const { routePlannerAgentInput } = require("./_lib/planner-agent-router");
const { executePlannerAction } = require("./_lib/planner-action-executor");
const { runPlannerTick } = require("./_lib/planner-engine");
const { calendarConnectKeyboard, completedTaskKeyboard, plannerOpenKeyboard, plannerTaskKeyboard, telegramRequest } = require("./_lib/telegram");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;
const ALLOWED_CHAT_ID = process.env.TELEGRAM_ALLOWED_CHAT_ID || "";
const AI_CONFIRMATION_ROUTE_SOURCES = new Set(["ai_router", "deterministic_router", "natural_text"]);
const CONFIRMABLE_AI_ACTIONS = new Set([
  PLANNER_ACTIONS.COMPLETE_TASK,
  PLANNER_ACTIONS.KILL_TASK,
]);

function getTargetUserId() {
  if (!DEFAULT_USER_ID) {
    throw new Error("PLANNER_DEFAULT_USER_ID is not configured");
  }
  return DEFAULT_USER_ID;
}

function isAllowedChat(chatId, allowedChatId = ALLOWED_CHAT_ID) {
  const allowed = String(allowedChatId || "").trim();
  if (!allowed) return true;
  return String(chatId) === allowed;
}

function buildTelegramSecurityDecision({ chatId, text = "", callbackData = "", allowedChatId = ALLOWED_CHAT_ID } = {}) {
  if (!chatId) {
    return {
      allowed: false,
      rejected: false,
      reason: "missing_chat",
      command: "",
      canLinkChat: false,
    };
  }

  const { command } = parseCommand(String(text || ""));
  const allowed = isAllowedChat(chatId, allowedChatId);
  if (!allowed) {
    return {
      allowed: false,
      rejected: true,
      reason: "rejected_unknown_chat",
      command,
      callbackData: String(callbackData || ""),
      canLinkChat: false,
    };
  }

  return {
    allowed: true,
    rejected: false,
    reason: "",
    command,
    callbackData: String(callbackData || ""),
    canLinkChat: command === "/start",
  };
}

function parseCommand(text = "") {
  const trimmed = text.trim();
  const [command, ...rest] = trimmed.split(/\s+/);
  const normalizedCommand = (command || "").split("@")[0].toLowerCase();
  return {
    command: normalizedCommand,
    argText: rest.join(" ").trim(),
  };
}

function normalizeTaskText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(мне|надо|нужно|хочу|задача|задачу|пожалуйста)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNaturalReopen(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return { isReopen: false, taskRef: "" };

  const lowered = raw.toLowerCase();
  const looksLikeReopen = /(верни|вернуть|восстанов|переоткрой|reopen|undo|uncomplete)/i.test(lowered);
  const mentionsTask = /(задач|дело|таск|task)/i.test(lowered);

  if (!looksLikeReopen && !mentionsTask) {
    return { isReopen: false, taskRef: "" };
  }

  if (!looksLikeReopen) {
    return { isReopen: false, taskRef: "" };
  }

  const quoted =
    raw.match(/["“«](.+?)["”»]/)?.[1] ||
    raw.match(/'(.+?)'/)?.[1] ||
    "";
  if (quoted.trim()) {
    return { isReopen: true, taskRef: quoted.trim() };
  }

  const afterVerb =
    raw.match(/(?:верни|вернуть|восстанови|восстановить|переоткрой|reopen)\s+(.+)$/i)?.[1] ||
    "";

  const cleaned = String(afterVerb || "")
    .replace(/^(мне|пожалуйста|плиз|эту|эту задачу|задачу|таск)\s+/i, "")
    .replace(/\s+(назад|обратно|в активные|пожалуйста)$/i, "")
    .trim();

  const genericOnly = /^(задачу|таск|е[её]|последнюю|любую)$/i.test(cleaned);
  if (!cleaned || genericOnly) {
    return { isReopen: true, taskRef: "" };
  }

  return { isReopen: true, taskRef: cleaned };
}

function resolveContextTask(plannerData, { statuses = ["active"], fallbackLatest = true } = {}) {
  const tasks = Array.isArray(plannerData?.tasks) ? plannerData.tasks : [];
  const lastTaskId = plannerData?.telegramContext?.lastTaskId;

  if (lastTaskId) {
    const byId = tasks.find((task) => task.id === lastTaskId && statuses.includes(task.status));
    if (byId) return byId;
  }

  if (!fallbackLatest) return null;

  return [...tasks]
    .filter((task) => statuses.includes(task.status))
    .sort((left, right) => (right.lastUpdated || 0) - (left.lastUpdated || 0))[0] || null;
}

function findTaskByText(tasks = [], query = "", allowedStatuses = ["active"]) {
  const normalizedQuery = normalizeTaskText(query);
  if (!normalizedQuery) return null;

  const candidates = (Array.isArray(tasks) ? tasks : []).filter((task) => allowedStatuses.includes(task.status));
  return (
    candidates.find((task) => String(task.id || "") === String(query || "")) ||
    candidates.find((task) => normalizeTaskText(task.text) === normalizedQuery) ||
    candidates.find((task) => normalizeTaskText(task.text).includes(normalizedQuery)) ||
    null
  );
}

function resolveConfirmationTask(plannerData, route = {}) {
  const tasks = Array.isArray(plannerData?.tasks) ? plannerData.tasks : [];
  const taskRef = String(route.taskRef || route.taskText || "").trim();
  if (taskRef) {
    const explicitTask = findTaskByText(tasks, taskRef, ["active"]);
    if (explicitTask) return explicitTask;
  }
  return resolveContextTask(plannerData, { statuses: ["active"] });
}

function buildAiActionConfirmationKeyboard(routeType, taskId) {
  const safeTaskId = String(taskId || "").trim();
  if (routeType === PLANNER_ACTIONS.KILL_TASK) {
    return {
      inline_keyboard: [
        [{ text: "🪦 Yes, Cemetery", callback_data: `confirm_kill:${safeTaskId}` }],
        [
          { text: "🆘 Make smaller", callback_data: `panic:${safeTaskId}` },
          { text: "Cancel", callback_data: `cancel:${safeTaskId}` },
        ],
        ...plannerOpenKeyboard().inline_keyboard,
      ],
    };
  }

  return {
    inline_keyboard: [
      [{ text: "✅ Yes, done", callback_data: `confirm_done:${safeTaskId}` }],
      [
        { text: "🆘 Rescue instead", callback_data: `panic:${safeTaskId}` },
        { text: "Cancel", callback_data: `cancel:${safeTaskId}` },
      ],
      ...plannerOpenKeyboard().inline_keyboard,
    ],
  };
}

function buildAiActionConfirmationText(route = {}, task = {}) {
  const taskText = escapeHtml(task?.text || "this task");
  if (route.type === PLANNER_ACTIONS.KILL_TASK) {
    return [
      "I read this as: move a task to Cemetery.",
      "",
      `<b>${taskText}</b>`,
      "",
      "I will not bury it from an AI guess. Confirm, shrink it, or cancel.",
    ].join("\n");
  }

  return [
    "I read this as: mark a task done.",
    "",
    `<b>${taskText}</b>`,
    "",
    "I will not complete it from an AI guess. Confirm, rescue it, or cancel.",
  ].join("\n");
}

function buildTelegramKillConfirmationResponse(task = {}) {
  const route = { type: PLANNER_ACTIONS.KILL_TASK, taskRef: "", source: "callback_prompt" };
  return {
    text: buildAiActionConfirmationText(route, task),
    reply_markup: buildAiActionConfirmationKeyboard(PLANNER_ACTIONS.KILL_TASK, task?.id),
  };
}

async function maybeSendAiActionConfirmation(chatId, route = {}, plannerData = null) {
  const routeType = String(route?.type || "");
  const source = String(route?.source || "");
  if (!CONFIRMABLE_AI_ACTIONS.has(routeType)) return false;
  if (!AI_CONFIRMATION_ROUTE_SOURCES.has(source)) return false;

  const data = plannerData || await getPlannerData(getTargetUserId());
  const task = resolveConfirmationTask(data, route);
  if (!task?.id) return false;

  await sendText(chatId, buildAiActionConfirmationText(route, task), {
    reply_markup: buildAiActionConfirmationKeyboard(routeType, task.id),
  });

  await safeWriteTelegramTrace(getTargetUserId(), {
    type: "telegram_ai_action_confirmation_sent",
    event_type: "TELEGRAM_AI_ACTION_CONFIRMATION_SENT",
    entity_id: `${routeType}_${task.id}`,
    message: `Telegram AI-routed ${routeType} held for confirmation.`,
    payload: {
      routeType,
      routeSource: source,
      taskId: task.id,
      taskText: String(task.text || "").slice(0, 160),
    },
  });

  return true;
}

async function sendText(chatId, text, extra = {}) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

async function answerCallback(callbackQueryId, text) {
  return telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

async function safeWriteTelegramLog(payload) {
  try {
    await writeTelegramLog(getTargetUserId(), payload);
  } catch (error) {
    console.error("[telegram-log]", error);
  }
}

async function safeWriteTelegramTrace(userId, payload = {}) {
  try {
    const now = Date.now();
    const eventType = String(payload.event_type || payload.type || "TELEGRAM_TRACE").toUpperCase();
    const entityId = String(payload.entity_id || payload.telegramMessageId || payload.telegramUpdateId || payload.callbackData || now);
    const id = String(payload.id || `${eventType.toLowerCase()}_${entityId}_${now}`).replace(/[\/#?\[\]]/g, "_").slice(0, 180);
    await writeEventDirect(getDb().collection("Users").doc(String(userId)), {
      id,
      type: String(payload.type || eventType.toLowerCase()),
      event_type: eventType,
      actor_type: "system",
      actor_ref: "telegram_webhook",
      source: "telegram_webhook",
      entity_type: "telegram",
      entity_id: entityId,
      taskId: null,
      taskText: "",
      message: String(payload.message || "Telegram webhook trace."),
      payload: payload.payload && typeof payload.payload === "object" ? payload.payload : {},
      visible_in_feed: payload.visible_in_feed !== false,
      visible_in_report: false,
      debug_only: true,
      createdAt: now,
    }, { merge: true });
  } catch (error) {
    console.error("[telegram-trace]", error);
  }
}

async function linkTelegramChatViaCommand(userId, chatId, source = "telegram_webhook") {
  const route = buildSkipPostCommandHookRoute({
    type: "LINK_TELEGRAM_CHAT",
    source,
    chatId: String(chatId),
    idempotencyKey: `link_telegram_chat:${chatId}`,
  });
  return executePlannerActionCommand({
    userId,
    command: buildLinkTelegramChatCommand(route),
    route,
    actorType: "system",
    now: Date.now(),
  });
}

function buildTelegramHelpText({ connected = false } = {}) {
  return [
    connected
      ? "This chat is now connected to Apus Planner nudges."
      : "Apus Planner commands:",
    "",
    "Commands:",
    "/help — show this command list",
    "/today — show 1-3 main tasks",
    "/completed — show completed tasks and restore one if needed",
    "/cemetery — show tasks in Cemetery and restore one if needed",
    "/calendar — connect Google Calendar",
    "/reopen — restore the latest completed/Cemetery task",
    "/reopen [title] — restore a completed/Cemetery task by title",
    "/panic — pick one task and one tiny step",
    "/add text — add a task",
    "",
    "Any plain message is also saved as a new task for now.",
  ].join("\n");
}

function buildTelegramHelpResponse(options = {}) {
  return {
    text: buildTelegramHelpText(options),
    reply_markup: plannerOpenKeyboard(),
  };
}

function buildTelegramCalendarResponse({ userId } = {}) {
  const url = buildGoogleCalendarConnectUrl(userId);
  return {
    text: "Open the button below and grant Google Calendar access. After that I can schedule tasks there from Telegram.",
    reply_markup: calendarConnectKeyboard(url),
  };
}

function buildPlannerActionAdapter(chatId, options = {}) {
  const suppressMessages = options.suppressMessages === true;
  return {
    sendText: async (messageText, extra = {}) => {
      if (suppressMessages) return null;
      return sendText(chatId, messageText, extra);
    },
    taskKeyboard: plannerTaskKeyboard,
    completedTaskKeyboard,
    calendarConnectKeyboard,
  };
}

function plannerDataWithContextTask(plannerData, task, action = "callback_context") {
  return {
    ...plannerData,
    telegramContext: buildTelegramContext(task, action),
  };
}

async function runPlannerRoute(chatId, route, options = {}) {
  const userId = getTargetUserId();
  const needsFreshProjection = ["show_today", "panic"].includes(String(route?.type || ""));
  if (needsFreshProjection) {
    try {
      await runPlannerTick({
        userId,
        now: Date.now(),
        trigger: `telegram_${route.type}`,
        allowScheduledNudge: false,
      });
    } catch (error) {
      console.warn("[telegram-webhook] projection refresh failed:", error);
    }
  }
  const plannerData = needsFreshProjection || !options.plannerData
    ? await getPlannerData(userId)
    : options.plannerData;
  await executePlannerAction({
    userId,
    chatId,
    plannerData,
    route,
    adapter: buildPlannerActionAdapter(chatId, { suppressMessages: options.suppressMessages }),
    log: safeWriteTelegramLog,
  });
  await safeWriteTelegramTrace(userId, {
    type: "telegram_route_executed",
    event_type: "TELEGRAM_ROUTE_EXECUTED",
    entity_id: `${String(route?.type || "unknown")}_${Date.now()}`,
    message: `Telegram route executed: ${String(route?.type || "unknown")}.`,
    payload: {
      routeType: String(route?.type || ""),
      routeSource: String(route?.source || ""),
      suppressMessages: Boolean(options.suppressMessages),
    },
  });
}

async function handleStart(chatId, options = {}) {
  const shouldLinkChat = options.linkChat !== false;
  const userId = getTargetUserId();
  if (shouldLinkChat) {
    await linkTelegramChatViaCommand(userId, chatId, "telegram_start");
  }
  const response = buildTelegramHelpResponse({ connected: shouldLinkChat });
  await sendText(
    chatId,
    response.text,
    { reply_markup: response.reply_markup },
  );
  if (shouldLinkChat) {
    await sendText(
      chatId,
      `Apus Planner diagnostic ping · ${new Date().toISOString()}`,
    );
  }
}

async function handleHelp(chatId) {
  const response = buildTelegramHelpResponse();
  await sendText(chatId, response.text, { reply_markup: response.reply_markup });
}

async function handleCalendar(chatId) {
  const userId = getTargetUserId();
  const response = buildTelegramCalendarResponse({ userId });
  await sendText(chatId, response.text, { reply_markup: response.reply_markup });
}

async function resolveUnifiedInboundRoute(chatId, text, options = {}) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return { route: null, plannerData: null, prefaceText: "", errorText: "" };

  if (cleaned.startsWith("/")) {
    const { command, argText } = parseCommand(cleaned);

    if (command === "/today") {
      return {
        route: {
          type: PLANNER_ACTIONS.SHOW_TODAY,
          source: "slash_command",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    if (command === "/completed") {
      return {
        route: {
          type: PLANNER_ACTIONS.SHOW_COMPLETED,
          source: "slash_command",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    if (command === "/cemetery") {
      return {
        route: {
          type: PLANNER_ACTIONS.SHOW_CEMETERY,
          source: "slash_command",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    if (command === "/reopen") {
      return {
        route: {
          type: PLANNER_ACTIONS.REOPEN_TASK,
          taskRef: argText || "",
          source: "slash_command",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    if (command === "/panic") {
      return {
        route: {
          type: argText ? "panic_task" : "panic",
          taskRef: argText || "",
          taskText: argText || "",
          source: "slash_command",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    if (command === "/add") {
      if (!argText) {
        return {
          route: null,
          plannerData: null,
          prefaceText: "",
          errorText: "Write it like this: /add buy cat food",
        };
      }

      const userId = getTargetUserId();
      const processing = await processTelegramTaskCapture({
        userId,
        chatId,
        rawText: argText,
        intent: "add_task",
        taskText: argText,
        telegramMessageId: options.telegramMessageId || null,
        telegramUpdateId: options.telegramUpdateId || null,
        writeLog: safeWriteTelegramLog,
      });

      const baseRoute = {
        type: PLANNER_ACTIONS.ADD_TASK,
        taskText: argText,
        rawText: argText,
        source: "slash_command",
        urgency: "medium",
        resistance: "",
        isToday: false,
        isVital: false,
        deadlineAt: "",
        subtasks: [],
      };

      return {
        route: mergeTelegramTaskMemoryIntoRoute(baseRoute, processing),
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    return {
      route: {
        type: "unknown_command",
        rawText: cleaned,
        source: "slash_command",
      },
      plannerData: null,
      prefaceText: "",
      errorText: "",
    };
  }

  const naturalReopen = parseNaturalReopen(cleaned);
  if (naturalReopen.isReopen) {
    if (naturalReopen.taskRef) {
      return {
        route: {
          type: PLANNER_ACTIONS.REOPEN_TASK,
          taskRef: naturalReopen.taskRef,
          source: "natural_text",
          rawText: cleaned,
        },
        plannerData: null,
        prefaceText: "",
        errorText: "",
      };
    }

    return {
      route: {
        type: PLANNER_ACTIONS.SHOW_COMPLETED,
        source: "natural_text",
        rawText: cleaned,
      },
      plannerData: null,
      prefaceText: "Understood. You want to restore a completed task. Choose one from the latest:",
      errorText: "",
    };
  }

  const userId = getTargetUserId();
  const plannerData = await getPlannerData(userId);
  const route = await routePlannerAgentInput({
    text: cleaned,
    plannerData,
  });

  const captureProcessing =
    ["add_task", "chat"].includes(route.type)
      ? await processTelegramTaskCapture({
          userId,
          chatId,
          rawText: cleaned,
          intent: route.type,
          taskText: route.taskText || "",
          taskRef: route.taskRef || "",
          urgency: route.urgency || "",
          isToday: Boolean(route.isToday),
          isVital: Boolean(route.isVital),
          deadlineAt: route.deadlineAt || "",
          subtasks: Array.isArray(route.subtasks) ? route.subtasks : [],
          telegramMessageId: options.telegramMessageId || null,
          telegramUpdateId: options.telegramUpdateId || null,
          writeLog: safeWriteTelegramLog,
        })
      : null;

  return {
    route: mergeTelegramTaskMemoryIntoRoute(route, captureProcessing),
    plannerData,
    prefaceText: "",
    errorText: "",
  };
}

async function handlePlainCapture(chatId, text, options = {}) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return;
  const { route, plannerData, prefaceText, errorText } = await resolveUnifiedInboundRoute(chatId, cleaned, options);

  if (errorText) {
    await sendText(chatId, errorText);
    return;
  }

  if (!route) return;

  await safeWriteTelegramLog({
    kind: "intent",
    chatId: String(chatId),
    messageText: cleaned,
    intent: route,
  });
  await safeWriteTelegramTrace(getTargetUserId(), {
    type: "telegram_route_resolved",
    event_type: "TELEGRAM_ROUTE_RESOLVED",
    entity_id: options.telegramUpdateId || options.telegramMessageId || Date.now(),
    message: `Telegram message routed as ${String(route?.type || "unknown")}.`,
    payload: {
      routeType: String(route?.type || ""),
      routeSource: String(route?.source || ""),
      textPreview: cleaned.slice(0, 120),
      telegramMessageId: options.telegramMessageId || null,
      telegramUpdateId: options.telegramUpdateId || null,
    },
  });

  if (prefaceText) {
    await sendText(chatId, prefaceText);
  }

  if (await maybeSendAiActionConfirmation(chatId, route, plannerData)) {
    return;
  }

  await runPlannerRoute(chatId, route, {
    plannerData: plannerData || undefined,
  });
}

function buildCallbackRoute(route = {}, callbackQuery = {}, action = "", taskId = "") {
  const callbackId = String(callbackQuery?.id || "").trim();
  const callbackData = String(callbackQuery?.data || "").trim();
  const messageId = callbackQuery?.message?.message_id || "";
  return {
    ...route,
    idempotencyKey: callbackId
      ? `telegram_callback:${callbackId}`
      : `telegram_callback:${action || route.type || "action"}:${taskId || route.taskRef || "task"}:${messageId || callbackData}`,
  };
}

async function resolveUnifiedCallbackRoute(callbackQuery) {
  const userId = getTargetUserId();
  const [action, taskId] = String(callbackQuery?.data || "").split(":");

  if (!taskId) {
    return {
      errorText: "Invalid action",
      callbackRoute: null,
      feedback: "",
      plannerData: null,
      suppressMessages: true,
    };
  }

  if (action === "reopen") {
    const source = await getTaskById(userId, taskId);
    if (!source) {
      return {
        errorText: "Task not found.",
        callbackRoute: null,
        feedback: "",
        plannerData: null,
        suppressMessages: true,
      };
    }

    const plannerData = await getPlannerData(userId);
    return {
      errorText: "",
      callbackRoute: buildCallbackRoute({ type: PLANNER_ACTIONS.REOPEN_TASK, taskRef: "", source: "callback" }, callbackQuery, action, taskId),
      feedback: "Returned the task to active.",
      plannerData: plannerDataWithContextTask({
        ...plannerData,
        tasks: [source, ...(plannerData.tasks || []).filter((task) => task.id !== source.id)],
      }, source, "callback_reopen"),
      suppressMessages: false,
    };
  }

  const plannerData = await getPlannerData(userId);
  const callbackTask = (plannerData.tasks || []).find((task) => task.id === taskId) || null;
  if (!callbackTask) {
    return {
      errorText: "Task not found.",
      callbackRoute: null,
      feedback: "",
      plannerData: null,
      suppressMessages: true,
    };
  }

  let callbackRoute = null;
  let feedback = "Done.";
  let contextAction = "callback_context";
  let suppressMessages = true;

  if (action === "cancel") {
    return {
      errorText: "Cancelled. No change.",
      callbackRoute: null,
      feedback: "",
      plannerData: null,
      suppressMessages: true,
    };
  }

  if (action === "done" || action === "confirm_done") {
    callbackRoute = { type: PLANNER_ACTIONS.COMPLETE_TASK, taskRef: "", source: "callback" };
    feedback = action === "confirm_done" ? "Confirmed. Task moved to completed." : "Task moved to completed.";
    contextAction = action === "confirm_done" ? "callback_confirm_done" : "callback_done";
    suppressMessages = false;
  } else if (action === "confirm_kill") {
    callbackRoute = { type: PLANNER_ACTIONS.KILL_TASK, taskRef: "", source: "callback" };
    feedback = "Confirmed. Task moved to Cemetery.";
    contextAction = "callback_confirm_kill";
    suppressMessages = false;
  } else if (action === "panic") {
    callbackRoute = { type: PLANNER_ACTIONS.PANIC_TASK, taskRef: "", source: "callback" };
    feedback = "Showing one tiny step.";
    contextAction = "callback_panic";
    suppressMessages = false;
  } else if (action === "today") {
    if (callbackTask.isToday) {
      callbackRoute = { type: PLANNER_ACTIONS.UNSET_TODAY, taskRef: "", source: "callback" };
      feedback = "Unpinned from today.";
      contextAction = "callback_today_unset";
    } else {
      callbackRoute = { type: PLANNER_ACTIONS.SET_TODAY, taskRef: "", source: "callback" };
      feedback = "Pinned for today.";
      contextAction = "callback_today_set";
    }
  } else if (action === "vital") {
    if (callbackTask.isVital) {
      callbackRoute = { type: PLANNER_ACTIONS.UNSET_VITAL, taskRef: "", source: "callback" };
      feedback = "Removed critical priority.";
      contextAction = "callback_vital_unset";
    } else {
      callbackRoute = { type: PLANNER_ACTIONS.SET_VITAL, taskRef: "", source: "callback" };
      feedback = "Marked as critical.";
      contextAction = "callback_vital_set";
    }
  } else {
    return {
      errorText: "Unknown action.",
      callbackRoute: null,
      feedback: "",
      plannerData: null,
      suppressMessages: true,
    };
  }

  return {
    errorText: "",
    callbackRoute: buildCallbackRoute(callbackRoute, callbackQuery, action, taskId),
    feedback,
    plannerData: plannerDataWithContextTask(plannerData, callbackTask, contextAction),
    suppressMessages,
  };
}

async function handleKillPromptCallback(chatId, callbackQuery) {
  const userId = getTargetUserId();
  const [, taskId] = String(callbackQuery?.data || "").split(":");
  const task = taskId ? await getTaskById(userId, taskId) : null;

  if (!task) {
    await answerCallback(callbackQuery.id, "Task not found.");
    return;
  }

  if (task.status !== "active") {
    await answerCallback(callbackQuery.id, "Task is not active.");
    return;
  }

  const route = { type: PLANNER_ACTIONS.KILL_TASK, taskRef: "", source: "callback_prompt" };
  await safeWriteTelegramLog({
    kind: "intent",
    chatId: String(chatId),
    callbackData: String(callbackQuery.data || ""),
    intent: route,
  });
  await safeWriteTelegramTrace(userId, {
    type: "telegram_callback_resolved",
    event_type: "TELEGRAM_CALLBACK_RESOLVED",
    entity_id: callbackQuery.id || callbackQuery.data || Date.now(),
    message: "Telegram callback routed as kill confirmation prompt.",
    payload: {
      callbackData: String(callbackQuery.data || ""),
      routeType: String(route.type || ""),
      taskId: String(task.id || ""),
      feedback: "Confirm before Cemetery.",
    },
  });

  const response = buildTelegramKillConfirmationResponse(task);
  await sendText(chatId, response.text, { reply_markup: response.reply_markup });
  await answerCallback(callbackQuery.id, "Confirm before Cemetery.");
}

async function handleCallback(chatId, callbackQuery) {
  const [action] = String(callbackQuery?.data || "").split(":");
  if (action === "kill") {
    await handleKillPromptCallback(chatId, callbackQuery);
    return;
  }

  const {
    errorText,
    callbackRoute,
    feedback,
    plannerData,
    suppressMessages,
  } = await resolveUnifiedCallbackRoute(callbackQuery);

  if (errorText) {
    await answerCallback(callbackQuery.id, errorText);
    return;
  }

  await safeWriteTelegramLog({
    kind: "intent",
    chatId: String(chatId),
    callbackData: String(callbackQuery.data || ""),
    intent: callbackRoute,
  });
  await safeWriteTelegramTrace(getTargetUserId(), {
    type: "telegram_callback_resolved",
    event_type: "TELEGRAM_CALLBACK_RESOLVED",
    entity_id: callbackQuery.id || callbackQuery.data || Date.now(),
    message: `Telegram callback routed as ${String(callbackRoute?.type || "unknown")}.`,
    payload: {
      callbackData: String(callbackQuery.data || ""),
      routeType: String(callbackRoute?.type || ""),
      feedback: String(feedback || ""),
    },
  });

  await runPlannerRoute(chatId, callbackRoute, {
    plannerData: plannerData || undefined,
    suppressMessages: Boolean(suppressMessages),
  });
  await answerCallback(callbackQuery.id, feedback);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const message = update.message;
    const callbackQuery = update.callback_query;
    const chatId = callbackQuery?.message?.chat?.id || message?.chat?.id;
    const text = String(message?.text || "").trim();
    const callbackData = String(callbackQuery?.data || "");

    if (!chatId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const userId = getTargetUserId();
    try {
      await writeTelegramLog(userId, {
        kind: callbackQuery ? "callback_in" : "message_in",
        chatId: String(chatId),
        messageText: String(message?.text || ""),
        callbackData: String(callbackQuery?.data || ""),
      });
      await safeWriteTelegramTrace(userId, {
        type: callbackQuery ? "telegram_callback_inbound" : "telegram_message_inbound",
        event_type: callbackQuery ? "TELEGRAM_CALLBACK_INBOUND" : "TELEGRAM_MESSAGE_INBOUND",
        entity_id: update?.update_id || callbackQuery?.id || message?.message_id || Date.now(),
        message: callbackQuery ? "Telegram callback reached webhook." : "Telegram message reached webhook.",
        payload: {
          hasText: Boolean(message?.text),
          command: String(message?.text || "").trim().startsWith("/") ? parseCommand(String(message?.text || "")).command : "",
          callbackData: String(callbackQuery?.data || ""),
          telegramMessageId: message?.message_id || null,
          telegramUpdateId: update?.update_id || null,
        },
      });
    } catch (logError) {
      console.error("[telegram-log:inbound]", logError);
    }

    const securityDecision = buildTelegramSecurityDecision({
      chatId,
      text,
      callbackData,
    });

    if (!securityDecision.allowed) {
      await safeWriteTelegramLog({
        kind: securityDecision.reason || "rejected_unknown_chat",
        chatId: String(chatId),
        messageText: text,
        callbackData,
        status: "rejected",
      });
      await safeWriteTelegramTrace(userId, {
        type: securityDecision.reason || "rejected_unknown_chat",
        event_type: "TELEGRAM_REJECTED_UNKNOWN_CHAT",
        entity_id: update?.update_id || callbackQuery?.id || message?.message_id || Date.now(),
        message: "Telegram update rejected because chat is not allowed.",
        payload: {
          reason: securityDecision.reason || "rejected_unknown_chat",
          hasAllowedChatBinding: Boolean(ALLOWED_CHAT_ID),
          hasText: Boolean(text),
          command: securityDecision.command || "",
          callbackData: callbackData ? "[redacted]" : "",
          telegramMessageId: message?.message_id || null,
          telegramUpdateId: update?.update_id || null,
        },
      });
      if (callbackQuery?.id) {
        await answerCallback(callbackQuery.id, "This chat is not allowed.");
      }
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (callbackQuery) {
      await handleCallback(chatId, callbackQuery);
      try {
        await writeTelegramLog(userId, {
          kind: "callback_out",
          chatId: String(chatId),
          callbackData: String(callbackQuery.data || ""),
          status: "ok",
        });
      } catch (logError) {
        console.error("[telegram-log:callback-out]", logError);
      }
      return res.status(200).json({ ok: true });
    }

    const { command } = securityDecision;

    if (command === "/start") {
      const canLinkChat = Boolean(message?.from?.id || message?.from?.username);
      await handleStart(chatId, { linkChat: canLinkChat && securityDecision.canLinkChat });
    } else if (command === "/help") {
      await handleHelp(chatId);
    } else if (command === "/calendar") {
      await handleCalendar(chatId);
    } else if (text) {
      await handlePlainCapture(chatId, text, {
        telegramMessageId: message?.message_id || null,
        telegramUpdateId: update?.update_id || null,
      });
    }

    try {
      await writeTelegramLog(userId, {
        kind: "message_out",
        chatId: String(chatId),
        messageText: text,
        status: "ok",
      });
    } catch (logError) {
      console.error("[telegram-log:message-out]", logError);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[telegram-webhook]", error);
    try {
      await writeTelegramLog(getTargetUserId(), {
        kind: "error",
        errorMessage: error.message || "Unknown error",
        errorStack: error.stack || "",
      });
      await safeWriteTelegramTrace(getTargetUserId(), {
        type: "telegram_webhook_error",
        event_type: "TELEGRAM_WEBHOOK_ERROR",
        entity_id: Date.now(),
        message: `Telegram webhook error: ${error.message || "Unknown error"}.`,
        payload: {
          errorMessage: error.message || "Unknown error",
        },
      });
    } catch (logError) {
      console.error("[telegram-log:error]", logError);
    }
    return res.status(500).json({ error: error.message || "Internal error" });
  }
};

module.exports._test = {
  buildTelegramCalendarResponse,
  buildTelegramHelpResponse,
  buildTelegramHelpText,
  buildTelegramKillConfirmationResponse,
  buildTelegramSecurityDecision,
  isAllowedChat,
};
