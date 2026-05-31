const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_TRANSCRIPTION_MODEL = String(process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe").trim() || "gpt-4o-mini-transcribe";
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const { admin, getAdminApp } = require("./_lib/firebase-admin");

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (error) {
      return null;
    }
  }
  if (typeof body === "object" && !Array.isArray(body)) return body;
  return null;
}

async function verifyUser(req) {
  const authHeader = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, statusCode: 401, error: "Missing authorization token" };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { ok: false, statusCode: 401, error: "Missing authorization token" };
  }

  try {
    getAdminApp();
    const decoded = await admin.auth().verifyIdToken(token);
    return { ok: true, uid: String(decoded.uid || "") };
  } catch (error) {
    return { ok: false, statusCode: 401, error: "Invalid authorization token" };
  }
}

function getAudioFilename(mimeType = "") {
  const value = String(mimeType || "").toLowerCase();
  if (value.includes("mp4") || value.includes("m4a")) return "speech.m4a";
  if (value.includes("mpeg") || value.includes("mp3")) return "speech.mp3";
  if (value.includes("wav")) return "speech.wav";
  if (value.includes("ogg")) return "speech.ogg";
  return "speech.webm";
}

module.exports = async function speechToTextHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  if (!OPENAI_API_KEY) {
    return res.status(503).json({ ok: false, error: "OPENAI_API_KEY is not configured" });
  }

  const authResult = await verifyUser(req);
  if (!authResult.ok) {
    return res.status(authResult.statusCode).json({ ok: false, error: authResult.error });
  }

  const body = parseBody(req.body);
  if (!body) {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const audioBase64 = String(body.audioBase64 || "").trim();
  const mimeType = String(body.mimeType || "audio/webm").trim() || "audio/webm";
  const requestedLanguage = String(body.language || "auto").trim().toLowerCase();
  const language = requestedLanguage.startsWith("en")
    ? "en"
    : requestedLanguage.startsWith("ru")
      ? "ru"
      : "";

  if (!audioBase64) {
    return res.status(400).json({ ok: false, error: "audioBase64 is required" });
  }

  let audioBuffer;
  try {
    audioBuffer = Buffer.from(audioBase64, "base64");
  } catch (error) {
    return res.status(400).json({ ok: false, error: "audioBase64 is invalid" });
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    return res.status(400).json({ ok: false, error: "Audio payload is empty" });
  }

  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return res.status(413).json({ ok: false, error: "Audio payload is too large" });
  }

  try {
    const form = new FormData();
    form.append("model", OPENAI_TRANSCRIPTION_MODEL);
    if (language) {
      form.append("language", language);
    }
    form.append(
      "prompt",
      [
        "Transcribe exactly what the user says.",
        "The speaker is often dictating messy ADHD planner notes in Russian, with occasional English or German words.",
        "Do not translate. Do not summarize. Preserve Russian, English, German, names, app terms, and task wording as spoken.",
        "Common context words may include: Angel Lab, brain dump, Jobcenter, Bürgerbüro, portfolio, Vercel, Telegram, task, subtask.",
      ].join(" "),
    );
    form.append("response_format", "json");
    form.append("file", new Blob([audioBuffer], { type: mimeType }), getAudioFilename(mimeType));

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: form,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: payload?.error?.message || "Speech transcription failed",
      });
    }

    const text = String(payload?.text || "").trim();
    return res.status(200).json({
      ok: true,
      text,
      language: language || "auto",
      model: OPENAI_TRANSCRIPTION_MODEL,
      uid: authResult.uid,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Speech transcription failed" });
  }
};
