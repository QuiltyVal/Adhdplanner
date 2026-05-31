import React, { useEffect, useState } from "react";

function RescueOverlay({
  open,
  panicPlan,
  closePanicMode,
  panicEndsAt,
  panicSecondsLeft,
  panicStepEditorOpen,
  panicDraftStep,
  panicStepSource = "",
  language = "en",
  setPanicDraftStep,
  handlePanicAddStep,
  handleStartPanicSprint,
  handleExtendPanicSprint,
  handlePanicDone,
  handlePanicFocusTask,
}) {
  const [countdownNow, setCountdownNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) {
      setCountdownNow(Date.now());
      return undefined;
    }

    setCountdownNow(Date.now());
    const interval = setInterval(() => {
      setCountdownNow(Date.now());
    }, 500);

    return () => clearInterval(interval);
  }, [open]);

  if (!open) return null;
  const isEnglish = language === "en";

  const primaryStep = Array.isArray(panicPlan.steps) && panicPlan.steps.length > 0
    ? panicPlan.steps[0]
    : panicPlan.intro;
  const secondarySteps = Array.isArray(panicPlan.steps)
    ? panicPlan.steps.slice(1)
    : [];
  const sprintRunning = Boolean(panicEndsAt);
  const displaySecondsLeft = sprintRunning
    ? Math.min(2 * 60, Math.max(0, Math.ceil((panicEndsAt - countdownNow) / 1000)))
    : panicSecondsLeft;
  const countdownText = sprintRunning
    ? `${Math.floor(displaySecondsLeft / 60)}:${String(displaySecondsLeft % 60).padStart(2, "0")}`
    : "2:00";
  const TimerPanel = sprintRunning ? "div" : "button";
  const stepSourceLabel = panicStepSource === "angel_shrink"
    ? (isEnglish ? "Angel shrank this into one step" : "Ангел уменьшил это до одного шага")
    : panicStepSource === "angel_clarification"
      ? (isEnglish ? "Angel clarified this step" : "Ангел прояснил этот шаг")
      : "";

  return (
    <div className={`panic-overlay apus-rescue-overlay${sprintRunning ? " is-running" : ""}`}>
      <div className="panic-modal apus-rescue-modal animated-fade-in">
        <div className="apus-rescue-mark" aria-hidden="true">
          <span className="apus-rescue-mark-wing">⌁</span>
          <span>apus · rescue</span>
          <span className="apus-rescue-mark-dot" />
        </div>

        <button className="panic-close-btn apus-rescue-exit" onClick={() => closePanicMode("exit")} aria-label="Close rescue">
          × exit
        </button>

        <div className="apus-rescue-stage">
          <div className="apus-rescue-portrait" aria-hidden="true">
            <video
              className="apus-rescue-video"
              src="/mascots/angel_rescue_loop.mp4"
              poster="/mascots/angel_rescue.png"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
            />
          </div>

          <div className="apus-rescue-content">
            <p className="panic-intro apus-rescue-voice">
              "I'm with you. One thing."
            </p>

            <div className="apus-rescue-task-card">
              <span className="apus-rescue-label">working on now</span>
              <h2>{panicPlan.title}</h2>
              <p className="apus-rescue-task-copy">{panicPlan.intro}</p>
              <p className="apus-rescue-first-step">
                <span>first step · 2 minutes</span>
                {primaryStep}
              </p>
              {stepSourceLabel && (
                <div className="apus-rescue-step-source" aria-label={isEnglish ? "Micro-step source" : "Источник микрошагa"}>
                  {stepSourceLabel}
                </div>
              )}
            </div>

            <TimerPanel
              className={`panic-timer-panel apus-rescue-timer${sprintRunning ? " is-running-status" : " is-start-button"}`}
              onClick={sprintRunning ? undefined : handleStartPanicSprint}
              type={sprintRunning ? undefined : "button"}
              aria-label={sprintRunning ? "Rescue session timer" : "Start a soft 2-minute sprint"}
            >
              <video
                className="apus-rescue-timer-video"
                src="/mascots/devil_timer_loop.mp4"
                poster="/mascots/devil_timer.png"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                aria-hidden="true"
              />
              <div className="apus-rescue-timer-copy">
                <div className="panic-timer-label">
                  {sprintRunning ? "time left" : "soft start"}
                </div>
                <div key={countdownText} className="panic-timer-value">
                  {countdownText}
                </div>
              </div>
            </TimerPanel>

            {secondarySteps.length > 0 && (
              <details className="apus-rescue-secondary">
                <summary>if you need more support</summary>
                <div className="panic-step-list">
                  {secondarySteps.map((step, index) => (
                    <div key={step} className="panic-step-item">
                      <span className="panic-step-index">{index + 2}</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>

        {panicStepEditorOpen && (
          <div className="panic-step-builder">
            <input
              type="text"
              value={panicDraftStep}
              onChange={(event) => setPanicDraftStep(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handlePanicAddStep()}
              placeholder="If the step is unclear, write the tiniest next move here"
              className="panic-step-input"
            />
            <button className="pulse-action-btn" onClick={handlePanicAddStep}>
              Save step
            </button>
          </div>
        )}

        <div className="panic-actions-grid apus-rescue-actions">
          <button
            className="pulse-action-btn primary apus-rescue-primary"
            onClick={sprintRunning ? handlePanicDone : handleStartPanicSprint}
          >
            {sprintRunning
              ? (isEnglish ? "✅ I moved" : "✅ Я сдвинулась")
              : (isEnglish ? "start" : "начать")}
          </button>

          {sprintRunning && (
            <button className="pulse-action-btn apus-rescue-ghost" onClick={handleExtendPanicSprint}>
              2 more minutes
            </button>
          )}

          {!sprintRunning && (
            <button className="pulse-action-btn apus-rescue-ghost" onClick={handlePanicDone}>
              {isEnglish ? "I moved" : "Я сдвинулась"}
            </button>
          )}

          <button className="pulse-action-btn apus-rescue-ghost" onClick={handlePanicFocusTask}>
            ✏️ Step unclear
          </button>

          <button className="pulse-action-btn apus-rescue-ghost" onClick={() => closePanicMode("later")}>
            Later
          </button>
        </div>

        <div className="apus-rescue-breath" aria-hidden="true">
          <span />
          <span>inhale · exhale</span>
        </div>
      </div>
    </div>
  );
}

export default RescueOverlay;
