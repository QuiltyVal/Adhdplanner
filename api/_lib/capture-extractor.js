const { getDb, admin } = require("./firebase-admin");
const { getCommitmentsByIds, upsertCommitmentsFromExtraction } = require("./commitment-store");
const { mutatePlanner } = require("./planner-store");
const { getTaskTextSimilarity } = require("./angel-lab-core");

const LIFE_AREA_RULES = [
  {
    kind: "admin",
    tempKey: "docs_admin",
    title: "документы и бюрократия",
    whyMatters: "если это бросить, последствия обычно догоняют позже и больнее",
    failureCost: "high",
    keywords: ["документ", "документы", "бумаги", "виза", "страховка", "налог", "налоги", "фоса", "ihk", "заявк", "анкета", "регистрац", "versicherung"],
  },
  {
    kind: "money",
    tempKey: "money_finance",
    title: "деньги и счета",
    whyMatters: "финансовые хвосты быстро превращаются в реальную боль",
    failureCost: "high",
    keywords: ["деньги", "счет", "счёт", "оплат", "доход", "invoice", "инвойс", "банк", "бюджет", "долг"],
  },
  {
    kind: "health",
    tempKey: "health_care",
    title: "здоровье",
    whyMatters: "здоровье нельзя долго обслуживать по остаточному принципу",
    failureCost: "high",
    keywords: ["врач", "доктор", "лекар", "таблет", "здоров", "терап", "анализ", "боль", "сон", "аптек"],
  },
  {
    kind: "pet",
    tempKey: "pet_care",
    title: "забота о питомце",
    whyMatters: "это внешняя ответственность, которую нельзя просто забыть",
    failureCost: "high",
    keywords: ["кот", "кошка", "кошк", "корм", "vet", "вет", "наполнитель", "миска"],
  },
  {
    kind: "work",
    tempKey: "work_delivery",
    title: "работа и клиенты",
    whyMatters: "рабочие хвосты бьют по деньгам, репутации и стрессу",
    failureCost: "high",
    keywords: ["клиент", "проект", "работ", "заказ", "дедлайн", "созвон", "бриф", "правк", "деплой", "версель"],
  },
  {
    kind: "home",
    tempKey: "home_maintenance",
    title: "дом и быт",
    whyMatters: "бытовые провалы быстро съедают энергию и ощущение опоры",
    failureCost: "medium",
    keywords: ["дом", "уборк", "посуд", "стирк", "купить", "заказать", "еда", "продукт", "магазин"],
  },
  {
    kind: "relationship",
    tempKey: "relationships",
    title: "отношения и люди",
    whyMatters: "если это не поддерживать, ущерб накапливается тихо",
    failureCost: "medium",
    keywords: ["мама", "папа", "друг", "подруг", "ответить", "написать", "позвонить", "семь", "отношен"],
  },
];

const URGENCY_RANK = {
  low: 1,
  medium: 2,
  high: 3,
};

const RESISTANCE_RANK = {
  low: 1,
  medium: 2,
  high: 3,
};

function capturesCol(userId) {
  return getDb().collection("Users").doc(userId).collection("captures");
}

function normalizeText(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueBy(items = [], keyFn) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function pickMergedUrgency(existingUrgency = "medium", incomingUrgency = "medium") {
  const existingRank = URGENCY_RANK[existingUrgency] || URGENCY_RANK.medium;
  const incomingRank = URGENCY_RANK[incomingUrgency] || URGENCY_RANK.medium;
  return incomingRank > existingRank ? incomingUrgency : existingUrgency;
}

function pickMergedResistance(existingResistance = "medium", incomingResistance = "medium") {
  const existingRank = RESISTANCE_RANK[existingResistance] || RESISTANCE_RANK.medium;
  const incomingRank = RESISTANCE_RANK[incomingResistance] || RESISTANCE_RANK.medium;
  return incomingRank > existingRank ? incomingResistance : existingResistance;
}

function mergeDeadline(existingDeadline = "", incomingDeadline = "") {
  if (!existingDeadline) return incomingDeadline || "";
  if (!incomingDeadline) return existingDeadline;
  return incomingDeadline < existingDeadline ? incomingDeadline : existingDeadline;
}

function normalizeCommitmentIds(value = []) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  )].slice(0, 10);
}

