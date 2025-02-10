import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"; // Импорт маршрутов
import App from "./App"; // Основное приложение
import Login from "./Login"; // Страница логина

ReactDOM.render(
  <React.StrictMode>
    <Router>
      <Routes>
        {/* Главная страница */}
        <Route path="/" element={<App />} />
        {/* Страница логина */}
        <Route path="/login" element={<Login />} />
      </Routes>
    </Router>
  </React.StrictMode>,
  document.getElementById("root")
);
