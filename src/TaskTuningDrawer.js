import React, { useEffect, useState } from "react";

const URGENCY_OPTIONS = {
  ru: [
    { value: "low", label: "Спокойно" },
    { value: "medium", label: "Нормально" },
    { value: "high", label: "Срочно" },
  ],
  en: [
    { value: "low", label: "Calm" },
    { value: "medium", label: "Normal" },
    { value: "high", label: "Urgent" },
  ],
};

const RESISTANCE_OPTIONS = {
  ru: [
    { value: "low", label: "Легко" },
    { value: "medium", label: "Средне" },
    { value: "high", label: "Страшно" },
  ],
  en: [
    { value: "low", label: "Easy" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "Scary" },
  ],
};

function TaskTuningDrawer({
  task,
  open,
  onClose,
  onToggleToday,
  onToggleVital,
  onSetUrgency,
  onSetResistance,
  onSetDeadline,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onKill,
  language = "ru",
}) {
  const [draftStep, setDraftStep] = useState("");
  const isEnglish = language === "en";
  const copy = {
    aria: isEnglish ? "Task settings" : "Настройка задачи",
    kicker: isEnglish ? "task settings" : "настройка задачи",
    priority: isEnglish ? "Priority" : "Приоритет",
    vitalOn: isEnglish ? "🚨 Critical" : "🚨 Критично",
    vitalOff: isEnglish ? "○ Normal" : "○ Обычно",
    todayOn: isEnglish ? "📌 Today" : "📌 Сегодня",
    todayOff: isEnglish ? "☆ Not pinned" : "☆ Не закреплено",
    urgency: isEnglish ? "Urgency" : "Срочность",
    resistance: isEnglish ? "Resistance" : "Сопротивление",
    deadline: isEnglish ? "Deadline" : "Дедлайн",
    steps: isEnglish ? "Steps" : "Подшаги",
    noSteps: isEnglish ? "No steps yet." : "Пока без шагов.",
    addStep: isEnglish ? "Add a tiny step" : "Добавить маленький шаг",
    danger: isEnglish ? "Danger zone" : "Опасная зона",
    cemetery: isEnglish ? "✖️ To Cemetery" : "✖️ На кладбище",
  };

  useEffect(() => {
    if (open) setDraftStep("");
  }, [open, task?.id]);

  if (!open || !task) return null;

  const handleAddStep = () => {
    const text = draftStep.trim();
    if (!text) return;
    onAddSubtask(task.id, text);
    setDraftStep("");
  };

  return (
    <div className="task-tuning-backdrop" onClick={onClose}>
      <aside
        className="task-tuning-drawer glass-panel animated-fade-in"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={copy.aria}
      >
        <div className="task-tuning-header">
          <div>
            <div className="task-tuning-kicker">{copy.kicker}</div>
            <h2 className="task-tuning-title">{task.text}</h2>
          </div>
          <button className="task-tuning-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="task-tuning-section">
          <div className="task-tuning-section-title">{copy.priority}</div>
          <div className="task-tuning-toggle-row">
            <button
              type="button"
              className={`task-tuning-chip ${task.isVital ? "is-active" : ""}`}
              onClick={() => onToggleVital(task.id)}
            >
              {task.isVital ? copy.vitalOn : copy.vitalOff}
            </button>
            <button
              type="button"
              className={`task-tuning-chip ${task.isToday ? "is-active" : ""}`}
              onClick={() => onToggleToday(task.id)}
            >
              {task.isToday ? copy.todayOn : copy.todayOff}
            </button>
          </div>
        </div>

        <div className="task-tuning-section task-tuning-grid">
          <label className="task-tuning-field">
            <span>{copy.urgency}</span>
            <select
              value={task.urgency || "medium"}
              onChange={(event) => onSetUrgency(task.id, event.target.value)}
            >
              {URGENCY_OPTIONS[isEnglish ? "en" : "ru"].map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="task-tuning-field">
            <span>{copy.resistance}</span>
            <select
              value={task.resistance || "medium"}
              onChange={(event) => onSetResistance(task.id, event.target.value)}
            >
              {RESISTANCE_OPTIONS[isEnglish ? "en" : "ru"].map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="task-tuning-field task-tuning-field-full">
            <span>{copy.deadline}</span>
            <input
              type="date"
              value={task.deadlineAt || ""}
              onChange={(event) => onSetDeadline(task.id, event.target.value)}
            />
          </label>
        </div>

        <div className="task-tuning-section">
          <div className="task-tuning-section-title">{copy.steps}</div>
          <div className="task-tuning-subtasks">
            {(task.subtasks || []).map((subtask) => (
              <div key={subtask.id} className="task-tuning-subtask-row">
                <label className="task-tuning-subtask-label">
                  <input
                    type="checkbox"
                    checked={Boolean(subtask.completed)}
                    onChange={() => onToggleSubtask(task.id, subtask.id)}
                  />
                  <span className={subtask.completed ? "is-done" : ""}>{subtask.text}</span>
                </label>
                <button
                  type="button"
                  className="task-tuning-subtask-delete"
                  onClick={() => onDeleteSubtask(task.id, subtask.id)}
                >
                  ✕
                </button>
              </div>
            ))}
            {!task.subtasks?.length && (
              <div className="task-tuning-empty">{copy.noSteps}</div>
            )}
          </div>
          <div className="task-tuning-add-row">
            <input
              type="text"
              value={draftStep}
              onChange={(event) => setDraftStep(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleAddStep()}
              placeholder={copy.addStep}
            />
            <button type="button" onClick={handleAddStep}>＋</button>
          </div>
        </div>

        <div className="task-tuning-section task-tuning-danger">
          <div className="task-tuning-section-title">{copy.danger}</div>
          <button
            type="button"
            className="task-tuning-cemetery"
            onClick={() => onKill(task.id)}
          >
            {copy.cemetery}
          </button>
        </div>
      </aside>
    </div>
  );
}

export default TaskTuningDrawer;
