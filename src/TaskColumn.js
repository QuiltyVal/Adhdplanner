// src/TaskColumn.js
import React, { useState } from "react";
import "./TaskColumn.css";

export default function TaskColumn({ 
  type, 
  tasks, 
  onTouch, 
  onComplete, 
  onKill, 
  onResurrect, 
  onAddTask,
  onAddSubtask,
  onToggleSubtask
}) {
  const [newTaskText, setNewTaskText] = useState("");
  const [newSubtaskText, setNewSubtaskText] = useState({}); // {taskId: text}

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
              <div className="points-badge">+10 points</div>
            </div>
          ))}
          {tasks.length === 0 && <p style={{color: 'var(--text-muted)', textAlign: 'center', width: '100%'}}>Рай пуст. Завершите задачу!</p>}
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
          {tasks.length === 0 && <p style={{color: 'var(--text-muted)', textAlign: 'center', width: '100%'}}>Кладбище пустует. Так держать!</p>}
        </div>
      </div>
    );
  }

  // Active Zone logic
  const hotTasks = tasks.filter(t => t.heatCurrent > 60);
  const passiveTasks = tasks.filter(t => t.heatCurrent > 25 && t.heatCurrent <= 60);
  const purgatoryTasks = tasks.filter(t => t.heatCurrent <= 25);

  const renderTaskCard = (task, isPurgatory, heatColor) => (
    <div key={task.id} className={`task-card animated-fade-in ${isPurgatory ? 'purgatory' : ''}`}>
      <button 
        style={{position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', opacity: 0.4, transition: 'opacity 0.2s'}} 
        onMouseOver={(e) => e.target.style.opacity = 1}
        onMouseOut={(e) => e.target.style.opacity = 0.4}
        onClick={() => onKill(task.id)}
        title="Убрать на кладбище"
      >
        ✖️
      </button>
      <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '5px', paddingRight: '25px' }}>
       {isPurgatory ? '🥶 ' : (task.heatCurrent > 60 ? '🔥 ' : '🧊 ')}
       {task.text}
      </div>
      
      <div className="heat-slider-container">
        <div style={{
          width: '100%', height: '6px', background: '#2a2a35', borderRadius: '4px', position: 'relative', overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: `${task.heatCurrent}%`, backgroundColor: heatColor, transition: 'width 1s linear, background-color 1s ease'
          }}></div>
        </div>
        <div style={{minWidth: '40px', textAlign: 'right'}}>{Math.floor(task.heatCurrent)}%</div>
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
            <span style={{textDecoration: sub.completed ? 'line-through' : 'none', opacity: sub.completed ? 0.5 : 1}}>
              {sub.text}
            </span>
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
          <button className="action-btn complete" onClick={() => onComplete(task.id)}>🚀 Завершить!</button>
        )}
      </div>
    </div>
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
          Добавить (Начать с 50%)
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
    </div>
  );
}
