import React from "react";

function ApusTodayMission({ mission, onRescue, demoMode = false }) {
  const task = mission?.task || null;
  const rescueEnabled = Boolean(task);

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
      title={rescueEnabled ? "Open rescue session" : undefined}
    >
      <div className="apus-section-kicker">today mission</div>
      <h2 className="apus-mission__title">
        {task ? task.text : "Everything is under control today"}
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
          {demoMode ? "start here · open rescue" : "tap when stuck"}
        </div>
      )}
    </section>
  );
}

export default ApusTodayMission;
