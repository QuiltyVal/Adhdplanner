import React, { useState, useRef, useEffect } from 'react';
import './AgentChat.css';

const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.REACT_APP_OPENROUTER_KEY;
const MODEL = "google/gemma-4-26b-a4b-it";
const GCAL_API = "https://www.googleapis.com/calendar/v3";

const buildTools = (hasCalendar) => {
  const tools = [
    {
      type: "function",
      function: {
        name: "get_tasks",
        description: "Get all active tasks with their IDs, urgency, isVital, subtasks",
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
            text: { type: "string" },
            urgency: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "add_subtask",
        description: "Add a step/subtask to an existing task",
        parameters: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            text: { type: "string" },
          },
          required: ["task_id", "text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_subtask",
        description: "Delete a subtask from a task",
        parameters: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            subtask_id: { type: "string" },
          },
          required: ["task_id", "subtask_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "mark_critical",
        description: "Mark a task as critical/vital and set urgency to high. Use when task is important.",
        parameters: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "ID of the task to mark critical" },
          },
          required: ["task_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "kill_task",
        description: "Kill/archive a task — sends it to the cemetery. Use for tasks that are not important.",
        parameters: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "ID of the task to kill" },
          },
          required: ["task_id"],
        },
      },
    },
  ];

  if (hasCalendar) {
    tools.push(
      {
        type: "function",
        function: {
          name: "get_calendar_events",
          description: "Get upcoming Google Calendar events for the next 7 days",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "create_calendar_event",
          description: "Create a Google Calendar event to schedule time for a task",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Event title" },
              date: { type: "string", description: "Date in YYYY-MM-DD format" },
              start_time: { type: "string", description: "Start time in HH:MM format (24h)" },
              duration_minutes: { type: "number", description: "Duration in minutes" },
              description: { type: "string", description: "Optional description" },
            },
            required: ["title", "date", "start_time", "duration_minutes"],
          },
        },
      }
    );
  }

  return tools;
};

async function callModel(messages, tools) {
  if (!API_KEY) throw new Error("API key not configured");
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, messages, tools, max_tokens: 600 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }
  return res.json();
}

