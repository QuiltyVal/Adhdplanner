const { appendCapture } = require("./_lib/capture-store");
const { processCapture } = require("./_lib/capture-extractor");
const { DEFAULT_MODEL: DEFAULT_OPENROUTER_MODEL, openRouterChatCompletion } = require("./_lib/openrouter");
const { getPlannerData } = require("./_lib/planner-store");
const {
  buildTaskCards,
  parseDumpUnits,
  normalizeTaskLookupText,
  isMetaTaskTitle,
  isActionableTaskTitle,
  isTaskNearDuplicate,
  normalizeAndDedupSubtasks,
  buildExecutiveStateAssessment,
} = require("./_lib/angel-lab-core");

const MAX_CAPTURE_TEXT_LENGTH = 4000;
const ANGEL_LAB_MODE = String(process.env.ANGEL_LAB_MODE || "simple").trim().toLowerCase();
const ANGEL_LAB_SIMPLE_MAX_TASKS = 5;
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_ANGEL_LAB_MODEL = String(
  process.env.OPENAI_ANGEL_LAB_MODEL
    || process.env.OPENAI_CHAT_MODEL
    || "gpt-4o-mini",
).trim() || "gpt-4o-mini";
const OPENAI_ANGEL_LAB_TIMEOUT_MS = Number.parseInt(process.env.OPENAI_ANGEL_LAB_TIMEOUT_MS || "", 10);
const OPENAI_DRAFTS_ENABLED = String(process.env.ANGEL_LAB_OPENAI_DRAFTS || "1") !== "0";

function getDefaultUserId() {
  return String(process.env.PLANNER_DEFAULT_USER_ID || "").trim();
}

function normalizeSelfTest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const before = Number(value.overloadBefore);
  const after = Number(value.overloadAfter);

  if (!Number.isInteger(before) || before < 0 || before > 10) return null;
  if (!Number.isInteger(after) || after < 0 || after > 10) return null;

  return {
    overloadBefore: before,
    overloadAfter: after,
  };
}

function normalizeCaptureSource(value) {
  const source = value == null ? "" : String(value).trim().toLowerCase();
  return source.replace(/[^a-z0-9:_-]/g, "_").slice(0, 80);
}

function buildCaptureOrigin(source) {
  const normalizedSource = normalizeCaptureSource(source);
  if (!normalizedSource) {
    return {
      channel: "web",
      via: "captures_api",
    };
  }

  if (
    normalizedSource === "mcp" ||
    normalizedSource.startsWith("mcp_") ||
    normalizedSource.startsWith("mcp:") ||
    normalizedSource.includes("claude_mcp")
  ) {
    return {
      channel: "mcp",
      via: "captures_api",
      source: normalizedSource,
    };
  }

  if (normalizedSource === "api" || normalizedSource.startsWith("api_") || normalizedSource.startsWith("api:")) {
    return {
      channel: "api",
      via: "captures_api",
      source: normalizedSource,
    };
  }

  return {
    channel: "web",
    via: "captures_api",
    source: normalizedSource,
  };
}

function readJsonBody(req) {
  if (!req || typeof req.body === "undefined" || req.body === null) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_error) {
      return null;
    }
  }
  if (typeof req.body === "object") return req.body;
  return null;
}

function validateInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, statusCode: 400, message: "Invalid JSON body" };
  }

  const text = String(body.text || "").trim();
  if (!text) {
    return { ok: false, statusCode: 400, message: "text is required" };
  }
  if (text.length > MAX_CAPTURE_TEXT_LENGTH) {
    return { ok: false, statusCode: 400, message: "text is too long" };
  }

  const dryRun = body.dryRun === true || body.dryRun === "1";
  const userId = getDefaultUserId();
  if (!userId && !dryRun) {
    return { ok: false, statusCode: 503, message: "PLANNER_DEFAULT_USER_ID is not configured" };
  }

  const source = body.source == null ? null : String(body.source).trim() || null;
  const origin = buildCaptureOrigin(source);
  const idempotencyKey = body.idempotencyKey == null ? "" : String(body.idempotencyKey).trim();
  const activeTasksSnapshot = Array.isArray(body.activeTasks) ? body.activeTasks : [];
  const activeTasks = activeTasksSnapshot
    .map((task) => ({
      id: String(task?.id || "").trim(),
      text: String(task?.text || "").trim(),
      status: String(task?.status || "active").trim() || "active",
      subtasks: Array.isArray(task?.subtasks)
        ? task.subtasks
          .map((subtask) => ({
            id: String(subtask?.id || "").trim(),
            text: String(subtask?.text || "").trim(),
            completed: Boolean(subtask?.completed),
          }))
          .filter((subtask) => subtask.text)
          .slice(0, 50)
        : [],
      isToday: Boolean(task?.isToday),
      isVital: Boolean(task?.isVital),
      urgency: String(task?.urgency || "").trim(),
      resistance: String(task?.resistance || "").trim(),
      deadlineAt: Number(task?.deadlineAt || task?.deadline || 0) || null,
    }))
    .filter((task) => task.id && task.text)
    .slice(0, 300);

  const selfTest = body.selfTest == null ? null : normalizeSelfTest(body.selfTest);
  if (body.selfTest != null && !selfTest) {
    return { ok: false, statusCode: 400, message: "selfTest must include overloadBefore/overloadAfter in range 0..10" };
  }

  return {
    ok: true,
    input: {
      userId,
      text,
      source,
      origin,
      idempotencyKey,
      activeTasks,
      selfTest,
      dryRun,
    },
  };
}

function normalizeTaskLine(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-•–—,.;:]+/, "")
    .trim();
}

function normalizeSubtaskList(values = []) {
  const seen = new Set();
  const result = [];

  for (const rawItem of Array.isArray(values) ? values : []) {
    const item = typeof rawItem === "string"
      ? rawItem
      : (rawItem && typeof rawItem === "object" ? rawItem.text || rawItem.title || "" : "");
    const normalized = normalizeTaskLine(item);
    if (!normalized || normalized.length < 3) continue;
    const key = normalized.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= 5) break;
  }

  return result;
}

