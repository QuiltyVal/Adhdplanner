const { appendCapture } = require("./_lib/capture-store");
const { processCapture } = require("./_lib/capture-extractor");
const { openRouterChatCompletion } = require("./_lib/openrouter");
const { getPlannerData } = require("./_lib/planner-store");
const {
  buildTaskCards,
  parseDumpUnits,
  normalizeTaskLookupText,
  isMetaTaskTitle,
  isActionableTaskTitle,
  isTaskNearDuplicate,
  normalizeAndDedupSubtasks,
} = require("./_lib/angel-lab-core");

const MAX_CAPTURE_TEXT_LENGTH = 4000;
const ANGEL_LAB_MODE = String(process.env.ANGEL_LAB_MODE || "simple").trim().toLowerCase();
const ANGEL_LAB_SIMPLE_MAX_TASKS = 5;

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

  const userId = getDefaultUserId();
  if (!userId) {
    return { ok: false, statusCode: 503, message: "PLANNER_DEFAULT_USER_ID is not configured" };
  }

  const source = body.source == null ? null : String(body.source).trim() || null;
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
      idempotencyKey,
      activeTasks,
      selfTest,
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
const CREATE_CARD_AUTO_PRESELECT_MAX = 2;
const CREATE_CARD_AUTO_PRESELECT_MIN_CONFIDENCE = 0.68;

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

    for (const candidate of ranked) {
      if (selectedIndexes.size >= CREATE_CARD_AUTO_PRESELECT_MAX) break;
      if (candidate.selectedByDefault) selectedIndexes.add(candidate.index);
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
      subtasks: subtasks.map((subtask, index) => ({
        ...subtask,
        selectedByDefault: selectedIndexes.has(index),
      })),
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

module.exports = async function capturesHandler(req, res) {
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
    const { captureId, capture } = await appendCapture({
      userId: validation.input.userId,
      text: validation.input.text,
      source: validation.input.source,
      idempotencyKey: validation.input.idempotencyKey,
      selfTest: validation.input.selfTest,
      origin: { channel: "web" },
    });

    let extraction = null;
    let extractionReplayed = false;
    let taskEnrichment = null;
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

    const activeTasks = validation.input.activeTasks.length > 0
      ? validation.input.activeTasks
      : await getActiveTasksSafe(validation.input.userId);
    const extractionCandidateTasks = Array.isArray(extraction?.candidateTasks)
      ? extraction.candidateTasks
      : [];

    const useSimpleBrainDumpMode = ANGEL_LAB_MODE !== "smart";

    const initialTaskCards = useSimpleBrainDumpMode
      ? buildSimpleBrainDumpTaskCards({
        dumpText: validation.input.text,
        extractionCandidateTasks,
      })
      : buildTaskCards({
        dumpText: validation.input.text,
        activeTasks,
        extractionCandidateTasks,
      });

    const taskCardsWithAiFallback = useSimpleBrainDumpMode
      ? initialTaskCards
      : await enrichCardsWithAiSubtasks({
        taskCards: initialTaskCards,
        dumpText: validation.input.text,
        activeTasks,
      });

    const preselectedTaskCards = useSimpleBrainDumpMode
      ? taskCardsWithAiFallback
      : applyCreateCardSubtaskPreselection(taskCardsWithAiFallback);

    const finalTaskCards = preselectedTaskCards.map((card, index) => ({
      ...card,
      id: card.id || `${captureId}-card-${index + 1}`,
    }));

    res.status(200).json({
      ok: true,
      captureId,
      schemaVersion: 2,
      taskCards: finalTaskCards,
      extraction: extraction || null,
      extractionReplayed,
      taskEnrichment,
    });
  } catch (_error) {
    res.status(500).json({ ok: false, error: "Failed to store capture" });
  }
};
