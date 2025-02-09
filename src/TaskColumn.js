// TaskColumn.js
import React, { useState } from "react";
import { useDroppable } from "@dnd-kit/core";

function Droppable({ id, children }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const style = {
    backgroundColor: isOver ? "#555" : "#444",
    border: "2px dashed #777",
    borderRadius: "8px",
    padding: "10px",
    margin: "10px",
    minWidth: "250px",
    minHeight: "300px"
  };
  return <div ref={setNodeRef} style={style}>{children}</div>;
}

export default function TaskColumn({ columnId, title, tasks, onEdit, onHeatChange, onAddTask }) {
  const [newTaskText, setNewTaskText] = useState("");

  const addTask = () => {
    if (!newTaskText.trim()) return;
    const newTask = {
      id: Date.now().toString(), // уникальный id
      text: newTaskText.trim(),
      lastUpdated: Date.now(),
      heat: 1 // базовый уровень
    };
    onAddTask(newTask);
    setNewTaskText("");
  };

  return (
    <Droppable id={columnId}>
      <h2 style={{ textAlign: "center" }}>{title}</h2>
      <div>
        {tasks.map((task) => (
          <div key={task.id} style={{ marginBottom: "10px" }}>
            <input
              type="text"
              value={task.text}
              onChange={(e) => onEdit(columnId, task.id, e.target.value)}
              style={{ padding: "5px", border: "1px solid #ccc", borderRadius: "4px" }}
            />
            <br />
            <label>Горячесть: {task.heat}</label>
            <input
              type="range"
              min="1"
              max="10"
              value={task.heat}
              onChange={(e) => onHeatChange(columnId, task.id, parseInt(e.target.value))}
            />
          </div>
        ))}
      </div>
      {columnId !== "purgatory" && (
        <div style={{ display: "flex", marginTop: "10px" }}>
          <input
            type="text"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            placeholder="Новая задача"
            style={{ flex: 1, padding: "5px", border: "1px solid #ccc", borderRadius: "4px" }}
          />
          <button
            onClick={addTask}
            style={{ marginLeft: "5px", padding: "5px", border: "none", borderRadius: "4px", backgroundColor: "#5cb85c", color: "white" }}
          >
            Добавить
          </button>
        </div>
      )}
    </Droppable>
  );
}