const AI_MERGE_STOPWORDS = new Set([
  "и",
  "или",
  "в",
  "во",
  "на",
  "к",
  "ко",
  "по",
  "для",
  "за",
  "с",
  "со",
  "от",
  "до",
  "про",
  "the",
  "a",
  "an",
  "to",
  "for",
  "of",
  "and",
  "or",
  "in",
  "on",
  "with",
]);

function getAiMergeTokens(value = "") {
  return normalizeTaskLookupText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !AI_MERGE_STOPWORDS.has(token));
}

function countSharedAiMergeTokens(left = "", right = "") {
  const leftTokens = new Set(getAiMergeTokens(left));
  if (!leftTokens.size) return 0;
  return getAiMergeTokens(right).filter((token) => leftTokens.has(token)).length;
}

function getTaskMergeContextTexts(task = {}) {
  const title = String(task?.text || task?.title || "").trim();
  const subtasks = Array.isArray(task?.subtasks)
    ? task.subtasks
      .filter((subtask) => !subtask?.completed)
      .map((subtask) => String(subtask?.text || "").trim())
      .filter(Boolean)
    : [];
  return [title, ...subtasks].filter(Boolean);
}

function hasSafeAiMergeAnchor({ requestedTitle = "", targetTask = null, normalizedStepTexts = [] } = {}) {
  if (!targetTask) return false;

  const targetTitle = String(targetTask?.text || targetTask?.title || "").trim();
  if (!targetTitle) return false;

  const titleAnchored = Boolean(requestedTitle) && (
    isTaskNearDuplicate(requestedTitle, targetTitle) ||
    countSharedAiMergeTokens(requestedTitle, targetTitle) >= 2
  );

  const steps = Array.isArray(normalizedStepTexts) ? normalizedStepTexts.filter(Boolean) : [];
  if (!steps.length) return titleAnchored;

  const contextTexts = getTaskMergeContextTexts(targetTask);
  const anchoredStepCount = steps.filter((stepText) => (
    contextTexts.some((contextText) => (
      isTaskNearDuplicate(stepText, contextText) ||
      countSharedAiMergeTokens(stepText, contextText) >= 2
    ))
  )).length;

  if (anchoredStepCount === steps.length) return true;
  return titleAnchored && anchoredStepCount >= Math.max(1, Math.ceil(steps.length / 2));
}

function pushUnsafeMergeStepAsCreateCard({ result, stepText = "" } = {}) {
  if (!Array.isArray(result) || result.length >= ANGEL_LAB_SIMPLE_MAX_TASKS) return false;

  const title = normalizeTaskLine(stepText);
  const lookupTitle = normalizeTaskLookupText(title);
  if (!lookupTitle || isMetaTaskTitle(lookupTitle) || !isActionableTaskTitle(lookupTitle)) return false;
  if (result.some((card) => isTaskNearDuplicate(card.title, title))) return false;

  result.push({
    id: `create-${result.length + 1}`,
    title,
    mode: "create",
    targetTaskId: null,
    confidence: 0.72,
    reason: "unsafe_ai_merge_split",
    subtasks: [],
  });
  return true;
}

function isPortfolioDemoProjectText(value = "") {
  const normalized = normalizeTaskLookupText(value);
  if (!normalized) return false;

  return (
    /\bapus\b/i.test(normalized) ||
    /портфолио|portfolio|кейс|case\s*study/.test(normalized) ||
    /демо|demo|видео|video|screen\s*record|записать\s+экран/.test(normalized) ||
    /скриншот|screenshot|ключев(ых|ые)\s+функц/.test(normalized)
  );
}

function isProjectMicroAction(value = "") {
  const normalized = normalizeTaskLookupText(value);
  if (!normalized) return false;
  return (
    /^открыть\s+проект/.test(normalized) ||
    /^сделать\s+скриншот/.test(normalized) ||
    /^записать\s+экран/.test(normalized) ||
    /^record\s+/.test(normalized) ||
    /^open\s+/.test(normalized) ||
    /^capture\s+/.test(normalized)
  );
}

function getPortfolioDemoGroupTitle(dumpText = "", cards = []) {
  const normalizedDump = normalizeTaskLookupText(dumpText);
  const combined = normalizeTaskLookupText(cards.map((card) => card?.title || "").join(" "));
  const hasApus = /\bapus\b/i.test(`${normalizedDump} ${combined}`);
  const hasPortfolio = /портфолио|portfolio|кейс|case\s*study/.test(`${normalizedDump} ${combined}`);

  if (hasApus && hasPortfolio) return "Подготовить блок для портфолио про Apus Planner";
  if (hasApus) return "Подготовить демо-материалы про Apus Planner";
  if (hasPortfolio) return "Подготовить блок для портфолио";
  return "Подготовить демо-материалы";
}

function getPortfolioDemoSpecificStepTexts(dumpText = "", title = "") {
  const normalized = normalizeTaskLookupText(`${dumpText} ${title}`);
  if (!isPortfolioDemoProjectText(normalized)) return [];

  const hasApus = /\bapus\b/i.test(normalized);
  const hasPortfolio = /портфолио|portfolio|кейс|case\s*study/.test(normalized);
  const hasDemo = /демо|demo|видео|video|screen\s*record|записать\s+экран/.test(normalized);
  const hasScreenshots = /скриншот|screenshot|ключев(ых|ые)\s+функц/.test(normalized);

  const appLabel = hasApus ? "Apus Planner" : "проекта";
  const steps = [];

  if (hasApus || hasPortfolio || hasDemo) {
    steps.push(hasApus ? "Открыть Apus Planner demo" : "Открыть проект");
  }
  if (hasPortfolio || hasScreenshots) {
    steps.push(hasApus
      ? "Сделать 3 скриншота: Angel Lab, Quest Loop, Progress"
      : "Сделать 3 скриншота ключевых функций");
  }
  if (hasDemo) {
    steps.push(hasApus
      ? "Записать 30-секундное демо-видео Apus Planner"
      : "Записать короткое демо-видео");
  }
  if (hasPortfolio) {
    steps.push(hasApus
      ? "Написать 3 предложения для portfolio block про Apus Planner"
      : `Написать 3 предложения для portfolio block ${appLabel}`);
  }

  return steps
    .filter(Boolean)
    .filter((step, index, list) => list.findIndex((candidate) => isTaskNearDuplicate(candidate, step)) === index)
    .slice(0, 4);
}

