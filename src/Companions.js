import React, { useState, useEffect, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import angelImg from './assets/apus/angel_quiet_2048.png';
import devilImg from './assets/apus/devil_quiet_2048.png';
import AgentChat from './AgentChat';
import './Companions.css';

const ANGEL_FALLBACK = [
  "One small move counts.",
  "You do not need the whole task. Just the next step.",
  "Breathe. Pick one visible thing.",
];

const DEVIL_FALLBACK = [
  "Stale tasks stop poisoning the active list.",
  "Cemetery has room for abandoned clutter.",
  "If it is dead, let it be dead.",
];

const COMPANION_IDLE_ROTATE_MS = 8 * 60 * 1000;

const ANGEL_IDLE_SCENES = [
  {
    id: "cassette",
    activity: "cassette",
    src: "/mascots/idle-cleaned/angel_cassette.png",
  },
  {
    id: "reads",
    activity: "reading",
    src: "/mascots/idle-cleaned/angel_reads.png",
  },
  {
    id: "noodles",
    activity: "noodles",
    src: "/mascots/idle-cleaned/angel_noodles.png",
  },
  {
    id: "ps3",
    activity: "gaming",
    src: "/mascots/idle-cleaned/angel_ps3.png",
  },
  {
    id: "nap",
    activity: "nap",
    src: "/mascots/idle-cleaned/angel_nap.png",
  },
];

const DEVIL_IDLE_SCENES = [
  {
    id: "cassette",
    activity: "cassette",
    src: "/mascots/idle-cleaned/devil_cassette.png",
  },
  {
    id: "nintendo",
    activity: "gaming",
    src: "/mascots/idle-cleaned/devil_nintendo.png",
  },
  {
    id: "cleaning",
    activity: "cleaning",
    src: "/mascots/idle-cleaned/devil_cleaning.png",
  },
  {
    id: "noodles",
    activity: "noodles",
    src: "/mascots/idle-cleaned/devil_noodles.png",
  },
  {
    id: "nap",
    activity: "nap",
    src: "/mascots/idle-cleaned/devil_nap.png",
  },
];

function pickRandomIdleScene(scenes, excludeActivity = "") {
  const candidates = scenes.filter((scene) => scene.activity !== excludeActivity);
  const pool = candidates.length > 0 ? candidates : scenes;
  return pool[Math.floor(Math.random() * pool.length)] || scenes[0];
}

function makeCompanionIdlePair(previousPair = null) {
  let selectedPair = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angel = pickRandomIdleScene(ANGEL_IDLE_SCENES);
    const devil = pickRandomIdleScene(DEVIL_IDLE_SCENES, angel?.activity);
    selectedPair = {
      angelId: angel?.id || "cassette",
      devilId: devil?.id || "nintendo",
    };
    if (
      !previousPair ||
      selectedPair.angelId !== previousPair.angelId ||
      selectedPair.devilId !== previousPair.devilId
    ) {
      return selectedPair;
    }
  }
  return selectedPair || { angelId: "cassette", devilId: "nintendo" };
}

function findIdleScene(kind, id) {
  const scenes = kind === "devil" ? DEVIL_IDLE_SCENES : ANGEL_IDLE_SCENES;
  return scenes.find((scene) => scene.id === id) || null;
}

function getCompanionIdlePair() {
  return makeCompanionIdlePair();
}

