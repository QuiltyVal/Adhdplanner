const { getDb, admin } = require("./firebase-admin");

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

function capturesCol(userId) {
  return getDb().collection("Users").doc(userId).collection("captures");
}

function normalizeText(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
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

function buildCandidateTasks(capture = {}, lifeAreaMatches = []) {
  const rawText = String(capture.rawText || capture.transcript || "").trim();
  const meta = capture.meta && typeof capture.meta === "object" ? capture.meta : {};
  const intent = String(meta.intent || "");
  const taskText = String(meta.taskText || "").trim();
  const primaryText = taskText || rawText;

  if (!primaryText) return [];

  const primaryArea = lifeAreaMatches[0] || null;
  const candidateTasks = [];

  if (intent === "add_task") {
    candidateTasks.push({
      text: primaryText,
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
  } else if (intent === "chat" && rawText.length >= 8) {
    candidateTasks.push({
      text: rawText,
      urgency: inferUrgency(rawText, meta),
      resistance: inferResistance(rawText),
      isVital: false,
      isToday: false,
      deadlineAt: "",
      lifeArea: primaryArea?.kind || "",
      commitmentTempKeys: lifeAreaMatches.map((match) => match.tempKey),
      confidence: 0.58,
      sourceCaptureId: capture.id || null,
    });
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

  if (!commitments.length && rawText) {
    const fallbackKey = slugify(rawText.split(/[,.!?\n]/)[0] || "general_context");
    commitments.push({
      tempKey: fallbackKey || "general_context",
      title: rawText.slice(0, 80),
      kind: "unknown",
      whyMatters: "Нужно больше контекста, но это явно что-то, что пользователь посчитал важным.",
      failureCost: "medium",
      confidence: 0.35,
      sourceCaptureId: capture.id || null,
      keywordsMatched: [],
    });
  }

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

  const extraction = extractCapture(capture);
  await capturesCol(userId).doc(capture.id).set(
    {
      status: "processed",
      processedAt: Date.now(),
      extraction,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return extraction;
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
};