function isGenericPortfolioDemoStep(value = "") {
  const normalized = normalizeTaskLookupText(value);
  if (!normalized) return true;

  return (
    /^собрать\s+материал/.test(normalized) ||
    /^создать\s+визуальн/.test(normalized) ||
    /^собрать\s+все\s+в\s+один\s+документ/.test(normalized) ||
    /^написать\s+краткое\s+описание$/.test(normalized) ||
    /^подготовить\s+материал/.test(normalized) ||
    /^составить\s+план/.test(normalized)
  );
}

function normalizePortfolioDemoSubtasks({ dumpText = "", title = "", subtasks = [] } = {}) {
  const specificSteps = getPortfolioDemoSpecificStepTexts(dumpText, title);
  const existingTexts = (Array.isArray(subtasks) ? subtasks : [])
    .map((subtask) => (typeof subtask === "string" ? subtask : subtask?.text || ""))
    .filter(Boolean)
    .filter((text) => specificSteps.length === 0 || !isGenericPortfolioDemoStep(text));

  const merged = [...specificSteps, ...existingTexts]
    .filter(Boolean)
    .filter((step, index, list) => list.findIndex((candidate) => isTaskNearDuplicate(candidate, step)) === index)
    .slice(0, 4);

  return merged.map((text, index) => ({
    text,
    selectedByDefault: index === 0,
    source: specificSteps.some((step) => isTaskNearDuplicate(step, text))
      ? "portfolio_dump_specific"
      : "llm",
    confidence: specificSteps.some((step) => isTaskNearDuplicate(step, text)) ? 0.82 : 0.74,
  }));
}

function normalizePortfolioDemoCard(card = {}, dumpText = "") {
  if (!card || card.mode !== "create" || !isPortfolioDemoProjectText(card.title || "")) return card;
  return {
    ...card,
    subtasks: normalizePortfolioDemoSubtasks({
      dumpText,
      title: card.title || "",
      subtasks: card.subtasks || [],
    }),
  };
}

function getSubtaskText(value) {
  return typeof value === "string" ? value : String(value?.text || value?.title || "").trim();
}

function isGenericAngelLabSubtask(value = "") {
  const normalized = normalizeTaskLookupText(value);
  if (!normalized) return true;
  return (
    /^собрать\s+материал/.test(normalized) ||
    /^создать\s+визуальн/.test(normalized) ||
    /^собрать\s+все\s+в\s+один\s+документ/.test(normalized) ||
    /^написать\s+краткое\s+описание$/.test(normalized) ||
    /^подготовить\s+материал/.test(normalized) ||
    /^составить\s+план/.test(normalized) ||
    /^определить\s+приоритет/.test(normalized) ||
    /^запланировать\s+время/.test(normalized) ||
    /^собрать\s+деньги/.test(normalized) ||
    /^найти\s+ресурс/.test(normalized) ||
    /^разобраться\s+с\s+задач/.test(normalized)
  );
}

function getAngelLabDraftTopic(value = "") {
  const normalized = normalizeTaskLookupText(value);
  if (!normalized) return "unknown";
  if (isPortfolioDemoProjectText(normalized)) return "portfolio_demo";
  if (/jobcenter|джобцентр|burgergeld|bürgergeld|письм|конверт|документ/.test(normalized)) return "documents";
  if (/корм|кот|кошк|cat\s*food|pet\s*food/.test(normalized)) return "cat_food";
  if (/видео|demo|демо|screen\s*record|записать\s+экран/.test(normalized)) return "recording";
  if (/скриншот|screenshot/.test(normalized)) return "screenshots";
  return "unknown";
}

function getAngelLabSubtaskTopic(value = "") {
  const normalized = normalizeTaskLookupText(value);
  if (!normalized) return "unknown";
  if (isPortfolioDemoProjectText(normalized) || /portfolio|портфолио|apus|quest\s*loop|angel\s*lab|progress/.test(normalized)) {
    return "portfolio_demo";
  }
  if (/jobcenter|джобцентр|burgergeld|bürgergeld|письм|конверт|документ|дедлайн|требован/.test(normalized)) {
    return "documents";
  }
  if (/корм|кот|кошк|cat\s*food|pet\s*food|магазин|корзин/.test(normalized)) {
    return "cat_food";
  }
  if (/видео|demo|демо|screen\s*record|записать\s+экран/.test(normalized)) {
    return "recording";
  }
  if (/скриншот|screenshot/.test(normalized)) {
    return "screenshots";
  }
  return "unknown";
}

function isAngelLabSubtaskOffTopicForCard(cardTitle = "", subtaskText = "") {
  const cardTopic = getAngelLabDraftTopic(cardTitle);
  const subtaskTopic = getAngelLabSubtaskTopic(subtaskText);
  if (cardTopic === "unknown" || subtaskTopic === "unknown") return false;
  if (cardTopic === subtaskTopic) return false;

  if (cardTopic === "portfolio_demo" && (subtaskTopic === "recording" || subtaskTopic === "screenshots")) return false;
  if ((cardTopic === "recording" || cardTopic === "screenshots") && subtaskTopic === "portfolio_demo") return false;

  return true;
}

function normalizeAngelLabDraftQuality(card = {}) {
  if (!card || (card.mode !== "create" && card.mode !== "merge")) return card;

  const subtasks = Array.isArray(card.subtasks) ? card.subtasks : [];
  const filteredSubtasks = subtasks
    .filter((subtask) => {
      const text = getSubtaskText(subtask);
      if (!text) return false;
      if (isGenericAngelLabSubtask(text)) return false;
      if (isAngelLabSubtaskOffTopicForCard(card.title || "", text)) return false;
      return true;
    })
    .filter((subtask, index, list) => {
      const text = getSubtaskText(subtask);
      return list.findIndex((candidate) => isTaskNearDuplicate(getSubtaskText(candidate), text)) === index;
    })
    .slice(0, 4);

  return {
    ...card,
    subtasks: filteredSubtasks,
    draftQuality: {
      ...(card.draftQuality || {}),
      contractVersion: 1,
      postprocessed: true,
      removedSubtasks: Math.max(0, subtasks.length - filteredSubtasks.length),
      needsClarification: card.mode === "create" && filteredSubtasks.length === 0,
    },
  };
}

