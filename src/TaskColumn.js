// src/TaskColumn.js
import React, { useState, useEffect, useRef } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { sortTasksByOrder } from "./taskOrderUtils";
import "./TaskColumn.css";

function DraggableTask({ id, children, dragTitle = "Drag" }) {
  const { attributes, listeners, setNodeRef: setDraggableNodeRef, transform, isDragging } = useDraggable({ id });
  const { isOver, setNodeRef: setDropNodeRef } = useDroppable({ id: `task-drop-${id}` });
  const setTaskNodeRef = React.useCallback(
    (node) => {
      setDraggableNodeRef(node);
      setDropNodeRef(node);
    },
    [setDraggableNodeRef, setDropNodeRef],
  );
  return (
    <div
      ref={setTaskNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
        position: 'relative',
      }}
      className={isOver ? "task-drop-over" : ""}
      {...attributes}
    >
      <div
        className="drag-handle"
        {...listeners}
        style={{ touchAction: 'none' }}
        title={dragTitle}
      >⠿</div>
      {children}
    </div>
  );
}

function DroppableZone({ id, children, className, style }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className || ""} ${isOver ? "dnd-zone-over" : ""}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function getDayNumberFromIsoDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDeadlineBadge(deadlineAt, language = "ru") {
  if (!deadlineAt) return null;
  const isEnglish = language === "en";

  const [year, month, day] = deadlineAt.split("-").map(Number);
  const deadline = new Date(year, month - 1, day);
  if (Number.isNaN(deadline.getTime())) return null;

  const deadlineDayNumber = getDayNumberFromIsoDate(deadlineAt);
  const todayDayNumber = getDayNumberFromIsoDate(getTodayIsoDate());
  if (deadlineDayNumber === null || todayDayNumber === null) return null;
  const daysLeft = deadlineDayNumber - todayDayNumber;
  const shortDate = deadline.toLocaleDateString(isEnglish ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "short",
  });

  if (daysLeft < 0) {
    return { tone: "overdue", label: `${isEnglish ? "Overdue" : "Просрочено"} · ${shortDate}` };
  }

  if (daysLeft === 0) {
    return { tone: "today", label: `${isEnglish ? "Today" : "Сегодня"} · ${shortDate}` };
  }

  if (daysLeft === 1) {
    return { tone: "soon", label: `${isEnglish ? "Tomorrow" : "Завтра"} · ${shortDate}` };
  }

  if (daysLeft <= 7) {
    return { tone: "watch", label: `${daysLeft}${isEnglish ? "d" : " дн."} · ${shortDate}` };
  }

  return { tone: "calm", label: `${isEnglish ? "By" : "До"} ${shortDate}` };
}

function getDaysAlive(task) {
  // task.id is Date.now() string for web-created tasks
  const createdAt = /^\d{10,}$/.test(task.id) ? Number(task.id) : null;
  if (!createdAt) return null;
  return Math.max(0, Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000)));
}

