const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
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
  const language = String(body.language || "ru").trim() || "ru";

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
    form.append("model", "whisper-1");
    form.append("language", language);
    form.append("response_format", "json");
    form.append("file", new Blob([audioBuffer], { type: mimeType }), "speech.webm");

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
      uid: authResult.uid,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Speech transcription failed" });
  }
};
