import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; 
import { DndContext } from "@dnd-kit/core";
import TaskColumn from "./TaskColumn";
import "./App.css";
import { addUserIfNotExists, getUserTasks, updateUserTasks } from "./firestoreUtils";

function getTelegramUserFromUrl() {
  console.log("📥 Проверяем URL...");
  console.log("🔍 URL:", window.location.search);

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
    console.log("✅ Данные из URL:", user);
    return user;
  }
  console.log("❌ Нет данных в URL");
  return null;
}

export default function App() {
  console.log("✅ App.js запустился!");

  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]); 
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    console.log("🔍 Проверяем sessionStorage...");
    let savedUser = sessionStorage.getItem("telegramUser");

    if (savedUser) {
      console.log("📦 Найден пользователь в sessionStorage:", JSON.parse(savedUser));
      setUser(JSON.parse(savedUser));
    } else {
      console.log("❌ Нет данных в sessionStorage, проверяем URL...");
      let telegramUser = getTelegramUserFromUrl();

      if (telegramUser) {
        console.log("✅ Найден Telegram пользователь:", telegramUser);
        setUser(telegramUser);

        console.log("💾 Сохраняем в sessionStorage...");
        sessionStorage.setItem("telegramUser", JSON.stringify(telegramUser));

        console.log("🔍 Проверяем сохранение...");
        console.log("📦 sessionStorage после записи:", sessionStorage.getItem("telegramUser"));

        window.history.replaceState({}, document.title, "/"); 
      } else {
        console.log("❌ Нет пользователя, редирект на /login...");
        navigate("/login"); 
      }
    }
  }, [navigate]);

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
