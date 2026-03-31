// src/LogoutButton.js
import React from "react";
import { useNavigate } from "react-router-dom";

const LogoutButton = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("telegramUser");
    navigate("/login");
  };

  return (
    <button 
      onClick={handleLogout} 
      style={{ 
        background: "transparent",
        color: "var(--danger-color)",
        border: "1px solid var(--danger-color)",
        padding: "8px 16px",
        borderRadius: "8px",
        fontWeight: "600",
        cursor: "pointer",
        transition: "all 0.2s fade"
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = "var(--danger-color)";
        e.currentTarget.style.color = "white";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--danger-color)";
      }}
    >
      Выйти
    </button>
  );
};

export default LogoutButton;
