// src/Login.js
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    // Создаем скрипт для Telegram Login Widget динамически
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?7";
    script.async = true;
    script.setAttribute("data-telegram-login", "Fegefeuerbot"); // Имя бота без @
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "5");
    // data-auth-url указывает на эту же страницу, чтобы после логина Telegram вернул данные в URL
    script.setAttribute("data-auth-url", "https://dulcet-yeot-cb2d95.netlify.app/login");
    script.setAttribute("data-request-access", "write");
    document.getElementById("telegram-login-container").appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  // После авторизации Telegram перенаправляет на этот же маршрут с GET-параметрами.
  // Здесь мы читаем их и перенаправляем на /main, сохраняя данные в localStorage.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userData = Object.fromEntries(params.entries());
    console.log("URL parameters in Login:", userData);
    if (userData.id) {
      localStorage.setItem("telegramUser", JSON.stringify(userData));
      navigate("/main");
    }
  }, [navigate]);

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Войдите через Telegram</h1>
      <div id="telegram-login-container"></div>
    </div>
  );
}
