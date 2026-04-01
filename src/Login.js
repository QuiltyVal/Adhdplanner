// src/Login.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const userData = {
        id: user.uid,
        first_name: user.displayName || "Google User",
        email: user.email
      };

      localStorage.setItem("adhdUser", JSON.stringify(userData));
      navigate("/main");
    } catch (err) {
      console.error("Auth Error:", err.code, err.message);
      if (err.code === 'auth/operation-not-allowed') {
        setError("Google Sign-In НЕ включён в Firebase Console. Зайдите в Authentication → Sign-in method → Google → Enable.");
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError("Окно авторизации закрылось. Нажмите кнопку ещё раз и дождитесь загрузки окна Google.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        setError("Повторный запрос. Подождите секунду и нажмите ещё раз.");
      } else {
        setError(`Ошибка: ${err.code} — ${err.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-blob blob-1"></div>
      <div className="login-blob blob-2"></div>

      <div className="login-card animated-fade-in">
        <div style={{textAlign: "center"}}>
          <h1 className="login-title">ADHD Planner</h1>
          <p className="login-subtitle">Ваши задачи в облаке.<br/>Войдите через Google.</p>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={isProcessing}
          style={{
            marginTop: "20px",
            background: "#0a0a0a",
            color: "#c0c0c0",
            border: "2px solid #444",
            padding: "14px 24px",
            fontFamily: "'GuildensternNbp', 'VT323', monospace",
            fontWeight: "normal",
            fontSize: "1.3rem",
            cursor: isProcessing ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            width: "100%",
            boxShadow: "3px 3px 0 #000",
            opacity: isProcessing ? 0.6 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
          onMouseOver={(e) => {
            if (!isProcessing) {
              e.currentTarget.style.borderColor = "#c0c0c0";
              e.currentTarget.style.color = "#fff";
            }
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = "#444";
            e.currentTarget.style.color = "#c0c0c0";
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          {isProcessing ? "Загрузка..." : "Войти через Google"}
        </button>

        {error && (
          <div style={{
            color: "#fca5a5",
            fontSize: "1.1rem",
            fontFamily: "'GuildensternNbp', 'VT323', monospace",
            textAlign: "center",
            padding: "12px",
            backgroundColor: "rgba(138, 28, 28, 0.15)",
            border: "1px solid rgba(138, 28, 28, 0.4)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>
            {error}
          </div>
        )}

        <button
          onClick={() => {
            const guestUser = { id: "guest_" + Date.now(), first_name: "Гость" };
            localStorage.setItem("adhdUser", JSON.stringify(guestUser));
            navigate("/main");
          }}
          style={{
            background: "transparent",
            color: "#555",
            border: "1px solid #2a2a2a",
            padding: "10px 20px",
            fontFamily: "'GuildensternNbp', 'VT323', monospace",
            fontSize: "1.1rem",
            cursor: "pointer",
            transition: "all 0.15s",
            width: "100%",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = "#555";
            e.currentTarget.style.color = "#808080";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = "#2a2a2a";
            e.currentTarget.style.color = "#555";
          }}
        >
          Продолжить без аккаунта (Оффлайн)
        </button>
      </div>
    </div>
  );
}
