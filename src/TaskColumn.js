// src/TaskColumn.js
import React, { useState } from "react";
import "./TaskColumn.css";

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

function getDeadlineBadge(deadlineAt) {
  if (!deadlineAt) return null;

  const [year, month, day] = deadlineAt.split("-").map(Number);
  const deadline = new Date(year, month - 1, day);
  if (Number.isNaN(deadline.getTime())) return null;

  const deadlineDayNumber = getDayNumberFromIsoDate(deadlineAt);
  const todayDayNumber = getDayNumberFromIsoDate(getTodayIsoDate());
  if (deadlineDayNumber === null || todayDayNumber === null) return null;
  const daysLeft = deadlineDayNumber - todayDayNumber;
  const shortDate = deadline.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });

  if (daysLeft < 0) {
    return { tone: "overdue", label: `Просрочено · ${shortDate}` };
  }

  if (daysLeft === 0) {
    return { tone: "today", label: `Сегодня · ${shortDate}` };
  }

  if (daysLeft === 1) {
    return { tone: "soon", label: `Завтра · ${shortDate}` };
  }

  if (daysLeft <= 7) {
    return { tone: "watch", label: `${daysLeft} дн. · ${shortDate}` };
  }

  return { tone: "calm", label: `До ${shortDate}` };
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
  onAddSubtask,
  onDeleteSubtask,
  onEditSubtask,
  onToggleSubtask,
  onToggleToday,
  onToggleVital,
  onSetUrgency,
  onSetResistance,
  onSetDeadline,
  highlightTaskId,
  calendarToken,
}) {
  const [newTaskText, setNewTaskText] = useState("");
  const [newSubtaskText, setNewSubtaskText] = useState({}); // {taskId: text}
  const [confirmTaskId, setConfirmTaskId] = useState(null);
  const [editingSubtask, setEditingSubtask] = useState(null); // { taskId, subId, text }
  const [editingTaskId, setEditingTaskId] = useState(null);   // taskId being edited
  const [editingTaskText, setEditingTaskText] = useState("");
  const [calPickerTaskId, setCalPickerTaskId] = useState(null);
  const [calDate, setCalDate] = useState("");
  const [calTime, setCalTime] = useState("10:00");
  const [calDuration, setCalDuration] = useState(60);
  const [calSaving, setCalSaving] = useState(false);

  const scheduleToCalendar = async (task) => {
    if (!calendarToken || !calDate) return;
    setCalSaving(true);
    try {
      const start = new Date(`${calDate}T${calTime}:00`);
      const end = new Date(start.getTime() + calDuration * 60000);
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${calendarToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: task.text,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Calendar ${response.status}: ${errorText}`);
      }

      setCalPickerTaskId(null);
    } catch (e) {
      console.error("Calendar error:", e);
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
    // ... heaven render ...
    return (
      <div className="task-column-container">
        <div className="tasks-grid">
          {tasks.map(task => (
            <div key={task.id} className="heaven-cloud animated-fade-in">
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
                  ↩️ Вернуть в активные
                </button>
              )}
            </div>
          ))}
          {tasks.length === 0 && <p style={{color: '#3aedff', textAlign: 'center', width: '100%', fontFamily: "'GuildensternNbp', 'VT323', monospace", fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.6}}>Рай пуст. Завершите задачу!</p>}
        </div>
      </div>
    );
  }

  if (type === "cemetery") {
    // ... cemetery render ...
    return (
      <div className="task-column-container">
        <div className="tasks-grid">
          {tasks.map(task => (
            <div key={task.id} className="tombstone animated-fade-in">
              <div className="tombstone-rip">R.I.P.</div>
              <div className="tombstone-task-name">{task.text}</div>
              <div style={{color: '#ef4444', fontSize: '0.85rem', marginBottom: '10px'}}>-5 points</div>
              <button className="resurrect-btn" onClick={() => onResurrect(task.id)}>
                🔄 Воскресить
              </button>
            </div>
          ))}
          {tasks.length === 0 && <p style={{color: '#8a1c1c', textAlign: 'center', width: '100%', fontFamily: "'GuildensternNbp', 'VT323', monospace", fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8}}>Кладбище пустует. Так держать!</p>}
        </div>
      </div>
    );
  }

  // Active Zone logic
  const hotTasks = tasks.filter(t => t.heatCurrent > 60);
  const passiveTasks = tasks.filter(t => t.heatCurrent > 25 && t.heatCurrent <= 60);
  const purgatoryTasks = tasks.filter(t => t.heatCurrent <= 25);

  const renderTaskCard = (task, isPurgatory, heatColor) => (
    (() => {
      const deadlineBadge = getDeadlineBadge(task.deadlineAt);
      return (
    <div
      key={task.id}
      data-task-id={task.id}
      className={`task-card animated-fade-in ${isPurgatory ? 'purgatory' : ''} ${task.id === highlightTaskId ? 'priority-target' : ''} ${deadlineBadge ? `deadline-${deadlineBadge.tone}` : ''} ${task.isVital ? 'is-vital' : ''}`}
    >
      <button
        className="kill-btn"
        onClick={() => onKill(task.id)}
        title="Убрать на кладбище"
      >
        ✖️
      </button>
      {task.id === highlightTaskId && (
        <div className="priority-badge">Цель дня</div>
      )}
      <div className="task-top-controls">
        <button
          className={`vital-toggle-btn ${task.isVital ? 'is-active' : ''}`}
          onClick={() => onToggleVital(task.id)}
          title="Жизненно важный приоритет"
          type="button"
        >
          <span className="vital-toggle-track" aria-hidden="true">
            <span className="vital-toggle-thumb" />
          </span>
          <span className="vital-toggle-copy">
            {task.isVital ? 'Критично' : 'Обычно'}
          </span>
        </button>
        <button
          className={`today-toggle-btn ${task.isToday ? 'is-active' : ''}`}
          onClick={() => onToggleToday(task.id)}
          type="button"
        >
          {task.isToday ? '📌 Закреплено' : '☆ Закрепить'}
        </button>
      </div>
      {deadlineBadge && (
        <div className={`deadline-badge ${deadlineBadge.tone}`}>{deadlineBadge.label}</div>
      )}
      <div className="task-text" style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '5px', paddingRight: '30px', color: '#e0e0e0', fontFamily: "'Inter', sans-serif", lineHeight: '1.4' }}>
        {task.isVital ? '🚨 ' : isPurgatory ? '🥶 ' : (task.heatCurrent > 60 ? '🔥 ' : '🧊 ')}
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
            title="Двойной клик — редактировать"
            style={{ cursor: 'text' }}
          >{task.text}</span>
        )}
      </div>
      
      <div className="heat-slider-container">
        <div className="heat-label">Пульс</div>
        <div style={{
          width: '100%', height: '6px', background: '#2a2a35', borderRadius: '4px', position: 'relative', overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: `${task.heatCurrent}%`, backgroundColor: heatColor, transition: 'width 1s linear, background-color 1s ease'
          }}></div>
        </div>
        <div style={{minWidth: '40px', textAlign: 'right'}}>{Math.floor(task.heatCurrent)}%</div>
      </div>

      <div className="task-meta-controls">
        <label className="task-meta-field">
          <span className="task-meta-label">Срочность</span>
          <select
            value={task.urgency || "medium"}
            className="task-meta-select"
            onChange={(event) => onSetUrgency(task.id, event.target.value)}
          >
            <option value="low">Можно позже</option>
            <option value="medium">Нормально</option>
            <option value="high">Срочно</option>
          </select>
        </label>
        <label className="task-meta-field">
          <span className="task-meta-label">Сопротивление</span>
          <select
            value={task.resistance || "medium"}
            className="task-meta-select"
            onChange={(event) => onSetResistance(task.id, event.target.value)}
          >
            <option value="low">Легко</option>
            <option value="medium">Средне</option>
            <option value="high">Страшно</option>
          </select>
        </label>
        <label className="task-meta-field task-meta-field-wide">
          <span className="task-meta-label">Дедлайн</span>
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
        {(task.subtasks || []).map(sub => (
          <div key={sub.id} className="subtask-item">
            <input
              type="checkbox"
              checked={sub.completed}
              onChange={() => onToggleSubtask(task.id, sub.id)}
              className="subtask-checkbox"
            />
            {editingSubtask && editingSubtask.taskId === task.id && editingSubtask.subId === sub.id ? (
              <input
                autoFocus
                className="subtask-edit-input"
                value={editingSubtask.text}
                onChange={e => setEditingSubtask({ ...editingSubtask, text: e.target.value })}
                onBlur={() => {
                  if (onEditSubtask) onEditSubtask(task.id, sub.id, editingSubtask.text);
                  setEditingSubtask(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
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
                title="Двойной клик — редактировать"
              >
                {sub.text}
              </span>
            )}
            {onDeleteSubtask && (
              <button
                className="subtask-delete-btn"
                onClick={() => onDeleteSubtask(task.id, sub.id)}
                title="Удалить шаг"
              >×</button>
            )}
          </div>
        ))}
        
        <div className="subtask-add-row">
          <input 
            type="text" 
            placeholder="+ Шаг" 
            className="subtask-input" 
            value={newSubtaskText[task.id] || ""}
            onChange={(e) => setNewSubtaskText({...newSubtaskText, [task.id]: e.target.value})}
            onKeyDown={(e) => e.key === 'Enter' && addSubtask(task.id)}
          />
          <button className="subtask-add-btn" onClick={() => addSubtask(task.id)}>+</button>
        </div>
      </div>

      <div className="task-actions">
        {task.heatCurrent <= 60 && (
          <button className="action-btn touch" onClick={() => onTouch(task.id)}>👀 Вспомнил</button>
        )}
        {task.heatCurrent > 60 && (
          <button className="action-btn complete" onClick={() => setConfirmTaskId(task.id)}>🚀 Завершить!</button>
        )}
        {calendarToken && (
          <button
            className="action-btn cal-btn"
            onClick={() => setCalPickerTaskId(calPickerTaskId === task.id ? null : task.id)}
            title="Запланировать в Google Calendar"
          >📅</button>
        )}
      </div>

      {calPickerTaskId === task.id && calendarToken && (
        <div className="cal-picker">
          <input type="date" value={calDate} onChange={e => setCalDate(e.target.value)} className="cal-input" />
          <input type="time" value={calTime} onChange={e => setCalTime(e.target.value)} className="cal-input" />
          <select value={calDuration} onChange={e => setCalDuration(Number(e.target.value))} className="cal-input">
            <option value={30}>30 мин</option>
            <option value={60}>1 час</option>
            <option value={90}>1.5 ч</option>
            <option value={120}>2 часа</option>
          </select>
          <button
            className="cal-save-btn"
            onClick={() => scheduleToCalendar(task)}
            disabled={calSaving || !calDate}
          >{calSaving ? "..." : "Добавить"}</button>
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
          placeholder="+ Какую глобальную задачу берем на прицел?"
          className="new-task-input"
          style={{fontSize: '1.1rem'}}
        />
        <button onClick={addTask} className="add-task-btn">
          Добавить (пульс 35)
        </button>
      </div>

      <div className="zones-grid">
        <div className="zone-column focus-zone">
          <h3 className="zone-title">🔥 В ФОКУСЕ (&gt;60%)</h3>
          <div className="tasks-list">
            {hotTasks.map(t => renderTaskCard(t, false, "#10b981"))}
            {hotTasks.length === 0 && <div className="empty-zone">Нет пламенных задач</div>}
          </div>
        </div>

        <div className="zone-column passive-zone">
          <h3 className="zone-title">🧊 НА ФОНЕ (25-60%)</h3>
          <div className="tasks-list">
            {passiveTasks.map(t => renderTaskCard(t, false, "#3b82f6"))}
            {passiveTasks.length === 0 && <div className="empty-zone">Все либо горит, либо замерзает</div>}
          </div>
        </div>

        <div className="zone-column purgatory-zone">
          <h3 className="zone-title" style={{color: '#f59e0b'}}>🥶 ЧИСТИЛИЩЕ (&lt;25%)</h3>
          <div className="tasks-list">
            {purgatoryTasks.map(t => renderTaskCard(t, true, "#ef4444"))}
            {purgatoryTasks.length === 0 && <div className="empty-zone">Никто не замерзает</div>}
          </div>
        </div>
      </div>

      {confirmTaskId && (
        <div className="modal-overlay" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="modal-content glass-panel animated-fade-in" style={{padding: '40px', textAlign: 'center', maxWidth: '400px', width: '90%', border: '2px solid var(--accent-heaven)', borderRadius: '16px'}}>
            <h2 style={{fontFamily: "'GuildensternNbp', 'VT323', monospace", marginBottom: '15px', fontSize: '2.5rem', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '2px'}}>Точно всё?</h2>
            <p style={{marginBottom: '35px', color: 'var(--text-muted)', fontSize: '1.2rem'}}>Эта задача отправится в Рай. Уверены?</p>
            <div style={{display: 'flex', gap: '20px', justifyContent: 'center'}}>
              <button 
                onClick={() => {
                  onComplete(confirmTaskId);
                  setConfirmTaskId(null);
                }} 
                className="action-btn complete"
                style={{fontSize: '1.2rem', padding: '12px 24px'}}
              >
                ДА!
              </button>
              <button 
                onClick={() => setConfirmTaskId(null)} 
                className="action-btn kill-btn" 
                style={{background: 'transparent', border: '2px solid var(--accent-cemetery)', color: 'var(--accent-cemetery)', fontSize: '1.2rem', padding: '12px 24px'}}
              >
                ЕЩЕ НЕТ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
