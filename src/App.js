import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Для редиректа
import { DndContext } from "@dnd-kit/core";
import TaskColumn from "./TaskColumn";
import "./App.css";
import { addUserIfNotExists, getUserTasks, updateUserTasks } from "./firestoreUtils";

// Функция для получения данных пользователя из URL-параметров
function getTelegramUserFromUrl() {
  console.log("📥 getTelegramUserFromUrl() вызвана!");
  console.log("🔍 URL-параметры:", window.location.search);

  const params = new URLSearchParams(window.location.search);
  if (params.has("id")) {
    const user = {
      id: params.get("id"),
      first_name: params.get("first_name"),
      last_name: params.get("last_name"),
      username: params.get("username"),
      photo_url: params.get("photo_url"),
      auth_date: params.get("auth_date"),
      hash: params.get("hash"),
    };
    console.log("✅ Данные Telegram пользователя:", user);
    return user;
  }
  console.log("❌ Данных Telegram нет в URL");
  return null;
}

export default function App() {
  console.log("✅ App.js запущен!"); // Проверяем, загружается ли App.js

  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]); // Массив задач
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // Хук для редиректа

  // Проверяем, есть ли пользовательские данные в URL и localStorage
  useEffect(() => {
    console.log("🔍 Проверяем Telegram пользователя...");

    let telegramUser = getTelegramUserFromUrl();
    
    if (telegramUser) {
      console.log("✅ Найден Telegram пользователь:", telegramUser);
      setUser(telegramUser);

      console.log("💾 Сохраняем в localStorage...");
      localStorage.setItem("telegramUser", JSON.stringify(telegramUser));

      console.log("🔍 Проверяем, сохранилось ли в localStorage...");
      console.log("📦 localStorage:", localStorage.getItem("telegramUser"));

      window.history.replaceState({}, document.title, "/"); // Очищаем URL
    } else {
      console.log("❌ Пользователь не найден, редирект на /login...");
      navigate("/login"); // Перенаправляем на страницу входа
    }
  }, [navigate]);

  // Загружаем задачи пользователя из Firebase
  useEffect(() => {
    async function init() {
      if (user) {
        console.log("🔄 Загружаем задачи для пользователя:", user.id);
        await addUserIfNotExists(user.id, user.first_name);
        const userTasks = await getUserTasks(user.id);
        setTasks(userTasks);
        setLoading(false);
      }
    }
    init();
  }, [user]);

  if (loading) return <div>Загрузка... Подождите!</div>;

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
      </div>
    </DndContext>
  );
}
