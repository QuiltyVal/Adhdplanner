import React from "react";
import "./AngelLabScreen.css";

export default function AngelLabScreen({
  open,
  text,
  saving,
  listening,
  finalizing,
  micStatus,
  micMode,
  processing,
  status,
  dumpHistory,
  suggestions,
  imageSrc,
  onChange,
  onToggleMic,
  onToggleStep,
  onAddTaskOnly,
  onAddTaskWithSteps,
  onDismissTask,
  onClose,
  onSave,
}) {
  if (!open) return null;

  const statusClass = status?.kind ? `angel-lab-status ${status.kind}` : "angel-lab-status";
  const dumps = Array.isArray(dumpHistory) ? dumpHistory : [];
  const taskCards = Array.isArray(suggestions) ? suggestions : [];

  return (
    <div className="angel-lab-overlay" role="dialog" aria-modal="true" aria-labelledby="angel-lab-title">
      <div className="angel-lab-shell">
        <button
          type="button"
          className="angel-lab-close"
          onClick={onClose}
          disabled={saving}
          aria-label="Закрыть Angel Lab"
        >
          ×
        </button>

        <div className="angel-lab-hero">
          <img src={imageSrc} alt="Ангелочек с микрофоном" className="angel-lab-image" />
          <button
            type="button"
            className={`angel-lab-mic ${listening || saving ? "busy" : ""}`}
            title={listening ? "Остановить запись/распознавание" : "Запустить микрофон"}
            onClick={onToggleMic}
            disabled={saving}
          >
            {listening ? "⏹ Остановить" : "🎤 Говорить"}
          </button>
        </div>

        <h2 id="angel-lab-title" className="angel-lab-title">Angel Lab (beta)</h2>
        <p className="angel-lab-subtitle">Скажи или напиши как есть. Сначала сохраняем dump, потом делаем черновой разбор на задачи.</p>
        {micMode === "record" && <p className="angel-lab-mic-note">Режим fallback: запись аудио и распознавание на сервере.</p>}
        {micStatus && <p className="angel-lab-mic-note">{micStatus}</p>}

        <textarea
          className="angel-lab-textarea"
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Например: я запуталась, надо корм коту, врач, документы и я не знаю с чего начать..."
          rows={8}
          autoFocus
        />

        <div className="angel-lab-actions">
          <button type="button" className="angel-lab-btn secondary" onClick={onClose} disabled={saving}>Назад</button>
          <button
            type="button"
            className="angel-lab-btn primary"
            onClick={onSave}
            disabled={saving || listening || finalizing || processing || !text.trim()}
          >
            {saving ? "Сохраняю..." : listening || finalizing ? "Останови микрофон" : "Сохранить dump"}
          </button>
        </div>

        {status?.message && <div className={statusClass}>{status.message}</div>}

        <div className="angel-lab-columns">
          <section className="angel-lab-column">
            <h3 className="angel-lab-column-title">Dump</h3>
            {dumps.length === 0 && (
              <p className="angel-lab-empty">Пока пусто. Сохрани первый дамп выше.</p>
            )}
            {dumps.length > 0 && (
              <ul className="angel-lab-list">
                {dumps.map((item) => (
                  <li key={item.id} className="angel-lab-list-item">{item.text}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="angel-lab-column">
            <h3 className="angel-lab-column-title">Черновик от ангела</h3>
            {processing && (
              <div className="angel-lab-processing">
                <span className="angel-lab-dot" />
                Делаю черновой разбор...
              </div>
            )}

            {!processing && taskCards.length === 0 && (
              <p className="angel-lab-empty">После сохранения здесь появятся карточки задач и опциональные шаги.</p>
            )}

            {!processing && taskCards.length > 0 && (
              <ul className="angel-lab-task-card-list">
                {taskCards.map((card) => {
                  const cardMode = String(card.mode || "create").toLowerCase();
                  const isMergeCard = cardMode === "merge";
                  const isRejectCard = cardMode === "reject";
                  const steps = Array.isArray(card.steps) ? card.steps : [];
                  const selectedStepCount = steps.filter((step) => step.selected && !step.added).length;
                  const cardAdded = Boolean(card.added);
                  const canAddWithSteps = selectedStepCount > 0 && !isRejectCard;

                  return (
                    <li key={card.id} className={`angel-lab-task-card${cardAdded ? " is-added" : ""}`}>
                      <div className="angel-lab-main-card">
                        <div className="angel-lab-main-label">Задача</div>
                        <div className="angel-lab-main-text">{card.title || card.text}</div>
                        {isMergeCard && card.targetTaskId && (
                          <div className="angel-lab-step-summary">В существующую задачу</div>
                        )}
                        {isRejectCard && (
                          <div className="angel-lab-step-summary">Шум/неясно — лучше пропустить</div>
                        )}
                        <div className="angel-lab-step-summary">
                          Шаги: {steps.length} · выбрано: {selectedStepCount}
                        </div>
                        {cardAdded && <div className="angel-lab-main-badge">Добавлено</div>}
                      </div>

                      <div className="angel-lab-main-label">Опциональные шаги</div>
                      {steps.length === 0 ? (
                        <p className="angel-lab-empty angel-lab-step-empty">
                          {isMergeCard
                            ? "Пока без новых подшагов для добавления."
                            : "Пока без подшагов. Можно добавить только задачу."}
                        </p>
                      ) : (
                        <ul className="angel-lab-list angel-lab-step-list">
                          {steps.map((step) => (
                            <li key={step.id} className={`angel-lab-list-item angel-lab-step-item${step.added ? " added" : ""}`}>
                              <label className="angel-lab-step-row">
                                <input
                                  type="checkbox"
                                  checked={Boolean(step.selected)}
                                  onChange={() => onToggleStep(card.id, step.id)}
                                  disabled={saving || cardAdded || step.added}
                                />
                                <span>{step.text}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="angel-lab-suggestion-actions">
                        {!isRejectCard && (
                          <button
                            type="button"
                            className={`angel-lab-add-btn${cardAdded ? " added" : ""}`}
                            onClick={() => onAddTaskOnly(card.id)}
                            disabled={saving || cardAdded}
                          >
                            {cardAdded
                              ? "Добавлено"
                              : isMergeCard
                                ? "Оставить без изменений"
                                : "Добавить только задачу"}
                          </button>
                        )}
                        {!isRejectCard && (
                          <button
                            type="button"
                            className={`angel-lab-add-btn${cardAdded ? " added" : ""}`}
                            onClick={() => onAddTaskWithSteps(card.id)}
                            disabled={saving || cardAdded || !canAddWithSteps}
                          >
                            {cardAdded
                              ? "Добавлено"
                              : canAddWithSteps
                                ? isMergeCard
                                  ? `Добавить в существующую с шагами (${selectedStepCount})`
                                  : `Добавить с шагами (${selectedStepCount})`
                                : "Нет выбранных шагов"}
                          </button>
                        )}
                        {!cardAdded && (
                          <button
                            type="button"
                            className="angel-lab-dismiss-btn"
                            onClick={() => onDismissTask(card.id)}
                            disabled={saving}
                          >
                            Не это
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
