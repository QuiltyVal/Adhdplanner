// src/App.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Для редиректа
import { DndContext } from "@dnd-kit/core";
import TaskColumn from "./TaskColumn";
import "./App.css";
import { addUserIfNotExists, getUserTasks, updateUserTasks } from "./firestoreUtils";

// Функция для получения данных из URL (если вдруг они там ещё есть)
function getTelegramUserFromUrl() {
  const params = new URLSearchParams(window.location.search);
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
  const [tasks, setTasks] = useState([]); // Массив задач
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // При загрузке пытаемся получить данные пользователя:
  useEffect(() => {
    // Сначала пытаемся прочитать из URL (на случай, если пользователь только что авторизовался)
    const telegramUser = getTelegramUserFromUrl();
    if (telegramUser) {
      setUser(telegramUser);
      // Сохраняем данные в localStorage для дальнейших запусков
      localStorage.setItem("telegramUser", JSON.stringify(telegramUser));
      window.history.replaceState({}, document.title, "/"); // очищаем URL от параметров
    } else {
      // Если данных в URL нет, читаем их из localStorage
      const storedUser = localStorage.getItem("telegramUser");
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      } else {
        navigate("/login"); // Если нет данных – переходим на страницу логина
      }
    }
  }, [navigate]);

  // После того, как пользователь установлен, инициализируем задачи
  useEffect(() => {
    async function init() {
      if (user) {
        await addUserIfNotExists(user.id, user.first_name);
        const userTasks = await getUserTasks(user.id);
        setTasks(userTasks);
        setLoading(false);
      }
    }
    init();
  }, [user]);

  if (loading) return <div>Загрузка... Подождите!</div>;

  // Разбиваем задачи по колонкам
  const activeTasks = tasks.filter((task) => task.columnId === "active");
  const passiveTasks = tasks.filter((task) => task.columnId === "passive");
  const purgatoryTasks = tasks.filter((task) => task.columnId === "purgatory");

  // Функции для обработки задач (редактирование, добавление и т.п.) остаются как есть...
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
        <h1 style={{ textAlign: "center" }}>Task Planner для ADHD</h1>
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
