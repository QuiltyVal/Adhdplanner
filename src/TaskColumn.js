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
  const [confirmTaskId, setConfirmTaskId] = useState(null);

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
            </div>
          ))}
          {tasks.length === 0 && <p style={{color: '#3aedff', textAlign: 'center', width: '100%', fontFamily: "'VT323', monospace", fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.6}}>Рай пуст. Завершите задачу!</p>}
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
          {tasks.length === 0 && <p style={{color: '#8a1c1c', textAlign: 'center', width: '100%', fontFamily: "'VT323', monospace", fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8}}>Кладбище пустует. Так держать!</p>}
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
        className="kill-btn"
        onClick={() => onKill(task.id)}
        title="Убрать на кладбище"
      >
        ✖️
      </button>
      <div className="task-text" style={{ fontSize: '1.4rem', marginBottom: '5px', paddingRight: '30px', color: '#e0e0e0', fontFamily: "'VT323', monospace", textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
          <button className="action-btn complete" onClick={() => setConfirmTaskId(task.id)}>🚀 Завершить!</button>
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

      {confirmTaskId && (
        <div className="modal-overlay" style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="modal-content glass-panel animated-fade-in" style={{padding: '40px', textAlign: 'center', maxWidth: '400px', width: '90%', border: '2px solid var(--accent-heaven)', borderRadius: '16px'}}>
            <h2 style={{fontFamily: "'VT323', monospace", marginBottom: '15px', fontSize: '2.5rem', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '2px'}}>Точно всё?</h2>
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
