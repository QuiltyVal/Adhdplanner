import React from "react";
import "./AngelLabScreen.css";

function isAngelLabStepSelected(step) {
  if (!step) return false;
  if (Object.prototype.hasOwnProperty.call(step, "selected")) {
    return Boolean(step.selected);
  }
  return Boolean(step.selectedByDefault || step.checked);
}

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
  handledNotice,
  handledStats,
  imageSrc,
  language = "ru",
  onChange,
  onToggleMic,
  onAudioFile,
  onToggleStep,
  onAddTaskOnly,
  onAddTaskWithSteps,
  onDismissTask,
  onClose,
  onSave,
}) {
  const audioInputRef = React.useRef(null);
  const clarificationNoticeTimerRef = React.useRef(null);
  const [clarificationNotice, setClarificationNotice] = React.useState("");

  React.useEffect(() => () => {
    if (clarificationNoticeTimerRef.current) {
      window.clearTimeout(clarificationNoticeTimerRef.current);
    }
  }, []);

  if (!open) return null;

  const isEnglish = language === "en";
  const copy = {
    closeLabel: isEnglish ? "Close Angel Lab" : "Закрыть Angel Lab",
    micLabel: isEnglish ? "Angel with microphone" : "Ангелочек с микрофоном",
    micStartTitle: isEnglish ? "Start microphone" : "Запустить микрофон",
    micStopTitle: isEnglish ? "Stop recording/recognition" : "Остановить запись/распознавание",
    micStart: isEnglish ? "🎤 Speak" : "🎤 Говорить",
    micStop: isEnglish ? "⏹ Stop" : "⏹ Остановить",
    audioFile: isEnglish ? "Record via phone" : "Записать через телефон",
    audioFileTitle: isEnglish
      ? "Use the phone/system recorder if browser microphone access is stuck"
      : "Использовать системную запись, если браузерный микрофон завис",
    subtitle: isEnglish
      ? "Dump the chaos as it is. Angel will draft task cards, but nothing is added until you confirm it."
      : "Выгрузи хаос как есть. Ангел сделает черновик задач, но ничего не добавит без твоего подтверждения.",
    fallbackMode: isEnglish
      ? "OpenAI mode: record audio, then auto-detect language after Stop."
      : "Режим OpenAI: записываю аудио, потом определяю язык после «Остановить».",
    placeholder: isEnglish
      ? "Example: I am stuck, need cat food, doctor, documents, and I do not know where to start..."
      : "Например: я запуталась, надо корм коту, врач, документы и я не знаю с чего начать...",
    back: isEnglish ? "Back" : "Назад",
    saving: isEnglish ? "Saving..." : "Сохраняю...",
    stopMicFirst: isEnglish ? "Stop microphone first" : "Останови микрофон",
    saveDump: isEnglish ? "Save dump" : "Сохранить dump",
    splitDump: isEnglish ? "Draft task cards" : "Разбить на задачи",
    recordingNow: isEnglish
      ? "Recording is on. Speak now; press Stop when finished."
      : "Запись идёт. Говори сейчас; нажми «Остановить», когда закончишь.",
    requestingMic: isEnglish
      ? "Requesting microphone access..."
      : "Запрашиваю доступ к микрофону...",
    dumpEmpty: isEnglish ? "Empty for now. Save the first dump above." : "Пока пусто. Сохрани первый дамп выше.",
    draftTitle: isEnglish ? "Angel draft" : "Черновик от ангела",
    draftQueue: isEnglish ? "draft cards left" : "карточек осталось",
    draftQueueHint: isEnglish
      ? "Added or dismissed cards disappear from this draft."
      : "Добавленные или убранные карточки исчезают из этого черновика.",
    lastAction: isEnglish ? "Last action" : "Последнее действие",
    draftProgress: isEnglish ? "Draft progress" : "Прогресс черновика",
    addedCount: isEnglish ? "added" : "добавлено",
    skippedCount: isEnglish ? "skipped" : "пропущено",
    leftCount: isEnglish ? "left" : "осталось",
    processing: isEnglish ? "Making a rough draft..." : "Делаю черновой разбор...",
    noCards: isEnglish
      ? "After saving, task cards and optional steps will appear here."
      : "После сохранения здесь появятся карточки задач и опциональные шаги.",
    noPendingCards: isEnglish
      ? "No draft cards waiting. Added or dismissed cards disappear from here."
      : "Нет карточек на подтверждение. Добавленные или убранные карточки исчезают отсюда.",
    allHandled: isEnglish
      ? "All drafted cards are handled. You can go back to the planner now."
      : "Все черновые карточки обработаны. Можно вернуться в планер.",
    sessionComplete: isEnglish ? "Session complete" : "Сессия завершена",
    task: isEnglish ? "Task" : "Задача",
    existingTask: isEnglish ? "Into existing task" : "В существующую задачу",
    reject: isEnglish ? "Noise/unclear — better skip" : "Шум/неясно — лучше пропустить",
    steps: isEnglish ? "Subtasks" : "Подзадачи",
    selected: isEnglish ? "chosen to add" : "выбрано для добавления",
    added: isEnglish ? "Added" : "Добавлено",
    optionalSteps: isEnglish ? "Choose subtasks to add" : "Выбери подзадачи для добавления",
    noNewMergeSteps: isEnglish
      ? "No new subtasks to add yet."
      : "Пока без новых подшагов для добавления.",
    noSteps: isEnglish
      ? "No subtasks yet. You can still add the task."
      : "Пока без подшагов. Всё равно можно добавить задачу.",
    needsClarificationTitle: isEnglish ? "Needs clarification" : "Нужно уточнение",
    needsClarificationBody: isEnglish
      ? "Angel could not find reliable subtasks for this card. Add the task only if the title is useful, or skip it and dump one clearer next move."
      : "Ангел не нашёл надёжные подзадачи для этой карточки. Добавь только главную задачу, если название полезное, или пропусти и запиши один более понятный следующий шаг.",
    noReliableSteps: isEnglish
      ? "No reliable subtasks yet. This card needs a clearer next move."
      : "Пока нет надёжных подзадач. Этой карточке нужен более понятный следующий шаг.",
    clarifyThis: isEnglish ? "Clarify this" : "Уточнить это",
    fixParse: isEnglish ? "Fix parse" : "Исправить разбор",
    clarificationAdded: isEnglish
      ? "Clarification prompt added above. Add one sentence, then draft again."
      : "Уточняющий prompt добавлен выше. Допиши одну фразу и снова разбей на задачи.",
    parseFixAdded: isEnglish
      ? "Correction prompt added above. Rewrite the card in one sentence, then draft again."
      : "Prompt для исправления добавлен выше. Перепиши карточку одной фразой и снова разбей на задачи.",
    keepNoChange: isEnglish ? "Keep unchanged" : "Оставить без изменений",
    addTaskOnly: isEnglish ? "Add main task without subtasks" : "Добавить главную задачу без подзадач",
    addTitleOnly: isEnglish ? "Add title only" : "Добавить только название",
    addExistingWithSteps: isEnglish ? "Add to existing with steps" : "Добавить в существующую с шагами",
    addWithSteps: isEnglish ? "Add task + chosen subtasks" : "Добавить задачу + выбранные подзадачи",
    noSelectedSteps: isEnglish ? "Choose at least one subtask above" : "Выбери хотя бы одну подзадачу выше",
    doneClose: isEnglish ? "Done — back to planner" : "Готово — обратно в планер",
    notThis: isEnglish ? "Not this" : "Не это",
  };
  const statusClass = status?.kind ? `angel-lab-status ${status.kind}` : "angel-lab-status";
  const dumps = Array.isArray(dumpHistory) ? dumpHistory : [];
  const taskCards = Array.isArray(suggestions) ? suggestions : [];
  const addedDraftCount = Number(handledStats?.added || 0);
  const skippedDraftCount = Number(handledStats?.skipped || 0);
  const handledDraftCount = addedDraftCount + skippedDraftCount;
  const recordingActive = listening && micMode === "record";
  const requestingMic = listening && micMode === "request";
  const visibleMicStatus = recordingActive
    ? ""
    : requestingMic && !micStatus
      ? copy.requestingMic
      : micStatus;
  const hasDraftableText = text.trim().length > 0;
  const saveButtonText = saving
    ? copy.saving
    : listening || finalizing
      ? copy.stopMicFirst
      : hasDraftableText
        ? copy.splitDump
        : copy.saveDump;

  return (
    <div className="angel-lab-overlay" role="dialog" aria-modal="true" aria-labelledby="angel-lab-title">
      <div className="angel-lab-shell">
        <button
          type="button"
          className="angel-lab-close"
          onClick={onClose}
          disabled={saving}
          aria-label={copy.closeLabel}
        >
          ×
        </button>

        <div className="angel-lab-top">
          <div className="angel-lab-hero">
            <button
              type="button"
              className={`angel-lab-media-button ${recordingActive ? "is-recording" : ""}`}
              onClick={onToggleMic}
              disabled={saving}
              aria-label={listening ? copy.micStopTitle : copy.micStartTitle}
              title={listening ? copy.micStopTitle : copy.micStartTitle}
            >
              {recordingActive ? (
                <video
                  src="/mascots/angel_recorder_recording_square.mp4"
                  poster="/mascots/angel_recorder_idle_square.jpg"
                  className="angel-lab-image angel-lab-video"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  aria-label={copy.micLabel}
                />
              ) : (
                <img
                  src="/mascots/angel_recorder_idle_square.jpg"
                  className="angel-lab-image angel-lab-video"
                  alt={copy.micLabel}
                  onError={(event) => {
                    event.currentTarget.src = imageSrc;
                  }}
                />
              )}
            </button>
            <button
              type="button"
              className={`angel-lab-mic ${recordingActive ? "recording" : ""} ${listening || saving ? "busy" : ""}`}
              title={listening ? copy.micStopTitle : copy.micStartTitle}
              onClick={onToggleMic}
              disabled={saving}
            >
              {listening ? copy.micStop : copy.micStart}
            </button>
          </div>

          <div className="angel-lab-dump-panel">
            <h2 id="angel-lab-title" className="angel-lab-title">Angel Lab</h2>
            <p className="angel-lab-subtitle">{copy.subtitle}</p>
            {recordingActive && <p className="angel-lab-recording-banner">● {copy.recordingNow}</p>}
            {(micMode === "record" || micMode === "request") && <p className="angel-lab-mic-note">{copy.fallbackMode}</p>}
            {visibleMicStatus && <p className="angel-lab-mic-note">{visibleMicStatus}</p>}

            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              capture="microphone"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                event.target.value = "";
                if (file) onAudioFile?.(file);
              }}
            />

            <textarea
              className={`angel-lab-textarea${clarificationNotice ? " is-clarifying" : ""}`}
              value={text}
              onChange={(event) => onChange(event.target.value)}
              placeholder={copy.placeholder}
              rows={8}
              autoFocus
            />
            {clarificationNotice && (
              <p className="angel-lab-inline-notice" role="status">{clarificationNotice}</p>
            )}

            <div className="angel-lab-actions">
              <button type="button" className="angel-lab-btn secondary" onClick={onClose} disabled={saving}>{copy.back}</button>
              <button
                type="button"
                className="angel-lab-btn secondary"
                onClick={() => audioInputRef.current?.click()}
                disabled={saving || finalizing || processing}
                title={copy.audioFileTitle}
              >
                {copy.audioFile}
              </button>
              <button
                type="button"
                className="angel-lab-btn primary"
                onClick={onSave}
                disabled={saving || listening || finalizing || processing || !text.trim()}
              >
                {saveButtonText}
              </button>
            </div>
          </div>
        </div>

        {status?.message && <div className={statusClass}>{status.message}</div>}

        <div className="angel-lab-columns">
          <section className="angel-lab-column">
            <h3 className="angel-lab-column-title">Dump</h3>
            {dumps.length === 0 && (
              <p className="angel-lab-empty">{copy.dumpEmpty}</p>
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
            <div className="angel-lab-column-heading">
              <h3 className="angel-lab-column-title">{copy.draftTitle}</h3>
              {handledNotice?.message && (
                <div className={`angel-lab-handled-notice ${handledNotice.kind || "success"}`} role="status">
                  <span>{copy.lastAction}</span>
                  <strong>{handledNotice.message}</strong>
                </div>
              )}
              {(handledDraftCount > 0 || taskCards.length > 0) && (
                <div className="angel-lab-draft-progress" aria-label={copy.draftProgress}>
                  <span><strong>{addedDraftCount}</strong> {copy.addedCount}</span>
                  <span><strong>{skippedDraftCount}</strong> {copy.skippedCount}</span>
                  <span><strong>{taskCards.length}</strong> {copy.leftCount}</span>
                </div>
              )}
              {!processing && taskCards.length > 0 && (
                <div className="angel-lab-draft-queue" role="status">
                  <strong>{taskCards.length}</strong> {copy.draftQueue}
                  <span>{copy.draftQueueHint}</span>
                </div>
              )}
            </div>
            {processing && (
              <div className="angel-lab-processing">
                <span className="angel-lab-dot" />
                {copy.processing}
              </div>
            )}

            {!processing && taskCards.length === 0 && (
              handledDraftCount > 0 ? (
                <div className="angel-lab-done-panel" role="status">
                  <strong>{copy.sessionComplete}</strong>
                  <span>
                    {copy.allHandled}
                    {handledDraftCount > 0
                      ? ` ${addedDraftCount} ${copy.addedCount} · ${skippedDraftCount} ${copy.skippedCount}.`
                      : ""}
                  </span>
                  <button type="button" className="angel-lab-btn primary" onClick={onClose} disabled={saving}>
                    {copy.doneClose}
                  </button>
                </div>
              ) : status?.kind === "success" || dumps.length > 0 ? (
                <div className="angel-lab-done-panel" role="status">
                  <strong>{copy.noPendingCards}</strong>
                  <span>{copy.allHandled}</span>
                  <button type="button" className="angel-lab-btn primary" onClick={onClose} disabled={saving}>
                    {copy.doneClose}
                  </button>
                </div>
              ) : (
                <p className="angel-lab-empty">{copy.noCards}</p>
              )
            )}

            {!processing && taskCards.length > 0 && (
              <ul className="angel-lab-task-card-list">
                {taskCards.map((card) => {
                  const cardMode = String(card.mode || "create").toLowerCase();
                  const isMergeCard = cardMode === "merge";
                  const isRejectCard = cardMode === "reject";
                  const steps = Array.isArray(card.subtasks) && card.subtasks.length > 0
                    ? card.subtasks
                    : (Array.isArray(card.steps) ? card.steps : []);
                  const selectedStepCount = steps.filter((step) => isAngelLabStepSelected(step) && !step.added).length;
                  const cardAdded = Boolean(card.added);
                  const canAddWithSteps = selectedStepCount > 0 && !isRejectCard;
                  const needsClarification = Boolean(card.draftQuality?.needsClarification);
                  const cardTitle = card.title || card.text || "";
                  const clarificationText = needsClarification
                    ? isEnglish
                      ? `Clarify this task: ${cardTitle}\nWhat exactly is unclear or blocked? `
                      : `Уточнить задачу: ${cardTitle}\nЧто именно неясно или блокирует? `
                    : isEnglish
                      ? `Fix this draft card: ${cardTitle}\nCorrect task or next move: `
                      : `Исправить черновую карточку: ${cardTitle}\nПравильная задача или следующий шаг: `;
                  const clarificationAlreadyAdded = text.includes(clarificationText.trim());
                  const appendClarificationPrompt = () => {
                    const nextText = clarificationAlreadyAdded
                      ? text
                      : text.trim()
                        ? `${text.trim()}\n\n${clarificationText}`
                        : clarificationText;
                    onChange(nextText);
                    setClarificationNotice(needsClarification ? copy.clarificationAdded : copy.parseFixAdded);
                    if (clarificationNoticeTimerRef.current) {
                      window.clearTimeout(clarificationNoticeTimerRef.current);
                    }
                    clarificationNoticeTimerRef.current = window.setTimeout(() => {
                      setClarificationNotice("");
                    }, 1600);
                  };

                  return (
                    <li key={card.id} className={`angel-lab-task-card${cardAdded ? " is-added" : ""}${needsClarification ? " needs-clarification" : ""}`}>
                      <div className="angel-lab-main-card">
                        <div className="angel-lab-main-label">{copy.task}</div>
                        <div className="angel-lab-main-text">{card.title || card.text}</div>
                        {isMergeCard && card.targetTaskId && (
                          <div className="angel-lab-step-summary">{copy.existingTask}</div>
                        )}
                        {isRejectCard && (
                          <div className="angel-lab-step-summary">{copy.reject}</div>
                        )}
                        <div className="angel-lab-step-summary">
                          {copy.steps}: {steps.length} · {copy.selected}: {selectedStepCount}
                        </div>
                        {needsClarification && (
                          <div className="angel-lab-clarification-panel" role="note">
                            <strong>{copy.needsClarificationTitle}</strong>
                            <span>{copy.needsClarificationBody}</span>
                          </div>
                        )}
                        {cardAdded && <div className="angel-lab-main-badge">{copy.added}</div>}
                      </div>

                      <div className="angel-lab-main-label">{copy.optionalSteps}</div>
                      {steps.length === 0 ? (
                        <p className="angel-lab-empty angel-lab-step-empty">
                          {needsClarification
                            ? copy.noReliableSteps
                            : isMergeCard
                            ? copy.noNewMergeSteps
                            : copy.noSteps}
                        </p>
                      ) : (
                        <ul className="angel-lab-list angel-lab-step-list">
                          {steps.map((step) => {
                            const stepSelected = isAngelLabStepSelected(step);
                            return (
                            <li key={step.id} className={`angel-lab-list-item angel-lab-step-item${step.added ? " added" : ""}${stepSelected ? " selected" : ""}`}>
                              <button
                                type="button"
                                className={`angel-lab-step-row${stepSelected ? " selected" : ""}`}
                                onClick={() => onToggleStep(card.id, step.id)}
                                disabled={saving || cardAdded || step.added}
                                aria-pressed={stepSelected}
                              >
                                <span className="angel-lab-step-check" aria-hidden="true">
                                  {stepSelected ? "✓" : ""}
                                </span>
                                <span className="angel-lab-step-text">{step.text}</span>
                              </button>
                            </li>
                            );
                          })}
                        </ul>
                      )}

                      <div className="angel-lab-suggestion-actions">
                        {!isRejectCard && canAddWithSteps && (
                          <button
                            type="button"
                            className={`angel-lab-add-btn strong${cardAdded ? " added" : ""}`}
                            onClick={() => onAddTaskWithSteps(card.id)}
                            disabled={saving || cardAdded}
                          >
                            {cardAdded
                              ? copy.added
                              : isMergeCard
                                ? `${copy.addExistingWithSteps} (${selectedStepCount})`
                                : `${copy.addWithSteps} (${selectedStepCount})`}
                          </button>
                        )}
                        {!isRejectCard && (
                          <button
                            type="button"
                            className={`angel-lab-add-btn${cardAdded ? " added" : ""}`}
                            onClick={() => onAddTaskOnly(card.id)}
                            disabled={saving || cardAdded}
                          >
                            {cardAdded
                              ? copy.added
                              : isMergeCard
                                ? copy.keepNoChange
                                : needsClarification
                                  ? copy.addTitleOnly
                                  : copy.addTaskOnly}
                          </button>
                        )}
                        {!isRejectCard && !canAddWithSteps && (
                          <div className="angel-lab-step-hint" role="status">
                            {copy.noSelectedSteps}
                          </div>
                        )}
                        {!isRejectCard && !cardAdded && (
                          <button
                            type="button"
                            className={`angel-lab-add-btn clarification${needsClarification ? "" : " parse-fix"}`}
                            onClick={appendClarificationPrompt}
                            disabled={saving || clarificationAlreadyAdded}
                          >
                            {needsClarification ? copy.clarifyThis : copy.fixParse}
                          </button>
                        )}
                        {!cardAdded && (
                          <button
                            type="button"
                            className="angel-lab-dismiss-btn"
                            onClick={() => onDismissTask(card.id)}
                            disabled={saving}
                          >
                            {copy.notThis}
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
        {taskCards.length > 0 && (
          <div className="angel-lab-actions angel-lab-bottom-actions">
            <button type="button" className="angel-lab-btn secondary" onClick={onClose} disabled={saving}>
              {copy.doneClose}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
