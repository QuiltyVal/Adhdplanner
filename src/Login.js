// src/Login.js
import React from "react";

export default function Login() {
  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Войдите через Telegram</h1>
      <script
        async
        src="https://telegram.org/js/telegram-widget.js?7"
        data-telegram-login="Fegefeuerbot"
        data-size="large"
        data-radius="5"
        data-auth-url="https://dulcet-yeot-cb2d95.netlify.app/.netlify/functions/auth"
        data-request-access="write"
      ></script>
    </div>
  );
}