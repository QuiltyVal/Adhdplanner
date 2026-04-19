const MAX_CARD_SUBTASKS = 5;
const MAX_TASK_CARDS = 7;

const META_PATTERNS = [
  /\bя в хаосе\b/i,
  /\bничего не понимаю\b/i,
  /\bне знаю\b/i,
  /\bзапутал(?:ась|ся)?\b/i,
  /\bне могу собраться\b/i,
  /\bвсе плохо\b/i,
  /\bя туп[а-я]+\b/i,
];

const ABSTRACT_JUNK_PATTERNS = [
  /\bразобраться\b/i,
  /\bрешить вопрос\b/i,
  /\bпонять что делать\b/i,
  /\bчто[-\s]?то сделать\b/i,
  /\bкак[-\s]?то вырулить\b/i,
];

const ACTION_MARKERS = new Set([
  "купить",
  "оплатить",
  "приготовить",
  "написать",
  "позвонить",
  "записаться",
  "заказать",
  "проверить",
  "сделать",
  "подтвердить",
  "подготовить",
  "отправить",
  "найти",
  "выбрать",
  "собрать",
  "перевести",
  "закрыть",
]);

const STOPWORDS = new Set([
  "и",
  "а",
  "но",
  "или",
  "потом",
  "затем",
  "после",
  "этого",
  "для",
  "это",
  "вообще",
  "мне",
  "надо",
  "нужно",
  "хочу",
  "бы",
  "как",
  "то",
  "что",
]);

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTaskLookupText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[«»"'`]/g, " ")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDisplayText(value = "") {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function stripIntentPrefix(value = "") {
  return String(value || "")
    .replace(/^(мне\s+)?(надо|нужно|хочу)\s+/i, "")
    .replace(/^(а\s+)?для\s+этого\s+/i, "")
    .replace(/^(и\s+)?для\s+этого\s+/i, "")
    .trim();
}

function tokenizeTaskLookupText(value = "") {
  return normalizeTaskLookupText(value).split(" ").filter(Boolean);
}

function tokenizeContent(value = "") {
  return tokenizeTaskLookupText(value).filter((token) => !STOPWORDS.has(token));
}

function isFuzzyTokenMatch(leftToken = "", rightToken = "") {
  const left = String(leftToken || "").trim();
  const right = String(rightToken || "").trim();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 6 || right.length < 6) return false;
  if (Math.abs(left.length - right.length) > 2) return false;
  return left.slice(0, 4) === right.slice(0, 4);
}

function getTaskTextSimilarity(left = "", right = "") {
  const leftKey = normalizeTaskLookupText(left);
  const rightKey = normalizeTaskLookupText(right);
  if (!leftKey || !rightKey) return 0;
  if (leftKey === rightKey) return 1;

  const shorter = leftKey.length <= rightKey.length ? leftKey : rightKey;
  const longer = leftKey.length <= rightKey.length ? rightKey : leftKey;
  if (shorter.length >= 8 && longer.includes(shorter)) return 0.92;

  const leftTokens = tokenizeTaskLookupText(leftKey);
  const rightTokens = tokenizeTaskLookupText(rightKey);
  if (!leftTokens.length || !rightTokens.length) return 0;

  let intersection = 0;
  const unmatchedLeft = [];
  const unmatchedRight = [...rightTokens];
  for (const token of leftTokens) {
    const exactIndex = unmatchedRight.indexOf(token);
    if (exactIndex !== -1) {
      intersection += 1;
      unmatchedRight.splice(exactIndex, 1);
    } else {
      unmatchedLeft.push(token);
    }
  }

  let fuzzyMatches = 0;
  for (const token of unmatchedLeft) {
    const fuzzyIndex = unmatchedRight.findIndex((candidate) => isFuzzyTokenMatch(token, candidate));
    if (fuzzyIndex === -1) continue;
    fuzzyMatches += 1;
    unmatchedRight.splice(fuzzyIndex, 1);
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  if (!union) return 0;
  const jaccard = intersection / union;
  const weighted = (intersection + fuzzyMatches * 0.6) / Math.max(leftTokens.length, rightTokens.length);
  if (intersection >= 1 && fuzzyMatches >= 1) {
    return Math.max(jaccard, weighted, 0.7);
  }
  return Math.max(jaccard, weighted);
}

function countSharedContentTokens(left = "", right = "") {
  const leftSet = new Set(tokenizeContent(left));
  const rightSet = new Set(tokenizeContent(right));
  let count = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) count += 1;
  }
  return count;
}

