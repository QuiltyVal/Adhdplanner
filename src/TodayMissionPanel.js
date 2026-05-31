import React from "react";

function TodayMissionPanel({
  rescueTask,
  missionReasonLabel,
  rescueDeadline,
  vitalLabel,
  urgencyLabel,
  resistanceLabel,
  onRescue,
  nudgeStatus,
  notificationPermission,
  notificationsEnabled,
  onNotificationsClick,
  onTestNudge,
  language = "ru",
}) {
  const rescueEnabled = Boolean(rescueTask);
  const isEnglish = language === "en";
  const copy = {
    openRescue: isEnglish ? "Open rescue session" : "Открыть rescue-сессию",
    emptyTitle: isEnglish ? "Today is under control" : "Сегодня всё под контролем",
    defaultNudge: isEnglish
      ? "Rescue the day mission first; everything else can wait."
      : "Сначала спасайте цель дня, потом уже всё остальное.",
    nudges: isEnglish ? "Nudges and signals" : "Пинки и сигналы",
    disableNudges: isEnglish ? "🔕 Turn nudges off" : "🔕 Выключить пинки",
    enableNudges: isEnglish ? "🔔 Turn nudges on" : "🔔 Включить пинки",
    allowNudges: isEnglish ? "🔔 Allow nudges" : "🔔 Разрешить пинки",
    testNudge: isEnglish ? "🧪 Test nudge" : "🧪 Тестовый пинок",
  };

  return (
    <section className="daily-pulse-panel glass-panel animated-fade-in">
      <div
        className={`daily-pulse-copy mission-spotlight${rescueEnabled ? " clickable" : ""}`}
        role={rescueEnabled ? "button" : undefined}
        tabIndex={rescueEnabled ? 0 : undefined}
        onClick={rescueEnabled ? onRescue : undefined}
        onKeyDown={rescueEnabled ? (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onRescue();
          }
        } : undefined}
        title={rescueEnabled ? copy.openRescue : undefined}
      >
        <div className="daily-pulse-kicker">today mission</div>
        <h2 className="daily-pulse-title">
          {rescueTask ? rescueTask.text : copy.emptyTitle}
        </h2>
        <div className="daily-pulse-stats">
          {rescueTask && (
            <span className="pulse-chip mission-reason">🧭 {missionReasonLabel}</span>
          )}
          {rescueTask && (
            <>
              {rescueDeadline && (
                <span className={`pulse-chip deadline ${rescueDeadline.tone}`}>📅 {rescueDeadline.label}</span>
              )}
              {rescueTask.isVital && (
                <span className="pulse-chip vital">🚨 {vitalLabel}</span>
              )}
              <span className="pulse-chip urgency">⏰ {urgencyLabel}</span>
              <span className="pulse-chip resistance">🧠 {resistanceLabel}</span>
            </>
          )}
        </div>
      </div>
      <div className="daily-pulse-footer">
        {nudgeStatus || copy.defaultNudge}
        <details style={{ marginTop: "12px" }}>
          <summary style={{ cursor: "pointer", opacity: 0.85 }}>{copy.nudges}</summary>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
            <button className="pulse-action-btn" onClick={onNotificationsClick}>
              {notificationPermission === "granted"
                ? notificationsEnabled
                  ? copy.disableNudges
                  : copy.enableNudges
                : copy.allowNudges}
            </button>
            {notificationPermission === "granted" && (
              <button className="pulse-action-btn" onClick={onTestNudge}>
                {copy.testNudge}
              </button>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}

export default TodayMissionPanel;