function mergeCommitmentIds(existingIds = [], incomingIds = []) {
  return normalizeCommitmentIds([...(existingIds || []), ...(incomingIds || [])]);
}

function getTaskChangedFields(before = {}, after = {}) {
  const changed = [];

  if ((before.urgency || "medium") !== (after.urgency || "medium")) changed.push("urgency");
  if ((before.resistance || "medium") !== (after.resistance || "medium")) changed.push("resistance");
  if (Boolean(before.isVital) !== Boolean(after.isVital)) changed.push("isVital");
  if ((before.deadlineAt || "") !== (after.deadlineAt || "")) changed.push("deadlineAt");
  if ((before.lifeArea || "") !== (after.lifeArea || "")) changed.push("lifeArea");

  const beforeCommitments = normalizeCommitmentIds(before.commitmentIds || []).join("|");
  const afterCommitments = normalizeCommitmentIds(after.commitmentIds || []).join("|");
  if (beforeCommitments !== afterCommitments) changed.push("commitmentIds");

  return changed;
}

function resolveCandidateCommitmentIds(candidate = {}, commitments = []) {
  const knownIds = new Set(
    (Array.isArray(commitments) ? commitments : [])
      .map((commitment) => String(commitment?.id || "").trim())
      .filter(Boolean),
  );

  const preferred = normalizeCommitmentIds(candidate.commitmentTempKeys || [])
    .filter((id) => knownIds.has(id));

  if (preferred.length > 0) return preferred;
  return normalizeCommitmentIds((Array.isArray(commitments) ? commitments : []).map((commitment) => commitment.id));
}

function normalizeCandidatePatch(candidate = {}, commitments = []) {
  const urgency = candidate.urgency === "high" ? "high" : "";
  const resistance = candidate.resistance === "high" ? "high" : "";
  const isVital = Boolean(candidate.isVital);
  const deadlineAt = /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.deadlineAt || ""))
    ? String(candidate.deadlineAt)
    : "";
  const lifeArea = String(candidate.lifeArea || "").trim();
  const commitmentIds = resolveCandidateCommitmentIds(candidate, commitments);

  const hasAnySignal = Boolean(
    urgency ||
    resistance ||
    isVital ||
    deadlineAt ||
    lifeArea ||
    (Array.isArray(commitmentIds) && commitmentIds.length > 0),
  );

  return hasAnySignal
    ? {
        urgency,
        resistance,
        isVital,
        deadlineAt,
        lifeArea,
        commitmentIds,
      }
    : null;
}

function mergeCandidatePatchIntoTask(task = {}, patch = {}) {
  const next = {
    ...task,
    urgency: patch.urgency
      ? pickMergedUrgency(task.urgency || "medium", patch.urgency)
      : (task.urgency || "medium"),
    resistance: patch.resistance
      ? pickMergedResistance(task.resistance || "medium", patch.resistance)
      : (task.resistance || "medium"),
    isVital: Boolean(task.isVital || patch.isVital),
    deadlineAt: patch.deadlineAt
      ? mergeDeadline(task.deadlineAt || "", patch.deadlineAt)
      : (task.deadlineAt || ""),
    lifeArea: task.lifeArea || patch.lifeArea || "",
    commitmentIds: mergeCommitmentIds(task.commitmentIds || [], patch.commitmentIds || []),
  };

  const changed =
    next.urgency !== (task.urgency || "medium") ||
    next.resistance !== (task.resistance || "medium") ||
    next.isVital !== Boolean(task.isVital) ||
    next.deadlineAt !== (task.deadlineAt || "") ||
    next.lifeArea !== (task.lifeArea || "") ||
    normalizeCommitmentIds(next.commitmentIds).join("|") !== normalizeCommitmentIds(task.commitmentIds || []).join("|");

  if (!changed) return null;
  const updatedTask = {
    ...next,
    lastUpdated: Date.now(),
  };
  return {
    task: updatedTask,
    changedFields: getTaskChangedFields(task, updatedTask),
  };
}

