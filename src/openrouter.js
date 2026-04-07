const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = "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";

export async function askAI(systemPrompt, userMessage, model = "openai/gpt-4o-mini") {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://adhdplanner-git-main-quiltyvals-projects.vercel.app",
    },
    body: JSON.stringify({
      model,
      max_tokens: 80,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}
