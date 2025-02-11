// src/Login.js
import React, { useEffect } from "react";

export default function Login() {
  useEffect(() => {
    // Создаем скрипт
    const script = document.createElement('script');
    script.src = "https://telegram.org/js/telegram-widget.js?7";
    script.async = true;
    script.setAttribute('data-telegram-login', 'Fegefeuerbot');
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '5');
    script.setAttribute('data-auth-url', 'https://dulcet-yeot-cb2d95.netlify.app/netlify/functions/auth');
    script.setAttribute('data-request-access', 'write');
    
    // Добавляем скрипт на страницу
    document.getElementById('telegram-login-container').appendChild(script);

    // Очистка при размонтировании
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Войдите через Telegram</h1>
      <div id="telegram-login-container"></div>
    </div>
  );
}