async function applyExtractionTaskHints(userId, extraction = {}, commitments = []) {
  const candidates = Array.isArray(extraction?.candidateTasks) ? extraction.candidateTasks : [];
  if (!candidates.length) {
    return {
      updatedTaskIds: [],
      updatedCount: 0,
      candidateCount: 0,
    };
  }

  const updatedTaskIds = new Set();
  const updatedTaskMeta = new Map();
  await mutatePlanner(userId, (current) => {
    const activeTasks = Array.isArray(current?.tasks)
      ? current.tasks.filter((task) => task?.status === "active")
      : [];
    if (!activeTasks.length) return current;

    const taskById = new Map(activeTasks.map((task) => [String(task.id), task]));
    for (const candidate of candidates) {
      const candidateText = String(candidate?.text || "").trim();
      if (!candidateText) continue;

      const patch = normalizeCandidatePatch(candidate, commitments);
      if (!patch) continue;

      const ranked = activeTasks
        .map((task) => ({
          id: String(task.id),
          score: getTaskTextSimilarity(candidateText, task.text || ""),
        }))
        .sort((left, right) => right.score - left.score);

      const best = ranked[0];
      const second = ranked[1];
      if (!best || best.score < 0.62) continue;
      if (second && best.score < 0.9 && (best.score - second.score) < 0.12) continue;

      const targetTask = taskById.get(best.id);
      if (!targetTask) continue;

      const merged = mergeCandidatePatchIntoTask(targetTask, patch);
      if (!merged || !merged.task) continue;

      taskById.set(best.id, merged.task);
      updatedTaskIds.add(best.id);
      const existingMeta = updatedTaskMeta.get(best.id) || {
        id: best.id,
        text: String((merged.task && merged.task.text) || targetTask.text || candidateText || "").trim(),
        changedFields: new Set(),
      };
      for (const fieldName of (Array.isArray(merged.changedFields) ? merged.changedFields : [])) {
        if (fieldName) existingMeta.changedFields.add(fieldName);
      }
      updatedTaskMeta.set(best.id, existingMeta);
    }

    if (!updatedTaskIds.size) return current;
    const nextTasks = (Array.isArray(current?.tasks) ? current.tasks : []).map((task) => {
      const replacement = taskById.get(String(task.id));
      return replacement || task;
    });

    return {
      ...current,
      tasks: nextTasks,
    };
  }, {
    source: "capture_extractor",
    reason: "capture_hint_upsert",
  });

  return {
    updatedTaskIds: [...updatedTaskIds],
    updatedCount: updatedTaskIds.size,
    candidateCount: candidates.length,
    updatedTasks: [...updatedTaskMeta.values()].map((item) => ({
      id: item.id,
      text: item.text,
      fields: [...item.changedFields],
    })),
  };
}

function inferLifeAreaMatches(text = "") {
  const normalized = normalizeText(text);

  return LIFE_AREA_RULES
    .map((rule) => {
      const matchedKeywords = rule.keywords.filter((keyword) => normalized.includes(keyword));
      if (!matchedKeywords.length) return null;

      return {
        ...rule,
        matchedKeywords,
        confidence: Math.min(0.95, 0.55 + matchedKeywords.length * 0.1),
      };
    })
    .filter(Boolean);
}

