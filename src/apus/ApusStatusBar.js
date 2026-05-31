import React from "react";

function formatDeliveryStatus(deliveryStatus, isEnglish) {
  if (!deliveryStatus) return null;
  const channel = String(deliveryStatus.channel || "").toLowerCase();
  const status = String(deliveryStatus.status || "").toLowerCase();
  const channelLabel = channel === "email" ? "Email" : channel === "telegram" ? "Telegram" : (isEnglish ? "Delivery" : "Доставка");
  const isBad = status === "retry" || status === "dead";

  if (status === "sent") {
    return { isBad, icon: "📡", title: isEnglish ? `${channelLabel} works` : `${channelLabel} работает`, subtitle: isEnglish ? "sent" : "отправлено" };
  }
  if (status === "linked") {
    return { isBad: false, icon: "📡", title: isEnglish ? `${channelLabel} linked` : `${channelLabel} подключён`, subtitle: isEnglish ? "bot replies" : "бот отвечает" };
  }
  if (status === "stale_failure") {
    return { isBad: false, icon: "📡", title: isEnglish ? `${channelLabel} old issue` : `${channelLabel} старый сбой`, subtitle: isEnglish ? "no active backlog" : "нет активной очереди" };
  }
  if (status === "queued") {
    return { isBad, icon: "📨", title: isEnglish ? `${channelLabel} queued` : `${channelLabel} в очереди`, subtitle: isEnglish ? "waiting" : "ожидает" };
  }
  if (status === "retry") {
    return { isBad, icon: "⚠️", title: isEnglish ? `${channelLabel} retry` : `${channelLabel} повтор`, subtitle: isEnglish ? "delivery issue" : "сбой доставки" };
  }
  if (status === "dead") {
    return { isBad, icon: "🚫", title: isEnglish ? `${channelLabel} failed` : `${channelLabel} не дошёл`, subtitle: isEnglish ? "check setup" : "проверь настройки" };
  }
  return { isBad, icon: "📡", title: channelLabel, subtitle: isEnglish ? "delivery status" : "статус доставки" };
}

function ApusStatusBar({
  activeTab,
  activeFilter,
  openProgress,
  onFilterChange,
  openAngelLab,
  angelLabOpen,
  stats,
  latestDevilEvent,
  language = "ru",
}) {
  const isEnglish = language === "en";
  const deliveryCopy = formatDeliveryStatus(stats?.deliveryStatus, isEnglish);

  return (
    <section className="apus-status" aria-label={isEnglish ? "Planner status" : "Состояние планера"}>
      <div className="apus-section-kicker">{isEnglish ? "planner status" : "состояние планера"}</div>
      <div className="apus-status__grid">
        <button
          type="button"
          className={`apus-status-chip is-metric ${activeTab === "stats" ? "is-active" : ""}`}
          onClick={openProgress}
        >
          <span>⚔️</span>
          <b>{stats.streak}</b>
          <small>streak</small>
        </button>
        <button
          type="button"
          className={`apus-status-chip is-metric ${activeTab === "stats" ? "is-active" : ""}`}
          onClick={openProgress}
        >
          <span>🫡</span>
          <b>{stats.todayActions}</b>
          <small>{isEnglish ? "actions today" : "сегодня"}</small>
        </button>
        <button
          type="button"
          className={`apus-status-chip is-danger ${activeTab === "active" && activeFilter === "danger" ? "is-active" : ""}`}
          onClick={() => onFilterChange("danger")}
        >
          <span>☠️</span>
          <b>{stats.tasksInDanger}</b>
          <small>{isEnglish ? "at risk" : "на грани"}</small>
        </button>
        <button
          type="button"
          className={`apus-status-chip is-active-filter ${activeTab === "active" && activeFilter === "all" ? "is-active" : ""}`}
          onClick={() => onFilterChange("all")}
        >
          <span>🔥</span>
          <b>{stats.activeTasksCount}</b>
          <small>{isEnglish ? "active" : "активных"}</small>
        </button>
        <button
          type="button"
          className={`apus-status-chip is-today ${activeTab === "active" && activeFilter === "today" ? "is-active" : ""}`}
          onClick={() => onFilterChange("today")}
        >
          <span>☀️</span>
          <b>{stats.todayPinnedCount}</b>
          <small>{isEnglish ? "today" : "сегодня"}</small>
        </button>
        <button
          type="button"
          className={`apus-status-chip is-lab ${angelLabOpen ? "is-active" : ""}`}
          onClick={openAngelLab}
          disabled={angelLabOpen}
        >
          <span>😇</span>
          <b>lab</b>
          <small>{isEnglish ? "brain dump" : "выгрузить"}</small>
        </button>
        {deliveryCopy && (
          <button
            type="button"
            className={`apus-status-chip is-delivery ${deliveryCopy.isBad ? "is-warning" : ""} ${activeTab === "stats" ? "is-active" : ""}`}
            onClick={openProgress}
          >
            <span>{deliveryCopy.icon}</span>
            <b>{deliveryCopy.title}</b>
            <small>{deliveryCopy.subtitle}</small>
          </button>
        )}
      </div>
      {latestDevilEvent && (
        <button
          type="button"
          className="apus-status-devil-note"
          onClick={openProgress}
        >
          <span>😈</span>
          <b>{latestDevilEvent.message || latestDevilEvent.taskText || (isEnglish ? "Devil changed something" : "Чёртик что-то сделал")}</b>
          {latestDevilEvent.timeLabel && <small>{latestDevilEvent.timeLabel}</small>}
        </button>
      )}
    </section>
  );
}

export default ApusStatusBar;
