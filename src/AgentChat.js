import React, { useState, useRef, useEffect } from 'react';
import './AgentChat.css';

const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.REACT_APP_OPENROUTER_KEY;
const MODEL = "google/gemma-4-26b-a4b-it";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_tasks",
      description: "Get all active tasks with their IDs, urgency, subtasks",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description: "Create a new task",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Task text" },
          urgency: { type: "string", enum: ["low", "medium", "high"], description: "Urgency level" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_subtask",
      description: "Add a subtask/step to an existing task",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "ID of the parent task" },
          text: { type: "string", description: "Subtask text" },
        },
        required: ["task_id", "text"],
      },
    },
  },
];

async function callModel(messages) {
  if (!API_KEY) throw new Error("API key not configured");
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, max_tokens: 500 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }
  return res.json();
}

export default function AgentChat({ isOpen, onClose, persona, tasks, onAddTask, onAddSubtask }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const isAngel = persona === "angel";
  const systemPrompt = isAngel
    ? `Ты ангел-помощник в планировщике задач для людей с СДВГ. Язык: только русский.

ПРАВИЛА:
- Когда пользователь спрашивает про задачи, приоритеты или с чего начать — СНАЧАЛА вызови get_tasks, потом отвечай.
- Когда нужно разбить задачу на шаги — вызови add_subtask для КАЖДОГО шага (2–5 конкретных шагов).
- Когда нужно добавить новую задачу — вызови add_task.
- После вызова инструментов — кратко скажи что сделал и дай совет.
- Отвечай коротко: 1–3 предложения максимум. Никаких длинных списков текстом — лучше создай подзадачи через инструмент.
- Тон: тёплый, поддерживающий, без пафоса.`
    : `Ты чёртик-коуч в планировщике задач для людей с СДВГ. Язык: только русский.

ПРАВИЛА:
- Когда пользователь спрашивает про задачи, приоритеты или с чего начать — СНАЧАЛА вызови get_tasks, потом отвечай.
- Когда нужно разбить задачу на шаги — вызови add_subtask для КАЖДОГО шага (2–5 конкретных шагов).
- Когда нужно добавить новую задачу — вызови add_task.
- После вызова инструментов — кратко скажи что сделал.
- Отвечай коротко: 1–3 предложения максимум. Никаких длинных списков текстом — лучше создай подзадачи через инструмент.
- Тон: саркастичный, прямой, без сентиментов. Подталкивай к действию.`;

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const greeting = isAngel
        ? "Привет! Покажу твои задачи и помогу разобраться с чего начать. Что беспокоит больше всего?"
        : "Ну и что тут у нас... Давай посмотрим на твой список. Спрашивай.";
      setMessages([{ role: "assistant", content: greeting }]);
    }
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]); // eslint-disable-line

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const executeTool = (name, args) => {
    if (name === "get_tasks") {
      const active = tasks.filter(t => t.status === "active");
      return JSON.stringify(active.map(t => ({
        id: t.id,
        text: t.text,
        urgency: t.urgency,
        isVital: t.isVital,
        isToday: t.isToday,
        subtasks: (t.subtasks || []).map(s => ({ id: s.id, text: s.text, completed: s.completed })),
      })));
    }
    if (name === "add_task") {
      onAddTask(args.text);
      return `Задача "${args.text}" добавлена.`;
    }
    if (name === "add_subtask") {
      const task = tasks.find(t => t.id === args.task_id);
      if (!task) return `Задача с id ${args.task_id} не найдена.`;
      onAddSubtask(args.task_id, args.text);
      return `Подзадача "${args.text}" добавлена к "${task.text}".`;
    }
    return "Неизвестный инструмент";
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      let currentMessages = [{ role: "system", content: systemPrompt }, ...newMessages];

      // Agentic loop
      for (let i = 0; i < 5; i++) {
        const data = await callModel(currentMessages);
        const choice = data.choices[0];
        const msg = choice.message;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          currentMessages = [...currentMessages, msg];
          const toolResults = msg.tool_calls.map(call => ({
            role: "tool",
            tool_call_id: call.id,
            content: executeTool(call.function.name, JSON.parse(call.function.arguments)),
          }));
          currentMessages = [...currentMessages, ...toolResults];
        } else {
          const assistantMsg = { role: "assistant", content: msg.content };
          setMessages(prev => [...prev, assistantMsg]);
          break;
        }
      }
    } catch (e) {
      console.error("[AgentChat]", e);
      setMessages(prev => [...prev, { role: "assistant", content: "Ошибка связи. Попробуй ещё раз." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (!isOpen) return null;

  return (
    <div className="agent-chat-overlay" onClick={onClose}>
      <div className={`agent-chat-panel ${isAngel ? "angel-panel" : "devil-panel"}`} onClick={e => e.stopPropagation()}>
        <div className="agent-chat-header">
          <span className="agent-chat-name">{isAngel ? "Ангел-помощник" : "Чёртик-коуч"}</span>
          <button className="agent-chat-close" onClick={onClose}>✕</button>
        </div>

        <div className="agent-chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role === "user" ? "user-msg" : "bot-msg"}`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="chat-msg bot-msg thinking-dots"><span>.</span><span>.</span><span>.</span></div>}
          <div ref={bottomRef} />
        </div>

        <div className="agent-chat-input-row">
          <textarea
            ref={inputRef}
            className="agent-chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Напиши сюда..."
            rows={1}
            disabled={loading}
          />
          <button className="agent-chat-send" onClick={sendMessage} disabled={loading || !input.trim()}>
            →
          </button>
        </div>
      </div>
    </div>
  );
}