function splitAngelLabCombinedTitle(value = "") {
  const title = normalizeTaskLine(value);
  if (!title) return [];
  if (!/\s(и|and)\s|[,;]/i.test(title)) return [];

  return title
    .split(/\s*(?:,|;|\s+и\s+|\s+and\s+)\s*/i)
    .map((part) => normalizeTaskLine(part))
    .filter((part) => {
      const lookup = normalizeTaskLookupText(part);
      if (!lookup || lookup.length < 5) return false;
      if (isMetaTaskTitle(lookup)) return false;
      return isActionableTaskTitle(lookup);
    })
    .filter((part, index, list) => list.findIndex((candidate) => isTaskNearDuplicate(candidate, part)) === index)
    .slice(0, ANGEL_LAB_SIMPLE_MAX_TASKS);
}

function splitCombinedAngelLabCard(card = {}, dumpText = "") {
  if (!card || card.mode !== "create") return [card];
  const parts = splitAngelLabCombinedTitle(card.title || "");
  if (parts.length < 2) return [card];

  const originalSubtasks = Array.isArray(card.subtasks) ? card.subtasks : [];
  return parts.map((title, index) => {
    const topic = getAngelLabDraftTopic(title);
    const topicSubtasks = originalSubtasks.filter((subtask) => {
      const text = getSubtaskText(subtask);
      if (!text) return false;
      const subtaskTopic = getAngelLabSubtaskTopic(text);
      return subtaskTopic === "unknown" || topic === "unknown" || subtaskTopic === topic;
    });
    const categorySteps = getCategorySpecificSubtasks({ dumpText, title });
    const subtasks = categorySteps.length
      ? categorySteps.map((text, stepIndex) => ({
        text,
        selectedByDefault: stepIndex === 0,
        source: "combined_title_split_category",
        confidence: 0.8,
      }))
      : topicSubtasks;

    return {
      ...card,
      id: `${card.id || "split"}-${index + 1}`,
      title,
      confidence: Math.max(0.68, Number(card.confidence || 0.72) - 0.04),
      reason: "combined_title_split",
      subtasks,
    };
  });
}

function getCategorySpecificSubtasks({ dumpText = "", title = "" } = {}) {
  const normalized = normalizeTaskLookupText(`${dumpText} ${title}`);
  const titleKey = normalizeTaskLookupText(title);

  if (/корм|кот|кошк|cat\s*food|pet\s*food/.test(titleKey) && /купить|заказать|buy|order/.test(titleKey)) {
    return [
      "Проверить, какой корм нужен",
      "Открыть магазин или приложение для заказа",
      "Добавить корм в корзину или список",
      "Купить или заказать корм",
    ];
  }

  if (/jobcenter|джобцентр|burgergeld|bürgergeld|письм|конверт/.test(titleKey) && /письм|разобрать|открыть|прочитать|jobcenter|джобцентр/.test(titleKey)) {
    return [
      "Собрать письма в одно место",
      "Открыть первое письмо",
      "Выписать важные даты или требования",
      "Сфотографировать или сохранить письмо",
    ];
  }

  if (isPortfolioDemoProjectText(titleKey)) {
    return getPortfolioDemoSpecificStepTexts(dumpText, title);
  }

  if (/видео|demo|демо|screen\s*record|записать\s+экран/.test(titleKey) && /записать|снять|record/.test(titleKey)) {
    return [
      "Открыть нужный экран демо",
      "Включить запись экрана",
      "Показать один короткий сценарий",
      "Остановить запись и сохранить файл",
    ];
  }

  if (/скриншот|screenshot/.test(titleKey) && /сделать|снять|capture/.test(titleKey)) {
    return [
      "Открыть первый нужный экран",
      "Сделать скриншот",
      "Переименовать файл понятно",
      "Повторить для следующих экранов",
    ];
  }

  return [];
}

function polishAngelLabCardSubtasks(card = {}, dumpText = "") {
  if (!card || (card.mode !== "create" && card.mode !== "merge")) return card;

  const categorySteps = getCategorySpecificSubtasks({ dumpText, title: card.title || "" });
  if (!categorySteps.length) return normalizePortfolioDemoCard(card, dumpText);

  const existing = (Array.isArray(card.subtasks) ? card.subtasks : [])
    .filter((subtask) => {
      const text = getSubtaskText(subtask);
      if (!text) return false;
      return !isGenericAngelLabSubtask(text);
    });

  const mergedTexts = [
    ...categorySteps,
    ...existing.map((subtask) => getSubtaskText(subtask)),
  ]
    .filter(Boolean)
    .filter((text, index, list) => list.findIndex((candidate) => isTaskNearDuplicate(candidate, text)) === index)
    .slice(0, 4);

  return {
    ...card,
    subtasks: mergedTexts.map((text, index) => {
      const original = existing.find((subtask) => isTaskNearDuplicate(getSubtaskText(subtask), text));
      if (original && typeof original === "object") {
        return {
          ...original,
          text,
        };
      }
      return {
        text,
        selectedByDefault: index === 0,
        source: "category_postprocess",
        confidence: 0.8,
      };
    }),
  };
}

function isAngelLabMetaNoiseCard(card = {}) {
  if (!card || card.mode !== "create") return false;
  const title = normalizeTaskLookupText(card.title || "");
  const reason = normalizeTaskLookupText(card.reason || "");
  if (!title) return true;

  const looksLikeMetaState = (
    /^я\s+не\s+понимаю/.test(title) ||
    /^не\s+понимаю/.test(title) ||
    /с\s+чего\s+начать/.test(title) ||
    /все\s+кажется\s+срочн/.test(title) ||
    /всё\s+кажется\s+срочн/.test(title) ||
    /\bi\s+do\s+not\s+know\s+where\s+to\s+start\b/.test(title) ||
    /\bi\s+don't\s+know\s+where\s+to\s+start\b/.test(title) ||
    /\beverything\s+feels\s+urgent\b/.test(title)
  );
  if (!looksLikeMetaState) return false;

  const hasTaskSignal = /jobcenter|джобцентр|корм|кот|кошк|portfolio|портфолио|apus|demo|демо|видео|письм|купить|разобрать|подготовить|записать/.test(title);
  if (hasTaskSignal) return false;

  const subtasks = Array.isArray(card.subtasks) ? card.subtasks.filter((subtask) => getSubtaskText(subtask)) : [];
  return subtasks.length === 0 || /noise|unclear|skip|мета|состояни/.test(reason);
}

