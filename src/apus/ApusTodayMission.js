import React from "react";

function ApusTodayMission({ mission, onRescue, demoMode = false, nudgeStatus = "", language = "ru" }) {
  const task = mission?.task || null;
  const rescueEnabled = Boolean(task);
  const cleanNudgeStatus = String(nudgeStatus || "").trim();
  const isEnglish = language === "en";

  return (
    <section
      className={`apus-mission${rescueEnabled ? " is-clickable" : ""}`}
      role={rescueEnabled ? "button" : undefined}
      tabIndex={rescueEnabled ? 0 : undefined}
      onClick={rescueEnabled ? onRescue : undefined}
      onKeyDown={rescueEnabled ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onRescue();
        }
      } : undefined}
      title={rescueEnabled ? (isEnglish ? "Open rescue session" : "Открыть rescue-сессию") : undefined}
    >
      <div className="apus-section-kicker">today mission</div>
      <h2 className="apus-mission__title">
        {task ? task.text : (isEnglish ? "Everything is under control today" : "Сегодня всё под контролем")}
      </h2>

      {task && (
        <div className="apus-mission__chips">
          <span className="apus-mission-chip is-reason">🧭 {mission.reasonLabel}</span>
          {mission.deadline && (
            <span className={`apus-mission-chip is-deadline ${mission.deadline.tone || ""}`}>
              📅 {mission.deadline.label}
            </span>
          )}
          {task.isVital && (
            <span className="apus-mission-chip is-vital">🚨 {mission.vitalLabel}</span>
          )}
          <span className="apus-mission-chip is-urgency">⏰ {mission.urgencyLabel}</span>
          <span className="apus-mission-chip is-resistance">🧠 {mission.resistanceLabel}</span>
        </div>
      )}

      {rescueEnabled && (
        <div className={`apus-mission__hint${demoMode ? " is-demo-guide" : ""}`}>
          {demoMode
            ? (isEnglish ? "start here · open rescue" : "начни здесь · открыть rescue")
            : (isEnglish ? "tap when stuck" : "нажми, если застряла")}
        </div>
      )}

      {cleanNudgeStatus && (
        <div className="apus-mission__status" role="status" aria-live="polite">
          {cleanNudgeStatus}
        </div>
      )}
    </section>
  );
}

export default ApusTodayMission;
