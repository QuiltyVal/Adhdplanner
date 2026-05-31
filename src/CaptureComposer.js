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
              Brain dump
            </h2>
            <p className="capture-description">
              Drop raw thoughts here exactly as they are. I will save them separately, then we can sort them out.
            </p>
          </div>
          <button
            type="button"
            className="capture-close-btn"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <textarea
          className="capture-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write everything spinning in your head..."
          rows={10}
          autoFocus
        />

        <div className="capture-metrics-row">
          <label className="capture-metric-field">
            Overload before
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
            Overload after
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
            Cancel
          </button>
          <button
            type="button"
            className="capture-primary-btn"
            onClick={onSave}
            disabled={saving || !value.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {status?.message && <div className={statusClass}>{status.message}</div>}

        <section className="capture-journal">
          <div className="capture-journal-summary">
            <span>14 days: {recentJournal.length} captures</span>
            <span>Task conversion: {conversionRate}%</span>
            <span>Average relief: {avgDrop.toFixed(1)}</span>
          </div>

          {recentJournal.length > 0 && (
            <ul className="capture-journal-list">
              {recentJournal.map((entry) => (
                <li key={entry.captureId} className="capture-journal-item">
                  <div className="capture-journal-text">{entry.preview || "No text"}</div>
                  <button
                    type="button"
                    className={`capture-journal-toggle${entry.convertedToTask24h ? " on" : ""}`}
                    onClick={() => onToggleConverted(entry.captureId)}
                    disabled={saving}
                  >
                    {entry.convertedToTask24h ? "✅ Became a task" : "Mark: became a task"}
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
