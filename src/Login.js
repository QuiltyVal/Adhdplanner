// src/Login.js
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    // Динамически создаём и добавляем скрипт Telegram Login Widget
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?7";
    script.async = true;
    script.setAttribute("data-telegram-login", "Fegefeuerbot"); // Имя бота без @
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "5");
    // Указываем, что после логина данные будут возвращены на этот же URL (/login)
    script.setAttribute("data-auth-url", "https://dulcet-yeot-cb2d95.netlify.app/login");
    script.setAttribute("data-request-access", "write");
    document.getElementById("telegram-login-container").appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

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
