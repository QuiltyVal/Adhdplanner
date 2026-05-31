const { openRouterChatCompletion } = require("./openrouter");

const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_RESCUE_INTENT_MODEL = String(
  process.env.OPENAI_RESCUE_INTENT_MODEL
    || process.env.OPENAI_CHAT_MODEL
    || "gpt-4o-mini",
).trim();
const OPENAI_CLARIFY_STEP_MODEL = String(
  process.env.OPENAI_CLARIFY_STEP_MODEL
    || process.env.OPENAI_CHAT_MODEL
    || OPENAI_RESCUE_INTENT_MODEL,
).trim();

function extractJsonObject(rawText = "") {
  const trimmed = String(rawText || "").trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const startIndex = trimmed.indexOf("{");
  const endIndex = trimmed.lastIndexOf("}");
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return trimmed.slice(startIndex, endIndex + 1);
  }

  throw new Error("Model did not return a JSON object");
}

function classifyRescueIntentHeuristic(text) {
  const value = String(text || "").trim().toLowerCase();
  const waitingLike = /\b(wait|waiting|respond|response|reply|answer|buro|bureau|burger|bürger|jobcenter|amt|office|organization|organisation)\b/.test(value)
    || /жду|ожидаю|ответ|ответа|отвеч|бюро|бюргер|джоб|ведомств|организац|учрежден|документ/.test(value);

  if (waitingLike) {
    return {
      intent: "not_your_move",
      reason: "waiting_for_organization",
      waitingFor: String(text || "").trim(),
      confidence: 0.72,
      source: "heuristic",
    };
  }

  return {
    intent: "ordinary_step",
    reason: "other",
    waitingFor: "",
    confidence: 0.35,
    source: "heuristic",
  };
}

function normalizeRescueIntent(payload = {}, fallbackText = "") {
  const allowedIntents = new Set(["not_your_move", "ordinary_step", "clarify_resistance", "unclear"]);
  const allowedReasons = new Set([
    "waiting_for_person",
    "waiting_for_organization",
    "waiting_for_document",
    "waiting_for_access",
    "waiting_for_money",
    "other",
  ]);

  const intent = allowedIntents.has(payload.intent) ? payload.intent : "unclear";
  const reason = allowedReasons.has(payload.reason) ? payload.reason : "other";
  const waitingFor = typeof payload.waitingFor === "string" && payload.waitingFor.trim()
    ? payload.waitingFor.trim().slice(0, 240)
    : intent === "not_your_move"
      ? String(fallbackText || "").trim().slice(0, 240)
      : "";
  const confidence = Number(payload.confidence);

  return {
    intent,
    reason,
    waitingFor,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    source: typeof payload.source === "string" ? payload.source : "llm",
  };
}

function buildRescueIntentMessages({ text, taskTitle, language }) {
  const system = [
    "You are a safe intent classifier for an ADHD planner rescue flow.",
    "The user is editing one rescue step for one existing task.",
    "Return JSON only. Do not execute actions. Do not delete, complete, bury, or mutate anything.",
    "",
    "Classify the user's step into exactly one intent:",
    "- not_your_move: the user says the task is blocked by an external person, organization, document, access, money, reply, approval, code, or waiting state.",
    "- ordinary_step: the user wrote a concrete next action they can do themselves.",
    "- clarify_resistance: the user describes friction/emotion/avoidance, not a step and not an external blocker.",
    "- unclear: not enough information.",
    "",
    "For not_your_move choose reason:",
    "waiting_for_person, waiting_for_organization, waiting_for_document, waiting_for_access, waiting_for_money, other.",
    "",
    "Important:",
    "- 'waiting for response from Burgerbüro' means not_your_move, waiting_for_organization.",
    "- 'жду ответ из Bürgerbüro' means not_your_move, waiting_for_organization.",
    "- Preserve the language and wording of waitingFor; do not translate it.",
    "- Never return destructive actions.",
    "",
    'JSON schema: {"intent":"not_your_move","reason":"waiting_for_organization","waitingFor":"Burgerbüro response","confidence":0.93}',
  ].join("\n");

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: JSON.stringify({
        language: language || "auto",
        taskTitle: taskTitle || "",
        rescueStepText: text || "",
      }),
    },
  ];
}

