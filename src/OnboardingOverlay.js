import React, { useEffect, useState } from "react";
import "./OnboardingOverlay.css";

const ONBOARDING_COPY = {
  en: {
    languageLabel: "EN",
    close: "Skip",
    back: "Back",
    next: "Next",
    finish: "Enter planner",
    progress: "step",
    demoBadge: "Interactive portfolio demo",
    demoNote: "Safe demo data. Try the flow; nothing touches a real account.",
    demoTry: "Try first: enter the planner, click Today Mission, start Rescue, and complete one tiny step.",
    steps: [
      {
        speaker: "both",
        targetSelector: ".apus-header, .header-container",
        eyebrow: "Welcome",
        title: "This planner is built for stuck brains.",
        body: "You do not need to organize your whole life first. You only need one visible next move.",
        angel: "I keep the next step gentle.",
        devil: "I keep the stale stuff from pretending it is alive.",
      },
      {
        speaker: "devil",
        targetSelector: ".tabs-navigation",
        eyebrow: "The map",
        title: "Tasks move through worlds.",
        body: "Active is where living tasks stay. Heaven is completed work. Cemetery is for dead, paused, or discarded tasks.",
        angel: "Completed tasks still count.",
        devil: "Dead tasks stop poisoning the active list.",
      },
      {
        speaker: "devil",
        targetSelector: ".zones-grid, .active-zones-wrapper",
        eyebrow: "Active zones",
        title: "Living tasks cool down when ignored.",
        body: "Inside Active, tasks travel between Focus, Background, and Purgatory. If a task stays cold too long, the devil may bury it and report it by push, email, or Telegram.",
        angel: "Touch a task to warm it back up.",
        devil: "If it stays frozen, I clean it out.",
      },
      {
        speaker: "angel",
        targetSelector: ".apus-mission, .daily-pulse-panel",
        eyebrow: "Today Mission",
        title: "One task gets the spotlight.",
        body: "The planner chooses one important task using deadlines, today pins, critical flags, and momentum.",
        angel: "Click the mission when you are stuck.",
        devil: "Do not negotiate with seventeen tasks at once.",
      },
      {
        speaker: "angel",
        targetSelector: ".apus-mission, .daily-pulse-panel",
        eyebrow: "Rescue",
        title: "When you freeze, start tiny.",
        body: "Rescue mode gives you one task, one microstep, and a two-minute soft start. A shift counts even if the task is not finished.",
        angel: "Two minutes is enough to restart movement.",
        devil: "A crooked step beats elegant avoidance.",
      },
      {
        speaker: "angel",
        targetSelector: ".apus-status-chip.is-lab, .planner-status-badge.angel-lab-launch",
        eyebrow: "Angel Lab",
        title: "Dump the chaos. Confirm the tasks.",
        body: "Angel Lab turns a messy brain dump into draft task cards and optional steps. Nothing is added until you confirm it.",
        angel: "Say it messy. I will sort it gently.",
        devil: "But we do not let vague mush become ten fake tasks.",
      },
      {
        speaker: "devil",
        targetSelector: ".tab-btn.tab-stats, .planner-events-panel",
        eyebrow: "Progress",
        title: "The system keeps receipts.",
        body: "Progress shows completed work, streaks, task history, and what angel, devil, or the system changed.",
        angel: "You get proof that you moved.",
        devil: "And if I bury something, you will know.",
      },
    ],
  },
  ru: {
    languageLabel: "RU",
    close: "Пропустить",
    back: "Назад",
    next: "Дальше",
    finish: "В планер",
    progress: "шаг",
    demoBadge: "Интерактивное демо для портфолио",
    demoNote: "Безопасные демо-данные. Можно нажимать: реальный аккаунт не изменится.",
    demoTry: "Что попробовать: войти в планер, нажать Today Mission, открыть Rescue и закрыть один микрошаг.",
    steps: [
      {
        speaker: "both",
        targetSelector: ".apus-header, .header-container",
        eyebrow: "Привет",
        title: "Этот планер сделан для мозга, который застревает.",
        body: "Не нужно сначала идеально разобрать жизнь. Достаточно увидеть один следующий шаг.",
        angel: "Я делаю следующий шаг мягким.",
        devil: "А я не даю мёртвым задачам притворяться живыми.",
      },
      {
        speaker: "devil",
        targetSelector: ".tabs-navigation",
        eyebrow: "Карта",
        title: "Вот миры задач.",
        body: "В процессе — живые задачи. Рай — завершённые. Кладбище — мёртвые, отложенные или выброшенные задачи.",
        angel: "Завершённое всё равно считается.",
        devil: "Мёртвое не должно отравлять активный список.",
      },
      {
        speaker: "devil",
        targetSelector: ".zones-grid, .active-zones-wrapper",
        eyebrow: "Зоны активности",
        title: "Живые задачи остывают, если их не трогать.",
        body: "Внутри активного списка задачи путешествуют между фокусом, фоном и чистилищем. Если задача слишком долго холодная, чёртик может похоронить её и сообщить об этом push-уведомлением, письмом или в Telegram.",
        angel: "Тронь задачу, чтобы вернуть ей тепло.",
        devil: "Если она замёрзла надолго, я уберу её.",
      },
      {
        speaker: "angel",
        targetSelector: ".apus-mission, .daily-pulse-panel",
        eyebrow: "Today Mission",
        title: "Одна задача получает прожектор.",
        body: "Планер выбирает важную задачу по дедлайнам, закреплению на сегодня, критичности и движению.",
        angel: "Нажми на цель дня, если застряла.",
        devil: "Не торгуйся сразу с семнадцатью задачами.",
      },
      {
        speaker: "angel",
        targetSelector: ".apus-mission, .daily-pulse-panel",
        eyebrow: "Rescue",
        title: "Если замёрзла, начни крошечно.",
        body: "Rescue даёт одну задачу, один микрошаг и мягкий старт на две минуты. Сдвиг считается, даже если задача не закончена.",
        angel: "Двух минут достаточно, чтобы снова поехать.",
        devil: "Кривой шаг лучше красивого избегания.",
      },
      {
        speaker: "angel",
        targetSelector: ".apus-status-chip.is-lab, .planner-status-badge.angel-lab-launch",
        eyebrow: "Angel Lab",
        title: "Выгрузи хаос. Подтверди задачи.",
        body: "Angel Lab превращает грязный brain dump в черновики задач и опциональные шаги. Ничего не добавляется без подтверждения.",
        angel: "Говори как есть. Я аккуратно разложу.",
        devil: "Но туманную кашу мы не превращаем в десять фейковых задач.",
      },
      {
        speaker: "devil",
        targetSelector: ".tab-btn.tab-stats, .planner-events-panel",
        eyebrow: "Прогресс",
        title: "Система оставляет следы.",
        body: "В прогрессе видны завершения, streak, история задач и действия ангела, чёртика или системы.",
        angel: "Ты видишь доказательство движения.",
        devil: "А если я что-то похороню, ты узнаешь.",
      },
    ],
  },
};

