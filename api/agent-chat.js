const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY is not configured" });
  }

  const {
    messages,
    tools = [],
    max_tokens: maxTokens = 600,
    model,
  } = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }

  const payload = {
    model: model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    messages,
    tools: Array.isArray(tools) ? tools : [],
    max_tokens: Math.min(Number(maxTokens) || 600, 1200),
  };

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://planner.valquilty.com",
        "X-Title": "ADHD Planner",
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch (error) {
    console.error("[agent-chat]", error);
    return res.status(502).json({ error: "Upstream request failed" });
  }
};
