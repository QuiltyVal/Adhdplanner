const { parseTelegramIntent } = require("./telegram-intent");

function extractQuotedSegments(text = "") {
  return Array.from(String(text).matchAll(/[«"]([^«»"]+)[»"]/g))
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function looksLikeReopenRequest(text = "") {
  const lowered = String(text).toLowerCase();
  return /верни|вернуть|из рая|назад в актив/.test(lowered) && /(задач|е[её]|\bее\b|\bеё\b|\bэту\b)/.test(lowered);
}

function looksLikeCompleteRequest(text = "") {
  const lowered = String(text).toLowerCase();
  return /(в рай|выполненн|готов[ао]|заверши|сделай готов|отправь.*в рай)/.test(lowered);
}

function looksLikeSuggestUnpinRequest(text = "") {
  const lowered = String(text).toLowerCase();
  return (
    /что открепить|какую открепить|что убрать с сегодня|какую убрать с сегодня|что снять с сегодня|какую снять с сегодня/.test(lowered) ||
    (/(предложи|посоветуй|какую|что)/.test(lowered) && !/(задач|добав|удал|подзадач|шаг|календар|паник|горит)/.test(lowered))
  );
}

function looksLikeUnsetTodayRequest(text = "") {
  const lowered = String(text).toLowerCase();
  return /(сегодня|на сегодня)/.test(lowered) && /(открепи|открепить|сними|снять|убери|убрать)/.test(lowered);
}

function looksLikeUnsetVitalRequest(text = "") {
  const lowered = String(text).toLowerCase();
  return /(сними|снять|убери|убрать|без|не).*(критич|критичност|жизненн|важн|срочн)/.test(lowered);
}

function extractTaskNameForCompletion(text = "") {
  const quoted = extractQuotedSegments(text);
  if (quoted.length > 0) return quoted[0];

  const cleaned = String(text)
    .replace(/^(ну\s+)?(нет\s+)?/i, "")
    .replace(/^(отправь|переведи|сделай|заверши|завершить)\s+/i, "")
    .replace(/\s+(в рай|в выполненные|готовой|готовым|готово)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned && !/^(е[её]|эту|эту задачу)$/i.test(cleaned) ? cleaned : "";
}

function extractTaskNameForUnsetToday(text = "") {
  const quoted = extractQuotedSegments(text);
  if (quoted.length > 0) return quoted[0];

  const cleaned = String(text)
    .replace(/^(ну\s+)?/i, "")
    .replace(/^(открепи|открепить|сними|снять|убери|убрать)\s+/i, "")
    .replace(/\s+(с сегодня|на сегодня)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(е[её]|эта|эту|этой|ней|последнюю|последней|последняя|первую|первой|первую из списка)$/i.test(cleaned)) {
    return cleaned;
  }

  return cleaned;
}

function extractTaskNameForUnsetVital(text = "") {
  const quoted = extractQuotedSegments(text);
  if (quoted.length > 0) return quoted[0];

  return String(text)
    .replace(/^(ну\s+)?/iu, "")
    .replace(/^(сними|снять|убери|убрать|сделай\s+не)\s+/iu, "")
    .replace(/(?:^|\s)(критичност[ьи]?|критичн(?:ость|ую|ый|ой)?|жизненн(?:ую|ый|ой)?\s+важн(?:ость|ую|ый|ой)?|срочн(?:ость|ую|ый|ой)?)(?=\s|$)/giu, " ")
    .replace(/(?:^|\s)(у|для|в)(?=\s|$)/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeTodaySelectionReply(text = "") {
  const lowered = String(text).toLowerCase().trim();
  return (
    /^(давай|тогда|ок|ладно|хорошо|нет)[.!?]?$/u.test(lowered) ||
    /^(давай\s+)?(последнюю|первую|вторую|третью|эту|ее|её)[.!?]?$/u.test(lowered)
  );
}

function extractTaskNameForTodaySelection(text = "") {
  const quoted = extractQuotedSegments(text);
  if (quoted.length > 0) return quoted[0];

  const cleaned = String(text)
    .replace(/^нет[, ]*/i, "")
    .replace(/^(ну\s+)?/i, "")
    .replace(/^(давай|тогда|ок|ладно|хорошо)\s+/i, "")
    .replace(/^(открепи|открепить|сними|снять|убери|убрать)\s+/i, "")
    .replace(/^последняя\s+была\s+/i, "")
    .replace(/^это\s+была\s+/i, "")
    .replace(/\s+(с сегодня|на сегодня)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

function extractTaskNameForReopen(text = "") {
  const quoted = extractQuotedSegments(text);
  if (quoted.length > 0) return quoted[0];

  const cleaned = String(text)
    .replace(/^(ну\s+)?(нет\s+)?/i, "")
    .replace(/^(верни|вернуть|воскреси|восстанови|достань)\s+/i, "")
    .replace(/\s+(назад\s+)?(в активные|в активную|из рая|обратно)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned && !/^(е[её]|эту|эту задачу|последнюю|последнюю задачу)$/i.test(cleaned) ? cleaned : "";
}

function parseDeleteSubtaskRequest(text = "") {
  const lowered = String(text).toLowerCase();
  if (!/удали|удалить/.test(lowered) || !/подзадач|шаг/.test(lowered)) {
    return null;
  }

  const quoted = extractQuotedSegments(text);
  if (quoted.length >= 2) {
    return {
      taskText: quoted[0],
      subtaskText: quoted[1],
    };
  }

  const match = String(text).match(/в задачу\s+(.+?)\s+удали(?:ть)?\s+(?:подзадачу|шаг)\s+(.+)/i);
  if (!match) return null;

  return {
    taskText: match[1].trim(),
    subtaskText: match[2].trim(),
  };
}

function parseAddSubtaskRequest(text = "") {
  const lowered = String(text).toLowerCase();
  if (!/добавь|добавить|добваь|добаьв/.test(lowered) || !/подзадач|шаг/.test(lowered)) {
    return null;
  }

  const quoted = extractQuotedSegments(text);
  if (quoted.length >= 2) {
    return {
      taskText: quoted[0],
      subtaskText: quoted[1],
    };
  }

  const patterns = [
    {
      pattern: /(?:^|\b)(?:добавь|добавить|добваь|добаьв)\s+(?:к|в(?:\s+задачу)?)\s+(.+?)\s+(?:подзачу|подзадачу|шаг)\s+[«"]?(.+?)[»"]?$/i,
      extract: (match) => ({
        taskText: match[1].trim(),
        subtaskText: match[2].trim(),
      }),
    },
    {
      pattern: /(?:^|\b)(?:добавь|добавить|добваь|добаьв)\s+(?:подзачу|подзадачу|шаг)\s+[«"]?(.+?)[»"]?\s+(?:в|к|для)\s+(.+?)$/i,
      extract: (match) => ({
        taskText: match[2].trim(),
        subtaskText: match[1].trim(),
      }),
    },
  ];
  for (const candidate of patterns) {
    const match = String(text).match(candidate.pattern);
    if (match) return candidate.extract(match);
  }

  return null;
}

async function routePlannerAgentInput({ text, plannerData }) {
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    return { type: "noop" };
  }

  if (cleaned.startsWith("/")) {
    return { type: "unknown_command", rawText: cleaned };
  }

  const intent = await parseTelegramIntent({
    text: cleaned,
    tasks: plannerData?.tasks || [],
    telegramContext: plannerData?.telegramContext || null,
  });

  const routed = {
    type: intent.intent,
    taskText: intent.task_text || "",
    taskRef: intent.task_ref || "",
    subtaskText: intent.subtask_text || "",
    subtasks: intent.subtasks || [],
    deadlineAt: intent.deadline_at || "",
    startTime: intent.start_time || "",
    durationMinutes: intent.duration_minutes || null,
    urgency: intent.urgency || "medium",
    isToday: Boolean(intent.is_today),
    isVital: Boolean(intent.is_vital),
    replyText: intent.reply_text || "",
    source: "ai_router",
    rawIntent: intent,
    rawText: cleaned,
  };

  // Router stays pure on purpose: it classifies text, but it does not run
  // capture/extraction side effects. Future callers that pipe add_task into the
  // executor must attach memory enrichment separately first.
  if (routed.type === "add_task") {
    routed.requiresTaskMemoryEnrichment = true;
  }

  if (routed.type === "chat" && !routed.replyText) {
    routed.replyText = "Сформулируй это как задачу, или просто напиши /today или /panic.";
  }

  if (routed.type === "add_subtask" && !routed.taskText && routed.taskRef) {
    routed.taskText = routed.taskRef;
  }

  return routed;
}

module.exports = {
  routePlannerAgentInput,
};
