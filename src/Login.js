// src/Login.js
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    // Читаем URL-параметры после авторизации
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
      <script
        async
        src="https://telegram.org/js/telegram-widget.js?7"
        data-telegram-login="Fegefeuerbot"
        data-size="large"
        data-radius="5"
        data-auth-url="https://dulcet-yeot-cb2d95.netlify.app/login"
        data-request-access="write"
      ></script>
    </div>
  );
}
