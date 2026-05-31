import React from "react";
import ApusHeader from "./ApusHeader";
import ApusStatusBar from "./ApusStatusBar";
import ApusTodayMission from "./ApusTodayMission";
import "./ApusShell.css";

function ApusPlannerShell({
  user,
  score,
  theme,
  calendarConnected,
  calendarToken,
  activeTab,
  activeFilter,
  language,
  setLanguage,
  stats,
  mission,
  demoMode = false,
  handlers,
  logoutNode,
}) {
  return (
    <div className="apus-planner-shell animated-fade-in">
      <ApusHeader
        user={user}
        score={score}
        theme={theme}
        calendarConnected={calendarConnected}
        calendarToken={calendarToken}
        toggleTheme={handlers.toggleTheme}
        connectCalendar={handlers.connectCalendar}
        openOnboarding={handlers.openOnboarding}
        onboardingOpen={handlers.onboardingOpen}
        language={language}
        setLanguage={setLanguage || handlers.setLanguage}
        demoMode={demoMode}
        logoutNode={logoutNode}
      />
      <div className="apus-planner-shell__body">
        <ApusStatusBar
          activeTab={activeTab}
          activeFilter={activeFilter}
          openProgress={handlers.openProgress}
          onFilterChange={handlers.filterActive}
          openAngelLab={handlers.openAngelLab}
          angelLabOpen={handlers.angelLabOpen}
          stats={stats}
          latestDevilEvent={stats.latestDevilEvent}
          language={language}
        />
        <ApusTodayMission key={mission?.task?.id || "empty-mission"} mission={mission} onRescue={handlers.openRescue} demoMode={demoMode} />
      </div>
    </div>
  );
}

export default ApusPlannerShell;