function buildStemSet(value = "") {
  const tokens = tokenizeContent(value);
  const stems = new Set();
  for (const token of tokens) {
    if (token.length < 4) continue;
    stems.add(token.slice(0, 4));
  }
  return stems;
}

function getStemJaccard(left = "", right = "") {
  const leftStems = buildStemSet(left);
  const rightStems = buildStemSet(right);
  if (!leftStems.size || !rightStems.size) return 0;

  let intersection = 0;
  for (const stem of leftStems) {
    if (rightStems.has(stem)) intersection += 1;
  }
  const union = new Set([...leftStems, ...rightStems]).size;
  if (!union) return 0;
  return intersection / union;
}

function isMetaTaskTitle(value = "") {
  const normalized = normalizeTaskLookupText(value);
  if (!normalized) return true;
  if (META_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (/^(потом|либо|и|а|но|ну)\b/.test(normalized)) return true;
  if (/^(мне\s+)?(надо|нужно|хочу)$/.test(normalized)) return true;
  if (/^(мне\s+)?(надо|нужно|хочу)\s+(бы|как то|как-то|что то|что-то)$/.test(normalized)) return true;
  if (/^(для\s+этого|и\s+для\s+этого|а\s+для\s+этого)$/.test(normalized)) return true;
  return false;
}

function isActionableTaskTitle(value = "") {
  const normalized = normalizeTaskLookupText(value);
  if (!normalized) return false;
  if (isMetaTaskTitle(normalized)) return false;

  const tokens = tokenizeContent(normalized);
  if (tokens.length < 2) return false;

  if (ACTION_MARKERS.has(tokens[0])) return true;
  if (/(ть|ти|ться|чь)$/.test(tokens[0])) return true;
  return tokens.some((token) => ACTION_MARKERS.has(token));
}

function isTaskNearDuplicate(left = "", right = "") {
  if (!left || !right) return false;
  const similarity = getTaskTextSimilarity(left, right);
  if (similarity >= 0.86) return true;

  const leftKey = normalizeTaskLookupText(left);
  const rightKey = normalizeTaskLookupText(right);
  if (!leftKey || !rightKey) return false;

  if ((leftKey.includes(rightKey) || rightKey.includes(leftKey)) && countSharedContentTokens(leftKey, rightKey) >= 2) {
    return true;
  }
  return false;
}

function isActionStartToken(token = "") {
  if (!token) return false;
  if (ACTION_MARKERS.has(token)) return true;
  return /(ть|ти|ться|чь)$/.test(token);
}

function splitChunkByActionMarkers(chunk = "") {
  const words = String(chunk || "").split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [chunk];

  const result = [];
  let current = [];
  for (const word of words) {
    const normalizedWord = normalizeTaskLookupText(word);
    const isMarker = isActionStartToken(normalizedWord);
    if (current.length >= 2 && isMarker) {
      result.push(current.join(" "));
      current = [word];
      continue;
    }
    current.push(word);
  }
  if (current.length > 0) result.push(current.join(" "));
  return result;
}

function parseDumpUnits(rawDumpText = "") {
  const source = String(rawDumpText || "")
    .replace(/[•·]/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return [];

  const sentenceChunks = source
    .split(/[.!?;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const units = [];
  for (const sentenceChunk of sentenceChunks) {
    const commaChunks = sentenceChunk
      .split(/[,]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    for (const commaChunk of commaChunks) {
      const markerChunks = splitChunkByActionMarkers(commaChunk);
      for (const markerChunk of markerChunks) {
        const stripped = stripIntentPrefix(markerChunk);
        const normalized = normalizeTaskLookupText(stripped);
        if (!normalized) continue;
        if (units.some((item) => isTaskNearDuplicate(item.text, normalized))) continue;

        units.push({
          text: normalized,
          raw: markerChunk,
          meta: isMetaTaskTitle(normalized),
          actionable: isActionableTaskTitle(normalized),
        });
      }
    }
  }

  return units.slice(0, 16);
}

function getTaskContextText(task = {}) {
  const subtasks = Array.isArray(task?.subtasks)
    ? task.subtasks
      .filter((subtask) => !subtask?.completed)
      .map((subtask) => String(subtask?.text || "").trim())
      .filter(Boolean)
    : [];
  return [String(task?.text || "").trim(), ...subtasks].join(" ");
}

function detectMergeTarget(unitText = "", dumpText = "", activeTasks = []) {
  const unit = normalizeTaskLookupText(stripIntentPrefix(unitText));
  const dump = normalizeTaskLookupText(dumpText);
  if (!unit) return { kind: "none", confidence: 0, reason: "not_actionable" };

  const ranked = (Array.isArray(activeTasks) ? activeTasks : [])
    .filter((task) => task?.status === "active")
    .map((task) => {
      const taskTitle = String(task?.text || "");
      const openSubtasks = Array.isArray(task?.subtasks)
        ? task.subtasks.filter((subtask) => !subtask?.completed)
        : [];
      const titleSim = getTaskTextSimilarity(unit, taskTitle);
      const subtaskSim = openSubtasks.reduce((maxScore, subtask) => {
        const score = getTaskTextSimilarity(unit, subtask?.text || "");
        return score > maxScore ? score : maxScore;
      }, 0);
      const dumpSim = dump ? getTaskTextSimilarity(dump, taskTitle) : 0;
      const contextText = getTaskContextText(task);
      const contextStemJaccard = getStemJaccard(unit, contextText);
      const sharedContentCount = countSharedContentTokens(unit, contextText);

      const mergeScore = clamp(
        0.5 * Math.max(titleSim, subtaskSim) +
        0.2 * dumpSim +
        0.2 * contextStemJaccard +
        0.1 * Math.min(1, sharedContentCount / 2),
        0,
        1,
      );

      return {
        taskId: String(task.id || ""),
        taskText: taskTitle,
        titleSim,
        subtaskSim,
        dumpSim,
        contextStemJaccard,
        sharedContentCount,
        mergeScore,
      };
    })
    .sort((left, right) => right.mergeScore - left.mergeScore);

  const best = ranked[0];
  const second = ranked[1];
  if (!best) return { kind: "none", confidence: 0, reason: "not_actionable" };

  const gap = second ? best.mergeScore - second.mergeScore : 1;
  if (best.titleSim >= 0.88 || best.subtaskSim >= 0.9) {
    return {
      kind: "merge",
      targetTaskId: best.taskId,
      targetTaskText: best.taskText,
      confidence: Math.max(best.titleSim, best.subtaskSim),
      reason: "exact_or_subtask_match",
      score: best.mergeScore,
      gap,
    };
  }

  if (best.mergeScore >= 0.74 && gap >= 0.12) {
    return {
      kind: "merge",
      targetTaskId: best.taskId,
      targetTaskText: best.taskText,
      confidence: best.mergeScore,
      reason: "strong_semantic_match",
      score: best.mergeScore,
      gap,
    };
  }

  if ((best.mergeScore >= 0.62 && gap < 0.12) || (best.mergeScore >= 0.62 && best.mergeScore < 0.74)) {
    return {
      kind: "ambiguous",
      confidence: best.mergeScore,
      reason: "ambiguous_merge_target",
      score: best.mergeScore,
      gap,
    };
  }

  return { kind: "none", confidence: best.mergeScore, reason: "independent_action", score: best.mergeScore, gap };
}

function estimateSubtaskConfidence(text = "", parentTitle = "", source = "dump") {
  const similarity = getTaskTextSimilarity(text, parentTitle);
  const actionableBoost = isActionableTaskTitle(text) ? 0.12 : -0.08;
  const lengthBoost = tokenizeTaskLookupText(text).length >= 3 ? 0.06 : 0;
  const sourceBase = source === "dump" ? 0.74 : 0.58;
  const score = sourceBase + actionableBoost + lengthBoost - similarity * 0.25;
  return clamp(score, 0, 1);
}

function hasExplicitSubtaskIntent(text = "") {
  const normalized = normalizeTaskLookupText(text);
  if (!normalized) return false;

  return (
    /подзадач/.test(normalized) ||
    /добав(ь|ить)\s+(шаг|шаги|подзадач)/.test(normalized) ||
    /к\s+задач/.test(normalized) ||
    /по\s+задач/.test(normalized)
  );
}

function isActionableSubtaskText(value = "") {
  const normalized = normalizeTaskLookupText(stripIntentPrefix(value));
  if (!normalized) return false;
  if (isMetaTaskTitle(normalized)) return false;
  if (ABSTRACT_JUNK_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  if (isActionableTaskTitle(normalized)) return true;

  const tokens = tokenizeTaskLookupText(normalized);
  if (!tokens.length) return false;
  if (tokens.length === 1) {
    const token = tokens[0];
    if (!token || token.length < 4) return false;
    if (/(ть|ти|ться|чь|ай|уй|ируй)$/.test(token)) return true;
    if (["фото", "цена", "цену", "описание", "объявление", "документы"].includes(token)) return true;
    return false;
  }

  return /(ть|ти|ться|чь|ай|уй|ируй)$/.test(tokens[0]);
}

function normalizeAndDedupSubtasks({
  parentTitle = "",
  sourceSubtasks = [],
  existingSubtasks = [],
  aiHints = [],
  otherCardTitles = [],
}) {
  const existingTexts = (Array.isArray(existingSubtasks) ? existingSubtasks : [])
    .map((subtask) => (typeof subtask === "string" ? subtask : (subtask?.text || "")))
    .filter(Boolean);

  const candidates = [
    ...(Array.isArray(sourceSubtasks) ? sourceSubtasks : []).map((text) => ({ text, source: "dump" })),
    ...(Array.isArray(aiHints) ? aiHints : []).map((text) => ({ text, source: "llm" })),
  ];

  const result = [];
  let selectedDefaultCount = 0;

  for (const candidate of candidates) {
    if (result.length >= MAX_CARD_SUBTASKS) break;

    let normalized = normalizeTaskLookupText(stripIntentPrefix(candidate?.text || ""));
    normalized = normalized
      .replace(/^(добав(ь|ить)\s+(шаги?|подзадач[ауи]?))\s+/i, "")
      .replace(/^(подзадач[ауи]?)\s+/i, "")
      .trim();
    if (!normalized || normalized.length < 4) continue;
    if (isMetaTaskTitle(normalized)) continue;
    if (ABSTRACT_JUNK_PATTERNS.some((pattern) => pattern.test(normalized))) continue;
    if (!isActionableSubtaskText(normalized)) continue;
    if (isTaskNearDuplicate(normalized, parentTitle)) continue;

    const duplicateInExisting = existingTexts.some((existingText) => isTaskNearDuplicate(normalized, existingText));
    if (duplicateInExisting) continue;

    const duplicateInResult = result.some((item) => isTaskNearDuplicate(item.text, normalized));
    if (duplicateInResult) continue;

    const duplicateInOtherCards = (Array.isArray(otherCardTitles) ? otherCardTitles : [])
      .some((cardTitle) => isTaskNearDuplicate(normalized, cardTitle));
    if (duplicateInOtherCards) continue;

    const confidence = estimateSubtaskConfidence(normalized, parentTitle, candidate.source || "dump");
    if (confidence < 0.52) continue;

    const selectedByDefault =
      candidate.source === "dump" &&
      confidence >= 0.72 &&
      selectedDefaultCount < 2;

    if (selectedByDefault) selectedDefaultCount += 1;
    result.push({
      text: normalizeDisplayText(normalized),
      selectedByDefault,
      source: candidate.source || "dump",
      confidence: Number(confidence.toFixed(3)),
    });
  }

  return result;
}

function isContextuallyRelatedToTask(unitText = "", task = {}) {
  const contextText = getTaskContextText(task);
  if (!contextText) return false;

  const sharedContentCount = countSharedContentTokens(unitText, contextText);
  if (sharedContentCount >= 1) return true;

  const stemJaccard = getStemJaccard(unitText, contextText);
  if (stemJaccard >= 0.34) return true;

  const openSubtasks = Array.isArray(task?.subtasks)
    ? task.subtasks.filter((subtask) => !subtask?.completed)
    : [];
  const subtaskSimilarity = openSubtasks.reduce((maxScore, subtask) => {
    const score = getTaskTextSimilarity(unitText, subtask?.text || "");
    return score > maxScore ? score : maxScore;
  }, 0);

  return subtaskSimilarity >= 0.42;
}

function hasSupportingDependencySignal(unitText = "") {
  const normalized = normalizeTaskLookupText(unitText);
  if (!normalized) return false;

  const tokens = tokenizeTaskLookupText(normalized);
  if (!tokens.length) return false;

  const directWords = new Set([
    "для",
    "за",
    "по",
    "чтобы",
    "евро",
    "руб",
    "доллар",
    "фото",
    "описание",
    "цена",
    "цену",
    "авито",
  ]);
  if (tokens.some((token) => directWords.has(token))) return true;

  const prefixes = [
    "оплат",
    "перев",
    "докум",
    "заявк",
    "анкет",
    "подтв",
    "опис",
    "фото",
    "цен",
    "объяв",
    "публ",
    "авит",
    "карточ",
    "фотк",
    "сфот",
  ];
  if (tokens.some((token) => prefixes.some((prefix) => token.startsWith(prefix)))) return true;
  return false;
}

function splitCreateTitleAndSubtasks(unitText = "") {
  const normalized = normalizeTaskLookupText(unitText);
  if (!normalized) return { title: "", subtaskTexts: [] };

  const parts = normalized
    .split(/\s+и\s+/i)
    .map((item) => normalizeTaskLookupText(item))
    .filter(Boolean);

  if (parts.length >= 2 && isActionableTaskTitle(parts[0])) {
    const tail = parts.slice(1).filter((item) => isActionableTaskTitle(item));
    return {
      title: parts[0],
      subtaskTexts: tail,
    };
  }

  return {
    title: normalized,
    subtaskTexts: [],
  };
}

function buildTaskCards({ dumpText = "", activeTasks = [], extractionCandidateTasks = [] } = {}) {
  const normalizedDump = normalizeTaskLookupText(dumpText);
  const active = (Array.isArray(activeTasks) ? activeTasks : []).filter((task) => task?.status === "active");
  const explicitSubtaskIntent = hasExplicitSubtaskIntent(normalizedDump);

  let units = parseDumpUnits(dumpText);
  if (!units.length && Array.isArray(extractionCandidateTasks) && extractionCandidateTasks.length) {
    const extractionText = extractionCandidateTasks
      .map((item) => (item && typeof item === "object" ? item.text : ""))
      .filter(Boolean)
      .join(". ");
    units = parseDumpUnits(extractionText);
  }

  const dumpTarget = detectMergeTarget(normalizedDump, normalizedDump, active);
  const dumpMergeTarget = dumpTarget.kind === "merge" && dumpTarget.confidence >= 0.76
    ? dumpTarget
    : null;
  const explicitSubtaskTargetId = explicitSubtaskIntent && dumpTarget.kind === "merge"
    ? String(dumpTarget.targetTaskId)
    : null;

  const mergeClusters = new Map();
  const createUnits = [];
  const rejectUnits = [];

  const pushMergeUnit = (taskId, unitText, reason, confidence = 0.7) => {
    if (!taskId || !unitText) return;
    const key = String(taskId);
    const cluster = mergeClusters.get(key) || {
      taskId: key,
      reasons: [],
      confidences: [],
      units: [],
    };

    if (!cluster.units.some((item) => isTaskNearDuplicate(item, unitText))) {
      cluster.units.push(unitText);
    }
    if (reason) cluster.reasons.push(reason);
    cluster.confidences.push(confidence);
    mergeClusters.set(key, cluster);
  };

  const tryAttachToMergeContext = (unitText) => {
    if (explicitSubtaskTargetId) {
      const explicitTargetTask = active.find((task) => String(task.id) === explicitSubtaskTargetId);
      if (
        explicitTargetTask &&
        isActionableSubtaskText(unitText) &&
        !isTaskNearDuplicate(unitText, explicitTargetTask.text || "")
      ) {
        pushMergeUnit(explicitSubtaskTargetId, unitText, "dump_context", 0.74);
        return true;
      }
    }

    if (dumpMergeTarget) {
      const targetTask = active.find((task) => String(task.id) === String(dumpMergeTarget.targetTaskId));
      const hasExistingCluster = mergeClusters.has(String(dumpMergeTarget.targetTaskId));
      const isRelatedByContext = targetTask && isContextuallyRelatedToTask(unitText, targetTask);
      const isRelatedByDependency = hasExistingCluster && hasSupportingDependencySignal(unitText);
      if (targetTask && (isRelatedByContext || isRelatedByDependency)) {
        pushMergeUnit(
          dumpMergeTarget.targetTaskId,
          unitText,
          "dump_context",
          Math.max(0.62, dumpMergeTarget.confidence - 0.08),
        );
        return true;
      }
    }

    if (!dumpMergeTarget && mergeClusters.size === 1 && hasSupportingDependencySignal(unitText)) {
      const [singleTargetTaskId] = [...mergeClusters.keys()];
      if (singleTargetTaskId) {
        pushMergeUnit(singleTargetTaskId, unitText, "dump_context", 0.66);
        return true;
      }
    }

    return false;
  };

  for (const unit of units) {
    const unitText = normalizeTaskLookupText(unit?.text || "");
    if (!unitText) continue;

    if (unit.meta) {
      rejectUnits.push({ text: unitText, reason: "meta_noise", confidence: 0.92 });
      continue;
    }
    if (!unit.actionable) {
      if (tryAttachToMergeContext(unitText)) continue;
      rejectUnits.push({ text: unitText, reason: "not_actionable", confidence: 0.65 });
      continue;
    }

    const mergeDecision = detectMergeTarget(unitText, normalizedDump, active);
    if (mergeDecision.kind === "merge") {
      pushMergeUnit(mergeDecision.targetTaskId, unitText, mergeDecision.reason, mergeDecision.confidence);
      continue;
    }
    if (mergeDecision.kind === "ambiguous") {
      if (tryAttachToMergeContext(unitText)) continue;
      rejectUnits.push({ text: unitText, reason: "ambiguous_merge_target", confidence: mergeDecision.confidence || 0.62 });
      continue;
    }
    if (tryAttachToMergeContext(unitText)) continue;

    if (!createUnits.some((item) => isTaskNearDuplicate(item, unitText))) {
      createUnits.push(unitText);
    }
  }

  const cards = [];

  for (const cluster of mergeClusters.values()) {
    const targetTask = active.find((task) => String(task.id) === String(cluster.taskId));
    if (!targetTask) continue;

    const sourceSubtasks = cluster.units.filter((unitText) => !isTaskNearDuplicate(unitText, targetTask.text || ""));
    const reason = cluster.reasons.includes("exact_or_subtask_match")
      ? "exact_or_subtask_match"
      : cluster.reasons.includes("strong_semantic_match")
        ? "strong_semantic_match"
        : "dump_context";

    const subtasks = normalizeAndDedupSubtasks({
      parentTitle: targetTask.text || "",
      sourceSubtasks,
      existingSubtasks: Array.isArray(targetTask.subtasks) ? targetTask.subtasks.filter((subtask) => !subtask?.completed) : [],
      aiHints: [],
      otherCardTitles: [],
    });

    cards.push({
      id: `merge-${cluster.taskId}`,
      title: normalizeDisplayText(targetTask.text || ""),
      mode: "merge",
      targetTaskId: String(cluster.taskId),
      confidence: Number(clamp(Math.max(...cluster.confidences, 0.7), 0, 1).toFixed(3)),
      reason,
      subtasks,
    });
  }

  for (const unitText of createUnits) {
    if (cards.length >= MAX_TASK_CARDS) break;

    const { title, subtaskTexts } = splitCreateTitleAndSubtasks(unitText);
    if (!title || !isActionableTaskTitle(title)) continue;
    if (isMetaTaskTitle(title)) continue;
    if (cards.some((card) => isTaskNearDuplicate(card.title, title))) continue;

    const subtasks = normalizeAndDedupSubtasks({
      parentTitle: title,
      sourceSubtasks: subtaskTexts,
      existingSubtasks: [],
      aiHints: [],
      otherCardTitles: cards.map((card) => card.title),
    });

    cards.push({
      id: `create-${cards.length + 1}`,
      title: normalizeDisplayText(title),
      mode: "create",
      targetTaskId: null,
      confidence: 0.72,
      reason: "independent_action",
      subtasks,
    });
  }

  for (const reject of rejectUnits) {
    if (cards.length >= MAX_TASK_CARDS) break;
    if (cards.some((card) => isTaskNearDuplicate(card.title, reject.text) && card.mode === "reject")) continue;
    cards.push({
      id: `reject-${cards.length + 1}`,
      title: normalizeDisplayText(reject.text),
      mode: "reject",
      targetTaskId: null,
      confidence: Number(clamp(reject.confidence || 0.5, 0, 1).toFixed(3)),
      reason: reject.reason || "meta_noise",
      subtasks: [],
    });
  }

  return cards.slice(0, MAX_TASK_CARDS);
}

module.exports = {
  normalizeTaskLookupText,
  tokenizeTaskLookupText,
  isFuzzyTokenMatch,
  getTaskTextSimilarity,
  isTaskNearDuplicate,
  isMetaTaskTitle,
  isActionableTaskTitle,
  parseDumpUnits,
  detectMergeTarget,
  normalizeAndDedupSubtasks,
  buildTaskCards,
};