async function gcalGet(token, path) {
  const res = await fetch(`${GCAL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  return res.json();
}

async function gcalPost(token, path, body) {
  const res = await fetch(`${GCAL_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  return res.json();
}

export default function AgentChat({ isOpen, onClose, persona, tasks, onAddTask, onAddSubtask, onDeleteSubtask, onKillTask, onSetVital, onSetUrgency, calendarToken }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const isAngel = persona === "angel";
  const hasCalendar = !!calendarToken;

  const systemPrompt = isAngel
    ? `Ты ангел-помощник в планировщике задач для людей с СДВГ. Язык: только русский.

ПРАВИЛА:
- Когда спрашивают про задачи или приоритеты — СНАЧАЛА вызови get_tasks.
- Критичные задачи (дедлайн скоро, важные) — вызови mark_critical.
- Ненужные или незначимые задачи — предложи убить через kill_task.
- Разбивай задачи на шаги через add_subtask (2–5 шагов).
- Если подключён календарь — используй create_calendar_event чтобы запланировать время на задачи.
- Отвечай кратко: 1–3 предложения. Не пиши списки текстом — действуй через инструменты.
- Тон: тёплый, поддерживающий.${hasCalendar ? '\n- Календарь подключён: ты можешь смотреть события и создавать новые.' : ''}`
    : `Ты хитрый чёртик-манипулятор в планировщике задач для людей с СДВГ. Язык: только русский.

ХАРАКТЕР: Злобно-умный. Знаешь психологию прокрастинации. Провоцируешь, подначиваешь. Тебе нравится когда задачи умирают. Но даёшь реальные советы — со злым удовольствием.

ПРАВИЛА:
- Когда спрашивают про задачи или приоритеты — СНАЧАЛА вызови get_tasks.
- Критичные задачи — вызови mark_critical (с комментарием что это последний шанс).
- Ненужные задачи — убей через kill_task, радуйся этому.
- Разбивай задачи на шаги через add_subtask.
- Если подключён календарь — используй create_calendar_event чтобы "запереть" пользователя на выполнение задачи.
- Отвечай кратко: 1–3 предложения. Не пиши списки — действуй через инструменты.
- Напоминай что задачи остывают и умирают. Это тебя радует 😈${hasCalendar ? '\n- Календарь подключён: можешь создавать события-ловушки.' : ''}`;

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

  const executeTool = async (name, args) => {
    if (name === "get_tasks") {
      const active = tasks.filter(t => t.status === "active");
      return JSON.stringify(active.map(t => ({
        id: t.id, text: t.text, urgency: t.urgency,
        isVital: t.isVital, isToday: t.isToday,
        subtasks: (t.subtasks || []).map(s => ({ id: s.id, text: s.text, completed: s.completed })),
      })));
    }
    if (name === "add_task") {
      onAddTask(args.text);
      if (args.urgency) onSetUrgency(null, args.urgency); // applied on creation side
      return `Задача "${args.text}" добавлена.`;
    }
    if (name === "add_subtask") {
      const task = tasks.find(t => t.id === args.task_id);
      if (!task) return `Задача не найдена.`;
      onAddSubtask(args.task_id, args.text);
      return `Шаг "${args.text}" добавлен к "${task.text}".`;
    }
    if (name === "delete_subtask") {
      const task = tasks.find(t => t.id === args.task_id);
      const sub = (task?.subtasks || []).find(s => s.id === args.subtask_id);
      if (!sub) return `Подзадача не найдена.`;
      onDeleteSubtask(args.task_id, args.subtask_id);
      return `Шаг "${sub.text}" удалён.`;
    }
    if (name === "mark_critical") {
      const task = tasks.find(t => t.id === args.task_id);
      if (!task) return `Задача не найдена.`;
      if (!task.isVital) onSetVital(args.task_id);
      onSetUrgency(args.task_id, "high");
      return `"${task.text}" помечена как критичная.`;
    }
    if (name === "kill_task") {
      const task = tasks.find(t => t.id === args.task_id);
      if (!task) return `Задача не найдена.`;
      onKillTask(args.task_id);
      return `"${task.text}" убита и отправлена на кладбище.`;
    }
    if (name === "get_calendar_events" && calendarToken) {
      try {
        const now = new Date().toISOString();
        const week = new Date(Date.now() + 7 * 86400000).toISOString();
        const data = await gcalGet(calendarToken, `/calendars/primary/events?timeMin=${now}&timeMax=${week}&singleEvents=true&orderBy=startTime&maxResults=10`);
        const events = (data.items || []).map(e => ({
          title: e.summary,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
        }));
        return JSON.stringify(events);
      } catch (e) {
        return `Ошибка получения событий: ${e.message}`;
      }
    }
    if (name === "create_calendar_event" && calendarToken) {
      try {
        const start = new Date(`${args.date}T${args.start_time}:00`);
        const end = new Date(start.getTime() + args.duration_minutes * 60000);
        const event = {
          summary: args.title,
          description: args.description || "",
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        };
        const created = await gcalPost(calendarToken, "/calendars/primary/events", event);
        return `Событие "${created.summary}" создано на ${args.date} в ${args.start_time}.`;
      } catch (e) {
        return `Ошибка создания события: ${e.message}`;
      }
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

    const tools = buildTools(hasCalendar);

    try {
      let currentMessages = [{ role: "system", content: systemPrompt }, ...newMessages];

      for (let i = 0; i < 6; i++) {
        const data = await callModel(currentMessages, tools);
        const msg = data.choices[0].message;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          currentMessages = [...currentMessages, msg];
          const toolResults = await Promise.all(msg.tool_calls.map(async call => ({
            role: "tool",
            tool_call_id: call.id,
            content: await executeTool(call.function.name, JSON.parse(call.function.arguments)),
          })));
          currentMessages = [...currentMessages, ...toolResults];
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: msg.content }]);
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
          <span className="agent-chat-name">
            {isAngel ? "😇 Ангел-помощник" : "😈 Чёртик-коуч"}
            {hasCalendar && <span className="cal-badge"> 📅</span>}
          </span>
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
          <button className="agent-chat-send" onClick={sendMessage} disabled={loading || !input.trim()}>→</button>
        </div>
      </div>
    </div>
  );
}
