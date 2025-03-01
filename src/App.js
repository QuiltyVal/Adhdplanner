// src/App.js
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { DndContext } from "@dnd-kit/core";
import TaskColumn from "./TaskColumn";
import LogoutButton from "./LogoutButton"; // Импортируем кнопку выхода
import "./App.css";
import { addUserIfNotExists, getUserTasks, updateUserTasks } from "./firestoreUtils";

// Функция для получения данных пользователя из строки запроса
function getTelegramUserFromSearch(search) {
  const params = new URLSearchParams(search);
  if (params.get("id")) {
    return {
      id: params.get("id"),
      first_name: params.get("first_name"),
      last_name: params.get("last_name"),
      username: params.get("username"),
      photo_url: params.get("photo_url"),
      auth_date: params.get("auth_date"),
      hash: params.get("hash"),
    };
  }
  return null;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Сначала пробуем прочитать данные из localStorage
    const storedUser = localStorage.getItem("telegramUser");
    if (storedUser) {
      console.log("User from localStorage:", storedUser);
      setUser(JSON.parse(storedUser));
      return;
    }
    // Если нет в localStorage, пробуем прочитать из URL
    const urlUser = getTelegramUserFromSearch(location.search);
    if (urlUser) {
      console.log("User from URL:", urlUser);
      localStorage.setItem("telegramUser", JSON.stringify(urlUser));
      setUser(urlUser);
      // Не очищаем URL для отладки
      return;
    }
    console.log("No user found, redirecting to /login");
    navigate("/login");
  }, [location.search, navigate]);

  useEffect(() => {
    async function init() {
      if (user) {
        console.log("Initializing user with id:", user.id);
        await addUserIfNotExists(user.id, user.first_name);
        const userTasks = await getUserTasks(user.id);
        setTasks(userTasks);
        setLoading(false);
      }
    }
    init();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const updatedTasks = tasks.map((task) => {
        if (task.columnId === "active" && now - task.lastUpdated > 5 * 24 * 60 * 60 * 1000) {
          return { ...task, columnId: "passive", lastUpdated: now };
        }
        if (task.columnId === "passive" && now - task.lastUpdated > 5 * 24 * 60 * 60 * 1000) {
          return { ...task, columnId: "purgatory", lastUpdated: now };
        }
        return task;
      });
      if (JSON.stringify(updatedTasks) !== JSON.stringify(tasks)) {
        setTasks(updatedTasks);
        updateUserTasks(user.id, updatedTasks);
      }
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [tasks, user]);

  const handleAddTask = async (columnId, newTask) => {
    const updatedTasks = [...tasks, { ...newTask, columnId }];
    setTasks(updatedTasks);
    await updateUserTasks(user.id, updatedTasks);
  };

  const handleTaskEdit = (taskId, newText) => {
    const updatedTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, text: newText, lastUpdated: Date.now() } : task
    );
    setTasks(updatedTasks);
    updateUserTasks(user.id, updatedTasks);
  };

  const handleHeatChange = (taskId, newHeat) => {
    const updatedTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, heat: newHeat, lastUpdated: Date.now() } : task
    );
    setTasks(updatedTasks);
    updateUserTasks(user.id, updatedTasks);
  };

  if (loading) return <div>Загрузка... Подождите!</div>;

  const activeTasks = tasks.filter((task) => task.columnId === "active");
  const passiveTasks = tasks.filter((task) => task.columnId === "passive");
  const purgatoryTasks = tasks.filter((task) => task.columnId === "purgatory");

  return (
    <DndContext onDragEnd={() => {}}>
      <div
        style={{
          padding: "20px",
          fontFamily: "Arial, sans-serif",
          backgroundColor: "#222",
          color: "#eee",
          minHeight: "100vh",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Task Planner для ADHD</h1>
          {/* Кнопка выхода */}
          <LogoutButton />
        </div>
        <p>Привет, {user?.first_name || "Гость"}!</p>
        <div className="container">
          <div className="active-passive-container">
            <div className="column">
              <TaskColumn
                columnId="active"
                title="Active Projects"
                tasks={activeTasks}
                onEdit={handleTaskEdit}
                onHeatChange={handleHeatChange}
                onAddTask={(newTask) => handleAddTask("active", newTask)}
              />
            </div>
            <div className="column">
              <TaskColumn
                columnId="passive"
                title="Passive Projects"
                tasks={passiveTasks}
                onEdit={handleTaskEdit}
                onHeatChange={handleHeatChange}
                onAddTask={(newTask) => handleAddTask("passive", newTask)}
              />
            </div>
          </div>
          <div className="column full-width">
            <TaskColumn
              columnId="purgatory"
              title="Purgatory"
              tasks={purgatoryTasks}
              onEdit={handleTaskEdit}
              onHeatChange={handleHeatChange}
            />
          </div>
        </div>
      </div>
    </DndContext>
  );
}
