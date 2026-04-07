const { buildTelegramTaskLine, createTask, escapeHtml, getFirstOpenSubtask, getPlannerData, linkTelegramChat, mutatePlanner, pickRescueTask, sortTasksByPriority } = require("./_lib/planner-store");
const { plannerTaskKeyboard, telegramRequest } = require("./_lib/telegram");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;
const ALLOWED_CHAT_ID = process.env.TELEGRAM_ALLOWED_CHAT_ID || "";

function getTargetUserId() {
  if (!DEFAULT_USER_ID) {
    throw new Error("PLANNER_DEFAULT_USER_ID is not configured");
  }
  return DEFAULT_USER_ID;
}

function isAllowedChat(chatId) {
  if (!ALLOWED_CHAT_ID) return true;
  return String(chatId) === String(ALLOWED_CHAT_ID);
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

async function sendTodayDigest(chatId, plannerData) {
  const activeTasks = plannerData.tasks.filter((task) => task.status === "active");
  const topTasks = sortTasksByPriority(activeTasks).slice(0, 3);

  if (topTasks.length === 0) {
    await sendText(chatId, "Сегодня активных задач нет. Можно выдохнуть или добавить новую.");
    return;
  }

  const [topTask, ...restTasks] = topTasks;
  const header = [
    "☀️ <b>Что у тебя сегодня горит</b>",
    "",
    ...topTasks.map((task, index) => `${index + 1}. ${buildTelegramTaskLine(task).slice(2)}`),
  ].join("\n");

  await sendText(chatId, header);

  await sendText(
    chatId,
    [
      `🎯 <b>Главная сейчас:</b> ${escapeHtml(topTask.text)}`,
      restTasks.length ? `Ещё в фоне: ${restTasks.map((task) => escapeHtml(task.text)).join(" · ")}` : "Если хочется только одного действия, жми Panic.",
    ].join("\n"),
    {
      reply_markup: plannerTaskKeyboard(topTask.id),
    },
  );
}

function buildPanicText(task) {
  const firstOpenSubtask = getFirstOpenSubtask(task);
  const lines = [
    "🆘 <b>Panic mode</b>",
    "",
    `Берём: <b>${escapeHtml(task.text)}</b>`,
  ];

  if (firstOpenSubtask) {
    lines.push(`Первый шаг: ${escapeHtml(firstOpenSubtask.text)}`);
    lines.push("Сделай только это и остановись, если захочешь.");
  } else {
    lines.push("Подзадач пока нет. Открой всё, что связано с задачей, и сделай один кривой шаг на 2 минуты.");
  }

  return lines.join("\n");
}

async function handleStart(chatId) {
  const userId = getTargetUserId();
  await linkTelegramChat(userId, chatId);
  await sendText(
    chatId,
    [
      "Я привязал этот Telegram к planner.",
      "",
      "Команды:",
      "/today — показать 1-3 главные задачи",
      "/panic — выбрать одну задачу и один микрошаг",
      "/add текст — добавить задачу",
      "",
      "Любое обычное сообщение я пока тоже складываю как новую задачу.",
    ].join("\n"),
  );
}

async function handleToday(chatId) {
  const userId = getTargetUserId();
  const plannerData = await getPlannerData(userId);
  await sendTodayDigest(chatId, plannerData);
}

async function handlePanic(chatId) {
  const userId = getTargetUserId();
  const plannerData = await getPlannerData(userId);
  const task = pickRescueTask(plannerData.tasks);

  if (!task) {
    await sendText(chatId, "Сейчас нет активной задачи для panic mode.");
    return;
  }

  await sendText(chatId, buildPanicText(task), {
    reply_markup: plannerTaskKeyboard(task.id),
  });
}

async function handleAdd(chatId, argText) {
  if (!argText) {
    await sendText(chatId, "Напиши так: /add купить корм");
    return;
  }

  const userId = getTargetUserId();
  const created = createTask(argText, { source: "telegram" });
  await mutatePlanner(userId, (current) => ({
    ...current,
    tasks: [created, ...current.tasks],
  }));

  await sendText(chatId, `➕ Добавила задачу: <b>${escapeHtml(created.text)}</b>`, {
    reply_markup: plannerTaskKeyboard(created.id),
  });
}

async function handlePlainCapture(chatId, text) {
  const cleaned = text.trim();
  if (!cleaned) return;
  if (cleaned.startsWith("/")) {
    await sendText(
      chatId,
      [
        "Я не поняла эту команду.",
        "",
        "Рабочие команды сейчас:",
        "/start",
        "/today",
        "/panic",
        "/add текст",
      ].join("\n"),
    );
    return;
  }
  await handleAdd(chatId, cleaned);
}

async function handleCallback(chatId, callbackQuery) {
  const userId = getTargetUserId();
  const [action, taskId] = String(callbackQuery.data || "").split(":");
  if (!taskId) {
    await answerCallback(callbackQuery.id, "Некорректное действие");
    return;
  }

  let feedback = "Сделано.";
  let panicTask = null;

  await mutatePlanner(userId, (current) => {
    const nextTasks = current.tasks.map((task) => {
      if (task.id !== taskId) return task;

      if (action === "done") {
        feedback = "Задача отправлена в выполненные.";
        return { ...task, status: "completed", isToday: false, lastUpdated: Date.now() };
      }

      if (action === "today") {
        const nextValue = !task.isToday;
        feedback = nextValue ? "Закрепил на сегодня." : "Открепил от сегодня.";
        return { ...task, isToday: nextValue, lastUpdated: Date.now() };
      }

      if (action === "vital") {
        const nextValue = !task.isVital;
        feedback = nextValue ? "Пометил как критичную." : "Снял критичный приоритет.";
        return {
          ...task,
          isVital: nextValue,
          urgency: nextValue ? "high" : task.urgency,
          lastUpdated: Date.now(),
        };
      }

      if (action === "panic") {
        const firstOpenSubtask = getFirstOpenSubtask(task);
        feedback = firstOpenSubtask
          ? `Первый шаг: ${firstOpenSubtask.text}`
          : "Открой всё по задаче и сделай один кривой шаг на 2 минуты.";
        panicTask = task;
        return task;
      }

      return task;
    });

    return {
      ...current,
      tasks: nextTasks,
    };
  });

  await answerCallback(callbackQuery.id, feedback);

  if (action === "panic" && panicTask) {
    await sendText(chatId, buildPanicText(panicTask), {
      reply_markup: plannerTaskKeyboard(panicTask.id),
    });
  }
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

    if (!chatId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (!isAllowedChat(chatId)) {
      if (callbackQuery?.id) {
        await answerCallback(callbackQuery.id, "Этот чат не разрешён.");
      }
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (callbackQuery) {
      await handleCallback(chatId, callbackQuery);
      return res.status(200).json({ ok: true });
    }

    const text = String(message?.text || "").trim();
    const { command, argText } = parseCommand(text);

    if (command === "/start") {
      await handleStart(chatId);
    } else if (command === "/today") {
      await handleToday(chatId);
    } else if (command === "/panic") {
      await handlePanic(chatId);
    } else if (command === "/add") {
      await handleAdd(chatId, argText);
    } else if (text) {
      await handlePlainCapture(chatId, text);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[telegram-webhook]", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
};