function formatMs(ms, language = "ru") {
  if (!ms || ms <= 0) return null;
  const isEnglish = language === "en";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}${isEnglish ? "h" : "ч"} ${m}${isEnglish ? "m" : "м"}`;
  if (m > 0) return `${m}${isEnglish ? "m" : "м"} ${s}${isEnglish ? "s" : "с"}`;
  return `${s}${isEnglish ? "s" : "с"}`;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNotYourMoveMetadata(task = {}) {
  const blocked = task?.blocked && typeof task.blocked === "object" ? task.blocked : {};
  const legacy = task?.notYourMove && typeof task.notYourMove === "object" ? task.notYourMove : {};
  const metadata = { ...legacy, ...blocked };
  return String(metadata.status || "").toLowerCase() === "not_your_move" ? metadata : null;
}

function formatCheckInDate(value, language = "ru") {
  const timestamp = toMillis(value);
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString(language === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function getQuestRelationBadge(relationMemory = null, language = "ru", hasNotYourMoveState = false) {
  const signal = String(relationMemory?.lastSignal || "").trim().toLowerCase();
  if (!signal) return null;
  if (hasNotYourMoveState && (signal === "not_my_move" || signal === "still_waiting")) return null;
  const isEnglish = language === "en";
  const labels = {
    too_big: isEnglish ? "sticky: too big" : "липко: большое",
    unclear: isEnglish ? "sticky: unclear" : "липко: мутно",
    not_my_move: isEnglish ? "not your move? confirm" : "не твой ход? подтвердить",
    still_waiting: isEnglish ? "waiting check-in" : "проверить ожидание",
    kill_without_guilt: isEnglish ? "asked to die" : "просилось в кладбище",
    not_now: isEnglish ? "cooling down" : "пауза",
    rescue_later: isEnglish ? "rescue paused" : "rescue на паузе",
    microstep_completed: isEnglish ? "movement counted" : "сдвиг засчитан",
  };
  const label = labels[signal];
  if (!label) return null;
  const tone = signal === "microstep_completed"
    ? "moved"
    : signal === "not_my_move" || signal === "still_waiting"
      ? "waiting"
      : signal === "kill_without_guilt"
        ? "cemetery"
        : signal === "not_now" || signal === "rescue_later"
          ? "cooldown"
          : "sticky";
  return { signal, label, tone };
}

function getQuestRelationStatusNote(signal = "", language = "ru", context = {}) {
  const normalized = String(signal || "").trim().toLowerCase();
  const isEnglish = language === "en";
  const isConfirmedCemetery = Boolean(
    context?.cemeteryConfirmed ||
    context?.taskStatus === "dead" ||
    context?.status === "dead"
  );
  const notes = {
    too_big: {
      tone: "sticky",
      title: isEnglish ? "Angel read: too big" : "Ангел понял: слишком большое",
      body: isEnglish
        ? "Do not push the whole quest. Shrink it before rescue."
        : "Не давим на весь квест. Сначала сжимаем его до маленького входа.",
      cta: isEnglish ? "Tap to make it smaller." : "Нажми, чтобы уменьшить.",
    },
    unclear: {
      tone: "sticky",
      title: isEnglish ? "Angel read: foggy" : "Ангел понял: мутно",
      body: isEnglish
        ? "Do not force action yet. Clarify the first visible move."
        : "Пока не заставляем действовать. Сначала ищем первый видимый ход.",
      cta: isEnglish ? "Tap to clarify." : "Нажми, чтобы прояснить.",
    },
    kill_without_guilt: {
      tone: "cemetery",
      title: isConfirmedCemetery
        ? (isEnglish ? "Buried, not deleted" : "Похоронено, не удалено")
        : (isEnglish ? "Cemetery request" : "Просится в кладбище"),
      body: isConfirmedCemetery
        ? (isEnglish
          ? "This quest was moved to Cemetery without deleting it forever."
          : "Квест перенесён на кладбище без удаления навсегда.")
        : (isEnglish
          ? "This is not deleted automatically. Angel will ask for confirmation first."
          : "Это не удаляется автоматически. Ангел сначала попросит подтверждение."),
      cta: isConfirmedCemetery
        ? (isEnglish ? "Restore if needed." : "Можно вернуть, если понадобится.")
        : (isEnglish ? "Tap to choose safely." : "Нажми, чтобы выбрать безопасно."),
    },
    not_now: {
      tone: "cooldown",
      title: isEnglish ? "Pressure lowered" : "Давление снижено",
      body: isEnglish
        ? "You said not now. Angel should not repeat the same direct push immediately."
        : "Ты сказала не сейчас. Ангел не должен сразу повторять тот же прямой заход.",
      cta: isEnglish ? "Tap when you want a gentler route." : "Нажми, когда нужен мягкий маршрут.",
    },
    rescue_later: {
      tone: "cooldown",
      title: isEnglish ? "Rescue paused" : "Rescue на паузе",
      body: isEnglish
        ? "The rescue entry did not open yet. Try a smaller or clearer route next."
        : "Спасательный вход пока не открылся. Дальше лучше уменьшить или прояснить.",
      cta: isEnglish ? "Tap to pick another entry." : "Нажми, чтобы выбрать другой вход.",
    },
    microstep_completed: {
      tone: "moved",
      title: isEnglish ? "Movement counted" : "Сдвиг засчитан",
      body: isEnglish
        ? "One tiny move worked. Continue gently instead of restarting the pressure loop."
        : "Один маленький ход сработал. Продолжаем мягко, не запускаем давление заново.",
      cta: isEnglish ? "Tap to continue gently." : "Нажми, чтобы продолжить мягко.",
    },
  };
  return notes[normalized] || null;
}

function getListPriorityScore(task) {
  let score = 0;
  if (task?.isVital) score += 500;
  if (task?.urgency === "high") score += 300;
  else if (task?.urgency === "medium") score += 160;
  if (task?.isToday) score += 120;

  const deadlineBadge = getDeadlineBadge(task?.deadlineAt || "");
  if (deadlineBadge?.tone === "overdue") score += 280;
  else if (deadlineBadge?.tone === "today") score += 240;
  else if (deadlineBadge?.tone === "soon") score += 160;
  else if (deadlineBadge?.tone === "watch") score += 90;

  const heatPenalty = Math.max(0, 100 - Number(task?.heatCurrent || 0));
  score += heatPenalty * 0.4;

  return score;
}

export default function TaskColumn({
  type,
  tasks,
  onTouch,
  onComplete,
  onKill,
  onResurrect,
  onReopenCompleted,
  onAddTask,
  onEditTask,
  onAddTime,
  onAddSubtask,
  onDeleteSubtask,
  onEditSubtask,
  onToggleSubtask,
  onToggleToday,
  onToggleVital,
  onSetUrgency,
  onSetResistance,
  onSetDeadline,
  onClearNotYourMove,
  onTrashCompleted,
  onCleanHeavenJunk,
  onPurgeHeavenJunk,
  onDeleteForever,
  onOpenTaskTune,
  getQuestRelationMemoryForTask,
  onQuestRelationClick,
  requestedTuneTaskId,
  onTuneRequestHandled,
  highlightTaskId,
  highlightTaskLabel,
  calendarConnected,
  onScheduleTaskToCalendar,
  language = "ru",
}) {
  const isEnglish = language === "en";
  const copy = {
    newTaskPlaceholder: isEnglish ? "+ What big task are we aiming at?" : "+ Какую глобальную задачу берем на прицел?",
    addTask: isEnglish ? "Add (pulse 35)" : "Добавить (пульс 35)",
    drag: isEnglish ? "Drag" : "Перетащить",
    focus: isEnglish ? "IN FOCUS" : "В ФОКУСЕ",
    background: isEnglish ? "BACKGROUND" : "НА ФОНЕ",
    purgatory: isEnglish ? "PURGATORY" : "ЧИСТИЛИЩЕ",
    emptyFocus: isEnglish ? "No burning tasks" : "Нет пламенных задач",
    emptyBackground: isEnglish ? "Everything is either hot or frozen" : "Все либо горит, либо замерзает",
    emptyPurgatory: isEnglish ? "Nobody is freezing" : "Никто не замерзает",
    heavenEmpty: isEnglish ? "Heaven is empty. Complete a task." : "Рай пуст. Завершите задачу!",
    cemeteryEmpty: isEnglish ? "Cemetery is empty. Good." : "Кладбище пустует. Так держать!",
    moveToTrash: isEnglish ? "🪦 To Cemetery" : "🪦 В мусор",
    deleteForever: isEnglish ? "💥 Delete forever" : "💥 В небытие",
    resurrect: isEnglish ? "🔄 Restore" : "🔄 Воскресить",
    today: isEnglish ? "today" : "сегодня",
    critical: isEnglish ? "critical" : "критично",
    urgencyHigh: isEnglish ? "urgent" : "срочно",
    urgencyMedium: isEnglish ? "normal" : "норм",
    urgencyLow: isEnglish ? "later" : "позже",
    resistanceHigh: isEnglish ? "scary" : "страшно",
    resistanceMedium: isEnglish ? "medium" : "средне",
    resistanceLow: isEnglish ? "easy" : "легко",
    nextStep: isEnglish ? "Next step:" : "Следующий шаг:",
    dayShort: isEnglish ? "d" : "дн.",
    addCalendar: isEnglish ? "Add" : "Добавить",
    confirmTitle: isEnglish ? "Done?" : "Точно всё?",
    confirmBody: isEnglish ? "This task will move to Heaven. Are you sure?" : "Эта задача отправится в Рай. Уверены?",
    confirmYes: isEnglish ? "YES" : "ДА!",
    confirmNo: isEnglish ? "NOT YET" : "ЕЩЕ НЕТ",
    cleanTestJunk: isEnglish ? "🧹 Clean test junk" : "🧹 Убрать тестовый мусор",
    purgeTestJunk: isEnglish ? "💥 Delete forever (test junk only)" : "💥 В небытие (только тест-мусор)",
    returnActive: isEnglish ? "↩️ Restore to active" : "↩️ Вернуть в активные",
    calendarError: isEnglish ? "Could not add to calendar" : "Не удалось добавить в календарь",
    openSettings: isEnglish ? "Open task settings" : "Открыть настройку задачи",
    hideSettings: isEnglish ? "Hide settings" : "Скрыть настройки",
    tuneTask: isEnglish ? "Tune task" : "Настроить задачу",
    dayMission: isEnglish ? "Day mission" : "Цель дня",
    vitalTitle: isEnglish ? "Critical priority" : "Жизненно важный приоритет",
    vitalOn: isEnglish ? "Critical" : "Критично",
    vitalOff: isEnglish ? "Normal" : "Обычно",
    todayPinned: isEnglish ? "📌 Pinned" : "📌 Закреплено",
    todayPin: isEnglish ? "☆ Pin" : "☆ Закрепить",
    editTitle: isEnglish ? "Double-click to edit" : "Двойной клик — редактировать",
    pulse: isEnglish ? "Pulse" : "Пульс",
    urgency: isEnglish ? "Urgency" : "Срочность",
    resistance: isEnglish ? "Resistance" : "Сопротивление",
    deadline: isEnglish ? "Deadline" : "Дедлайн",
    urgencyOptionLow: isEnglish ? "Can wait" : "Можно позже",
    urgencyOptionMedium: isEnglish ? "Normal" : "Нормально",
    urgencyOptionHigh: isEnglish ? "Urgent" : "Срочно",
    resistanceOptionLow: isEnglish ? "Easy" : "Легко",
    resistanceOptionMedium: isEnglish ? "Medium" : "Средне",
    resistanceOptionHigh: isEnglish ? "Scary" : "Страшно",
    deleteStep: isEnglish ? "Delete step" : "Удалить шаг",
    stepPlaceholder: isEnglish ? "+ Step" : "+ Шаг",
    stopTimerTitle: isEnglish ? "Stop timer" : "Остановить таймер",
    startTimerTitle: isEnglish ? "Start timer" : "Запустить таймер",
    stopTimer: isEnglish ? "⏹ Stop" : "⏹ Стоп",
    startTimer: isEnglish ? "▶ Start" : "▶ Старт",
    touch: isEnglish ? "👀 I moved" : "👀 Вспомнил",
    complete: isEnglish ? "🚀 Done!" : "🚀 Завершить!",
    scheduleCalendar: isEnglish ? "Schedule in Google Calendar" : "Запланировать в Google Calendar",
    cemetery: isEnglish ? "✖️ To Cemetery" : "✖️ На кладбище",
    notYourMove: isEnglish ? "Not your move" : "Не твой ход",
    notYourMoveWaiting: isEnglish ? "Waiting, not failing." : "Это ожидание, не провал.",
    notYourMoveCheckIn: isEnglish ? "Check-in" : "Проверить",
    notYourMoveNoDate: isEnglish ? "no date set" : "дата не задана",
    notYourMoveDue: isEnglish ? "check now" : "пора проверить",
    clearNotYourMove: isEnglish ? "Back in my hands" : "Снова в моих руках",
    possibleNotYourMove: isEnglish ? "May be Not Your Move" : "Возможно, не твой ход",
    possibleNotYourMoveBody: isEnglish
      ? "Angel will stop pushing this only after you confirm what we are waiting for."
      : "Ангел снимет давление только после того, как ты подтвердишь, чего мы ждём.",
    possibleNotYourMoveCta: isEnglish ? "Click here to confirm what we are waiting for." : "Нажми сюда, чтобы подтвердить, чего ждём.",
    relationSuggestedStep: isEnglish ? "Angel's entry point" : "Вход от ангела",
    relationSuggestedStepCta: isEnglish ? "Tap to continue this route." : "Нажми, чтобы продолжить этот маршрут.",
    relationCompletedStep: isEnglish ? "Counted micro-step" : "Засчитанный микрошаг",
    relationCompletedStepCta: isEnglish ? "Movement is logged. Tap to continue gently." : "Сдвиг записан. Нажми, чтобы мягко продолжить.",
  };
  const orderedTasks = sortTasksByOrder(tasks);
  const [newTaskText, setNewTaskText] = useState("");
  const [newSubtaskText, setNewSubtaskText] = useState({}); // {taskId: text}
  const [confirmTaskId, setConfirmTaskId] = useState(null);
  const [editingSubtask, setEditingSubtask] = useState(null); // { taskId, subId, text }
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskText, setEditingTaskText] = useState("");
  const [activeTimerTaskId, setActiveTimerTaskId] = useState(null);
  const [tuningTaskId, setTuningTaskId] = useState(null);
  const [timerTick, setTimerTick] = useState(0);
  const timerStartRef = useRef(null);

  useEffect(() => {
    if (!activeTimerTaskId) return;
    const interval = setInterval(() => setTimerTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimerTaskId]);
  useEffect(() => {
    if (!requestedTuneTaskId) return;
    if (tasks.some((task) => String(task.id) === String(requestedTuneTaskId))) {
      setTuningTaskId(String(requestedTuneTaskId));
      if (typeof onTuneRequestHandled === "function") {
        onTuneRequestHandled();
      }
    }
  }, [requestedTuneTaskId, tasks, onTuneRequestHandled]);
  const [calPickerTaskId, setCalPickerTaskId] = useState(null);
  const [calDate, setCalDate] = useState("");
  const [calTime, setCalTime] = useState("10:00");
  const [calDuration, setCalDuration] = useState(60);
  const [calSaving, setCalSaving] = useState(false);
  const [calError, setCalError] = useState("");

  const scheduleToCalendar = async (task) => {
    if (!calendarConnected || !calDate || typeof onScheduleTaskToCalendar !== "function") return;
    setCalSaving(true);
    setCalError("");
    try {
      await onScheduleTaskToCalendar(task, {
        date: calDate,
        startTime: calTime,
        durationMinutes: calDuration,
      });
      setCalPickerTaskId(null);
    } catch (e) {
      console.error("Calendar error:", e);
      setCalError(e.message || copy.calendarError);
    } finally {
      setCalSaving(false);
    }
  };

  const addTask = () => {
    if (!newTaskText.trim()) return;
    onAddTask(newTaskText.trim());
    setNewTaskText("");
  };

  const addSubtask = (taskId) => {
    const text = newSubtaskText[taskId] || "";
    if (!text.trim()) return;
    onAddSubtask(taskId, text.trim());
    setNewSubtaskText({ ...newSubtaskText, [taskId]: "" });
  };

  if (type === "heaven") {
    const sortedTasks = orderedTasks;
    // ... heaven render ...
    return (
      <div className="task-column-container">
        <div className="heaven-maintenance-actions">
          {onCleanHeavenJunk && (
            <button type="button" className="heaven-maintenance-btn" onClick={onCleanHeavenJunk}>
              {copy.cleanTestJunk}
            </button>
          )}
          {onPurgeHeavenJunk && (
            <button type="button" className="heaven-maintenance-btn heaven-maintenance-btn-danger" onClick={onPurgeHeavenJunk}>
              {copy.purgeTestJunk}
            </button>
          )}
        </div>
        <div className="tasks-grid">
          {sortedTasks.map(task => (
            <DraggableTask key={task.id} id={`task-${task.id}`} dragTitle={copy.drag}>
              <div className="heaven-cloud animated-fade-in">
                <div className="cloud-icon">🕊️</div>
                <div className="heaven-task-name">{task.text}</div>
                {task.subtasks && task.subtasks.length > 0 && (
                  <div className="heaven-subtasks" style={{marginTop: '10px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'left', width: '100%'}}>
                    {task.subtasks.map(sub => (
                      <div key={sub.id} style={{textDecoration: sub.completed ? 'line-through' : 'none', opacity: sub.completed ? 0.6 : 1, marginBottom: '4px'}}>
                        {sub.completed ? '✓' : '○'} {sub.text}
                      </div>
                    ))}
                  </div>
                )}
                <div className="points-badge">+10 points</div>
                {onReopenCompleted && (
                  <button className="reopen-btn" onClick={() => onReopenCompleted(task.id)}>
                    {copy.returnActive}
                  </button>
                )}
                {onTrashCompleted && (
                  <button className="reopen-btn" onClick={() => onTrashCompleted(task.id)}>
                    {copy.moveToTrash}
                  </button>
                )}
                {onDeleteForever && (
                  <button className="reopen-btn" onClick={() => onDeleteForever(task.id)}>
                    {copy.deleteForever}
                  </button>
                )}
              </div>
            </DraggableTask>
          ))}
          {tasks.length === 0 && <p style={{color: '#3aedff', textAlign: 'center', width: '100%', fontFamily: "'GuildensternNbp', 'VT323', monospace", fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.6}}>{copy.heavenEmpty}</p>}
        </div>
      </div>
    );
  }

  if (type === "cemetery") {
    const sortedTasks = orderedTasks;
    const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
    const exhumationPhrases = isEnglish
      ? [
        "This has been resting for a while. Want to try again with a tiny pulse?",
        "A month passed. Some tasks come back lighter. Give it a chance?",
        "It is not forgotten. It is waiting. Restore it from zero?",
        "More than a month passed. Maybe it is easier now than it looked?",
      ]
      : [
        isEnglish ? "It has been lying here for a while. Want to try again with minimum pulse?" : "Слушай, она тут уже давно лежит. Может, попробуем ещё раз — с минимальным пульсом?",
        isEnglish ? "A month passed. Sometimes tasks come back easier. Give it a chance?" : "Месяц прошёл. Иногда задачи возвращаются сами. Дать ей шанс?",
        isEnglish ? "It is not forgotten, just waiting. Restore it from zero?" : "Она не забыта — просто ждёт. Воскресить с нуля?",
        isEnglish ? "More than a month passed. Maybe it is easier now than it looked?" : "Прошло больше месяца. Может, теперь это проще, чем казалось?",
      ];
    return (
      <div className="task-column-container">
        <div className="tasks-grid">
          {sortedTasks.map((task, i) => {
            const deadAt = task.deadAt || ((/^\d{10,}$/.test(task.id)) ? Number(task.id) : null);
            const isOld = deadAt && (Date.now() - deadAt) > MONTH_MS;
            const phrase = exhumationPhrases[i % exhumationPhrases.length];
            return (
              <DraggableTask key={task.id} id={`task-${task.id}`} dragTitle={copy.drag}>
                <div className="tombstone animated-fade-in">
                  <div className="tombstone-rip">R.I.P.</div>
                  <div className="tombstone-task-name">{task.text}</div>
                  <div className="cemetery-points-badge">-5 points</div>
                  {isOld && (
                    <div className="exhumation-prompt">
                      <span className="exhumation-angel">👼</span>
                      <p className="exhumation-text">{phrase}</p>
                    </div>
                  )}
                  <button className="resurrect-btn" onClick={() => onResurrect(task.id)}>
                    {copy.resurrect}
                  </button>
                  {onDeleteForever && (
                    <button className="reopen-btn" onClick={() => onDeleteForever(task.id)}>
                      {copy.deleteForever}
                    </button>
                  )}
                </div>
              </DraggableTask>
            );
          })}
          {tasks.length === 0 && <p style={{color: '#8a1c1c', textAlign: 'center', width: '100%', fontFamily: "'GuildensternNbp', 'VT323', monospace", fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8}}>{copy.cemeteryEmpty}</p>}
        </div>
      </div>
    );
  }

  // Active Zone logic
  const prioritizedTasks = [...orderedTasks].sort((left, right) => {
    const priorityDelta = getListPriorityScore(right) - getListPriorityScore(left);
    if (priorityDelta !== 0) return priorityDelta;
    return (left.position || 0) - (right.position || 0);
  });

  const hotTasks = prioritizedTasks.filter(t => t.heatCurrent > 60);
  const passiveTasks = prioritizedTasks.filter(t => t.heatCurrent > 25 && t.heatCurrent <= 60);
  const purgatoryTasks = prioritizedTasks.filter(t => t.heatCurrent <= 25);

  const renderTaskCard = (task, isPurgatory, heatColor) => (
    (() => {
      const deadlineBadge = getDeadlineBadge(task.deadlineAt, language);
      const isTuneOpen = String(requestedTuneTaskId || tuningTaskId || "") === String(task.id);
      const isHighlightedTask = String(task.id) === String(highlightTaskId);
      const highlightLabel = String(highlightTaskLabel || copy.dayMission).trim();
      const firstOpenSubtask = (task.subtasks || []).find((subtask) => !subtask.completed) || null;
      const notYourMove = getNotYourMoveMetadata(task);
      const checkInAt = toMillis(notYourMove?.nextCheckInAt || notYourMove?.next_check_in_at);
      const checkInLabel = checkInAt ? formatCheckInDate(checkInAt, language) : copy.notYourMoveNoDate;
      const checkInDue = checkInAt > 0 && checkInAt <= Date.now();
      const questRelation = typeof getQuestRelationMemoryForTask === "function"
        ? getQuestRelationMemoryForTask(task)
        : null;
      const questRelationBadge = getQuestRelationBadge(questRelation, language, Boolean(notYourMove));
      const relationSuggestedStep = String(questRelation?.lastSuggestedStep || "").trim();
      const relationStepWasCompleted = questRelationBadge?.signal === "microstep_completed";
      const relationSuggestsNotYourMove = !notYourMove &&
        (questRelationBadge?.signal === "not_my_move" || questRelationBadge?.signal === "still_waiting");
      const relationStatusNote = questRelationBadge && !relationSuggestsNotYourMove && !relationSuggestedStep
        ? getQuestRelationStatusNote(questRelationBadge.signal, language, {
            taskStatus: task.status,
            cemeteryConfirmed: Boolean(questRelation?.cemeteryConfirmed || questRelation?.lastBuriedAt),
          })
        : null;
      return (
    <div
      key={task.id}
      data-task-id={task.id}
      className={`task-card animated-fade-in ${isPurgatory ? 'purgatory' : ''} ${isHighlightedTask ? 'priority-target' : ''} ${deadlineBadge ? `deadline-${deadlineBadge.tone}` : ''} ${task.isVital ? 'is-vital' : ''} ${notYourMove ? 'is-not-your-move' : ''} ${isTuneOpen ? 'is-tuning' : 'is-condensed'}`}
    >
      <button
        className="task-tune-btn"
        onClick={() => {
          if (typeof onOpenTaskTune === "function") {
            onOpenTaskTune(task.id);
            return;
          }
          setTuningTaskId((current) => String(current || "") === String(task.id) ? null : String(task.id));
        }}
        title={onOpenTaskTune ? copy.openSettings : isTuneOpen ? copy.hideSettings : copy.tuneTask}
        type="button"
      >
        ⋯
      </button>
      {isHighlightedTask && (
        <div className="priority-badge">{highlightLabel}</div>
      )}
      <div className="task-top-controls">
        <button
          className={`vital-toggle-btn ${task.isVital ? 'is-active' : ''}`}
          onClick={() => onToggleVital(task.id)}
          title={copy.vitalTitle}
          type="button"
        >
          <span className="vital-toggle-track" aria-hidden="true">
            <span className="vital-toggle-thumb" />
          </span>
          <span className="vital-toggle-copy">
            {task.isVital ? copy.vitalOn : copy.vitalOff}
          </span>
        </button>
        <button
          className={`today-toggle-btn ${task.isToday ? 'is-active' : ''}`}
          onClick={() => onToggleToday(task.id)}
          type="button"
        >
          {task.isToday ? copy.todayPinned : copy.todayPin}
        </button>
      </div>
      {deadlineBadge && (
        <div className={`deadline-badge ${deadlineBadge.tone}`}>{deadlineBadge.label}</div>
      )}
      <div className="task-text">
        {task.isVital ? '🚨 ' : isPurgatory ? '🥶 ' : (task.heatCurrent > 60 ? '🔥 ' : '🧊 ')}
        {(() => {
          const total = (task.subtasks || []).length;
          const done = (task.subtasks || []).filter(s => s.completed).length;
          return total > 0 ? (
            <span className="subtask-progress">{done}/{total}</span>
          ) : null;
        })()}
        {editingTaskId === task.id ? (
          <input
            autoFocus
            className="task-text-edit-input"
            value={editingTaskText}
            onChange={e => setEditingTaskText(e.target.value)}
            onBlur={() => {
              if (onEditTask) onEditTask(task.id, editingTaskText);
              setEditingTaskId(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (onEditTask) onEditTask(task.id, editingTaskText);
                setEditingTaskId(null);
              } else if (e.key === 'Escape') {
                setEditingTaskId(null);
              }
            }}
          />
        ) : (
          <span
            onDoubleClick={() => { setEditingTaskId(task.id); setEditingTaskText(task.text); }}
            title={copy.editTitle}
            style={{ cursor: 'text' }}
          >{task.text}</span>
        )}
      </div>
      {!isTuneOpen && (
        <>
          <div className="task-passive-row">
            {task.isToday && <span className="task-passive-chip">☀️ {copy.today}</span>}
            {task.isVital && <span className="task-passive-chip">🚨 {copy.critical}</span>}
            {notYourMove && (
              <span className={`task-passive-chip not-your-move-chip${checkInDue ? " is-due" : ""}`}>
                🪽 {copy.notYourMove} · {checkInDue ? copy.notYourMoveDue : `${copy.notYourMoveCheckIn} ${checkInLabel}`}
              </span>
            )}
            {questRelationBadge && (
              <button
                type="button"
                className={`task-passive-chip quest-relation-chip is-${questRelationBadge.tone}${typeof onQuestRelationClick === "function" ? " is-actionable" : ""}`}
                title={isEnglish ? "Open Angel's remembered entry for this quest." : "Открыть вход, который ангел запомнил для этого квеста."}
                onClick={(event) => {
                  event.stopPropagation();
                  if (typeof onQuestRelationClick === "function") {
                    onQuestRelationClick(task, questRelation);
                  }
                }}
              >
                🧭 {questRelationBadge.label}
              </button>
            )}
            <span className="task-passive-chip">{task.urgency === "high" ? `⏰ ${copy.urgencyHigh}` : task.urgency === "medium" ? `⏰ ${copy.urgencyMedium}` : `⏰ ${copy.urgencyLow}`}</span>
            <span className="task-passive-chip">{task.resistance === "high" ? `🧠 ${copy.resistanceHigh}` : task.resistance === "medium" ? `🧠 ${copy.resistanceMedium}` : `🧠 ${copy.resistanceLow}`}</span>
          </div>
          {notYourMove && (
            <div className={`task-not-your-move-note${checkInDue ? " is-due" : ""}`}>
              <strong>{copy.notYourMove}</strong>
              <span>
                {copy.notYourMoveWaiting} {copy.notYourMoveCheckIn}: {checkInLabel}.
              </span>
              {notYourMove.waitingFor && (
                <span className="task-not-your-move-context">
                  {isEnglish ? "Waiting for:" : "Ждём:"} {notYourMove.waitingFor}
                </span>
              )}
              {onClearNotYourMove && (
                <button
                  type="button"
                  className="not-your-move-clear-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClearNotYourMove(task.id);
                  }}
                >
                  {isEnglish ? "Back in my hands" : "Снова в моих руках"}
                </button>
              )}
            </div>
          )}
          {relationSuggestsNotYourMove && (
            <button
              type="button"
              className={`task-possible-not-your-move-note${typeof onQuestRelationClick === "function" ? " is-actionable" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                if (typeof onQuestRelationClick === "function") {
                  onQuestRelationClick(task, questRelation);
                }
              }}
            >
              <strong>{copy.possibleNotYourMove}</strong>
              <span>{copy.possibleNotYourMoveBody}</span>
              <span>{copy.possibleNotYourMoveCta}</span>
            </button>
          )}
          {relationStatusNote && (
            <button
              type="button"
              className={`task-relation-status-note is-${relationStatusNote.tone}${typeof onQuestRelationClick === "function" ? " is-actionable" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                if (typeof onQuestRelationClick === "function") {
                  onQuestRelationClick(task, questRelation);
                }
              }}
            >
              <strong>{relationStatusNote.title}</strong>
              <span>{relationStatusNote.body}</span>
              <em>{relationStatusNote.cta}</em>
            </button>
          )}
          {questRelationBadge && !relationSuggestsNotYourMove && relationSuggestedStep && (
            <button
              type="button"
              className={`task-relation-suggested-step${typeof onQuestRelationClick === "function" ? " is-actionable" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                if (typeof onQuestRelationClick === "function") {
                  onQuestRelationClick(task, questRelation);
                }
              }}
            >
              <strong>{relationStepWasCompleted ? copy.relationCompletedStep : copy.relationSuggestedStep}</strong>
              <span>{relationSuggestedStep}</span>
              <em>{relationStepWasCompleted ? copy.relationCompletedStepCta : copy.relationSuggestedStepCta}</em>
            </button>
          )}
          {firstOpenSubtask && (
            <div className="task-next-step">
              {copy.nextStep} {firstOpenSubtask.text}
            </div>
          )}
        </>
      )}
      
      {getDaysAlive(task) !== null && (
        <div className="days-alive">
          🗓 {getDaysAlive(task) === 0 ? copy.today : `${getDaysAlive(task)} ${copy.dayShort}`}
        </div>
      )}

      <div className="heat-slider-container">
        <div className="heat-label">{copy.pulse}</div>
        <div className="heat-track">
          <div
            className="heat-fill"
            style={{ width: `${task.heatCurrent}%`, backgroundColor: heatColor }}
          />
        </div>
        <div className="heat-value">{Math.floor(task.heatCurrent)}%</div>
      </div>

      <div className="task-meta-controls">
        <label className="task-meta-field">
          <span className="task-meta-label">{copy.urgency}</span>
          <select
            value={task.urgency || "medium"}
            className="task-meta-select"
            onChange={(event) => onSetUrgency(task.id, event.target.value)}
          >
            <option value="low">{copy.urgencyOptionLow}</option>
            <option value="medium">{copy.urgencyOptionMedium}</option>
            <option value="high">{copy.urgencyOptionHigh}</option>
          </select>
        </label>
        <label className="task-meta-field">
          <span className="task-meta-label">{copy.resistance}</span>
          <select
            value={task.resistance || "medium"}
            className="task-meta-select"
            onChange={(event) => onSetResistance(task.id, event.target.value)}
          >
            <option value="low">{copy.resistanceOptionLow}</option>
            <option value="medium">{copy.resistanceOptionMedium}</option>
            <option value="high">{copy.resistanceOptionHigh}</option>
          </select>
        </label>
        <label className="task-meta-field task-meta-field-wide">
          <span className="task-meta-label">{copy.deadline}</span>
          <input
            type="date"
            value={task.deadlineAt || ""}
            className="task-meta-select"
            onChange={(event) => onSetDeadline(task.id, event.target.value)}
          />
        </label>
      </div>

      {/* Subtasks block */}
      <div className="subtasks-container">
        {(task.subtasks || []).map(sub => {
          const isEditingThis = editingSubtask && editingSubtask.taskId === task.id && editingSubtask.subId === sub.id;
          return (
          <div key={sub.id} className={`subtask-item${isEditingThis ? ' subtask-item--editing' : ''}`}>
            <input
              type="checkbox"
              checked={sub.completed}
              onChange={() => onToggleSubtask(task.id, sub.id)}
              className="subtask-checkbox"
            />
            {isEditingThis ? (
              <textarea
                autoFocus
                rows={1}
                className="subtask-edit-input"
                value={editingSubtask.text}
                ref={el => {
                  if (el) {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }
                }}
                onChange={e => {
                  setEditingSubtask({ ...editingSubtask, text: e.target.value });
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onBlur={() => {
                  if (onEditSubtask) onEditSubtask(task.id, sub.id, editingSubtask.text);
                  setEditingSubtask(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (onEditSubtask) onEditSubtask(task.id, sub.id, editingSubtask.text);
                    setEditingSubtask(null);
                  } else if (e.key === 'Escape') {
                    setEditingSubtask(null);
                  }
                }}
              />
            ) : (
              <span
                style={{ textDecoration: sub.completed ? 'line-through' : 'none', opacity: sub.completed ? 0.5 : 1, flex: 1 }}
                onDoubleClick={() => setEditingSubtask({ taskId: task.id, subId: sub.id, text: sub.text })}
                title={copy.editTitle}
              >
                {sub.text}
              </span>
            )}
            {onDeleteSubtask && (
              <button
                className="subtask-delete-btn"
                onClick={() => onDeleteSubtask(task.id, sub.id)}
                title={copy.deleteStep}
              >×</button>
            )}
          </div>
          );
        })}
        
        <div className="subtask-add-row">
          <input 
            type="text" 
            placeholder={copy.stepPlaceholder}
            className="subtask-input" 
            value={newSubtaskText[task.id] || ""}
            onChange={(e) => setNewSubtaskText({...newSubtaskText, [task.id]: e.target.value})}
            onKeyDown={(e) => e.key === 'Enter' && addSubtask(task.id)}
          />
          <button className="subtask-add-btn" onClick={() => addSubtask(task.id)}>+</button>
        </div>
      </div>

      <div className="timer-row">
        {(() => {
          const isRunning = activeTimerTaskId === task.id;
          const elapsed = isRunning && timerStartRef.current
            ? Date.now() - timerStartRef.current
            : 0;
          const totalMs = (task.timeSpent || 0) + elapsed;
          return (
            <>
              <button
                className={`timer-btn ${isRunning ? 'timer-running' : ''}`}
                onClick={() => {
                  if (isRunning) {
                    const spent = Date.now() - timerStartRef.current;
                    if (onAddTime) onAddTime(task.id, spent);
                    timerStartRef.current = null;
                    setActiveTimerTaskId(null);
                  } else {
                    timerStartRef.current = Date.now();
                    setActiveTimerTaskId(task.id);
                  }
                }}
                title={isRunning ? copy.stopTimerTitle : copy.startTimerTitle}
              >
                {isRunning ? copy.stopTimer : copy.startTimer}
              </button>
              {totalMs > 0 && (
                <span className="timer-total">
                  ⏱ {formatMs(totalMs, language)}
                </span>
              )}
            </>
          );
        })()}
      </div>

      {notYourMove ? (
        <div className="task-not-your-move-actions">
          <button
            className="action-btn not-your-move-clear-btn"
            onClick={() => onClearNotYourMove && onClearNotYourMove(task.id)}
            type="button"
          >
            {copy.clearNotYourMove}
          </button>
        </div>
      ) : (
        <div className="task-actions">
          {(!isTuneOpen || task.heatCurrent <= 60) && (
            <button className="action-btn touch" onClick={() => onTouch(task.id)} type="button">{copy.touch}</button>
          )}
          <button className="action-btn complete" onClick={() => setConfirmTaskId(task.id)} type="button">{copy.complete}</button>
          {isTuneOpen && calendarConnected && (
            <button
              className="action-btn cal-btn"
              onClick={() => {
                setCalError("");
                setCalPickerTaskId(calPickerTaskId === task.id ? null : task.id);
              }}
              title={copy.scheduleCalendar}
            >📅</button>
          )}
          {isTuneOpen && (
            <button className="action-btn task-cemetery-btn" onClick={() => onKill(task.id)}>
              {copy.cemetery}
            </button>
          )}
        </div>
      )}

      {calPickerTaskId === task.id && calendarConnected && (
        <div className="cal-picker">
          <input type="date" value={calDate} onChange={e => setCalDate(e.target.value)} className="cal-input" />
          <input type="time" value={calTime} onChange={e => setCalTime(e.target.value)} className="cal-input" />
          <select value={calDuration} onChange={e => setCalDuration(Number(e.target.value))} className="cal-input">
            <option value={30}>{isEnglish ? "30 min" : "30 мин"}</option>
            <option value={60}>{isEnglish ? "1 hour" : "1 час"}</option>
            <option value={90}>{isEnglish ? "1.5 h" : "1.5 ч"}</option>
            <option value={120}>{isEnglish ? "2 hours" : "2 часа"}</option>
          </select>
          <button
            className="cal-save-btn"
            onClick={() => scheduleToCalendar(task)}
            disabled={calSaving || !calDate}
          >{calSaving ? "..." : copy.addCalendar}</button>
          {calError && <div className="cal-error">{calError}</div>}
        </div>
      )}
    </div>
      );
    })()
  );

  return (
    <div className="active-zones-wrapper">
      <div className="new-task-container" style={{marginBottom: '30px', background: 'rgba(255,255,255,0.05)'}}>
        <input
          type="text"
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
          placeholder={copy.newTaskPlaceholder}
          className="new-task-input"
          style={{fontSize: '1.1rem'}}
        />
        <button onClick={addTask} className="add-task-btn">
          {copy.addTask}
        </button>
      </div>

      <div className="zones-grid">
        <DroppableZone id="zone-hot" className="zone-column focus-zone">
          <h3 className="zone-title">🔥 {copy.focus} ({hotTasks.length})</h3>
          <div className="tasks-list">
            {hotTasks.map(t => <DraggableTask key={t.id} id={`task-${t.id}`} dragTitle={copy.drag}>{renderTaskCard(t, false, "#10b981")}</DraggableTask>)}
            {hotTasks.length === 0 && <div className="empty-zone">{copy.emptyFocus}</div>}
          </div>
        </DroppableZone>

        <DroppableZone id="zone-passive" className="zone-column passive-zone">
          <h3 className="zone-title">🧊 {copy.background} ({passiveTasks.length})</h3>
          <div className="tasks-list">
            {passiveTasks.map(t => <DraggableTask key={t.id} id={`task-${t.id}`} dragTitle={copy.drag}>{renderTaskCard(t, false, "#3b82f6")}</DraggableTask>)}
            {passiveTasks.length === 0 && <div className="empty-zone">{copy.emptyBackground}</div>}
          </div>
        </DroppableZone>

        <DroppableZone id="zone-purgatory" className="zone-column purgatory-zone">
          <h3 className="zone-title" style={{color: '#f59e0b'}}>🥶 {copy.purgatory} ({purgatoryTasks.length})</h3>
          <div className="tasks-list">
            {purgatoryTasks.map(t => <DraggableTask key={t.id} id={`task-${t.id}`} dragTitle={copy.drag}>{renderTaskCard(t, true, "#ef4444")}</DraggableTask>)}
            {purgatoryTasks.length === 0 && <div className="empty-zone">{copy.emptyPurgatory}</div>}
          </div>
        </DroppableZone>
      </div>

      {confirmTaskId && (
        <div className="modal-overlay" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="modal-content glass-panel animated-fade-in" style={{padding: '40px', textAlign: 'center', maxWidth: '400px', width: '90%', border: '2px solid var(--accent-heaven)', borderRadius: '16px'}}>
            <h2 style={{fontFamily: "'GuildensternNbp', 'VT323', monospace", marginBottom: '15px', fontSize: '2.5rem', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '2px'}}>{copy.confirmTitle}</h2>
            <p style={{marginBottom: '35px', color: 'var(--text-muted)', fontSize: '1.2rem'}}>{copy.confirmBody}</p>
            <div style={{display: 'flex', gap: '20px', justifyContent: 'center'}}>
              <button 
                onClick={() => {
                  onComplete(confirmTaskId);
                  setConfirmTaskId(null);
                }} 
                className="action-btn complete"
                style={{fontSize: '1.2rem', padding: '12px 24px'}}
              >
                {copy.confirmYes}
              </button>
              <button 
                onClick={() => setConfirmTaskId(null)} 
                className="action-btn kill-btn" 
                style={{background: 'transparent', border: '2px solid var(--accent-cemetery)', color: 'var(--accent-cemetery)', fontSize: '1.2rem', padding: '12px 24px'}}
              >
                {copy.confirmNo}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
