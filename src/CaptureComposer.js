import React from "react";
import "./CaptureComposer.css";

export default function CaptureComposer({
  open,
  value,
  saving,
  status,
  overloadBefore,
  overloadAfter,
  journal,
  onChange,
  onChangeOverloadBefore,
  onChangeOverloadAfter,
  onToggleConverted,
  onClose,
  onSave,
}) {
  if (!open) return null;

  const statusClass = status?.kind ? `capture-status ${status.kind}` : "capture-status";
  const now = Date.now();
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  const recentJournal = (Array.isArray(journal) ? journal : [])
    .filter((entry) => Number(entry?.createdAt || 0) >= now - twoWeeksMs)
    .slice(0, 8);
  const convertedCount = recentJournal.filter((entry) => Boolean(entry?.convertedToTask24h)).length;
  const entriesWithDrop = recentJournal.filter(
    (entry) => Number.isFinite(entry?.overloadBefore) && Number.isFinite(entry?.overloadAfter),
  );
  const avgDrop = entriesWithDrop.length
    ? (
      entriesWithDrop.reduce(
        (sum, entry) => sum + (Number(entry.overloadBefore) - Number(entry.overloadAfter)),
        0,
      ) / entriesWithDrop.length
    )
    : 0;
  const conversionRate = recentJournal.length
    ? Math.round((convertedCount / recentJournal.length) * 100)
    : 0;
  const scoreOptions = Array.from({ length: 11 }, (_, index) => index);

  return (
    <div className="capture-overlay" role="dialog" aria-modal="true" aria-labelledby="capture-composer-title">
      <div className="capture-modal glass-panel">
        <div className="capture-header">
          <div>
            <div className="capture-kicker">web capture</div>
            <h2 id="capture-composer-title" className="capture-title">
              Выгрузить из головы
            </h2>
            <p className="capture-description">
              Сюда можно скинуть сырой текст как есть. Я сохраню его отдельно, а потом мы разберёмся.
            </p>
          </div>
          <button
            type="button"
            className="capture-close-btn"
            onClick={onClose}
            disabled={saving}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <textarea
          className="capture-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Напиши сюда всё, что крутится в голове..."
          rows={10}
          autoFocus
        />

        <div className="capture-metrics-row">
          <label className="capture-metric-field">
            Перегруз до
            <select
              value={String(overloadBefore)}
              onChange={(event) => onChangeOverloadBefore(Number(event.target.value))}
              disabled={saving}
            >
              {scoreOptions.map((score) => (
                <option key={`before-${score}`} value={score}>{score}</option>
              ))}
            </select>
          </label>
          <label className="capture-metric-field">
            Перегруз после
            <select
              value={String(overloadAfter)}
              onChange={(event) => onChangeOverloadAfter(Number(event.target.value))}
              disabled={saving}
            >
              {scoreOptions.map((score) => (
                <option key={`after-${score}`} value={score}>{score}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="capture-actions">
          <button type="button" className="capture-secondary-btn" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button
            type="button"
            className="capture-primary-btn"
            onClick={onSave}
            disabled={saving || !value.trim()}
          >
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>

        {status?.message && <div className={statusClass}>{status.message}</div>}

        <section className="capture-journal">
          <div className="capture-journal-summary">
            <span>14 дней: {recentJournal.length} capture</span>
            <span>Конверсия в задачи: {conversionRate}%</span>
            <span>Среднее облегчение: {avgDrop.toFixed(1)}</span>
          </div>

          {recentJournal.length > 0 && (
            <ul className="capture-journal-list">
              {recentJournal.map((entry) => (
                <li key={entry.captureId} className="capture-journal-item">
                  <div className="capture-journal-text">{entry.preview || "Без текста"}</div>
                  <button
                    type="button"
                    className={`capture-journal-toggle${entry.convertedToTask24h ? " on" : ""}`}
                    onClick={() => onToggleConverted(entry.captureId)}
                    disabled={saving}
                  >
                    {entry.convertedToTask24h ? "✅ Стало задачей" : "Отметить: стало задачей"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