function inferFacts(text = "") {
  const normalized = normalizeText(text);
  const facts = [];

  if (/(боюсь|страшно|пугает|ужасно не хочу|не хочу звонить)/.test(normalized)) {
    facts.push({
      type: "avoidance_signal",
      text: "Пользователь прямо говорит о страхе или избегании.",
      confidence: 0.82,
    });
  }

  if (/(откладываю|снова не сделала|опять не сделала|избегаю|никак не могу)/.test(normalized)) {
    facts.push({
      type: "neglect_signal",
      text: "Похоже на повторное откладывание важного дела.",
      confidence: 0.8,
    });
  }

  if (/(сегодня|завтра|срочно|горит|дедлайн)/.test(normalized)) {
    facts.push({
      type: "time_pressure_signal",
      text: "В тексте есть явный сигнал срочности или близкого срока.",
      confidence: 0.72,
    });
  }

  return facts;
}

function inferResistance(text = "") {
  const normalized = normalizeText(text);
  if (/(боюсь|страшно|избегаю|откладываю|не могу заставить)/.test(normalized)) {
    return "high";
  }
  return "medium";
}

function inferUrgency(text = "", meta = {}) {
  if (meta.urgency) return meta.urgency;
  const normalized = normalizeText(text);
  if (/(срочно|горит|сегодня|завтра|дедлайн|как можно скорее)/.test(normalized)) {
    return "high";
  }
  return "medium";
}

function sanitizeCaptureTaskText(text = "") {
  let normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";

  normalized = normalized
    .replace(/^(мне\s+)?(надо|нужно|хочу)\s+/i, "")
    .replace(/(а\s+)?я\s+этого\s+не\s+делаю.*$/i, "")
    .replace(/и\s+для\s+этого.*$/i, "")
    .replace(/и\s+никак\s+не\s+могу.*$/i, "")
    .replace(/но\s+пока\s+не.*$/i, "")
    .replace(/[.,;:!?-]+$/g, "")
    .trim();

  return normalized;
}

