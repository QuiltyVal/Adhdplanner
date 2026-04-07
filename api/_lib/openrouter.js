const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it";

function getOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  return apiKey;
}

async function openRouterChatCompletion({
  messages,
  tools = [],
  maxTokens = 600,
  model,
  responseFormat,
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  const payload = {
    model: model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    messages,
    tools: Array.isArray(tools) ? tools : [],
    max_tokens: Math.min(Number(maxTokens) || 600, 1200),
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenRouterApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://planner.valquilty.com",
      "X-Title": "ADHD Planner",
    },
    body: JSON.stringify(payload),
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    throw new Error(`OpenRouter ${upstream.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`OpenRouter returned invalid JSON: ${error.message}`);
  }
}

module.exports = {
  DEFAULT_MODEL,
  openRouterChatCompletion,
};
