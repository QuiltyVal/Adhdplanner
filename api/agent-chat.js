const { openRouterChatCompletion } = require("./_lib/openrouter");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
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
  try {
    const data = await openRouterChatCompletion({
      model,
      messages,
      tools,
      maxTokens,
    });
    return res.status(200).json(data);
  } catch (error) {
    console.error("[agent-chat]", error);
    return res.status(502).json({ error: error.message || "Upstream request failed" });
  }
};