function polishAngelLabTaskCards(taskCards = [], dumpText = "") {
  return (Array.isArray(taskCards) ? taskCards : [])
    .filter((card) => !isAngelLabMetaNoiseCard(card))
    .flatMap((card) => splitCombinedAngelLabCard(card, dumpText))
    .map((card) => (
      normalizeAngelLabDraftQuality(polishAngelLabCardSubtasks(normalizePortfolioDemoCard(card, dumpText), dumpText))
    ))
    .slice(0, ANGEL_LAB_SIMPLE_MAX_TASKS);
}

function groupPortfolioDemoDraftCards(cards = [], dumpText = "") {
  const result = [];
  let projectGroup = [];

  const flushProjectGroup = () => {
    if (projectGroup.length >= 2) {
      const title = getPortfolioDemoGroupTitle(dumpText, projectGroup);
      const subtasks = projectGroup
        .flatMap((card) => [
          ...(Array.isArray(card?.subtasks) ? card.subtasks.map((subtask) => subtask?.text || subtask).filter(Boolean) : []),
          isProjectMicroAction(card?.title || "") ? card.title : "",
        ])
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex((candidate) => isTaskNearDuplicate(candidate, item)) === index)
        .slice(0, 4)
        .map((text, index) => ({
          text,
          selectedByDefault: index === 0,
          source: "project_grouping",
          confidence: 0.78,
        }));

      result.push({
        id: `create-${result.length + 1}`,
        title,
        mode: "create",
        targetTaskId: null,
        confidence: Math.max(...projectGroup.map((card) => Number(card?.confidence || 0.72)), 0.72),
        reason: "portfolio_demo_project_group",
        subtasks: normalizePortfolioDemoSubtasks({ dumpText, title, subtasks }),
      });
    } else {
      result.push(...projectGroup);
    }
    projectGroup = [];
  };

  for (const card of Array.isArray(cards) ? cards : []) {
    const canGroup = card?.mode === "create" && isPortfolioDemoProjectText(card?.title || "");
    if (canGroup) {
      projectGroup.push(card);
      continue;
    }
    flushProjectGroup();
    result.push(card);
  }
  flushProjectGroup();

  return result
    .slice(0, ANGEL_LAB_SIMPLE_MAX_TASKS)
    .map((card, index) => ({
      ...normalizePortfolioDemoCard(card, dumpText),
      id: `${card.mode || "create"}-${index + 1}`,
    }));
}

function toDisplayTaskTitle(value = "") {
  const normalized = normalizeTaskLookupText(value);
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildSimpleBrainDumpTaskCards({ dumpText = "", extractionCandidateTasks = [] } = {}) {
  const unitCandidates = parseDumpUnits(dumpText)
    .filter((unit) => unit && !unit.meta && unit.actionable)
    .map((unit) => normalizeTaskLookupText(unit.text || ""))
    .filter(Boolean);

  const extractionCandidates = (Array.isArray(extractionCandidateTasks) ? extractionCandidateTasks : [])
    .map((item) => normalizeTaskLookupText(item && typeof item === "object" ? item.text : item))
    .filter(Boolean);

  const taskCandidates = [...unitCandidates, ...extractionCandidates];
  const unique = [];

  for (const candidate of taskCandidates) {
    if (!candidate) continue;
    if (isMetaTaskTitle(candidate)) continue;
    if (!isActionableTaskTitle(candidate)) continue;
    if (unique.some((item) => isTaskNearDuplicate(item, candidate))) continue;
    unique.push(candidate);
    if (unique.length >= ANGEL_LAB_SIMPLE_MAX_TASKS) break;
  }

  if (!unique.length) {
    const fallback = normalizeTaskLookupText(dumpText);
    if (fallback && !isMetaTaskTitle(fallback) && isActionableTaskTitle(fallback)) {
      unique.push(fallback);
    }
  }

  return unique.slice(0, ANGEL_LAB_SIMPLE_MAX_TASKS).map((title, index) => ({
    id: `create-${index + 1}`,
    title: toDisplayTaskTitle(title),
    mode: "create",
    targetTaskId: null,
    confidence: 0.72,
    reason: "brain_dump_task",
    subtasks: [],
  }));
}

async function getActiveTasksSafe(userId) {
  try {
    const plannerData = await getPlannerData(userId);
    return Array.isArray(plannerData?.tasks) ? plannerData.tasks : [];
  } catch (_error) {
    return [];
  }
}

function extractJsonObject(rawText = "") {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("Model returned empty response");
  if (text.startsWith("{") && text.endsWith("}")) return text;

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const startIndex = text.indexOf("{");
  const endIndex = text.lastIndexOf("}");
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return text.slice(startIndex, endIndex + 1);
  }

  throw new Error("Model did not return JSON object");
}

function getOpenAiAngelLabTimeoutMs() {
  return Number.isFinite(OPENAI_ANGEL_LAB_TIMEOUT_MS) && OPENAI_ANGEL_LAB_TIMEOUT_MS >= 3000
    ? OPENAI_ANGEL_LAB_TIMEOUT_MS
    : 12000;
}

function hasOpenRouterAngelLabKey() {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.REACT_APP_OPENROUTER_KEY);
}

async function openAiAngelLabCompletion({ messages, maxTokens = 900 } = {}) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  const timeoutMs = getOpenAiAngelLabTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_ANGEL_LAB_MODEL,
        messages,
        max_tokens: Math.min(Number(maxTokens) || 900, 1400),
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      throw new Error(`OpenAI ${upstream.status}: ${text}`);
    }

    return JSON.parse(text);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildAngelLabAiCompletion({ messages, maxTokens = 900 } = {}) {
  const providerErrors = [];

  if (OPENAI_API_KEY) {
    try {
      const completion = await openAiAngelLabCompletion({ messages, maxTokens });
      return {
        completion,
        provider: "openai",
        model: OPENAI_ANGEL_LAB_MODEL,
      };
    } catch (error) {
      providerErrors.push(`OpenAI: ${error?.message || "failed"}`);
    }
  } else {
    providerErrors.push("OpenAI: OPENAI_API_KEY is not configured");
  }

  if (hasOpenRouterAngelLabKey()) {
    try {
      const completion = await openRouterChatCompletion({
        messages,
        maxTokens,
        responseFormat: { type: "json_object" },
        timeoutMs: getOpenAiAngelLabTimeoutMs(),
      });
      return {
        completion,
        provider: "openrouter",
        model: process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
      };
    } catch (error) {
      providerErrors.push(`OpenRouter: ${error?.message || "failed"}`);
    }
  } else {
    providerErrors.push("OpenRouter: OPENROUTER_API_KEY is not configured");
  }

  throw new Error(providerErrors.join("; "));
}