function splitCaptureTaskCandidates(rawText = "") {
  const source = String(rawText || "")
    .replace(/[•·]/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return [];

  const markerRegex = /^(надо|нужно|хочу|сделать|проверить|купить|написать|позвонить|заказать|приготовить|записаться|оплатить)$/i;
  const byPunctuation = source
    .split(/[.!?;\n,]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const expanded = [];
  for (const chunk of byPunctuation) {
    const words = chunk.split(" ").filter(Boolean);
    if (words.length < 6) {
      expanded.push(chunk);
      continue;
    }

    let current = [];
    for (const word of words) {
      const normalizedWord = word.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, "");
      const isMarker = markerRegex.test(normalizedWord) || /(ть|ти|ться|чь)$/.test(normalizedWord);
      if (current.length >= 2 && isMarker) {
        expanded.push(current.join(" "));
        current = [word];
        continue;
      }
      current.push(word);
    }
    if (current.length > 0) {
      expanded.push(current.join(" "));
    }
  }

  return uniqueBy(
    expanded
      .map((item) => sanitizeCaptureTaskText(item))
      .filter((item) => item.length >= 6),
    (item) => normalizeText(item),
  );
}

function buildCandidateTasks(capture = {}, lifeAreaMatches = []) {
  const rawText = String(capture.rawText || capture.transcript || "").trim();
  const meta = capture.meta && typeof capture.meta === "object" ? capture.meta : {};
  const intent = String(meta.intent || "");
  const effectiveIntent = intent || "chat";
  const taskText = String(meta.taskText || "").trim();
  const primaryText = taskText || rawText;

  if (!primaryText) return [];

  const primaryArea = lifeAreaMatches[0] || null;
  const candidateTasks = [];

  if (effectiveIntent === "add_task") {
    candidateTasks.push({
      text: sanitizeCaptureTaskText(primaryText) || primaryText,
      urgency: inferUrgency(primaryText, meta),
      resistance: meta.resistance || inferResistance(rawText),
      isVital: Boolean(meta.isVital),
      isToday: Boolean(meta.isToday),
      deadlineAt: meta.deadlineAt || "",
      lifeArea: primaryArea?.kind || "",
      commitmentTempKeys: lifeAreaMatches.map((match) => match.tempKey),
      confidence: 0.92,
      sourceCaptureId: capture.id || null,
    });
  } else if (effectiveIntent === "chat" && rawText.length >= 8) {
    const chunks = splitCaptureTaskCandidates(rawText);
    const items = chunks.length > 0 ? chunks : [sanitizeCaptureTaskText(rawText) || rawText];
    for (const itemText of items) {
      const cleanText = sanitizeCaptureTaskText(itemText) || itemText;
      if (!cleanText || cleanText.length < 6) continue;
      candidateTasks.push({
        text: cleanText,
        urgency: inferUrgency(cleanText, meta),
        resistance: inferResistance(cleanText),
        isVital: false,
        isToday: false,
        deadlineAt: "",
        lifeArea: primaryArea?.kind || "",
        commitmentTempKeys: lifeAreaMatches.map((match) => match.tempKey),
        confidence: 0.58,
        sourceCaptureId: capture.id || null,
      });
      if (candidateTasks.length >= 8) break;
    }
  }

  return uniqueBy(candidateTasks, (item) => normalizeText(item.text));
}

function extractCapture(capture = {}) {
  const rawText = String(capture.rawText || capture.transcript || "").trim();
  const lifeAreaMatches = inferLifeAreaMatches(rawText);

  const commitments = lifeAreaMatches.map((match) => ({
    tempKey: match.tempKey,
    title: match.title,
    kind: match.kind,
    whyMatters: match.whyMatters,
    failureCost: match.failureCost,
    confidence: match.confidence,
    sourceCaptureId: capture.id || null,
    keywordsMatched: match.matchedKeywords,
  }));

  const candidateTasks = buildCandidateTasks(capture, lifeAreaMatches);
  const facts = inferFacts(rawText).map((fact) => ({
    ...fact,
    sourceCaptureId: capture.id || null,
  }));

  return {
    extractorVersion: "heuristic_v1",
    extractedAt: Date.now(),
    commitments,
    candidateTasks,
    facts,
  };
}

async function processCapture(userId, capture) {
  if (!capture?.id) {
    throw new Error("processCapture requires capture.id");
  }

  const existingCaptureSnap = await capturesCol(userId).doc(capture.id).get();
  const existingCapture = existingCaptureSnap.exists ? (existingCaptureSnap.data() || {}) : null;

  if (existingCapture?.status === "processed") {
    return {
      extraction: existingCapture.extraction || extractCapture(existingCapture),
      commitments: await getCommitmentsByIds(userId, existingCapture.commitmentIds || []),
      replayed: true,
      taskEnrichment: {
        updatedTaskIds: [],
        updatedCount: 0,
        candidateCount: Array.isArray(existingCapture?.extraction?.candidateTasks)
          ? existingCapture.extraction.candidateTasks.length
          : 0,
        updatedTasks: [],
      },
    };
  }

  const extraction = extractCapture(capture);
  const commitments = await upsertCommitmentsFromExtraction(userId, extraction, {
    captureId: capture.id,
    source: capture.source || "unknown",
  });

  await capturesCol(userId).doc(capture.id).set(
    {
      status: "processed",
      processedAt: Date.now(),
      extraction,
      commitmentIds: commitments.map((commitment) => commitment.id),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const taskEnrichment = await applyExtractionTaskHints(userId, extraction, commitments);

  return {
    extraction,
    commitments,
    replayed: false,
    taskEnrichment,
  };
}

async function failCaptureProcessing(userId, captureId, error) {
  await capturesCol(userId).doc(String(captureId)).set(
    {
      status: "failed",
      processedAt: Date.now(),
      processingError: {
        message: error?.message || "Unknown capture processing error",
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

module.exports = {
  extractCapture,
  processCapture,
  failCaptureProcessing,
  applyExtractionTaskHints,
};
