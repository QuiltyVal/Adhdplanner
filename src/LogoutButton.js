// src/LogoutButton.js
import React from "react";
import { useNavigate } from "react-router-dom";

const LogoutButton = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("adhdUser");
    navigate("/login");
  };

  return (
    <button
      onClick={handleLogout}
      style={{
        background: "transparent",
        color: "#8a1c1c",
        border: "2px solid #8a1c1c",
        padding: "10px 18px",
        fontFamily: "'Press Start 2P', cursive",
        fontSize: "0.7rem",
        cursor: "pointer",
        letterSpacing: "1px",
        boxShadow: "2px 2px 0 #000",
        transition: "all 0.15s",
        textTransform: "uppercase",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = "#8a1c1c";
        e.currentTarget.style.color = "white";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#8a1c1c";
      }}
    >
      SIGN OUT
    </button>
  );
};

export default LogoutButton;
