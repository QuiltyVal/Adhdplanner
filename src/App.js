import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Для редиректа
import { DndContext } from "@dnd-kit/core";
import TaskColumn from "./TaskColumn";
import "./App.css";
import { addUserIfNotExists, getUserTasks, updateUserTasks } from "./firestoreUtils";

// Функция для получения данных пользователя из URL-параметров
function getTelegramUserFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("id")) {
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
  console.log("✅ App.js is running!"); // Проверяем, загружается ли App.js
  
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]); // Массив задач
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // Хук для редиректа

  // Проверка на данные Telegram и редирект на логин при отсутствии
  useEffect(() => {
    console.log("🔍 Checking Telegram user...");
    const telegramUser = getTelegramUserFromUrl();
    if (telegramUser) {
      console.log("✅ Telegram user found:", telegramUser);
      setUser(telegramUser);
      window.history.replaceState({}, document.title, "/"); // Убираем параметры из URL
    } else {
      console.log("❌ No Telegram user, redirecting to /login...");
      navigate("/login"); // Перенаправляем на логин, если данных нет
    }
  }, [navigate]);

  // Инициализация пользователя и загрузка задач
  useEffect(() => {
    async function init() {
      if (user) {
        console.log("🔄 Loading tasks for user:", user.id);
        await addUserIfNotExists(user.id, user.first_name);
        const userTasks = await getUserTasks(user.id);
        setTasks(userTasks);
        setLoading(false);
      }
    }
    init();
  }, [user]);

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
        <h1 style={{ textAlign: "center" }}>Task Planner для ADHD</h1>
        <p>Привет, {user?.first_name || "Гость"}!</p>
        <div className="container">
          <div className="active-passive-container">
            <div className="column">
              <TaskColumn
                columnId="active"
                title="Active Projects"
                tasks={activeTasks}
              />
            </div>
            <div className="column">
              <TaskColumn
                columnId="passive"
                title="Passive Projects"
                tasks={passiveTasks}
              />
            </div>
          </div>
          <div className="column full-width">
            <TaskColumn columnId="purgatory" title="Purgatory" tasks={purgatoryTasks} />
          </div>
        </div>
      </div>
    </DndContext>
  );
}