function OnboardingOverlay({ open, onClose, demoMode = false, language: controlledLanguage, onLanguageChange }) {
  const [localLanguage, setLocalLanguage] = useState("en");
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const language = controlledLanguage === "ru" || controlledLanguage === "en" ? controlledLanguage : localLanguage;
  const copy = ONBOARDING_COPY[language] || ONBOARDING_COPY.en;
  const steps = copy.steps;
  const step = steps[stepIndex] || steps[0];
  const isLast = stepIndex >= steps.length - 1;
  const isDemoIntro = demoMode && stepIndex === 0;
  const activeTargetSelector = isDemoIntro ? null : step.targetSelector;
  const showWelcomeMascotVideo = demoMode && stepIndex === 0;

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  const setLanguage = (nextLanguage) => {
    if (typeof onLanguageChange === "function") {
      onLanguageChange(nextLanguage);
      return;
    }
    setLocalLanguage(nextLanguage);
  };

  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add("onboarding-companions-front");
    return () => {
      document.body.classList.remove("onboarding-companions-front");
    };
  }, [open]);

  useEffect(() => {
    if (!open || !activeTargetSelector) {
      setTargetRect(null);
      return undefined;
    }

    let frame = 0;
    let followupTimer = 0;
    let settleTimer = 0;
    let didAutoScroll = false;

    const readTarget = () => {
      const target = document.querySelector(activeTargetSelector);
      if (!target) {
        setTargetRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const isMobileViewport = window.innerWidth <= 760;
      const mobileCardHeight = Math.min(330, Math.max(238, Math.floor(window.innerHeight * 0.38)));
      const mobileCardTop = window.innerHeight - 148 - mobileCardHeight;
      const topLimit = isMobileViewport ? 76 : 84;
      const bottomLimit = isMobileViewport
        ? Math.max(topLimit + 120, mobileCardTop - 24)
        : window.innerHeight - 150;
      const shouldScroll = !didAutoScroll && (rect.top < topLimit || rect.bottom > bottomLimit);
      if (shouldScroll) {
        didAutoScroll = true;
        if (isMobileViewport) {
          const desiredTop = Math.max(topLimit, Math.min(104, bottomLimit - rect.height));
          window.scrollBy({ top: rect.top - desiredTop, behavior: "auto" });
        } else {
          target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }
      }

      setTargetRect({
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
    };

    const scheduleRead = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(readTarget);
    };

    scheduleRead();
    followupTimer = window.setTimeout(scheduleRead, 420);
    settleTimer = window.setTimeout(scheduleRead, 920);
    window.addEventListener("resize", scheduleRead);
    window.addEventListener("scroll", scheduleRead, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(followupTimer);
      window.clearTimeout(settleTimer);
      window.removeEventListener("resize", scheduleRead);
      window.removeEventListener("scroll", scheduleRead, true);
    };
  }, [activeTargetSelector, open, stepIndex]);

  if (!open) return null;

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const targetPadding = 12;
  const targetHighlightStyle = targetRect
    ? {
        top: `${Math.max(8, targetRect.top - targetPadding)}px`,
        left: `${Math.max(8, targetRect.left - targetPadding)}px`,
        width: `${Math.min(window.innerWidth - 16, targetRect.width + targetPadding * 2)}px`,
        height: `${targetRect.height + targetPadding * 2}px`,
      }
    : null;
  const isMobileOnboarding = viewportWidth <= 760;
  const preferredCardWidth = isDemoIntro
    ? Math.min(920, viewportWidth - 32)
    : Math.min(680, viewportWidth - 32);
  const estimatedCardHeight = isMobileOnboarding
    ? Math.min(330, Math.max(238, Math.floor(viewportHeight * 0.38)))
    : isDemoIntro
      ? Math.min(520, viewportHeight - 64)
      : Math.min(360, viewportHeight - 48);
  const targetGap = 24;
  const safeMargin = 16;
  const mascotReserve = isMobileOnboarding ? 148 : 176;
  const usableBottom = Math.max(safeMargin + estimatedCardHeight, viewportHeight - mascotReserve);
  const sideMinWidth = Math.min(420, preferredCardWidth);

  let cardPlacement = "center";
  let cardStyle = {
    width: `${preferredCardWidth}px`,
    maxHeight: `${estimatedCardHeight}px`,
    left: `${clamp((viewportWidth - preferredCardWidth) / 2, safeMargin, viewportWidth - preferredCardWidth - safeMargin)}px`,
    top: `${clamp((usableBottom - estimatedCardHeight) / 2, safeMargin, usableBottom - estimatedCardHeight - safeMargin)}px`,
  };
  let arrowStyle = null;

  if (targetRect) {
    const leftSpace = targetRect.left - targetGap - safeMargin;
    const rightSpace = viewportWidth - targetRect.right - targetGap - safeMargin;
    const aboveSpace = targetRect.top - targetGap - safeMargin;
    const belowSpace = usableBottom - targetRect.bottom - targetGap - safeMargin;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    if (isMobileOnboarding) {
      cardPlacement = "mobile-bottom";
      arrowStyle = null;
    } else if (viewportWidth > 760 && rightSpace >= sideMinWidth) {
      cardPlacement = "right";
      const width = Math.min(620, rightSpace);
      cardStyle = {
        width: `${width}px`,
        maxHeight: `${Math.min(estimatedCardHeight, usableBottom - safeMargin * 2)}px`,
        left: `${targetRect.right + targetGap}px`,
        top: `${clamp(targetCenterY - estimatedCardHeight / 2, safeMargin, usableBottom - estimatedCardHeight - safeMargin)}px`,
      };
      arrowStyle = {
        left: `${clamp(targetRect.right + 8, safeMargin, viewportWidth - 86)}px`,
        top: `${clamp(targetCenterY - 36, safeMargin, usableBottom - 86)}px`,
        "--onboarding-arrow-rotate": "180deg",
      };
    } else if (viewportWidth > 760 && leftSpace >= sideMinWidth) {
      cardPlacement = "left";
      const width = Math.min(620, leftSpace);
      cardStyle = {
        width: `${width}px`,
        maxHeight: `${Math.min(estimatedCardHeight, usableBottom - safeMargin * 2)}px`,
        left: `${targetRect.left - targetGap - width}px`,
        top: `${clamp(targetCenterY - estimatedCardHeight / 2, safeMargin, usableBottom - estimatedCardHeight - safeMargin)}px`,
      };
      arrowStyle = {
        left: `${clamp(targetRect.left - 80, safeMargin, viewportWidth - 86)}px`,
        top: `${clamp(targetCenterY - 36, safeMargin, usableBottom - 86)}px`,
        "--onboarding-arrow-rotate": "0deg",
      };
    } else if (belowSpace >= estimatedCardHeight + targetGap || belowSpace >= aboveSpace) {
      cardPlacement = "bottom";
      const width = Math.min(preferredCardWidth, viewportWidth - safeMargin * 2);
      const height = Math.min(estimatedCardHeight, Math.max(220, usableBottom - targetRect.bottom - targetGap - safeMargin));
      cardStyle = {
        width: `${width}px`,
        maxHeight: `${height}px`,
        left: `${clamp(targetCenterX - width / 2, safeMargin, viewportWidth - width - safeMargin)}px`,
        top: `${clamp(targetRect.bottom + targetGap, safeMargin, usableBottom - height - safeMargin)}px`,
      };
      arrowStyle = {
        left: `${clamp(targetCenterX - 36, safeMargin, viewportWidth - 86)}px`,
        top: `${clamp(targetRect.bottom + 8, safeMargin, usableBottom - 86)}px`,
        "--onboarding-arrow-rotate": "-90deg",
      };
    } else {
      cardPlacement = "top";
      const width = Math.min(preferredCardWidth, viewportWidth - safeMargin * 2);
      const height = Math.min(estimatedCardHeight, Math.max(220, targetRect.top - targetGap - safeMargin));
      cardStyle = {
        width: `${width}px`,
        maxHeight: `${height}px`,
        left: `${clamp(targetCenterX - width / 2, safeMargin, viewportWidth - width - safeMargin)}px`,
        top: `${clamp(targetRect.top - targetGap - height, safeMargin, usableBottom - height - safeMargin)}px`,
      };
      arrowStyle = {
        left: `${clamp(targetCenterX - 36, safeMargin, viewportWidth - 86)}px`,
        top: `${clamp(targetRect.top - 80, safeMargin, usableBottom - 86)}px`,
        "--onboarding-arrow-rotate": "90deg",
      };
    }
  }

  const goNext = () => {
    if (isLast) {
      onClose?.();
      return;
    }
    setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  };

  const hideAngelBubble = step.speaker === "devil";
  const hideDevilBubble = step.speaker === "angel" || (isMobileOnboarding && step.speaker === "both");
  const showCompanionBubbles = !isDemoIntro;

  return (
    <div className={`onboarding-overlay place-${cardPlacement}${isDemoIntro ? " is-demo-intro" : ""}`} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      {targetHighlightStyle && (
        <>
          <div className="onboarding-target-glow" style={targetHighlightStyle} aria-hidden="true" />
          {arrowStyle && <div className="onboarding-red-arrow" style={arrowStyle} aria-hidden="true" />}
        </>
      )}
      {showCompanionBubbles && (
        <div className="onboarding-companion-bubbles" aria-hidden="true">
          <div className={`onboarding-corner-bubble angel ${hideAngelBubble ? "is-secondary" : ""}`}>
            <b>{step.angel}</b>
          </div>
          <div className={`onboarding-corner-bubble devil ${hideDevilBubble ? "is-secondary" : ""}`}>
            <b>{step.devil}</b>
          </div>
        </div>
      )}
      <div className={`onboarding-card animated-fade-in placement-${cardPlacement}${isDemoIntro ? " is-demo-intro" : ""}`} style={cardStyle}>
        <div className="onboarding-toolbar">
          <div className="onboarding-language" aria-label="Language">
            <button
              type="button"
              className={language === "en" ? "is-active" : ""}
              onClick={() => setLanguage("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={language === "ru" ? "is-active" : ""}
              onClick={() => setLanguage("ru")}
            >
              RU
            </button>
          </div>
          <button type="button" className="onboarding-close" onClick={onClose}>
            {copy.close}
          </button>
        </div>

        <div className="onboarding-body">
          {showWelcomeMascotVideo && (
            <div className="onboarding-welcome-mascot" aria-hidden="true">
              <video
                src="/mascots/angel_celebrate_short.mp4"
                poster="/mascots/angel_celebrate.png"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            </div>
          )}
          {demoMode && stepIndex === 0 && (
            <div className="onboarding-demo-badge">
              <strong>{copy.demoBadge}</strong>
              <span>{copy.demoNote}</span>
              <em>{copy.demoTry}</em>
            </div>
          )}
          <div className="onboarding-copy">
            <div className="onboarding-eyebrow">
              {step.eyebrow} · {copy.progress} {stepIndex + 1}/{steps.length}
            </div>
            <h2 id="onboarding-title">{step.title}</h2>
            <p>{step.body}</p>
          </div>
        </div>

        <div className="onboarding-footer">
          <div className="onboarding-dots" aria-hidden="true">
            {steps.map((_, index) => (
              <span key={index} className={index === stepIndex ? "is-active" : ""} />
            ))}
          </div>
          <div className="onboarding-actions">
            <button
              type="button"
              className="onboarding-btn secondary"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0}
            >
              {copy.back}
            </button>
            <button type="button" className="onboarding-btn primary" onClick={goNext}>
              {isLast ? copy.finish : copy.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingOverlay;