function normalizeAiDraftCards({ rawCards = [], activeTasks = [], dumpText = "" } = {}) {
  const active = Array.isArray(activeTasks) ? activeTasks : [];
  const activeById = new Map(active.map((task) => [String(task?.id || ""), task]));
  const result = [];

  for (const rawCard of Array.isArray(rawCards) ? rawCards : []) {
    if (result.length >= ANGEL_LAB_SIMPLE_MAX_TASKS) break;
    if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) continue;

    const requestedMode = String(rawCard.mode || "create").trim().toLowerCase();
    let mode = requestedMode === "merge" || requestedMode === "reject" ? requestedMode : "create";
    let targetTaskId = rawCard.targetTaskId == null ? "" : String(rawCard.targetTaskId).trim();
    const targetTask = targetTaskId ? activeById.get(targetTaskId) : null;

    if (mode === "merge" && !targetTask) {
      mode = "create";
      targetTaskId = "";
    }

    const rawSteps = Array.isArray(rawCard.subtasks)
      ? rawCard.subtasks
      : (Array.isArray(rawCard.steps) ? rawCard.steps : []);
    const normalizedStepTexts = normalizeSubtaskList(rawSteps);
    const requestedTitle = normalizeTaskLine(rawCard.title || rawCard.text || rawCard.task || "");

    if (
      mode === "merge" &&
      targetTask &&
      !hasSafeAiMergeAnchor({ requestedTitle, targetTask, normalizedStepTexts })
    ) {
      let splitCount = 0;
      for (const stepText of normalizedStepTexts) {
        if (pushUnsafeMergeStepAsCreateCard({ result, stepText })) {
          splitCount += 1;
        }
        if (result.length >= ANGEL_LAB_SIMPLE_MAX_TASKS) break;
      }
      if (splitCount > 0) continue;
      mode = "create";
      targetTaskId = "";
    }

    const rawTitle = mode === "merge"
      ? targetTask?.text
      : requestedTitle;
    let title = normalizeTaskLine(rawTitle);
    if (!title) continue;

    if (mode === "create") {
      const lookupTitle = normalizeTaskLookupText(title);
      if (!lookupTitle || isMetaTaskTitle(lookupTitle) || !isActionableTaskTitle(lookupTitle)) {
        mode = "reject";
      }
    }

    if (result.some((card) => isTaskNearDuplicate(card.title, title))) continue;

    const subtasks = mode === "reject"
      ? []
      : normalizeAndDedupSubtasks({
        parentTitle: title,
        sourceSubtasks: [],
        existingSubtasks: mode === "merge" ? (targetTask?.subtasks || []) : [],
        aiHints: normalizedStepTexts,
        otherCardTitles: result.map((card) => card.title),
      });

    const confidence = Number(rawCard.confidence || 0.82);
    result.push({
      id: `${mode}-${result.length + 1}`,
      title,
      mode,
      targetTaskId: mode === "merge" ? targetTaskId : null,
      confidence: Number(Math.min(1, Math.max(0.45, Number.isFinite(confidence) ? confidence : 0.82)).toFixed(3)),
      reason: String(rawCard.reason || "openai_brain_dump_draft").slice(0, 80),
      subtasks,
    });
  }

  return groupPortfolioDemoDraftCards(result, dumpText);
}

async function buildOpenAiBrainDumpTaskCards({ dumpText = "", activeTasks = [] } = {}) {
  if (!OPENAI_DRAFTS_ENABLED) {
    return { taskCards: [], skipped: true, reason: "disabled" };
  }
  if (!OPENAI_API_KEY && !hasOpenRouterAngelLabKey()) {
    return { taskCards: [], skipped: true, reason: "no_ai_provider" };
  }

  const activeForPrompt = (Array.isArray(activeTasks) ? activeTasks : [])
    .filter((task) => task?.status === "active")
    .slice(0, 40)
    .map((task) => ({
      id: String(task?.id || ""),
      title: String(task?.text || task?.title || "").slice(0, 160),
      openSteps: Array.isArray(task?.subtasks)
        ? task.subtasks
          .filter((subtask) => !subtask?.completed)
          .map((subtask) => String(subtask?.text || "").slice(0, 120))
          .filter(Boolean)
          .slice(0, 5)
        : [],
    }));

  const aiResult = await buildAngelLabAiCompletion({
    messages: [
      {
        role: "system",
        content: [
          "You convert a messy ADHD brain dump into safe draft task cards.",
          "Return only JSON.",
          "Do not complete, delete, bury, schedule, or mutate tasks.",
          "You may propose draft cards and optional micro-steps only.",
          "Use the user's language for titles and steps.",
          "Split independent real-life needs into separate cards. Example: 'купить корм коту и записаться к врачу' should become two cards, not one combined task.",
          "Subtasks must be concrete actions for that exact card. Avoid generic planning steps when the task is already simple.",
          "Do not invent prerequisites the user did not imply, such as 'collect money', 'make a plan', or 'create visual elements'.",
          "For simple errands, make the first step visible and concrete: check what is needed, open the relevant app/site, write down the item, buy/order/go.",
          "If the user says several independent needs in one sentence, keep them as separate cards even if they share the same life area.",
          "For Apus Planner portfolio/demo work, preserve concrete artifact steps: open Apus demo, screenshot Angel Lab/Quest Loop/Progress, record a short demo video, write 3 portfolio sentences. Do not replace these with generic steps like 'collect materials' or 'create visual elements'.",
          "If a dump item clearly belongs to an existing active task, use mode=merge and its exact targetTaskId.",
          "If uncertain, use mode=create. If it is only emotion/noise, use mode=reject.",
          "Max 5 cards. Max 4 short micro-steps per card. First step should be a 2-minute visible action.",
          "Schema: {\"detectedLanguage\":\"ru|en|auto\",\"cards\":[{\"mode\":\"create|merge|reject\",\"targetTaskId\":\"existing id or null\",\"title\":\"...\",\"subtasks\":[\"...\"],\"confidence\":0.0,\"reason\":\"...\"}]}",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          dumpText,
          activeTasks: activeForPrompt,
        }),
      },
    ],
  });

  const content = aiResult.completion?.choices?.[0]?.message?.content || "";
  const payload = JSON.parse(extractJsonObject(content));
  const taskCards = normalizeAiDraftCards({
    rawCards: payload?.cards || payload?.taskCards || [],
    activeTasks,
    dumpText,
  });

  return {
    taskCards,
    detectedLanguage: String(payload?.detectedLanguage || "auto").slice(0, 12),
    model: aiResult.model || OPENAI_ANGEL_LAB_MODEL,
    provider: aiResult.provider || "openai",
    skipped: false,
  };
}

