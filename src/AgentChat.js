import React, { useState, useRef, useEffect } from 'react';
import './AgentChat.css';

const API_ROUTE = "/api/agent-chat";
const MODEL = "google/gemma-4-26b-a4b-it";
const GCAL_API = "https://www.googleapis.com/calendar/v3";

function normalizeToolTaskText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(мне|надо|нужно|хочу|задача|задачу|пожалуйста)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const res = await fetch(API_ROUTE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, messages, tools, max_tokens: 600 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Agent chat ${res.status}: ${err}`);
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

export default function AgentChat({ isOpen, onClose, persona, tasks, onAddTask, onAddSubtask, onDeleteSubtask, onKillTask, onSetVital, onSetUrgency, calendarToken, language = "ru" }) {
  const [messageHistory, setMessageHistory] = useState({
    angel: [],
    devil: [],
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const sendingRef = useRef(false);

  const isAngel = persona === "angel";
  const isEnglish = language === "en";
  const hasCalendar = !!calendarToken;
  const messages = messageHistory[persona] || [];
  const copy = {
    angelName: isEnglish ? "😇 Angel assistant" : "😇 Ангел-помощник",
    devilName: isEnglish ? "😈 Devil coach" : "😈 Чёртик-коуч",
    placeholder: isEnglish ? "Write here..." : "Напиши сюда...",
    connectionError: isEnglish ? "Connection error. Try again." : "Ошибка связи. Попробуй ещё раз.",
    angelGreeting: isEnglish
      ? "Hi. I can look at your tasks and help choose where to start. What feels heaviest right now?"
      : "Привет! Покажу твои задачи и помогу разобраться с чего начать. Что беспокоит больше всего?",
    devilGreeting: isEnglish
      ? "Well, well. Let me inspect this list. Ask me what to kill, mark, or rescue."
      : "Ну и что тут у нас... Давай посмотрим на твой список. Спрашивай.",
    emptyTask: isEnglish ? "I will not add an empty task." : "Пустую задачу не добавляю.",
    emptyStep: isEnglish ? "I will not add an empty step." : "Пустой шаг не добавляю.",
    taskNotFound: isEnglish ? "Task not found." : "Задача не найдена.",
    subtaskNotFound: isEnglish ? "Subtask not found." : "Подзадача не найдена.",
    unknownTool: isEnglish ? "Unknown tool." : "Неизвестный инструмент",
    calendarFetchError: isEnglish ? "Could not get events" : "Ошибка получения событий",
    calendarCreateError: isEnglish ? "Could not create event" : "Ошибка создания события",
  };

  const setMessagesForPersona = (updater) => {
    setMessageHistory((previous) => {
      const currentMessages = previous[persona] || [];
      const nextMessages =
        typeof updater === "function" ? updater(currentMessages) : updater;

      return {
        ...previous,
        [persona]: nextMessages,
      };
    });
  };

  const systemPrompt = isEnglish
    ? (isAngel
      ? `You are an angel assistant inside an ADHD planner. Language: English only.

RULES:
- When asked about tasks or priorities, FIRST call get_tasks.
- For critical tasks with deadlines or importance, call mark_critical.
- For irrelevant or stale tasks, suggest kill_task.
- Break tasks into steps with add_subtask when useful.
- If calendar is connected, use create_calendar_event to schedule focused time.
- Keep replies short: 1-3 sentences. Do not write long task lists manually; use tools.
- Tone: warm, practical, supportive.${hasCalendar ? '\n- Calendar is connected: you can inspect events and create new ones.' : ''}`
      : `You are a clever devil coach inside an ADHD planner. Language: English only.

PERSONALITY: sharp, mischievous, psychologically smart. You enjoy when stale tasks die, but you still give useful advice.

RULES:
- When asked about tasks or priorities, FIRST call get_tasks.
- For critical tasks, call mark_critical and frame it as the last chance.
- For useless or stale tasks, use kill_task and be pleased about it.
- Break tasks into steps with add_subtask.
- If calendar is connected, use create_calendar_event to trap time for the user.
- Keep replies short: 1-3 sentences. Do not write long task lists manually; use tools.
- Remind that stale tasks cool down and die. This pleases you.${hasCalendar ? '\n- Calendar is connected: you can create calendar traps.' : ''}`)
    : isAngel
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
      const greeting = isAngel ? copy.angelGreeting : copy.devilGreeting;
      setMessagesForPersona([{ role: "assistant", content: greeting }]);
    }
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen, persona]); // eslint-disable-line

  useEffect(() => {
    setInput("");
    setLoading(false);
  }, [persona]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const executeTool = async (name, args, sessionToolKeys = null) => {
    if (name === "get_tasks") {
      const active = tasks.filter(t => t.status === "active");
      return JSON.stringify(active.map(t => ({
        id: t.id, text: t.text, urgency: t.urgency,
        isVital: t.isVital, isToday: t.isToday,
        subtasks: (t.subtasks || []).map(s => ({ id: s.id, text: s.text, completed: s.completed })),
      })));
    }
    if (name === "add_task") {
      const taskText = String(args.text || "").trim();
      const normalized = normalizeToolTaskText(taskText);
      if (!normalized) return copy.emptyTask;

      const toolKey = `add_task:${normalized}`;
      if (sessionToolKeys?.has(toolKey)) {
        return isEnglish
          ? `Task "${taskText}" was already handled in this message. I will not duplicate it.`
          : `Задача "${taskText}" уже была обработана в этом сообщении. Не дублирую.`;
      }
      sessionToolKeys?.add(toolKey);

      const existing = tasks.find((task) => (
        task.status === "active" &&
        normalizeToolTaskText(task.text) === normalized
      ));
      if (existing) {
        return isEnglish
          ? `Active task "${existing.text}" already exists. I will not create a duplicate.`
          : `Активная задача "${existing.text}" уже есть. Не создаю дубль.`;
      }

      await Promise.resolve(onAddTask(taskText, { urgency: args.urgency || "medium" }));
      return isEnglish ? `Task "${args.text}" added.` : `Задача "${args.text}" добавлена.`;
    }
    if (name === "add_subtask") {
      const task = tasks.find(t => t.id === args.task_id);
      if (!task) return copy.taskNotFound;
      const subtaskText = String(args.text || "").trim();
      const normalized = normalizeToolTaskText(subtaskText);
      if (!normalized) return copy.emptyStep;

      const toolKey = `add_subtask:${args.task_id}:${normalized}`;
      if (sessionToolKeys?.has(toolKey)) {
        return isEnglish
          ? `Step "${subtaskText}" was already handled in this message. I will not duplicate it.`
          : `Шаг "${subtaskText}" уже был обработан в этом сообщении. Не дублирую.`;
      }
      sessionToolKeys?.add(toolKey);

      const existingSubtask = (task.subtasks || []).find((subtask) => (
        normalizeToolTaskText(subtask.text) === normalized
      ));
      if (existingSubtask) {
        return isEnglish
          ? `Step "${existingSubtask.text}" already exists in "${task.text}". I will not duplicate it.`
          : `Шаг "${existingSubtask.text}" уже есть в "${task.text}". Не дублирую.`;
      }

      await Promise.resolve(onAddSubtask(args.task_id, subtaskText));
      return isEnglish
        ? `Step "${args.text}" added to "${task.text}".`
        : `Шаг "${args.text}" добавлен к "${task.text}".`;
    }
    if (name === "delete_subtask") {
      const task = tasks.find(t => t.id === args.task_id);
      const sub = (task?.subtasks || []).find(s => s.id === args.subtask_id);
      if (!sub) return copy.subtaskNotFound;
      await Promise.resolve(onDeleteSubtask(args.task_id, args.subtask_id));
      return isEnglish ? `Step "${sub.text}" deleted.` : `Шаг "${sub.text}" удалён.`;
    }
    if (name === "mark_critical") {
      const task = tasks.find(t => t.id === args.task_id);
      if (!task) return copy.taskNotFound;
      if (!task.isVital) await Promise.resolve(onSetVital(args.task_id));
      await Promise.resolve(onSetUrgency(args.task_id, "high"));
      return isEnglish ? `"${task.text}" marked as critical.` : `"${task.text}" помечена как критичная.`;
    }
    if (name === "kill_task") {
      const task = tasks.find(t => t.id === args.task_id);
      if (!task) return copy.taskNotFound;
      await Promise.resolve(onKillTask(args.task_id));
      return isEnglish
        ? `"${task.text}" sent to Cemetery.`
        : `"${task.text}" убита и отправлена на кладбище.`;
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
        return `${copy.calendarFetchError}: ${e.message}`;
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
        return isEnglish
          ? `Event "${created.summary}" created on ${args.date} at ${args.start_time}.`
          : `Событие "${created.summary}" создано на ${args.date} в ${args.start_time}.`;
      } catch (e) {
        return `${copy.calendarCreateError}: ${e.message}`;
      }
    }
    return copy.unknownTool;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || sendingRef.current) return;
    sendingRef.current = true;
    setInput("");

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessagesForPersona(newMessages);
    setLoading(true);

    const tools = buildTools(hasCalendar);
    const sessionToolKeys = new Set();
    const executedToolResults = [];

    try {
      let currentMessages = [{ role: "system", content: systemPrompt }, ...newMessages];

      for (let i = 0; i < 6; i++) {
        const data = await callModel(currentMessages, tools);
        const msg = data.choices[0].message;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          currentMessages = [...currentMessages, msg];
          const toolResults = await Promise.all(msg.tool_calls.map(async call => {
            const content = await executeTool(call.function.name, JSON.parse(call.function.arguments), sessionToolKeys);
            if (call.function.name !== "get_tasks") {
              executedToolResults.push(content);
            }
            return {
              role: "tool",
              tool_call_id: call.id,
              content,
            };
          }));
          currentMessages = [...currentMessages, ...toolResults];
        } else {
          setMessagesForPersona(prev => [...prev, { role: "assistant", content: msg.content }]);
          break;
        }
      }
    } catch (e) {
      console.error("[AgentChat]", e);
      const fallback = executedToolResults
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join("\n");
      setMessagesForPersona(prev => [
        ...prev,
        { role: "assistant", content: fallback || copy.connectionError },
      ]);
    } finally {
      sendingRef.current = false;
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
            {isAngel ? copy.angelName : copy.devilName}
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
            placeholder={copy.placeholder}
            rows={1}
            disabled={loading}
          />
          <button className="agent-chat-send" onClick={sendMessage} disabled={loading || !input.trim()}>→</button>
        </div>
      </div>
    </div>
  );
}