export default function Companions({
  activeTab,
  tasksCount,
  deadCount,
  completedCount,
  tasks = [],
  onAddTask,
  onAddSubtask,
  onDeleteSubtask,
  onKillTask,
  onSetVital,
  onSetUrgency,
  calendarToken,
  companionFlash,
  language = "ru",
  companionPrompt = null,
  onCompanionPromptStart,
  onCompanionPromptConfirmCemetery,
  onCompanionPromptDismiss,
  onCompanionPromptShowPlanner,
  onCompanionPromptOption,
  idleEnabled = true,
  suppressAngelAvatar = false,
  suppressDevilAvatar = false,
}) {
  const [angelSpeech, setAngelSpeech] = useState(null);
  const [devilSpeech, setDevilSpeech] = useState(null);
  const [angelBounce, setAngelBounce] = useState(false);
  const [devilBounce, setDevilBounce] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPersona, setChatPersona] = useState("angel");
  const [idlePair, setIdlePair] = useState(() => getCompanionIdlePair());
  const [failedIdleAssets, setFailedIdleAssets] = useState({});
  const promptVisibleRef = useRef(false);

  useEffect(() => {
    const angelTimer = setInterval(() => {
      if (promptVisibleRef.current) return;
      if (Math.random() > 0.6) {
        const phrase = ANGEL_FALLBACK[Math.floor(Math.random() * ANGEL_FALLBACK.length)];
        setAngelSpeech(phrase);
        setTimeout(() => setAngelSpeech(null), 5000);
      }
    }, 15000);

    const devilTimer = setInterval(() => {
      if (promptVisibleRef.current) return;
      if (Math.random() > 0.6) {
        const phrase = DEVIL_FALLBACK[Math.floor(Math.random() * DEVIL_FALLBACK.length)];
        setDevilSpeech(phrase);
        setTimeout(() => setDevilSpeech(null), 5000);
      }
    }, 18000);

    return () => { clearInterval(angelTimer); clearInterval(devilTimer); };
  }, []);

  useEffect(() => {
    if (!companionFlash) {
      setAngelSpeech(null);
      setDevilSpeech(null);
      return;
    }
    let speechTimer = null;
    if (companionFlash.who === "devil") {
      setDevilSpeech(companionFlash.msg);
      setDevilBounce(true);
      setTimeout(() => setDevilBounce(false), 400);
      speechTimer = setTimeout(() => setDevilSpeech(null), 6500);
    } else {
      setAngelSpeech(companionFlash.msg);
      setAngelBounce(true);
      setTimeout(() => setAngelBounce(false), 400);
      speechTimer = setTimeout(() => setAngelSpeech(null), 6500);
    }
    return () => {
      if (speechTimer) clearTimeout(speechTimer);
    };
  }, [companionFlash]);

  useEffect(() => {
    const rotateTimer = setInterval(() => {
      setIdlePair((currentPair) => makeCompanionIdlePair(currentPair));
    }, COMPANION_IDLE_ROTATE_MS);
    return () => clearInterval(rotateTimer);
  }, []);

  const openChat = (persona) => {
    setChatPersona(persona);
    setChatOpen(true);
    if (persona === "angel") {
      setAngelBounce(true);
      setTimeout(() => setAngelBounce(false), 400);
    } else {
      setDevilBounce(true);
      setTimeout(() => setDevilBounce(false), 400);
    }
  };

  const { setNodeRef: setAngelRef, isOver: isOverAngel } = useDroppable({ id: "drop-angel" });
  const { setNodeRef: setDevilRef, isOver: isOverDevil } = useDroppable({ id: "drop-devil" });
  const isCemeteryTab = activeTab === "cemetery";
  const promptSpeaker = companionPrompt?.speaker === "devil" ? "devil" : "angel";
  const promptVisible = companionPrompt && typeof companionPrompt === "object";
  const promptKey = String(companionPrompt?.promptKey || companionPrompt?.kind || "companion_prompt");
  const promptTitle = String(companionPrompt?.title || "");
  const promptMessage = String(companionPrompt?.message || "");
  const promptOptions = Array.isArray(companionPrompt?.diagnosisOptions)
    ? companionPrompt.diagnosisOptions
    : [];
  const promptQuestion = String(companionPrompt?.diagnosisQuestion || "");
  useEffect(() => {
    promptVisibleRef.current = Boolean(promptVisible);
    if (promptVisible) {
      setAngelSpeech(null);
      setDevilSpeech(null);
    }
  }, [promptVisible, promptKey]);

  const angelSpeechVisible = !promptVisible && Boolean(angelSpeech);
  const devilSpeechVisible = !promptVisible && Boolean(devilSpeech);
  const idleMuted = !idleEnabled ||
    promptVisible ||
    Boolean(companionFlash) ||
    isOverAngel ||
    isOverDevil ||
    chatOpen;
  const angelIdleScene = !idleMuted ? findIdleScene("angel", idlePair.angelId) : null;
  const devilIdleScene = !idleMuted && !isCemeteryTab ? findIdleScene("devil", idlePair.devilId) : null;
  const angelIdleSrc = angelIdleScene?.src || "";
  const devilIdleSrc = devilIdleScene?.src || "";
  const devilFlashSceneSrc = companionFlash?.who === "devil" && companionFlash?.scene === "devil_cemetery"
    ? "/mascots/devil_cemetery.png"
    : "";
  const currentAngelImg = angelIdleSrc && !failedIdleAssets[angelIdleSrc] ? angelIdleSrc : angelImg;
  const baseDevilImg = isCemeteryTab ? "/mascots/devil_cemetery.png" : devilImg;
  const currentDevilImg = devilFlashSceneSrc && !failedIdleAssets[devilFlashSceneSrc]
    ? devilFlashSceneSrc
    : devilIdleSrc && !failedIdleAssets[devilIdleSrc]
      ? devilIdleSrc
      : baseDevilImg;
  const markIdleAssetFailed = (src) => {
    if (!src) return;
    setFailedIdleAssets((prev) => (
      prev[src]
        ? prev
        : { ...prev, [src]: true }
    ));
  };
  const cemeteryConfirmInFlightRef = useRef({ taskId: "", until: 0 });
  const confirmCemeteryMove = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const cemeteryTaskId = event?.currentTarget?.getAttribute?.("data-companion-cemetery-task-id") ||
      companionPrompt?.taskId ||
      "";
    const cemeteryTaskTitle = event?.currentTarget?.getAttribute?.("data-companion-cemetery-task-title") ||
      companionPrompt?.taskTitle ||
      "";
    const cemeteryPrompt = {
      ...(companionPrompt || {}),
      taskId: cemeteryTaskId,
      taskTitle: cemeteryTaskTitle,
    };
    const now = Date.now();
    if (
      cemeteryTaskId &&
      cemeteryConfirmInFlightRef.current.taskId === cemeteryTaskId &&
      cemeteryConfirmInFlightRef.current.until > now
    ) {
      return;
    }
    cemeteryConfirmInFlightRef.current = { taskId: cemeteryTaskId, until: now + 600 };
    window.setTimeout(() => {
      if (cemeteryConfirmInFlightRef.current.taskId === cemeteryTaskId) {
        cemeteryConfirmInFlightRef.current = { taskId: "", until: 0 };
      }
    }, 650);
    if (onCompanionPromptConfirmCemetery) {
      onCompanionPromptConfirmCemetery(cemeteryPrompt);
      return;
    }
    if (cemeteryTaskId) {
      onKillTask?.(cemeteryTaskId, {
        companionScene: "devil_cemetery",
        source: "companion_prompt_confirm_cemetery",
      });
    }
  };

  return (
    <>
      <div className="companions-container">
        <div className={`companion angel ${suppressAngelAvatar ? "is-suppressed" : ""}`} ref={setAngelRef}>
          {promptVisible && promptSpeaker === "angel" ? (
            <div key={promptKey} className="speech-bubble angel-bubble companion-prompt-bubble show">
              <button
                type="button"
                className="companion-prompt-hide"
                onClick={onCompanionPromptDismiss}
                aria-label={language === "en" ? "Hide this prompt" : "Скрыть подсказку"}
                title={language === "en" ? "Hide" : "Скрыть"}
              >
                ×
              </button>
              {promptTitle && <strong>{promptTitle}</strong>}
              <span>{promptMessage}</span>
              {promptOptions.length > 0 && (
                <div className="companion-prompt-option-list">
                  {promptQuestion && <strong>{promptQuestion}</strong>}
                  {promptOptions.map((option) => (
                    <button
                      key={option.id || option.label}
                      type="button"
                      data-companion-cemetery-action={
                        (companionPrompt?.kind === "sticky_kill_confirm" || companionPrompt?.directorAction === "confirm_cemetery") &&
                        (option?.effect === "confirm_cemetery_move" || option?.id === "confirm_cemetery_move")
                          ? "move"
                          : undefined
                      }
                      data-companion-cemetery-task-id={companionPrompt?.taskId || ""}
                      data-companion-cemetery-task-title={companionPrompt?.taskTitle || ""}
                      onPointerDown={(event) => {
                        if (
                          (companionPrompt?.kind === "sticky_kill_confirm" || companionPrompt?.directorAction === "confirm_cemetery") &&
                          (option?.effect === "confirm_cemetery_move" || option?.id === "confirm_cemetery_move")
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          confirmCemeteryMove(event);
                        }
                      }}
                      onMouseDown={(event) => {
                        if (
                          (companionPrompt?.kind === "sticky_kill_confirm" || companionPrompt?.directorAction === "confirm_cemetery") &&
                          (option?.effect === "confirm_cemetery_move" || option?.id === "confirm_cemetery_move")
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          confirmCemeteryMove(event);
                        }
                      }}
                      onClick={(event) => {
                        if (
                          companionPrompt?.kind === "sticky_kill_confirm" &&
                          (option?.effect === "confirm_cemetery_move" || option?.id === "confirm_cemetery_move")
                        ) {
                          confirmCemeteryMove(event);
                          return;
                        }
                        onCompanionPromptOption?.(option, companionPrompt);
                      }}
                      title={option.description || option.suggestedNextStep || option.label}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="companion-prompt-actions">
                {!companionPrompt.hidePrimary && (
                  <button
                    type="button"
                    data-companion-cemetery-action={
                      companionPrompt?.kind === "sticky_kill_confirm" ||
                      companionPrompt?.directorAction === "confirm_cemetery" ||
                      companionPrompt?.primaryLabel === "Move to Cemetery" ||
                      companionPrompt?.primaryLabel === "На кладбище"
                        ? "move"
                        : undefined
                    }
                    data-companion-cemetery-task-id={companionPrompt?.taskId || ""}
                    data-companion-cemetery-task-title={companionPrompt?.taskTitle || ""}
                    onPointerDown={(event) => {
                      if (
                        companionPrompt?.kind === "sticky_kill_confirm" ||
                        companionPrompt?.directorAction === "confirm_cemetery" ||
                        companionPrompt?.primaryLabel === "Move to Cemetery" ||
                        companionPrompt?.primaryLabel === "На кладбище"
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        confirmCemeteryMove(event);
                      }
                    }}
                    onMouseDown={(event) => {
                      if (
                        companionPrompt?.kind === "sticky_kill_confirm" ||
                        companionPrompt?.directorAction === "confirm_cemetery" ||
                        companionPrompt?.primaryLabel === "Move to Cemetery" ||
                        companionPrompt?.primaryLabel === "На кладбище"
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        confirmCemeteryMove(event);
                      }
                    }}
                    onClick={(event) => {
                      if (companionPrompt?.kind === "sticky_kill_confirm") {
                        confirmCemeteryMove(event);
                        return;
                      }
                      if (
                        companionPrompt?.directorAction === "confirm_cemetery" ||
                        companionPrompt?.primaryLabel === "Move to Cemetery" ||
                        companionPrompt?.primaryLabel === "На кладбище"
                      ) {
                        confirmCemeteryMove(event);
                        return;
                      }
                      onCompanionPromptStart?.(companionPrompt);
                    }}
                    disabled={Boolean(companionPrompt.primaryDisabled)}
                  >
                    {companionPrompt.primaryLabel || (language === "en" ? "Start" : "Начать")}
                  </button>
                )}
                <button type="button" onClick={onCompanionPromptDismiss}>
                  {companionPrompt.secondaryLabel || (language === "en" ? "Not now" : "Не сейчас")}
                </button>
                <button type="button" onClick={onCompanionPromptShowPlanner}>
                  {companionPrompt.tertiaryLabel || (language === "en" ? "Planner" : "Планер")}
                </button>
              </div>
            </div>
          ) : !promptVisible ? (
            <div className={`speech-bubble angel-bubble ${angelSpeechVisible ? 'show' : ''}`}>
              {angelSpeech}
            </div>
          ) : null}
          <div
            className={`avatar angel-avatar ${angelIdleScene ? ' is-idle-scene' : ''} ${angelBounce ? 'bounce' : ''}${isOverAngel ? ' is-drop-over' : ''}`}
            onClick={() => openChat("angel")}
            title={angelIdleScene ? `Angel idle: ${angelIdleScene.id}` : "Angel"}
          >
            <img
              src={currentAngelImg}
              alt="Angel"
              className="companion-avatar-img"
              onError={() => markIdleAssetFailed(currentAngelImg)}
            />
          </div>
        </div>

        <div className={`companion devil ${suppressDevilAvatar ? "is-suppressed" : ""}`} ref={setDevilRef}>
          {promptVisible && promptSpeaker === "devil" ? (
            <div key={promptKey} className="speech-bubble devil-bubble companion-prompt-bubble show">
              <button
                type="button"
                className="companion-prompt-hide"
                onClick={onCompanionPromptDismiss}
                aria-label={language === "en" ? "Hide this prompt" : "Скрыть подсказку"}
                title={language === "en" ? "Hide" : "Скрыть"}
              >
                ×
              </button>
              {promptTitle && <strong>{promptTitle}</strong>}
              <span>{promptMessage}</span>
              {promptOptions.length > 0 && (
                <div className="companion-prompt-option-list">
                  {promptQuestion && <strong>{promptQuestion}</strong>}
                  {promptOptions.map((option) => (
                    <button
                      key={option.id || option.label}
                      type="button"
                      data-companion-cemetery-action={
                        (companionPrompt?.kind === "sticky_kill_confirm" || companionPrompt?.directorAction === "confirm_cemetery") &&
                        (option?.effect === "confirm_cemetery_move" || option?.id === "confirm_cemetery_move")
                          ? "move"
                          : undefined
                      }
                      data-companion-cemetery-task-id={companionPrompt?.taskId || ""}
                      data-companion-cemetery-task-title={companionPrompt?.taskTitle || ""}
                      onPointerDown={(event) => {
                        if (
                          (companionPrompt?.kind === "sticky_kill_confirm" || companionPrompt?.directorAction === "confirm_cemetery") &&
                          (option?.effect === "confirm_cemetery_move" || option?.id === "confirm_cemetery_move")
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          confirmCemeteryMove(event);
                        }
                      }}
                      onMouseDown={(event) => {
                        if (
                          (companionPrompt?.kind === "sticky_kill_confirm" || companionPrompt?.directorAction === "confirm_cemetery") &&
                          (option?.effect === "confirm_cemetery_move" || option?.id === "confirm_cemetery_move")
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          confirmCemeteryMove(event);
                        }
                      }}
                      onClick={(event) => {
                        if (
                          companionPrompt?.kind === "sticky_kill_confirm" &&
                          (option?.effect === "confirm_cemetery_move" || option?.id === "confirm_cemetery_move")
                        ) {
                          confirmCemeteryMove(event);
                          return;
                        }
                        onCompanionPromptOption?.(option, companionPrompt);
                      }}
                      title={option.description || option.suggestedNextStep || option.label}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="companion-prompt-actions">
                {!companionPrompt.hidePrimary && (
                  <button
                    type="button"
                    data-companion-cemetery-action={
                      companionPrompt?.kind === "sticky_kill_confirm" ||
                      companionPrompt?.directorAction === "confirm_cemetery" ||
                      companionPrompt?.primaryLabel === "Move to Cemetery" ||
                      companionPrompt?.primaryLabel === "На кладбище"
                        ? "move"
                        : undefined
                    }
                    data-companion-cemetery-task-id={companionPrompt?.taskId || ""}
                    data-companion-cemetery-task-title={companionPrompt?.taskTitle || ""}
                    onPointerDown={(event) => {
                      if (
                        companionPrompt?.kind === "sticky_kill_confirm" ||
                        companionPrompt?.directorAction === "confirm_cemetery" ||
                        companionPrompt?.primaryLabel === "Move to Cemetery" ||
                        companionPrompt?.primaryLabel === "На кладбище"
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        confirmCemeteryMove(event);
                      }
                    }}
                    onMouseDown={(event) => {
                      if (
                        companionPrompt?.kind === "sticky_kill_confirm" ||
                        companionPrompt?.directorAction === "confirm_cemetery" ||
                        companionPrompt?.primaryLabel === "Move to Cemetery" ||
                        companionPrompt?.primaryLabel === "На кладбище"
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        confirmCemeteryMove(event);
                      }
                    }}
                    onClick={(event) => {
                      if (companionPrompt?.kind === "sticky_kill_confirm") {
                        confirmCemeteryMove(event);
                        return;
                      }
                      if (
                        companionPrompt?.directorAction === "confirm_cemetery" ||
                        companionPrompt?.primaryLabel === "Move to Cemetery" ||
                        companionPrompt?.primaryLabel === "На кладбище"
                      ) {
                        confirmCemeteryMove(event);
                        return;
                      }
                      onCompanionPromptStart?.(companionPrompt);
                    }}
                    disabled={Boolean(companionPrompt.primaryDisabled)}
                  >
                    {companionPrompt.primaryLabel || (language === "en" ? "Start" : "Начать")}
                  </button>
                )}
                <button type="button" onClick={onCompanionPromptDismiss}>
                  {companionPrompt.secondaryLabel || (language === "en" ? "Not now" : "Не сейчас")}
                </button>
                <button type="button" onClick={onCompanionPromptShowPlanner}>
                  {companionPrompt.tertiaryLabel || (language === "en" ? "Planner" : "Планер")}
                </button>
              </div>
            </div>
          ) : !promptVisible ? (
            <div className={`speech-bubble devil-bubble ${devilSpeechVisible ? 'show' : ''}`}>
              {devilSpeech}
            </div>
          ) : null}
          <div
            className={`avatar devil-avatar ${devilIdleScene && !devilFlashSceneSrc ? ' is-idle-scene' : ''} ${isCemeteryTab ? 'is-cemetery-avatar' : ''} ${devilFlashSceneSrc ? ' is-burying-avatar' : ''} ${devilBounce ? 'bounce' : ''}${isOverDevil ? ' is-drop-over' : ''}`}
            onClick={() => openChat("devil")}
            title={devilFlashSceneSrc ? "Devil buried a task" : devilIdleScene ? `Devil idle: ${devilIdleScene.id}` : "Devil"}
          >
            <img
              src={currentDevilImg}
              alt="Devil"
              className="companion-avatar-img"
              onError={() => markIdleAssetFailed(currentDevilImg)}
            />
          </div>
        </div>
      </div>

      <AgentChat
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        persona={chatPersona}
        tasks={tasks}
        onAddTask={onAddTask}
        onAddSubtask={onAddSubtask}
        onDeleteSubtask={onDeleteSubtask}
        onKillTask={onKillTask}
        onSetVital={onSetVital}
        onSetUrgency={onSetUrgency}
        calendarToken={calendarToken}
        language={language}
      />
    </>
  );
}