async function buildAiOptionalSubtasksForCard({ dumpText = "", card = null, activeTask = null } = {}) {
  if (!process.env.OPENROUTER_API_KEY) return [];
  if (!card || (card.mode !== "create" && card.mode !== "merge")) return [];

  const existingCount = Array.isArray(card.subtasks) ? card.subtasks.length : 0;
  const needsFallback = card.mode === "create" ? existingCount < 2 : existingCount < 1;
  if (!needsFallback) return [];

  const existingTaskSubtasks = Array.isArray(activeTask?.subtasks)
    ? activeTask.subtasks
      .filter((subtask) => !subtask?.completed)
      .map((subtask) => String(subtask?.text || "").trim())
      .filter(Boolean)
    : [];

  try {
    const completion = await openRouterChatCompletion({
      messages: [
        {
          role: "system",
          content: [
            "Ты предлагаешь ОПЦИОНАЛЬНЫЕ подшаги для одной карточки задачи на русском.",
            "Не создавай новые верхнеуровневые задачи.",
            "Если не уверен — верни пустой список.",
            "Верни ТОЛЬКО JSON: {\"subtasks\":[\"...\"]}",
            "Максимум 3 коротких подшага.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            dumpText,
            cardTitle: card.title,
            mode: card.mode,
            targetTaskTitle: activeTask?.text || null,
            existingTargetSubtasks: existingTaskSubtasks,
          }),
        },
      ],
      maxTokens: 220,
      responseFormat: { type: "json_object" },
      timeoutMs: 12000,
    });

    const content = completion?.choices?.[0]?.message?.content || "";
    const payload = JSON.parse(extractJsonObject(content));
    return normalizeSubtaskList(payload?.subtasks || []);
  } catch (_error) {
    return [];
  }
}

const CREATE_CARD_AUTO_PRESELECT_ENABLED = String(process.env.ANGEL_LAB_CREATE_AUTO_PRESELECT || "1") !== "0";
const CREATE_CARD_AUTO_PRESELECT_MAX = 1;
const CREATE_CARD_AUTO_PRESELECT_MIN_CONFIDENCE = 0.68;

function isAngelLabSubtaskSelectedByDefault(subtask = {}) {
  return Boolean(subtask?.selected === true || subtask?.selectedByDefault === true || subtask?.checked === true);
}

function capAngelLabDefaultSelectedSubtasks(subtasks = [], selectedIndexes = new Set()) {
  const safeSubtasks = Array.isArray(subtasks) ? subtasks : [];
  const safeSelectedIndexes = selectedIndexes instanceof Set ? selectedIndexes : new Set();
  let keptSelected = false;

  return safeSubtasks.map((subtask, index) => {
    const shouldKeepSelected = safeSelectedIndexes.has(index) && !keptSelected;
    if (shouldKeepSelected) {
      keptSelected = true;
      return {
        ...subtask,
        selected: true,
        selectedByDefault: true,
        checked: false,
      };
    }

    return {
      ...subtask,
      selected: false,
      selectedByDefault: false,
      checked: false,
    };
  });
}

function applyCreateCardSubtaskPreselection(taskCards = []) {
  const safeCards = Array.isArray(taskCards) ? taskCards : [];
  if (!CREATE_CARD_AUTO_PRESELECT_ENABLED) return safeCards;

  return safeCards.map((card) => {
    if (!card || card.mode !== "create") return card;

    const subtasks = Array.isArray(card.subtasks) ? card.subtasks : [];
    if (!subtasks.length) return card;

    const ranked = subtasks
      .map((subtask, index) => ({
        ...subtask,
        index,
        confidence: Number(subtask?.confidence || 0),
      }))
      .sort((left, right) => (
        (right.confidence - left.confidence) ||
        (left.index - right.index)
      ));

    const selectedIndexes = new Set();

    for (const candidate of subtasks.map((subtask, index) => ({ subtask, index }))) {
      if (selectedIndexes.size >= CREATE_CARD_AUTO_PRESELECT_MAX) break;
      if (isAngelLabSubtaskSelectedByDefault(candidate.subtask)) selectedIndexes.add(candidate.index);
    }

    if (selectedIndexes.size > 0) {
      return {
        ...card,
        subtasks: capAngelLabDefaultSelectedSubtasks(subtasks, selectedIndexes),
      };
    }

    for (const candidate of ranked) {
      if (selectedIndexes.size >= CREATE_CARD_AUTO_PRESELECT_MAX) break;
      if (selectedIndexes.has(candidate.index)) continue;
      if (candidate.confidence >= CREATE_CARD_AUTO_PRESELECT_MIN_CONFIDENCE) {
        selectedIndexes.add(candidate.index);
      }
    }

    if (selectedIndexes.size === 0 && ranked[0]) {
      selectedIndexes.add(ranked[0].index);
    }

    return {
      ...card,
      subtasks: capAngelLabDefaultSelectedSubtasks(subtasks, selectedIndexes),
    };
  });
}

