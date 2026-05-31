const { openRouterChatCompletion } = require("./openrouter");

const FREE_LLM_TOP_MODELS_URL = "https://shir-man.com/api/free-llm/top-models";
const DEFAULT_FREE_MODEL_ID = "openrouter/free";
const FREE_MODEL_CACHE_TTL_MS = 1000 * 60 * 60;
const STICKY_DIAGNOSIS_TIMEOUT_MS = 6500;

let cachedFreeModel = {
  id: "",
  expiresAt: 0,
};

function isStickyDiagnosisEnabled() {
  return String(process.env.DISABLE_FREE_LLM_STICKY_DIAGNOSIS || "").toLowerCase() !== "true";
}

function normalizeStickyDiagnosisOption(option = {}, index = 0) {
  const label = String(option.label || "").trim().slice(0, 34);
  if (!label) return null;
  const id = String(option.id || label || `option_${index + 1}`)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || `option_${index + 1}`;
  return {
    id,
    label,
    description: String(option.description || "").trim().slice(0, 120),
    suggestedNextStep: String(option.suggestedNextStep || option.next_step || "").trim().slice(0, 120),
    effect: String(option.effect || "diagnose").trim().slice(0, 40) || "diagnose",
    source: String(option.source || "llm").trim() || "llm",
  };
}

function getDiagnosisLanguage(task = {}, language = "") {
  const normalized = String(language || "").trim().toLowerCase();
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("en")) return "en";
  const title = String(task?.text || task?.title || "").trim();
  return /[а-яё]/i.test(title) ? "ru" : "en";
}

function getFallbackStickyDiagnosis(task = {}, language = "") {
  const isRussian = getDiagnosisLanguage(task, language) === "ru";
  return {
    question: isRussian ? "Где этот квест липкий?" : "Where is this quest sticky?",
    options: [
      {
        id: "too_big",
        label: isRussian ? "слишком большое" : "too big",
        description: isRussian ? "Сжать до одного тупого шага." : "Shrink it to one dumb step.",
        suggestedNextStep: isRussian ? "Назвать самый маленький вход." : "Name the smallest entry point.",
        effect: "make_smaller",
        source: "fallback",
      },
      {
        id: "unclear",
        label: isRussian ? "непонятно" : "unclear",
        description: isRussian ? "Сначала выяснить, что именно надо сделать." : "Clarify what actually has to happen.",
        suggestedNextStep: isRussian ? "Записать один вопрос к задаче." : "Write one question about the task.",
        effect: "clarify",
        source: "fallback",
      },
      {
        id: "not_my_move",
        label: isRussian ? "не мой ход" : "not my move",
        description: isRussian ? "Проверить, зависит ли это от другого человека." : "Check whether someone else is blocking it.",
        suggestedNextStep: isRussian ? "Записать, кого или чего ждём." : "Write what or who we are waiting for.",
        effect: "not_your_move",
        source: "fallback",
      },
      {
        id: "kill_without_guilt",
        label: isRussian ? "пусть умрёт" : "let it die",
        description: isRussian ? "Не удалять автоматически. Просто признать, что квест может быть мёртв." : "Do not delete automatically. Just admit it may be dead.",
        suggestedNextStep: isRussian ? "Открыть кладбищенский выбор вручную." : "Open the cemetery choice manually.",
        effect: "consider_cemetery",
        source: "fallback",
      },
    ],
    source: "fallback",
    model: "",
  };
}

async function getCurrentFreeModelId() {
  const now = Date.now();
  if (cachedFreeModel.id && cachedFreeModel.expiresAt > now) return cachedFreeModel.id;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(FREE_LLM_TOP_MODELS_URL, { signal: controller.signal });
    const data = await response.json();
    const modelId =
      String(data?.models?.[0]?.id || "").trim() ||
      String(data?.fallback?.id || "").trim() ||
      DEFAULT_FREE_MODEL_ID;
    cachedFreeModel = {
      id: modelId,
      expiresAt: now + FREE_MODEL_CACHE_TTL_MS,
    };
    return modelId;
  } catch (error) {
    console.warn("[sticky-diagnosis:free-model]", error.message || String(error));
    return DEFAULT_FREE_MODEL_ID;
  } finally {
    clearTimeout(timeout);
  }
}

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
  throw new Error("Model did not return JSON");
}

function buildStickyDiagnosisPrompt({ task = {}, events = [], language = "" } = {}) {
  const title = String(task?.text || task?.title || "").trim();
  const diagnosisLanguage = getDiagnosisLanguage(task, language);
  const subtasks = Array.isArray(task?.subtasks)
    ? task.subtasks.map((subtask) => String(subtask?.text || subtask || "").trim()).filter(Boolean).slice(0, 6)
    : [];
  const eventCount = Array.isArray(events) ? events.length : 0;
  return [
    "You are the diagnosis layer for an ADHD/executive-dysfunction planner.",
    "The user repeatedly avoided or closed rescue for one task.",
    "Return ONLY JSON. Do not move, delete, complete, or schedule anything.",
    "Generate 3-5 short button options for what might be sticky about this task.",
    `Use this UI language for question and labels: ${diagnosisLanguage === "ru" ? "Russian" : "English"}.`,
    "Each option must be safe: it can suggest clarification, shrinking, waiting/not-your-move, or manual cemetery consideration, but it must not perform the action.",
    "",
    `Task title: ${title || "(untitled)"}`,
    `Subtasks: ${subtasks.length ? subtasks.join(" | ") : "(none)"}`,
    `Recent resistance signals: ${eventCount}`,
    "",
    "JSON shape:",
    '{"question":"short question","options":[{"id":"snake_case","label":"short button label","description":"one short explanation","suggestedNextStep":"one harmless next step","effect":"diagnose|make_smaller|clarify|not_your_move|consider_cemetery"}]}',
  ].join("\n");
}

async function buildStickyQuestDiagnosis({ task = {}, events = [], language = "" } = {}) {
  const fallback = getFallbackStickyDiagnosis(task, language);
  if (!isStickyDiagnosisEnabled()) return fallback;

  try {
    const model = await getCurrentFreeModelId();
    const data = await openRouterChatCompletion({
      model,
      messages: [
        { role: "system", content: "Return compact JSON only. You suggest UI options; you never mutate planner data." },
        { role: "user", content: buildStickyDiagnosisPrompt({ task, events, language }) },
      ],
      maxTokens: 450,
      responseFormat: { type: "json_object" },
      timeoutMs: STICKY_DIAGNOSIS_TIMEOUT_MS,
    });

    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(extractJsonObject(content));
    const options = (Array.isArray(parsed.options) ? parsed.options : [])
      .map(normalizeStickyDiagnosisOption)
      .filter(Boolean)
      .slice(0, 5);

    if (!options.length) return fallback;
    return {
      question: String(parsed.question || fallback.question).trim().slice(0, 140) || fallback.question,
      options,
      source: "llm",
      model,
    };
  } catch (error) {
    console.warn("[sticky-diagnosis]", error.message || String(error));
    return fallback;
  }
}

module.exports = {
  buildStickyQuestDiagnosis,
  getFallbackStickyDiagnosis,
};
