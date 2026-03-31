// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";  // Используем createRoot из ReactDOM/client
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import App from "./App";     // Основное приложение (интерфейс с задачами)
import Login from "./Login"; // Страница логина
import "./index.css";

// Apply saved theme before first render (prevents flash)
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/main" element={<App />} />
        <Route path="/" element={<App />} />
      </Routes>
    </Router>
  </React.StrictMode>
);