async function enrichCardsWithAiSubtasks({ taskCards = [], dumpText = "", activeTasks = [] } = {}) {
  const safeCards = Array.isArray(taskCards) ? taskCards : [];
  if (!safeCards.length) return [];

  const otherTitles = safeCards.map((card) => String(card?.title || "")).filter(Boolean);
  const enriched = [];

  for (const card of safeCards) {
    if (!card || (card.mode !== "merge" && card.mode !== "create")) {
      enriched.push(card);
      continue;
    }

    const activeTask = card.mode === "merge"
      ? (Array.isArray(activeTasks) ? activeTasks : []).find((task) => String(task?.id) === String(card.targetTaskId))
      : null;

    const aiHints = await buildAiOptionalSubtasksForCard({ dumpText, card, activeTask });
    if (!aiHints.length) {
      enriched.push(card);
      continue;
    }

    const sourceSubtasks = (Array.isArray(card.subtasks) ? card.subtasks : [])
      .map((item) => String(item?.text || "").trim())
      .filter(Boolean);

    const mergedSubtasks = normalizeAndDedupSubtasks({
      parentTitle: card.title,
      sourceSubtasks,
      existingSubtasks: card.mode === "merge" ? (activeTask?.subtasks || []) : [],
      aiHints,
      otherCardTitles: otherTitles.filter((title) => title !== card.title),
    });

    enriched.push({
      ...card,
      subtasks: mergedSubtasks,
    });
  }

  return enriched;
}

async function capturesHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  const body = readJsonBody(req);
  const validation = validateInput(body);
  if (!validation.ok) {
    res.status(validation.statusCode).json({ ok: false, error: validation.message });
    return;
  }

  try {
    let captureId = `dryrun-${Date.now()}`;
    let capture = null;
    let extraction = null;
    let extractionReplayed = false;
    let taskEnrichment = null;

    if (!validation.input.dryRun) {
      const stored = await appendCapture({
        userId: validation.input.userId,
        text: validation.input.text,
        source: validation.input.source,
        idempotencyKey: validation.input.idempotencyKey,
        selfTest: validation.input.selfTest,
        origin: validation.input.origin,
      });
      captureId = stored.captureId;
      capture = stored.capture;

      try {
        const processed = await processCapture(validation.input.userId, capture);
        extraction = processed?.extraction || null;
        extractionReplayed = Boolean(processed?.replayed);
        taskEnrichment = processed?.taskEnrichment || null;
      } catch (_error) {
        extraction = null;
        extractionReplayed = false;
        taskEnrichment = null;
      }
    }

    const activeTasks = validation.input.activeTasks.length > 0
      ? validation.input.activeTasks
      : validation.input.userId
        ? await getActiveTasksSafe(validation.input.userId)
        : [];
    const extractionCandidateTasks = Array.isArray(extraction?.candidateTasks)
      ? extraction.candidateTasks
      : [];

    const useSimpleBrainDumpMode = ANGEL_LAB_MODE !== "smart";
    let aiDraft = {
      source: "not_attempted",
      model: "",
      error: "",
      warning: "",
    };
    let openAiTaskCards = [];

    try {
      const openAiDraft = await buildOpenAiBrainDumpTaskCards({
        dumpText: validation.input.text,
        activeTasks,
      });
      if (openAiDraft.skipped) {
        aiDraft = {
          source: OPENAI_DRAFTS_ENABLED ? "simple_fallback" : "disabled",
          model: "",
          error: "",
          warning: OPENAI_DRAFTS_ENABLED
            ? "No Angel Lab AI provider is configured; used safe parser fallback."
            : "OpenAI drafts are disabled; used safe parser fallback.",
        };
      } else if (openAiDraft.taskCards.length > 0) {
        openAiTaskCards = openAiDraft.taskCards;
        aiDraft = {
          source: openAiDraft.provider || "openai",
          model: openAiDraft.model || OPENAI_ANGEL_LAB_MODEL,
          detectedLanguage: openAiDraft.detectedLanguage || "auto",
          error: "",
          warning: "",
        };
      } else {
        aiDraft = {
          source: "simple_fallback",
          model: openAiDraft.model || OPENAI_ANGEL_LAB_MODEL,
          error: "",
          warning: "OpenAI returned no usable draft cards; used safe parser fallback.",
        };
      }
    } catch (error) {
      aiDraft = {
        source: "simple_fallback",
        model: OPENAI_ANGEL_LAB_MODEL,
        error: error?.message || "OpenAI draft failed",
        warning: "OpenAI draft failed; used safe parser fallback.",
      };
      openAiTaskCards = [];
    }

    const initialTaskCards = openAiTaskCards.length > 0
      ? openAiTaskCards
      : useSimpleBrainDumpMode
        ? buildSimpleBrainDumpTaskCards({
          dumpText: validation.input.text,
          extractionCandidateTasks,
        })
        : buildTaskCards({
          dumpText: validation.input.text,
          activeTasks,
          extractionCandidateTasks,
        });

    const usedAiDraft = openAiTaskCards.length > 0;
    const taskCardsWithAiFallback = useSimpleBrainDumpMode && !usedAiDraft
      ? initialTaskCards
      : await enrichCardsWithAiSubtasks({
        taskCards: initialTaskCards,
        dumpText: validation.input.text,
        activeTasks,
      });

    const polishedTaskCards = polishAngelLabTaskCards(taskCardsWithAiFallback, validation.input.text);

    const preselectedTaskCards = applyCreateCardSubtaskPreselection(polishedTaskCards);

    const finalTaskCards = preselectedTaskCards.map((card, index) => ({
      ...card,
      id: card.id || `${captureId}-card-${index + 1}`,
    }));
    const executiveAssessment = buildExecutiveStateAssessment({
      dumpText: validation.input.text,
      activeTasks,
      taskCards: finalTaskCards,
    });

    res.status(200).json({
      ok: true,
      captureId,
      schemaVersion: 2,
      dryRun: Boolean(validation.input.dryRun),
      origin: validation.input.origin,
      taskCards: finalTaskCards,
      executiveAssessment,
      aiDraft,
      extraction: extraction || null,
      extractionReplayed,
      taskEnrichment,
    });
  } catch (_error) {
    res.status(500).json({ ok: false, error: "Failed to store capture" });
  }
}

module.exports = capturesHandler;
module.exports._test = {
  buildCaptureOrigin,
  normalizeCaptureSource,
  validateInput,
  applyCreateCardSubtaskPreselection,
  polishAngelLabTaskCards,
};
