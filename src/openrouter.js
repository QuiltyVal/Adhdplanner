const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.REACT_APP_OPENROUTER_KEY;

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