async function classifyWithOpenAi({ text, taskTitle, language }) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_RESCUE_INTENT_MODEL,
      messages: buildRescueIntentMessages({ text, taskTitle, language }),
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 180,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI ${response.status}`);
  }

  const content = payload?.choices?.[0]?.message?.content || "";
  return normalizeRescueIntent(JSON.parse(extractJsonObject(content)), text);
}

async function classifyWithOpenRouter({ text, taskTitle, language }) {
  const payload = await openRouterChatCompletion({
    model: process.env.RESCUE_INTENT_MODEL || process.env.TELEGRAM_INTENT_MODEL || process.env.OPENROUTER_MODEL,
    messages: buildRescueIntentMessages({ text, taskTitle, language }),
    maxTokens: 180,
    responseFormat: { type: "json_object" },
    timeoutMs: Number(process.env.RESCUE_INTENT_TIMEOUT_MS || 8000),
  });
  const content = payload?.choices?.[0]?.message?.content || "";
  return normalizeRescueIntent(JSON.parse(extractJsonObject(content)), text);
}

async function classifyRescueIntent({ text, taskTitle = "", language = "auto" }) {
  const cleanText = String(text || "").trim().slice(0, 800);
  const cleanTaskTitle = String(taskTitle || "").trim().slice(0, 240);
  const cleanLanguage = String(language || "auto").trim().slice(0, 24);

  if (!cleanText) {
    return {
      ok: false,
      intent: "unclear",
      reason: "other",
      waitingFor: "",
      confidence: 0,
      source: "empty",
      error: "text is required",
    };
  }

  try {
    const intent = await classifyWithOpenAi({
      text: cleanText,
      taskTitle: cleanTaskTitle,
      language: cleanLanguage,
    });
    return { ok: true, ...intent, source: "openai" };
  } catch (openAiError) {
    try {
      const intent = await classifyWithOpenRouter({
        text: cleanText,
        taskTitle: cleanTaskTitle,
        language: cleanLanguage,
      });
      return { ok: true, ...intent, source: "openrouter" };
    } catch (routerError) {
      return {
        ok: true,
        ...classifyRescueIntentHeuristic(cleanText),
        source: "heuristic_fallback",
        warning: "LLM intent classifier unavailable",
      };
    }
  }
}

function buildClarifyStepFallback(taskTitle = "", language = "auto") {
  const title = String(taskTitle || "").toLowerCase();
  if (language === "en") {
    if (title.includes("job") || title.includes("work") || title.includes("career")) {
      return "Open one job board and save one role that looks close enough.";
    }
    if (title.includes("portfolio") || title.includes("website")) {
      return "Write one ugly sentence about what this project does.";
    }
    return "Write one messy note: what would make this task easier to start?";
  }
  if (title.includes("работ") || title.includes("ваканс") || title.includes("career")) {
    return "Открыть один сайт с вакансиями и сохранить одну вакансию, которая примерно подходит.";
  }
  if (title.includes("портфоли") || title.includes("сайт")) {
    return "Написать одно кривое предложение о том, что делает этот проект.";
  }
  return "Записать одной фразой, что сделало бы этот квест легче начать.";
}

function normalizeClarifyStep(payload = {}, fallbackStep = "") {
  const step = typeof payload.step === "string" && payload.step.trim()
    ? payload.step.trim()
    : fallbackStep;
  const rationale = typeof payload.rationale === "string" && payload.rationale.trim()
    ? payload.rationale.trim()
    : "";
  return {
    step: String(step || fallbackStep || "").trim().slice(0, 180),
    rationale: String(rationale || "").trim().slice(0, 220),
    source: typeof payload.source === "string" ? payload.source : "llm",
  };
}

function buildClarifyStepMessages({ taskTitle, confusion, language }) {
  const system = [
    "You are a gentle ADHD planner companion.",
    "The user marked a quest as unclear/sticky.",
    "Return JSON only. Do not mutate data. Do not create multiple steps.",
    "",
    "Goal: propose exactly one emotionally safe microstep.",
    "Rules:",
    "- The step must be concrete and doable in 2 minutes.",
    "- It must reduce ambiguity, not demand completion.",
    "- Preserve the user's language when possible.",
    "- Do not say 'finish the task'.",
    "- Do not create a plan with multiple bullets.",
    "",
    'JSON schema: {"step":"Open one job board and save one role that looks close enough.","rationale":"This turns the vague search into one visible move."}',
  ].join("\n");

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: JSON.stringify({
        language: language || "auto",
        taskTitle: taskTitle || "",
        confusion: confusion || "",
      }),
    },
  ];
}

async function clarifyWithOpenAi({ taskTitle, confusion, language }) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_CLARIFY_STEP_MODEL,
      messages: buildClarifyStepMessages({ taskTitle, confusion, language }),
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 180,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI ${response.status}`);
  }

  const content = payload?.choices?.[0]?.message?.content || "";
  return normalizeClarifyStep(
    JSON.parse(extractJsonObject(content)),
    buildClarifyStepFallback(taskTitle, language),
  );
}

async function clarifyWithOpenRouter({ taskTitle, confusion, language }) {
  const payload = await openRouterChatCompletion({
    model: process.env.CLARIFY_STEP_MODEL || process.env.RESCUE_INTENT_MODEL || process.env.OPENROUTER_MODEL,
    messages: buildClarifyStepMessages({ taskTitle, confusion, language }),
    maxTokens: 180,
    responseFormat: { type: "json_object" },
    timeoutMs: Number(process.env.CLARIFY_STEP_TIMEOUT_MS || 8000),
  });
  const content = payload?.choices?.[0]?.message?.content || "";
  return normalizeClarifyStep(
    JSON.parse(extractJsonObject(content)),
    buildClarifyStepFallback(taskTitle, language),
  );
}

async function suggestClarifyStep({ taskTitle = "", confusion = "", language = "auto" }) {
  const cleanTaskTitle = String(taskTitle || "").trim().slice(0, 240);
  const cleanConfusion = String(confusion || "").trim().slice(0, 240);
  const cleanLanguage = String(language || "auto").trim().slice(0, 24);
  const fallbackStep = buildClarifyStepFallback(cleanTaskTitle, cleanLanguage);

  try {
    const result = await clarifyWithOpenAi({
      taskTitle: cleanTaskTitle,
      confusion: cleanConfusion,
      language: cleanLanguage,
    });
    return { ok: true, ...result, source: "openai" };
  } catch (openAiError) {
    try {
      const result = await clarifyWithOpenRouter({
        taskTitle: cleanTaskTitle,
        confusion: cleanConfusion,
        language: cleanLanguage,
      });
      return { ok: true, ...result, source: "openrouter" };
    } catch (routerError) {
      return {
        ok: true,
        step: fallbackStep,
        rationale: cleanLanguage === "en"
          ? "Fallback: one small ambiguity-reducing move."
          : "Fallback: один маленький шаг, который снижает мутность.",
        source: "heuristic_fallback",
      };
    }
  }
}

module.exports = {
  classifyRescueIntent,
  classifyRescueIntentHeuristic,
  suggestClarifyStep,
};
