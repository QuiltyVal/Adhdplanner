// src/index.js
import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import App from "./App";   // Основное приложение
import Login from "./Login"; // Страница логина
import "./index.css";

ReactDOM.render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/login" element={<Login />} />
        <Route path="/main" element={<App />} />
      </Routes>
    </Router>
  </React.StrictMode>,
  document.getElementById("root")
);
