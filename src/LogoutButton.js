// src/LogoutButton.js
import React from "react";
import { useNavigate } from "react-router-dom";

const LogoutButton = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    // Очищаем данные пользователя из localStorage
    localStorage.removeItem("telegramUser");
    // Перенаправляем на страницу логина
    navigate("/login");
  };

  return (
    <button onClick={handleLogout} style={{ padding: "10px", margin: "10px" }}>
      Выйти
    </button>
  );
};

export default LogoutButton;
