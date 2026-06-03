import React from "react";

function ApusHeader({
  user,
  score,
  theme,
  calendarConnected,
  calendarToken,
  toggleTheme,
  connectCalendar,
  openOnboarding,
  onboardingOpen,
  language = "ru",
  setLanguage,
  demoMode = false,
  logoutNode,
}) {
  const isEnglish = language === "en";
  const todayLabel = new Intl.DateTimeFormat(isEnglish ? "en-US" : "ru-RU", {
    day: "2-digit",
    month: "short",
  }).format(new Date());
  const calendarIsConnected = Boolean(calendarConnected || calendarToken);

  return (
    <header className="apus-header">
      <div className="apus-header__identity">
        <div className="apus-header__meta">
          <span>apus</span>
          <span>{todayLabel}</span>
        </div>
        <h1 className="apus-header__title">ADHD Planner</h1>
        <p className="apus-header__greeting">
          {isEnglish ? "Hi" : "Привет"}, {user?.first_name || (isEnglish ? "Guest" : "Гость")}!
        </p>
        {demoMode && (
          <div className="apus-demo-safe-badge" aria-label={isEnglish ? "Demo data notice" : "Уведомление о демо-данных"}>
            <strong>{isEnglish ? "Demo data" : "Демо-данные"}</strong>
            <span>{isEnglish ? "Safe to click" : "Можно нажимать"}</span>
          </div>
        )}
      </div>

      <div className="apus-header__actions">
        <button
          type="button"
          onClick={() => setLanguage?.(language === "en" ? "ru" : "en")}
          className="apus-icon-btn"
          title={isEnglish ? "Switch to Russian" : "Switch to English"}
        >
          {language === "en" ? "RU" : "EN"}
        </button>
        <div className="apus-score" title={isEnglish ? "Points" : "Очки"}>
          <span aria-hidden="true">⚡</span>
          <b>{score}</b>
        </div>
        <button type="button" onClick={toggleTheme} className="apus-icon-btn" title={isEnglish ? "Change theme" : "Сменить тему"}>
          {theme === "dark" ? "🌆" : theme === "neon" ? "☀️" : "🌙"}
        </button>
        <button
          type="button"
          onClick={connectCalendar}
          className={`apus-icon-btn${calendarIsConnected ? " is-connected" : ""}`}
          title={calendarIsConnected ? (isEnglish ? "Calendar connected" : "Календарь подключён") : (isEnglish ? "Connect Google Calendar" : "Подключить Google Calendar")}
        >
          📅
        </button>
        <button
          type="button"
          onClick={openOnboarding}
          className={`apus-icon-btn${onboardingOpen ? " is-connected" : ""}`}
          title="Start tour"
          disabled={onboardingOpen}
        >
          ?
        </button>
        {logoutNode}
      </div>
    </header>
  );
}

export default ApusHeader;
