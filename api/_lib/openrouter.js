const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it";
const DEFAULT_OPENROUTER_TIMEOUT_MS = 12000;

function getOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.REACT_APP_OPENROUTER_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  return apiKey;
}

function getOpenRouterTimeoutMs() {
  const fromEnv = Number.parseInt(process.env.OPENROUTER_TIMEOUT_MS || "", 10);
  return Number.isFinite(fromEnv) && fromEnv > 1000 ? fromEnv : DEFAULT_OPENROUTER_TIMEOUT_MS;
}

async function openRouterChatCompletion({
  messages,
  tools = [],
  maxTokens = 600,
  model,
  responseFormat,
  timeoutMs = getOpenRouterTimeoutMs(),
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  const safeTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 1000
    ? Number(timeoutMs)
    : DEFAULT_OPENROUTER_TIMEOUT_MS;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, safeTimeoutMs);

  const payload = {
    model: model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    messages,
    tools: Array.isArray(tools) ? tools : [],
    max_tokens: Math.min(Number(maxTokens) || 600, 1200),
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenRouterApiKey()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://planner.valquilty.com",
        "X-Title": "ADHD Planner",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      throw new Error(`OpenRouter ${upstream.status}: ${text}`);
    }

    clearTimeout(timeout);
    return JSON.parse(text);
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === "AbortError") {
      throw new Error(`OpenRouter request timed out after ${safeTimeoutMs}ms`);
    }
    throw new Error(`OpenRouter request failed: ${error.message}`);
  }
}

module.exports = {
  DEFAULT_MODEL,
  openRouterChatCompletion,
};
