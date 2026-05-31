import React from "react";

function formatDeliveryStatus(deliveryStatus, isEnglish) {
  if (!deliveryStatus) return null;
  const channel = String(deliveryStatus.channel || "").toLowerCase();
  const status = String(deliveryStatus.status || "").toLowerCase();
  const channelLabel = channel === "email" ? "Email" : channel === "telegram" ? "Telegram" : (isEnglish ? "Delivery" : "Доставка");
  const isBad = status === "retry" || status === "dead";

  if (status === "sent") return { isBad, label: isEnglish ? `${channelLabel} works` : `${channelLabel} работает` };
  if (status === "linked") return { isBad: false, label: isEnglish ? `${channelLabel} linked` : `${channelLabel} подключён` };
  if (status === "stale_failure") return { isBad: false, label: isEnglish ? `${channelLabel} old issue` : `${channelLabel}: старый сбой` };
  if (status === "queued") return { isBad, label: isEnglish ? `${channelLabel} queued` : `${channelLabel} в очереди` };
  if (status === "retry") return { isBad, label: isEnglish ? `${channelLabel} retry` : `${channelLabel} повтор` };
  if (status === "dead") return { isBad, label: isEnglish ? `${channelLabel} failed` : `${channelLabel} не дошёл` };
  return { isBad, label: isEnglish ? `${channelLabel} status` : `${channelLabel}: статус` };
}

function PlannerStatusBar({
  activeTab,
  activeFilter,
  openPlannerProgress,
  onFilterChange,
  streak,
  todayActions,
  tasksInDanger,
  activeTasksCount,
  todayPinnedCount,
  latestDevilEvent,
  deliveryStatus,
  angelLabOpen,
  openAngelLab,
  language = "ru",
}) {
  const isEnglish = language === "en";
  const deliveryCopy = formatDeliveryStatus(deliveryStatus, isEnglish);

  return (
    <section className="planner-status-bar glass-panel animated-fade-in">
      <div className="planner-status-kicker">{isEnglish ? "planner status" : "состояние планера"}</div>
      <div className="planner-status-row">
        <button
          type="button"
          className={`planner-status-badge is-interactive ${activeTab === "stats" ? "is-active" : ""}`}
          onClick={openPlannerProgress}
        >
          ⚔️ streak {streak}
        </button>
        <button
          type="button"
          className={`planner-status-badge is-interactive ${activeTab === "stats" ? "is-active" : ""}`}
          onClick={openPlannerProgress}
        >
          🫡 {isEnglish ? "actions today" : "действий сегодня"} {todayActions}
        </button>
        <button
          type="button"
          className={`planner-status-badge danger is-interactive ${activeTab === "active" && activeFilter === "danger" ? "is-active" : ""}`}
          onClick={() => onFilterChange("danger")}
        >
          ☠️ {isEnglish ? "at risk" : "на грани"} {tasksInDanger}
        </button>
        <button
          type="button"
          className={`planner-status-badge active is-interactive ${activeTab === "active" && activeFilter === "all" ? "is-active" : ""}`}
          onClick={() => onFilterChange("all")}
        >
          🔥 {isEnglish ? "active" : "активных"} {activeTasksCount}
        </button>
        <button
          type="button"
          className={`planner-status-badge today is-interactive ${activeTab === "active" && activeFilter === "today" ? "is-active" : ""}`}
          onClick={() => onFilterChange("today")}
        >
          ☀️ {isEnglish ? "today" : "сегодня"} {todayPinnedCount}
        </button>
        <button
          type="button"
          className={`planner-status-badge angel-lab-launch is-interactive ${angelLabOpen ? "is-active" : ""}`}
          onClick={openAngelLab}
          title={isEnglish ? "Angel Lab — one place to unload your brain" : "Angel Lab — единый вход для выгрузки из головы"}
          disabled={angelLabOpen}
        >
          😇 Angel Lab
        </button>
        {deliveryCopy && (
          <button
            type="button"
            className={`planner-status-badge delivery is-interactive ${deliveryCopy.isBad ? "warning" : ""} ${activeTab === "stats" ? "is-active" : ""}`}
            onClick={openPlannerProgress}
          >
            {deliveryCopy.isBad ? "⚠️" : "📡"} {deliveryCopy.label}
          </button>
        )}
      </div>
      {latestDevilEvent && (
        <button
          type="button"
          className="planner-status-devil-note"
          onClick={openPlannerProgress}
        >
          <span>😈</span>
          <b>{latestDevilEvent.message || latestDevilEvent.taskText || (isEnglish ? "Devil changed something" : "Чёртик что-то сделал")}</b>
          {latestDevilEvent.timeLabel && <small>{latestDevilEvent.timeLabel}</small>}
        </button>
      )}
    </section>
  );
}

export default PlannerStatusBar;
