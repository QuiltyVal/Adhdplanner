// src/App.js
import React, { useState, useEffect, useCallback, useRef } from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, pointerWithin, closestCenter } from "@dnd-kit/core";
import { useLocation, useNavigate } from "react-router-dom";
import TaskColumn from "./TaskColumn";
import LogoutButton from "./LogoutButton";
import Companions from "./Companions";
import LoadingScreen from "./LoadingScreen";
import AngelLabScreen from "./AngelLabScreen";
import PlannerStatusBar from "./PlannerStatusBar";
import RescueOverlay from "./RescueOverlay";
import TodayMissionPanel from "./TodayMissionPanel";
import OnboardingOverlay from "./OnboardingOverlay";
import ApusPlannerShell from "./apus/ApusPlannerShell";
import angelLabCat from "./assets/angel-lab-cat.png";
import { formatPlannerReportMessage } from "./plannerReportMessages";
import { buildPlannerReportPanel, normalizeReportItemEvent } from "./plannerReportPanel";
import { normalizeBootstrapPlannerEvents } from "./plannerEventContract";
import { createGuestPlannerGateways } from "./guestPlannerGateway";
import {
  addGuestTaskTime,
  addGuestSubtask,
  appendGuestUniqueSubtasks,
  completeGuestTask,
  createGuestTask,
  deleteGuestSubtask,
  editGuestSubtask,
  editGuestTaskTitle,
  moveGuestTaskToCemetery,
  reopenGuestTask,
  setGuestHeatZone,
  toggleGuestTaskBoolean,
  toggleGuestToday,
  toggleGuestSubtask,
  touchGuestTask,
  updateGuestTaskFields,
} from "./guestTaskMutations";
import {
  moveGuestTasksToCemetery,
  removeGuestTasksById,
  reorderGuestActiveTasks,
} from "./guestBulkMutations";
import {
  createGuestTaskSnapshot,
  restoreGuestTaskSnapshot,
} from "./guestSnapshotMutations";
import {
  ackPlannerReportItems,
  runPlannerBootstrap,
  runPlannerClientCommand,
  runPlannerDebug,
} from "./plannerCommandClient";
import { PLANNER_ACTIONS, PLANNER_CLIENT_MODES } from "./plannerCommandContract";
import { applyPlannerClientUpdate, buildPlannerClientUpdate, normalizePlannerReportFeed } from "./plannerClientStateAdapter";
import {
  loadCloudCache as loadStoredCloudCache,
  loadGuestPlannerState,
  loadPulseState as loadStoredPulseState,
  saveCloudCache as saveStoredCloudCache,
  saveGuestPlannerState,
  savePulseState as saveStoredPulseState,
} from "./plannerLocalStorage";
import {
  getNextTaskOrder,
  resolveTaskOrderValue,
  sortTasksByOrder,
} from "./taskOrderUtils";
import {
  mergeTaskLists as mergePlannerTaskLists,
  mergeAuthoritativeTaskLists as mergeAuthoritativePlannerTaskLists,
} from "./plannerTaskMerge.mjs";
import {
  subscribeToTasks,
  subscribeToPlannerEvents,
  subscribeToReportItems,
  getUserScore,
  migrateTasksToSubcollection,
  loadTaskSnapshots,
  saveTaskSnapshot,
} from "./firestoreUtils";
import { auth } from "./firebase";
import {
  onAuthStateChanged,
  getRedirectResult,
  GoogleAuthProvider,
} from "firebase/auth";
import "./apus-fonts.css";
import "./App.css";
import { applyDemoTranslations } from "./demoI18n";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TASK_HEAT = 35;
const TOUCH_HEAT_BONUS = 12;
const SUBTASK_COMPLETION_CAP = 18;
const URGENCY_DECAY_WINDOWS_MS = {
  low: 21 * DAY_MS,
  medium: 14 * DAY_MS,
  high: 10 * DAY_MS,
};
const MIN_LOADING_MS = 350;
const NUDGE_INTERVAL_MS = 20 * 60 * 1000;
const PULSE_STORAGE_PREFIX = "adhd_planner_pulse";
const CLOUD_CACHE_PREFIX = "adhd_planner_cloud_cache";
const CLOUD_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const LOCAL_PENDING_SYNC_TTL_MS = 15 * 1000;
const pendingCloudRemovalTimestamps = new Map();
const pendingCloudStatusIntents = new Map();
const OVERDUE_COMPLETION_REWARD_TIERS = [
  { days: 7, bonus: 10, tier: "legendary" },
  { days: 3, bonus: 6, tier: "heroic" },
  { days: 1, bonus: 3, tier: "late" },
];
const DEVIL_AUTO_CLEAN_THRESHOLD = 5;   // purgatory tasks before devil intervenes
const DEVIL_AUTO_CLEAN_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between auto-cleans
const PLANNER_EVENT_LIMIT = 25;
const USE_APUS_SHELL = true;
const DEMO_USER_ID = "guest_demo_portfolio";
const DEMO_TASKS_KEY = "adhd_demo_planner_tasks";
const DEMO_SCORE_KEY = "adhd_demo_planner_score";
const DEMO_USER = {
  id: DEMO_USER_ID,
  first_name: "Demo",
  last_name: "Recruiter",
  isDemo: true,
};
const EXECUTIVE_STATE_STORAGE_KEY = "adhd_planner_executive_state";
const EXECUTIVE_STATE_LOG_KEY = "adhd_planner_executive_state_log";
const EXECUTIVE_STATE_ORDER = ["panic", "fog", "stuck", "hyperfocus", "normal"];
const EXECUTIVE_STATE_COPY = {
  panic: {
    icon: "SOS",
    en: {
      label: "Panic",
      title: "Panic mode",
      happening: "Your brain is trying to solve everything at once.",
      forbidden: ["Do not reorganize the whole planner.", "Do not delete or bury tasks.", "Do not negotiate with the full list."],
      allowed: ["Start one rescue step.", "Park today's pressure.", "Let the full planner wait."],
      nextStep: "Open rescue with the current mission.",
    },
    ru: {
      label: "Паника",
      title: "Режим паники",
      happening: "Мозг пытается решить всё сразу и перегружает исполнительный контур.",
      forbidden: ["Не перестраивать весь планер.", "Не удалять и не хоронить задачи.", "Не спорить со всем списком сразу."],
      allowed: ["Открыть один rescue-шаг.", "Снять давление сегодняшних задач.", "Оставить полный планер ниже."],
      nextStep: "Открыть rescue по текущей миссии.",
    },
  },
  fog: {
    icon: "FOG",
    en: {
      label: "Fog",
      title: "Fog mode",
      happening: "The full list is too noisy to parse right now.",
      forbidden: ["Do not scan every task.", "Do not tune deadlines.", "Do not open every world."],
      allowed: ["Use the mission summary.", "Pick from one safe step.", "Park today pressure if needed."],
      nextStep: "Look only at the mission and first open step.",
    },
    ru: {
      label: "Туман",
      title: "Режим тумана",
      happening: "Полный список сейчас слишком шумный, мозгу трудно его разобрать.",
      forbidden: ["Не сканировать все задачи.", "Не настраивать дедлайны.", "Не открывать все разделы."],
      allowed: ["Смотреть только на mission.", "Выбрать один безопасный шаг.", "При необходимости запарковать давление дня."],
      nextStep: "Смотри только на задачу дня и первый открытый шаг.",
    },
  },
  stuck: {
    icon: "STUCK",
    en: {
      label: "Stuck",
      title: "Stuck mode",
      happening: "You have a target, but starting or continuing is blocked.",
      forbidden: ["Do not find a better task.", "Do not add a bigger plan.", "Do not punish yourself for freezing."],
      allowed: ["Start rescue.", "Do one crooked step.", "Record movement, not perfection."],
      nextStep: "Tap rescue and do one visible microstep.",
    },
    ru: {
      label: "Застряла",
      title: "Режим застревания",
      happening: "Цель есть, но старт или продолжение заблокированы.",
      forbidden: ["Не искать задачу получше.", "Не добавлять большой план.", "Не добивать себя за фриз."],
      allowed: ["Открыть rescue.", "Сделать один кривой шаг.", "Засчитать движение, не идеальность."],
      nextStep: "Нажми rescue и сделай один видимый микрошаг.",
    },
  },
  hyperfocus: {
    icon: "FOCUS",
    en: {
      label: "Hyperfocus",
      title: "Hyperfocus mode",
      happening: "Momentum is high, but scope can expand without consent.",
      forbidden: ["Do not open ten new fronts.", "Do not perfect the whole system.", "Do not skip food, rest, or boundaries."],
      allowed: ["Capture new ideas lightly.", "Finish the current loop.", "Park everything that is not the current lane."],
      nextStep: "Keep one lane active and park the rest.",
    },
    ru: {
      label: "Гиперфокус",
      title: "Режим гиперфокуса",
      happening: "Энергия высокая, но объём может расползтись без разрешения.",
      forbidden: ["Не открывать десять новых фронтов.", "Не полировать всю систему.", "Не пропускать еду, отдых и границы."],
      allowed: ["Легко записывать новые идеи.", "Закрыть текущую петлю.", "Парковать всё, что не относится к текущей линии."],
      nextStep: "Оставь одну линию активной, остальное припаркуй.",
    },
  },
  normal: {
    icon: "OK",
    en: {
      label: "Normal",
      title: "Normal planning",
      happening: "You can use the full planner without it becoming harmful.",
      forbidden: ["Do not overfill today.", "Do not turn planning into avoidance."],
      allowed: ["Use task worlds.", "Tune tasks.", "Choose priorities calmly."],
      nextStep: "Use the full planner and keep today under three tasks.",
    },
    ru: {
      label: "Норм",
      title: "Обычное планирование",
      happening: "Можно пользоваться полным планером без вредного перегруза.",
      forbidden: ["Не переполнять сегодня.", "Не превращать планирование в избегание."],
      allowed: ["Использовать миры задач.", "Настраивать задачи.", "Спокойно выбирать приоритеты."],
      nextStep: "Пользуйся полным планером и держи сегодня до трёх задач.",
    },
  },
};

const getExecutiveStateLocale = (language = "ru") => (language === "en" ? "en" : "ru");

const readStoredExecutiveState = () => {
  if (typeof window === "undefined") return "";
  try {
    const stored = localStorage.getItem(EXECUTIVE_STATE_STORAGE_KEY);
    return EXECUTIVE_STATE_COPY[stored] ? stored : "";
  } catch (error) {
    console.warn("[Planner] Не удалось прочитать executive state:", error);
    return "";
  }
};

const persistExecutiveState = (state) => {
  if (typeof window === "undefined" || !EXECUTIVE_STATE_COPY[state]) return;
  try {
    localStorage.setItem(EXECUTIVE_STATE_STORAGE_KEY, state);
  } catch (error) {
    console.warn("[Planner] Не удалось сохранить executive state:", error);
  }
};

const appendExecutiveStateLog = (entry = {}) => {
  if (typeof window === "undefined") return;
  try {
    const current = JSON.parse(localStorage.getItem(EXECUTIVE_STATE_LOG_KEY) || "[]");
    const next = [
      {
        id: `executive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        at: Date.now(),
        ...entry,
      },
      ...(Array.isArray(current) ? current : []),
    ].slice(0, 30);
    localStorage.setItem(EXECUTIVE_STATE_LOG_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("[Planner] Не удалось записать executive state log:", error);
  }
};

const isRescueFirstExecutiveState = (state) => ["panic", "fog", "stuck"].includes(state);

const EXECUTIVE_STATE_PROTOCOL_COPY = {
  panic: {
    en: {
      label: "Emergency brake",
      summary: "No big decisions. Reduce danger first.",
      steps: ["Stop deciding.", "Drop the full list.", "Do one two-minute rescue move."],
      primary: "Start 2-min rescue",
      secondary: "Park pressure",
    },
    ru: {
      label: "Аварийный тормоз",
      summary: "Никаких больших решений. Сначала снижаем опасность.",
      steps: ["Остановить решения.", "Убрать полный список.", "Сделать один rescue-шаг на 2 минуты."],
      primary: "Rescue на 2 минуты",
      secondary: "Снять давление",
    },
  },
  fog: {
    en: {
      label: "Low-visibility mode",
      summary: "The problem is choice noise, not laziness.",
      steps: ["Do not scan everything.", "Use only the current suggestion.", "If still blurry, park today pressure."],
      primary: "Use safe suggestion",
      secondary: "Park pressure",
    },
    ru: {
      label: "Режим плохой видимости",
      summary: "Проблема не в лени, а в шуме выбора.",
      steps: ["Не сканировать всё.", "Использовать только текущую подсказку.", "Если всё мутно, снять давление дня."],
      primary: "Взять безопасную подсказку",
      secondary: "Снять давление",
    },
  },
  stuck: {
    en: {
      label: "Activation bridge",
      summary: "You already have a target. Lower the start cost.",
      steps: ["Keep the same task.", "Use the first visible microstep.", "Count movement, not perfection."],
      primary: "Start microstep rescue",
      secondary: "Park pressure",
    },
    ru: {
      label: "Мостик к старту",
      summary: "Цель уже есть. Нужно снизить цену входа.",
      steps: ["Оставить ту же задачу.", "Взять первый видимый микрошаг.", "Засчитать движение, не идеальность."],
      primary: "Начать микрошаг",
      secondary: "Снять давление",
    },
  },
  hyperfocus: {
    en: {
      label: "Scope guard",
      summary: "Energy is available. Protect it from scope creep.",
      steps: ["Stay in one lane.", "Do not open new fronts.", "Park everything outside the current loop."],
      primary: "Park other pressure",
      secondary: "Show full planner",
    },
    ru: {
      label: "Ограничитель масштаба",
      summary: "Энергия есть. Защищаем её от расползания.",
      steps: ["Остаться в одной линии.", "Не открывать новые фронты.", "Запарковать всё вне текущей петли."],
      primary: "Запарковать лишнее",
      secondary: "Показать планер",
    },
  },
  normal: {
    en: {
      label: "Full planner",
      summary: "Planning is safe. Use the complete system.",
      steps: ["Review the worlds.", "Keep today under three tasks.", "Tune calmly if needed."],
      primary: "Show full planner",
      secondary: "Park pressure",
    },
    ru: {
      label: "Полный планер",
      summary: "Планирование безопасно. Можно пользоваться всей системой.",
      steps: ["Посмотреть миры задач.", "Держать сегодня до трёх задач.", "Спокойно настроить, если нужно."],
      primary: "Показать планер",
      secondary: "Снять давление",
    },
  },
};

function ExecutiveDemoStoryLayer({ language, onSelectState, onShowPlanner }) {
  const isEnglish = language === "en";
  return (
    <section className="executive-demo-story glass-panel">
      <div className="executive-demo-story-copy">
        <p className="executive-state-kicker">
          {isEnglish ? "Portfolio demo" : "Демо для портфолио"}
        </p>
        <h2>
          {isEnglish
            ? "Not a todo list. An external executive function layer."
            : "Не todo list. Внешний исполнительный контур."}
        </h2>
        <p>
          {isEnglish
            ? "The planner first asks what state your brain is in, then changes what it shows and allows."
            : "Планер сначала спрашивает, в каком состоянии мозг, и только потом меняет то, что показывает и разрешает."}
        </p>
      </div>
      <div className="executive-demo-story-points">
        <span>{isEnglish ? "Panic hides overload." : "Паника прячет перегруз."}</span>
        <span>{isEnglish ? "Stuck opens rescue." : "Застревание открывает rescue."}</span>
        <span>{isEnglish ? "Park keeps tasks alive." : "Парковка не убивает задачи."}</span>
      </div>
      <div className="executive-demo-story-actions">
        <button type="button" onClick={() => onSelectState("stuck")}>
          {isEnglish ? "Try stuck mode" : "Показать застревание"}
        </button>
        <button type="button" onClick={onShowPlanner}>
          {isEnglish ? "Open full planner" : "Открыть полный планер"}
        </button>
      </div>
    </section>
  );
}

function getAngelEntryExecutiveState(session = {}) {
  const mode = String(session.mode || "").toLowerCase();
  const trigger = String(session.trigger || "").toLowerCase();
  if (trigger.includes("panic")) return "panic";
  if (mode === "brain_dump") return "fog";
  if (mode === "tiny_focus") return "normal";
  if (mode === "not_your_move_checkin") return "normal";
  if (mode === "diagnose_resistance") return "stuck";
  if (mode === "clarify_task") return "stuck";
  if (mode === "make_it_smaller") return "stuck";
  if (mode === "rescue_me") return "stuck";
  return "stuck";
}

const ANGEL_ENTRY_COOLDOWN_STORAGE_KEY = "apus_angel_entry_cooldowns_v1";
const ANGEL_ENTRY_RESISTANCE_STORAGE_KEY = "apus_angel_entry_resistance_v1";
const QUEST_RELATION_MEMORY_STORAGE_KEY = "apus_quest_relation_memory_v1";
const MISSION_BUBBLE_COOLDOWN_STORAGE_KEY = "apus_mission_bubble_cooldowns_v1";
const COMPANION_PROMPT_QUIET_UNTIL_STORAGE_KEY = "apus_companion_prompt_quiet_until_v1";
const ANGEL_OPENING_MOVE_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const NOT_YOUR_MOVE_PRESSURE_HOLD_STORAGE_KEY = "apus_not_your_move_pressure_hold_v1";
const ANGEL_ENTRY_DISMISS_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const ANGEL_ENTRY_SHOW_PLANNER_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const ANGEL_ENTRY_CHECKIN_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const ANGEL_ENTRY_RESISTANCE_THRESHOLD = 2;

function getAngelEntryCooldownKey(session = {}) {
  if (!session || typeof session !== "object") return "";
  const mode = String(session.mode || session.trigger || "entry").trim().toLowerCase();
  const taskId = String(session.taskId || session.id || "").trim();
  if (!taskId) return "";
  return `${mode}:${taskId}`;
}

function getAngelEntryResistanceKey(session = {}) {
  if (!session || typeof session !== "object") return "";
  const taskId = String(session.taskId || "").trim();
  if (!taskId) return "";
  return `task:${taskId}`;
}

function getQuestRelationMemoryKey(session = {}) {
  if (!session || typeof session !== "object") return "";
  const taskId = String(session.taskId || session.id || "").trim();
  if (!taskId) return "";
  return `task:${taskId}`;
}

function shouldSkipAngelEntryCooldown(session = {}) {
  const id = String(session.id || "").toLowerCase();
  const source = String(session.source || "").toLowerCase();
  return id.startsWith("forced_") || source.includes("manual") || source.includes("preview");
}

function shouldSkipAngelEntryResistance(session = {}) {
  if (shouldSkipAngelEntryCooldown(session)) return true;
  const mode = String(session.mode || "").toLowerCase();
  const trigger = String(session.trigger || "").toLowerCase();
  return mode === "diagnose_resistance" ||
    mode === "not_your_move_checkin" ||
    trigger === "not_your_move_checkin_due" ||
    !getAngelEntryResistanceKey(session);
}

function readAngelEntryCooldowns(now = Date.now()) {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ANGEL_ENTRY_COOLDOWN_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const active = {};
    Object.entries(parsed).forEach(([key, value]) => {
      const until = Number(value);
      if (key && Number.isFinite(until) && until > now) active[key] = until;
    });
    if (Object.keys(active).length !== Object.keys(parsed).length) {
      window.localStorage.setItem(ANGEL_ENTRY_COOLDOWN_STORAGE_KEY, JSON.stringify(active));
    }
    return active;
  } catch (_) {
    return {};
  }
}

function readAngelEntryResistance() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ANGEL_ENTRY_RESISTANCE_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function readQuestRelationMemory() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUEST_RELATION_MEMORY_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function readCompanionPromptQuietUntil(now = Date.now()) {
  if (typeof window === "undefined" || !window.localStorage) return 0;
  try {
    const until = Number(window.localStorage.getItem(COMPANION_PROMPT_QUIET_UNTIL_STORAGE_KEY) || 0);
    if (!Number.isFinite(until) || until <= now) {
      window.localStorage.removeItem(COMPANION_PROMPT_QUIET_UNTIL_STORAGE_KEY);
      return 0;
    }
    return until;
  } catch (_) {
    return 0;
  }
}

function rememberCompanionPromptQuietUntil(until = 0) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const normalizedUntil = Number(until || 0);
  try {
    if (!Number.isFinite(normalizedUntil) || normalizedUntil <= Date.now()) {
      window.localStorage.removeItem(COMPANION_PROMPT_QUIET_UNTIL_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(COMPANION_PROMPT_QUIET_UNTIL_STORAGE_KEY, String(normalizedUntil));
  } catch (_) {
    // Comfort guard only.
  }
}

function readNotYourMovePressureHold(now = Date.now()) {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(NOT_YOUR_MOVE_PRESSURE_HOLD_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    const until = Number(parsed.until || 0);
    if (!Number.isFinite(until) || until <= now) {
      window.localStorage.removeItem(NOT_YOUR_MOVE_PRESSURE_HOLD_STORAGE_KEY);
      return null;
    }
    return {
      taskId: String(parsed.taskId || "").trim(),
      taskTitle: String(parsed.taskTitle || "").trim(),
      until,
    };
  } catch (_) {
    return null;
  }
}

function rememberNotYourMovePressureHold({ taskId = "", taskTitle = "", until = 0 } = {}) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const normalizedUntil = Number(until || 0);
  const normalizedTaskId = String(taskId || "").trim();
  const normalizedTaskTitle = String(taskTitle || "").trim();
  try {
    if ((!normalizedTaskId && !normalizedTaskTitle) || !Number.isFinite(normalizedUntil) || normalizedUntil <= Date.now()) {
      window.localStorage.removeItem(NOT_YOUR_MOVE_PRESSURE_HOLD_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(NOT_YOUR_MOVE_PRESSURE_HOLD_STORAGE_KEY, JSON.stringify({
      taskId: normalizedTaskId,
      taskTitle: normalizedTaskTitle,
      until: normalizedUntil,
    }));
  } catch (_) {
    // Pressure comfort guard only.
  }
}

function clearNotYourMovePressureHold() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(NOT_YOUR_MOVE_PRESSURE_HOLD_STORAGE_KEY);
  } catch (_) {
    // Pressure comfort guard only.
  }
}

function resetAngelComfortMemory() {
  if (typeof window === "undefined" || !window.localStorage) return;
  [
    ANGEL_ENTRY_COOLDOWN_STORAGE_KEY,
    ANGEL_ENTRY_RESISTANCE_STORAGE_KEY,
    QUEST_RELATION_MEMORY_STORAGE_KEY,
    MISSION_BUBBLE_COOLDOWN_STORAGE_KEY,
    COMPANION_PROMPT_QUIET_UNTIL_STORAGE_KEY,
    NOT_YOUR_MOVE_PRESSURE_HOLD_STORAGE_KEY,
  ].forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (_) {
      // Ignore localStorage failures. This is a temporary manual QA helper only.
    }
  });
}

function normalizeDemoResetScenario(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isQuestLoopNotNowThresholdScenario(scenario = "") {
  const normalized = normalizeDemoResetScenario(scenario);
  return normalized === "quest-loop-not-now-threshold" ||
    normalized === "quest-loop-not-now-check" ||
    normalized === "not-now-threshold";
}

function isQuestRelationDirectorPrimaryScenario(scenario = "") {
  return Boolean(getQuestRelationDirectorPrimaryScenarioSignal(scenario));
}

function getQuestRelationDirectorPrimaryScenarioSignal(scenario = "") {
  const normalized = normalizeDemoResetScenario(scenario);
  if (
    normalized === "quest-relation-director-not-my-move-confirmed" ||
    normalized === "quest-director-not-my-move-confirmed" ||
    normalized === "director-not-my-move-confirmed"
  ) {
    return "not_my_move";
  }
  if (
    normalized === "quest-relation-director-primary" ||
    normalized === "quest-director-primary" ||
    normalized === "director-primary" ||
    normalized === "quest-relation-director-too-big" ||
    normalized === "quest-director-too-big"
  ) {
    return "too_big";
  }
  if (
    normalized === "quest-relation-director-unclear" ||
    normalized === "quest-director-unclear" ||
    normalized === "director-unclear"
  ) {
    return "unclear";
  }
  if (
    normalized === "quest-relation-director-not-my-move" ||
    normalized === "quest-director-not-my-move" ||
    normalized === "director-not-my-move"
  ) {
    return "not_my_move";
  }
  if (
    normalized === "quest-relation-director-kill" ||
    normalized === "quest-director-kill" ||
    normalized === "director-kill"
  ) {
    return "kill_without_guilt";
  }
  if (
    normalized === "quest-relation-director-not-now" ||
    normalized === "quest-director-not-now" ||
    normalized === "director-not-now"
  ) {
    return "not_now";
  }
  if (
    normalized === "quest-relation-director-rescue-later" ||
    normalized === "quest-director-rescue-later" ||
    normalized === "director-rescue-later"
  ) {
    return "rescue_later";
  }
  if (
    normalized === "quest-relation-director-microstep-completed" ||
    normalized === "quest-relation-director-moved" ||
    normalized === "quest-director-moved" ||
    normalized === "director-moved"
  ) {
    return "microstep_completed";
  }
  return "";
}

function isQuestRelationDirectorConfirmedNotYourMoveScenario(scenario = "") {
  const normalized = normalizeDemoResetScenario(scenario);
  return normalized === "quest-relation-director-not-my-move-confirmed" ||
    normalized === "quest-director-not-my-move-confirmed" ||
    normalized === "director-not-my-move-confirmed";
}

function getDemoTaskTitle(task = {}) {
  return String(task?.text || task?.title || task?.taskText || "").trim();
}

function seedAngelEntryResistanceMemory(session = {}, count = ANGEL_ENTRY_RESISTANCE_THRESHOLD - 1) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const key = getAngelEntryResistanceKey(session);
  if (!key) return;
  const nextCount = Math.max(0, Number(count) || 0);
  const resistance = readAngelEntryResistance();
  resistance[key] = {
    count: nextCount,
    taskId: String(session.taskId || ""),
    lastMode: String(session.mode || ""),
    lastTrigger: String(session.trigger || ""),
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(ANGEL_ENTRY_RESISTANCE_STORAGE_KEY, JSON.stringify(resistance));
  } catch (_) {
    // Demo QA memory only.
  }
}

function seedQuestRelationMemorySignal(session = {}, signal = "not_now", count = ANGEL_ENTRY_RESISTANCE_THRESHOLD - 1, metadata = {}) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const key = getQuestRelationMemoryKey(session);
  const normalizedSignal = String(signal || "").trim().toLowerCase();
  if (!key || !normalizedSignal) return;
  const nextCount = Math.max(1, Number(count) || 1);
  const memory = readQuestRelationMemory();
  memory[key] = {
    taskId: String(session.taskId || ""),
    taskTitle: String(session.taskTitle || session.taskText || ""),
    counts: {
      [normalizedSignal]: nextCount,
    },
    lastSignal: normalizedSignal,
    lastStrategy: getQuestRelationStrategy(normalizedSignal),
    lastMode: String(session.mode || ""),
    lastTrigger: String(session.trigger || ""),
    lastSource: String(session.source || "demo_reset"),
    lastOptionLabel: "",
    ...metadata,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(QUEST_RELATION_MEMORY_STORAGE_KEY, JSON.stringify(memory));
  } catch (_) {
    // Demo QA memory only.
  }
}

function seedDemoQuestLoopScenarioMemory(tasks = [], scenario = "") {
  const directorScenarioSignal = getQuestRelationDirectorPrimaryScenarioSignal(scenario);
  const confirmedNotYourMoveScenario = isQuestRelationDirectorConfirmedNotYourMoveScenario(scenario);
  if (!isQuestLoopNotNowThresholdScenario(scenario) && !directorScenarioSignal) return;
  const targetTask = tasks.find((task) => String(task.id) === "demo-task-portfolio-demo") ||
    tasks.find((task) => String(task.status || "active") === "active") ||
    tasks[0];
  if (!targetTask?.id) return;
  const session = {
    id: `today_mission_${targetTask.id}`,
    taskId: String(targetTask.id),
    taskTitle: getDemoTaskTitle(targetTask),
    trigger: "today_mission_repeated_not_now",
    mode: "rescue_me",
    source: "demo_quest_loop_reset",
  };
  if (confirmedNotYourMoveScenario) {
    const now = Date.now();
    const nextCheckInAt = now + 3 * DAY_MS;
    targetTask.isToday = false;
    targetTask.blocked = {
      status: "not_your_move",
      reason: "waiting_for_organization",
      waitingFor: "Reply from the fellowship reviewer",
      lastUserAction: "Demo: sent the application draft and waiting for response.",
      nextCheckInAt,
      updatedAt: now,
      contractVersion: "not_your_move_v1",
    };
    targetTask.notYourMove = null;
    seedAngelEntryResistanceMemory(session, ANGEL_ENTRY_RESISTANCE_THRESHOLD);
    seedQuestRelationMemorySignal(session, "not_my_move", ANGEL_ENTRY_RESISTANCE_THRESHOLD, {
      lastWaitingReason: "waiting_for_organization",
      lastWaitingFor: "Reply from the fellowship reviewer",
      nextCheckInAt,
      notYourMoveConfirmed: true,
    });
    return;
  }
  const oneBeforeThreshold = Math.max(0, ANGEL_ENTRY_RESISTANCE_THRESHOLD - 1);
  if (directorScenarioSignal) {
    seedAngelEntryResistanceMemory(session, ANGEL_ENTRY_RESISTANCE_THRESHOLD);
    seedQuestRelationMemorySignal(session, directorScenarioSignal, ANGEL_ENTRY_RESISTANCE_THRESHOLD);
    return;
  }
  seedAngelEntryResistanceMemory(session, oneBeforeThreshold);
  seedQuestRelationMemorySignal(session, "not_now", Math.max(1, oneBeforeThreshold));
}

function isAngelEntryCoolingDown(session = {}, now = Date.now()) {
  if (shouldSkipAngelEntryCooldown(session)) return false;
  const key = getAngelEntryCooldownKey(session);
  if (!key) return false;
  return Number(readAngelEntryCooldowns(now)[key] || 0) > now;
}

function rememberAngelEntryCooldown(session = {}, durationMs = ANGEL_ENTRY_DISMISS_COOLDOWN_MS) {
  if (shouldSkipAngelEntryCooldown(session)) return;
  const key = getAngelEntryCooldownKey(session);
  if (!key || !Number.isFinite(durationMs) || durationMs <= 0) return;
  if (typeof window === "undefined" || !window.localStorage) return;
  const now = Date.now();
  const cooldowns = readAngelEntryCooldowns(now);
  cooldowns[key] = now + durationMs;
  try {
    window.localStorage.setItem(ANGEL_ENTRY_COOLDOWN_STORAGE_KEY, JSON.stringify(cooldowns));
  } catch (_) {
    // Ignore local storage failures; cooldown is a comfort guard, not a data contract.
  }
}

function rememberAngelEntryResistance(session = {}) {
  if (shouldSkipAngelEntryResistance(session)) return 0;
  if (typeof window === "undefined" || !window.localStorage) return 0;
  const key = getAngelEntryResistanceKey(session);
  const resistance = readAngelEntryResistance();
  const nextCount = Number(resistance[key]?.count || 0) + 1;
  resistance[key] = {
    count: nextCount,
    taskId: String(session.taskId || ""),
    lastMode: String(session.mode || ""),
    lastTrigger: String(session.trigger || ""),
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(ANGEL_ENTRY_RESISTANCE_STORAGE_KEY, JSON.stringify(resistance));
  } catch (_) {
    // Comfort memory only; task data is not affected.
  }
  return nextCount;
}

function clearAngelEntryResistance(session = {}) {
  const key = getAngelEntryResistanceKey(session);
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  const resistance = readAngelEntryResistance();
  if (!resistance[key]) return;
  delete resistance[key];
  try {
    window.localStorage.setItem(ANGEL_ENTRY_RESISTANCE_STORAGE_KEY, JSON.stringify(resistance));
  } catch (_) {
    // Ignore local storage failures.
  }
}

function getAngelEntryResistanceCount(session = {}) {
  if (shouldSkipAngelEntryResistance(session)) return 0;
  const key = getAngelEntryResistanceKey(session);
  if (!key) return 0;
  return Number(readAngelEntryResistance()[key]?.count || 0);
}

function shouldEscalateAngelEntryToDiagnosis(session = {}) {
  return getAngelEntryResistanceCount(session) >= ANGEL_ENTRY_RESISTANCE_THRESHOLD;
}

function getQuestRelationMemory(session = {}) {
  const key = getQuestRelationMemoryKey(session);
  if (!key) return null;
  return readQuestRelationMemory()[key] || null;
}

function getQuestRelationStrategy(signal = "") {
  const normalized = String(signal || "").trim().toLowerCase();
  if (normalized === "too_big") return "make_it_smaller";
  if (normalized === "unclear") return "clarify_task";
  if (normalized === "not_my_move" || normalized === "still_waiting") return "hold_external_dependency";
  if (normalized === "kill_without_guilt") return "confirm_cemetery";
  if (normalized === "dismissed" || normalized === "not_now") return "cool_down";
  if (normalized === "rescue_later") return "reduce_pressure";
  if (normalized === "microstep_completed") return "continue_gently";
  return "observe";
}

function getQuestRelationDirectorAction(relationMemory = {}, language = "ru") {
  const isEnglish = language === "en";
  const signal = String(relationMemory?.lastSignal || "").trim().toLowerCase();
  if (signal === "too_big") {
    return {
      id: "shrink_then_rescue",
      label: isEnglish ? "Make it smaller" : "Уменьшить квест",
      question: isEnglish ? "How should Angel shrink this quest?" : "Как ангелу уменьшить этот квест?",
    };
  }
  if (signal === "unclear") {
    return {
      id: "clarify_then_rescue",
      label: isEnglish ? "Clarify first" : "Сначала прояснить",
      question: isEnglish ? "Which part is unclear?" : "Где именно мутно?",
    };
  }
  if (signal === "not_my_move" || signal === "still_waiting") {
    return {
      id: "hold_external_dependency",
      label: isEnglish ? "Check waiting state" : "Проверить ожидание",
      question: isEnglish ? "Is this still waiting on someone else?" : "Это всё ещё зависит не от тебя?",
    };
  }
  if (signal === "kill_without_guilt") {
    return {
      id: "confirm_cemetery",
      label: isEnglish ? "Move to Cemetery" : "На кладбище",
      question: isEnglish
        ? "Move this quest out of active pressure without deleting it?"
        : "Убрать этот квест из активного давления без удаления?",
    };
  }
  if (signal === "microstep_completed") {
    return {
      id: "continue_or_pause",
      label: isEnglish ? "Continue gently" : "Продолжить мягко",
      question: isEnglish ? "Do we continue, pause, or change route?" : "Продолжаем, ставим паузу или меняем вход?",
    };
  }
  return {
    id: "diagnose_resistance",
    label: isEnglish ? "Find sticky point" : "Найти липкое место",
    question: isEnglish ? "Where is this quest sticky?" : "Где этот квест липкий?",
  };
}

function rememberQuestRelationSignal(session = {}, signal = "", details = {}) {
  const key = getQuestRelationMemoryKey(session);
  const normalizedSignal = String(signal || "").trim().toLowerCase();
  if (!key || !normalizedSignal || typeof window === "undefined" || !window.localStorage) return null;
  const now = new Date().toISOString();
  const memory = readQuestRelationMemory();
  const previous = memory[key] && typeof memory[key] === "object" ? memory[key] : {};
  const counts = previous.counts && typeof previous.counts === "object" ? { ...previous.counts } : {};
  counts[normalizedSignal] = Number(counts[normalizedSignal] || 0) + 1;
  const preservedLastSignal = String(previous.lastSignal || "").trim().toLowerCase();
  const shouldPreserveLastSignal = Boolean(details.preserveLastSignal)
    && Boolean(preservedLastSignal)
    && normalizedSignal !== preservedLastSignal;
  const nextLastSignal = shouldPreserveLastSignal ? preservedLastSignal : normalizedSignal;
  const directorAction = getQuestRelationDirectorAction({
    ...previous,
    lastSignal: nextLastSignal,
  });
  const next = {
    ...previous,
    taskId: String(session.taskId || session.id || previous.taskId || ""),
    taskTitle: String(session.taskTitle || session.taskText || previous.taskTitle || ""),
    counts,
    lastSignal: nextLastSignal,
    lastStrategy: getQuestRelationStrategy(nextLastSignal),
    lastDirectorAction: directorAction.id,
    lastPauseSignal: shouldPreserveLastSignal ? normalizedSignal : previous.lastPauseSignal,
    lastPauseAt: shouldPreserveLastSignal ? now : previous.lastPauseAt,
    lastConfusion: String(details.confusion || details.optionEffect || previous.lastConfusion || ""),
    lastConfusionLabel: String(details.confusionLabel || details.optionLabel || previous.lastConfusionLabel || ""),
    lastSuggestedStep: String(details.suggestedStep || details.microstepText || previous.lastSuggestedStep || ""),
    lastSuggestedStepAt: details.suggestedStep || details.microstepText ? now : previous.lastSuggestedStepAt,
    lastSuggestedSubtaskId: String(details.subtaskId || previous.lastSuggestedSubtaskId || ""),
    lastStepSource: String(details.stepSource || previous.lastStepSource || ""),
    lastWaitingFor: String(details.waitingFor || previous.lastWaitingFor || ""),
    lastWaitingReason: String(details.waitingReason || details.reason || previous.lastWaitingReason || ""),
    lastNextCheckInAt: Number(details.nextCheckInAt || previous.lastNextCheckInAt || 0) || 0,
    lastNotYourMoveConfirmedAt: (
      normalizedSignal === "not_my_move" ||
      normalizedSignal === "still_waiting" ||
      details.notYourMoveConfirmed
    )
      ? now
      : previous.lastNotYourMoveConfirmedAt,
    lastMode: String(session.mode || previous.lastMode || ""),
    lastTrigger: String(session.trigger || previous.lastTrigger || ""),
    lastSource: String(details.source || session.source || previous.lastSource || ""),
    lastOptionLabel: String(details.optionLabel || previous.lastOptionLabel || ""),
    updatedAt: now,
  };
  memory[key] = next;
  try {
    window.localStorage.setItem(QUEST_RELATION_MEMORY_STORAGE_KEY, JSON.stringify(memory));
  } catch (_) {
    // Companion memory only; user task data is not affected.
  }
  return next;
}

function buildResistanceDiagnosisAngelEntry(session = {}, language = "ru") {
  const isEnglish = language === "en";
  const taskTitle = String(session.taskTitle || session.taskText || "").trim();
  const relationMemory = getQuestRelationMemory(session);
  const lastSignal = String(relationMemory?.lastSignal || "").trim();
  const waitingFor = String(relationMemory?.lastWaitingFor || "").trim();
  const directorAction = getQuestRelationDirectorAction(relationMemory, language);
  const relationIntro = taskTitle && lastSignal === "too_big"
    ? (isEnglish
      ? `I remember “${taskTitle}” felt too big last time. I will not push the whole quest.`
      : `Я помню, что «${taskTitle}» в прошлый раз был слишком большим. Я не буду давить всем квестом.`)
    : taskTitle && lastSignal === "unclear"
      ? (isEnglish
        ? `I remember “${taskTitle}” was foggy last time. I will look for the unclear part first.`
        : `Я помню, что «${taskTitle}» в прошлый раз был мутным. Сначала найдём неясное место.`)
      : taskTitle && (lastSignal === "not_my_move" || lastSignal === "still_waiting")
        ? (isEnglish
          ? `I remember “${taskTitle}” may not be your move${waitingFor ? `: ${waitingFor}` : ""}. I will check before pushing.`
          : `Я помню, что «${taskTitle}» может быть не твоим ходом${waitingFor ? `: ${waitingFor}` : ""}. Сначала проверим, а не будем давить.`)
        : "";
  return {
    ...session,
    id: `${session.id || session.taskId || "angel_entry"}_resistance_memory`,
    trigger: "repeated_resistance",
    mode: "diagnose_resistance",
    directorAction: directorAction.id,
    message: relationIntro || (taskTitle
      ? (isEnglish
        ? `“${taskTitle}” keeps resisting the direct route. I will not push it again.`
        : `«${taskTitle}» сопротивляется прямому входу. Я не буду давить ещё раз.`)
      : (isEnglish
        ? "This quest keeps resisting the direct route. I will not push it again."
        : "Этот квест сопротивляется прямому входу. Я не буду давить ещё раз.")),
    primaryCta: directorAction.label,
    secondaryCta: isEnglish ? "Not now" : "Не сейчас",
    diagnosisQuestion: directorAction.question,
    diagnosisOptions: [
      { id: "too_big", effect: "make_smaller" },
      { id: "unclear", effect: "clarify" },
      { id: "not_my_move", effect: "not_your_move" },
      { id: "kill_without_guilt", effect: "consider_cemetery" },
    ],
    source: `${session.source || "angel_entry"}_local_resistance_memory`,
    contractVersion: "angel_entry_local_resistance_v1",
  };
}

function getAngelEntryDismissCooldownMs(session = {}) {
  const mode = String(session.mode || "").toLowerCase();
  const trigger = String(session.trigger || "").toLowerCase();
  if (mode === "not_your_move_checkin" || trigger === "not_your_move_checkin_due") {
    return ANGEL_ENTRY_CHECKIN_COOLDOWN_MS;
  }
  return ANGEL_ENTRY_DISMISS_COOLDOWN_MS;
}

const STICKY_DIAGNOSIS_COPY = {
  too_big: {
    en: { label: "too big", description: "Shrink it before acting.", next: "I marked this as scary and opened task tuning. Make it smaller first." },
    ru: { label: "слишком большое", description: "Сначала сжать задачу.", next: "Я пометила это как страшное и открыла настройку задачи. Сначала уменьшим." },
  },
  unclear: {
    en: { label: "unclear", description: "Clarify the task before doing it.", next: "Task tuning is open. Clarify what the next visible step is." },
    ru: { label: "непонятно", description: "Сначала прояснить задачу.", next: "Настройка задачи открыта. Проясни следующий видимый шаг." },
  },
  not_my_move: {
    en: { label: "not my move", description: "This may depend on someone else.", next: "Angel will hold this as waiting, not failing." },
    ru: { label: "не мой ход", description: "Возможно, это зависит от кого-то ещё.", next: "Ангел будет держать это как ожидание, не как провал." },
  },
  still_waiting: {
    en: { label: "still waiting", description: "Keep it in Not Your Move and check again later.", next: "Still waiting. I moved the next gentle check-in forward." },
    ru: { label: "всё ещё жду", description: "Оставить в «не мой ход» и проверить позже.", next: "Всё ещё ждём. Я перенесла мягкую проверку вперёд." },
  },
  back_in_my_hands: {
    en: { label: "back in my hands", description: "Clear Not Your Move and let Angel consider it again.", next: "This is back in your hands. Angel can consider it again." },
    ru: { label: "снова в моих руках", description: "Снять «не мой ход», ангел снова может учитывать задачу.", next: "Это снова в твоих руках. Ангел может снова учитывать задачу." },
  },
  kill_without_guilt: {
    en: { label: "let it die", description: "Consider Cemetery, but do not bury it automatically.", next: "Click once more to confirm Cemetery. No shame, but no accidental burial." },
    ru: { label: "пусть умрёт", description: "Подумать о кладбище, но не хоронить автоматически.", next: "Нажми ещё раз, чтобы подтвердить кладбище. Без стыда, но не случайно." },
  },
};

const NOT_YOUR_MOVE_REASON_OPTIONS = [
  {
    value: "waiting_for_person",
    en: "Waiting for a person",
    ru: "Жду человека",
  },
  {
    value: "waiting_for_organization",
    en: "Waiting for an organization",
    ru: "Жду организацию",
  },
  {
    value: "waiting_for_document",
    en: "Need a document",
    ru: "Нужен документ",
  },
  {
    value: "waiting_for_access",
    en: "Need access or code",
    ru: "Нужен доступ или код",
  },
  {
    value: "waiting_for_money",
    en: "Need money/resource",
    ru: "Нужны деньги/ресурс",
  },
  {
    value: "other",
    en: "Other blocker",
    ru: "Другой блокер",
  },
];

const NOT_YOUR_MOVE_CHECKIN_OPTIONS = [
  { days: 1, en: "Tomorrow", ru: "Завтра" },
  { days: 3, en: "In 3 days", ru: "Через 3 дня" },
  { days: 7, en: "In 1 week", ru: "Через неделю" },
];

function getNotYourMoveReasonLabel(reason = "other", language = "ru") {
  const option = NOT_YOUR_MOVE_REASON_OPTIONS.find((item) => item.value === reason) ||
    NOT_YOUR_MOVE_REASON_OPTIONS[NOT_YOUR_MOVE_REASON_OPTIONS.length - 1];
  return language === "en" ? option.en : option.ru;
}

function formatNotYourMoveCheckIn(timestamp, language = "ru") {
  const date = new Date(Number(timestamp || 0));
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(language === "en" ? "en-US" : "ru-RU", {
    day: "2-digit",
    month: "short",
  });
}

function normalizeStickyDiagnosisEffect(option = {}) {
  const id = String(option.id || "").toLowerCase();
  const effect = String(option.effect || "").toLowerCase();
  if (id.includes("too_big") || effect === "make_smaller") return "too_big";
  if (id.includes("unclear") || effect === "clarify") return "unclear";
  if (id.includes("not_my_move") || effect === "not_your_move") return "not_my_move";
  if (id.includes("still_waiting") || effect === "keep_waiting") return "still_waiting";
  if (id.includes("back_in_my_hands") || effect === "clear_not_your_move") return "back_in_my_hands";
  if (id.includes("kill") || id.includes("die") || effect === "consider_cemetery") return "kill_without_guilt";
  return id || effect || "diagnose";
}

function localizeStickyDiagnosisOption(option = {}, language = "ru") {
  const key = normalizeStickyDiagnosisEffect(option);
  const locale = language === "en" ? "en" : "ru";
  const copy = STICKY_DIAGNOSIS_COPY[key]?.[locale] || {};
  return {
    ...option,
    normalizedEffect: key,
    label: copy.label || option.label || key,
    description: copy.description || option.description || "",
    suggestedNextStep: copy.next || option.suggestedNextStep || "",
  };
}

const QUEST_DIRECTOR_PRIMARY_OPTION_BY_ACTION = {
  shrink_then_rescue: { id: "too_big", effect: "too_big" },
  clarify_then_rescue: { id: "unclear", effect: "unclear" },
  hold_external_dependency: { id: "not_my_move", effect: "not_my_move" },
  confirm_cemetery: { id: "kill_without_guilt", effect: "kill_without_guilt" },
};

function AngelEntrySessionCard({ language, session, task, onStart, onDismiss, onShowPlanner, onDiagnosisOption }) {
  if (!session) return null;
  const isEnglish = language === "en";
  const taskTitle = task ? getTaskDisplayTitle(task) : "";
  const diagnosisOptions = Array.isArray(session.diagnosisOptions)
    ? session.diagnosisOptions.map((option) => localizeStickyDiagnosisOption(option, language))
    : [];
  return (
    <section className="executive-demo-story glass-panel" aria-label={isEnglish ? "Angel entry session" : "Входная сессия ангела"}>
      <div className="executive-demo-story-copy">
        <p className="executive-state-kicker">
          {isEnglish ? "Angel entry" : "Ангел на входе"}
        </p>
        <h2>
          {isEnglish ? "One safe entry point, not the whole list." : "Один безопасный вход, не весь список."}
        </h2>
        <p>
          {session.message || (isEnglish
            ? "Angel found a small way back into action."
            : "Ангел нашёл маленький вход обратно в действие.")}
        </p>
        {taskTitle && (
          <p>
            {isEnglish ? `Suggested task: ${taskTitle}` : `Предложенная задача: ${taskTitle}`}
          </p>
        )}
        {diagnosisOptions.length > 0 && (
          <div className="companion-prompt-option-list" aria-label={isEnglish ? "Sticky quest options" : "Варианты липкости квеста"}>
            <strong>{session.diagnosisQuestion || (isEnglish ? "What is sticky here?" : "Где тут липко?")}</strong>
            {diagnosisOptions.map((option) => (
              <button
                key={option.id || option.label}
                type="button"
                onClick={() => onDiagnosisOption?.(option)}
                title={option.description || option.suggestedNextStep || option.label}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="executive-demo-story-points">
        <span>{isEnglish ? `Mode: ${session.mode || "entry"}` : `Режим: ${session.mode || "entry"}`}</span>
        <span>{isEnglish ? `Trigger: ${session.trigger || "planner"}` : `Причина: ${session.trigger || "planner"}`}</span>
        <span>{isEnglish ? "No full-list pressure." : "Без давления полного списка."}</span>
      </div>
      <div className="executive-demo-story-actions">
        <button type="button" onClick={onStart}>
          {session.primaryCta || (isEnglish ? "Start safely" : "Начать безопасно")}
        </button>
        <button type="button" onClick={onShowPlanner}>
          {isEnglish ? "Open planner" : "Открыть планер"}
        </button>
        <button type="button" onClick={onDismiss}>
          {isEnglish ? "Not now" : "Не сейчас"}
        </button>
      </div>
    </section>
  );
}

function ExecutiveStateLayer({
  language,
  selectedState,
  plannerOpen,
  controlSuggestion,
  onSelectState,
  onStartRescue,
  onStartControlRescue,
  onAddControlStepAndRescue,
  onParkUntilTomorrow,
  onShowPlanner,
  onDismiss,
  dismissible,
  todayPinnedCount,
  rescueTask,
}) {
  const locale = getExecutiveStateLocale(language);
  const isEnglish = locale === "en";
  const selectedMeta = EXECUTIVE_STATE_COPY[selectedState] || null;
  const selectedCopy = selectedMeta?.[locale] || null;
  const protocolCopy = EXECUTIVE_STATE_PROTOCOL_COPY[selectedState]?.[locale] || null;
  const rescueFirst = isRescueFirstExecutiveState(selectedState);
  const primaryAction = selectedState === "hyperfocus"
    ? onParkUntilTomorrow
    : selectedState === "normal"
      ? onShowPlanner
      : onStartRescue;
  const primaryDisabled = isRescueFirstExecutiveState(selectedState) && !rescueTask;
  const showParkAction = isRescueFirstExecutiveState(selectedState);
  const showPlannerAction = selectedState !== "normal";
  const showControlSuggestion = Boolean(controlSuggestion && selectedState !== "normal");

  return (
    <section className={`executive-state-panel glass-panel ${selectedState ? `is-${selectedState}` : "is-empty"}`}>
      <div className="executive-state-topline">
        <div>
          <p className="executive-state-kicker">
            {isEnglish ? "Executive state" : "Состояние мозга"}
          </p>
          <h2 className="executive-state-title">
            {isEnglish ? "How is your brain right now?" : "Как сейчас работает мозг?"}
          </h2>
        </div>
        <p className="executive-state-caption">
          {isEnglish
            ? "The planner changes what it allows before it shows the full list."
            : "Планер сначала выбирает режим, а потом уже показывает полный список."}
        </p>
        {dismissible && (
          <button type="button" className="executive-state-dismiss" onClick={onDismiss}>
            {isEnglish ? "Hide this layer" : "Скрыть этот слой"}
          </button>
        )}
      </div>

      <div className="executive-state-picker" role="list" aria-label={isEnglish ? "Executive state picker" : "Выбор состояния"}>
        {EXECUTIVE_STATE_ORDER.map((state) => {
          const stateCopy = EXECUTIVE_STATE_COPY[state][locale];
          const isActive = selectedState === state;
          return (
            <button
              key={state}
              type="button"
              className={`executive-state-chip ${isActive ? "is-active" : ""}`}
              aria-pressed={isActive}
              onClick={() => onSelectState(state)}
            >
              <span className="executive-state-chip-icon">{EXECUTIVE_STATE_COPY[state].icon}</span>
              <span>{stateCopy.label}</span>
            </button>
          );
        })}
      </div>

      {selectedCopy && (
        <article
          key={`${selectedState}-${locale}`}
          className={`executive-state-card ${rescueFirst ? "is-rescue-first" : "is-planner-safe"}`}
          data-mode={selectedState}
        >
          <div className="executive-state-card-main">
            <p className="executive-state-card-kicker">
              {rescueFirst
                ? (isEnglish ? "Rescue first" : "Сначала rescue")
                : (isEnglish ? "Planner allowed" : "Планер доступен")}
            </p>
            <h3>{selectedCopy.title}</h3>
            <p>{selectedCopy.happening}</p>
            {protocolCopy && (
              <div className="executive-mode-protocol">
                <span>{protocolCopy.label}</span>
                <strong>{protocolCopy.summary}</strong>
                <ol>
                  {protocolCopy.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </div>
            )}
            {showControlSuggestion && (
              <div className="executive-control-task">
                <span className="executive-control-task-kicker">
                  {isEnglish ? "Angel picked a control task" : "Ангел выбрал задачу для контроля"}
                </span>
                <strong>{controlSuggestion.taskTitle}</strong>
                {Array.isArray(controlSuggestion.reasons) && controlSuggestion.reasons.length > 0 && (
                  <div className="executive-control-reasons" aria-label={isEnglish ? "Why this task" : "Почему эта задача"}>
                    {controlSuggestion.reasons.map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>
                )}
                <div className="executive-control-step">
                  <span>
                    {controlSuggestion.stepIsExisting
                      ? (isEnglish ? "Existing first step" : "Уже есть первый шаг")
                      : (isEnglish ? "Suggested first step" : "Предложенный первый шаг")}
                  </span>
                  <b>{controlSuggestion.stepText}</b>
                </div>
                <div className="executive-control-actions">
                  {controlSuggestion.shouldAddStep && (
                    <button type="button" onClick={onAddControlStepAndRescue}>
                      {isEnglish ? "Add step + start rescue" : "Добавить шаг и начать rescue"}
                    </button>
                  )}
                  <button type="button" onClick={onStartControlRescue}>
                    {isEnglish ? "Start with this task" : "Начать с этой задачи"}
                  </button>
                </div>
              </div>
            )}
            <div className="executive-state-next-step">
              <span>{isEnglish ? "Safe next step" : "Безопасный следующий шаг"}</span>
              <strong>{selectedCopy.nextStep}</strong>
            </div>
          </div>

          <div className="executive-state-rules">
            <div key={`forbidden-${selectedState}-${locale}`} className="executive-state-rule is-forbidden">
              <h4>{isEnglish ? "Forbidden now" : "Сейчас нельзя"}</h4>
              <ul>
                {selectedCopy.forbidden.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div key={`allowed-${selectedState}-${locale}`} className="executive-state-rule is-allowed">
              <h4>{isEnglish ? "Allowed now" : "Сейчас можно"}</h4>
              <ul>
                {selectedCopy.allowed.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>

          <div className="executive-state-actions">
            <button
              type="button"
              className="executive-state-action is-primary"
              onClick={primaryAction}
              disabled={primaryDisabled}
            >
              {protocolCopy?.primary || (isEnglish ? "Start rescue" : "Открыть rescue")}
            </button>
            {showParkAction && (
              <button
                type="button"
                className="executive-state-action"
                onClick={onParkUntilTomorrow}
              >
                {todayPinnedCount > 0
                  ? (isEnglish ? "Park until tomorrow" : "Запарковать до завтра")
                  : (isEnglish ? "No today pressure" : "Сегодня не давит")}
              </button>
            )}
            {showPlannerAction && (
              <button
                type="button"
                className="executive-state-action is-secondary"
                onClick={onShowPlanner}
              >
                {plannerOpen
                  ? (isEnglish ? "Planner is visible" : "Планер открыт")
                  : (isEnglish ? "Show full planner" : "Показать полный планер")}
              </button>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
const ANGEL_TASK_STARTERS = new Set([
  "купить", "сделать", "построить", "приготовить", "узнать", "убить", "проверить",
  "подготовить", "написать", "позвонить", "сходить", "записаться", "заказать", "оплатить",
  "помыть", "починить", "отправить", "найти", "выбрать", "забрать", "постирать",
]);

const isDemoUserId = (userId) => String(userId || "") === DEMO_USER_ID;
const getPlannerEventCacheKey = (userId) => `adhd_planner_events_${userId || "guest"}`;
const getShortIdempotencyBucket = (now = Date.now(), windowMs = 4000) => Math.floor(Number(now || Date.now()) / windowMs);
const buildWebIdempotencyKey = (...parts) => parts
  .map((part) => String(part ?? "").trim())
  .filter(Boolean)
  .join("_")
  .replace(/[^\w:-]+/g, "_")
  .replace(/_+/g, "_")
  .slice(0, 180);

const sortPlannerEvents = (events = []) => (
  [...events].sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
);

const mergePlannerEvents = (...eventLists) => {
  const byId = new Map();
  eventLists.flat().filter(Boolean).forEach((event) => {
    const eventId = String(event.id || `${event.type || "planner_event"}_${event.taskId || "event"}_${event.createdAt || Date.now()}`);
    byId.set(eventId, { ...event, id: eventId });
  });
  return sortPlannerEvents([...byId.values()]).slice(0, PLANNER_EVENT_LIMIT);
};

const readCachedPlannerEvents = (userId) => {
  if (!userId || typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(getPlannerEventCacheKey(userId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[Planner] Не удалось прочитать локальный журнал событий:", error);
    return [];
  }
};

const writeCachedPlannerEvents = (userId, events = []) => {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.setItem(getPlannerEventCacheKey(userId), JSON.stringify(events.slice(0, PLANNER_EVENT_LIMIT)));
  } catch (error) {
    console.warn("[Planner] Не удалось сохранить локальный журнал событий:", error);
  }
};

const getHumanPlannerEvent = (event = {}, language = "ru") => {
  const isEnglish = language === "en";
  const type = String(event.type || "").toLowerCase();
  const rawMessage = String(event.message || "");
  const title = String(event.taskText || "").trim();
  const quotedTitle = title ? `“${title}”` : (isEnglish ? "the task" : "задачу");

  if (type === "report_item") {
    const localizedReportMessage = formatPlannerReportMessage(event, language);
    if (localizedReportMessage) return localizedReportMessage;

    const reportTitle = String(event.payload?.title || event.taskText || "").trim();
    const body = String(event.message || "").trim();
    if (event.actor === "devil") {
      if (/buried|кладбищ|cemetery|похорон/i.test(`${reportTitle} ${body}`)) {
        return isEnglish
          ? `Devil report: ${body || "I moved stale clutter out of the active list."}`
          : `Отчёт чертика: ${body || "Я убрал залежавшееся из активного списка."}`;
      }
      if (/cold|остыв|холод|risk/i.test(`${reportTitle} ${body}`)) {
        return isEnglish
          ? `Devil warning: ${body || "Some tasks are getting cold."}`
          : `Предупреждение чертика: ${body || "Некоторые задачи остывают."}`;
      }
      return isEnglish
        ? `Devil report: ${body || reportTitle || "Something changed."}`
        : `Отчёт чертика: ${body || reportTitle || "Что-то изменилось."}`;
    }
    if (event.actor === "angel") {
      if (/mission|day mission|цель|фокус/i.test(`${reportTitle} ${body}`)) {
        return isEnglish
          ? `Angel picked a focus: ${body || reportTitle || "one task is now in front."}`
          : `Ангел выбрал фокус: ${body || reportTitle || "одна задача теперь впереди."}`;
      }
      if (/rescue|stuck|застр/i.test(`${reportTitle} ${body}`)) {
        return isEnglish
          ? `Angel prepared rescue: ${body || reportTitle || "one task is ready for rescue mode."}`
          : `Ангел подготовил rescue: ${body || reportTitle || "одна задача готова для режима “застряла”."}`;
      }
      return isEnglish
        ? `Angel report: ${body || reportTitle || "Something changed."}`
        : `Отчёт ангела: ${body || reportTitle || "Что-то изменилось."}`;
    }
    return body || reportTitle || (isEnglish ? "Planner report." : "Отчёт планера.");
  }

  if (type.includes("mission_selected")) {
    return isEnglish
      ? `Angel picked today’s focus: ${quotedTitle}.`
      : `Ангел выбрал фокус дня: ${quotedTitle}.`;
  }

  if (type.includes("rescue_suggestion")) {
    return isEnglish
      ? `Angel prepared a rescue target: ${quotedTitle}.`
      : `Ангел подготовил rescue-цель: ${quotedTitle}.`;
  }

  if (type.includes("tasks_at_risk")) {
    const count = Number(event.payload?.taskIds?.length || 0);
    return isEnglish
      ? `Devil warning: ${count || "some"} task(s) are getting cold.`
      : `Чёртик предупреждает: ${count || "несколько"} задач остывают.`;
  }

  if (type.includes("task_dead") || type.includes("cemetery")) {
    return isEnglish
      ? `Devil moved ${quotedTitle} to Cemetery.`
      : `Чёртик отправил ${quotedTitle} на кладбище.`;
  }

  if (type.includes("outbox_")) {
    const payload = event.payload || {};
    const status = String(payload.status || "").toLowerCase();
    const channel = String(payload.channel || event.source || "").toLowerCase();
    const topic = String(payload.topic || "").toLowerCase();
    const channelLabel = channel === "email"
      ? "Email"
      : channel === "telegram"
        ? "Telegram"
        : (isEnglish ? "Delivery" : "Доставка");
    const topicLabel = topic === "scheduled_nudge"
      ? (isEnglish ? "nudge" : "пинок")
      : topic === "task_auto_cemetery"
        ? (isEnglish ? "cemetery notice" : "сообщение о кладбище")
        : (isEnglish ? "message" : "сообщение");

    if (type.includes("queued") || status === "queued") {
      return isEnglish
        ? `${channelLabel} ${topicLabel} queued.`
        : `${channelLabel}: ${topicLabel} запланирован.`;
    }
    if (status === "sent") {
      return isEnglish
        ? `${channelLabel} ${topicLabel} sent.`
        : `${channelLabel}: ${topicLabel} отправлен.`;
    }
    if (status === "retry") {
      return isEnglish
        ? `${channelLabel} ${topicLabel} failed. Retry scheduled.`
        : `${channelLabel}: не удалось отправить ${topicLabel}, повтор запланирован.`;
    }
    if (status === "dead") {
      return isEnglish
        ? `${channelLabel} ${topicLabel} failed permanently.`
        : `${channelLabel}: ${topicLabel} не доставлен после нескольких попыток.`;
    }
    return rawMessage || (isEnglish ? "Delivery event." : "Событие доставки.");
  }

  if (type.includes("bulk_completed") || (type.includes("bulk") && type.includes("cemetery"))) {
    const movedCount = Number(event.payload?.movedCount || event.payload?.movedTaskIds?.length || 0);
    return isEnglish
      ? `Heaven cleaned: ${movedCount} task(s) moved to Cemetery.`
      : `Рай очищен: ${movedCount} задач отправлено на кладбище.`;
  }

  if (type.includes("deleted_forever")) {
    const deletedCount = Number(event.payload?.deletedCount || event.payload?.deletedTaskIds?.length || 0);
    if (deletedCount > 1) {
      return isEnglish
        ? `Deleted forever: ${deletedCount} task(s).`
        : `Удалено навсегда: ${deletedCount} задач.`;
    }
    return isEnglish ? `Deleted forever: ${quotedTitle}.` : `Удалено навсегда: ${quotedTitle}.`;
  }

  if (type.includes("completed") || rawMessage.startsWith("Completed ")) {
    return isEnglish ? `Task completed: ${quotedTitle}.` : `Задача завершена: ${quotedTitle}.`;
  }
  if (type.includes("dead") || type.includes("cemetery") || rawMessage.includes("Cemetery")) {
    return event.actor === "devil"
      ? (isEnglish ? `I moved stale clutter to Cemetery: ${quotedTitle}.` : `Я убрал в кладбище залежавшуюся задачу: ${quotedTitle}.`)
      : (isEnglish ? `Moved to Cemetery: ${quotedTitle}.` : `Отправлено на кладбище: ${quotedTitle}.`);
  }
  if (type.includes("reopened")) {
    return isEnglish ? `Returned to active: ${quotedTitle}.` : `Вернули в активные: ${quotedTitle}.`;
  }
  if (type.includes("touched")) {
    return isEnglish ? `Movement recorded: ${quotedTitle}.` : `Сдвиг засчитан: ${quotedTitle}.`;
  }
  if (type.includes("reordered")) {
    return isEnglish ? `Order changed: ${quotedTitle}.` : `Порядок изменён: ${quotedTitle}.`;
  }
  if (type.includes("time_added")) {
    return isEnglish ? `Focus time recorded: ${quotedTitle}.` : `Записано время фокуса: ${quotedTitle}.`;
  }
  if (type.includes("subtask_added")) {
    return isEnglish ? `Step added: ${quotedTitle}.` : `Добавлен шаг: ${quotedTitle}.`;
  }
  if (type.includes("subtask_edited")) {
    return isEnglish ? `Step clarified: ${quotedTitle}.` : `Шаг уточнён: ${quotedTitle}.`;
  }
  if (type.includes("subtask_toggled")) {
    return isEnglish ? `Step progress updated: ${quotedTitle}.` : `Прогресс шага обновлён: ${quotedTitle}.`;
  }
  if (type.includes("subtask_deleted")) {
    return isEnglish ? `Step removed: ${quotedTitle}.` : `Шаг удалён: ${quotedTitle}.`;
  }
  if (type.includes("title_changed")) {
    return isEnglish ? `Task renamed: ${quotedTitle}.` : `Задача переименована: ${quotedTitle}.`;
  }
  if (type.includes("pinned_today")) {
    return isEnglish ? `Pinned for today: ${quotedTitle}.` : `Закреплено на сегодня: ${quotedTitle}.`;
  }
  if (type.includes("unpinned_today")) {
    return isEnglish ? `Removed from today: ${quotedTitle}.` : `Снято с сегодняшнего списка: ${quotedTitle}.`;
  }
  if (type.includes("marked_vital")) {
    return isEnglish ? `Marked critical: ${quotedTitle}.` : `Отмечено как критичное: ${quotedTitle}.`;
  }
  if (type.includes("unmarked_vital")) {
    return isEnglish ? `Critical mark removed: ${quotedTitle}.` : `Критичность снята: ${quotedTitle}.`;
  }
  if (type.includes("urgency")) {
    return isEnglish ? `Urgency changed: ${quotedTitle}.` : `Срочность изменена: ${quotedTitle}.`;
  }
  if (type.includes("resistance")) {
    return isEnglish ? `Resistance changed: ${quotedTitle}.` : `Сопротивление изменено: ${quotedTitle}.`;
  }
  if (type.includes("deadline")) {
    return isEnglish ? `Deadline updated: ${quotedTitle}.` : `Дедлайн обновлён: ${quotedTitle}.`;
  }
  if (type.includes("heat_zone")) {
    const zone = String(event.payload?.heatZone || event.heatZone || "").toLowerCase();
    const zoneLabel = zone === "focus"
      ? (isEnglish ? "Focus" : "Фокус")
      : zone === "background"
        ? (isEnglish ? "Background" : "Фон")
        : zone === "purgatory"
          ? (isEnglish ? "Purgatory" : "Чистилище")
          : (isEnglish ? "new zone" : "новую зону");
    return isEnglish ? `Moved to ${zoneLabel}: ${quotedTitle}.` : `Перемещено в ${zoneLabel}: ${quotedTitle}.`;
  }

  return rawMessage || title || (isEnglish ? "Planner event." : "Событие планера.");
};

const buildPlannerReportDigest = (events = [], language = "ru", engineDecisions = []) => {
  const isEnglish = language === "en";
  const items = (Array.isArray(events) ? events : []).filter(Boolean);
  const decisions = (Array.isArray(engineDecisions) ? engineDecisions : []).filter(Boolean);
  const engineSummaryEvent = items.find((event) => (
    event?.payload?.messageKey === "engine_run_summary" &&
    event?.payload?.projection?.summary &&
    typeof event.payload.projection.summary === "object"
  ));
  const engineSummary = engineSummaryEvent?.payload?.projection?.summary || null;
  if (engineSummary) {
    const stats = engineSummary.stats && typeof engineSummary.stats === "object"
      ? engineSummary.stats
      : {};
    const meaningfulChangeCount = Number(engineSummary.meaningfulChangeCount || 0);
    const angelCount = Number(stats.angelCount || 0);
    const devilCount = Number(stats.devilCount || 0);
    const deliveryCount = Number(stats.deliveryCount || 0);
    const cemeteryMoved = Number(stats.cemeteryMoved || 0);
    const outboxQueued = Number(stats.outboxQueued || 0);
    const heatUpdated = Number(stats.heatUpdated || 0);
    const title = cemeteryMoved > 0 || devilCount > 0
      ? (isEnglish ? "Devil cleaned up stale tasks." : "Чертик прибрал залежавшиеся задачи.")
      : angelCount > 0
        ? (isEnglish ? "Angel refreshed your plan." : "Ангел обновил план.")
        : deliveryCount > 0 || outboxQueued > 0
          ? (isEnglish ? "Planner sent updates." : "Планер отправил обновления.")
          : (isEnglish ? "Planner checked the state." : "Планер проверил состояние.");
    const parts = [];
    if (meaningfulChangeCount > 0) parts.push(isEnglish
      ? `${meaningfulChangeCount} meaningful change${meaningfulChangeCount === 1 ? "" : "s"}`
      : `${meaningfulChangeCount} значим. изменен.`);
    if (cemeteryMoved > 0) parts.push(isEnglish
      ? `${cemeteryMoved} to Cemetery`
      : `${cemeteryMoved} на кладбище`);
    if (angelCount > 0) parts.push(isEnglish
      ? `${angelCount} angel update${angelCount === 1 ? "" : "s"}`
      : `${angelCount} обновл. ангела`);
    if (devilCount > 0) parts.push(isEnglish
      ? `${devilCount} devil warning${devilCount === 1 ? "" : "s"}`
      : `${devilCount} сигнал(а) чертика`);
    if (outboxQueued > 0) parts.push(isEnglish
      ? `${outboxQueued} message${outboxQueued === 1 ? "" : "s"} queued`
      : `${outboxQueued} сообщ. в очереди`);
    if (deliveryCount > 0) parts.push(isEnglish
      ? `${deliveryCount} delivery update${deliveryCount === 1 ? "" : "s"}`
      : `${deliveryCount} обновл. доставки`);
    if (parts.length === 0 && heatUpdated > 0) parts.push(isEnglish
      ? `${heatUpdated} pulse refresh${heatUpdated === 1 ? "" : "es"}`
      : `${heatUpdated} обновл. пульса`);

    const summaryHighlight = {
      id: `${engineSummaryEvent.id}-summary`,
      actor: engineSummaryEvent.actor || engineSummaryEvent.persona || "system",
      text: getHumanPlannerEvent(engineSummaryEvent, language),
      time: formatPlannerEventTime(engineSummaryEvent.createdAt),
    };
    const decisionHighlights = decisions.slice(0, 1).map((decision) => ({
      id: decision.key,
      actor: decision.persona || "system",
      text: decision.text,
      time: "",
    }));
    const eventHighlights = items
      .filter((event) => event.id !== engineSummaryEvent.id)
      .slice(0, Math.max(0, 3 - decisionHighlights.length - 1))
      .map((event) => ({
        id: event.id,
        actor: event.actor || event.persona || "system",
        text: getHumanPlannerEvent(event, language),
        time: formatPlannerEventTime(event.createdAt),
      }));

    return {
      title,
      subtitle: parts.length > 0
        ? parts.join(" · ")
        : (isEnglish ? "No visible change was needed." : "Видимых изменений не понадобилось."),
      highlights: [summaryHighlight, ...decisionHighlights, ...eventHighlights].slice(0, 3),
    };
  }
  const counts = items.reduce((acc, event) => {
    const actor = event?.actor || event?.persona || "system";
    acc[actor] = (acc[actor] || 0) + 1;
    return acc;
  }, {});
  const hasDevil = Number(counts.devil || 0) > 0;
  const hasAngel = Number(counts.angel || 0) > 0;
  const hasSystem = Number(counts.system || 0) > 0;
  const total = items.length;

  const title = hasDevil && hasAngel
    ? (isEnglish ? "Angel and Devil both moved things." : "Ангел и чертик оба сдвинули планер.")
    : hasDevil
      ? (isEnglish ? "Devil found stale stuff." : "Чертик нашёл залежавшееся.")
      : hasAngel
        ? (isEnglish ? "Angel updated your focus." : "Ангел обновил фокус.")
        : hasSystem
          ? (isEnglish ? "The engine checked the planner." : "Движок проверил планер.")
          : (isEnglish ? "Planner checked in." : "Планер проверился.");

  const parts = [];
  if (hasAngel) parts.push(isEnglish ? `${counts.angel} angel` : `${counts.angel} ангел`);
  if (hasDevil) parts.push(isEnglish ? `${counts.devil} devil` : `${counts.devil} чертик`);
  if (hasSystem) parts.push(isEnglish ? `${counts.system} system` : `${counts.system} система`);

  const eventSubtitle = parts.length > 0
    ? (isEnglish
      ? `${total} update${total === 1 ? "" : "s"}: ${parts.join(" · ")}.`
      : `${total} обновл.: ${parts.join(" · ")}.`)
    : (isEnglish ? "No major hidden changes." : "Крупных скрытых изменений нет.");
  const decisionSubtitle = decisions.length > 0
    ? (isEnglish
      ? `Engine decisions: ${decisions.map((decision) => decision.label).join(" · ")}.`
      : `Решения движка: ${decisions.map((decision) => decision.label).join(" · ")}.`)
    : "";
  const subtitle = decisionSubtitle
    ? `${decisionSubtitle} ${eventSubtitle}`
    : eventSubtitle;

  const decisionHighlights = decisions.slice(0, 2).map((decision) => ({
    id: decision.key,
    actor: decision.persona || "system",
    text: decision.text,
    time: "",
  }));
  const eventHighlights = items.slice(0, Math.max(1, 3 - decisionHighlights.length)).map((event) => ({
    id: event.id,
    actor: event.actor || event.persona || "system",
    text: getHumanPlannerEvent(event, language),
    time: formatPlannerEventTime(event.createdAt),
  }));
  const highlights = [...decisionHighlights, ...eventHighlights].slice(0, 3);

  return { title, subtitle, highlights };
};

const toDemoDate = (offsetDays = 0, now = Date.now()) => {
  const date = new Date(now + offsetDays * DAY_MS);
  return date.toISOString().slice(0, 10);
};

const makeDemoSubtasks = (taskId, items = []) => (
  items.map((item, index) => ({
    id: `${taskId}-sub-${index + 1}`,
    text: item.text,
    completed: Boolean(item.completed),
  }))
);

const buildDemoPlannerSeed = (now = Date.now()) => {
  const base = now - 8 * DAY_MS;
  const activeTasks = [
    {
      id: "demo-task-portfolio-demo",
      text: "Ship the portfolio demo",
      createdAt: base,
      lastUpdated: now - 3 * DAY_MS,
      heatBase: 72,
      heatCurrent: 94,
      status: "active",
      position: 1000,
      deadlineAt: toDemoDate(-1, now),
      urgency: "high",
      resistance: "medium",
      isToday: true,
      isVital: true,
      subtasks: makeDemoSubtasks("demo-task-portfolio-demo", [
        { text: "Record a 90-second walkthrough", completed: false },
        { text: "Send the demo link to one recruiter", completed: false },
        { text: "Write two bullets about the system", completed: false },
      ]),
    },
    {
      id: "demo-task-onboarding",
      text: "Polish the onboarding tour",
      createdAt: base + DAY_MS,
      lastUpdated: now - DAY_MS,
      heatBase: 55,
      heatCurrent: 76,
      status: "active",
      position: 2000,
      deadlineAt: toDemoDate(1, now),
      urgency: "medium",
      resistance: "medium",
      isToday: true,
      isVital: false,
      subtasks: makeDemoSubtasks("demo-task-onboarding", [
        { text: "Check the mobile layout", completed: true },
        { text: "Make the mascot bubbles calmer", completed: false },
        { text: "Verify the Next button is always visible", completed: false },
      ]),
    },
    {
      id: "demo-task-telegram",
      text: "Verify Telegram nudges",
      createdAt: base + 2 * DAY_MS,
      lastUpdated: now - 2 * DAY_MS,
      heatBase: 48,
      heatCurrent: 68,
      status: "active",
      position: 3000,
      deadlineAt: toDemoDate(2, now),
      urgency: "medium",
      resistance: "low",
      isToday: false,
      isVital: false,
      subtasks: makeDemoSubtasks("demo-task-telegram", [
        { text: "Send /today to the bot", completed: false },
        { text: "Trigger one rescue nudge", completed: false },
      ]),
    },
    {
      id: "demo-task-investor-email",
      text: "Reply to the investor email",
      createdAt: base + 3 * DAY_MS,
      lastUpdated: now - 4 * DAY_MS,
      heatBase: 42,
      heatCurrent: 58,
      status: "active",
      position: 4000,
      deadlineAt: "",
      urgency: "normal",
      resistance: "high",
      isToday: false,
      isVital: false,
      subtasks: makeDemoSubtasks("demo-task-investor-email", [
        { text: "Write the first messy draft", completed: false },
      ]),
    },
    {
      id: "demo-task-cat-food",
      text: "Buy cat food",
      createdAt: base + 4 * DAY_MS,
      lastUpdated: now - 5 * DAY_MS,
      heatBase: 36,
      heatCurrent: 45,
      status: "active",
      position: 5000,
      deadlineAt: "",
      urgency: "low",
      resistance: "low",
      isToday: false,
      isVital: false,
      subtasks: makeDemoSubtasks("demo-task-cat-food", [
        { text: "Check what brand is left at home", completed: false },
      ]),
    },
  ];

  const completedTasks = [
    {
      id: "demo-task-rescue-built",
      text: "Build Rescue mode",
      createdAt: base - 3 * DAY_MS,
      lastUpdated: now - 2 * DAY_MS,
      completedAt: now - 2 * DAY_MS,
      heatBase: 40,
      heatCurrent: 0,
      status: "completed",
      position: 1000,
      deadlineAt: "",
      urgency: "medium",
      resistance: "medium",
      isToday: false,
      isVital: false,
      subtasks: makeDemoSubtasks("demo-task-rescue-built", [
        { text: "Choose one task", completed: true },
        { text: "Show one microstep", completed: true },
      ]),
    },
    {
      id: "demo-task-calendar",
      text: "Connect calendar planning",
      createdAt: base - 2 * DAY_MS,
      lastUpdated: now - DAY_MS,
      completedAt: now - DAY_MS,
      heatBase: 30,
      heatCurrent: 0,
      status: "completed",
      position: 2000,
      deadlineAt: "",
      urgency: "low",
      resistance: "medium",
      isToday: false,
      isVital: false,
      subtasks: makeDemoSubtasks("demo-task-calendar", [
        { text: "Create one calendar event from a task", completed: true },
      ]),
    },
  ];

  const deadTasks = [
    {
      id: "demo-task-perfect-system",
      text: "Rebuild the whole planner perfectly",
      createdAt: base - 8 * DAY_MS,
      lastUpdated: now - 6 * DAY_MS,
      killedAt: now - 6 * DAY_MS,
      heatBase: 20,
      heatCurrent: 0,
      status: "dead",
      position: 1000,
      deadlineAt: "",
      urgency: "low",
      resistance: "high",
      isToday: false,
      isVital: false,
      subtasks: makeDemoSubtasks("demo-task-perfect-system", []),
    },
    {
      id: "demo-task-sort-everything",
      text: "Organize every file before launching",
      createdAt: base - 7 * DAY_MS,
      lastUpdated: now - 5 * DAY_MS,
      killedAt: now - 5 * DAY_MS,
      heatBase: 18,
      heatCurrent: 0,
      status: "dead",
      position: 2000,
      deadlineAt: "",
      urgency: "low",
      resistance: "high",
      isToday: false,
      isVital: false,
      subtasks: makeDemoSubtasks("demo-task-sort-everything", []),
    },
  ];

  const events = [
    {
      id: "demo-event-created",
      type: "task_created",
      actor: "angel",
      source: "demo",
      taskId: "demo-task-portfolio-demo",
      taskText: "Ship the portfolio demo",
      message: "Angel captured a new task: Ship the portfolio demo.",
      createdAt: now - 20 * 60 * 1000,
    },
    {
      id: "demo-event-rescue",
      type: "rescue_shift",
      actor: "angel",
      source: "demo",
      taskId: "demo-task-onboarding",
      taskText: "Polish the onboarding tour",
      message: "One rescue shift was counted for the onboarding tour.",
      createdAt: now - 12 * 60 * 1000,
    },
    {
      id: "demo-event-devil",
      type: "task_killed",
      actor: "devil",
      source: "auto_clean",
      taskId: "demo-task-perfect-system",
      taskText: "Rebuild the whole planner perfectly",
      message: "I buried “Rebuild the whole planner perfectly” so it stops poisoning the active list.",
      createdAt: now - 8 * 60 * 1000,
    },
  ];

  return {
    tasks: [...activeTasks, ...completedTasks, ...deadTasks],
    score: 697,
    events,
  };
};
const ANGEL_STOPWORDS = new Set([
  "надо", "нужно", "хочу", "и", "или", "но", "а", "потом", "затем", "после", "этого",
  "для", "как", "что", "это", "еще", "ещё", "просто", "вообще",
]);

function stripLocalTaskState(task) {
  if (!task || typeof task !== "object") return task;
  const { __baseLastUpdated, __pendingSyncAt, ...cleanTask } = task;
  return cleanTask;
}

function stripLocalTaskStateList(tasks = []) {
  return tasks.map((task) => stripLocalTaskState(task));
}

function formatTimeSpent(ms, language = "ru") {
  if (!ms || ms <= 0) return "—";
  const isEnglish = language === "en";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return isEnglish ? "< 1 min" : "< 1 мин";
  if (minutes < 60) return `${minutes} ${isEnglish ? "min" : "мин"}`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0
    ? `${hours} ${isEnglish ? "h" : "ч"} ${mins} ${isEnglish ? "min" : "мин"}`
    : `${hours} ${isEnglish ? "h" : "ч"}`;
}

function getDayNumberFromIsoDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function getDayKey(input = Date.now()) {
  const date = new Date(input);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultPulseState() {
  return {
    streak: 0,
    lastActionDay: null,
    lastActionAt: 0,
    lastNudgeAt: 0,
    notificationsEnabled: false,
    actionsToday: 0,
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read audio blob"));
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Invalid audio payload"));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function tokenizeAngelLabText(value = "") {
  return normalizeAngelLabTranscript(value)
    .toLowerCase()
    .replace(/[«»"'`]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isAngelLabNearDuplicate(left = "", right = "") {
  const leftNormalized = normalizeAngelLabTranscript(left).toLowerCase();
  const rightNormalized = normalizeAngelLabTranscript(right).toLowerCase();

  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;
  if (leftNormalized.length >= 8 && rightNormalized.includes(leftNormalized)) return true;
  if (rightNormalized.length >= 8 && leftNormalized.includes(rightNormalized)) return true;

  const leftTokenList = tokenizeAngelLabText(leftNormalized);
  const rightTokenList = tokenizeAngelLabText(rightNormalized);
  if (!leftTokenList.length || !rightTokenList.length) return false;

  const shorterTokens = leftTokenList.length <= rightTokenList.length ? leftTokenList : rightTokenList;
  const longerTokens = leftTokenList.length <= rightTokenList.length ? rightTokenList : leftTokenList;
  if (shorterTokens.length >= 2 && shorterTokens.length <= 3) {
    const longerSet = new Set(longerTokens);
    if (shorterTokens.every((token) => longerSet.has(token))) return true;
  }

  const leftTokens = new Set(leftTokenList);
  const rightTokens = new Set(rightTokenList);

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  if (!union) return false;

  return intersection / union >= 0.66;
}

function isAngelLabDraftStepSelected(step) {
  if (!step) return false;
  if (Object.prototype.hasOwnProperty.call(step, "selected")) {
    return Boolean(step.selected);
  }
  return Boolean(step.selectedByDefault || step.checked);
}

function normalizeAngelLabServerTaskCards(rawCards = []) {
  const result = [];

  for (const rawCard of Array.isArray(rawCards) ? rawCards : []) {
    if (result.length >= 5) break;

    const rawTitle = rawCard && typeof rawCard === "object"
      ? (rawCard.title || rawCard.text || rawCard.task || "")
      : "";
    const title = normalizeAngelLabTranscript(rawTitle);
    const mode = rawCard && typeof rawCard === "object"
      ? String(rawCard.mode || "reject").toLowerCase()
      : "reject";
    if (!title || isLowQualityAngelLabTranscript(title)) continue;
    if (result.some((item) => isAngelLabNearDuplicate(item.title, title))) continue;

    const rawStepsSource = rawCard && typeof rawCard === "object" && Array.isArray(rawCard.subtasks)
      ? rawCard.subtasks
      : [];

    const subtasks = [];
    const seenStepKeys = new Set();
    for (const rawStep of rawStepsSource) {
      if (subtasks.length >= 5) break;
      const stepText = normalizeAngelLabTranscript(
        typeof rawStep === "string"
          ? rawStep
          : (rawStep && typeof rawStep === "object" ? rawStep.text || rawStep.title || "" : ""),
      );
      if (!stepText || isLowQualityAngelLabTranscript(stepText)) continue;
      if (isAngelLabNearDuplicate(stepText, title)) continue;
      const key = stepText.toLowerCase();
      if (seenStepKeys.has(key)) continue;
      seenStepKeys.add(key);
      const stepSelected = !(rawStep && typeof rawStep === "object" && (
        rawStep.selected === false
        || rawStep.selectedByDefault === false
        || rawStep.checked === false
      ));
      subtasks.push({
        id: `server-task-${result.length + 1}-step-${subtasks.length + 1}`,
        text: stepText,
        selected: stepSelected,
        selectedByDefault: stepSelected,
        source: rawStep?.source || "dump",
        confidence: Number(rawStep?.confidence || 0),
        added: false,
      });
    }

    const steps = subtasks.map((item) => ({
      id: item.id,
      text: item.text,
      selected: Boolean(item.selected),
      added: false,
    }));

    result.push({
      id: rawCard?.id || `server-task-${result.length + 1}`,
      title,
      mode: mode === "merge" || mode === "create" || mode === "reject" ? mode : "reject",
      targetTaskId: rawCard?.targetTaskId ? String(rawCard.targetTaskId) : null,
      confidence: Number(rawCard?.confidence || 0),
      reason: String(rawCard?.reason || ""),
      added: false,
      steps,
      subtasks,
    });
  }

  return result;
}

function normalizeAngelLabExecutiveAssessment(rawAssessment = null) {
  if (!rawAssessment || typeof rawAssessment !== "object" || Array.isArray(rawAssessment)) return null;
  const state = String(rawAssessment.state || "").toLowerCase();
  if (!EXECUTIVE_STATE_COPY[state]) return null;

  const safeNextStep = normalizeAngelLabTranscript(rawAssessment.safeNextStep || "");
  const controlTaskTitle = normalizeAngelLabTranscript(rawAssessment.controlTaskTitle || "");
  return {
    state,
    confidence: Number(rawAssessment.confidence || 0),
    reason: String(rawAssessment.reason || ""),
    controlTaskId: rawAssessment.controlTaskId ? String(rawAssessment.controlTaskId) : "",
    controlTaskTitle,
    stepText: safeNextStep,
    stepIsExisting: Boolean(rawAssessment.stepIsExisting),
    shouldAddStep: Boolean(rawAssessment.shouldAddStep),
  };
}

function formatAngelLabTaskEnrichmentMessage(taskEnrichment = null) {
  const updatedTasks = Array.isArray(taskEnrichment?.updatedTasks)
    ? taskEnrichment.updatedTasks.filter((item) => item && typeof item === "object")
    : [];
  if (!updatedTasks.length) return "";

  const fieldLabels = {
    urgency: "срочность",
    resistance: "сопротивление",
    isVital: "критичность",
    deadlineAt: "дедлайн",
    lifeArea: "сфера",
    commitmentIds: "связи",
  };

  const visible = updatedTasks.slice(0, 3).map((item) => {
    const taskText = normalizeAngelLabTranscript(item.text || "");
    if (!taskText) return "";
    const labels = [...new Set(
      (Array.isArray(item.fields) ? item.fields : [])
        .map((fieldKey) => fieldLabels[fieldKey] || "")
        .filter(Boolean),
    )];
    if (!labels.length) return `«${taskText}»`;
    return `«${taskText}» (${labels.join(", ")})`;
  }).filter(Boolean);

  if (!visible.length) return "";
  const hidden = updatedTasks.length - visible.length;
  const hiddenSuffix = hidden > 0 ? ` +${hidden}` : "";
  return ` Обновила ${updatedTasks.length} задач: ${visible.join("; ")}${hiddenSuffix}.`;
}

function formatAngelLabAiDraftMessage(aiDraft = null, language = "ru") {
  if (!aiDraft || typeof aiDraft !== "object" || Array.isArray(aiDraft)) return "";
  const source = String(aiDraft.source || "").toLowerCase();
  const isEnglish = language === "en";

  if (source === "openai" || source === "openrouter") {
    const model = String(aiDraft.model || "").trim();
    const provider = source === "openrouter" ? "OpenRouter" : "OpenAI";
    return isEnglish
      ? ` AI draft ready via ${provider}${model ? ` (${model})` : ""}.`
      : ` AI-черновик готов через ${provider}${model ? ` (${model})` : ""}.`;
  }

  if (source === "simple_fallback" || source === "disabled") {
    return isEnglish
      ? " OpenAI draft was unavailable, so I used the safe local parser. Your text was not lost."
      : " OpenAI-разбор недоступен, поэтому использовала безопасный локальный parser. Текст не потерян.";
  }

  return "";
}

function formatAngelLabExecutiveAssessmentMessage(assessment = null, language = "ru") {
  if (!assessment?.state || !EXECUTIVE_STATE_COPY[assessment.state]) return "";
  const isEnglish = language === "en";
  const label = EXECUTIVE_STATE_COPY[assessment.state][isEnglish ? "en" : "ru"].label;
  const taskTitle = assessment.controlTaskTitle || "";
  if (isEnglish) {
    return taskTitle
      ? ` Angel read this as ${label} and picked “${taskTitle}” as the control task.`
      : ` Angel read this as ${label}.`;
  }
  return taskTitle
    ? ` Ангел прочитал это как состояние «${label}» и выбрал «${taskTitle}» как задачу для возврата контроля.`
    : ` Ангел прочитал это как состояние «${label}».`;
}

function mergeAngelLabTranscriptChunk(existingText = "", incomingText = "") {
  const existing = normalizeAngelLabTranscript(existingText);
  const incoming = normalizeAngelLabTranscript(incomingText);

  if (!incoming) return existing;
  if (!existing) return incoming;
  if (existing === incoming) return existing;
  if (incoming.startsWith(existing)) return incoming;
  if (existing.startsWith(incoming)) return existing;
  if (existing.endsWith(incoming)) return existing;
  if (incoming.endsWith(existing)) return incoming;
  if (existing.includes(incoming) && incoming.split(" ").length >= 3) return existing;

  const leftWords = existing.split(" ").filter(Boolean);
  const rightWords = incoming.split(" ").filter(Boolean);
  const maxOverlap = Math.min(8, leftWords.length, rightWords.length);

  for (let overlap = maxOverlap; overlap >= 2; overlap -= 1) {
    const leftTail = leftWords.slice(-overlap).join(" ");
    const rightHead = rightWords.slice(0, overlap).join(" ");
    if (leftTail === rightHead) {
      return normalizeAngelLabTranscript(`${existing} ${rightWords.slice(overlap).join(" ")}`);
    }
  }

  return normalizeAngelLabTranscript(`${existing} ${incoming}`);
}

function collapseRepeatedAngelLabPhrases(words = []) {
  if (!Array.isArray(words) || words.length < 6) return Array.isArray(words) ? words : [];

  const output = [];
  let index = 0;

  while (index < words.length) {
    let collapsed = false;

    const maxWindow = Math.min(12, Math.floor((words.length - index) / 2));
    for (let windowSize = maxWindow; windowSize >= 2; windowSize -= 1) {
      if (index + windowSize * 2 > words.length) continue;

      const left = words
        .slice(index, index + windowSize)
        .map((word) => String(word || "").toLowerCase())
        .join(" ");
      const right = words
        .slice(index + windowSize, index + windowSize * 2)
        .map((word) => String(word || "").toLowerCase())
        .join(" ");

      if (!left || left !== right) continue;

      output.push(...words.slice(index, index + windowSize));
      index += windowSize * 2;

      while (index + windowSize <= words.length) {
        const next = words
          .slice(index, index + windowSize)
          .map((word) => String(word || "").toLowerCase())
          .join(" ");
        if (next !== left) break;
        index += windowSize;
      }

      collapsed = true;
      break;
    }

    if (!collapsed) {
      output.push(words[index]);
      index += 1;
    }
  }

  return output;
}

function normalizeAngelLabTranscript(rawText = "") {
  const collapsed = String(rawText || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!collapsed) return "";

  const words = collapsed.split(" ");
  const output = [];
  let previous = "";
  let repeatCount = 0;

  for (const word of words) {
    const key = word.toLowerCase();
    if (key === previous) {
      repeatCount += 1;
      if (repeatCount >= 1) continue;
    } else {
      repeatCount = 0;
      previous = key;
    }
    output.push(word);
  }

  const phraseCollapsed = collapseRepeatedAngelLabPhrases(output);
  return phraseCollapsed.join(" ").replace(/\s+/g, " ").trim();
}

function isLowQualityAngelLabTranscript(rawText = "") {
  const text = normalizeAngelLabTranscript(rawText);
  if (!text) return true;

  const words = text.split(" ").filter(Boolean);
  if (words.length <= 2) return false;

  const punctuationCount = (text.match(/[.!?]/g) || []).length;
  const normalizedWords = words.map((word) => word.toLowerCase());
  const uniqueWordCount = new Set(normalizedWords).size;
  const uniqueRatio = uniqueWordCount / Math.max(1, words.length);

  const bigrams = [];
  for (let index = 0; index < normalizedWords.length - 1; index += 1) {
    bigrams.push(`${normalizedWords[index]} ${normalizedWords[index + 1]}`);
  }
  const bigramRatio = bigrams.length
    ? new Set(bigrams).size / bigrams.length
    : 1;

  const frequency = new Map();
  for (const word of normalizedWords) {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }
  const maxWordShare = Math.max(...frequency.values()) / Math.max(1, words.length);

  let repeatingBigram = false;
  if (normalizedWords.length >= 8) {
    const seenBigrams = new Map();
    for (let index = 0; index < normalizedWords.length - 1; index += 1) {
      const key = `${normalizedWords[index]} ${normalizedWords[index + 1]}`;
      const nextCount = (seenBigrams.get(key) || 0) + 1;
      seenBigrams.set(key, nextCount);
      if (nextCount >= 3) {
        repeatingBigram = true;
        break;
      }
    }
  }

  if (words.length >= 45 && punctuationCount === 0 && uniqueRatio < 0.55) return true;
  if (words.length >= 70 && uniqueRatio < 0.62) return true;
  if (words.length >= 45 && bigramRatio < 0.6) return true;
  if (words.length >= 6 && punctuationCount === 0 && uniqueRatio < 0.58) return true;
  if (words.length >= 6 && bigramRatio < 0.72) return true;
  if (words.length >= 6 && maxWordShare > 0.28) return true;
  if (words.length >= 12 && uniqueRatio < 0.5) return true;
  if (words.length >= 12 && maxWordShare > 0.34) return true;
  if (words.length >= 12 && repeatingBigram) return true;
  if (words.length >= 20 && punctuationCount === 0 && uniqueRatio < 0.68) return true;

  return false;
}

function loadPulseState(userId) {
  return loadStoredPulseState(userId, {
    prefix: PULSE_STORAGE_PREFIX,
    getDefaultPulseState,
    getDayKey,
  });
}

function loadCloudCache(userId) {
  return loadStoredCloudCache(userId, {
    prefix: CLOUD_CACHE_PREFIX,
    maxAgeMs: CLOUD_CACHE_MAX_AGE_MS,
    stripTasks: stripLocalTaskStateList,
  });
}

function saveCloudCache(userId, tasks, score) {
  saveStoredCloudCache(userId, tasks, score, {
    prefix: CLOUD_CACHE_PREFIX,
    stripTasks: stripLocalTaskStateList,
  });
}

function mergeSubtasks(localSubtasks = [], remoteSubtasks = [], preferRemote = true) {
  const localById = new Map(localSubtasks.map((subtask) => [String(subtask.id), subtask]));
  const remoteIds = new Set(remoteSubtasks.map((subtask) => String(subtask.id)));

  const mergedRemote = remoteSubtasks.map((remoteSubtask) => {
    const localSubtask = localById.get(String(remoteSubtask.id));
    if (!localSubtask) return remoteSubtask;
    return preferRemote
      ? { ...localSubtask, ...remoteSubtask }
      : { ...remoteSubtask, ...localSubtask };
  });

  const localOnly = localSubtasks.filter((subtask) => !remoteIds.has(String(subtask.id)));
  return [...mergedRemote, ...localOnly];
}

function getTaskBaseLastUpdated(task) {
  if (typeof task?.__baseLastUpdated === "number") return task.__baseLastUpdated;
  return typeof task?.lastUpdated === "number" ? task.lastUpdated : 0;
}

function hasFreshPendingSync(task, now = Date.now()) {
  return (
    typeof task?.__pendingSyncAt === "number" &&
    task.__pendingSyncAt > 0 &&
    now - task.__pendingSyncAt <= LOCAL_PENDING_SYNC_TTL_MS
  );
}

function markTaskFromCloud(task) {
  const cleanTask = stripLocalTaskState(task);
  return {
    ...cleanTask,
    position: resolveTaskOrderValue(cleanTask),
    __baseLastUpdated: typeof cleanTask?.lastUpdated === "number" ? cleanTask.lastUpdated : 0,
    __pendingSyncAt: 0,
  };
}

function markTaskPendingSync(task, previousTask = null) {
  const cleanTask = stripLocalTaskState(task);
  const previousBase = getTaskBaseLastUpdated(previousTask);
  const previousUpdatedAt = typeof previousTask?.lastUpdated === "number" ? previousTask.lastUpdated : 0;
  const previousOrder = resolveTaskOrderValue(previousTask);
  const nextOrder = typeof cleanTask?.position === "number" && Number.isFinite(cleanTask.position)
    ? cleanTask.position
    : previousOrder;
  return {
    ...cleanTask,
    position: nextOrder,
    __baseLastUpdated: Math.max(previousBase, previousUpdatedAt),
    __pendingSyncAt: Date.now(),
  };
}

function mergeTaskLists(localTasks = [], remoteTasks = [], options = {}) {
  return mergePlannerTaskLists(localTasks, remoteTasks, {
    ...options,
    resolveTaskOrderValue,
    sortTasks: sortTasksByOrder,
    dedupeTasks: dedupeActiveTasksByTitle,
    pendingDeletedTaskIds: pendingCloudRemovalTimestamps,
    pendingTaskStatusIntents: pendingCloudStatusIntents,
  });
}

function mergeAuthoritativeTaskLists(localTasks = [], remoteTasks = []) {
  const now = Date.now();
  const hasFreshPendingStatusIntent = [...pendingCloudStatusIntents.values()].some((intent) => {
    const createdAt = Number(intent?.at || intent?.createdAt || intent?.timestamp || 0);
    return createdAt > 0 && now - createdAt <= LOCAL_PENDING_SYNC_TTL_MS;
  });
  const hasFreshPendingRemoval = [...pendingCloudRemovalTimestamps.values()].some((timestamp) => {
    const createdAt = Number(timestamp || 0);
    return createdAt > 0 && now - createdAt <= LOCAL_PENDING_SYNC_TTL_MS;
  });

  if (hasFreshPendingStatusIntent || hasFreshPendingRemoval) {
    return mergeTaskLists(localTasks, remoteTasks);
  }

  return mergeAuthoritativePlannerTaskLists(localTasks, remoteTasks, {
    resolveTaskOrderValue,
    sortTasks: sortTasksByOrder,
    dedupeTasks: dedupeActiveTasksByTitle,
  });
}

function getUrgencyValueRank(value = "") {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function getResistanceValueRank(value = "") {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function mergeDuplicateActiveTasks(primary, duplicate) {
  const primarySubtasks = Array.isArray(primary.subtasks) ? primary.subtasks : [];
  const duplicateSubtasks = Array.isArray(duplicate.subtasks) ? duplicate.subtasks : [];
  const urgency = getUrgencyValueRank(duplicate.urgency) > getUrgencyValueRank(primary.urgency)
    ? duplicate.urgency
    : primary.urgency;
  const resistance = getResistanceValueRank(duplicate.resistance) > getResistanceValueRank(primary.resistance)
    ? duplicate.resistance
    : primary.resistance;

  return {
    ...primary,
    subtasks: mergeSubtasks(primarySubtasks, duplicateSubtasks, true),
    isToday: Boolean(primary.isToday || duplicate.isToday),
    isVital: Boolean(primary.isVital || duplicate.isVital),
    deadlineAt: primary.deadlineAt || duplicate.deadlineAt || "",
    urgency: urgency || "medium",
    resistance: resistance || "medium",
    heatBase: Math.max(Number(primary.heatBase || 0), Number(duplicate.heatBase || 0), DEFAULT_TASK_HEAT),
    heatCurrent: Math.max(Number(primary.heatCurrent || 0), Number(duplicate.heatCurrent || 0), 0),
    position: Math.min(resolveTaskOrderValue(primary), resolveTaskOrderValue(duplicate)),
    lastUpdated: Math.max(Number(primary.lastUpdated || 0), Number(duplicate.lastUpdated || 0)),
    __baseLastUpdated: Math.max(getTaskBaseLastUpdated(primary), getTaskBaseLastUpdated(duplicate)),
    __pendingSyncAt: Math.max(Number(primary.__pendingSyncAt || 0), Number(duplicate.__pendingSyncAt || 0)),
  };
}

function shouldPreferDuplicateCandidate(candidate, existing, now = Date.now()) {
  const candidatePending = hasFreshPendingSync(candidate, now);
  const existingPending = hasFreshPendingSync(existing, now);
  if (candidatePending !== existingPending) return candidatePending;

  const candidateUpdated = Number(candidate.lastUpdated || 0);
  const existingUpdated = Number(existing.lastUpdated || 0);
  if (candidateUpdated !== existingUpdated) return candidateUpdated > existingUpdated;

  const candidateSubtasks = Array.isArray(candidate.subtasks) ? candidate.subtasks.length : 0;
  const existingSubtasks = Array.isArray(existing.subtasks) ? existing.subtasks.length : 0;
  return candidateSubtasks > existingSubtasks;
}

function dedupeActiveTasksByTitle(tasks = []) {
  const now = Date.now();
  const result = [];
  const activeTitleIndex = new Map();

  for (const task of Array.isArray(tasks) ? tasks : []) {
    const duplicateKey = task?.status === "active"
      ? normalizeTaskTitleForDuplicateCheck(task.text)
      : "";

    if (!duplicateKey) {
      result.push(task);
      continue;
    }

    const existingIndex = activeTitleIndex.get(duplicateKey);
    if (existingIndex === undefined) {
      activeTitleIndex.set(duplicateKey, result.length);
      result.push(task);
      continue;
    }

    const existing = result[existingIndex];
    const preferCandidate = shouldPreferDuplicateCandidate(task, existing, now);
    result[existingIndex] = preferCandidate
      ? mergeDuplicateActiveTasks(task, existing)
      : mergeDuplicateActiveTasks(existing, task);
  }

  return sortTasksByOrder(result);
}

function getTaskHeat(task) {
  return typeof task.heatCurrent === "number" ? task.heatCurrent : task.heatBase || 0;
}

function getActiveZoneHeat(task) {
  const heat = getTaskHeat(task);
  if (heat > 60) return 80;
  if (heat > 25) return 40;
  return 10;
}

function normalizeTaskId(value) {
  return String(value).replace("task-", "");
}

function normalizeTaskTitleForDuplicateCheck(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(мне|надо|нужно|хочу|задача|задачу|пожалуйста)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeavenJunkTaskText(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return true;

  const junkPatterns = [
    /^test\d*$/,
    /^test\d*(?:[\s_-].*)?$/,
    /^тест\d*$/,
    /^тест\d*(?:[\s_-].*)?$/,
    /^тестовая(?:[\s_-].*)?$/,
    /^asdf+$/,
    /^qwe+$/,
    /^йцук+$/,
    /^123+$/,
    /^новая задача$/,
    /^new task$/,
    /^задача$/,
    /^task$/,
  ];

  if (junkPatterns.some((pattern) => pattern.test(normalized))) return true;

  const lettersOnly = normalized.replace(/[^a-zа-яё]/gi, "");
  if (lettersOnly.length >= 5) {
    const uniqueChars = new Set(lettersOnly.split(""));
    if (uniqueChars.size <= 2) return true;
  }

  return false;
}

function isProtectedFromMassHeavenCleanup(task) {
  if (!task) return true;
  if (task.isVital) return true;
  if (task.deadlineAt) return true;
  if ((task.subtasks || []).length > 0) return true;
  if (!isHeavenJunkTaskText(task.text)) {
    if ((task.activeDays || []).length > 0) return true;
    if ((task.timeSpent || 0) > 0) return true;
  }
  return false;
}

function isEligibleHeavenJunkTask(task) {
  return isHeavenJunkTaskText(task?.text) && !isProtectedFromMassHeavenCleanup(task);
}

function getTaskDecayWindowMs(task) {
  return URGENCY_DECAY_WINDOWS_MS[task?.urgency || "medium"] || URGENCY_DECAY_WINDOWS_MS.medium;
}

function isAutoDeathProtected(task) {
  return Boolean(task?.isToday || task?.isVital || task?.deadlineAt);
}

function shouldAutoReviveProtectedDeadTask(task) {
  return task?.status === "dead" && !task?.deadAt && isAutoDeathProtected(task);
}

function reviveProtectedDeadTask(task) {
  return {
    ...task,
    status: "active",
    heatBase: typeof task?.heatBase === "number" ? task.heatBase : DEFAULT_TASK_HEAT,
    heatCurrent: DEFAULT_TASK_HEAT,
    lastUpdated: Date.now(),
    deadAt: null,
    position: resolveTaskOrderValue(task),
  };
}

function parseDeadline(deadlineAt) {
  if (!deadlineAt || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineAt)) return null;
  const [year, month, day] = deadlineAt.split("-").map(Number);
  const deadline = new Date(year, month - 1, day);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

function getDaysUntilDeadline(deadlineAt, now = Date.now()) {
  const deadlineDayNumber = getDayNumberFromIsoDate(deadlineAt);
  if (deadlineDayNumber === null) return null;
  const todayDayNumber = getDayNumberFromIsoDate(getDayKey(now));
  if (todayDayNumber === null) return null;
  return deadlineDayNumber - todayDayNumber;
}

function getDeadlineInfo(task) {
  const deadline = parseDeadline(task?.deadlineAt);
  if (!deadline) return null;

  const daysLeft = getDaysUntilDeadline(task?.deadlineAt);
  const shortDate = deadline.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });

  if (daysLeft < 0) {
    return {
      daysLeft,
      tone: "overdue",
      label: `Просрочено · ${shortDate}`,
      priorityScore: 400,
      reminderIntervalMs: 10 * 60 * 1000,
    };
  }

  if (daysLeft === 0) {
    return {
      daysLeft,
      tone: "today",
      label: `Сегодня · ${shortDate}`,
      priorityScore: 350,
      reminderIntervalMs: 10 * 60 * 1000,
    };
  }

  if (daysLeft === 1) {
    return {
      daysLeft,
      tone: "soon",
      label: `Завтра · ${shortDate}`,
      priorityScore: 300,
      reminderIntervalMs: 15 * 60 * 1000,
    };
  }

  if (daysLeft <= 3) {
    return {
      daysLeft,
      tone: "soon",
      label: `${daysLeft} дн. · ${shortDate}`,
      priorityScore: 250,
      reminderIntervalMs: 20 * 60 * 1000,
    };
  }

  if (daysLeft <= 7) {
    return {
      daysLeft,
      tone: "watch",
      label: `${daysLeft} дн. · ${shortDate}`,
      priorityScore: 200,
      reminderIntervalMs: 30 * 60 * 1000,
    };
  }

  if (daysLeft <= 14) {
    return {
      daysLeft,
      tone: "watch",
      label: `${daysLeft} дн. · ${shortDate}`,
      priorityScore: 120,
      reminderIntervalMs: 45 * 60 * 1000,
    };
  }

  return {
    daysLeft,
    tone: "calm",
    label: `До ${shortDate}`,
    priorityScore: 40,
    reminderIntervalMs: NUDGE_INTERVAL_MS,
  };
}

function getLocalizedDeadlineInfo(task, language = "ru") {
  const info = getDeadlineInfo(task);
  if (!info || language !== "en") return info;

  const deadline = parseDeadline(task?.deadlineAt);
  const shortDate = deadline
    ? deadline.toLocaleDateString("en-US", { day: "numeric", month: "short" })
    : "";

  if (info.daysLeft < 0) return { ...info, label: `Overdue · ${shortDate}` };
  if (info.daysLeft === 0) return { ...info, label: `Today · ${shortDate}` };
  if (info.daysLeft === 1) return { ...info, label: `Tomorrow · ${shortDate}` };
  if (info.daysLeft <= 14) return { ...info, label: `${info.daysLeft}d · ${shortDate}` };
  return { ...info, label: `By ${shortDate}` };
}

function getOverdueCompletionRewardMeta(task) {
  const deadlineInfo = getDeadlineInfo(task);
  if (!deadlineInfo || deadlineInfo.tone !== "overdue") {
    return { bonus: 0, overdueDays: 0, tier: "none" };
  }
  if (!Number.isFinite(deadlineInfo.daysLeft)) {
    return { bonus: 0, overdueDays: 0, tier: "none" };
  }

  const overdueDays = Math.max(0, Math.ceil(-deadlineInfo.daysLeft));
  for (const tier of OVERDUE_COMPLETION_REWARD_TIERS) {
    if (overdueDays >= tier.days) {
      return { bonus: tier.bonus, overdueDays, tier: tier.tier };
    }
  }

  return { bonus: 0, overdueDays, tier: "none" };
}

function getUrgencyRank(task) {
  if (task?.urgency === "high") return 3;
  if (task?.urgency === "medium") return 2;
  return 1;
}

function getResistanceRank(task) {
  if (task?.resistance === "high") return 3;
  if (task?.resistance === "medium") return 2;
  return 1;
}

function getPriorityScore(task, now = Date.now()) {
  const deadlineScore = getDeadlineInfo(task, now)?.priorityScore || 0;
  const vitalScore = task?.isVital ? 160 : 0;
  const urgencyScore = task?.urgency === "high" ? 90 : task?.urgency === "medium" ? 45 : 0;
  const resistanceScore =
    task?.resistance === "high" ? 55 : task?.resistance === "medium" ? 25 : 0;
  const todayScore = task?.isToday ? 40 : 0;
  const heatScore = Math.max(0, 100 - getTaskHeat(task)) * 0.35;
  const staleScore = Math.min(40, Math.max(0, (now - (task?.lastUpdated || now)) / DAY_MS) * 4);

  return vitalScore + deadlineScore + urgencyScore + resistanceScore + todayScore + heatScore + staleScore;
}

function sortTasksForMission(tasks) {
  return [...tasks].sort((left, right) => {
    const priorityDelta = getPriorityScore(right) - getPriorityScore(left);
    if (priorityDelta !== 0) return priorityDelta;

    const rightDeadlineScore = getDeadlineInfo(right)?.priorityScore || 0;
    const leftDeadlineScore = getDeadlineInfo(left)?.priorityScore || 0;

    if (rightDeadlineScore > 0 && leftDeadlineScore > 0) {
      const deadlineDateDelta =
        parseDeadline(left.deadlineAt)?.getTime() - parseDeadline(right.deadlineAt)?.getTime();
      if (deadlineDateDelta !== 0) return deadlineDateDelta;
    }

    const heatDelta = getTaskHeat(left) - getTaskHeat(right);
    if (heatDelta !== 0) return heatDelta;
    return (left.lastUpdated || 0) - (right.lastUpdated || 0);
  });
}

function getMissionSelection(tasks) {
  const activeTasks = tasks.filter((task) => task.status === "active");
  if (activeTasks.length === 0) {
    return { task: null, reason: "empty", candidates: [] };
  }

  const hardDeadlineTasks = activeTasks.filter((task) => {
    const deadlineInfo = getDeadlineInfo(task);
    return deadlineInfo?.tone === "overdue" || deadlineInfo?.tone === "today";
  });

  if (hardDeadlineTasks.length > 0) {
    const candidates = sortTasksForMission(hardDeadlineTasks);
    return {
      task: candidates[0] || null,
      reason: "hard_deadline",
      candidates,
    };
  }

  const todayPinnedTasks = activeTasks.filter((task) => task.isToday);
  if (todayPinnedTasks.length > 0) {
    const candidates = sortTasksForMission(todayPinnedTasks);
    return {
      task: candidates[0] || null,
      reason: "today_shortlist",
      candidates,
    };
  }

  const criticalTasks = activeTasks.filter((task) => task.isVital);
  if (criticalTasks.length > 0) {
    const candidates = sortTasksForMission(criticalTasks);
    return {
      task: candidates[0] || null,
      reason: "critical_priority",
      candidates,
    };
  }

  const candidates = sortTasksForMission(activeTasks);
  return {
    task: candidates[0] || null,
    reason: "auto_priority",
    candidates,
  };
}

function getMissionReasonLabel(reason, language = "ru") {
  const isEnglish = language === "en";
  if (isEnglish) {
    if (reason === "hard_deadline") return "hard deadline";
    if (reason === "today_shortlist") return "today shortlist";
    if (reason === "critical_priority") return "critical priority";
    if (reason === "auto_priority") return "auto priority";
    return "no mission";
  }
  if (reason === "hard_deadline") return "жёсткий дедлайн";
  if (reason === "today_shortlist") return "из шортлиста на сегодня";
  if (reason === "critical_priority") return "критичный приоритет";
  if (reason === "auto_priority") return "автовыбор по приоритету";
  return "без цели";
}

function buildMissionCopy(task, missionReason, language = "ru") {
  const isEnglish = language === "en";
  if (!task) {
    return isEnglish
      ? "No fires today. Close loose ends or add a new goal."
      : "Сегодня можно не тушить пожары. Закрой хвосты или добавь новую цель.";
  }

  const heat = Math.floor(getTaskHeat(task));
  const openSubtasks = (task.subtasks || []).filter((subtask) => !subtask.completed).length;
  const deadlineInfo = getLocalizedDeadlineInfo(task, language);

  if (deadlineInfo?.tone === "overdue") {
    if (isEnglish) return `The deadline passed, and that is okay — the task is still reachable.${openSubtasks ? ` Open steps: ${openSubtasks}.` : ""}`;
    return `Срок уже прошёл, и это нормально — задача всё ещё достижима.${openSubtasks ? ` Открытых шагов: ${openSubtasks}.` : ""}`;
  }

  if (deadlineInfo?.tone === "today") {
    if (isEnglish) return `This needs to be closed today.${openSubtasks ? ` Steps left: ${openSubtasks}.` : ""}`;
    return `Это надо закрыть сегодня.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (missionReason === "today_shortlist") {
    if (isEnglish) return `This task comes from your manual today list.${openSubtasks ? ` Steps left: ${openSubtasks}.` : ""}`;
    return `Эта задача выбрана из вашего ручного списка на сегодня.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (missionReason === "critical_priority") {
    if (isEnglish) return `You marked this as critical, so it is at the top now.${openSubtasks ? ` Steps left: ${openSubtasks}.` : ""}`;
    return `Вы пометили это как критичное. Поэтому она сейчас сверху.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (deadlineInfo?.tone === "soon") {
    if (isEnglish) return `The deadline is close: ${deadlineInfo.label}.${openSubtasks ? ` Steps left: ${openSubtasks}.` : ""}`;
    return `Срок уже близко: ${deadlineInfo.label}.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (heat <= 15) {
    if (isEnglish) return `This is nearly dead. Do one step now, or the task will move to Cemetery.${openSubtasks ? ` Open steps: ${openSubtasks}.` : ""}`;
    return `Это уже почти труп. Сделай один шаг прямо сейчас, иначе задача уйдёт на кладбище.${openSubtasks ? ` Открытых шагов: ${openSubtasks}.` : ""}`;
  }

  if (heat <= 35) {
    if (isEnglish) return `This task is dangerously cold. One touch is enough to bring its pulse back.${openSubtasks ? ` Steps left: ${openSubtasks}.` : ""}`;
    return `Задача опасно остыла. Одного касания хватит, чтобы вернуть ей пульс.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (heat <= 60) {
    if (isEnglish) return `It is still alive, but already trying to slip out of focus.${openSubtasks ? ` Steps left: ${openSubtasks}.` : ""}`;
    return `Она ещё жива, но уже пытается сбежать из фокуса.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (isEnglish) return `This is the strongest priority candidate right now.${openSubtasks ? ` Steps left: ${openSubtasks}.` : ""}`;
  return `Это сейчас самый приоритетный кандидат по состоянию задач.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
}

function localizePlannerExplanation(text = "", language = "ru") {
  const raw = String(text || "").trim();
  if (!raw || language === "en") return raw;
  return raw
    .replace(/^The deadline is driving this choice\./, "Дедлайн толкает эту задачу наверх.")
    .replace(/^You pinned this for today, so I am keeping it visible\./, "Ты закрепила это на сегодня, поэтому я держу задачу на виду.")
    .replace(/^Angel marked this as important for today\./, "Ангел отметил это как важное на сегодня.")
    .replace(/^This is marked critical, so it should not sink into the list\./, "Это отмечено как критичное, поэтому задача не должна утонуть в списке.")
    .replace(/^This has the strongest mix of deadline, priority, resistance, and momentum\./, "У этой задачи сейчас самая сильная смесь дедлайна, приоритета, сопротивления и импульса.")
    .replace(/^This task is going cold\. A tiny move now can keep it alive\./, "Задача остывает. Один маленький шаг сейчас может удержать её живой.")
    .replace(/^This follows the current day mission\./, "Это продолжает текущую цель дня.")
    .replace(/^There is no rescue target because there are no active tasks\./, "Нет rescue-цели, потому что нет активных задач.")
    .replace(/^There is no mission because there are no active tasks\./, "Нет цели дня, потому что нет активных задач.")
    .replace(/^I picked this from the current planner state\./, "Я выбрал это по текущему состоянию планера.")
    .replace(/ Open steps: (\d+)\./, " Открытых шагов: $1.");
}

function buildNudgeMessage(task, language = "ru") {
  const isEnglish = language === "en";
  if (!task) {
    return isEnglish
      ? "Planner is back. Open it and pick one task."
      : "Planner снова здесь. Зайди и выбери себе одну задачу.";
  }

  const heat = Math.floor(getTaskHeat(task));
  const deadlineInfo = getLocalizedDeadlineInfo(task, language);
  const isMonday = new Date().getDay() === 1;

  if (deadlineInfo?.tone === "overdue") {
    if (isEnglish) return `"${task.text}" is overdue, but not doomed. Close one tiny step and keep going.`;
    return `"${task.text}" уже просрочена, но это не приговор — закрываем хотя бы маленький шаг и продолжаем.`;
  }

  if (deadlineInfo?.tone === "today") {
    if (isEnglish) return `"${task.text}" is due today. Do not let it disappear from view.`;
    return `Сегодня дедлайн по "${task.text}". Это нельзя потерять из головы.`;
  }

  if (deadlineInfo?.tone === "soon" && isMonday) {
    if (isEnglish) return `The weekend is over. "${task.text}" is getting close to its deadline.`;
    return `Выходные закончились. До срока по "${task.text}" осталось мало времени.`;
  }

  if (deadlineInfo?.tone === "soon") {
    if (isEnglish) return `"${task.text}" is getting close to its deadline. Open it and move it forward.`;
    return `До срока по "${task.text}" осталось мало времени. Зайди и сдвинь её.`;
  }

  if (heat <= 15) {
    if (isEnglish) return `"${task.text}" is almost dead. Rescue it with one action.`;
    return `"${task.text}" почти умерла. Зайди и спаси её одним действием.`;
  }

  if (heat <= 35) {
    if (isEnglish) return `"${task.text}" is cooling down. Come back and warm it up.`;
    return `"${task.text}" остывает. Вернись и подними ей температуру.`;
  }

  if (isEnglish) return `While you were away, "${task.text}" waited for your next step.`;
  return `Пока ты отвлеклась, "${task.text}" ждёт твоего следующего шага.`;
}

function getFirstOpenSubtask(task) {
  return (task?.subtasks || []).find((subtask) => !subtask.completed) || null;
}

function buildPanicPlan(task, language = "ru") {
  const isEnglish = language === "en";
  if (!task) {
    return {
      title: isEnglish ? "Nothing to grab right now" : "Сейчас не за что зацепиться",
      intro: isEnglish
        ? "There is no active goal. Add one task, and rescue will cut it into the first tiny step."
        : "Нет активной цели. Добавь одну задачу, и rescue-сессия разрежет её на первый микрошаг.",
      steps: [],
    };
  }

  const firstOpenSubtask = getFirstOpenSubtask(task);

  if (firstOpenSubtask) {
    return {
      title: task.text,
      intro: isEnglish
        ? "You do not need to do the whole task. One clear step is enough."
        : "Не надо делать всю задачу. Достаточно одного понятного шага.",
      steps: [
        firstOpenSubtask.text,
      ],
    };
  }

  return {
    title: task.text,
    intro: isEnglish
      ? "This task has no steps yet. The goal is not to finish everything; it is to start movement."
      : "У задачи пока нет подпунктов. Значит цель сейчас не сделать всё, а запустить движение.",
    steps: [
      isEnglish ? `Open anything related to "${task.text}".` : `Открой всё, что связано с задачей "${task.text}".`,
    ],
  };
}

function getTaskDisplayTitle(task) {
  return String(task?.text || task?.title || "").trim();
}

function getControlActionSignal(task) {
  const text = getTaskDisplayTitle(task).toLowerCase();
  if (!text) return "";
  if (/(оплат|заплат|перевести|invoice|pay|payment|bank)/i.test(text)) return "payment";
  if (/(отправ|подать|submit|send|apply|заявк|документ)/i.test(text)) return "submit";
  if (/(сфотк|фото|photo|picture|camera)/i.test(text)) return "photo";
  if (/(напис|ответ|письм|email|mail|reply|message)/i.test(text)) return "message";
  if (/(позвон|call|контакт)/i.test(text)) return "call";
  if (/(купить|забрать|pick up|buy|order|заказать)/i.test(text)) return "errand";
  if (/(провер|check|verify|confirm|подтверд)/i.test(text)) return "check";
  if (/(найти|search|look up|искать)/i.test(text)) return "search";
  return "";
}

function buildControlStepForTask(task, language = "ru") {
  const existingStep = getFirstOpenSubtask(task);
  if (existingStep?.text) {
    return {
      text: existingStep.text,
      isExisting: true,
      shouldAddToTask: false,
    };
  }

  const isEnglish = language === "en";
  const title = getTaskDisplayTitle(task);
  const signal = getControlActionSignal(task);
  const fallback = isEnglish
    ? `Open anything related to "${title}".`
    : `Открыть всё, что связано с «${title}».`;
  const stepBySignal = {
    payment: isEnglish ? "Open the banking app or payment page." : "Открыть банковское приложение или страницу оплаты.",
    submit: isEnglish ? "Open the form, chat, or document you need to send." : "Открыть форму, чат или документ, который надо отправить.",
    photo: isEnglish ? "Open the camera and take one usable photo." : "Открыть камеру и сделать одну пригодную фотографию.",
    message: isEnglish ? "Open the message thread and write one rough sentence." : "Открыть чат или письмо и написать одно черновое предложение.",
    call: isEnglish ? "Open the contact or call screen." : "Открыть контакт или экран звонка.",
    errand: isEnglish ? "Open the place, list, or shop connected to this task." : "Открыть место, список или магазин, связанный с задачей.",
    check: isEnglish ? "Open the place where this can be checked." : "Открыть место, где это можно проверить.",
    search: isEnglish ? "Open search and type the task name." : "Открыть поиск и ввести название задачи.",
  };

  return {
    text: stepBySignal[signal] || fallback,
    isExisting: false,
    shouldAddToTask: true,
  };
}

function getExecutiveControlScore(task, state = "stuck", missionTask = null, rescueTask = null, now = Date.now()) {
  if (!task || task.status !== "active") return Number.NEGATIVE_INFINITY;
  let score = getPriorityScore(task, now);
  const taskId = String(task.id || "");
  if (missionTask && taskId === String(missionTask.id || "")) score += 120;
  if (rescueTask && taskId === String(rescueTask.id || "")) score += 90;

  const deadlineInfo = getDeadlineInfo(task);
  if (deadlineInfo?.tone === "overdue") score += 140;
  if (deadlineInfo?.tone === "today") score += 120;
  if (deadlineInfo?.tone === "soon") score += 70;
  if (task.isToday) score += 45;
  if (task.isVital) score += 65;
  if (getTaskHeat(task) <= 25) score += 55;

  const hasOpenStep = Boolean(getFirstOpenSubtask(task));
  const actionSignal = getControlActionSignal(task);
  if (hasOpenStep) score += state === "fog" ? 110 : 80;
  if (actionSignal) score += 55;
  if (getTaskDisplayTitle(task).length <= 80) score += 18;

  if (state === "panic") {
    if (hasOpenStep || actionSignal) score += 70;
    if (/(улучшить|разобраться|жизн|систем|strategy|research)/i.test(getTaskDisplayTitle(task))) score -= 45;
  }

  if (state === "fog") {
    if (hasOpenStep) score += 60;
    if (!hasOpenStep && !actionSignal) score -= 35;
  }

  if (state === "hyperfocus") {
    if (task.isToday) score += 80;
    if (taskId === String(missionTask?.id || rescueTask?.id || "")) score += 80;
  }

  return score;
}

function getExecutiveControlReasons(task, state = "stuck", language = "ru") {
  const isEnglish = language === "en";
  const reasons = [];
  const deadlineInfo = getLocalizedDeadlineInfo(task, language);
  if (deadlineInfo?.tone === "overdue") reasons.push(isEnglish ? "overdue risk" : "есть просроченный риск");
  else if (deadlineInfo?.tone === "today") reasons.push(isEnglish ? "due today" : "срок сегодня");
  else if (deadlineInfo?.tone === "soon") reasons.push(isEnglish ? "deadline is close" : "срок близко");
  if (getFirstOpenSubtask(task)) reasons.push(isEnglish ? "has a clear first step" : "есть понятный первый шаг");
  else reasons.push(isEnglish ? "Angel can add a first step" : "ангел может добавить первый шаг");
  if (getControlActionSignal(task)) reasons.push(isEnglish ? "can restore control quickly" : "может быстро вернуть контроль");
  if (task?.isVital) reasons.push(isEnglish ? "critical priority" : "критичный приоритет");
  if (task?.isToday) reasons.push(isEnglish ? "already pressing today" : "уже давит сегодня");
  if (state === "panic") reasons.push(isEnglish ? "small enough for rescue" : "достаточно маленько для rescue");
  return [...new Set(reasons)].slice(0, 4);
}

function buildExecutiveControlSuggestion({
  tasks = [],
  state = "stuck",
  missionTask = null,
  rescueTask = null,
  language = "ru",
  now = Date.now(),
} = {}) {
  if (state === "normal") return null;
  const candidates = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task?.status === "active")
    .map((task, index) => ({
      task,
      index,
      score: getExecutiveControlScore(task, state, missionTask, rescueTask, now),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => (right.score - left.score) || (left.index - right.index));

  const winner = candidates[0]?.task || null;
  if (!winner) return null;

  const step = buildControlStepForTask(winner, language);
  return {
    task: winner,
    taskId: winner.id,
    taskTitle: getTaskDisplayTitle(winner),
    stepText: step.text,
    stepIsExisting: step.isExisting,
    shouldAddStep: step.shouldAddToTask,
    reasons: getExecutiveControlReasons(winner, state, language),
    score: candidates[0].score,
  };
}

function formatCountdown(secondsLeft) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${minutes}:${`${seconds}`.padStart(2, "0")}`;
}

function formatPlannerEventTime(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "";

  return new Date(timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPlannerDeliveryTime(value, language = "ru") {
  const timestamp = Number(value || 0);
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString(language === "en" ? "en-US" : "ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPlannerEngineTrigger(trigger = "", language = "ru") {
  const isEnglish = language === "en";
  const value = String(trigger || "").toLowerCase();
  if (value === "bootstrap") return isEnglish ? "login refresh" : "вход";
  if (value === "command") return isEnglish ? "user command" : "команда";
  if (value === "telegram_show_today") return isEnglish ? "Telegram /today" : "Telegram /today";
  if (value === "telegram_panic") return isEnglish ? "Telegram panic" : "Telegram panic";
  if (value.startsWith("telegram_nudge")) return isEnglish ? "Telegram nudge worker" : "worker Telegram-пинков";
  if (value === "cron") return isEnglish ? "cron" : "cron";
  if (value === "manual") return isEnglish ? "manual check" : "ручная проверка";
  if (value === "nudge" || value === "scheduled") return isEnglish ? "scheduled nudge" : "плановый пинок";
  return value;
}

function getDeliveryTimestamp(value = {}) {
  return Number(
    value?.updatedAt ||
    value?.updated_at ||
    value?.createdAt ||
    value?.created_at ||
    value?.lastAt ||
    value?.last_at ||
    value?.sentAt ||
    value?.sent_at ||
    value?.resultAt ||
    value?.result_at ||
    0
  );
}

function getTelegramLinkState(plannerMeta = {}) {
  const direct = plannerMeta?.telegram_link_status && typeof plannerMeta.telegram_link_status === "object"
    ? plannerMeta.telegram_link_status
    : null;
  const healthTelegram = plannerMeta?.health_snapshot?.telegram && typeof plannerMeta.health_snapshot.telegram === "object"
    ? plannerMeta.health_snapshot.telegram
    : null;
  const source = direct || healthTelegram || {};
  return {
    status: String(source.status || "").toLowerCase(),
    linkedAt: Number(source.linkedAt || source.linked_at || 0),
    lastSeenAt: Number(source.lastSeenAt || source.last_seen_at || source.linkedAt || source.linked_at || 0),
  };
}

function getPlannerEventTimestamp(event = {}) {
  return Number(
    event?.updatedAt ||
    event?.updated_at ||
    event?.createdAt ||
    event?.created_at ||
    event?.lastAt ||
    event?.last_at ||
    event?.sentAt ||
    event?.sent_at ||
    event?.resultAt ||
    event?.result_at ||
    event?.payload?.updatedAt ||
    event?.payload?.updated_at ||
    event?.payload?.createdAt ||
    event?.payload?.created_at ||
    event?.payload?.sentAt ||
    event?.payload?.sent_at ||
    0
  );
}

function getTelegramLiveTimestamp(plannerMeta = {}, plannerEvents = []) {
  const linkState = getTelegramLinkState(plannerMeta);
  let latest = Number(
    linkState.lastSeenAt ||
    linkState.linkedAt ||
    plannerMeta?.telegramLastSeenAtMs ||
    plannerMeta?.telegramLinkedAtMs ||
    0
  );
  const commandHistory = Array.isArray(plannerMeta?.command_history)
    ? plannerMeta.command_history
    : Array.isArray(plannerMeta?.commandHistory)
      ? plannerMeta.commandHistory
      : [];
  [...(Array.isArray(plannerEvents) ? plannerEvents : []), ...commandHistory].forEach((event) => {
    const timestamp = getPlannerEventTimestamp(event);
    if (!timestamp) return;
    const status = String(event?.status || event?.payload?.status || event?.result?.status || "").toLowerCase();
    const errorCode = String(event?.errorCode || event?.error_code || event?.payload?.errorCode || event?.payload?.error_code || event?.diagnostic?.code || event?.payload?.diagnostic?.code || "").toLowerCase();
    const haystack = [
      event?.type,
      event?.eventType,
      event?.source,
      event?.actor,
      event?.action,
      event?.commandType,
      event?.payload?.type,
      event?.payload?.source,
      event?.payload?.actor,
      event?.payload?.action,
      event?.payload?.commandType,
      event?.payload?.channel,
      event?.payload?.trigger,
      event?.result?.source,
      event?.result?.channel,
    ].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes("telegram")) return;
    if (errorCode.includes("unreachable")) return;
    if (status === "dead" || status === "retry" || status === "failed") return;
    latest = Math.max(latest, timestamp);
  });
  return latest;
}

function isTelegramDeliveryRecovered(delivery = {}, plannerMeta = {}, plannerEvents = []) {
  const channel = String(delivery?.channel || "").toLowerCase();
  const status = String(delivery?.status || "").toLowerCase();
  const errorCode = String(delivery?.errorCode || delivery?.error_code || delivery?.diagnostic?.code || "").toLowerCase();
  const failedBeforeRelink = status === "dead" || status === "retry" || status === "failed" || status === "recovered";
  if (channel !== "telegram" || !failedBeforeRelink || errorCode !== "telegram_chat_unreachable") return false;
  const linkedAt = getTelegramLiveTimestamp(plannerMeta, plannerEvents);
  const deliveryAt = getDeliveryTimestamp(delivery);
  return linkedAt > 0 && (!deliveryAt || linkedAt >= deliveryAt);
}

function isStaleTelegramDeliveryFailure(delivery = {}, plannerMeta = {}, plannerEvents = []) {
  const channel = String(delivery?.channel || "").toLowerCase();
  const status = String(delivery?.status || "").toLowerCase();
  const errorCode = String(delivery?.errorCode || delivery?.error_code || delivery?.diagnostic?.code || "").toLowerCase();
  const failedBeforeRelink = status === "dead" || status === "retry" || status === "failed";
  if (channel !== "telegram" || !failedBeforeRelink || errorCode !== "telegram_chat_unreachable") return false;
  if (isTelegramDeliveryRecovered(delivery, plannerMeta, plannerEvents)) return false;
  const backlog = plannerMeta?.outbox_backlog && typeof plannerMeta.outbox_backlog === "object"
    ? plannerMeta.outbox_backlog
    : plannerMeta?.health_snapshot?.outbox?.backlog && typeof plannerMeta.health_snapshot.outbox.backlog === "object"
      ? plannerMeta.health_snapshot.outbox.backlog
      : {};
  return Number(backlog.dead || 0) <= 0 && Number(backlog.retry || 0) <= 0 && Number(backlog.pending || 0) <= 0;
}

function formatDeliveryDiagnostic(diagnostic = null, fallback = "", language = "ru") {
  const isEnglish = language === "en";
  const code = String(diagnostic?.code || "").toLowerCase();
  const message = String(diagnostic?.message || fallback || "").trim();
  const messages = {
    telegram_chat_unreachable: isEnglish
      ? "Telegram chat is unreachable. Re-link the bot or check if it was blocked."
      : "Telegram-чат недоступен. Нужно перепривязать бота или проверить, не заблокирован ли он.",
    telegram_token_invalid: isEnglish
      ? "Telegram token is invalid. Check TELEGRAM_BOT_TOKEN."
      : "Telegram token невалидный. Проверь TELEGRAM_BOT_TOKEN.",
    telegram_rate_limited: isEnglish
      ? "Telegram rate limit hit. Retry later."
      : "Telegram ограничил отправку. Нужно повторить позже.",
    telegram_send_failed: isEnglish
      ? "Telegram send failed. Check bot token, chat id, and API response."
      : "Telegram-отправка упала. Проверь bot token, chat id и ответ API.",
    email_not_configured: isEnglish
      ? "Email is not configured. Check RESEND_API_KEY and sender settings."
      : "Email не настроен. Проверь RESEND_API_KEY и отправителя.",
    email_sender_invalid: isEnglish
      ? "Email sender/domain is not accepted by the provider."
      : "Email-отправитель или домен не принят провайдером.",
    email_auth_failed: isEnglish
      ? "Email provider rejected credentials."
      : "Email-провайдер отклонил credentials.",
    email_send_failed: isEnglish
      ? "Email send failed. Check provider response and recipient settings."
      : "Email-отправка упала. Проверь ответ провайдера и получателя.",
    network_error: isEnglish
      ? "Network/provider request failed. Retry should recover if the provider comes back."
      : "Сетевая ошибка или провайдер недоступен. Retry должен восстановиться, если провайдер оживёт.",
    unknown_delivery_error: isEnglish
      ? "Unknown delivery error. Check provider logs."
      : "Неизвестная ошибка доставки. Нужно смотреть логи провайдера.",
  };
  return messages[code] || message;
}

function getDeliveryHealthRows({ deliveryStatus, plannerMeta, plannerEvents, language = "ru" }) {
  const isEnglish = language === "en";
  const status = deliveryStatus && typeof deliveryStatus === "object" ? deliveryStatus : null;
  const channel = String(status?.channel || "").toLowerCase();
  const health = plannerMeta?.health_snapshot && typeof plannerMeta.health_snapshot === "object" ? plannerMeta.health_snapshot : {};
  const healthChannels = health?.deliveryChannels && typeof health.deliveryChannels === "object"
    ? health.deliveryChannels
    : health?.delivery_channels && typeof health.delivery_channels === "object"
      ? health.delivery_channels
      : {};
  const plannerChannels = plannerMeta?.delivery_channels && typeof plannerMeta.delivery_channels === "object"
    ? plannerMeta.delivery_channels
    : {};
  const latestDeliveryEvents = (Array.isArray(plannerEvents) ? plannerEvents : [])
    .filter((event) => String(event.type || event.eventType || "").toLowerCase().includes("outbox"))
    .slice(0, 8);

  const getChannelEvent = (targetChannel) => latestDeliveryEvents.find((event) => (
    String(event.payload?.channel || event.source || "").toLowerCase() === targetChannel
  ));
  const buildRow = (targetChannel) => {
    const event = healthChannels[targetChannel] || plannerChannels[targetChannel] || (channel === targetChannel ? status : getChannelEvent(targetChannel));
    const label = targetChannel === "telegram" ? "Telegram" : "Email";
    const eventStatus = String(event?.status || event?.payload?.status || "").toLowerCase();
    const eventTime = Number(event?.updatedAt || event?.updated_at || event?.resultAt || event?.result_at || event?.createdAt || event?.lastAt || event?.last_at || event?.sentAt || event?.sent_at || 0);
    const eventError = String(event?.lastError || event?.last_error || event?.payload?.error || "");
    const eventDiagnostic = event?.diagnostic || event?.payload?.diagnostic || null;
    const eventAttempt = Number(event?.attempt || event?.payload?.attempt || 0);
    const eventErrorCode = String(event?.errorCode || event?.error_code || event?.payload?.errorCode || event?.payload?.error_code || eventDiagnostic?.code || "");
    const telegramRecovered = targetChannel === "telegram" && isTelegramDeliveryRecovered({
      ...event,
      status: eventStatus,
      channel: targetChannel,
      errorCode: eventErrorCode,
      diagnostic: eventDiagnostic,
    }, plannerMeta, plannerEvents);
    const telegramStaleFailure = targetChannel === "telegram" && isStaleTelegramDeliveryFailure({
      ...event,
      status: eventStatus,
      channel: targetChannel,
      errorCode: eventErrorCode,
      diagnostic: eventDiagnostic,
    }, plannerMeta, plannerEvents);
    if (telegramRecovered) {
      const linkState = getTelegramLinkState(plannerMeta);
      const liveAt = getTelegramLiveTimestamp(plannerMeta, plannerEvents);
      return {
        key: targetChannel,
        label,
        status: "linked",
        text: isEnglish
          ? `Bot responded ${formatPlannerDeliveryTime(liveAt || linkState.lastSeenAt || linkState.linkedAt, language)}`
          : `Бот ответил ${formatPlannerDeliveryTime(liveAt || linkState.lastSeenAt || linkState.linkedAt, language)}`,
        detail: isEnglish
          ? "Old scheduled delivery failed before reconnect. Commands should work now."
          : "Старая плановая доставка упала до перепривязки. Команды сейчас должны работать.",
        errorCode: "",
        tone: "ok",
      };
    }
    if (telegramStaleFailure) {
      return {
        key: targetChannel,
        label,
        status: "stale_failure",
        text: isEnglish ? "Old delivery failed earlier" : "Старая доставка падала раньше",
        detail: isEnglish
          ? "No dead/retry/pending Telegram backlog is active now. Use /today in Telegram as the live bot check."
          : "Сейчас нет активной dead/retry/pending очереди Telegram. Живая проверка бота — команда /today в Telegram.",
        errorCode: "",
        tone: "neutral",
      };
    }
    const nextRetryAt = Number(event?.availableAt || event?.available_at || 0);
    const isOk = eventStatus === "sent";
    const isWarning = eventStatus === "retry" || eventStatus === "dead" || Boolean(eventError);
    const text = !event
      ? (isEnglish ? "No delivery signal yet" : "Пока нет сигнала доставки")
      : eventStatus === "sent"
        ? (isEnglish ? `Last sent ${formatPlannerDeliveryTime(eventTime, language)}` : `Последняя отправка ${formatPlannerDeliveryTime(eventTime, language)}`)
        : eventStatus === "queued"
          ? (isEnglish ? `Queued ${formatPlannerDeliveryTime(eventTime, language)}` : `В очереди ${formatPlannerDeliveryTime(eventTime, language)}`)
        : eventStatus === "retry"
            ? (isEnglish ? `Retry planned ${formatPlannerDeliveryTime(nextRetryAt, language)}` : `Повтор ${formatPlannerDeliveryTime(nextRetryAt, language)}`)
            : eventStatus === "dead"
              ? (isEnglish ? "Delivery stopped after retries" : "Доставка остановлена после повторов")
              : (isEnglish ? "Delivery status unknown" : "Статус доставки неизвестен");
    const detail = [
      eventAttempt ? `${isEnglish ? "attempt" : "попытка"} ${eventAttempt}` : "",
      eventErrorCode,
      formatDeliveryDiagnostic(eventDiagnostic, eventError, language),
    ].filter(Boolean).join(" · ");
    return {
      key: targetChannel,
      label,
      status: eventStatus || "missing",
      text,
      detail,
      errorCode: eventErrorCode || String(eventDiagnostic?.code || ""),
      tone: isWarning ? "warning" : isOk ? "ok" : "neutral",
    };
  };

  const engineRun = plannerMeta?.last_engine_run && typeof plannerMeta.last_engine_run === "object"
    ? plannerMeta.last_engine_run
    : null;
  const bootstrapRun = plannerMeta?.last_bootstrap_tick && typeof plannerMeta.last_bootstrap_tick === "object"
    ? plannerMeta.last_bootstrap_tick
    : null;
  const cronRun = plannerMeta?.last_cron_tick && typeof plannerMeta.last_cron_tick === "object"
    ? plannerMeta.last_cron_tick
    : null;
  const outboxRun = plannerMeta?.last_outbox_drain && typeof plannerMeta.last_outbox_drain === "object"
    ? plannerMeta.last_outbox_drain
    : null;
  const engineStatus = String(engineRun?.status || "").toLowerCase();
  const engineTrigger = formatPlannerEngineTrigger(engineRun?.trigger, language);
  const engineStats = engineRun?.stats && typeof engineRun.stats === "object" ? engineRun.stats : {};
  const bootstrapStatus = String(bootstrapRun?.status || "").toLowerCase();
  const bootstrapStats = bootstrapRun?.stats && typeof bootstrapRun.stats === "object" ? bootstrapRun.stats : {};
  const cronStatus = String(cronRun?.status || "").toLowerCase();
  const cronTrigger = formatPlannerEngineTrigger(cronRun?.trigger, language);
  const cronStats = cronRun?.stats && typeof cronRun.stats === "object" ? cronRun.stats : {};
  const outboxStatus = String(outboxRun?.status || "").toLowerCase();
  const outboxStats = outboxRun?.stats && typeof outboxRun.stats === "object" ? outboxRun.stats : {};
  const outboxBacklog = plannerMeta?.outbox_backlog && typeof plannerMeta.outbox_backlog === "object"
    ? plannerMeta.outbox_backlog
    : {};
  const backlogDetail = isEnglish
    ? `backlog pending ${Number(outboxBacklog.pending || 0)} · retry ${Number(outboxBacklog.retry || 0)} · dead ${Number(outboxBacklog.dead || 0)}`
    : `очередь pending ${Number(outboxBacklog.pending || 0)} · retry ${Number(outboxBacklog.retry || 0)} · dead ${Number(outboxBacklog.dead || 0)}`;
  const lastTickAt = Number(engineRun?.finished_at || engineRun?.finishedAt || plannerMeta?.lastTickAt || plannerMeta?.last_tick_at || plannerMeta?.updatedAt || plannerMeta?.updated_at || 0);
  const lastBootstrapAt = Number(bootstrapRun?.finished_at || bootstrapRun?.finishedAt || 0);
  const lastCronAt = Number(cronRun?.finished_at || cronRun?.finishedAt || 0);
  const lastOutboxAt = Number(outboxRun?.finished_at || outboxRun?.finishedAt || 0);
  const engineWarning = engineStatus === "failed";
  const bootstrapHasLiveTimestamp = Boolean(lastBootstrapAt);
  const cronHasLiveTimestamp = Boolean(lastCronAt);
  const outboxHasLiveTimestamp = Boolean(lastOutboxAt);
  const bootstrapWarning = bootstrapStatus === "failed" && !bootstrapHasLiveTimestamp;
  const cronWarning = (cronStatus === "failed" && !cronHasLiveTimestamp) || (lastCronAt && Date.now() - lastCronAt > 14 * 60 * 60 * 1000);
  const outboxWarning = outboxStatus === "failed"
    || (outboxStatus === "warning" && !outboxHasLiveTimestamp)
    || Number(outboxBacklog.retry || 0) > 0
    || Number(outboxBacklog.dead || 0) > 0;
  const engineText = lastTickAt
    ? engineStatus === "failed"
      ? (isEnglish ? `Failed ${formatPlannerDeliveryTime(lastTickAt, language)}` : `Ошибка ${formatPlannerDeliveryTime(lastTickAt, language)}`)
      : engineStatus === "locked"
        ? (isEnglish ? `Skipped: another run was active ${formatPlannerDeliveryTime(lastTickAt, language)}` : `Пропущено: другой запуск был активен ${formatPlannerDeliveryTime(lastTickAt, language)}`)
        : (isEnglish
          ? `Last run${engineTrigger ? ` · ${engineTrigger}` : ""} ${formatPlannerDeliveryTime(lastTickAt, language)}`
          : `Последний запуск${engineTrigger ? ` · ${engineTrigger}` : ""} ${formatPlannerDeliveryTime(lastTickAt, language)}`)
    : (isEnglish ? "No engine tick timestamp yet" : "Пока нет времени последнего запуска");
  const engineDetail = engineRun?.error
    ? String(engineRun.error)
    : engineRun
      ? (isEnglish
        ? `heat ${Number(engineStats.heatUpdated || 0)} · cemetery ${Number(engineStats.deadCount || 0)} · outbox ${Number(engineStats.outboxQueued || 0)}`
        : `пульс ${Number(engineStats.heatUpdated || 0)} · кладбище ${Number(engineStats.deadCount || 0)} · outbox ${Number(engineStats.outboxQueued || 0)}`)
      : "";
  const bootstrapText = lastBootstrapAt
    ? bootstrapStatus === "failed"
      ? (isEnglish ? `Failed ${formatPlannerDeliveryTime(lastBootstrapAt, language)}` : `Ошибка ${formatPlannerDeliveryTime(lastBootstrapAt, language)}`)
      : bootstrapStatus === "locked"
        ? (isEnglish ? `Skipped: engine was already awake ${formatPlannerDeliveryTime(lastBootstrapAt, language)}` : `Пропущено: движок уже работал ${formatPlannerDeliveryTime(lastBootstrapAt, language)}`)
        : (isEnglish ? `Last login refresh ${formatPlannerDeliveryTime(lastBootstrapAt, language)}` : `Последнее обновление при входе ${formatPlannerDeliveryTime(lastBootstrapAt, language)}`)
    : (isEnglish ? "No login refresh recorded yet" : "Пока нет запуска при входе");
  const bootstrapDetail = bootstrapRun?.error
    ? String(bootstrapRun.error)
    : bootstrapRun
      ? (isEnglish
        ? `heat ${Number(bootstrapStats.heatUpdated || 0)} · cemetery ${Number(bootstrapStats.deadCount || 0)} · events ${Number(bootstrapStats.eventCount || 0)}`
        : `пульс ${Number(bootstrapStats.heatUpdated || 0)} · кладбище ${Number(bootstrapStats.deadCount || 0)} · события ${Number(bootstrapStats.eventCount || 0)}`)
      : "";
  const cronText = lastCronAt
    ? cronStatus === "failed"
      ? (isEnglish ? `Failed ${formatPlannerDeliveryTime(lastCronAt, language)}` : `Ошибка ${formatPlannerDeliveryTime(lastCronAt, language)}`)
      : cronStatus === "locked"
        ? (isEnglish ? `Skipped: engine was already awake ${formatPlannerDeliveryTime(lastCronAt, language)}` : `Пропущено: движок уже работал ${formatPlannerDeliveryTime(lastCronAt, language)}`)
        : (isEnglish
          ? `Last scheduled run${cronTrigger ? ` · ${cronTrigger}` : ""} ${formatPlannerDeliveryTime(lastCronAt, language)}`
          : `Последний плановый запуск${cronTrigger ? ` · ${cronTrigger}` : ""} ${formatPlannerDeliveryTime(lastCronAt, language)}`)
    : (isEnglish ? "No scheduled worker recorded yet" : "Пока нет записи планового worker");
  const cronDetail = cronRun?.error
    ? String(cronRun.error)
    : cronRun
      ? (isEnglish
        ? `heat ${Number(cronStats.heatUpdated || 0)} · cemetery ${Number(cronStats.deadCount || 0)} · outbox ${Number(cronStats.outboxQueued || 0)}`
        : `пульс ${Number(cronStats.heatUpdated || 0)} · кладбище ${Number(cronStats.deadCount || 0)} · outbox ${Number(cronStats.outboxQueued || 0)}`)
      : "";
  const outboxText = lastOutboxAt
    ? outboxWarning
      ? (isEnglish ? `Processed with issues ${formatPlannerDeliveryTime(lastOutboxAt, language)}` : `Обработано с проблемами ${formatPlannerDeliveryTime(lastOutboxAt, language)}`)
      : (isEnglish ? `Last drain ${formatPlannerDeliveryTime(lastOutboxAt, language)}` : `Последняя обработка ${formatPlannerDeliveryTime(lastOutboxAt, language)}`)
    : (isEnglish ? "No outbox drain timestamp yet" : "Пока нет времени обработки очереди");
  const outboxDetail = outboxRun
    ? `${isEnglish
      ? `claimed ${Number(outboxStats.claimed || 0)} · sent ${Number(outboxStats.sent || 0)} · retry ${Number(outboxStats.retry || 0)} · dead ${Number(outboxStats.dead || 0)}`
      : `взято ${Number(outboxStats.claimed || 0)} · отправлено ${Number(outboxStats.sent || 0)} · retry ${Number(outboxStats.retry || 0)} · dead ${Number(outboxStats.dead || 0)}`} · ${backlogDetail}`
    : backlogDetail;
  return [
    buildRow("telegram"),
    buildRow("email"),
    {
      key: "bootstrap",
      label: isEnglish ? "Login refresh" : "Обновление при входе",
      status: bootstrapStatus || (lastBootstrapAt ? "ok" : "missing"),
      text: bootstrapText,
      detail: bootstrapDetail,
      tone: bootstrapWarning ? "warning" : lastBootstrapAt ? "ok" : "neutral",
    },
    {
      key: "scheduled",
      label: isEnglish ? "Scheduled worker" : "Плановый worker",
      status: cronStatus || (lastCronAt ? "ok" : "missing"),
      text: cronText,
      detail: cronDetail,
      tone: cronWarning ? "warning" : lastCronAt ? "ok" : "neutral",
    },
    {
      key: "engine",
      label: isEnglish ? "Engine tick" : "Тик движка",
      status: engineStatus || (lastTickAt ? "ok" : "missing"),
      text: engineText,
      detail: engineDetail,
      tone: engineWarning ? "warning" : lastTickAt ? "ok" : "neutral",
    },
    {
      key: "outbox",
      label: isEnglish ? "Outbox drain" : "Очередь доставки",
      status: outboxStatus || (lastOutboxAt ? "ok" : "missing"),
      text: outboxText,
      detail: outboxDetail,
      tone: outboxWarning ? "warning" : lastOutboxAt ? "ok" : "neutral",
    },
  ];
}

function getDeliveryHealthSummary({ deliveryStatus, plannerMeta, plannerEvents, language = "ru" }) {
  const isEnglish = language === "en";
  const health = plannerMeta?.health_snapshot && typeof plannerMeta.health_snapshot === "object"
    ? plannerMeta.health_snapshot
    : null;
  const healthStatus = String(health?.status || "").toLowerCase();
  const healthReason = String(health?.reason || "").toLowerCase();
  if (health) {
    const titleMap = {
      healthy: isEnglish ? "Planner engine healthy" : "Движок планера живой",
      engine_failed: isEnglish ? "Engine failed" : "Движок упал",
      scheduled_worker_failed: isEnglish ? "Scheduled worker failed" : "Плановый worker упал",
      delivery_dead: isEnglish ? "Latest delivery is dead" : "Последняя доставка умерла",
      delivery_retry: isEnglish ? "Latest delivery is retrying" : "Последняя доставка повторяется",
      outbox_dead: isEnglish ? "Outbox stuck" : "Outbox застрял",
      outbox_retry: isEnglish ? "Delivery retrying" : "Доставка повторяется",
      telegram_target_mismatch: isEnglish ? "Telegram target mismatch" : "Telegram отправлялся не в тот чат",
      engine_stale: isEnglish ? "Engine heartbeat is stale" : "Heartbeat движка устарел",
      scheduled_worker_stale: isEnglish ? "Scheduled worker is stale" : "Плановый worker устарел",
      engine_missing: isEnglish ? "Engine has no heartbeat yet" : "У движка ещё нет heartbeat",
      scheduled_worker_missing: isEnglish ? "Login refresh works · scheduled worker not seen yet" : "Вход будит движок · worker пока не виден",
    };
    const outboxBacklog = health.outbox?.backlog && typeof health.outbox.backlog === "object" ? health.outbox.backlog : {};
    const pending = Number(outboxBacklog.pending || 0);
    const retry = Number(outboxBacklog.retry || 0);
    const dead = Number(outboxBacklog.dead || 0);
    const delivery = health.delivery && typeof health.delivery === "object" ? health.delivery : null;
    const deliveryChannel = String(delivery?.channel || "").trim();
    const deliveryStatus = String(delivery?.status || "").trim();
    const deliveryAttempt = Number(delivery?.attempt || 0);
    const deliveryError = String(delivery?.errorCode || delivery?.lastError || "").trim();
    const deliveryHint = String(delivery?.errorHint || "").trim();
    const telegramRecovered = isTelegramDeliveryRecovered({
      ...delivery,
      status: deliveryStatus,
      errorCode: deliveryError,
    }, plannerMeta, plannerEvents);
    const telegramStaleFailure = isStaleTelegramDeliveryFailure({
      ...delivery,
      status: deliveryStatus,
      errorCode: deliveryError,
    }, plannerMeta, plannerEvents);
    if (telegramRecovered) {
      const linkState = getTelegramLinkState(plannerMeta);
      const liveAt = getTelegramLiveTimestamp(plannerMeta, plannerEvents);
      return {
        tone: "ok",
        title: isEnglish ? "Telegram bot reconnected" : "Telegram-бот переподключён",
        body: isEnglish
          ? `Bot responded ${formatPlannerDeliveryTime(liveAt || linkState.lastSeenAt || linkState.linkedAt, language)}. The red delivery record is an old scheduled-send failure.`
          : `Бот ответил ${formatPlannerDeliveryTime(liveAt || linkState.lastSeenAt || linkState.linkedAt, language)}. Красная запись доставки — старый сбой плановой отправки.`,
      };
    }
    if (telegramStaleFailure) {
      return {
        tone: "neutral",
        title: isEnglish ? "Old Telegram delivery failed" : "Старая Telegram-доставка падала",
        body: isEnglish
          ? "There is no active dead/retry/pending Telegram backlog now. If /today replies in Telegram, the bot chat is working."
          : "Сейчас нет активной dead/retry/pending очереди Telegram. Если /today отвечает в Telegram, чат бота работает.",
      };
    }
    const engineAt = Number(health.engine?.lastAt || 0);
    const workerAt = Number(health.scheduledWorker?.lastAt || 0);
    const body = healthReason === "healthy"
      ? (isEnglish
        ? `Last engine ${formatPlannerDeliveryTime(engineAt, language)}. Queue: ${pending} pending, ${retry} retry, ${dead} dead.`
        : `Последний тик ${formatPlannerDeliveryTime(engineAt, language)}. Очередь: ${pending} pending, ${retry} retry, ${dead} dead.`)
      : healthReason === "telegram_target_mismatch"
        ? (isEnglish
          ? "The latest Telegram nudge was sent to a different chat hash than the currently allowed/linked target."
          : "Последний Telegram-пинок ушёл в другой chatHash, не в текущую разрешённую/привязанную цель.")
      : healthReason === "scheduled_worker_missing"
        ? (isEnglish
          ? "The planner refreshes on login. Waiting for the first scheduled worker heartbeat."
          : "Планер обновляется при входе. Ждём первый heartbeat планового worker.")
        : healthReason.startsWith("delivery_")
          ? [
            deliveryChannel ? `${deliveryChannel}${deliveryStatus ? ` ${deliveryStatus}` : ""}` : "",
            deliveryAttempt ? `${isEnglish ? "attempt" : "попытка"} ${deliveryAttempt}` : "",
            deliveryError,
            deliveryHint,
          ].filter(Boolean).join(" · ") || (isEnglish ? "Latest delivery attempt needs attention." : "Последняя попытка доставки требует внимания.")
        : healthReason.includes("worker")
          ? (isEnglish
            ? `Last scheduled worker: ${formatPlannerDeliveryTime(workerAt, language) || "unknown"}. Nudges may be delayed.`
            : `Последний плановый worker: ${formatPlannerDeliveryTime(workerAt, language) || "неизвестно"}. Пинки могут запаздывать.`)
          : (isEnglish
            ? `Engine: ${health.engine?.status || "unknown"} · outbox pending ${pending} · retry ${retry} · dead ${dead}.`
            : `Движок: ${health.engine?.status || "unknown"} · pending ${pending} · retry ${retry} · dead ${dead}.`);
    return {
      tone: healthStatus === "warning" ? "warning" : healthStatus === "ok" ? "ok" : "neutral",
      title: titleMap[healthReason] || (isEnglish ? "Planner health snapshot" : "Снимок здоровья планера"),
      body,
    };
  }
  const rows = getDeliveryHealthRows({ deliveryStatus, plannerMeta, plannerEvents, language });
  const outboxBacklog = plannerMeta?.outbox_backlog && typeof plannerMeta.outbox_backlog === "object"
    ? plannerMeta.outbox_backlog
    : {};
  const retryCount = Number(outboxBacklog.retry || 0);
  const deadCount = Number(outboxBacklog.dead || 0);
  const pendingCount = Number(outboxBacklog.pending || 0);
  const engineRun = plannerMeta?.last_engine_run && typeof plannerMeta.last_engine_run === "object"
    ? plannerMeta.last_engine_run
    : null;
  const cronRun = plannerMeta?.last_cron_tick && typeof plannerMeta.last_cron_tick === "object"
    ? plannerMeta.last_cron_tick
    : null;
  const engineStatus = String(engineRun?.status || "").toLowerCase();
  const cronStatus = String(cronRun?.status || "").toLowerCase();
  const lastTickAt = Number(engineRun?.finished_at || engineRun?.finishedAt || plannerMeta?.lastTickAt || plannerMeta?.last_tick_at || plannerMeta?.updatedAt || plannerMeta?.updated_at || 0);
  const lastCronAt = Number(cronRun?.finished_at || cronRun?.finishedAt || 0);
  const engineIsStale = lastTickAt && Date.now() - lastTickAt > 6 * 60 * 60 * 1000;
  const cronIsStale = lastCronAt && Date.now() - lastCronAt > 14 * 60 * 60 * 1000;
  const telegramRow = rows.find((row) => row.key === "telegram");
  const emailRow = rows.find((row) => row.key === "email");
  const telegramSent = telegramRow?.status === "sent";
  const emailSent = emailRow?.status === "sent";

  if (deadCount > 0) {
    return {
      tone: "warning",
      title: isEnglish ? "Outbox stuck" : "Outbox застрял",
      body: isEnglish
        ? `${deadCount} message(s) stopped after retries. Delivery needs attention.`
        : `${deadCount} сообщ. остановлено после повторов. Доставку надо проверить.`,
    };
  }

  if (retryCount > 0) {
    return {
      tone: "warning",
      title: isEnglish ? "Delivery retrying" : "Доставка повторяется",
      body: isEnglish
        ? `${retryCount} message(s) are waiting for another send attempt.`
        : `${retryCount} сообщ. ждёт повторной отправки.`,
    };
  }

  if (engineStatus === "failed") {
    return {
      tone: "warning",
      title: isEnglish ? "Engine failed" : "Движок упал",
      body: isEnglish
        ? "The planner brain reported a failed tick. Check the engine run before trusting proactive changes."
        : "Мозг планера сообщил об ошибке тика. Стоит проверить engine run перед доверием к авто-действиям.",
    };
  }

  if (cronStatus === "failed") {
    return {
      tone: "warning",
      title: isEnglish ? "Scheduled worker failed" : "Плановый worker упал",
      body: isEnglish
        ? "The site can still refresh on login, but proactive nudges may be broken."
        : "Сайт всё ещё может обновляться при входе, но проактивные пинки могут быть сломаны.",
    };
  }

  if (!lastTickAt) {
    return {
      tone: "neutral",
      title: isEnglish ? "Engine has no heartbeat yet" : "У движка ещё нет heartbeat",
      body: isEnglish
        ? "No planner tick has been recorded yet. The first cron or command should create it."
        : "Пока не записан ни один тик планера. Первый cron или команда должны его создать.",
    };
  }

  if (engineIsStale) {
    return {
      tone: "warning",
      title: isEnglish ? "Engine heartbeat is stale" : "Heartbeat движка устарел",
      body: isEnglish
        ? `Last tick was ${formatPlannerDeliveryTime(lastTickAt, language)}. Proactive updates may be delayed.`
        : `Последний тик был ${formatPlannerDeliveryTime(lastTickAt, language)}. Проактивные обновления могут запаздывать.`,
    };
  }

  if (!lastCronAt) {
    return {
      tone: "neutral",
      title: isEnglish ? "Login refresh works · scheduled worker not seen yet" : "Вход будит движок · worker пока не виден",
      body: isEnglish
        ? "The planner refreshes when opened. Waiting for the first scheduled worker heartbeat."
        : "Планер обновляется при открытии. Ждём первый heartbeat планового worker.",
    };
  }

  if (cronIsStale) {
    return {
      tone: "warning",
      title: isEnglish ? "Scheduled worker is stale" : "Плановый worker устарел",
      body: isEnglish
        ? `Last scheduled run was ${formatPlannerDeliveryTime(lastCronAt, language)}. Nudges may be delayed.`
        : `Последний плановый запуск был ${formatPlannerDeliveryTime(lastCronAt, language)}. Пинки могут запаздывать.`,
    };
  }

  if (telegramSent && emailSent) {
    return {
      tone: "ok",
      title: isEnglish ? "Telegram and email are healthy" : "Telegram и email живые",
      body: isEnglish
        ? pendingCount > 0 ? `${pendingCount} message(s) still queued, but delivery is working.` : "Both delivery channels have recent successful sends."
        : pendingCount > 0 ? `${pendingCount} сообщ. ещё в очереди, но доставка работает.` : "У обоих каналов есть свежие успешные отправки.",
    };
  }

  if (telegramSent) {
    return {
      tone: "ok",
      title: isEnglish ? "Telegram healthy · email quiet" : "Telegram живой · email молчит",
      body: isEnglish
        ? "Telegram has a successful send. Email has no signal yet; that is fine if email is not configured for this user."
        : "У Telegram есть успешная отправка. У email пока нет сигнала; это нормально, если email для пользователя не включён.",
    };
  }

  if (emailSent) {
    return {
      tone: "ok",
      title: isEnglish ? "Email healthy · Telegram quiet" : "Email живой · Telegram молчит",
      body: isEnglish
        ? "Email has a successful send. Telegram has no signal yet; check Telegram linking if nudges are expected."
        : "У email есть успешная отправка. У Telegram пока нет сигнала; если пинки ожидаются, проверь привязку Telegram.",
    };
  }

  return {
    tone: "neutral",
    title: isEnglish ? "Waiting for the first delivery signal" : "Ждём первый сигнал доставки",
    body: isEnglish
      ? "The engine has a heartbeat, but no Telegram/email send is visible yet."
      : "У движка есть heartbeat, но отправок Telegram/email пока не видно.",
  };
}

function getTelegramTargetGuard(plannerMeta = {}, language = "ru") {
  const isEnglish = language === "en";
  const health = plannerMeta?.health_snapshot && typeof plannerMeta.health_snapshot === "object"
    ? plannerMeta.health_snapshot
    : null;
  const telegram = health?.telegram && typeof health.telegram === "object"
    ? health.telegram
    : plannerMeta?.telegram_link_status && typeof plannerMeta.telegram_link_status === "object"
      ? plannerMeta.telegram_link_status
      : {};
  const delivery = health?.delivery && typeof health.delivery === "object" ? health.delivery : {};
  const currentChatHash = String(
    telegram.currentChatHash ||
    telegram.current_chat_hash ||
    telegram.chatHash ||
    telegram.chat_hash ||
    ""
  ).trim();
  const lastNudgeChatHash = String(
    telegram.lastNudgeChatHash ||
    telegram.last_nudge_chat_hash ||
    delivery.chatHash ||
    delivery.chat_hash ||
    delivery.targetChatHash ||
    delivery.target_chat_hash ||
    ""
  ).trim();
  const targetMismatch = Boolean(telegram.targetMismatch || telegram.target_mismatch);
  if (!currentChatHash && !lastNudgeChatHash) return null;
  const targetLabel = currentChatHash || (isEnglish ? "missing" : "нет");
  const nudgeLabel = lastNudgeChatHash || (isEnglish ? "none yet" : "ещё нет");
  return {
    tone: targetMismatch ? "warning" : "ok",
    title: targetMismatch
      ? (isEnglish ? "Telegram target mismatch" : "Telegram target mismatch")
      : (isEnglish ? "Telegram target guard" : "Telegram guard"),
    body: isEnglish
      ? `Current target: ${targetLabel} · last nudge: ${nudgeLabel}${targetMismatch ? " · mismatch" : " · ok"}`
      : `Текущая цель: ${targetLabel} · последний пинок: ${nudgeLabel}${targetMismatch ? " · mismatch" : " · ok"}`,
  };
}

function getDeliveryWatchdogSummary(plannerMeta = {}, language = "ru") {
  const isEnglish = language === "en";
  const health = plannerMeta?.health_snapshot && typeof plannerMeta.health_snapshot === "object"
    ? plannerMeta.health_snapshot
    : {};
  const watchdog = health?.deliveryWatchdog && typeof health.deliveryWatchdog === "object"
    ? health.deliveryWatchdog
    : plannerMeta?.delivery_watchdog_status && typeof plannerMeta.delivery_watchdog_status === "object"
      ? plannerMeta.delivery_watchdog_status
      : null;
  if (!watchdog) return null;
  const failures = Array.isArray(watchdog.failures) ? watchdog.failures.filter(Boolean).map(String) : [];
  const telegramOk = Boolean(watchdog.telegram?.ok);
  const emailOk = Boolean(watchdog.email?.ok);
  const ok = Boolean(watchdog.ok) || (!failures.length && (telegramOk || emailOk));
  const checkedAt = Number(watchdog.checkedAt || watchdog.checked_at || Date.parse(watchdog.checkedAtIso || watchdog.checked_at_iso || ""));
  const dateKey = String(watchdog.dateKey || watchdog.date_key || "").trim();
  const slot = String(watchdog.slot || "").trim();
  const telegramText = telegramOk
    ? (isEnglish ? "Telegram ok" : "Telegram ok")
    : (isEnglish ? "Telegram missing" : "Telegram нет");
  const emailText = emailOk
    ? (isEnglish ? "email ok" : "email ok")
    : (isEnglish ? "email missing" : "email нет");
  const failureText = failures.length
    ? `${isEnglish ? "failed" : "сбой"}: ${failures.join(", ")}`
    : "";
  const body = [
    dateKey,
    slot,
    telegramText,
    emailText,
    failureText,
    checkedAt ? `${isEnglish ? "checked" : "проверено"} ${formatPlannerDeliveryTime(checkedAt, language)}` : "",
  ].filter(Boolean).join(" · ");
  return {
    tone: ok ? "ok" : "warning",
    title: isEnglish ? "Delivery watchdog" : "Сторож доставки",
    body,
  };
}

function getDeliveryWatchdogHistory(plannerMeta = {}, language = "ru") {
  const isEnglish = language === "en";
  const health = plannerMeta?.health_snapshot && typeof plannerMeta.health_snapshot === "object"
    ? plannerMeta.health_snapshot
    : {};
  const rawHistory = Array.isArray(health?.deliveryWatchdogHistory)
    ? health.deliveryWatchdogHistory
    : Array.isArray(plannerMeta?.delivery_watchdog_history)
      ? plannerMeta.delivery_watchdog_history
      : [];
  return rawHistory.slice(0, 6).map((item, index) => {
    const failures = Array.isArray(item?.failures) ? item.failures.filter(Boolean).map(String) : [];
    const telegramOk = Boolean(item?.telegram?.ok);
    const emailOk = Boolean(item?.email?.ok);
    const ok = Boolean(item?.ok) || (!failures.length && (telegramOk || emailOk));
    const checkedAt = Number(item?.checkedAt || item?.checked_at || Date.parse(item?.checkedAtIso || item?.checked_at_iso || ""));
    const dateKey = String(item?.dateKey || item?.date_key || "").trim();
    const slot = String(item?.slot || "").trim();
    return {
      key: `${dateKey || "date"}-${slot || "slot"}-${index}`,
      tone: ok ? "ok" : "warning",
      label: [dateKey, slot].filter(Boolean).join(" · ") || (isEnglish ? "Watchdog check" : "Проверка"),
      status: ok ? "ok" : (isEnglish ? "attention" : "внимание"),
      detail: [
        telegramOk ? "Telegram ok" : (isEnglish ? "Telegram missing" : "Telegram нет"),
        emailOk ? "email ok" : (isEnglish ? "email missing" : "email нет"),
        failures.length ? `${isEnglish ? "failed" : "сбой"}: ${failures.join(", ")}` : "",
        checkedAt ? formatPlannerDeliveryTime(checkedAt, language) : "",
      ].filter(Boolean).join(" · "),
    };
  });
}

function getDeliveryEmailHistory(plannerMeta = {}, language = "ru") {
  const isEnglish = language === "en";
  const health = plannerMeta?.health_snapshot && typeof plannerMeta.health_snapshot === "object"
    ? plannerMeta.health_snapshot
    : {};
  const rawHistory = Array.isArray(health?.deliveryEmailHistory)
    ? health.deliveryEmailHistory
    : Array.isArray(plannerMeta?.delivery_email_history)
      ? plannerMeta.delivery_email_history
      : [];
  return rawHistory.slice(0, 5).map((item, index) => {
    const status = String(item?.status || "").toLowerCase();
    const ok = status === "sent";
    const resultAt = Number(item?.resultAt || item?.result_at || item?.sentAt || item?.sent_at || item?.updatedAt || item?.updated_at || 0);
    const dateKey = String(item?.dateKey || item?.date_key || "").trim();
    const slot = String(item?.slot || "").trim();
    const subject = String(item?.subject || "").trim();
    return {
      key: `email-${dateKey || "date"}-${slot || "slot"}-${index}`,
      tone: ok ? "ok" : "warning",
      label: [dateKey, slot].filter(Boolean).join(" · ") || (isEnglish ? "Email digest" : "Email digest"),
      status: ok ? "sent" : (status || (isEnglish ? "unknown" : "неясно")),
      detail: [
        resultAt ? formatPlannerDeliveryTime(resultAt, language) : "",
        subject ? `“${subject}”` : "",
      ].filter(Boolean).join(" · "),
    };
  });
}

function getDeliveryTelegramHistory(plannerMeta = {}, language = "ru") {
  const isEnglish = language === "en";
  const health = plannerMeta?.health_snapshot && typeof plannerMeta.health_snapshot === "object"
    ? plannerMeta.health_snapshot
    : {};
  const rawHistory = Array.isArray(health?.deliveryTelegramHistory)
    ? health.deliveryTelegramHistory
    : Array.isArray(plannerMeta?.delivery_telegram_history)
      ? plannerMeta.delivery_telegram_history
      : [];
  return rawHistory.slice(0, 6).map((item, index) => {
    const status = String(item?.status || "").toLowerCase();
    const ok = status === "sent";
    const resultAt = Number(item?.resultAt || item?.result_at || item?.sentAt || item?.sent_at || item?.updatedAt || item?.updated_at || 0);
    const dateKey = String(item?.dateKey || item?.date_key || "").trim();
    const slot = String(item?.slot || "").trim();
    const topic = String(item?.topic || "").trim();
    const messageKey = String(item?.messageKey || item?.message_key || "").trim();
    const taskText = String(item?.taskText || item?.task_text || "").trim();
    const targetChatHash = String(item?.targetChatHash || item?.target_chat_hash || item?.chatHash || item?.chat_hash || "").trim();
    return {
      key: `telegram-${dateKey || "date"}-${slot || "slot"}-${index}`,
      tone: ok ? "ok" : "warning",
      label: [dateKey, slot].filter(Boolean).join(" · ") || (isEnglish ? "Telegram nudge" : "Telegram nudge"),
      status: ok ? "sent" : (status || (isEnglish ? "unknown" : "неясно")),
      detail: [
        resultAt ? formatPlannerDeliveryTime(resultAt, language) : "",
        taskText ? `“${taskText}”` : (messageKey || topic),
        targetChatHash ? `${isEnglish ? "chat" : "чат"} ${targetChatHash}` : "",
      ].filter(Boolean).join(" · "),
    };
  });
}

function getPlannerEngineDecisions(plannerMeta, language = "ru") {
  const isEnglish = language === "en";
  const health = plannerMeta?.health_snapshot && typeof plannerMeta.health_snapshot === "object"
    ? plannerMeta.health_snapshot
    : null;
  const engineDecisions = plannerMeta?.engine_decisions && typeof plannerMeta.engine_decisions === "object"
    ? plannerMeta.engine_decisions
    : null;
  const rawDecisions = Array.isArray(health?.decisions)
    ? health.decisions
    : Array.isArray(engineDecisions?.decisions)
      ? engineDecisions.decisions
      : [];

  return rawDecisions.slice(0, 6).map((decision, index) => {
    const type = String(decision?.type || "system");
    const persona = String(decision?.persona || (type === "at_risk" || type === "cemetery" ? "devil" : type === "outbox" ? "system" : "angel"));
    const taskText = String(decision?.task?.text || decision?.tasks?.[0]?.text || "").trim();
    const count = Number(decision?.count || 0);
    const topic = Array.isArray(decision?.topics) ? decision.topics.filter(Boolean).join(", ") : "";

    if (type === "mission") {
      return {
        key: `${type}-${decision?.task?.id || index}`,
        persona,
        label: isEnglish ? "Mission" : "Цель дня",
        text: taskText
          ? (isEnglish ? `Angel chose “${taskText}”.` : `Ангел выбрал «${taskText}».`)
          : (isEnglish ? "Angel chose the day mission." : "Ангел выбрал цель дня."),
      };
    }
    if (type === "rescue") {
      return {
        key: `${type}-${decision?.task?.id || index}`,
        persona,
        label: isEnglish ? "Rescue" : "Rescue",
        text: taskText
          ? (isEnglish ? `If you get stuck, start with “${taskText}”.` : `Если застрянешь, начинаем с «${taskText}».`)
          : (isEnglish ? "Rescue target prepared." : "Rescue-цель подготовлена."),
      };
    }
    if (type === "at_risk") {
      return {
        key: `${type}-${index}`,
        persona,
        label: isEnglish ? "At risk" : "На грани",
        text: count > 0
          ? (isEnglish ? `${count} task(s) are getting cold.` : `${count} задач(и) остывают.`)
          : (isEnglish ? "Devil is watching cold tasks." : "Чертик следит за остывающими задачами."),
      };
    }
    if (type === "cemetery") {
      return {
        key: `${type}-${index}`,
        persona,
        label: isEnglish ? "Cemetery" : "Кладбище",
        text: count > 0
          ? (isEnglish ? `Devil moved ${count} stale task(s) out.` : `Чертик убрал ${count} залежавш. задач(и).`)
          : (isEnglish ? "Cemetery cleanup checked." : "Кладбище проверено."),
      };
    }
    if (type === "outbox") {
      return {
        key: `${type}-${index}`,
        persona,
        label: isEnglish ? "Outbox" : "Outbox",
        text: count > 0
          ? (isEnglish ? `${count} message(s) queued${topic ? `: ${topic}` : ""}.` : `${count} сообщен. поставлено в очередь${topic ? `: ${topic}` : ""}.`)
          : (isEnglish ? "No delivery queued." : "Доставка не ставилась в очередь."),
      };
    }
    return {
      key: `${type}-${index}`,
      persona,
      label: isEnglish ? "Engine" : "Движок",
      text: isEnglish ? "Engine made a planner decision." : "Движок принял решение по планеру.",
    };
  });
}

function getPlannerEngineInbox(plannerMeta, language = "ru") {
  const isEnglish = language === "en";
  const health = plannerMeta?.health_snapshot && typeof plannerMeta.health_snapshot === "object"
    ? plannerMeta.health_snapshot
    : null;
  const engineInbox = plannerMeta?.engine_inbox && typeof plannerMeta.engine_inbox === "object"
    ? plannerMeta.engine_inbox
    : null;
  const rawItems = Array.isArray(health?.inbox)
    ? health.inbox
    : Array.isArray(engineInbox?.items)
      ? engineInbox.items
      : [];

  return rawItems.slice(0, 8).map((item, index) => {
    const type = String(item?.type || "system");
    const persona = String(item?.persona || (type.includes("cold") || type.includes("cemetery") ? "devil" : "system"));
    const count = Number(item?.count || 0);
    const taskText = String(item?.tasks?.[0]?.text || "").trim();
    const slot = String(item?.slot || "");
    const topics = Array.isArray(item?.topics) ? item.topics.filter(Boolean).join(", ") : "";

    if (type === "overdue") {
      return {
        key: `${type}-${index}`,
        persona,
        severity: Number(item?.severity || 3),
        label: isEnglish ? "Overdue" : "Просрочено",
        text: taskText
          ? (isEnglish ? `${count} overdue task(s). First: “${taskText}”.` : `${count} просроч. задач(и). Первая: «${taskText}».`)
          : (isEnglish ? `${count} overdue task(s).` : `${count} просроч. задач(и).`),
      };
    }
    if (type === "cold_tasks") {
      return {
        key: `${type}-${index}`,
        persona,
        severity: Number(item?.severity || 2),
        label: isEnglish ? "Cold" : "Остывают",
        text: taskText
          ? (isEnglish ? `${count} cold task(s). Devil is watching “${taskText}”.` : `${count} задач(и) остывают. Чертик смотрит на «${taskText}».`)
          : (isEnglish ? `${count} task(s) are getting cold.` : `${count} задач(и) остывают.`),
      };
    }
    if (type === "missing_steps") {
      return {
        key: `${type}-${index}`,
        persona,
        severity: Number(item?.severity || 1),
        label: isEnglish ? "No steps" : "Без шагов",
        text: taskText
          ? (isEnglish ? `${count} task(s) need a first step. Start with “${taskText}”.` : `${count} задач(и) без первого шага. Начать можно с «${taskText}».`)
          : (isEnglish ? `${count} task(s) need a first step.` : `${count} задач(и) без первого шага.`),
      };
    }
    if (type === "cemetery_moves") {
      return {
        key: `${type}-${index}`,
        persona,
        severity: Number(item?.severity || 3),
        label: isEnglish ? "Buried" : "Похоронено",
        text: isEnglish ? `Devil moved ${count} stale task(s) to Cemetery.` : `Чертик убрал ${count} залежавш. задач(и) на кладбище.`,
      };
    }
    if (type === "messages_queued") {
      return {
        key: `${type}-${index}`,
        persona,
        severity: Number(item?.severity || 1),
        label: isEnglish ? "Queued" : "Очередь",
        text: isEnglish
          ? `${count} delivery message(s) queued${topics ? `: ${topics}` : ""}.`
          : `${count} сообщен. доставки в очереди${topics ? `: ${topics}` : ""}.`,
      };
    }
    if (type === "scheduled_nudge_due") {
      return {
        key: `${type}-${index}`,
        persona,
        severity: Number(item?.severity || 1),
        label: isEnglish ? "Nudge" : "Пинок",
        text: isEnglish ? `Scheduled nudge slot is due: ${slot || "now"}.` : `Плановый пинок сейчас: ${slot || "now"}.`,
      };
    }
    if (type === "clear") {
      return {
        key: `${type}-${index}`,
        persona,
        severity: 0,
        label: isEnglish ? "Clear" : "Чисто",
        text: isEnglish ? "No urgent engine inbox items right now." : "Срочных пунктов для движка сейчас нет.",
      };
    }
    return {
      key: `${type}-${index}`,
      persona,
      severity: Number(item?.severity || 1),
      label: isEnglish ? "Engine" : "Движок",
      text: isEnglish ? "Engine has an inbox item." : "У движка есть пункт внимания.",
    };
  });
}

function getPlannerDebugRuns(plannerMeta, language = "ru") {
  const isEnglish = language === "en";
  const debugRuns = plannerMeta?.debug_runs && typeof plannerMeta.debug_runs === "object"
    ? plannerMeta.debug_runs
    : {};
  const formatRun = (run = {}, kind = "engine") => {
    const stats = run?.stats && typeof run.stats === "object" ? run.stats : {};
    const summary = run?.engineRunSummary && typeof run.engineRunSummary === "object"
      ? run.engineRunSummary
      : run?.summary && typeof run.summary === "object"
        ? run.summary
        : null;
    const summaryStats = summary?.stats && typeof summary.stats === "object" ? summary.stats : {};
    const failedResult = Array.isArray(run?.results)
      ? run.results.find((result) => result?.diagnostic || result?.error)
      : null;
    const status = String(run?.status || "unknown").toLowerCase();
    const trigger = String(run?.trigger || "");
    const finishedAt = Number(run?.finished_at || run?.finishedAt || run?.createdAt || run?.created_at || 0);
    const claimed = Number(run?.claimed || stats.claimed || 0);
    const sent = Number(stats.sent || 0);
    const failed = Number(stats.failed || 0);
    const heatUpdated = Number(stats.heatUpdated || 0);
    const deadCount = Number(stats.deadCount || 0);
    const outboxQueued = Number(stats.outboxQueued || 0);
    const eventCount = Number(stats.eventCount || 0);
    const summaryChangeCount = Number(summary?.meaningfulChangeCount || 0);
    const summaryDeadCount = Number(summaryStats.cemeteryMoved || 0);
    const summaryOutboxCount = Number(summaryStats.outboxQueued || 0);
    const summaryEventCount = Number(summaryStats.eventCount || 0);
    const summaryText = summary
      ? [
        `${isEnglish ? "summary v" : "summary v"}${Number(summary.contractVersion || 0) || "?"}`,
        summaryChangeCount ? `${isEnglish ? "changes" : "изменений"} ${summaryChangeCount}` : "",
        summaryDeadCount ? `${isEnglish ? "cemetery" : "кладбище"} ${summaryDeadCount}` : "",
        summaryOutboxCount ? `outbox ${summaryOutboxCount}` : "",
        summaryEventCount ? `${isEnglish ? "events" : "события"} ${summaryEventCount}` : "",
      ].filter(Boolean).join(" · ")
      : "";
    const engineDetail = [
      summaryText,
      trigger && `${isEnglish ? "trigger" : "триггер"}: ${trigger}`,
      heatUpdated ? `heat ${heatUpdated}` : "",
      deadCount ? `dead ${deadCount}` : "",
      outboxQueued ? `outbox ${outboxQueued}` : "",
      eventCount ? `events ${eventCount}` : "",
    ].filter(Boolean).join(" · ");
    const outboxDetail = [
      claimed ? `${isEnglish ? "claimed" : "взято"} ${claimed}` : "",
      sent ? `sent ${sent}` : "",
      failed ? `failed ${failed}` : "",
      failedResult ? formatDeliveryDiagnostic(failedResult.diagnostic, failedResult.error, language) : "",
    ].filter(Boolean).join(" · ");
    return {
      key: `${kind}-${run?.id || finishedAt || Math.random()}`,
      kind,
      status,
      title: kind === "engine"
        ? (isEnglish ? "Engine run" : "Запуск движка")
        : (isEnglish ? "Outbox drain" : "Доставка outbox"),
      time: formatPlannerDeliveryTime(finishedAt, language) || (isEnglish ? "unknown time" : "время неизвестно"),
      summary: summaryText,
      detail: kind === "engine" ? engineDetail : outboxDetail,
      tone: status === "ok" || status === "sent" ? "ok" : status === "failed" || status === "dead" ? "warning" : "neutral",
    };
  };
  return {
    engine: Array.isArray(debugRuns.engine) ? debugRuns.engine.slice(0, 5).map((run) => formatRun(run, "engine")) : [],
    outbox: Array.isArray(debugRuns.outbox) ? debugRuns.outbox.slice(0, 5).map((run) => formatRun(run, "outbox")) : [],
  };
}

function getPlannerEngineLock(plannerMeta, language = "ru") {
  const isEnglish = language === "en";
  const health = plannerMeta?.health_snapshot && typeof plannerMeta.health_snapshot === "object"
    ? plannerMeta.health_snapshot
    : null;
  const lock = plannerMeta?.engine_lock && typeof plannerMeta.engine_lock === "object"
    ? plannerMeta.engine_lock
    : health?.engine?.lock && typeof health.engine.lock === "object"
      ? health.engine.lock
      : null;
  if (!lock) return null;

  const status = String(lock.status || "").toLowerCase();
  const active = Boolean(lock.active) || status === "active";
  const remainingMs = Math.max(0, Number(lock.remainingMs || 0));
  const acquiredAt = Number(lock.acquiredAt || 0);
  const releasedAt = Number(lock.releasedAt || 0);
  const expiresAt = Number(lock.expiresAt || 0);
  const trigger = String(lock.trigger || "");

  if (status === "missing" && !acquiredAt && !expiresAt) return null;

  if (active) {
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    return {
      tone: "warning",
      title: isEnglish ? "Engine lock is active" : "Lock движка активен",
      body: isEnglish
        ? `Another engine run is holding the lock${trigger ? ` (${trigger})` : ""}. About ${seconds}s left.`
        : `Другой запуск держит lock${trigger ? ` (${trigger})` : ""}. Осталось примерно ${seconds} сек.`,
    };
  }

  if (status === "released") {
    return {
      tone: "ok",
      title: isEnglish ? "Engine lock released" : "Lock движка отпущен",
      body: isEnglish
        ? `Last lock released${releasedAt ? ` at ${formatPlannerDeliveryTime(releasedAt, language)}` : ""}.`
        : `Последний lock отпущен${releasedAt ? ` в ${formatPlannerDeliveryTime(releasedAt, language)}` : ""}.`,
    };
  }

  if (status === "expired") {
    return {
      tone: "neutral",
      title: isEnglish ? "Engine lock expired" : "Lock движка истёк",
      body: isEnglish
        ? `The previous lock expired${expiresAt ? ` at ${formatPlannerDeliveryTime(expiresAt, language)}` : ""}. New runs can proceed.`
        : `Предыдущий lock истёк${expiresAt ? ` в ${formatPlannerDeliveryTime(expiresAt, language)}` : ""}. Новые запуски могут идти.`,
    };
  }

  return null;
}

function getPlannerOutboxQueue(plannerMeta, language = "ru") {
  const isEnglish = language === "en";
  const queue = plannerMeta?.outbox_queue && typeof plannerMeta.outbox_queue === "object"
    ? plannerMeta.outbox_queue
    : {};
  const statusOrder = ["dead", "retry", "sending", "pending"];
  const statusLabels = {
    pending: isEnglish ? "Pending" : "Ждёт",
    retry: isEnglish ? "Retry" : "Повтор",
    dead: isEnglish ? "Dead" : "Умерло",
    sending: isEnglish ? "Sending" : "Отправка",
  };
  const statusTones = {
    pending: "neutral",
    retry: "warning",
    dead: "danger",
    sending: "ok",
  };

  return statusOrder.flatMap((status) => {
    const items = Array.isArray(queue[status]) ? queue[status] : [];
    return items.slice(0, 8).map((item, index) => {
      const channel = String(item?.channel || "").toLowerCase() || "outbox";
      const topic = String(item?.topic || item?.messageKey || "").replace(/_/g, " ");
      const attempts = Number(item?.attempts || 0);
      const availableAt = Number(item?.availableAt || 0);
      const taskText = String(item?.taskText || "").trim();
      const diagnostic = formatDeliveryDiagnostic(item?.diagnostic, item?.lastError, language);
      const nextTime = availableAt ? formatPlannerDeliveryTime(availableAt, language) : "";
      const detail = [
        attempts ? `${isEnglish ? "attempts" : "попыток"} ${attempts}` : "",
        nextTime ? `${isEnglish ? "next" : "след."} ${nextTime}` : "",
        diagnostic,
        taskText ? `“${taskText.slice(0, 60)}${taskText.length > 60 ? "…" : ""}”` : "",
      ].filter(Boolean).join(" · ");
      return {
        key: `${status}-${item?.id || index}`,
        status,
        tone: statusTones[status] || "neutral",
        label: statusLabels[status] || status,
        title: `${channel}${topic ? ` · ${topic}` : ""}`,
        detail,
      };
    });
  }).slice(0, 24);
}

function getPlannerCommandHistory(plannerMeta, language = "ru") {
  const isEnglish = language === "en";
  const history = plannerMeta?.command_history && typeof plannerMeta.command_history === "object"
    ? plannerMeta.command_history
    : {};
  const items = Array.isArray(history.items) ? history.items : [];
  const labels = {
    CREATE_OR_MERGE_TASK: isEnglish ? "Add task" : "Добавить задачу",
    TASK_TOUCH: isEnglish ? "Movement" : "Сдвиг",
    RESCUE_SHIFT_RECORDED: isEnglish ? "Rescue shift" : "Сдвиг rescue",
    TASK_COMPLETE: isEnglish ? "Complete" : "Завершить",
    TASK_MOVE_TO_CEMETERY: isEnglish ? "Cemetery" : "Кладбище",
    TASK_REOPEN: isEnglish ? "Restore" : "Вернуть",
    TASK_SET_TODAY: isEnglish ? "Today pin" : "Закрепить",
    TASK_SET_VITAL: isEnglish ? "Critical" : "Критично",
    TASK_SET_URGENCY: isEnglish ? "Urgency" : "Срочность",
    TASK_SET_RESISTANCE: isEnglish ? "Resistance" : "Сопротивление",
    TASK_SET_DEADLINE: isEnglish ? "Deadline" : "Дедлайн",
  };
  const statusLabels = {
    ok: "ok",
    noop: "no-op",
    reused: isEnglish ? "reused" : "схлопнуто",
    unknown: isEnglish ? "unknown" : "неизвестно",
  };
  const statusTones = {
    ok: "ok",
    noop: "warning",
    reused: "neutral",
    unknown: "neutral",
  };

  return items.slice(0, 12).map((item, index) => {
    const commandType = String(item?.commandType || "").toUpperCase();
    const status = String(item?.status || "").toLowerCase() || "unknown";
    const postCommand = item?.postCommand && typeof item.postCommand === "object" ? item.postCommand : null;
    const postCommandStatus = String(postCommand?.status || "").toLowerCase();
    const postCommandRunId = String(postCommand?.runId || "").trim();
    const reportProjected = Number(postCommand?.reportProjected || 0);
    const taskText = String(item?.taskText || "").trim();
    const reuseCount = Number(item?.reuseCount || 0);
    const createdAt = Number(item?.lastReusedAt || item?.createdAt || 0);
    const actor = String(item?.actorType || item?.source || "").trim();
    const postCommandText = postCommandStatus
      ? [
        isEnglish ? `engine ${postCommandStatus}` : `движок ${postCommandStatus}`,
        postCommandRunId ? `run ${postCommandRunId.slice(-8)}` : "",
        reportProjected ? `${isEnglish ? "report" : "отчёт"} +${reportProjected}` : "",
      ].filter(Boolean).join(" · ")
      : "";
    const detail = [
      String(item?.outcome || "").trim(),
      reuseCount > 0 ? `${isEnglish ? "reuse" : "повторов"} ${reuseCount}` : "",
      postCommandText,
      actor,
      createdAt ? formatPlannerDeliveryTime(createdAt, language) : "",
      taskText ? `“${taskText.slice(0, 60)}${taskText.length > 60 ? "…" : ""}”` : "",
    ].filter(Boolean).join(" · ");
    return {
      key: `${item?.id || commandType || "command"}-${index}`,
      label: labels[commandType] || commandType.replace(/_/g, " ").toLowerCase() || (isEnglish ? "Command" : "Команда"),
      status: statusLabels[status] || status,
      detail,
      tone: statusTones[status] || "neutral",
    };
  });
}

function getPlannerCommandHealth(plannerMeta, language = "ru") {
  const isEnglish = language === "en";
  const health = plannerMeta?.command_health && typeof plannerMeta.command_health === "object"
    ? plannerMeta.command_health
    : null;
  if (!health) return null;

  const status = String(health.status || "idle").toLowerCase();
  const commandType = String(health.lastCommandType || "").replace(/_/g, " ").toLowerCase();
  const lastTime = Number(health.lastCommandAt || 0)
    ? formatPlannerDeliveryTime(Number(health.lastCommandAt), language)
    : "";
  const recentCount = Number(health.recentCount || 0);
  const noopCount = Number(health.noopCount || 0);
  const reusedCount = Number(health.reusedCount || 0);
  const unknownCount = Number(health.unknownCount || 0);
  const postCommandFailedCount = Number(health.postCommandFailedCount || 0);
  const postCommandLockedCount = Number(health.postCommandLockedCount || 0);
  const reportProjectionFailedCount = Number(health.reportProjectionFailedCount || 0);
  const reportProjectedCount = Number(health.reportProjectedCount || 0);
  const reportCheckedCount = Number(health.reportCheckedCount || 0);
  const outboxCheckFailedCount = Number(health.outboxCheckFailedCount || 0);
  const outboxQueuedCount = Number(health.outboxQueuedCount || 0);
  const latestOutboxPending = Number(health.latestOutboxPending || 0);
  const latestOutboxRetry = Number(health.latestOutboxRetry || 0);
  const latestOutboxDead = Number(health.latestOutboxDead || 0);
  const latestOutboxSending = Number(health.latestOutboxSending || 0);
  const latestOutboxTotal = Number(health.latestOutboxTotal || 0);
  const lastPostCommandStatus = String(health.lastPostCommandStatus || "").trim();

  const detail = [
    commandType,
    lastTime,
    lastPostCommandStatus ? `${isEnglish ? "engine" : "движок"} ${lastPostCommandStatus}` : "",
    recentCount ? `${isEnglish ? "recent" : "за час"} ${recentCount}` : "",
    reusedCount ? `${isEnglish ? "reused" : "схлопнуто"} ${reusedCount}` : "",
    noopCount ? `no-op ${noopCount}` : "",
    unknownCount ? `${isEnglish ? "unknown" : "неясно"} ${unknownCount}` : "",
    postCommandFailedCount ? `${isEnglish ? "engine failed" : "движок упал"} ${postCommandFailedCount}` : "",
    postCommandLockedCount ? `${isEnglish ? "engine locked" : "движок locked"} ${postCommandLockedCount}` : "",
    reportProjectedCount ? `${isEnglish ? "report projected" : "отчёт создан"} ${reportProjectedCount}` : "",
    reportCheckedCount ? `${isEnglish ? "report checked" : "отчёт проверен"} ${reportCheckedCount}` : "",
    reportProjectionFailedCount ? `${isEnglish ? "report failed" : "отчёт упал"} ${reportProjectionFailedCount}` : "",
    outboxQueuedCount ? `outbox +${outboxQueuedCount}` : "",
    latestOutboxTotal ? `outbox ${latestOutboxTotal}` : "",
    latestOutboxPending ? `pending ${latestOutboxPending}` : "",
    latestOutboxRetry ? `retry ${latestOutboxRetry}` : "",
    latestOutboxDead ? `dead ${latestOutboxDead}` : "",
    latestOutboxSending ? `sending ${latestOutboxSending}` : "",
    outboxCheckFailedCount ? `${isEnglish ? "outbox check failed" : "outbox check упал"} ${outboxCheckFailedCount}` : "",
  ].filter(Boolean).join(" · ");

  if (status === "warning" && outboxCheckFailedCount > 0) {
    return {
      tone: "warning",
      title: isEnglish ? "Outbox check needs attention" : "Проверка outbox требует внимания",
      body: detail || (isEnglish ? "Commands worked, but delivery queue health was not checked cleanly." : "Команды прошли, но очередь доставки не проверилась чисто."),
    };
  }

  if (status === "warning" && (latestOutboxRetry > 0 || latestOutboxDead > 0)) {
    return {
      tone: "warning",
      title: isEnglish ? "Delivery queue needs attention" : "Очередь доставки требует внимания",
      body: detail || (isEnglish ? "Some Telegram/email delivery items are retrying or dead." : "Часть Telegram/email доставок повторяется или умерла."),
    };
  }

  if (status === "warning" && reportProjectionFailedCount > 0) {
    return {
      tone: "warning",
      title: isEnglish ? "Report projection needs attention" : "Проекция отчёта требует внимания",
      body: detail || (isEnglish ? "Commands worked, but report items were not projected cleanly." : "Команды прошли, но report items не спроецировались чисто."),
    };
  }

  if (status === "locked") {
    return {
      tone: "warning",
      title: isEnglish ? "Command path is waiting on engine lock" : "Command-path ждёт lock движка",
      body: detail || (isEnglish ? "Command worked, but the post-command engine wake-up was locked." : "Команда прошла, но post-command запуск движка был locked."),
    };
  }

  if (status === "ok") {
    return {
      tone: "ok",
      title: isEnglish ? "Command path is working" : "Command-path работает",
      body: detail || (isEnglish ? "Latest backend command completed." : "Последняя backend-команда прошла."),
    };
  }
  if (status === "reused") {
    return {
      tone: "neutral",
      title: isEnglish ? "Duplicate commands are collapsing" : "Повторы схлопываются",
      body: detail || (isEnglish ? "Idempotency is reusing recent commands." : "Idempotency переиспользует недавние команды."),
    };
  }
  if (status === "noop") {
    return {
      tone: "warning",
      title: isEnglish ? "Latest command was no-op" : "Последняя команда была no-op",
      body: detail || (isEnglish ? "Backend accepted it, but state did not need changing." : "Backend принял команду, но менять состояние было не нужно."),
    };
  }
  if (status === "warning") {
    return {
      tone: "warning",
      title: isEnglish ? "Command path needs attention" : "Command-path требует внимания",
      body: detail || (isEnglish ? "Some command results are unclear." : "У части команд неясный результат."),
    };
  }
  return {
    tone: "neutral",
    title: isEnglish ? "Command path is idle" : "Command-path без свежих команд",
    body: detail || (isEnglish ? "No recent backend commands." : "Свежих backend-команд нет."),
  };
}

function getPlannerEngineContractStatus(plannerMeta, language = "ru") {
  const isEnglish = language === "en";
  const status = plannerMeta?.engine_contract_status && typeof plannerMeta.engine_contract_status === "object"
    ? plannerMeta.engine_contract_status
    : null;
  if (!status) return null;

  const layers = Array.isArray(status.layers) ? status.layers : [];
  const warningCount = Number(status.warningCount || 0);
  const okCount = Number(status.okCount || 0);
  return {
    tone: warningCount > 0 ? "warning" : "ok",
    title: isEnglish ? "Planner Engine contract" : "Контракт Planner Engine",
    body: isEnglish
      ? `${okCount} layer(s) stable${warningCount ? ` · ${warningCount} need attention` : ""}.`
      : `${okCount} слоёв стабильны${warningCount ? ` · ${warningCount} требуют внимания` : ""}.`,
    layers: layers.map((layer, index) => ({
      key: `${layer?.key || "layer"}-${index}`,
      tone: String(layer?.status || "neutral") === "warning" ? "warning" : String(layer?.status || "neutral") === "ok" ? "ok" : "neutral",
      title: String(layer?.title || (isEnglish ? "Layer" : "Слой")),
      body: String(layer?.body || ""),
      status: String(layer?.status || "unknown"),
    })),
  };
}

function getPlannerClientContractStatus(status, language = "ru") {
  if (!status || typeof status !== "object") return null;
  const isEnglish = language === "en";
  const ok = Boolean(status.ok);
  const payloadOk = status.payloadOk !== false;
  const responseShape = String(status.responseShape || "");
  const contractVersion = Number(status.contractVersion || 0);
  const postCommandStatus = String(status.postCommandStatus || "").trim();
  const postCommandShape = String(status.postCommandShape || "").trim();
  const postCommandVersion = Number(status.postCommandContractVersion || 0);
  const postCommandWriteOk = status.postCommandWriteOk;
  const postCommandWriteSkipped = Boolean(status.postCommandWriteSkipped);
  const postCommandWriteReason = String(status.postCommandWriteReason || "").trim();
  const hookText = postCommandStatus
    ? (isEnglish
      ? ` Post-command hook: ${postCommandStatus}${postCommandShape ? ` (${postCommandShape} v${postCommandVersion || 1})` : ""}.`
      : ` Post-command hook: ${postCommandStatus}${postCommandShape ? ` (${postCommandShape} v${postCommandVersion || 1})` : ""}.`)
    : "";
  const hookWriteText = postCommandWriteOk === null
    ? ""
    : postCommandWriteOk
      ? (isEnglish ? " Hook status saved to command health." : " Статус hook сохранён в command health.")
      : postCommandWriteSkipped
        ? (isEnglish
          ? ` Hook status write skipped${postCommandWriteReason ? `: ${postCommandWriteReason}` : ""}.`
          : ` Запись статуса hook пропущена${postCommandWriteReason ? `: ${postCommandWriteReason}` : ""}.`)
        : (isEnglish
          ? ` Hook status write failed${postCommandWriteReason ? `: ${postCommandWriteReason}` : ""}.`
          : ` Запись статуса hook не удалась${postCommandWriteReason ? `: ${postCommandWriteReason}` : ""}.`);
  return {
    tone: ok ? "ok" : "warning",
    title: isEnglish ? "Frontend response contract" : "Контракт ответа frontend",
    body: ok
      ? (isEnglish
        ? `Received ${responseShape || "planner_client_update_v1"} v${contractVersion || 1}.${hookText}${hookWriteText}`
        : `Получен ${responseShape || "planner_client_update_v1"} v${contractVersion || 1}.${hookText}${hookWriteText}`)
      : !payloadOk
        ? (isEnglish
          ? "Backend returned ok:false in the current response contract."
          : "Backend вернул ok:false в текущем контракте ответа.")
        : (isEnglish
          ? "Last backend response was legacy or incomplete."
          : "Последний backend-ответ был старым или неполным."),
  };
}

const PLANNER_REPORT_EVENT_TYPES = new Set([
  "MISSION_SELECTED",
  "RESCUE_SUGGESTION_SELECTED",
  "TASKS_AT_RISK",
  "TASK_AUTO_CEMETERY",
  "TASK_AUTO_MOVED_TO_CEMETERY",
  "TASK_MOVED_TO_CEMETERY_BY_ENGINE",
  "OUTBOX_QUEUED",
  "OUTBOX_DELIVERY",
]);

function isPlannerReportEvent(event = {}) {
  if (!event) return false;
  if (isTechnicalPlannerEvent(event)) return false;
  const eventType = String(event.eventType || event.event_type || event.type || "").toUpperCase();
  if (event.reportItemId || event.visibleInReport || event.visible_in_report) return true;
  if (PLANNER_REPORT_EVENT_TYPES.has(eventType)) return true;
  if (String(event.type || "").toLowerCase().startsWith("outbox_")) return true;
  return event.actor === "user" || event.actor === "angel" || event.actor === "devil";
}

function getPlannerReportSignature(report = {}) {
  const ids = Array.isArray(report?.reportItemIds)
    ? report.reportItemIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (ids.length > 0) return ids.sort().join("|");

  const eventIds = Array.isArray(report?.events)
    ? report.events.map((event) => String(event?.reportItemId || event?.id || "").trim()).filter(Boolean)
    : [];
  return eventIds.sort().join("|");
}

function getPlannerReportAutoOpenStorageKey(userId, report) {
  const signature = getPlannerReportSignature(report);
  if (!userId || !signature) return "";
  return `adhd_while_away_auto_opened_${userId}_${signature}`;
}

function hasPlannerReportAutoOpenedInSession(userId, report) {
  const key = getPlannerReportAutoOpenStorageKey(userId, report);
  if (!key) return false;
  try {
    return sessionStorage.getItem(key) === "1";
  } catch (error) {
    return false;
  }
}

function markPlannerReportAutoOpenedInSession(userId, report) {
  const key = getPlannerReportAutoOpenStorageKey(userId, report);
  if (!key) return;
  try {
    sessionStorage.setItem(key, "1");
  } catch (error) {
    // Session storage can be unavailable in restricted browser contexts.
  }
}

function isTechnicalPlannerEvent(event = {}) {
  const type = String(event.eventType || event.event_type || event.type || "").toLowerCase();
  const source = String(event.source || event.actor_ref || "").toLowerCase();
  return Boolean(event.debug_only || event.debugOnly) ||
    type.startsWith("telegram_") ||
    source === "telegram_webhook";
}

function getPlannerReportPersona(event = {}, language = "ru") {
  const isEnglish = language === "en";
  if (event.actor === "user" || event.persona === "user") {
    return isEnglish ? "You" : "Ты";
  }
  if (event.actor === "angel" || event.persona === "angel") {
    return isEnglish ? "Angel" : "Ангел";
  }
  if (event.actor === "devil" || event.persona === "devil") {
    return isEnglish ? "Devil" : "Чёртик";
  }
  return isEnglish ? "System" : "Система";
}

function getPlannerReportIcon(event = {}) {
  if (event.actor === "user" || event.persona === "user") return "•";
  if (event.actor === "angel" || event.persona === "angel") return "👼";
  if (event.actor === "devil" || event.persona === "devil") return "😈";
  return "✦";
}

function getPlannerReportFilterKey(event = {}) {
  if (event.actor === "user" || event.persona === "user") return "user";
  if (event.actor === "angel" || event.persona === "angel") return "angel";
  if (event.actor === "devil" || event.persona === "devil") return "devil";
  return "system";
}

function matchesPlannerReportFilter(event = {}, filter = "all") {
  if (filter === "all") return true;
  return getPlannerReportFilterKey(event) === filter;
}

function getUrgencyLabel(urgency, language = "ru") {
  const isEnglish = language === "en";
  if (isEnglish) {
    if (urgency === "high") return "Urgent";
    if (urgency === "medium") return "Normal";
    return "Can wait";
  }
  if (urgency === "high") return "Срочно";
  if (urgency === "medium") return "Норм";
  return "Можно позже";
}

function getResistanceLabel(resistance, language = "ru") {
  const isEnglish = language === "en";
  if (isEnglish) {
    if (resistance === "high") return "Scary";
    if (resistance === "medium") return "Medium";
    return "Easy";
  }
  if (resistance === "high") return "Страшно";
  if (resistance === "medium") return "Средне";
  return "Легко";
}

function getVitalLabel(isVital, language = "ru") {
  if (language === "en") return isVital ? "Critical" : "Normal priority";
  return isVital ? "Жизненно важно" : "Обычный приоритет";
}

function isTaskNotYourMove(task = {}) {
  const blocked = task?.blocked && typeof task.blocked === "object"
    ? task.blocked
    : {};
  const legacy = task?.notYourMove && typeof task.notYourMove === "object"
    ? task.notYourMove
    : {};
  const metadata = { ...legacy, ...blocked };
  const status = String(metadata.status || "").toLowerCase();
  const contractVersion = String(metadata.contractVersion || metadata.contract_version || "").toLowerCase();
  return status === "not_your_move" ||
    contractVersion === "not_your_move_v1" ||
    Boolean(metadata.nextCheckInAt || metadata.next_check_in_at);
}

export default function App() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isPublicDemoRoute = location.pathname === "/demo";
  const isDemoRoute = isPublicDemoRoute || searchParams.get("demo") === "1";
  const stateLayerRequested = searchParams.get("stateLayer") === "1" || searchParams.get("executiveState") === "1";
  const angelEntryRequested = searchParams.get("angelEntry") === "1" || searchParams.get("angel") === "1";
  const angelEntryPanelRequested = searchParams.get("angelEntryPanel") === "1";
  const notYourMoveCheckinPreviewRequested = searchParams.get("notYourMoveCheckin") === "1" ||
    searchParams.get("waitingCheckin") === "1";
  const resetAngelMemoryRequested = searchParams.get("resetAngelMemory") === "1";
  const stickyMissionPreviewRequested = searchParams.get("stickyMission") === "1";
  const demoStoryRequested = searchParams.get("demoStory") === "1";
  const demoPreserveRequested = searchParams.get("preserveDemo") === "1" || searchParams.get("preserve") === "1";
  const demoResetScenario = normalizeDemoResetScenario(searchParams.get("reset") || "");
  const demoNamedResetRequested = Boolean(demoResetScenario && demoResetScenario !== "0" && demoResetScenario !== "false");
  const questLoopNotNowThresholdRequested = isQuestLoopNotNowThresholdScenario(demoResetScenario);
  const questRelationDirectorPrimaryRequested = isQuestRelationDirectorPrimaryScenario(demoResetScenario);
  const demoResetRequested = isDemoRoute && (
    (isPublicDemoRoute && !demoPreserveRequested) ||
    searchParams.get("resetDemo") === "1" ||
    searchParams.get("reset") === "1" ||
    demoNamedResetRequested
  );
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [score, setScore] = useState(0);
  const [activeTab, setActiveTab] = useState("active");
  const [activeFilter, setActiveFilter] = useState("all");
  const [plannerReportFilter, setPlannerReportFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [minLoadDone, setMinLoadDone] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    return saved;
  });
  const [language, setLanguage] = useState(() => {
    if (isDemoRoute) return "en";
    return localStorage.getItem("planner_language") || "ru";
  });
  const [executiveState, setExecutiveState] = useState(() => {
    if (isDemoRoute) return "stuck";
    return readStoredExecutiveState();
  });
  const [executivePlannerOpen, setExecutivePlannerOpen] = useState(false);
  const [executiveLayerDismissed, setExecutiveLayerDismissed] = useState(false);
  const [pulseState, setPulseState] = useState(() => getDefaultPulseState());
  const [highlightTaskId, setHighlightTaskId] = useState(null);
  const [nudgeStatus, setNudgeStatus] = useState("");
  const [panicOpen, setPanicOpen] = useState(false);
  const [panicStepEditorOpen, setPanicStepEditorOpen] = useState(false);
  const [companionFlash, setCompanionFlash] = useState(null);
  const [completionCelebration, setCompletionCelebration] = useState(null);
  const [completionBanner, setCompletionBanner] = useState("");
  const [dragTaskId, setDragTaskId] = useState(null);
  const [fogMode, setFogMode] = useState(false);
  const [requestedTuneTaskId, setRequestedTuneTaskId] = useState(null);
  const [notYourMoveDraft, setNotYourMoveDraft] = useState(null);
  const [notYourMoveHeldTaskId, setNotYourMoveHeldTaskId] = useState(() => readNotYourMovePressureHold()?.taskId || "");
  const [notYourMoveHeldTaskTitle, setNotYourMoveHeldTaskTitle] = useState(() => readNotYourMovePressureHold()?.taskTitle || "");
  const [manualMissionOverrideTaskId, setManualMissionOverrideTaskId] = useState("");
  const [manualMissionOverrideTask, setManualMissionOverrideTask] = useState(null);
  const [forcedMissionDisplayTask, setForcedMissionDisplayTask] = useState(null);
  const [missionDisplayFallbackTask, setMissionDisplayFallbackTask] = useState(null);
  const [pressureSuppressedTaskIds, setPressureSuppressedTaskIds] = useState([]);
  const [confirmedNotYourMovePressureKeys, setConfirmedNotYourMovePressureKeys] = useState([]);
  const [clarificationPrompt, setClarificationPrompt] = useState(null);
  const [stickyKillConfirmPrompt, setStickyKillConfirmPrompt] = useState(null);
  const [cemeteryDigest, setCemeteryDigest] = useState(null); // { tasks: [...] }
  const [plannerReport, setPlannerReport] = useState(null); // { events: [...], reportItemIds?: [...] }
  const [plannerReportModalOpen, setPlannerReportModalOpen] = useState(false);
  const [plannerReportItems, setPlannerReportItems] = useState([]);
  const [plannerEvents, setPlannerEvents] = useState([]);
  const [plannerMeta, setPlannerMeta] = useState(null);
  const [dismissedAngelEntryId, setDismissedAngelEntryId] = useState("");
  const [plannerClientContractStatus, setPlannerClientContractStatus] = useState(null);
  const [engineDebugBusy, setEngineDebugBusy] = useState("");
  const [lastDebugActionResult, setLastDebugActionResult] = useState(null);
  const [plannerSelfTestResult, setPlannerSelfTestResult] = useState(null);
  const [snapshots, setSnapshots] = useState(null); // null = not loaded yet
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null); // snapshot pending confirm
  const [expandedTimeTaskId, setExpandedTimeTaskId] = useState(null);
  const devilAutoCleanLastRef = useRef(0);
  const recentTaskCreateKeysRef = useRef(new Map());
  const highlightClearTimerRef = useRef(null);
  const plannerContentRef = useRef(null);
  const tasksRef = useRef([]);
  const pendingTaskWritesRef = useRef(new Map());
  const dismissedReportItemIdsRef = useRef(new Set());
  const plannerReportAutoOpenedThisSessionRef = useRef(false);
  const plannerReportClosedThisSessionRef = useRef(false);
  const plannerReportEntryWindowOpenRef = useRef(false);
  const plannerReportInitialSnapshotSeenRef = useRef(false);
  const panicTickIntervalRef = useRef(null);
  const panicEndsAtRef = useRef(null);
  const angelLabRecognitionRef = useRef(null);
  const angelLabRecognitionBaseTextRef = useRef("");
  const angelLabRecognitionSegmentsRef = useRef([]);
  const angelLabRecognitionFinalTextRef = useRef("");
  const angelLabRecognitionInterimTextRef = useRef("");
  const angelLabRecorderRef = useRef(null);
  const angelLabRecorderStreamRef = useRef(null);
  const angelLabAudioChunksRef = useRef([]);
  const angelLabMicRequestIdRef = useRef(0);
  const completionCelebrationTimerRef = useRef(null);
  const completionBannerTimerRef = useRef(null);
  const cemeteryMoveInFlightRef = useRef(new Set());

  useEffect(() => {
    if (!resetAngelMemoryRequested) return;
    resetAngelComfortMemory();
    setDismissedAngelEntryId("");
    setDismissedMissionBubbleTaskId("");
    setManualMissionOverrideTaskId("");
    setManualMissionOverrideTask(null);
    setForcedMissionDisplayTask(null);
    setMissionDisplayFallbackTask(null);
    setConfirmedNotYourMovePressureKeys([]);
    setNudgeStatus(language === "en"
      ? "QA: Angel comfort memory reset."
      : "QA: локальная память ангела сброшена.");
  }, [resetAngelMemoryRequested, language]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // Companions (angel/devil) always win over zone columns when pointer is inside both
  const dndCollision = useCallback((args) => {
    const pw = pointerWithin(args);
    if (pw.length > 0) {
      const companion = pw.find(c => c.id === "drop-devil" || c.id === "drop-angel");
      if (companion) return [companion];
      return pw;
    }
    return closestCenter(args);
  }, []);
  const [panicTaskId, setPanicTaskId] = useState(null);
  const [panicEndsAt, setPanicEndsAt] = useState(null);
  const [panicTick, setPanicTick] = useState(Date.now());
  const [panicDraftStep, setPanicDraftStep] = useState("");
  const [panicStepOverride, setPanicStepOverride] = useState("");
  const [panicStepOverrideSubtaskId, setPanicStepOverrideSubtaskId] = useState("");
  const [panicStepSource, setPanicStepSource] = useState("");
  const [pendingRescueStepCompletion, setPendingRescueStepCompletion] = useState(null);
  const [companionPromptQuietUntil, setCompanionPromptQuietUntil] = useState(() => readCompanionPromptQuietUntil());
  const [angelLabOpen, setAngelLabOpen] = useState(false);
  const [angelLabText, setAngelLabText] = useState("");
  const [angelLabSaving, setAngelLabSaving] = useState(false);
  const [angelLabListening, setAngelLabListening] = useState(false);
  const [angelLabMicMode, setAngelLabMicMode] = useState("");
  const [angelLabStatus, setAngelLabStatus] = useState({ kind: "", message: "" });
  const [angelLabMicStatus, setAngelLabMicStatus] = useState("");
  const [angelLabProcessing, setAngelLabProcessing] = useState(false);
  const [angelLabFinalizing, setAngelLabFinalizing] = useState(false);
  const [angelLabDumpHistory, setAngelLabDumpHistory] = useState([]);
  const [angelLabSuggestions, setAngelLabSuggestions] = useState([]);
  const [angelLabHandledNotice, setAngelLabHandledNotice] = useState(null);
  const [angelLabHandledStats, setAngelLabHandledStats] = useState({ added: 0, skipped: 0 });
  const [angelLabExecutiveAssessment, setAngelLabExecutiveAssessment] = useState(null);
  const [dismissedMissionBubbleTaskId, setDismissedMissionBubbleTaskId] = useState("");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const onboardingAutoShownRef = useRef(false);

  const toggleTheme = () => {
    setTheme(prev => {
      const order = ['dark', 'neon', 'light'];
      const next = order[(order.indexOf(prev) + 1) % order.length];
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      return next;
    });
  };

  // Flag to distinguish first load from component updates
  const [dataLoaded, setDataLoaded] = useState(false);
  const [calendarToken, setCalendarToken] = useState(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  // True once Firestore subcollection has delivered at least one snapshot (or migration finished).
  // Blocks per-task saveTask calls until server state is confirmed.
  const firestoreReadyRef = React.useRef(false);
  const navigate = useNavigate();
  const notificationPermission =
    typeof window === "undefined" || !("Notification" in window)
      ? "unsupported"
      : Notification.permission;

  useEffect(() => {
    try {
      if (!isDemoRoute) {
        localStorage.setItem("planner_language", language);
      }
    } catch (error) {
      console.warn("[Planner] Не удалось сохранить язык интерфейса:", error);
    }
    const frame = window.requestAnimationFrame(() => applyDemoTranslations(language));
    return () => window.cancelAnimationFrame(frame);
  });

  useEffect(() => {
    if (!isDemoRoute || language === "en") return;
    setLanguage("en");
  }, [isDemoRoute, language]);

  const trackDailyAction = () => {
    const today = getDayKey();
    const yesterday = getDayKey(Date.now() - 24 * 60 * 60 * 1000);

    setPulseState((previous) => {
      const alreadyCountedToday = previous.lastActionDay === today;
      const nextStreak = alreadyCountedToday
        ? previous.streak
        : previous.lastActionDay === yesterday
          ? previous.streak + 1
          : 1;

      return {
        ...previous,
        streak: nextStreak,
        lastActionDay: today,
        lastActionAt: Date.now(),
        actionsToday: alreadyCountedToday ? (previous.actionsToday || 0) + 1 : 1,
      };
    });
  };

  // Minimum loading screen duration
  useEffect(() => {
    const t = setTimeout(() => setMinLoadDone(true), MIN_LOADING_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (completionCelebrationTimerRef.current) {
        clearTimeout(completionCelebrationTimerRef.current);
      }
      if (completionBannerTimerRef.current) {
        clearTimeout(completionBannerTimerRef.current);
      }
    };
  }, []);

  // Safety net: if loading never resolves (Firestore unreachable, corrupt localStorage, etc.)
  // force-dismiss the loading screen after 10 seconds so the app becomes usable.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  function clearPanicCountdownTimer() {
    if (panicTickIntervalRef.current) {
      clearInterval(panicTickIntervalRef.current);
      panicTickIntervalRef.current = null;
    }
    panicEndsAtRef.current = null;
  }

  function startPanicCountdownTimer(endsAt, options = {}) {
    const now = Date.now();
    const activeEndsAt = Number(panicEndsAtRef.current || 0);
    if (panicTickIntervalRef.current && activeEndsAt > now && !options.force) {
      return;
    }
    clearPanicCountdownTimer();
    panicEndsAtRef.current = endsAt;
    setPanicTick(now);
    setPanicEndsAt(endsAt);
    panicTickIntervalRef.current = setInterval(() => {
      setPanicTick(Date.now());
    }, 500);
  }

  useEffect(() => () => clearPanicCountdownTimer(), []);

  useEffect(() => {
    firestoreReadyRef.current = false;
    pendingTaskWritesRef.current = new Map();
    tasksRef.current = [];
  }, [user?.id]);

  const commitTasks = useCallback((nextTasks) => {
    const stableTasks = dedupeActiveTasksByTitle(nextTasks);
    tasksRef.current = stableTasks;
    setTasks(stableTasks);
  }, []);

  const mutateSingleTask = useCallback((taskId, mutator) => {
    const currentTasks = tasksRef.current;
    let updatedTask = null;

    const nextTasks = currentTasks.map((task) => {
      if (String(task.id) !== String(taskId)) return task;
      const candidate = mutator(task, currentTasks);
      if (!candidate || candidate === task) return task;
      updatedTask = candidate;
      return candidate;
    });

    if (!updatedTask) return null;
    commitTasks(nextTasks);
    return updatedTask;
  }, [commitTasks]);

  useEffect(() => {
    let mounted = true;

    const resolveRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!mounted || !result) return;

        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          setCalendarToken(credential.accessToken);
        }
      } catch (error) {
        console.error("Calendar redirect error:", error);
      }
    };

    resolveRedirectResult();
    return () => {
      mounted = false;
    };
  }, []);

  // Load User & Data from Cloud
  useEffect(() => {
    const storedUser = isDemoRoute ? JSON.stringify(DEMO_USER) : localStorage.getItem("adhdUser");
    if (!storedUser) {
      navigate("/login");
      return;
    }

    let parsedUser;
    try {
      parsedUser = JSON.parse(storedUser);
    } catch (e) {
      console.error("[Planner] Corrupt adhdUser in localStorage, clearing:", e);
      localStorage.removeItem("adhdUser");
      setLoading(false);
      navigate("/login");
      return;
    }
    setUser(parsedUser);

    const loadCloudData = () => {
      // If guest mode (offline)
      if (parsedUser.id.startsWith("guest_")) {
        if (isDemoUserId(parsedUser.id)) {
          const shouldSeedDemo = demoResetRequested || !localStorage.getItem(DEMO_TASKS_KEY);
          if (shouldSeedDemo) {
            const demoSeed = buildDemoPlannerSeed();
            writeCachedPlannerEvents(parsedUser.id, demoSeed.events);
            localStorage.removeItem(`adhd_onboarding_seen_${parsedUser.id}`);
            resetAngelComfortMemory();
            seedDemoQuestLoopScenarioMemory(demoSeed.tasks, demoResetScenario);
            localStorage.setItem(DEMO_TASKS_KEY, JSON.stringify(demoSeed.tasks));
            localStorage.setItem(DEMO_SCORE_KEY, String(demoSeed.score));
          }
        }
        const guestState = loadGuestPlannerState(parsedUser.id, {
          demoUserId: DEMO_USER_ID,
          demoTasksKey: DEMO_TASKS_KEY,
          demoScoreKey: DEMO_SCORE_KEY,
          stripTasks: stripLocalTaskStateList,
        });
        const localTasks = guestState.tasks;
        const localScore = guestState.score;
        setTasks(dedupeActiveTasksByTitle(localTasks));
        setScore(localScore);
        setLoading(false);
        setDataLoaded(true);
        return () => {};
      } else {
        const cachedCloudData = loadCloudCache(parsedUser.id);

        if (cachedCloudData) {
          setTasks(dedupeActiveTasksByTitle(cachedCloudData.tasks || []));
          setScore(cachedCloudData.score || 0);
          setLoading(false);
        }

        let isCancelled = false;
        let migrationAttempted = false;

        const applyCloudData = (firebaseUser) => {
          if (!firebaseUser) {
            console.warn("Пользователь не авторизован в Firebase. Перенаправляем на логин.");
            setLoading(false);
            localStorage.removeItem("adhdUser");
            navigate("/login");
            return;
          }

          return subscribeToTasks(
            parsedUser.id,
            async (tasks, metadata) => {
              if (isCancelled) return;

              // First snapshot with empty subcollection → try to migrate from old array
              if (!firestoreReadyRef.current && tasks.length === 0 && !migrationAttempted) {
                migrationAttempted = true;
                const result = await migrateTasksToSubcollection(parsedUser.id);
                if (result.migrated > 0) {
                  if (typeof result.score === "number") setScore(result.score);
                  // Next onSnapshot will deliver the migrated tasks — do nothing here
                  return;
                }
                // No old tasks found — brand new account
                const initialScore = await getUserScore(parsedUser.id);
                setScore(initialScore);
              }

              // Load score from root doc on first real snapshot
              if (!firestoreReadyRef.current) {
                const serverScore = await getUserScore(parsedUser.id);
                setScore(serverScore);
                firestoreReadyRef.current = true;
              }

              let nextActiveOrder = getNextTaskOrder(tasks, "active");
              const healedTasks = tasks.map((task) => {
                if (!shouldAutoReviveProtectedDeadTask(task)) return task;
                const next = reviveProtectedDeadTask(task);
                const revivedTask = { ...next, position: nextActiveOrder };
                nextActiveOrder += 1;
                return revivedTask;
              });

              const repairedTasks = healedTasks.filter(
                (task, index) => task !== tasks[index],
              );

              if (repairedTasks.length > 0) {
                console.warn(
                  "[Planner] Auto-revived protected dead tasks from stale state:",
                  repairedTasks.map((task) => task.text),
                );
                runPlannerClientAction({
                  action: PLANNER_ACTIONS.REPAIR_PROTECTED_TASKS,
                  source: "web_startup_repair",
                  payload: {
                    taskIds: repairedTasks.map((task) => String(task.id)).filter(Boolean),
                    reason: "protected_dead_without_deadAt",
                    idempotencyKey: `web_startup_repair_${parsedUser.id}_${repairedTasks.map((task) => String(task.id)).join("_")}_${getShortIdempotencyBucket()}`,
                  },
                }).catch((error) => {
                  console.error("[Planner] protected-task backend repair failed:", error);
                });
              }

              // Always merge — on first snapshot prevTasks is [] or from
              // cloud cache. If the cache has a task marked "completed" with a
              // fresh lastUpdated (user completed it then reloaded before the
              // Firestore write committed), mergeTaskLists keeps the completed
              // state instead of overwriting it with the stale Firestore data.
              setTasks(prevTasks => mergeTaskLists(prevTasks, healedTasks));
              setLoading(false);
              setDataLoaded(true);
            },
            () => {
              if (!cachedCloudData) setLoading(false);
            },
          );
        };

        if (auth.currentUser && auth.currentUser.uid === parsedUser.id) {
          const unsubscribeCloud = applyCloudData(auth.currentUser);
          return () => {
            isCancelled = true;
            if (typeof unsubscribeCloud === "function") unsubscribeCloud();
          };
        }

        let unsubscribeCloud = null;
        const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
          unsubscribeAuth();
          unsubscribeCloud = applyCloudData(firebaseUser);
        });
        return () => {
          isCancelled = true;
          unsubscribeAuth();
          if (typeof unsubscribeCloud === "function") unsubscribeCloud();
        };
      }
    };

    const cleanup = loadCloudData();
    return cleanup;
  }, [demoResetRequested, demoResetScenario, isDemoRoute, navigate]);

  useEffect(() => {
    if (!user?.id) return;
    setPulseState(loadPulseState(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || onboardingAutoShownRef.current) return;
    onboardingAutoShownRef.current = true;
    if (isPublicDemoRoute && !demoPreserveRequested) {
      setOnboardingOpen(true);
      return;
    }
    try {
      const key = `adhd_onboarding_seen_${user.id}`;
      if (localStorage.getItem(key) !== "1") {
        setOnboardingOpen(true);
      }
    } catch (error) {
      console.warn("[Planner] Не удалось прочитать onboarding state:", error);
    }
  }, [demoPreserveRequested, isPublicDemoRoute, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setPlannerEvents([]);
      setPlannerReportItems([]);
      setPlannerMeta(null);
      return undefined;
    }

    const cachedEvents = readCachedPlannerEvents(user.id);
    setPlannerEvents(cachedEvents);

    if (String(user.id).startsWith("guest_")) {
      return undefined;
    }

    return subscribeToPlannerEvents(user.id, (cloudEvents = []) => {
      const mergedEvents = mergePlannerEvents(readCachedPlannerEvents(user.id), cloudEvents);
      setPlannerEvents(mergedEvents);
      writeCachedPlannerEvents(user.id, mergedEvents);
    }, PLANNER_EVENT_LIMIT);
  }, [user?.id]);

  useEffect(() => {
    dismissedReportItemIdsRef.current = new Set();
    plannerReportAutoOpenedThisSessionRef.current = false;
    plannerReportClosedThisSessionRef.current = false;
    plannerReportEntryWindowOpenRef.current = Boolean(user?.id && !String(user.id).startsWith("guest_"));
    plannerReportInitialSnapshotSeenRef.current = false;
    pendingCloudRemovalTimestamps.clear();
    pendingCloudStatusIntents.clear();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || String(user.id).startsWith("guest_")) {
      return undefined;
    }

    return subscribeToReportItems(user.id, (cloudItems = []) => {
      const isInitialReportSnapshot = !plannerReportInitialSnapshotSeenRef.current;
      plannerReportInitialSnapshotSeenRef.current = true;
      const reportEvents = normalizePlannerReportFeed(cloudItems)
        .filter((event) => !dismissedReportItemIdsRef.current.has(String(event.reportItemId || "")));
      setPlannerReportItems(reportEvents);
      if (reportEvents.length === 0) {
        setPlannerReport(null);
        return;
      }
      const reportPanel = buildPlannerReportPanel(reportEvents, { onlyUnseen: true });
      if (!reportPanel) {
        return;
      }
      if (!isInitialReportSnapshot || !plannerReportEntryWindowOpenRef.current) return;
      if (plannerReportClosedThisSessionRef.current || plannerReportAutoOpenedThisSessionRef.current) return;
      if ((reportPanel.reportItemIds || []).every((id) => dismissedReportItemIdsRef.current.has(String(id)))) return;
      if (hasPlannerReportAutoOpenedInSession(user.id, reportPanel)) return;
      if (companionPromptActiveRef.current) {
        plannerReportEntryWindowOpenRef.current = false;
        plannerReportAutoOpenedThisSessionRef.current = true;
        return;
      }
      plannerReportEntryWindowOpenRef.current = false;
      plannerReportAutoOpenedThisSessionRef.current = true;
      markPlannerReportAutoOpenedInSession(user.id, reportPanel);
      setPlannerReport((previous) => previous || reportPanel);
    }, 16);
  }, [user?.id]);

  useEffect(() => {
    if (!dataLoaded || !user?.id || String(user.id).startsWith("guest_")) return;

    let cancelled = false;

    const loadPlannerBootstrapReport = async () => {
      try {
        if (!auth.currentUser) return;

        const payload = await runPlannerBootstrap({
          authUser: auth.currentUser,
          reportLimit: 10,
          language,
        });
        if (cancelled) return;

        const update = buildPlannerClientUpdate(payload, {
          currentTasks: tasksRef.current,
          currentScore: score,
          mergeTaskLists: mergeAuthoritativeTaskLists,
        });

        applyPlannerClientUpdate(update, {
          userId: user.id,
          currentTasks: tasksRef.current,
          commitTasks,
          setScore,
          setPlannerMeta,
          setPlannerClientContractStatus,
          setPlannerReportItems,
          setPlannerReport: setPlannerReportIfNotDismissed,
          mergePlannerEventItemsIntoState,
          saveCloudCache,
        });
      } catch (error) {
        console.warn("[Planner] Не удалось загрузить report items:", error);
      } finally {
        if (!cancelled) {
          plannerReportEntryWindowOpenRef.current = false;
        }
      }
    };

    loadPlannerBootstrapReport();

    return () => {
      cancelled = true;
    };
  }, [dataLoaded, language, user?.id]);

  useEffect(() => {
    if (!dataLoaded || !user?.id || String(user.id).startsWith("guest_")) return;
    // Cloud users now use reportItems as the single source for the login report.
    // The old plannerEvents fallback could reopen "While you were away" right
    // after reportItems were acknowledged, creating a notification loop.
  }, [dataLoaded, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    saveStoredPulseState(user.id, pulseState, { prefix: PULSE_STORAGE_PREFIX });
  }, [pulseState, user?.id]);

  useEffect(() => {
    if (!user?.id || user.id.startsWith("guest_")) return;
    if (!firestoreReadyRef.current) return;
    saveCloudCache(user.id, tasks, score);
  }, [tasks, score, user?.id]);

  // Guest mode: sync to localStorage whenever tasks or score change
  useEffect(() => {
    if (!dataLoaded || !user?.id.startsWith("guest_")) return;
    saveGuestPlannerState(user.id, tasks, score, {
      demoUserId: DEMO_USER_ID,
      demoTasksKey: DEMO_TASKS_KEY,
      demoScoreKey: DEMO_SCORE_KEY,
      stripTasks: stripLocalTaskStateList,
    });
  }, [tasks, score, dataLoaded, user?.id]);

  // Cooling / automatic death is handled by the server cron.
  // The browser must not move tasks to cemetery on page open: it makes the app feel unstable.

  const orderedActiveTasks = sortTasksByOrder(tasks.filter((task) => task.status === "active"));
  const activeOrderIndex = new Map(orderedActiveTasks.map((task, index) => [task.id, index]));
  const priorityActiveTasks = [...orderedActiveTasks].sort((left, right) => {
    const priorityDelta = getPriorityScore(right) - getPriorityScore(left);
    if (priorityDelta !== 0) return priorityDelta;
    return (activeOrderIndex.get(left.id) || 0) - (activeOrderIndex.get(right.id) || 0);
  });
  const activeTasks = orderedActiveTasks;
  const activeNotYourMoveTaskIdSet = new Set(
    activeTasks
      .filter((task) => isTaskNotYourMove(task))
      .map((task) => String(task.id || "").trim())
      .filter(Boolean),
  );
  const activeNotYourMoveTaskTitleKeySet = new Set(
    activeTasks
      .filter((task) => isTaskNotYourMove(task))
      .map((task) => normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(task)))
      .filter(Boolean),
  );
  const dismissedPressureTaskId = String(dismissedMissionBubbleTaskId || "").trim();
  const dismissedPressureTaskIsCooling = Boolean(dismissedPressureTaskId) && (
    String(notYourMoveDraft?.taskId || "") === dismissedPressureTaskId ||
    readCompanionPromptQuietUntil() > Date.now()
  );
  const pressureSuppressedTaskIdSet = new Set(pressureSuppressedTaskIds.map((taskId) => String(taskId || "").trim()).filter(Boolean));
  const confirmedNotYourMovePressureKeySet = new Set(
    confirmedNotYourMovePressureKeys.map((key) => String(key || "").trim()).filter(Boolean),
  );
  const storedNotYourMovePressureHold = readNotYourMovePressureHold();
  const heldNotYourMoveTaskId = String(notYourMoveHeldTaskId || notYourMoveDraft?.taskId || storedNotYourMovePressureHold?.taskId || "").trim();
  const heldNotYourMoveTaskTitleKey = normalizeTaskTitleForDuplicateCheck(
    notYourMoveHeldTaskTitle || notYourMoveDraft?.taskTitle || storedNotYourMovePressureHold?.taskTitle || "",
  );
  if (heldNotYourMoveTaskId) pressureSuppressedTaskIdSet.add(heldNotYourMoveTaskId);
  if (dismissedPressureTaskIsCooling && dismissedPressureTaskId) pressureSuppressedTaskIdSet.add(dismissedPressureTaskId);
  const isTaskHeldFromPressure = (task = {}) => {
    const taskId = String(task.id || "").trim();
    if (taskId && pressureSuppressedTaskIdSet.has(taskId)) return true;
    if (!heldNotYourMoveTaskTitleKey) return false;
    return normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(task)) === heldNotYourMoveTaskTitleKey;
  };
  const isTaskConfirmedNotYourMovePressure = (task = {}) => {
    const taskId = String(task.id || "").trim();
    if (taskId && confirmedNotYourMovePressureKeySet.has(`id:${taskId}`)) return true;
    const titleKey = normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(task));
    return Boolean(titleKey && confirmedNotYourMovePressureKeySet.has(`title:${titleKey}`));
  };
  const isTaskSuppressedFromPressure = (task = {}) => {
    const taskId = String(task.id || "").trim();
    if (taskId && pressureSuppressedTaskIdSet.has(taskId)) return true;
    if (taskId && activeNotYourMoveTaskIdSet.has(taskId)) return true;
    const taskTitleKey = normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(task));
    if (taskTitleKey && activeNotYourMoveTaskTitleKeySet.has(taskTitleKey)) return true;
    if (isTaskHeldFromPressure(task)) return true;
    if (isTaskConfirmedNotYourMovePressure(task)) return true;
    if (isTaskNotYourMove(task)) return true;
    const relationMemory = getQuestRelationMemory({
      taskId: task.id,
      taskTitle: getTaskDisplayTitle(task),
    });
    const relationSignal = String(relationMemory?.lastSignal || "").trim().toLowerCase();
    const relationStrategy = String(relationMemory?.lastStrategy || "").trim().toLowerCase();
    return relationStrategy === "hold_external_dependency" ||
      relationSignal === "not_my_move" ||
      relationSignal === "still_waiting";
  };
  const getCurrentTaskForPressureCheck = (task = {}) => {
    const taskId = String(task.id || "").trim();
    if (taskId) {
      const currentById = activeTasks.find((candidate) => String(candidate.id || "").trim() === taskId);
      if (currentById) return currentById;
    }
    const titleKey = normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(task));
    if (titleKey) {
      const currentByTitle = activeTasks.find((candidate) => (
        normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(candidate)) === titleKey
      ));
      if (currentByTitle) return currentByTitle;
    }
    return task;
  };
  const isMissionCandidateSuppressed = (task = {}) => {
    const currentTask = getCurrentTaskForPressureCheck(task);
    return isTaskSuppressedFromPressure(currentTask) ||
      (currentTask !== task && isTaskSuppressedFromPressure(task));
  };
  const pressureActiveTasks = activeTasks.filter((task) => !isTaskSuppressedFromPressure(task));
  const completedTasks = sortTasksByOrder(tasks.filter((task) => task.status === "completed"));
  const deadTasks = sortTasksByOrder(tasks.filter((task) => task.status === "dead"));
  const todayPinnedTasks = activeTasks.filter((task) => task.isToday);
  const dangerTasks = activeTasks.filter((task) => !isTaskSuppressedFromPressure(task) && getTaskHeat(task) <= 25);
  const visibleActiveTasks = activeFilter === "today"
    ? todayPinnedTasks
    : activeFilter === "danger"
      ? dangerTasks
      : activeTasks;
  const localMissionSelection = getMissionSelection(priorityActiveTasks.filter((task) => !isMissionCandidateSuppressed(task)));
  const manualMissionOverrideTaskFromList = manualMissionOverrideTaskId
    ? priorityActiveTasks.find((task) => String(task.id) === String(manualMissionOverrideTaskId) && !isMissionCandidateSuppressed(task))
    : null;
  const effectiveManualMissionOverrideTask = manualMissionOverrideTaskFromList ||
    (manualMissionOverrideTask && !isMissionCandidateSuppressed(manualMissionOverrideTask)
      ? manualMissionOverrideTask
      : null);
  const forcedMissionDisplayTaskFromList = forcedMissionDisplayTask?.id
    ? priorityActiveTasks.find((task) => String(task.id) === String(forcedMissionDisplayTask.id) && !isTaskNotYourMove(task))
    : null;
  const effectiveForcedMissionDisplayTask = forcedMissionDisplayTaskFromList ||
    (forcedMissionDisplayTask && !isTaskNotYourMove(forcedMissionDisplayTask)
      ? forcedMissionDisplayTask
      : null);
  const missionDisplayFallbackTaskFromList = missionDisplayFallbackTask?.id
    ? activeTasks.find((task) => String(task.id) === String(missionDisplayFallbackTask.id) && !isTaskNotYourMove(task))
    : null;
  const effectiveMissionDisplayFallbackTask = missionDisplayFallbackTaskFromList ||
    (missionDisplayFallbackTask && !isTaskNotYourMove(missionDisplayFallbackTask)
      ? missionDisplayFallbackTask
      : null);
  const backendMissionTask = plannerMeta?.mission_task_id
    ? pressureActiveTasks.find((task) => String(task.id) === String(plannerMeta.mission_task_id) && !isTaskNotYourMove(task))
    : null;
  const backendRescueTask = plannerMeta?.suggested_rescue_task_id
    ? pressureActiveTasks.find((task) => String(task.id) === String(plannerMeta.suggested_rescue_task_id) && !isTaskNotYourMove(task))
    : null;
  const rawMissionSelection = backendMissionTask
    ? {
        task: backendMissionTask,
        reason: plannerMeta.mission_reason || localMissionSelection.reason || "auto_priority",
        explanation: plannerMeta.mission_explanation || "",
      }
    : localMissionSelection;
  const missionSelectionBeforeGuard = effectiveForcedMissionDisplayTask
    ? {
        task: effectiveForcedMissionDisplayTask,
        reason: localMissionSelection.reason || "auto_priority",
        explanation: localMissionSelection.explanation || "",
      }
    : effectiveManualMissionOverrideTask
    ? {
        task: effectiveManualMissionOverrideTask,
        reason: localMissionSelection.reason || "auto_priority",
        explanation: localMissionSelection.explanation || "",
      }
    : rawMissionSelection?.task && isTaskHeldFromPressure(rawMissionSelection.task)
      ? getMissionSelection(priorityActiveTasks.filter((task) => !isTaskSuppressedFromPressure(task)))
      : rawMissionSelection;
  const unsuppressedMissionSelection = getMissionSelection(
    priorityActiveTasks.filter((task) => !isMissionCandidateSuppressed(task))
  );
  const missionSelection = missionSelectionBeforeGuard?.task && !effectiveForcedMissionDisplayTask && isMissionCandidateSuppressed(missionSelectionBeforeGuard.task)
    ? unsuppressedMissionSelection
    : missionSelectionBeforeGuard;
  const isMissionHardHeldForPressure = (task = {}) => {
    const currentTask = getCurrentTaskForPressureCheck(task);
    const taskId = String(task.id || currentTask?.id || "").trim();
    const taskTitleKey = normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(task) || getTaskDisplayTitle(currentTask));
    if (taskId && pressureSuppressedTaskIdSet.has(taskId)) return true;
    if (taskId && activeNotYourMoveTaskIdSet.has(taskId)) return true;
    if (taskId && confirmedNotYourMovePressureKeySet.has(`id:${taskId}`)) return true;
    if (taskTitleKey && activeNotYourMoveTaskTitleKeySet.has(taskTitleKey)) return true;
    if (taskTitleKey && confirmedNotYourMovePressureKeySet.has(`title:${taskTitleKey}`)) return true;
    if (isTaskNotYourMove(currentTask) || isTaskNotYourMove(task)) return true;
    return Boolean(currentTask?.blocked || currentTask?.notYourMove);
  };
  const missionDisplayReplacementSelection = missionSelection?.task && isMissionHardHeldForPressure(missionSelection.task)
    ? selectMissionReplacementFromTasks(activeTasks, missionSelection.task.id, getTaskDisplayTitle(missionSelection.task))
    : null;
  const missionDisplaySelection = effectiveMissionDisplayFallbackTask
    ? {
        task: effectiveMissionDisplayFallbackTask,
        reason: missionSelection?.reason || localMissionSelection.reason || "auto_priority",
        explanation: "",
      }
    : missionDisplayReplacementSelection?.task
    ? missionDisplayReplacementSelection
    : missionSelection;
  const rescueTask = missionDisplaySelection.task;
  const missionReason = missionDisplaySelection.reason;
  const missionExplanation = localizePlannerExplanation(missionDisplaySelection.explanation || "", language);
  useEffect(() => {
    if (!rescueTask?.id && !rescueTask?.text) return;
    const rescueTaskTitle = getTaskDisplayTitle(rescueTask);
    const rescueTaskTitleKey = normalizeTaskTitleForDuplicateCheck(rescueTaskTitle);
    const currentMissionTask = activeTasks.find((task) => {
      const sameId = rescueTask.id && String(task.id || "") === String(rescueTask.id);
      const sameTitle = rescueTaskTitleKey &&
        normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(task)) === rescueTaskTitleKey;
      return sameId || sameTitle;
    });
    if (!currentMissionTask || !isTaskNotYourMove(currentMissionTask)) return;

    const replacementSelection = selectMissionReplacementFromTasks(
      activeTasks,
      currentMissionTask.id,
      getTaskDisplayTitle(currentMissionTask),
    );
    const replacementTask = replacementSelection?.task || null;
    if (!replacementTask?.id) return;
    if (String(replacementTask.id) === String(currentMissionTask.id)) return;
    if (forcedMissionDisplayTask?.id && String(forcedMissionDisplayTask.id) === String(replacementTask.id)) return;
    applyMissionReplacementSelection(replacementSelection);
  }, [tasks, rescueTask?.id, rescueTask?.text, forcedMissionDisplayTask?.id]);
  const defaultRescueTask = rescueTask || backendRescueTask;
  const baseExecutiveControlSuggestion = buildExecutiveControlSuggestion({
    tasks: pressureActiveTasks,
    state: executiveState || "stuck",
    missionTask: rescueTask,
    rescueTask: defaultRescueTask,
    language,
  });
  const angelAssessmentTask = angelLabExecutiveAssessment?.controlTaskId
    && angelLabExecutiveAssessment.state === (executiveState || "stuck")
    ? pressureActiveTasks.find((task) => String(task.id) === String(angelLabExecutiveAssessment.controlTaskId))
    : null;
  const angelAssessmentSuggestion = angelAssessmentTask
    ? {
      task: angelAssessmentTask,
      taskId: angelAssessmentTask.id,
      taskTitle: angelLabExecutiveAssessment.controlTaskTitle || getTaskDisplayTitle(angelAssessmentTask),
      stepText: angelLabExecutiveAssessment.stepText || buildControlStepForTask(angelAssessmentTask, language).text,
      stepIsExisting: Boolean(angelLabExecutiveAssessment.stepIsExisting),
      shouldAddStep: Boolean(angelLabExecutiveAssessment.shouldAddStep),
      reasons: [
        language === "en" ? "detected from Angel Lab" : "определено из Angel Lab",
        language === "en" ? "control-restoring task" : "задача возвращает контроль",
      ],
      score: 999,
    }
    : null;
  const executiveControlSuggestion = angelAssessmentSuggestion || baseExecutiveControlSuggestion;
  const panicTask = panicTaskId
    ? tasks.find((task) => String(task.id) === String(panicTaskId)) || null
    : defaultRescueTask;
  const basePanicPlan = buildPanicPlan(panicTask, language);
  const panicPlan = panicStepOverride && panicTaskId && String(panicTask?.id || "") === String(panicTaskId)
    ? {
        ...basePanicPlan,
        steps: [
          panicStepOverride,
          ...(Array.isArray(basePanicPlan.steps)
            ? basePanicPlan.steps.filter((step) => String(step || "") !== panicStepOverride)
            : []),
        ],
      }
    : basePanicPlan;
  const rescueDeadline = getLocalizedDeadlineInfo(rescueTask, language);
  const tasksInDanger = dangerTasks.length;
  const todayActions = pulseState.lastActionDay === getDayKey() ? pulseState.actionsToday || 0 : 0;
  const panicSecondsLeft = panicEndsAt ? Math.max(0, Math.ceil((panicEndsAt - panicTick) / 1000)) : 0;
  const latestDevilEvent = plannerEvents.find((event) => event?.actor === "devil") || null;
  const latestDevilStatus = latestDevilEvent
    ? {
        ...latestDevilEvent,
        timeLabel: formatPlannerEventTime(latestDevilEvent.createdAt),
      }
    : null;
  const backendCounts = plannerMeta?.global_counts && typeof plannerMeta.global_counts === "object"
    ? plannerMeta.global_counts
    : null;
  const plannerStatusCounts = {
    active: Number.isFinite(Number(backendCounts?.active)) ? Number(backendCounts.active) : activeTasks.length,
    danger: Number.isFinite(Number(backendCounts?.danger)) ? Number(backendCounts.danger) : tasksInDanger,
    today: Number.isFinite(Number(backendCounts?.today)) ? Number(backendCounts.today) : todayPinnedTasks.length,
  };
  const deliveryStatus = plannerMeta?.delivery_status && typeof plannerMeta.delivery_status === "object"
    ? plannerMeta.delivery_status
    : null;
  const deliveryStatusForUi = deliveryStatus && isTelegramDeliveryRecovered(deliveryStatus, plannerMeta, plannerEvents)
    ? {
        ...deliveryStatus,
        status: "linked",
        recovered: true,
        recoveredAt: getTelegramLiveTimestamp(plannerMeta, plannerEvents) || getTelegramLinkState(plannerMeta).lastSeenAt || getTelegramLinkState(plannerMeta).linkedAt || 0,
      }
    : deliveryStatus && isStaleTelegramDeliveryFailure(deliveryStatus, plannerMeta, plannerEvents)
      ? {
          ...deliveryStatus,
          status: "stale_failure",
          staleFailure: true,
        }
    : deliveryStatus;
  const plannerReportHistoryEvents = sortPlannerEvents(plannerReportItems).filter(isPlannerReportEvent);
  const humanPlannerEvents = plannerEvents.filter((event) => !isTechnicalPlannerEvent(event));
  const technicalPlannerEvents = plannerEvents.filter(isTechnicalPlannerEvent);
  const plannerEngineDecisions = getPlannerEngineDecisions(plannerMeta, language);
  const angelEntrySession = plannerMeta?.angel_entry_session && typeof plannerMeta.angel_entry_session === "object"
    ? plannerMeta.angel_entry_session
    : null;
  const manualAngelEntryRequested = angelEntryRequested || angelEntryPanelRequested;
  const shouldForceManualAngelEntry = manualAngelEntryRequested &&
    !questLoopNotNowThresholdRequested &&
    !questRelationDirectorPrimaryRequested;
  const manualNotYourMovePreviewTask = activeTasks.find((task) => isTaskNotYourMove(task)) || activeTasks[0] || null;
  const forcedAngelEntrySession = !angelEntrySession && shouldForceManualAngelEntry
    ? notYourMoveCheckinPreviewRequested
      ? {
          id: `forced_not_your_move_checkin_${manualNotYourMovePreviewTask?.id || "none"}`,
          trigger: "not_your_move_checkin_due",
          mode: "not_your_move_checkin",
          taskId: manualNotYourMovePreviewTask?.id || null,
          message: language === "en"
            ? "Preview: this is a gentle waiting-task check-in, not a demand to finish."
            : "Preview: это мягкая проверка задачи в ожидании, не требование закончить.",
          primaryCta: language === "en" ? "Check status gently" : "Мягко проверить статус",
          secondaryCta: language === "en" ? "Keep waiting" : "Пусть ждёт",
          diagnosisQuestion: language === "en" ? "Is this still waiting?" : "Это всё ещё ждёт?",
          diagnosisOptions: manualNotYourMovePreviewTask ? [
            { id: "still_waiting", effect: "keep_waiting" },
            { id: "back_in_my_hands", effect: "clear_not_your_move" },
          ] : [],
          source: "manual_not_your_move_preview",
          contractVersion: "angel_entry_preview_v1",
        }
      : {
          id: `forced_angel_entry_${defaultRescueTask?.id || "daily"}`,
          trigger: defaultRescueTask ? "repeated_resistance" : "daily_checkin",
          mode: defaultRescueTask ? "diagnose_resistance" : "brain_dump",
          taskId: defaultRescueTask?.id || null,
          taskTitle: defaultRescueTask ? getTaskDisplayTitle(defaultRescueTask) : "",
          message: language === "en"
            ? defaultRescueTask
              ? `“${getTaskDisplayTitle(defaultRescueTask)}” keeps resisting the direct route. I will not push it again.`
              : "This quest keeps resisting the direct route. I will not push it again."
            : defaultRescueTask
              ? `«${getTaskDisplayTitle(defaultRescueTask)}» сопротивляется прямому входу. Я не буду давить ещё раз.`
              : "Этот квест сопротивляется прямому входу. Я не буду давить ещё раз.",
          primaryCta: language === "en" ? "Find sticky point" : "Найти липкое место",
          secondaryCta: language === "en" ? "Not now" : "Не сейчас",
          diagnosisQuestion: language === "en" ? "Where is this quest sticky?" : "Где этот квест липкий?",
          diagnosisOptions: defaultRescueTask ? [
            { id: "too_big", effect: "make_smaller" },
            { id: "unclear", effect: "clarify" },
            { id: "not_my_move", effect: "not_your_move" },
            { id: "kill_without_guilt", effect: "consider_cemetery" },
          ] : [],
          source: "manual_preview",
          contractVersion: "angel_entry_preview_v1",
        }
    : null;
  const baseAngelEntrySession = angelEntrySession || forcedAngelEntrySession;
  const currentAngelEntrySession = baseAngelEntrySession && shouldEscalateAngelEntryToDiagnosis(baseAngelEntrySession)
    ? buildResistanceDiagnosisAngelEntry(baseAngelEntrySession, language)
    : baseAngelEntrySession;
  const rawVisibleAngelEntrySession = currentAngelEntrySession
    && String(currentAngelEntrySession.id || "") !== String(dismissedAngelEntryId || "")
    && (manualAngelEntryRequested || !isAngelEntryCoolingDown(currentAngelEntrySession))
    ? currentAngelEntrySession
    : null;
  const rawAngelEntryTaskId = rawVisibleAngelEntrySession?.taskId ? String(rawVisibleAngelEntrySession.taskId) : "";
  const missionTaskId = rescueTask?.id ? String(rescueTask.id) : "";
  const todayMissionResistanceSession = rescueTask && missionTaskId
    ? {
        id: `today_mission_${missionTaskId}`,
        taskId: missionTaskId,
        taskTitle: getTaskDisplayTitle(rescueTask),
        trigger: "today_mission_repeated_not_now",
        mode: "rescue_me",
        source: "today_mission_bubble",
      }
    : null;
  const todayMissionRelationMemory = todayMissionResistanceSession
    ? getQuestRelationMemory(todayMissionResistanceSession)
    : null;
  const todayMissionRelationSignal = String(todayMissionRelationMemory?.lastSignal || "").trim().toLowerCase();
  const todayMissionRelationStrategy = String(todayMissionRelationMemory?.lastStrategy || "").trim().toLowerCase();
  const todayMissionShouldShrink = todayMissionRelationStrategy === "make_it_smaller" ||
    todayMissionRelationSignal === "too_big";
  const todayMissionShouldClarify = todayMissionRelationStrategy === "clarify_task" ||
    todayMissionRelationSignal === "unclear";
  const todayMissionMayBeWaiting = todayMissionRelationStrategy === "hold_external_dependency" ||
    todayMissionRelationSignal === "not_my_move" ||
    todayMissionRelationSignal === "still_waiting";
  const todayMissionDiagnosisSession = todayMissionResistanceSession &&
    (stickyMissionPreviewRequested || shouldEscalateAngelEntryToDiagnosis(todayMissionResistanceSession))
    ? buildResistanceDiagnosisAngelEntry(todayMissionResistanceSession, language)
    : null;
  const visibleTodayMissionDiagnosisSession = todayMissionDiagnosisSession
    && String(todayMissionDiagnosisSession.id || "") !== String(dismissedAngelEntryId || "")
    && !isAngelEntryCoolingDown(todayMissionDiagnosisSession)
    ? todayMissionDiagnosisSession
    : null;
  const isRawNotYourMoveCheckinEntry = rawVisibleAngelEntrySession?.mode === "not_your_move_checkin" ||
    rawVisibleAngelEntrySession?.trigger === "not_your_move_checkin_due";
  const isManualAngelEntrySession = manualAngelEntryRequested ||
    String(rawVisibleAngelEntrySession?.source || "").includes("manual");
  const suppressAngelEntryForMissionMismatch = rawVisibleAngelEntrySession
    && !angelEntryPanelRequested
    && !isManualAngelEntrySession
    && !isRawNotYourMoveCheckinEntry
    && missionTaskId
    && rawAngelEntryTaskId
    && rawAngelEntryTaskId !== missionTaskId;
  const visibleAngelEntrySession = clarificationPrompt
    ? null
    : suppressAngelEntryForMissionMismatch
      ? visibleTodayMissionDiagnosisSession
      : rawVisibleAngelEntrySession || visibleTodayMissionDiagnosisSession;
  const isNotYourMoveCheckinEntry = visibleAngelEntrySession?.mode === "not_your_move_checkin" ||
    visibleAngelEntrySession?.trigger === "not_your_move_checkin_due";
  const visibleAngelEntryDiagnosisOptions = visibleAngelEntrySession?.directorAction === "confirm_cemetery"
    ? []
    : Array.isArray(visibleAngelEntrySession?.diagnosisOptions) &&
    visibleAngelEntrySession.diagnosisOptions.length > 0
    ? visibleAngelEntrySession.diagnosisOptions
    : isNotYourMoveCheckinEntry
      ? [
          { id: "still_waiting", effect: "keep_waiting" },
          { id: "back_in_my_hands", effect: "clear_not_your_move" },
        ]
      : [];
  const angelEntryTask = visibleAngelEntrySession?.taskId
    ? tasks.find((task) => String(task.id) === String(visibleAngelEntrySession.taskId))
    : null;
  const stickyKillConfirmTask = stickyKillConfirmPrompt?.taskId
    ? tasks.find((task) => String(task.id) === String(stickyKillConfirmPrompt.taskId))
    : null;
  const stickyKillConfirmTaskByTitle = !stickyKillConfirmTask && stickyKillConfirmPrompt?.taskTitle
    ? tasks.find((task) => getTaskDisplayTitle(task) === stickyKillConfirmPrompt.taskTitle)
    : null;
  const stickyKillConfirmTaskId =
    stickyKillConfirmPrompt?.taskId ||
    stickyKillConfirmTask?.id ||
    stickyKillConfirmTaskByTitle?.id ||
    "";
  const stickyKillConfirmTaskTitle =
    stickyKillConfirmPrompt?.taskTitle ||
    stickyKillConfirmTask?.text ||
    stickyKillConfirmTask?.title ||
    (stickyKillConfirmTaskByTitle ? getTaskDisplayTitle(stickyKillConfirmTaskByTitle) : "") ||
    (language === "en" ? "this quest" : "этот квест");
  const readMissionBubbleCooldowns = () => {
    if (typeof window === "undefined") return {};
    try {
      const parsed = JSON.parse(window.localStorage.getItem(MISSION_BUBBLE_COOLDOWN_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  };
  const rememberMissionBubbleCooldown = (taskId, ttlMs = 6 * 60 * 60 * 1000) => {
    if (!taskId || typeof window === "undefined") return;
    const key = String(taskId);
    const next = {
      ...readMissionBubbleCooldowns(),
      [key]: Date.now() + ttlMs,
    };
    try {
      window.localStorage.setItem(MISSION_BUBBLE_COOLDOWN_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      // Non-critical UX guard. If localStorage is blocked, session state still hides the bubble.
    }
  };
  const isMissionBubbleCoolingDown = (taskId) => {
    if (!taskId) return false;
    const expiresAt = Number(readMissionBubbleCooldowns()[String(taskId)] || 0);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  };
  const todayMissionCompanionPrompt = rescueTask
    && missionTaskId
    && !visibleTodayMissionDiagnosisSession
    && missionTaskId !== String(dismissedMissionBubbleTaskId || "")
    && !isMissionBubbleCoolingDown(missionTaskId)
    ? {
        promptKey: `today_mission_${missionTaskId}`,
        kind: "today_mission_hint",
        speaker: "angel",
        taskId: missionTaskId,
        relationSignal: todayMissionRelationSignal,
        relationStrategy: todayMissionRelationStrategy,
        title: todayMissionShouldShrink
          ? (language === "en" ? "Too big, so smaller" : "Большой квест: уменьшаем")
          : todayMissionShouldClarify
            ? (language === "en" ? "Foggy quest" : "Мутный квест")
            : todayMissionMayBeWaiting
              ? (language === "en" ? "Maybe not your move" : "Возможно, не твой ход")
              : (language === "en" ? "Today mission" : "Цель дня"),
        message: todayMissionShouldShrink
          ? (language === "en"
            ? `I remember “${getTaskDisplayTitle(rescueTask)}” felt too big. I will not push the whole quest.`
            : `Я помню, что «${getTaskDisplayTitle(rescueTask)}» был слишком большим. Я не буду давить всем квестом.`)
          : todayMissionShouldClarify
            ? (language === "en"
              ? `I remember “${getTaskDisplayTitle(rescueTask)}” was unclear. Let's find the foggy part before action.`
              : `Я помню, что «${getTaskDisplayTitle(rescueTask)}» был мутным. Сначала найдём неясное место.`)
            : todayMissionMayBeWaiting
              ? (language === "en"
                ? `I remember “${getTaskDisplayTitle(rescueTask)}” may depend on someone else. I will check before pushing.`
                : `Я помню, что «${getTaskDisplayTitle(rescueTask)}» может зависеть от кого-то ещё. Сначала проверим.`)
              : missionExplanation
                ? (language === "en"
                  ? `I picked this because: ${missionExplanation}`
                  : `Я выбрал это потому что: ${missionExplanation}`)
                : (language === "en"
                  ? `I am holding one quest: “${getTaskDisplayTitle(rescueTask)}”. No full-list pressure.`
                  : `Я держу один квест: «${getTaskDisplayTitle(rescueTask)}». Без давления всего списка.`),
        primaryLabel: todayMissionShouldShrink
          ? (language === "en" ? "Shrink first" : "Сначала уменьшить")
          : todayMissionShouldClarify
            ? (language === "en" ? "Clarify first" : "Сначала прояснить")
            : todayMissionMayBeWaiting
              ? (language === "en" ? "Check status" : "Проверить статус")
              : (language === "en" ? "Start rescue" : "Начать rescue"),
      }
    : null;
  const plannerReportVoiceIsDevil = Boolean(plannerReport?.events?.some((event) => event?.actor === "devil" || event?.persona === "devil"));
  const plannerReportCompanionPrompt = plannerReport?.events?.length && !plannerReportModalOpen
    ? {
        promptKey: `planner_report_${plannerReport.events.length}_${plannerReport.events[0]?.id || plannerReport.events[0]?.key || ""}`,
        kind: "planner_report_summary",
        speaker: plannerReportVoiceIsDevil ? "devil" : "angel",
        title: language === "en" ? "While you were away" : "Пока тебя не было",
        message: language === "en"
          ? `I noticed ${plannerReport.events.length} update${plannerReport.events.length === 1 ? "" : "s"}.`
          : `Я заметил ${plannerReport.events.length} обновлени${plannerReport.events.length === 1 ? "е" : "я"}.`,
        primaryLabel: language === "en" ? "Show" : "Показать",
        secondaryLabel: language === "en" ? "Got it" : "Понятно",
        tertiaryLabel: language === "en" ? "Progress" : "Прогресс",
      }
    : null;
  const angelOpeningMovePrompt = rescueTask
    && missionTaskId
    && !isDemoRoute
    && !visibleTodayMissionDiagnosisSession
    && missionTaskId !== String(dismissedMissionBubbleTaskId || "")
    && !isMissionBubbleCoolingDown(`opening_${missionTaskId}`)
    ? {
        promptKey: `angel_opening_move_${missionTaskId}`,
        kind: "angel_opening_move",
        speaker: "angel",
        taskId: missionTaskId,
        taskTitle: getTaskDisplayTitle(rescueTask),
        title: language === "en" ? "One safe entry" : "Один безопасный вход",
        message: language === "en"
          ? `I can hold one thread today: “${getTaskDisplayTitle(rescueTask)}”. No full-list pressure.`
          : `Я могу подержать одну ниточку на сегодня: «${getTaskDisplayTitle(rescueTask)}». Без давления всего списка.`,
        primaryLabel: language === "en" ? "Start tiny step" : "Начать микрошаг",
        secondaryLabel: language === "en" ? "Not now" : "Не сейчас",
        tertiaryLabel: language === "en" ? "Planner" : "Планер",
      }
    : null;
  const companionSurfaceBlocked = Boolean(plannerReport && plannerReportModalOpen);
  const clarificationTask = clarificationPrompt?.taskId
    ? tasks.find((task) => String(task.id) === String(clarificationPrompt.taskId))
    : null;
  const clarificationMode = String(clarificationPrompt?.mode || "").trim();
  const clarificationIsDiagnosis = clarificationMode === "diagnose_resistance";
  const clarificationIsTooBig = clarificationMode === "too_big"
    || String(clarificationPrompt?.confusion || "").trim() === "too_big";
  const clarificationNeedsReason = Boolean(
    clarificationPrompt &&
    !clarificationIsDiagnosis &&
    !clarificationIsTooBig &&
    !clarificationPrompt.loading &&
    !clarificationPrompt.suggestedStep &&
    !String(clarificationPrompt.confusion || "").trim()
  );
  const clarificationReasonLabel = String(
    clarificationPrompt?.confusionLabel ||
    clarificationPrompt?.selectedReasonLabel ||
    ""
  ).trim();
  const clarificationCompanionPrompt = clarificationPrompt
    ? {
        promptKey: [
          clarificationIsDiagnosis ? "diagnose_resistance" : clarificationIsTooBig ? "shrink_quest" : "clarify_quest",
          clarificationPrompt.taskId || "task",
          clarificationPrompt.loading ? "loading" : "ready",
          clarificationPrompt.suggestedStep ? "suggested" : "ask",
          clarificationPrompt.confusion || "none",
        ].join("_"),
        kind: clarificationIsDiagnosis ? "diagnose_resistance" : clarificationIsTooBig ? "shrink_quest" : "clarify_quest",
        speaker: "angel",
        title: clarificationIsDiagnosis
          ? (language === "en" ? "Sticky quest" : "Липкий квест")
          : clarificationIsTooBig
          ? (language === "en" ? "Too big" : "Слишком большой квест")
          : (language === "en" ? "Unclear quest" : "Мутный квест"),
        message: clarificationPrompt.suggestedStep
          ? (clarificationIsTooBig
            ? (language === "en"
              ? `You marked “${clarificationPrompt.taskTitle}” as too big. I shrank it to one safe move: ${clarificationPrompt.suggestedStep}`
              : `Ты отметила «${clarificationPrompt.taskTitle}» как слишком большой квест. Я сжал его до одного безопасного хода: ${clarificationPrompt.suggestedStep}`)
            : (language === "en"
              ? `You marked the foggy part${clarificationReasonLabel ? ` as “${clarificationReasonLabel}”` : ""}. Angel suggests one microstep for “${clarificationPrompt.taskTitle}”: ${clarificationPrompt.suggestedStep}`
              : `Ты отметила мутное место${clarificationReasonLabel ? `: «${clarificationReasonLabel}»` : ""}. Ангел предлагает один микрошаг для «${clarificationPrompt.taskTitle}»: ${clarificationPrompt.suggestedStep}`))
          : (clarificationIsDiagnosis
            ? (language === "en"
              ? `“${clarificationPrompt.taskTitle}” paused instead of opening. I will not push it again. Want to find where it is sticky?`
              : `«${clarificationPrompt.taskTitle}» не открылся и ушёл на паузу. Я не буду давить тем же способом. Найдём, где он липкий?`)
            : clarificationIsTooBig
            ? (language === "en"
              ? (clarificationPrompt.loading
                ? `You marked “${clarificationPrompt.taskTitle}” as too big. I am turning it into one confirmable 2-minute step.`
                : `Okay, “${clarificationPrompt.taskTitle}” is too big as a direct quest. I will not push the whole thing.`)
              : (clarificationPrompt.loading
                ? `Ты отметила «${clarificationPrompt.taskTitle}» как слишком большой квест. Я превращаю его в один подтверждаемый шаг на 2 минуты.`
                : `Окей, «${clarificationPrompt.taskTitle}» слишком большой для прямого входа. Я не буду давить всей задачей.`))
            : (language === "en"
              ? (clarificationPrompt.loading
                ? `You marked the foggy part${clarificationReasonLabel ? ` as “${clarificationReasonLabel}”` : ""}. I am turning it into one clear micro-step.`
                : `Okay, “${clarificationPrompt.taskTitle}” is unclear. What part is foggy?`)
              : (clarificationPrompt.loading
                ? `Ты отметила мутное место${clarificationReasonLabel ? `: «${clarificationReasonLabel}»` : ""}. Я превращаю его в один понятный микрошаг.`
                : `Окей, «${clarificationPrompt.taskTitle}» мутный. Что именно неясно?`))),
        primaryLabel: clarificationIsDiagnosis
          ? (language === "en" ? "Pick one below" : "Выбери ниже")
          : clarificationPrompt.suggestedStep
          ? (clarificationIsTooBig
            ? (language === "en" ? "Start 2-min step" : "Начать шаг на 2 минуты")
            : (language === "en" ? "Start clarified step" : "Начать прояснённый шаг"))
          : clarificationPrompt.loading
            ? (language === "en" ? "Thinking..." : "Думаю...")
            : clarificationNeedsReason
              ? (language === "en" ? "Pick what is unclear" : "Выбери, что мутно")
            : (clarificationIsTooBig
              ? (language === "en" ? "Shrink it" : "Уменьшить")
              : (language === "en" ? "Suggest one step" : "Предложить шаг")),
        secondaryLabel: language === "en" ? "Not now" : "Не сейчас",
        tertiaryLabel: language === "en" ? "Planner" : "Планер",
        primaryDisabled: Boolean(
          clarificationIsDiagnosis ||
          clarificationNeedsReason ||
          (clarificationPrompt.loading && !clarificationPrompt.suggestedStep)
        ),
        diagnosisQuestion: clarificationIsDiagnosis
          ? (language === "en" ? "Where is this quest sticky?" : "Где этот квест липкий?")
          : clarificationPrompt.suggestedStep
          ? (clarificationIsTooBig
            ? (language === "en" ? "Need it smaller?" : "Сделать ещё меньше?")
            : (language === "en" ? "Does this feel small enough?" : "Это достаточно маленький вход?"))
          : (clarificationIsTooBig
            ? (language === "en" ? "Want one tiny entry?" : "Найти один маленький вход?")
            : (language === "en" ? "What is unclear?" : "Что именно мутно?")),
        diagnosisOptions: clarificationIsDiagnosis
          ? [
              { id: "too_big", label: language === "en" ? "too big" : "слишком большое", effect: "too_big" },
              { id: "unclear", label: language === "en" ? "unclear" : "непонятно", effect: "unclear" },
              { id: "not_my_move", label: language === "en" ? "not my move" : "не мой ход", effect: "not_my_move" },
              { id: "kill_without_guilt", label: language === "en" ? "let it die" : "пусть умрёт", effect: "kill_without_guilt" },
            ]
          : clarificationPrompt.suggestedStep
          ? [
              {
                id: "clarify_retry",
                label: clarificationIsTooBig
                  ? (language === "en" ? "Make smaller" : "Ещё меньше")
                  : (language === "en" ? "Try another" : "Другой вариант"),
                effect: "suggest_step",
              },
            ]
          : clarificationIsTooBig
            ? [
                { id: "suggest_step", label: language === "en" ? "Angel shrinks it" : "ангел уменьшит", effect: "suggest_step" },
              ]
            : [
              { id: "where_start", label: language === "en" ? "where to start" : "с чего начать", effect: "confusion_start" },
              { id: "first_step", label: language === "en" ? "first step" : "первый шаг", effect: "confusion_first_step" },
              { id: "too_many_options", label: language === "en" ? "too many options" : "слишком много вариантов", effect: "confusion_options" },
              { id: "done_unclear", label: language === "en" ? "done is unclear" : "неясно, когда готово", effect: "confusion_done" },
              { id: "suggest_step", label: language === "en" ? "Angel suggests step" : "ангел предложит шаг", effect: "suggest_step" },
            ],
      }
    : null;
  const stickyKillCompanionPrompt = stickyKillConfirmPrompt
    ? {
        promptKey: `sticky_kill_confirm_${stickyKillConfirmTaskId || "task"}_${stickyKillConfirmPrompt.createdAt || ""}`,
        kind: "sticky_kill_confirm",
        speaker: "angel",
        taskId: stickyKillConfirmTaskId,
        taskTitle: stickyKillConfirmTaskTitle,
        icon: "🪦",
        title: language === "en" ? "Let it die?" : "Похоронить квест?",
        message: language === "en"
          ? `This only moves “${stickyKillConfirmTaskTitle}” to Cemetery. It does not delete it forever.`
          : `Это только перенесёт «${stickyKillConfirmTaskTitle}» на кладбище. Это не удаление навсегда.`,
        hidePrimary: false,
        diagnosisQuestion: "",
        diagnosisOptions: [],
        primaryLabel: language === "en" ? "Move to Cemetery" : "На кладбище",
        secondaryLabel: language === "en" ? "Keep it alive" : "Оставить живым",
        tertiaryLabel: language === "en" ? "Planner" : "Планер",
      }
    : null;
  const effectiveCompanionPromptQuietUntil = Math.max(
    Number(companionPromptQuietUntil || 0),
    readCompanionPromptQuietUntil()
  );
  const companionPromptQuietActive = effectiveCompanionPromptQuietUntil > Date.now();
  const companionPrompt = companionSurfaceBlocked
    ? null
    : stickyKillCompanionPrompt
    ? stickyKillCompanionPrompt
    : clarificationCompanionPrompt
    ? clarificationCompanionPrompt
    : angelEntryPanelRequested
    ? null
    : companionPromptQuietActive
    ? null
    : plannerReportCompanionPrompt
    ? plannerReportCompanionPrompt
    : visibleAngelEntrySession
    ? {
        promptKey: `angel_entry_${visibleAngelEntrySession.id || visibleAngelEntrySession.taskId || "session"}_${visibleAngelEntrySession.mode || "entry"}`,
        kind: "angel_entry",
        speaker: "angel",
        taskId: visibleAngelEntrySession.taskId || angelEntryTask?.id || "",
        taskTitle: angelEntryTask ? getTaskDisplayTitle(angelEntryTask) : "",
        directorAction: visibleAngelEntrySession.directorAction || "",
        title: visibleAngelEntrySession.mode === "diagnose_resistance"
          ? (language === "en" ? "Sticky quest" : "Липкий квест")
          : isNotYourMoveCheckinEntry
            ? (language === "en" ? "Gentle check-in" : "Мягкая проверка")
            : (language === "en" ? "Tiny entry point" : "Маленький вход"),
        message: visibleAngelEntrySession.message || (language === "en"
          ? "I found one safe way back in."
          : "Я нашёл один безопасный вход обратно."),
        primaryLabel: visibleAngelEntrySession.directorAction === "confirm_cemetery"
          ? (language === "en" ? "Move to Cemetery" : "На кладбище")
          : visibleAngelEntrySession.primaryCta || (language === "en" ? "Start safely" : "Начать"),
        diagnosisQuestion: visibleAngelEntrySession.diagnosisQuestion ||
          (isNotYourMoveCheckinEntry
            ? (language === "en" ? "Is this still waiting?" : "Это всё ещё ждёт?")
            : ""),
        diagnosisOptions: visibleAngelEntryDiagnosisOptions.map((option) => localizeStickyDiagnosisOption(option, language)),
      }
    : (todayMissionShouldShrink || todayMissionShouldClarify || todayMissionMayBeWaiting)
      ? todayMissionCompanionPrompt
      : angelOpeningMovePrompt || todayMissionCompanionPrompt;
  const visibleCompanionPrompt = activeTab === "stats" ? null : companionPrompt;
  const companionPromptActiveRef = useRef(false);
  companionPromptActiveRef.current = Boolean(visibleCompanionPrompt);
  const plannerReportDigest = plannerReport?.events?.length
    ? buildPlannerReportDigest(plannerReport.events, language, plannerEngineDecisions)
    : null;

  const scrollTaskIntoView = (taskId) => {
    const element = document.querySelector(`[data-task-id="${taskId}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const scrollPlannerContentIntoView = () => {
    plannerContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const schedulePlannerContentScroll = () => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        scrollPlannerContentIntoView();
      }, 80);
    });
  };

  const focusTaskInList = (taskId) => {
    if (!taskId) return;
    setActiveTab("active");
    setActiveFilter("all");
    setRequestedTuneTaskId(null);
    setHighlightTaskId(taskId);
    if (highlightClearTimerRef.current) {
      clearTimeout(highlightClearTimerRef.current);
    }
    highlightClearTimerRef.current = window.setTimeout(() => {
      setHighlightTaskId((current) => (String(current) === String(taskId) ? null : current));
    }, 1800);
  };

  const openPlannerProgress = () => {
    setActiveTab("stats");
    setRequestedTuneTaskId(null);
    setHighlightTaskId(null);
    schedulePlannerContentScroll();
  };

  const applyPlannerFilter = (nextFilter) => {
    setActiveTab("active");
    setActiveFilter(nextFilter);
    setRequestedTuneTaskId(null);
    setHighlightTaskId(null);
    schedulePlannerContentScroll();
  };

  const sendBrowserNudge = (task, { isTest = false } = {}) => {
    if (notificationPermission === "unsupported") {
      setNudgeStatus(language === "en" ? "This browser does not support system notifications." : "Браузер не поддерживает системные уведомления.");
      return;
    }

    if (notificationPermission !== "granted") {
      setNudgeStatus(language === "en" ? "Allow notifications first, then I can nudge you." : "Сначала разрешите уведомления, потом я смогу пинать.");
      return;
    }

    const message = isTest
      ? (language === "en"
        ? `Test nudge. ${task ? `"${task.text}" is still waiting.` : "Planner knows how to bother you."}`
        : `Тестовый пинок. ${task ? `"${task.text}" всё ещё ждёт.` : "Planner умеет до вас докапываться."}`)
      : buildNudgeMessage(task, language);

    const notification = new Notification("ADHD Planner", {
      body: message,
      tag: task ? `adhd-planner-${task.id}` : "adhd-planner-generic",
      requireInteraction: Boolean(task && getTaskHeat(task) <= 15),
    });

    notification.onclick = () => {
      window.focus();
      if (task) focusTaskInList(task.id);
      notification.close();
    };

    setPulseState((previous) => ({
      ...previous,
      lastNudgeAt: Date.now(),
    }));
    setNudgeStatus(isTest ? "Тестовый пинок отправлен." : "Пинок отправлен.");
  };

  useEffect(() => {
    if (activeTab !== "active" || !highlightTaskId) return;

    const frame = window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        scrollTaskIntoView(highlightTaskId);
      }, 90);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, activeFilter, highlightTaskId]);

  useEffect(() => {
    if (!highlightTaskId) return;
    const stillActive = activeTasks.some((task) => task.id === highlightTaskId);
    if (!stillActive) {
      setHighlightTaskId(null);
    }
  }, [activeTasks, highlightTaskId]);

  useEffect(() => () => {
    if (highlightClearTimerRef.current) {
      clearTimeout(highlightClearTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!rescueTask) return;
    if (!pulseState.notificationsEnabled) return;
    if (notificationPermission !== "granted") return;

    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") return;
      if (Date.now() - (pulseState.lastNudgeAt || 0) < (rescueDeadline?.reminderIntervalMs || NUDGE_INTERVAL_MS)) return;
      sendBrowserNudge(rescueTask);
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [notificationPermission, pulseState.lastNudgeAt, pulseState.notificationsEnabled, rescueDeadline?.reminderIntervalMs, rescueTask]);

  // Exhumation nudge — Angel checks on dead tasks older than 30 days, once per day
  useEffect(() => {
    if (notificationPermission !== "granted") return;
    if (!pulseState.notificationsEnabled) return;
    if (!dataLoaded) return;

    const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
    const EXHUMATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const storageKey = `adhd_exhumation_nudge_${user?.id}`;

    const check = () => {
      if (document.visibilityState !== "hidden") return;
      const lastSent = Number(localStorage.getItem(storageKey) || 0);
      if (Date.now() - lastSent < EXHUMATION_INTERVAL_MS) return;

      const candidate = deadTasks.find(t => {
        const deadAt = t.deadAt || (/^\d{10,}$/.test(t.id) ? Number(t.id) : null);
        return deadAt && (Date.now() - deadAt) > MONTH_MS;
      });
      if (!candidate) return;

      const phrases = [
        `«${candidate.text}» лежит на кладбище уже больше месяца. Может, попробуем ещё раз?`,
        `Помнишь «${candidate.text}»? Прошёл месяц. Иногда второй шанс — самый важный.`,
        `«${candidate.text}» всё ещё здесь. Может, теперь это проще, чем казалось?`,
      ];
      const body = phrases[Math.floor(Math.random() * phrases.length)];

      new Notification("👼 Ангел стучится", { body, tag: `exhumation-${candidate.id}` });
      localStorage.setItem(storageKey, String(Date.now()));
    };

    const interval = setInterval(check, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [notificationPermission, pulseState.notificationsEnabled, dataLoaded, deadTasks, user?.id]);

  useEffect(() => {
    if (!panicEndsAt) return;
    if (panicSecondsLeft > 0) return;

    clearPanicCountdownTimer();
    setPanicEndsAt(null);
    setNudgeStatus("2 минуты прошли. Даже микро-сдвиг уже считается.");
  }, [panicEndsAt, panicSecondsLeft]);

  // ── Cloud persistence helpers ──────────────────────────────────────────────
  const isCloudUser = user?.id && !user.id.startsWith("guest_") && !isDemoRoute;

  const persistTask = (task) => {
    if (!isCloudUser || !task) return;
    console.warn("[Planner] Direct cloud task persistence blocked. Use /api/planner-client-actions instead.", {
      taskId: task.id,
      taskText: task.text,
    });
  };

  useEffect(() => {
    if (!isCloudUser || !dataLoaded || !firestoreReadyRef.current) return;
    if (pendingTaskWritesRef.current.size === 0) return;

    const queuedTasks = [...pendingTaskWritesRef.current.values()];
    pendingTaskWritesRef.current.clear();
    queuedTasks.forEach((task) => persistTask(task));
  }, [isCloudUser, dataLoaded, user?.id]);

  const persistScore = (newScore) => {
    if (!isCloudUser) return;
    console.warn("[Planner] Direct cloud score persistence blocked. Score must be changed by PlannerCommandService.", {
      score: newScore,
    });
  };

  const {
    blockCloudLocalFallback,
    mutateGuestSingleTask,
    runGuestOnlyBulkOperation,
  } = createGuestPlannerGateways({
    isCloudUser,
    language,
    setNudgeStatus,
    mutateSingleTask,
  });

  const setPlannerReportIfNotDismissed = useCallback((nextReport) => {
    if (typeof nextReport === "function") {
      setPlannerReport((previous) => {
        const resolved = nextReport(previous);
        const ids = Array.isArray(resolved?.reportItemIds) ? resolved.reportItemIds : [];
        if (ids.length > 0 && ids.every((id) => dismissedReportItemIdsRef.current.has(String(id)))) {
          return previous || null;
        }
        if (resolved?.source === "report_items") {
          if (hasPlannerReportAutoOpenedInSession(user?.id, resolved)) {
            return previous || null;
          }
          if (
            !plannerReportEntryWindowOpenRef.current ||
            plannerReportClosedThisSessionRef.current ||
            plannerReportAutoOpenedThisSessionRef.current
          ) {
            return previous || null;
          }
          if (companionPromptActiveRef.current) {
            plannerReportEntryWindowOpenRef.current = false;
            plannerReportAutoOpenedThisSessionRef.current = true;
            return previous || null;
          }
          plannerReportEntryWindowOpenRef.current = false;
          plannerReportAutoOpenedThisSessionRef.current = true;
          markPlannerReportAutoOpenedInSession(user?.id, resolved);
        }
        return resolved;
      });
      return;
    }

    const ids = Array.isArray(nextReport?.reportItemIds) ? nextReport.reportItemIds : [];
    if (ids.length > 0 && ids.every((id) => dismissedReportItemIdsRef.current.has(String(id)))) return;
    if (nextReport?.source === "report_items") {
      if (hasPlannerReportAutoOpenedInSession(user?.id, nextReport)) return;
      if (
        !plannerReportEntryWindowOpenRef.current ||
        plannerReportClosedThisSessionRef.current ||
        plannerReportAutoOpenedThisSessionRef.current
      ) return;
      if (companionPromptActiveRef.current) {
        plannerReportEntryWindowOpenRef.current = false;
        plannerReportAutoOpenedThisSessionRef.current = true;
        return;
      }
      plannerReportEntryWindowOpenRef.current = false;
      plannerReportAutoOpenedThisSessionRef.current = true;
      markPlannerReportAutoOpenedInSession(user?.id, nextReport);
    }
    setPlannerReport(nextReport);
  }, [user?.id]);

  const dismissPlannerReport = () => {
    plannerReportEntryWindowOpenRef.current = false;
    plannerReportClosedThisSessionRef.current = true;
    setPlannerReportModalOpen(false);
    const reportItemIds = [...new Set([
      ...(Array.isArray(plannerReport?.reportItemIds) ? plannerReport.reportItemIds : []),
      ...plannerReportItems
        .filter((event) => event?.reportItemId && !event.seenAt)
        .map((event) => event.reportItemId),
    ].map((id) => String(id || "").trim()).filter(Boolean))];

    if (reportItemIds.length && user?.id && !String(user.id).startsWith("guest_")) {
      reportItemIds.forEach((id) => dismissedReportItemIdsRef.current.add(String(id)));
      const reportItemIdSet = new Set(reportItemIds);
      setPlannerReportItems((previous) => previous.filter((event) => !reportItemIdSet.has(String(event.reportItemId || ""))));
      ackPlannerReportItems({
        authUser: auth.currentUser,
        reportItemIds,
        ackAllUnread: true,
      })
        .then((payload) => {
          applyPlannerClientState(payload);
        })
        .catch((error) => {
          if (error?.payload && typeof error.payload === "object") {
            applyPlannerClientState(error.payload);
          }
          console.warn("[Planner] Не удалось отметить report items как просмотренные:", error);
        });
    }

    if (user?.id && plannerReport?.events?.length) {
      try {
        const storageKey = `adhd_devil_report_seen_${user.id}`;
        const seenIds = new Set(String(localStorage.getItem(storageKey) || "").split("|").filter(Boolean));
        plannerReport.events.forEach((event) => seenIds.add(String(event.id)));
        localStorage.setItem(storageKey, [...seenIds].slice(-50).join("|"));
      } catch (error) {
        console.warn("[Planner] Не удалось сохранить devil report state:", error);
      }
    }
    setPlannerReport(null);
  };

  const openDevilReportCemetery = () => {
    dismissPlannerReport();
    setActiveTab("cemetery");
    schedulePlannerContentScroll();
  };

  const recordPlannerEvent = useCallback((event = {}) => {
    if (isCloudUser) return;

    const now = typeof event.createdAt === "number" ? event.createdAt : Date.now();
    const normalized = {
      id: String(event.id || `${event.type || "planner_event"}_${event.taskId || "event"}_${now}`),
      type: String(event.type || "planner_event"),
      actor: String(event.actor || "system"),
      source: String(event.source || "web"),
      taskId: event.taskId ? String(event.taskId) : null,
      taskText: String(event.taskText || ""),
      message: String(event.message || event.taskText || "Событие планера"),
      createdAt: now,
    };

    setPlannerEvents((previous) => {
      const mergedEvents = mergePlannerEvents(readCachedPlannerEvents(user?.id), previous, [normalized]);
      writeCachedPlannerEvents(user?.id, mergedEvents);
      return mergedEvents;
    });

  }, [isCloudUser, user?.id]);

  const mergePlannerEventItemsIntoState = useCallback((rawItems = [], stateUserId = user?.id) => {
    const eventLogItems = normalizeBootstrapPlannerEvents(rawItems);
    if (eventLogItems.length === 0) return;

    setPlannerEvents((previous) => {
      const cachedEvents = stateUserId ? readCachedPlannerEvents(stateUserId) : [];
      const mergedEvents = mergePlannerEvents(cachedEvents, previous, eventLogItems);
      if (stateUserId) writeCachedPlannerEvents(stateUserId, mergedEvents);
      return mergedEvents;
    });
  }, [user?.id]);

  const refreshPlannerReportFeed = useCallback(async () => {
    if (!user?.id || String(user.id).startsWith("guest_")) return;
    if (!auth.currentUser) return;

    const payload = await runPlannerBootstrap({
      authUser: auth.currentUser,
      reportLimit: 10,
      language,
    });

    const update = buildPlannerClientUpdate(payload, {
      currentTasks: tasksRef.current,
      currentScore: score,
      mergeTaskLists: mergeAuthoritativeTaskLists,
    });

    applyPlannerClientUpdate(update, {
      userId: user.id,
      currentTasks: tasksRef.current,
      commitTasks,
      setScore,
      setPlannerMeta,
      setPlannerClientContractStatus,
      setPlannerReportItems,
      setPlannerReport: setPlannerReportIfNotDismissed,
      mergePlannerEventItemsIntoState,
      saveCloudCache,
    });
  }, [commitTasks, language, mergePlannerEventItemsIntoState, score, user?.id]);

  const runPlannerClientAction = async ({ action, payload = {}, source = "web" }) => {
    try {
      const data = await runPlannerClientCommand({
        authUser: auth.currentUser,
        action,
        source,
        payload,
        includeState: true,
      });
      const appliedState = applyPlannerClientState(data);
      if (data && typeof data === "object") {
        data.__appliedState = appliedState;
      }
      if (!appliedState && typeof window !== "undefined" && user?.id && !String(user.id).startsWith("guest_")) {
        window.setTimeout(() => {
          refreshPlannerReportFeed().catch((error) => {
            console.warn("[Planner] Не удалось обновить Planner Report после команды:", error);
          });
        }, 700);
      }
      return data;
    } catch (error) {
      if (error?.payload && typeof error.payload === "object") {
        const appliedErrorState = applyPlannerClientState(error.payload);
        if (error && typeof error === "object") {
          error.__appliedState = appliedErrorState;
        }
      }
      throw error;
    }
  };

  const runPlannerDebugAction = async (target) => {
    if (!auth.currentUser || engineDebugBusy) return;
    const normalizedTarget = String(target || "");
    const debugActionLabel = normalizedTarget === "outbox"
      ? (language === "en" ? "outbox drain" : "outbox")
      : normalizedTarget === "telegram-nudge"
        ? (language === "en" ? "Telegram nudge" : "Telegram-пинок")
      : normalizedTarget === "delivery-watchdog"
        ? (language === "en" ? "delivery watchdog" : "сторож доставки")
      : normalizedTarget === "self-test"
        ? (language === "en" ? "planner self-test" : "self-test планера")
        : (language === "en" ? "planner engine" : "движок");
    if (normalizedTarget === "self-test") {
      setPlannerSelfTestResult(null);
    }
    setEngineDebugBusy(normalizedTarget);
    setLastDebugActionResult({
      target: normalizedTarget,
      status: "running",
      message: language === "en"
        ? `Running ${debugActionLabel}...`
        : `Запускаю ${debugActionLabel}...`,
      at: Date.now(),
    });
    setNudgeStatus(language === "en"
      ? `Running ${debugActionLabel}...`
      : `Запускаю ${debugActionLabel}...`);
    try {
      const payload = await runPlannerDebug({
        authUser: auth.currentUser,
        target: normalizedTarget,
      });
      applyPlannerClientState(payload);
      const debugRun = payload?.debugRun && typeof payload.debugRun === "object" ? payload.debugRun : null;
      if (normalizedTarget === "self-test") {
        setPlannerSelfTestResult(debugRun);
        const summary = debugRun?.summary && typeof debugRun.summary === "object" ? debugRun.summary : {};
        const failed = Number(summary.failed || 0);
        const passed = Number(summary.passed || 0);
        setNudgeStatus(language === "en"
          ? `Planner self-test ${failed ? "failed" : "passed"}: ${passed} passed, ${failed} failed.`
          : `Self-test планера ${failed ? "упал" : "прошёл"}: ${passed} ок, ${failed} ошибок.`);
      } else {
        setNudgeStatus(language === "en"
          ? `${normalizedTarget === "outbox" ? "Outbox drain" : normalizedTarget === "telegram-nudge" ? "Telegram nudge" : normalizedTarget === "delivery-watchdog" ? "Delivery watchdog" : "Planner engine"} finished.`
          : `${normalizedTarget === "outbox" ? "Outbox" : normalizedTarget === "telegram-nudge" ? "Telegram-пинок" : normalizedTarget === "delivery-watchdog" ? "Сторож доставки" : "Движок"} отработал.`);
      }
      const debugStatus = String(debugRun?.status || payload?.status || "ok");
      const debugStats = debugRun?.stats && typeof debugRun.stats === "object" ? debugRun.stats : {};
      const debugDetail = normalizedTarget === "outbox"
        ? (language === "en"
          ? `claimed ${Number(debugStats.claimed || 0)} · sent ${Number(debugStats.sent || 0)} · retry ${Number(debugStats.retry || 0)} · dead ${Number(debugStats.dead || 0)}`
          : `взято ${Number(debugStats.claimed || 0)} · отправлено ${Number(debugStats.sent || 0)} · retry ${Number(debugStats.retry || 0)} · dead ${Number(debugStats.dead || 0)}`)
        : normalizedTarget === "telegram-nudge"
          ? (language === "en"
            ? `queued ${Number(debugStats.outboxQueued || 0)} · claimed ${Number(debugStats.claimed || 0)} · sent ${Number(debugStats.sent || 0)} · retry ${Number(debugStats.retry || 0)} · dead ${Number(debugStats.dead || 0)}`
            : `создано ${Number(debugStats.outboxQueued || 0)} · взято ${Number(debugStats.claimed || 0)} · отправлено ${Number(debugStats.sent || 0)} · retry ${Number(debugStats.retry || 0)} · dead ${Number(debugStats.dead || 0)}`)
        : normalizedTarget === "engine"
          ? (language === "en"
            ? `heat ${Number(debugStats.heatUpdated || 0)} · cemetery ${Number(debugStats.deadCount || 0)} · outbox ${Number(debugStats.outboxQueued || 0)}`
            : `пульс ${Number(debugStats.heatUpdated || 0)} · кладбище ${Number(debugStats.deadCount || 0)} · outbox ${Number(debugStats.outboxQueued || 0)}`)
          : normalizedTarget === "delivery-watchdog"
            ? (language === "en"
              ? `telegram ${Number(debugStats.telegramOk || 0) ? "ok" : "missing"} · email ${Number(debugStats.emailOk || 0) ? "ok" : "missing"} · failed ${Number(debugStats.failed || 0)}`
              : `telegram ${Number(debugStats.telegramOk || 0) ? "ok" : "нет"} · email ${Number(debugStats.emailOk || 0) ? "ok" : "нет"} · сбоев ${Number(debugStats.failed || 0)}`)
          : "";
      setLastDebugActionResult({
        target: normalizedTarget,
        status: debugStatus,
        tone: debugStatus === "ok" || debugStatus === "passed" ? "ok" : "warning",
        message: language === "en"
          ? `${normalizedTarget === "outbox" ? "Outbox drain" : normalizedTarget === "telegram-nudge" ? "Telegram nudge" : normalizedTarget === "delivery-watchdog" ? "Delivery watchdog" : normalizedTarget === "self-test" ? "Self-test" : "Planner engine"} finished.`
          : `${normalizedTarget === "outbox" ? "Outbox" : normalizedTarget === "telegram-nudge" ? "Telegram-пинок" : normalizedTarget === "delivery-watchdog" ? "Сторож доставки" : normalizedTarget === "self-test" ? "Self-test" : "Движок"} отработал.`,
        detail: debugRun?.error ? String(debugRun.error) : debugDetail,
        at: Date.now(),
      });
    } catch (error) {
      if (error?.payload && typeof error.payload === "object") {
        applyPlannerClientState(error.payload);
      }
      console.warn("[Planner] Debug action failed:", error);
      setLastDebugActionResult({
        target: normalizedTarget,
        status: "failed",
        tone: "warning",
        message: language === "en"
          ? `Debug action failed: ${error.message || "unknown error"}`
          : `Debug-действие упало: ${error.message || "неизвестная ошибка"}`,
        detail: error?.payload?.error || "",
        at: Date.now(),
      });
      setNudgeStatus(language === "en"
        ? `Debug action failed: ${error.message || "unknown error"}`
        : `Debug-действие упало: ${error.message || "неизвестная ошибка"}`);
    } finally {
      setEngineDebugBusy("");
    }
  };

  const applyPlannerClientState = useCallback((data = {}) => {
    const update = buildPlannerClientUpdate(data, {
      currentTasks: tasksRef.current,
      currentScore: score,
      mergeTaskLists: mergeAuthoritativeTaskLists,
    });

    return applyPlannerClientUpdate(update, {
      userId: user?.id || update.stateUserId || null,
      currentTasks: tasksRef.current,
      commitTasks,
      setScore,
      setPlannerMeta,
      setPlannerClientContractStatus,
      setPlannerReportItems,
      setPlannerReport: setPlannerReportIfNotDismissed,
      mergePlannerEventItemsIntoState,
      saveCloudCache,
    });
  }, [commitTasks, mergePlannerEventItemsIntoState, score, user?.id]);

  const applyOptimisticCloudTaskMutation = useCallback((taskId, mutator) => {
    if (!isCloudUser || typeof mutator !== "function") return null;

    const previousTasks = tasksRef.current;
    let optimisticTask = null;
    let previousTask = null;

    const nextTasks = previousTasks.map((task) => {
      if (String(task.id) !== String(taskId)) return task;
      previousTask = task;
      const candidate = mutator(task, previousTasks);
      if (!candidate || candidate === task) return task;
      optimisticTask = candidate;
      return candidate;
    });

    if (!optimisticTask) return null;

    if (previousTask && previousTask.status !== optimisticTask.status) {
      pendingCloudStatusIntents.set(String(taskId), {
        status: optimisticTask.status,
        at: Number(optimisticTask.__pendingSyncAt || Date.now()),
      });
    }

    commitTasks(nextTasks);
    return {
      task: optimisticTask,
      rollback: () => {
        pendingCloudStatusIntents.delete(String(taskId));
        commitTasks(previousTasks);
      },
    };
  }, [commitTasks, isCloudUser]);

  const applyOptimisticCloudTaskRemoval = useCallback((taskIds = []) => {
    if (!isCloudUser) return null;
    const ids = new Set(taskIds.map((taskId) => String(taskId)).filter(Boolean));
    if (ids.size === 0) return null;

    const previousTasks = tasksRef.current;
    const now = Date.now();
    const nextTasks = previousTasks.filter((task) => !ids.has(String(task.id)));
    if (nextTasks.length === previousTasks.length) return null;

    ids.forEach((taskId) => pendingCloudRemovalTimestamps.set(String(taskId), now));
    commitTasks(nextTasks);
    return {
      rollback: () => {
        ids.forEach((taskId) => pendingCloudRemovalTimestamps.delete(String(taskId)));
        commitTasks(previousTasks);
      },
    };
  }, [commitTasks, isCloudUser]);

  const getRawResponseTask = (data = {}, taskId = "") => {
    const state = data?.state && typeof data.state === "object" ? data.state : null;
    const rawTasks = [
      ...(Array.isArray(state?.tasks) ? state.tasks : []),
      ...(Array.isArray(state?.nonActiveTasks) ? state.nonActiveTasks : []),
      ...(Array.isArray(data?.tasks) ? data.tasks : []),
      ...(Array.isArray(data?.nonActiveTasks) ? data.nonActiveTasks : []),
      ...(Array.isArray(data?.non_active_tasks) ? data.non_active_tasks : []),
    ];
    return rawTasks.find((currentTask) => String(currentTask?.id) === String(taskId)) || null;
  };

  const runCloudTaskAction = ({
    action,
    taskId,
    source = "web",
    pendingMessage = "",
    successMessage = "",
    errorMessage = "",
    onSuccess = null,
    optimisticMutator = null,
  }) => {
    if (!isCloudUser || !taskId) return false;
    const task = tasksRef.current.find((currentTask) => String(currentTask.id) === String(taskId));
    if (!task) return false;

    const optimistic = applyOptimisticCloudTaskMutation(taskId, optimisticMutator);
    const optimisticTask = optimistic?.task || task;

    if (pendingMessage) setNudgeStatus(pendingMessage);
    runPlannerClientAction({
      action,
      source,
      payload: {
        taskId: task.id,
        taskRef: task.id,
        taskText: task.text,
        idempotencyKey: buildWebIdempotencyKey(source, action, task.id, getShortIdempotencyBucket()),
      },
    })
      .then((data) => {
        const appliedState = data?.__appliedState;
        const serverTask = (appliedState?.mergedTasks || []).find((currentTask) => String(currentTask.id) === String(task.id)) || optimisticTask;
        const rawServerTask = getRawResponseTask(data, task.id);
        if (optimisticTask?.status && rawServerTask?.status === optimisticTask.status) {
          pendingCloudStatusIntents.delete(String(task.id));
        }
        if (successMessage) setNudgeStatus(successMessage);
        setHighlightTaskId(task.id);
        if (typeof onSuccess === "function") onSuccess(serverTask, data);
      })
      .catch((error) => {
        let appliedErrorState = error?.__appliedState || null;
        if (!appliedErrorState && error?.payload && typeof error.payload === "object") {
          appliedErrorState = applyPlannerClientState(error.payload);
        }
        if (!appliedErrorState && optimistic?.rollback) {
          optimistic.rollback();
        }
        console.error(`[planner-client-actions:${action}]`, error);
        setNudgeStatus(errorMessage || "Не удалось сохранить действие через backend. Обнови страницу и попробуй ещё раз.");
      });

    return true;
  };

  const runCloudTaskPayloadAction = ({
    action,
    taskId,
    source = "web",
    payload = {},
    pendingMessage = "",
    successMessage = "",
    errorMessage = "",
    onSuccess = null,
    optimisticMutator = null,
  }) => {
    if (!isCloudUser || !taskId) return false;
    const task = tasksRef.current.find((currentTask) => String(currentTask.id) === String(taskId));
    if (!task) return false;

    const optimistic = applyOptimisticCloudTaskMutation(taskId, optimisticMutator);
    const optimisticTask = optimistic?.task || task;

    if (pendingMessage) setNudgeStatus(pendingMessage);
    runPlannerClientAction({
      action,
      source,
      payload: {
        taskId: task.id,
        taskRef: task.id,
        taskText: task.text,
        ...payload,
        idempotencyKey: payload.idempotencyKey || buildWebIdempotencyKey(source, action, task.id, getShortIdempotencyBucket()),
      },
    })
      .then((data) => {
        const appliedState = data?.__appliedState;
        const serverTask = (appliedState?.mergedTasks || []).find((currentTask) => String(currentTask.id) === String(task.id)) || optimisticTask;
        const rawServerTask = getRawResponseTask(data, task.id);
        if (optimisticTask?.status && rawServerTask?.status === optimisticTask.status) {
          pendingCloudStatusIntents.delete(String(task.id));
        }
        if (successMessage) setNudgeStatus(successMessage);
        setHighlightTaskId(task.id);
        if (typeof onSuccess === "function") onSuccess(serverTask, data);
      })
      .catch((error) => {
        let appliedErrorState = error?.__appliedState || null;
        if (!appliedErrorState && error?.payload && typeof error.payload === "object") {
          appliedErrorState = applyPlannerClientState(error.payload);
        }
        if (!appliedErrorState && optimistic?.rollback) {
          optimistic.rollback();
        }
        console.error(`[planner-client-actions:${action}]`, error);
        setNudgeStatus(errorMessage || "Не удалось сохранить действие через backend. Обнови страницу и попробуй ещё раз.");
      });

    return true;
  };

  const handleAddTask = (text, options = {}) => {
    const cleanText = String(text || "").trim();
    if (!cleanText) return null;
    const now = Date.now();
    const duplicateKey = normalizeTaskTitleForDuplicateCheck(cleanText);
    const existingActiveTask = tasksRef.current.find((task) => (
      task.status === "active" &&
      normalizeTaskTitleForDuplicateCheck(task.text) === duplicateKey
    ));

    if (existingActiveTask) {
      setHighlightTaskId(existingActiveTask.id);
      setNudgeStatus(`Такая активная задача уже есть: «${existingActiveTask.text}».`);
      if (typeof options.onAlreadyExists === "function") {
        options.onAlreadyExists(existingActiveTask);
      }
      return existingActiveTask;
    }

    const recentCreateUntil = Number(recentTaskCreateKeysRef.current.get(duplicateKey) || 0);
    if (recentCreateUntil > now) {
      setNudgeStatus(`Задача «${cleanText}» уже создаётся. Не дублирую.`);
      return null;
    }
    recentTaskCreateKeysRef.current.set(duplicateKey, now + 8000);
    for (const [key, expiresAt] of recentTaskCreateKeysRef.current.entries()) {
      if (Number(expiresAt || 0) <= now) recentTaskCreateKeysRef.current.delete(key);
    }

    const subtasks = [...new Set(
      (Array.isArray(options.subtasks) ? options.subtasks : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    )]
      .slice(0, 8)
      .map((item, index) => ({
        id: `${now}-sub-${index + 1}`,
        text: item,
        completed: false,
      }));

    if (isCloudUser) {
      setNudgeStatus(language === "en" ? "Adding task through backend..." : "Добавляю задачу через backend...");
      runPlannerClientAction({
        action: PLANNER_ACTIONS.ADD_TASK,
        source: String(options.source || "web"),
        payload: {
          taskText: cleanText,
          urgency: options.urgency || "medium",
          resistance: options.resistance || "medium",
          subtasks: subtasks.map((item) => item.text).filter(Boolean),
          idempotencyKey: buildWebIdempotencyKey("web_add", duplicateKey, getShortIdempotencyBucket(now, 8000)),
        },
      })
        .then((data) => {
          const appliedState = data?.__appliedState;
          const serverTask = (appliedState?.mergedTasks || []).find((task) => (
            task.status === "active" &&
            normalizeTaskTitleForDuplicateCheck(task.text) === duplicateKey
          ));
          if (serverTask?.id) {
            setHighlightTaskId(serverTask.id);
          }
          setNudgeStatus(language === "en" ? "Task added." : "Задача добавлена.");
          trackDailyAction();
          if (typeof options.onCloudSuccess === "function") {
            options.onCloudSuccess(serverTask || null, data);
          }
        })
        .catch((error) => {
          console.error("[planner-client-actions:add_task]", error);
          setNudgeStatus("Не удалось сохранить задачу через backend. Обнови страницу и попробуй ещё раз.");
          if (typeof options.onCloudError === "function") {
            options.onCloudError(error);
          }
        })
        .finally(() => {
          recentTaskCreateKeysRef.current.delete(duplicateKey);
        });
      return null;
    }

    const newTask = createGuestTask({
      id: now.toString(),
      text: cleanText,
      defaultTaskHeat: DEFAULT_TASK_HEAT,
      tasks: tasksRef.current,
      getNextTaskOrder,
      markTaskPendingSync,
      subtasks,
      urgency: options.urgency || "medium",
      resistance: "medium",
    });
    if (!newTask) return null;
    commitTasks(sortTasksByOrder([...tasksRef.current, newTask]));

    persistTask(newTask);
    recordPlannerEvent({
      type: "task_created",
      actor: "angel",
      source: String(options.source || "web"),
      taskId: newTask.id,
      taskText: newTask.text,
      message: `Ангел записал новую задачу «${newTask.text || "без названия"}».`,
      createdAt: now,
    });

    setHighlightTaskId(newTask.id);
    trackDailyAction();
    return newTask;
  };

  // Adds today's date to task.activeDays (a set stored as sorted array).
  // Call this inside any setTasks updater that already has the task object.
  const withActiveDay = (task) => {
    const today = getDayKey();
    const prev = task.activeDays || [];
    if (prev.includes(today)) return task;
    return { ...task, activeDays: [...prev, today].sort() };
  };

  const handleTouch = (taskId, options = {}) => {
    const actionSource = String(options.source || "web_touch");
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    if (cloudTask && runCloudTaskAction({
      action: PLANNER_ACTIONS.TOUCH_TASK,
      taskId,
      source: actionSource,
      errorMessage: "Сдвиг не сохранился через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      setHighlightTaskId(taskId);
      trackDailyAction();
      return;
    }

    const saved = mutateGuestSingleTask("touch_task", taskId, (task) =>
      touchGuestTask(task, {
        markTaskPendingSync,
        withActiveDay,
        touchHeatBonus: TOUCH_HEAT_BONUS,
        defaultTaskHeat: DEFAULT_TASK_HEAT,
      }),
    );
    if (saved) {
      persistTask(saved);
      recordPlannerEvent({
        type: "task_touched",
        actor: "angel",
        source: actionSource,
        taskId: saved.id,
        taskText: saved.text,
        message: `Засчитан сдвиг по задаче «${saved.text || "без названия"}».`,
        createdAt: saved.lastUpdated || Date.now(),
      });
    }
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const handleAddSubtask = async (taskId, text, options = {}) => {
    const cleanText = String(text || "").trim();
    if (!cleanText) return null;
    const targetTask = tasksRef.current.find((task) => String(task.id) === String(taskId)) || null;
    if (!options.skipExternalWaitingDetection && isExternalWaitingStepText(cleanText)) {
      const intent = await classifyRescueStepIntent(cleanText, targetTask);
      if (intent.intent === "not_your_move") {
        openNotYourMoveDraft(targetTask || { id: taskId, text: "" }, "web_subtask_waiting_intent", {
          reason: intent.reason || "waiting_for_organization",
          waitingFor: intent.waitingFor || cleanText,
          source: `web_subtask_waiting_step_${intent.source || "intent"}`,
        });
        setNudgeStatus(language === "en"
          ? "That sounds like waiting on someone else. Confirm Not Your Move instead of adding another step."
          : "Похоже, это ожидание внешней стороны. Подтверди «не твой ход» вместо ещё одного подшага.");
        return null;
      }
    }
    const preferredSubtaskId = options.subtaskId ? String(options.subtaskId) : "";
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    if (cloudTask && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.ADD_SUBTASK,
      taskId,
      source: options.source || "web_subtask",
      payload: {
        subtaskText: cleanText,
        idempotencyKey: `web_subtask_${cloudTask.id}_${normalizeTaskTitleForDuplicateCheck(cleanText)}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        addGuestSubtask(task, cleanText, {
          markTaskPendingSync,
          subtaskId: preferredSubtaskId || `optimistic-${Date.now()}`,
        })
      ),
      errorMessage: "Шаг не сохранился через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      setHighlightTaskId(taskId);
      trackDailyAction();
      return cloudTask;
    }

    const saved = mutateGuestSingleTask("add_subtask", taskId, (task) =>
      addGuestSubtask(task, cleanText, {
        markTaskPendingSync,
        subtaskId: preferredSubtaskId || Date.now().toString(),
      }),
    );
    if (saved) {
      persistTask(saved);
      recordPlannerEvent({
        type: "subtask_added",
        actor: "angel",
        source: "web_subtask",
        taskId: saved.id,
        taskText: saved.text,
        message: `Добавлен шаг в задачу «${saved.text || "без названия"}».`,
        createdAt: saved.lastUpdated || Date.now(),
      });
    }
    setHighlightTaskId(taskId);
    trackDailyAction();
    return saved;
  };

  const handleEditTask = (taskId, newText) => {
    const cleanText = String(newText || "").trim();
    if (!cleanText) return;
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    if (cloudTask && String(cloudTask.text || "").trim() !== cleanText && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.EDIT_TASK,
      taskId,
      source: "web_task_edit",
      payload: {
        newTaskText: cleanText,
        idempotencyKey: `web_task_edit_${cloudTask.id}_${normalizeTaskTitleForDuplicateCheck(cleanText)}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        editGuestTaskTitle(task, cleanText, { markTaskPendingSync, withActiveDay })
      ),
      errorMessage: "Название не сохранилось через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      return;
    }

    if (isCloudUser && cloudTask && String(cloudTask.text || "").trim() === cleanText) return;

    let previousText = "";
    const saved = mutateGuestSingleTask("edit_task", taskId, (task) => {
      previousText = task.text || "";
      return editGuestTaskTitle(task, cleanText, { markTaskPendingSync, withActiveDay });
    });
    if (saved) {
      persistTask(saved);
      recordPlannerEvent({
        type: "task_title_changed",
        actor: "angel",
        source: "web_task_edit",
        taskId: saved.id,
        taskText: saved.text,
        message: `Задача переименована: «${previousText || "без названия"}» → «${saved.text || "без названия"}».`,
        createdAt: saved.lastUpdated || Date.now(),
      });
    }
  };

  const handleAddTime = (taskId, elapsedMs) => {
    if (!elapsedMs || elapsedMs <= 0) return;
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    if (cloudTask && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.ADD_TIME,
      taskId,
      source: "web_timer",
      payload: {
        elapsedMs,
        idempotencyKey: `web_time_${cloudTask.id}_${elapsedMs}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        addGuestTaskTime(task, elapsedMs, getDayKey(), { markTaskPendingSync, withActiveDay })
      ),
      errorMessage: "Время не сохранилось через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      return;
    }

    const today = getDayKey();
    const saved = mutateGuestSingleTask("add_time", taskId, (task) =>
      addGuestTaskTime(task, elapsedMs, today, { markTaskPendingSync, withActiveDay }),
    );
    if (saved) {
      persistTask(saved);
      recordPlannerEvent({
        type: "task_time_added",
        actor: "angel",
        source: "web_timer",
        taskId: saved.id,
        taskText: saved.text,
        message: `Записано время по задаче «${saved.text || "без названия"}».`,
        createdAt: saved.lastUpdated || Date.now(),
      });
    }
  };

  const handleDeleteSubtask = (taskId, subtaskId) => {
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    const cloudSubtask = (Array.isArray(cloudTask?.subtasks) ? cloudTask.subtasks : [])
      .find((subtask) => String(subtask.id) === String(subtaskId));
    if (cloudTask && cloudSubtask && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.DELETE_SUBTASK,
      taskId,
      source: "web_subtask_delete",
      payload: {
        subtaskId,
        subtaskText: cloudSubtask.text || "",
        idempotencyKey: `web_subtask_delete_${cloudTask.id}_${subtaskId}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        deleteGuestSubtask(task, subtaskId, { markTaskPendingSync })
      ),
      errorMessage: "Шаг не удалился через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      return;
    }

    let deletedSubtaskText = "";
    const saved = mutateGuestSingleTask("delete_subtask", taskId, (task) => {
      const targetSubtask = (Array.isArray(task.subtasks) ? task.subtasks : [])
        .find((subtask) => String(subtask.id) === String(subtaskId));
      if (!targetSubtask) return null;
      deletedSubtaskText = targetSubtask.text || "";
      return deleteGuestSubtask(task, subtaskId, { markTaskPendingSync });
    });
    if (saved) {
      persistTask(saved);
      recordPlannerEvent({
        type: "subtask_deleted",
        actor: "angel",
        source: "web_subtask_delete",
        taskId: saved.id,
        taskText: saved.text,
        message: `Удалён шаг из задачи «${saved.text || "без названия"}»: ${deletedSubtaskText || "шаг"}.`,
        createdAt: saved.lastUpdated || Date.now(),
      });
    }
  };

  const handleEditSubtask = (taskId, subtaskId, newText) => {
    const cleanText = String(newText || "").trim();
    if (!cleanText) return;
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    const cloudSubtask = (Array.isArray(cloudTask?.subtasks) ? cloudTask.subtasks : [])
      .find((subtask) => String(subtask.id) === String(subtaskId));
    if (cloudTask && cloudSubtask && String(cloudSubtask.text || "").trim() !== cleanText && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.EDIT_SUBTASK,
      taskId,
      source: "web_subtask_edit",
      payload: {
        subtaskId,
        newSubtaskText: cleanText,
        idempotencyKey: `web_subtask_edit_${cloudTask.id}_${subtaskId}_${normalizeTaskTitleForDuplicateCheck(cleanText)}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        editGuestSubtask(task, subtaskId, cleanText, { markTaskPendingSync, withActiveDay })
      ),
      errorMessage: "Шаг не сохранился через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      return;
    }

    if (isCloudUser && cloudTask && cloudSubtask && String(cloudSubtask.text || "").trim() === cleanText) return;

    let previousSubtaskText = "";
    const saved = mutateGuestSingleTask("edit_subtask", taskId, (task) => {
      const targetSubtask = (Array.isArray(task.subtasks) ? task.subtasks : [])
        .find((subtask) => String(subtask.id) === String(subtaskId));
      if (!targetSubtask) return null;
      previousSubtaskText = targetSubtask.text || "";
      return editGuestSubtask(task, subtaskId, cleanText, { markTaskPendingSync, withActiveDay });
    });
    if (saved) {
      persistTask(saved);
      recordPlannerEvent({
        type: "subtask_edited",
        actor: "angel",
        source: "web_subtask_edit",
        taskId: saved.id,
        taskText: saved.text,
        message: `Шаг изменён в задаче «${saved.text || "без названия"}»: ${previousSubtaskText || "шаг"} → ${cleanText}.`,
        createdAt: saved.lastUpdated || Date.now(),
      });
    }
  };

  const handleToggleSubtask = (taskId, subtaskId) => {
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    const cloudSubtask = (Array.isArray(cloudTask?.subtasks) ? cloudTask.subtasks : [])
      .find((subtask) => String(subtask.id) === String(subtaskId));
    if (cloudTask && cloudSubtask && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.TOGGLE_SUBTASK,
      taskId,
      source: "web_subtask_toggle",
      payload: {
        subtaskId,
        completed: !Boolean(cloudSubtask.completed),
        idempotencyKey: `web_subtask_toggle_${cloudTask.id}_${subtaskId}_${cloudSubtask.completed ? "open" : "done"}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        toggleGuestSubtask(task, subtaskId, {
          markTaskPendingSync,
          withActiveDay,
          subtaskCompletionCap: SUBTASK_COMPLETION_CAP,
        })
      ),
      errorMessage: "Галочка не сохранилась через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      setHighlightTaskId(taskId);
      trackDailyAction();
      return;
    }

    let nextCompleted = null;
    let toggledSubtaskText = "";
    const saved = mutateGuestSingleTask("toggle_subtask", taskId, (task) => {
      const currentSubtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
      const targetSubtask = currentSubtasks.find((subtask) => String(subtask.id) === String(subtaskId));
      if (!targetSubtask) return null;
      nextCompleted = !Boolean(targetSubtask.completed);
      toggledSubtaskText = targetSubtask.text || "";
      return toggleGuestSubtask(task, subtaskId, {
        markTaskPendingSync,
        withActiveDay,
        subtaskCompletionCap: SUBTASK_COMPLETION_CAP,
      });
    });
    if (saved) {
      persistTask(saved);
      recordPlannerEvent({
        type: "subtask_toggled",
        actor: "angel",
        source: "web_subtask_toggle",
        taskId: saved.id,
        taskText: saved.text,
        message: nextCompleted
          ? `Шаг выполнен в задаче «${saved.text || "без названия"}»: ${toggledSubtaskText || "шаг"}.`
          : `Шаг снова открыт в задаче «${saved.text || "без названия"}»: ${toggledSubtaskText || "шаг"}.`,
        createdAt: saved.lastUpdated || Date.now(),
      });
    }
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const normalizeRescueStepText = (text = "") => String(text || "").trim().replace(/\s+/g, " ").toLowerCase();
  const isTemporarySubtaskId = (subtaskId = "") => /^clarify-|^optimistic-/.test(String(subtaskId || ""));

  const findSubtaskByStepText = (task, stepText = "", { preferOpen = false } = {}) => {
    const normalizedStep = normalizeRescueStepText(stepText);
    if (!task || !normalizedStep) return null;
    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const exactMatches = subtasks.filter((subtask) =>
      normalizeRescueStepText(subtask.text) === normalizedStep
    );
    if (preferOpen) {
      return exactMatches.find((subtask) => !subtask.completed) || exactMatches[0] || null;
    }
    return exactMatches[0] || null;
  };

  useEffect(() => {
    if (!pendingRescueStepCompletion?.taskId || !pendingRescueStepCompletion?.stepText) return;
    if (Date.now() - Number(pendingRescueStepCompletion.createdAt || 0) > 2 * 60 * 1000) {
      setPendingRescueStepCompletion(null);
      return;
    }
    const task = tasksRef.current.find((item) => String(item.id) === String(pendingRescueStepCompletion.taskId));
    const subtask = findSubtaskByStepText(task, pendingRescueStepCompletion.stepText, { preferOpen: true });
    if (!subtask || subtask.completed) return;
    if (isCloudUser && isTemporarySubtaskId(subtask.id)) return;
    setPendingRescueStepCompletion(null);
    handleToggleSubtask(task.id, subtask.id);
    setNudgeStatus(language === "en"
      ? "Angel marked the rescued tiny step as done."
      : "Ангел отметил rescue-микрошаг выполненным.");
  }, [language, pendingRescueStepCompletion, tasks]);

  useEffect(() => {
    const effectiveQuietUntil = Math.max(
      Number(companionPromptQuietUntil || 0),
      readCompanionPromptQuietUntil()
    );
    if (!effectiveQuietUntil) return undefined;
    const msLeft = Number(effectiveQuietUntil) - Date.now();
    if (msLeft <= 0) {
      setCompanionPromptQuietUntil(0);
      rememberCompanionPromptQuietUntil(0);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setCompanionPromptQuietUntil(0);
      rememberCompanionPromptQuietUntil(0);
    }, msLeft);
    return () => window.clearTimeout(timer);
  }, [companionPromptQuietUntil]);

  const handleSetUrgency = (taskId, urgency) => {
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    if (cloudTask && cloudTask.urgency !== urgency && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.SET_URGENCY,
      taskId,
      source: "web_urgency",
      payload: {
        urgency,
        idempotencyKey: `web_urgency_${cloudTask.id}_${urgency}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        updateGuestTaskFields(task, { urgency }, { markTaskPendingSync })
      ),
      errorMessage: "Срочность не сохранилась через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      setHighlightTaskId(taskId);
      return;
    }

    if (isCloudUser && cloudTask && cloudTask.urgency === urgency) return;

    const saved = mutateGuestSingleTask("set_urgency", taskId, (task) =>
      updateGuestTaskFields(task, { urgency }, { markTaskPendingSync }),
    );
    if (saved) {
      persistTask(saved);
    }
    setHighlightTaskId(taskId);
  };

  const handleSetResistance = (taskId, resistance) => {
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    if (cloudTask && cloudTask.resistance !== resistance && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.SET_RESISTANCE,
      taskId,
      source: "web_resistance",
      payload: {
        resistance,
        idempotencyKey: `web_resistance_${cloudTask.id}_${resistance}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        updateGuestTaskFields(task, { resistance }, { markTaskPendingSync })
      ),
      errorMessage: "Сопротивление не сохранилось через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      setHighlightTaskId(taskId);
      return;
    }

    if (isCloudUser && cloudTask && cloudTask.resistance === resistance) return;

    const saved = mutateGuestSingleTask("set_resistance", taskId, (task) =>
      updateGuestTaskFields(task, { resistance }, { markTaskPendingSync }),
    );
    if (saved) {
      persistTask(saved);
    }
    setHighlightTaskId(taskId);
  };

  const openNotYourMoveDraft = (task, source = "sticky_diagnosis", options = {}) => {
    if (!task?.id) return;
    const taskTitle = getTaskDisplayTitle(task);
    const existingBlocker = task.blocked || task.notYourMove || {};
    const relationMemory = getQuestRelationMemory({ taskId: task.id, taskTitle });
    const waitingFor = String(
      options.waitingFor ||
      existingBlocker.waitingFor ||
      existingBlocker.waiting_for ||
      relationMemory?.lastWaitingFor ||
      ""
    );
    const reason = String(
      options.reason ||
      existingBlocker.reason ||
      relationMemory?.lastWaitingReason ||
      "waiting_for_organization"
    );
    setDismissedMissionBubbleTaskId(String(task.id));
    rememberMissionBubbleCooldown(task.id, DAY_MS);
    setNotYourMoveHeldTaskId(String(task.id));
    setNotYourMoveHeldTaskTitle(taskTitle);
    suppressTaskFromPressureNow(task.id);
    moveMissionAwayFromTask(task.id, taskTitle);
    const quietUntil = Date.now() + 3 * 60 * 1000;
    rememberNotYourMovePressureHold({
      taskId: task.id,
      taskTitle,
      until: quietUntil,
    });
    setCompanionPromptQuietUntil(quietUntil);
    rememberCompanionPromptQuietUntil(quietUntil);
    setClarificationPrompt(null);
    setStickyKillConfirmPrompt(null);
    if (visibleAngelEntrySession?.id) {
      setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
    }
    setNotYourMoveDraft({
      taskId: task.id,
      taskTitle,
      reason,
      waitingFor,
      source,
    });
    setHighlightTaskId(task.id);
    setNudgeStatus(language === "en"
      ? "Choose what this is waiting for and when Angel should check back."
      : "Выбери, чего ждём, и когда ангелу мягко проверить статус.");
  };

  const suppressTaskFromPressureNow = (taskId) => {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return;
    setPressureSuppressedTaskIds((previous) => (
      previous.includes(normalizedTaskId)
        ? previous
        : [...previous, normalizedTaskId]
    ));
  };

  const releaseTaskFromPressureSuppression = (taskId) => {
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) return;
    setPressureSuppressedTaskIds((previous) => previous.filter((id) => id !== normalizedTaskId));
  };

  const selectMissionReplacementFromTasks = (taskList = [], taskId, taskTitle = "") => {
    const excludedTaskId = String(taskId || "").trim();
    const excludedTitleKey = normalizeTaskTitleForDuplicateCheck(taskTitle);
    const orderedCandidates = sortTasksByOrder(taskList.filter((task) => task.status === "active"));
    const orderIndex = new Map(orderedCandidates.map((task, index) => [task.id, index]));
    return getMissionSelection(
      orderedCandidates
        .filter((task) => {
          const candidateId = String(task.id || "").trim();
          if (candidateId && excludedTaskId && candidateId === excludedTaskId) return false;
          if (excludedTitleKey && normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(task)) === excludedTitleKey) return false;
          return !isTaskNotYourMove(task);
        })
        .sort((left, right) => {
          const priorityDelta = getPriorityScore(right) - getPriorityScore(left);
          if (priorityDelta !== 0) return priorityDelta;
          return (orderIndex.get(left.id) || 0) - (orderIndex.get(right.id) || 0);
        }),
    );
  };

  const applyMissionReplacementSelection = (replacementSelection) => {
    const replacementTask = replacementSelection?.task || null;
    setMissionDisplayFallbackTask(replacementTask);
    setForcedMissionDisplayTask(replacementTask);
    setManualMissionOverrideTask(replacementTask);
    setManualMissionOverrideTaskId(replacementTask?.id ? String(replacementTask.id) : "");
    setPlannerMeta((previous) => previous
      ? {
          ...previous,
          mission_task_id: replacementTask?.id ? String(replacementTask.id) : "",
          mission_reason: replacementSelection?.reason || previous.mission_reason || "auto_priority",
          mission_explanation: replacementTask ? "" : previous.mission_explanation,
        }
      : replacementTask
        ? {
            mission_task_id: String(replacementTask.id),
            mission_reason: replacementSelection?.reason || "auto_priority",
            mission_explanation: "",
          }
        : previous);
  };

  const moveMissionAwayFromTask = (taskId, taskTitle = "", taskListOverride = null) => {
    applyMissionReplacementSelection(selectMissionReplacementFromTasks(
      Array.isArray(taskListOverride) ? taskListOverride : tasksRef.current,
      taskId,
      taskTitle,
    ));
  };

  const closeNotYourMoveDraft = (reason = "cancel") => {
    const draft = notYourMoveDraft;
    if (draft?.taskId) {
      const relationSession = {
        id: `not_your_move_draft_${draft.taskId}`,
        taskId: String(draft.taskId || ""),
        taskTitle: String(draft.taskTitle || ""),
        trigger: "not_your_move_draft_closed",
        mode: "not_your_move",
        source: String(draft.source || "web_not_your_move"),
      };
      setDismissedMissionBubbleTaskId(String(draft.taskId));
      rememberMissionBubbleCooldown(draft.taskId, 30 * 60 * 1000);
      setNotYourMoveHeldTaskId("");
      setNotYourMoveHeldTaskTitle("");
      setManualMissionOverrideTaskId("");
      setManualMissionOverrideTask(null);
      setMissionDisplayFallbackTask(null);
      releaseTaskFromPressureSuppression(draft.taskId);
      clearNotYourMovePressureHold();
      rememberQuestRelationSignal(relationSession, "not_now", {
        source: "not_your_move_draft_closed",
        reason,
      });
      appendExecutiveStateLog({
        state: executiveState || "stuck",
        action: "not_your_move_draft_closed",
        taskId: String(draft.taskId || ""),
        reason,
        source: String(draft.source || "web_not_your_move"),
      });
    }
    setNotYourMoveDraft(null);
    const quietUntil = Date.now() + 60 * 1000;
    setCompanionPromptQuietUntil(quietUntil);
    rememberCompanionPromptQuietUntil(quietUntil);
    setNudgeStatus(language === "en"
      ? "Waiting check paused. Angel will not reopen this immediately."
      : "Проверка ожидания отложена. Ангел не откроет это сразу снова.");
  };

  const handleMarkNotYourMove = (taskId, options = {}) => {
    const now = Date.now();
    const days = Math.max(1, Number(options.days || 3));
    const nextCheckInAt = now + days * DAY_MS;
    const reason = String(options.reason || "other");
    const waitingFor = String(options.waitingFor || "");
    const lastUserAction = language === "en"
      ? "Marked as Not Your Move from Angel sticky diagnosis."
      : "Отмечено как «не мой ход» из sticky-диагностики ангела.";
    const blocked = {
      status: "not_your_move",
      reason,
      waitingFor,
      lastUserAction,
      nextCheckInAt,
      updatedAt: now,
      contractVersion: "not_your_move_v1",
    };
    const checkInLabel = formatNotYourMoveCheckIn(nextCheckInAt, language);
    const successMessage = language === "en"
      ? `Not Your Move saved. Angel will check back around ${checkInLabel}.`
      : `Сохранила как «не мой ход». Ангел проверит примерно ${checkInLabel}.`;
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    const heldTaskTitle = cloudTask ? getTaskDisplayTitle(cloudTask) : String(notYourMoveDraft?.taskTitle || "");
    const heldTaskTitleKey = normalizeTaskTitleForDuplicateCheck(heldTaskTitle);
    const confirmedPressureKeys = [
      taskId ? `id:${String(taskId)}` : "",
      heldTaskTitleKey ? `title:${heldTaskTitleKey}` : "",
    ].filter(Boolean);
    const markLocalNotYourMove = (taskList = []) => taskList.map((task) => {
      const sameId = String(task.id || "") === String(taskId || "");
      const sameTitle = heldTaskTitleKey &&
        normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(task)) === heldTaskTitleKey;
      if (!sameId && !sameTitle) return task;
      return updateGuestTaskFields(task, {
        blocked,
        notYourMove: null,
        isToday: false,
      }, { markTaskPendingSync });
    });
    const relationSession = {
      id: `not_your_move_${taskId}`,
      taskId: String(taskId || ""),
      taskTitle: heldTaskTitle,
      trigger: "not_your_move_confirmed",
      mode: "not_your_move",
      source: String(options.source || "web_not_your_move"),
    };
    if (taskId) {
      setDismissedMissionBubbleTaskId(String(taskId));
      rememberMissionBubbleCooldown(taskId, DAY_MS);
      setNotYourMoveHeldTaskId(String(taskId));
      setNotYourMoveHeldTaskTitle(heldTaskTitle);
      setConfirmedNotYourMovePressureKeys((previous) => Array.from(new Set([
        ...previous,
        ...confirmedPressureKeys,
      ])));
      moveMissionAwayFromTask(taskId, heldTaskTitle);
      const quietUntil = Date.now() + 3 * 60 * 1000;
      rememberNotYourMovePressureHold({
        taskId,
        taskTitle: heldTaskTitle,
        until: nextCheckInAt,
      });
      setCompanionPromptQuietUntil(quietUntil);
      rememberCompanionPromptQuietUntil(quietUntil);
      suppressTaskFromPressureNow(taskId);
      setClarificationPrompt(null);
      setStickyKillConfirmPrompt(null);
      const reapplyLocalNotYourMove = () => {
        const nextTasks = markLocalNotYourMove(tasksRef.current);
        tasksRef.current = nextTasks;
        setTasks((previousTasks) => {
          const updatedTasks = markLocalNotYourMove(previousTasks);
          applyMissionReplacementSelection(selectMissionReplacementFromTasks(updatedTasks, taskId, heldTaskTitle));
          return updatedTasks;
        });
        moveMissionAwayFromTask(taskId, heldTaskTitle, nextTasks);
      };
      reapplyLocalNotYourMove();
      if (typeof window !== "undefined") {
        window.setTimeout(reapplyLocalNotYourMove, 500);
        window.setTimeout(reapplyLocalNotYourMove, 1500);
      }
      clearAngelEntryResistance(relationSession);
      rememberQuestRelationSignal(relationSession, "not_my_move", {
        source: String(options.source || "web_not_your_move"),
        optionLabel: getNotYourMoveReasonLabel(reason, language),
        reason,
        waitingReason: reason,
        waitingFor,
        nextCheckInAt,
        notYourMoveConfirmed: true,
      });
      appendExecutiveStateLog({
        state: executiveState || "stuck",
        action: "not_your_move_confirmed",
        taskId: String(taskId || ""),
        reason,
        waitingFor,
        nextCheckInAt,
        source: String(options.source || "web_not_your_move"),
      });
    }
    if (cloudTask && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.MARK_NOT_YOUR_MOVE,
      taskId,
      source: String(options.source || "web_not_your_move"),
      payload: {
        reason,
        waitingFor,
        lastUserAction,
        nextCheckInAt,
        idempotencyKey: `web_not_your_move_${cloudTask.id}_${reason}_${Math.floor(nextCheckInAt / DAY_MS)}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        updateGuestTaskFields(task, {
          blocked,
          notYourMove: null,
          isToday: false,
        }, { markTaskPendingSync })
      ),
      successMessage,
      errorMessage: language === "en"
        ? "Not Your Move was not saved through backend. Refresh and try again."
        : "«Не мой ход» не сохранился через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      setNotYourMoveDraft(null);
      if (visibleAngelEntrySession?.id) {
        setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
      }
      setHighlightTaskId(taskId);
      setNudgeStatus(successMessage);
      return;
    }

    const saved = mutateGuestSingleTask("mark_not_your_move", taskId, (task) =>
      updateGuestTaskFields(task, {
        blocked,
        notYourMove: null,
        isToday: false,
      }, { markTaskPendingSync }),
    );
    if (saved) {
      if (!isCloudUser && user?.id?.startsWith("guest_")) {
        saveGuestPlannerState(user.id, tasksRef.current, score, {
          demoUserId: DEMO_USER_ID,
          demoTasksKey: DEMO_TASKS_KEY,
          demoScoreKey: DEMO_SCORE_KEY,
          stripTasks: stripLocalTaskStateList,
        });
      }
      persistTask(saved);
      recordPlannerEvent({
        type: "task_marked_not_your_move",
        actor: "angel",
        source: String(options.source || "web_not_your_move"),
        taskId: saved.id,
        taskText: saved.text,
        message: language === "en"
          ? `Marked “${saved.text || "task"}” as Not Your Move.`
          : `Задача «${saved.text || "без названия"}» отмечена как «не мой ход».`,
        createdAt: now,
      });
    }
    setNotYourMoveDraft(null);
    if (visibleAngelEntrySession?.id) {
      setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
    }
    setHighlightTaskId(taskId);
    setNudgeStatus(successMessage);
  };

  const handleConfirmNotYourMoveCheckIn = (days) => {
    if (!notYourMoveDraft?.taskId) return;
    handleMarkNotYourMove(notYourMoveDraft.taskId, {
      days,
      reason: notYourMoveDraft.reason,
      waitingFor: notYourMoveDraft.waitingFor || "",
      source: notYourMoveDraft.source || "sticky_diagnosis",
    });
  };

  const handleClearNotYourMove = (taskId) => {
    setNotYourMoveHeldTaskId((current) => String(current || "") === String(taskId || "") ? "" : current);
    setNotYourMoveHeldTaskTitle("");
    setManualMissionOverrideTaskId("");
    setManualMissionOverrideTask(null);
    setForcedMissionDisplayTask(null);
    setMissionDisplayFallbackTask(null);
    releaseTaskFromPressureSuppression(taskId);
    clearNotYourMovePressureHold();
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    const titleKey = cloudTask ? normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(cloudTask)) : "";
    setConfirmedNotYourMovePressureKeys((previous) => previous.filter((key) => (
      key !== `id:${String(taskId || "")}` &&
      (!titleKey || key !== `title:${titleKey}`)
    )));
    const successMessage = language === "en"
      ? "Back in your hands. Angel can consider this task again."
      : "Снова в твоих руках. Ангел может снова учитывать эту задачу.";
    if (cloudTask && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.CLEAR_NOT_YOUR_MOVE,
      taskId,
      source: "web_clear_not_your_move",
      payload: {
        idempotencyKey: `web_clear_not_your_move_${cloudTask.id}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        updateGuestTaskFields(task, {
          blocked: null,
          notYourMove: null,
        }, { markTaskPendingSync })
      ),
      successMessage,
      errorMessage: language === "en"
        ? "Could not clear Not Your Move through backend. Refresh and try again."
        : "Не удалось снять «не мой ход» через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      setHighlightTaskId(taskId);
      return;
    }

    const saved = mutateGuestSingleTask("clear_not_your_move", taskId, (task) =>
      updateGuestTaskFields(task, {
        blocked: null,
        notYourMove: null,
      }, { markTaskPendingSync }),
    );
    if (saved) {
      persistTask(saved);
      recordPlannerEvent({
        type: "task_cleared_not_your_move",
        actor: "angel",
        source: "web_clear_not_your_move",
        taskId: saved.id,
        taskText: saved.text,
        message: language === "en"
          ? `Returned “${saved.text || "task"}” from Not Your Move.`
          : `Задача «${saved.text || "без названия"}» снова в твоих руках.`,
        createdAt: Date.now(),
      });
    }
    setHighlightTaskId(taskId);
    setNudgeStatus(successMessage);
  };

  const handleSetDeadline = (taskId, deadlineAt) => {
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    if (cloudTask && String(cloudTask.deadlineAt || "") !== String(deadlineAt || "") && runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.SET_DEADLINE,
      taskId,
      source: "web_deadline",
      payload: {
        deadlineAt,
        idempotencyKey: `web_deadline_${cloudTask.id}_${deadlineAt || "clear"}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        updateGuestTaskFields(task, { deadlineAt }, { markTaskPendingSync })
      ),
      errorMessage: "Дедлайн не сохранился через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      setHighlightTaskId(taskId);
      return;
    }

    if (isCloudUser && cloudTask && String(cloudTask.deadlineAt || "") === String(deadlineAt || "")) return;

    const saved = mutateGuestSingleTask("set_deadline", taskId, (task) =>
      updateGuestTaskFields(task, { deadlineAt }, { markTaskPendingSync }),
    );
    if (saved) {
      persistTask(saved);
    }
    setHighlightTaskId(taskId);
  };

  const handleToggleVital = (taskId) => {
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    if (cloudTask && runCloudTaskPayloadAction({
      action: cloudTask.isVital ? "unset_vital" : "set_vital",
      taskId,
      source: "web_vital",
      payload: {
        idempotencyKey: `web_vital_${cloudTask.id}_${cloudTask.isVital ? "unset" : "set"}_${getShortIdempotencyBucket()}`,
      },
      optimisticMutator: (task) => (
        toggleGuestTaskBoolean(task, "isVital", { markTaskPendingSync })
      ),
      errorMessage: "Приоритет не сохранился через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      setHighlightTaskId(taskId);
      return;
    }

    const saved = mutateGuestSingleTask("set_vital", taskId, (task) =>
      toggleGuestTaskBoolean(task, "isVital", { markTaskPendingSync }),
    );
    if (saved) {
      persistTask(saved);
    }
    setHighlightTaskId(taskId);
  };

  const handleReorderActiveTasks = (dragTaskId, overTaskId) => {
    const normalizedDragTaskId = normalizeTaskId(dragTaskId);
    const normalizedOverTaskId = normalizeTaskId(overTaskId);

    const activeOrdered = sortTasksByOrder(
      tasksRef.current.filter((task) => task.status === "active"),
    );
    const fromIndex = activeOrdered.findIndex((task) => String(task.id) === normalizedDragTaskId);
    const toIndex = activeOrdered.findIndex((task) => String(task.id) === normalizedOverTaskId);

    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return false;

    const movedTask = activeOrdered[fromIndex];
    const targetTask = activeOrdered[toIndex];
    if (!movedTask || !targetTask) return false;

    if (isCloudUser) {
      const result = reorderGuestActiveTasks(
        tasksRef.current,
        normalizedDragTaskId,
        normalizedOverTaskId,
        {
          markTaskPendingSync,
          getActiveZoneHeat,
        },
      );
      const rollbackTasks = tasksRef.current;
      if (result.changedTasks.length > 0) {
        commitTasks(result.tasks);
      }
      runPlannerClientAction({
        action: PLANNER_ACTIONS.REORDER_TASK,
        source: "web_reorder",
        payload: {
          taskId: movedTask.id,
          taskRef: movedTask.id,
          taskText: movedTask.text,
          overTaskId: targetTask.id,
          overTaskRef: targetTask.id,
          idempotencyKey: `web_reorder_${movedTask.id}_${targetTask.id}_${getShortIdempotencyBucket()}`,
        },
      })
        .then((data) => {
          setHighlightTaskId(movedTask.id);
        })
        .catch((error) => {
          if (!(error?.payload && typeof error.payload === "object")) {
            commitTasks(rollbackTasks);
          }
          console.error("[planner-client-actions:reorder_task]", error);
          setNudgeStatus("Порядок задач не сохранился через backend. Обнови страницу и попробуй ещё раз.");
        });
      return true;
    }

    return Boolean(runGuestOnlyBulkOperation("reorder_task", () => {
      const result = reorderGuestActiveTasks(
        tasksRef.current,
        normalizedDragTaskId,
        normalizedOverTaskId,
        {
          markTaskPendingSync,
          getActiveZoneHeat,
        },
      );

      if (result.changedTasks.length === 0) return false;

      commitTasks(result.tasks);
      result.changedTasks.forEach((task) => persistTask(task));
      return true;
    }, movedTask.id));
  };

  const handleSetHeatZone = (taskId, heatZone) => {
    const zoneHeat = {
      focus: 80,
      background: 40,
      purgatory: 10,
    };
    const newHeat = zoneHeat[heatZone];
    if (newHeat === undefined) return false;

    const task = tasksRef.current.find((currentTask) => String(currentTask.id) === String(taskId));
    if (!task) return false;

    if (isCloudUser) {
      setNudgeStatus(language === "en" ? "Moving task through backend..." : "Перемещаю задачу через backend...");
      const optimistic = applyOptimisticCloudTaskMutation(taskId, (currentTask) => (
        setGuestHeatZone(currentTask, newHeat, {
          markTaskPendingSync,
          getNextTaskOrder,
          tasks: tasksRef.current,
        }).task
      ));
      runPlannerClientAction({
        action: PLANNER_ACTIONS.SET_HEAT_ZONE,
        source: "web_heat_zone",
        payload: {
          taskId: task.id,
          taskRef: task.id,
          taskText: task.text,
          heatZone,
          idempotencyKey: `web_heat_zone_${task.id}_${heatZone}_${getShortIdempotencyBucket()}`,
        },
      })
        .then((data) => {
          setHighlightTaskId(task.id);
          setNudgeStatus(language === "en" ? "Task zone updated." : "Зона задачи обновлена.");
        })
        .catch((error) => {
          if (optimistic?.rollback && !(error?.payload && typeof error.payload === "object")) {
            optimistic.rollback();
          }
          console.error("[planner-client-actions:set_heat_zone]", error);
          setNudgeStatus("Зона изменена не сохранилась через backend. Обнови страницу и попробуй ещё раз.");
        });
      return true;
    }

    let prevStatus = null;
    const saved = mutateGuestSingleTask("set_heat_zone", taskId, (currentTask) => {
      const result = setGuestHeatZone(currentTask, newHeat, {
        markTaskPendingSync,
        getNextTaskOrder,
        tasks: tasksRef.current,
      });
      prevStatus = result.previousStatus;
      return result.task;
    });
    if (saved) persistTask(saved);
    if (prevStatus === "completed") {
      setScore((previousScore) => {
        const next = previousScore - 10;
        persistScore(next);
        return next;
      });
      flashCompanion("angel", ANGEL_RESURRECT_PHRASES);
    } else if (prevStatus === "dead") {
      setScore((previousScore) => {
        const next = previousScore - 2;
        persistScore(next);
        return next;
      });
      flashCompanion("angel", ANGEL_RESURRECT_PHRASES);
    }
    return Boolean(saved);
  };

  const handleComplete = (taskId) => {
    if (runCloudTaskAction({
      action: PLANNER_ACTIONS.COMPLETE_TASK,
      taskId,
      source: "web_complete",
      pendingMessage: language === "en" ? "Completing through backend..." : "Завершаю задачу через backend...",
      successMessage: language === "en" ? "Task completed." : "Задача завершена.",
      optimisticMutator: (task) => (
        task.status !== "active"
          ? null
          : completeGuestTask(task, {
            markTaskPendingSync,
            getNextTaskOrder,
            tasks: tasksRef.current,
          })
      ),
      onSuccess: (task) => {
        const rewardMeta = getOverdueCompletionRewardMeta(task);
        const isHeroic =
          rewardMeta.tier === "heroic" || rewardMeta.tier === "legendary";
        const completionMessage = isHeroic
          ? (language === "en"
            ? `🎺 Heroic overdue completion: +${rewardMeta.bonus}`
            : `🎺 Героическое закрытие просроченной задачи: +${rewardMeta.bonus}`)
          : rewardMeta.bonus > 0
            ? (language === "en"
              ? `🎉 Support bonus +${rewardMeta.bonus} earned`
              : `🎉 Поддерживающий бонус +${rewardMeta.bonus} получен`)
            : (language === "en" ? "🎉 Closed. One shift already counted." : "🎉 Отлично закрыта! Один сдвиг уже засчитан.");
        flashCompanion(
          "angel",
          isHeroic ? ANGEL_HEROIC_COMPLETION_PHRASES : ANGEL_GENERIC_COMPLETION_PHRASES,
        );
        showCompletionBanner(completionMessage);
        showCompletionToast(completionMessage);
        triggerCompletionCelebration(rewardMeta);
      },
    })) {
      trackDailyAction();
      return;
    }

    let overdueCompletionMeta = { bonus: 0, overdueDays: 0, tier: "none" };
    const saved = mutateGuestSingleTask("complete_task", taskId, (task) => {
      if (task.status !== "active") return null;
      overdueCompletionMeta = getOverdueCompletionRewardMeta(task);

      return completeGuestTask(task, {
        markTaskPendingSync,
        getNextTaskOrder,
        tasks: tasksRef.current,
      });
    });
    if (!saved) return;

    const isHeroicOverdueCompletion =
      overdueCompletionMeta.tier === "heroic" || overdueCompletionMeta.tier === "legendary";
    const completionMessage = isHeroicOverdueCompletion
      ? (language === "en"
        ? `🎺 Heroic overdue completion: +${overdueCompletionMeta.bonus}`
        : `🎺 Героическое закрытие просроченной задачи: +${overdueCompletionMeta.bonus}`)
      : overdueCompletionMeta.bonus > 0
        ? (language === "en"
          ? `🎉 Support bonus +${overdueCompletionMeta.bonus} earned`
          : `🎉 Поддерживающий бонус +${overdueCompletionMeta.bonus} получен`)
        : (language === "en" ? "🎉 Closed. One shift already counted." : "🎉 Отлично закрыта! Один сдвиг уже засчитан.");
    const newScore = score + 10 + overdueCompletionMeta.bonus;
    setScore(newScore);
    persistTask(saved);
    persistScore(newScore);
    recordPlannerEvent({
      type: "task_completed",
      actor: "angel",
      source: overdueCompletionMeta.bonus > 0 ? "heroic_completion" : "web_completion",
      taskId: saved.id,
      taskText: saved.text,
      message: overdueCompletionMeta.bonus > 0
        ? (language === "en"
          ? `Angel counted a heroic completion for “${saved.text || "task"}”: +${overdueCompletionMeta.bonus}.`
          : `Ангел засчитал героическое закрытие «${saved.text || "задачи"}»: +${overdueCompletionMeta.bonus}.`)
        : (language === "en"
          ? `Angel moved “${saved.text || "task"}” to Heaven.`
          : `Ангел отправил «${saved.text || "задачу"}» в рай.`),
      createdAt: saved.completedAt || Date.now(),
    });
    trackDailyAction();
    flashCompanion(
      "angel",
      isHeroicOverdueCompletion ? ANGEL_HEROIC_COMPLETION_PHRASES : ANGEL_GENERIC_COMPLETION_PHRASES,
    );
    showCompletionBanner(completionMessage);
    showCompletionToast(completionMessage);

    if (overdueCompletionMeta.bonus > 0) {
      setTimeout(() => {
        flashCompanion(
          "devil",
          isHeroicOverdueCompletion ? DEVIL_HEROIC_COMPLETION_PHRASES : DEVIL_COMPLETION_REWARDED_PHRASES,
        );
      }, 250);
    }
    triggerCompletionCelebration(overdueCompletionMeta);
  };

  const handleDragEnd = ({ active, over }) => {
    setDragTaskId(null);
    if (!active || !over) return;
    const taskId = String(active.id).replace("task-", "");
    const draggedTask = tasksRef.current.find((task) => String(task.id) === taskId);
    if (over.id === "drop-devil") {
      if (draggedTask?.status === "active") {
        handleKill(taskId, { companionScene: "devil_cemetery" });
        return;
      }
      if (draggedTask?.status === "completed") {
        handleTrashCompleted(taskId);
        flashCompanion("devil", DEVIL_KILL_PHRASES, { scene: "devil_cemetery" });
        return;
      }
      if (draggedTask?.status === "dead") {
        setNudgeStatus("Эта задача уже на кладбище.");
        return;
      }
      return;
    }
    if (over.id === "drop-angel") {
      if (draggedTask?.status === "active") {
        handleComplete(taskId);
        return;
      }
      if (draggedTask?.status === "completed") {
        handleReopenCompleted(taskId);
        setNudgeStatus("Вернула задачу из рая в активные.");
        return;
      }
      if (draggedTask?.status === "dead") {
        handleResurrect(taskId);
        flashCompanion("angel", ANGEL_RESURRECT_PHRASES);
        setNudgeStatus("Воскресила задачу из кладбища.");
        return;
      }
      return;
    }

    if (typeof over.id === "string" && over.id.startsWith("task-drop-")) {
      const overTaskId = String(over.id).replace("task-drop-", "");
      const hasReorder = handleReorderActiveTasks(taskId, overTaskId);
      if (hasReorder) return;
    }

    const zoneByDropId = {
      "zone-hot": "focus",
      "zone-passive": "background",
      "zone-purgatory": "purgatory",
    };
    if (zoneByDropId[over.id]) {
      handleSetHeatZone(taskId, zoneByDropId[over.id]);
    }
  };

  const DEVIL_KILL_PHRASES = [
    ...(language === "en"
      ? [
        "Handled. Dead weight goes to the Cemetery.",
        "I buried it. The active list breathes better now.",
        "Gone from the living list. Good.",
        "One clean cut. Much better.",
      ]
      : [
        "За дело, босс! 😈",
        "Туда ей и дорога! Муахаха! 💀",
        "Давно пора! Хоронить — так хоронить! 👿",
        "Один взмах — и готово! 😏",
      ]),
  ];

  const DEVIL_AUTO_CLEAN_PHRASES = [
    ...(language === "en"
      ? [
        "Purgatory is crowded. I am cleaning it up.",
        "Too much stale clutter. I am making space.",
        "Old frozen tasks do not bury themselves.",
        "Time to clean this swamp.",
      ]
      : [
        "Чистилище переполнено — берусь за уборку! 😈",
        "Тут слишком тесно. Освобождаю место... 💀",
        "Старьё само себя не похоронит! 👿",
        "Пора навести порядок в этом болоте! 😈",
      ]),
  ];

  const ANGEL_COMPLETION_REWARDED_PHRASES = [
    ...(language === "en"
      ? [
        "You closed an overdue task. That is real movement.",
        "It was late, and you still brought it to Heaven.",
        "Overdue is not failure. You moved it forward.",
      ]
      : [
        "🕊️ Ты закрыла просроченную задачу — это настоящий фокус и забота о себе.",
        "👼 Сначала тяжело, потом ты всё же довела её до конца. Я очень тобой горжусь.",
        "✨ Просрочка — не приговор. Ты доказала, что способна идти дальше.",
      ]),
  ];

  const DEVIL_HEROIC_COMPLETION_PHRASES = [
    ...(language === "en"
      ? [
        "Even I admit it: rescuing an overdue task is strong.",
        "It sat there too long, and you still finished it.",
        "The overdue monster surrendered. Fanfare earned.",
      ]
      : [
        "😈 Даже я не спорю: вытащить такую просрочку — это мощно.",
        "🎺 Лежала долго, но ты всё равно добила. Это уже серьёзная победа.",
        "🔥 Просроченная идея наконец сдалась. Заслуженные фанфары.",
      ]),
  ];

  const DEVIL_COMPLETION_REWARDED_PHRASES = [
    ...(language === "en"
      ? [
        "Late still counts when it gets done.",
        "Past the deadline, but finished. Respect.",
        "Delayed progress is still progress.",
      ]
      : [
        "😈 Даже когда все напрягается, ты всё равно доводишь дела до конца.",
        "🎊 Позже срока, но ты справилась — уважение за выдержку.",
        "⚡ Работа в запоздалом ритме тоже победа. Продолжай в том же духе.",
      ]),
  ];

  const ANGEL_HEROIC_COMPLETION_PHRASES = [
    ...(language === "en"
      ? [
        "You came back to an old overdue task and finished it. That is brave.",
        "Fanfare for bringing a heavy old task to Heaven.",
        "This is what a real win looks like: the scary task is done.",
      ]
      : [
        "😇 Ты вернулась к давно просроченной задаче и всё-таки закрыла её. Это настоящая смелость.",
        "🎺 Фанфары за то, что ты не бросила старую тяжёлую задачу и довела её до рая.",
        "🏆 Именно так и выглядит большая победа: страшная старая задача всё-таки завершена.",
      ]),
  ];

  const ANGEL_GENERIC_COMPLETION_PHRASES = [
    ...(language === "en"
      ? [
        "Task closed. Choosing action already counts.",
        "One less open loop. One more proof of movement.",
        "You finished it. The shift was real.",
      ]
      : [
        "🕊️ Задача закрыта. Ты выбрала действие — и это уже победа.",
        "✅ Один шаг меньше, один прогресс больше.",
        "✨ Ты закрыла задачу и доказала себе, что сдвиг возможен.",
      ]),
  ];

  const ANGEL_RESURRECT_PHRASES = [
    ...(language === "en"
      ? [
        "Back to Active. One gentle step at a time.",
        "Second chance granted. I am with you.",
        "Not lost. Just returning to the living list.",
        "Resurrected. Keep it small.",
      ]
      : [
        "Принимаюсь за работу! 👼",
        "Даю второй шанс! Верю в тебя! ✨",
        "Ещё не всё потеряно! 😇",
        "Возвращаю к жизни! 💫",
      ]),
  ];

  const flashCompanion = (who, phrases, options = {}) => {
    const msg = phrases[Math.floor(Math.random() * phrases.length)];
    setCompanionFlash({
      who,
      msg,
      scene: options.scene || "",
    });
    setTimeout(() => setCompanionFlash(null), 6500);
  };

  const triggerCompletionCelebration = (reward = 0) => {
    const rewardMeta =
      reward && typeof reward === "object"
        ? reward
        : { bonus: Number.isFinite(Number(reward)) ? Number(reward) : 0, tier: "none" };
    const normalizedBonus = Number.isFinite(Number(rewardMeta.bonus)) ? Number(rewardMeta.bonus) : 0;
    const isHeroic =
      rewardMeta.tier === "heroic" || rewardMeta.tier === "legendary";
    const emojis = isHeroic
      ? ["🎺", "🏆", "😇", "😈", "✨", "🎊"]
      : ["🎉", "✨", "💫", "🌟", "🎊"];
    const particleCount = (isHeroic ? 56 : 38) + normalizedBonus * 3;
    const confettiPalette = ["#ff2d78", "#a0d6ff", "#3aedff", "#fbbf24", "#fca5a5", "#86efac"];
    const confettiShapes = ["rect", "square", "round"];

    const particles = Array.from({ length: particleCount }, (_, index) => {
      const kind = index % 8 === 0 ? "emoji" : "confetti";
      return {
        id: `celebration-${Date.now()}-${index}`,
        kind,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        shape: confettiShapes[Math.floor(Math.random() * confettiShapes.length)],
        startX: `${2 + Math.floor(Math.random() * 96)}vw`,
        startY: `${-40 - Math.floor(Math.random() * 180)}px`,
        driftX: `${Math.floor((Math.random() - 0.5) * 320)}px`,
        dropY: `${115 + Math.floor(Math.random() * 18)}vh`,
        rotate: `${Math.floor((Math.random() - 0.5) * 960)}deg`,
        delay: `${Math.floor(Math.random() * 420)}ms`,
        size: `${Math.floor((kind === "emoji" ? 22 : 12) + Math.random() * (kind === "emoji" ? 12 : 10))}px`,
        duration: `${2600 + Math.floor(Math.random() * 1600)}ms`,
        color: confettiPalette[Math.floor(Math.random() * confettiPalette.length)],
      };
    });

    if (completionCelebrationTimerRef.current) {
      clearTimeout(completionCelebrationTimerRef.current);
    }
    setCompletionCelebration({
      bonus: normalizedBonus,
      hasBonus: normalizedBonus > 0,
      isHeroic,
      particles,
    });
    completionCelebrationTimerRef.current = setTimeout(() => {
      setCompletionCelebration(null);
    }, isHeroic ? 4300 : 3600);
  };

  const showCompletionBanner = (message = "") => {
    const text = String(message || "").trim();
    if (!text) {
      setCompletionBanner("");
      return;
    }

    setCompletionBanner(text);
    if (completionBannerTimerRef.current) {
      clearTimeout(completionBannerTimerRef.current);
    }
    completionBannerTimerRef.current = setTimeout(() => {
      setCompletionBanner("");
      completionBannerTimerRef.current = null;
    }, 3300);
  };

  const showCompletionToast = (message = "") => {
    const text = String(message || "").trim();
    if (!text) return;
    setNudgeStatus(text);
  };

  const handleKill = (taskId, options = {}) => {
    if (!isDemoRoute && runCloudTaskAction({
      action: PLANNER_ACTIONS.KILL_TASK,
      taskId,
      source: "web_manual_kill",
      pendingMessage: language === "en" ? "Moving to Cemetery through backend..." : "Отправляю задачу на кладбище через backend...",
      successMessage: language === "en" ? "Task moved to Cemetery." : "Задача отправлена на кладбище.",
      optimisticMutator: (task) => (
        task.status !== "active"
          ? null
          : moveGuestTaskToCemetery(task, {
            markTaskPendingSync,
            getNextTaskOrder,
            tasks: tasksRef.current,
            taskId,
          })
      ),
    })) {
      flashCompanion("devil", DEVIL_KILL_PHRASES, { scene: options.companionScene || "" });
      return;
    }

    const saved = mutateGuestSingleTask("kill_task", taskId, (task) => (
      task.status !== "active"
        ? null
        : moveGuestTaskToCemetery(task, {
          markTaskPendingSync,
          getNextTaskOrder,
          tasks: tasksRef.current,
          taskId,
        })
    ));
    if (!saved) return;
    const newScore = score - 5;
    setScore(newScore);
    persistTask(saved);
    persistScore(newScore);
    recordPlannerEvent({
      type: "task_dead",
      actor: "user",
      source: "manual_kill",
      taskId: saved.id,
      taskText: saved.text,
      message: language === "en"
        ? `You moved “${saved.text || "task"}” to Cemetery.`
        : `Вы отправили «${saved.text || "задачу"}» на кладбище.`,
      createdAt: saved.deadAt || Date.now(),
    });
    setNudgeStatus(language === "en" ? `Moved “${saved.text}” to Cemetery.` : `Отправила «${saved.text}» на кладбище.`);
    flashCompanion("devil", DEVIL_KILL_PHRASES, { scene: options.companionScene || "" });
  };

  // Devil auto-clean is handled by the server cron for the same reason:
  // no surprise cemetery moves while the user is watching the planner load.

  // Weekly cemetery digest — angel reminds about dead tasks once per week
  useEffect(() => {
    if (!dataLoaded || !user?.id) return;
    const dead = tasks.filter(t => t.status === "dead");
    if (dead.length < 3) return;

    const storageKey = `adhd_cemetery_digest_${user.id}`;
    const lastShown = Number(localStorage.getItem(storageKey) || 0);
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastShown < WEEK_MS) return;

    // Sort oldest first, show up to 5
    const sorted = [...dead].sort((a, b) => {
      const aAt = a.deadAt || (a.id.length >= 10 ? Number(a.id) : 0);
      const bAt = b.deadAt || (b.id.length >= 10 ? Number(b.id) : 0);
      return aAt - bAt;
    });

    localStorage.setItem(storageKey, String(Date.now()));
    setCemeteryDigest({ tasks: sorted.slice(0, 5) });
    flashCompanion("angel", [
      `На кладбище ${dead.length} задач. Может, кому-то дать второй шанс?`,
      `${dead.length} задач ждут на кладбище. Посмотрим — вдруг что-то стоит воскресить?`,
      `Я заглянула на кладбище... там ${dead.length} задач. Может, пора освежить список?`,
    ]);
  }, [dataLoaded, user?.id]); // eslint-disable-line

  const refreshCalendarStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/google-calendar-status");
      const payload = await response.json().catch(() => ({}));
      setCalendarConnected(Boolean(response.ok && payload.connected));
    } catch (error) {
      console.error("Calendar status error:", error);
      setCalendarConnected(false);
    }
  }, []);

  useEffect(() => {
    refreshCalendarStatus();
  }, [refreshCalendarStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const calendarState = params.get("calendar");
    if (!calendarState) return;

    if (calendarState === "connected") {
      setCalendarConnected(true);
      setNudgeStatus("Google Calendar подключён.");
    } else {
      setNudgeStatus(`Google Calendar не подключился: ${calendarState}`);
    }

    params.delete("calendar");
    params.delete("reason");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  const handleConnectCalendar = () => {
    setNudgeStatus("Открываю подключение Google Calendar.");
    window.location.href = "/api/google-calendar-connect";
  };

  const handleScheduleTaskToCalendar = async (task, { date, startTime, durationMinutes }) => {
    const response = await fetch("/api/google-calendar-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: task.text,
        date,
        startTime,
        durationMinutes,
        description: "Добавлено из ADHD Planner",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Calendar event creation failed");
    }
    setCalendarConnected(true);
    setNudgeStatus(`Поставила в календарь: ${task.text}`);
    return payload.event;
  };

  useEffect(() => {
    if (!angelLabOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [angelLabOpen]);

  const stopAngelLabListening = () => {
    angelLabMicRequestIdRef.current += 1;
    const activeRecognition = angelLabRecognitionRef.current;
    let finalizingStarted = false;
    const isEnglish = language === "en";
    if (activeRecognition) {
      try {
        activeRecognition.stop();
      } catch (error) {
        // ignore stop errors
      }
      finalizingStarted = true;
      setAngelLabMicStatus(isEnglish ? "Stopping dictation..." : "Останавливаю диктовку...");
    }

    const recorder = angelLabRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        setAngelLabMicStatus(isEnglish ? "Stopping recording. I will transcribe next..." : "Останавливаю запись. Сейчас распознаю...");
        recorder.stop();
      } catch (error) {
        // ignore stop errors
      }
      finalizingStarted = true;
    }

    const activeStream = angelLabRecorderStreamRef.current;
    if (!finalizingStarted && activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
      angelLabRecorderStreamRef.current = null;
    }

    setAngelLabFinalizing(finalizingStarted);
    setAngelLabListening(false);
    setAngelLabMicMode("");
  };

  const startBrowserSpeechRecognition = () => {
    if (typeof window === "undefined") return false;
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return false;

    const recognition = new SpeechRecognitionCtor();
    const isEnglish = language === "en";
    recognition.lang = isEnglish ? "en-US" : "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (angelLabRecognitionRef.current !== recognition) return;
      const results = Array.from(event.results || []);
      const startIndex = typeof event?.resultIndex === "number" ? event.resultIndex : 0;
      const segments = angelLabRecognitionSegmentsRef.current;

      if (segments.length > results.length) {
        segments.length = results.length;
      }

      for (let index = startIndex; index < results.length; index += 1) {
        const result = results[index];
        const transcript = normalizeAngelLabTranscript(String(result?.[0]?.transcript || ""));
        if (!result?.isFinal || !transcript) {
          segments[index] = "";
          continue;
        }
        segments[index] = transcript;
      }

      const collapsedChunks = [];
      for (const chunk of segments) {
        const cleanedChunk = normalizeAngelLabTranscript(chunk);
        if (!cleanedChunk) continue;

        const previousChunk = collapsedChunks[collapsedChunks.length - 1] || "";
        if (!previousChunk) {
          collapsedChunks.push(cleanedChunk);
          continue;
        }
        if (cleanedChunk === previousChunk) continue;
        if (cleanedChunk.startsWith(previousChunk)) {
          collapsedChunks[collapsedChunks.length - 1] = cleanedChunk;
          continue;
        }
        if (previousChunk.startsWith(cleanedChunk)) continue;
        collapsedChunks.push(cleanedChunk);
      }

      angelLabRecognitionFinalTextRef.current = normalizeAngelLabTranscript(collapsedChunks.join(" "));
      angelLabRecognitionInterimTextRef.current = "";
      const baseText = normalizeAngelLabTranscript(angelLabRecognitionBaseTextRef.current);
      const nextText = normalizeAngelLabTranscript(
        mergeAngelLabTranscriptChunk(baseText, angelLabRecognitionFinalTextRef.current),
      );

      setAngelLabText(nextText);
      setAngelLabMicStatus(
        isEnglish
          ? "Browser dictation fallback is listening..."
          : "Запасной браузерный диктант слушает..."
      );
    };

    recognition.onerror = (event) => {
      if (angelLabRecognitionRef.current !== recognition) return;
      setAngelLabMicStatus(
        isEnglish
          ? `Microphone error: ${event?.error || "unknown"}`
          : `Ошибка микрофона: ${event?.error || "unknown"}`
      );
      setAngelLabListening(false);
      setAngelLabFinalizing(false);
      setAngelLabMicMode("");
      angelLabRecognitionRef.current = null;
      angelLabRecognitionBaseTextRef.current = "";
      angelLabRecognitionSegmentsRef.current = [];
      angelLabRecognitionFinalTextRef.current = "";
      angelLabRecognitionInterimTextRef.current = "";
    };

    recognition.onend = () => {
      if (angelLabRecognitionRef.current !== recognition) return;
      const baseText = normalizeAngelLabTranscript(angelLabRecognitionBaseTextRef.current);
      const finalizedTranscript = normalizeAngelLabTranscript(
        mergeAngelLabTranscriptChunk(baseText, angelLabRecognitionFinalTextRef.current),
      );
      if (finalizedTranscript) {
        setAngelLabText(finalizedTranscript);
      }
      setAngelLabListening(false);
      setAngelLabFinalizing(false);
      setAngelLabMicMode("");
      angelLabRecognitionRef.current = null;
      angelLabRecognitionBaseTextRef.current = "";
      angelLabRecognitionSegmentsRef.current = [];
      angelLabRecognitionFinalTextRef.current = "";
      angelLabRecognitionInterimTextRef.current = "";
    };

    try {
      angelLabRecognitionBaseTextRef.current = normalizeAngelLabTranscript(angelLabText);
      angelLabRecognitionSegmentsRef.current = [];
      angelLabRecognitionFinalTextRef.current = "";
      angelLabRecognitionInterimTextRef.current = "";
      angelLabRecognitionRef.current = recognition;
      recognition.start();
      setAngelLabListening(true);
      setAngelLabFinalizing(false);
      setAngelLabMicMode("speech");
      setAngelLabMicStatus(
        isEnglish
          ? "Browser dictation fallback is listening..."
          : "Запасной браузерный диктант слушает..."
      );
      return true;
    } catch (error) {
      setAngelLabMicStatus(
        isEnglish ? "Could not start browser microphone fallback." : "Не удалось запустить браузерный fallback."
      );
      return false;
    }
  };

  const startRecordedSpeechFallback = async () => {
    const isEnglish = language === "en";
    let permissionHintTimer = null;
    let microphoneTimeoutTimer = null;
    const requestId = angelLabMicRequestIdRef.current + 1;
    angelLabMicRequestIdRef.current = requestId;
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !window.MediaRecorder ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      return false;
    }

    try {
      const previousStream = angelLabRecorderStreamRef.current;
      if (previousStream) {
        previousStream.getTracks().forEach((track) => track.stop());
        angelLabRecorderStreamRef.current = null;
      }
      angelLabRecorderRef.current = null;
      angelLabAudioChunksRef.current = [];
      setAngelLabListening(true);
      setAngelLabFinalizing(false);
      setAngelLabMicMode("request");
      setAngelLabMicStatus(
        isEnglish
          ? "Requesting microphone for OpenAI transcription..."
          : "Запрашиваю микрофон для распознавания через OpenAI..."
      );
      permissionHintTimer = setTimeout(() => {
        if (angelLabMicRequestIdRef.current !== requestId) return;
        setAngelLabMicStatus(
          isEnglish
            ? "Still waiting for the browser to hand over the microphone. If you already allowed it, wait a moment or press Speak again."
            : "Всё ещё жду, пока браузер отдаст микрофон. Если доступ уже разрешён, подожди пару секунд или нажми «Говорить» ещё раз."
        );
      }, 9000);
      const microphoneRequest = navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneRequest.then((lateStream) => {
        if (angelLabMicRequestIdRef.current !== requestId) {
          lateStream.getTracks().forEach((track) => track.stop());
        }
      }).catch(() => {
        // handled by the awaited race below
      });
      const stream = await Promise.race([
        microphoneRequest,
        new Promise((_, reject) => {
          microphoneTimeoutTimer = setTimeout(() => {
            reject(new Error("microphone_request_timeout"));
          }, 8000);
        }),
      ]);
      if (angelLabMicRequestIdRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      if (permissionHintTimer) clearTimeout(permissionHintTimer);
      if (microphoneTimeoutTimer) clearTimeout(microphoneTimeoutTimer);
      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = preferredTypes.find((type) => {
        try {
          return window.MediaRecorder.isTypeSupported(type);
        } catch (error) {
          return false;
        }
      });
      const recorder = mimeType
        ? new window.MediaRecorder(stream, { mimeType })
        : new window.MediaRecorder(stream);

      angelLabAudioChunksRef.current = [];
      angelLabRecorderStreamRef.current = stream;
      angelLabRecorderRef.current = recorder;

      recorder.onstart = () => {
        if (angelLabRecorderRef.current !== recorder) return;
        setAngelLabListening(true);
        setAngelLabFinalizing(false);
        setAngelLabMicMode("record");
        setAngelLabMicStatus(
          isEnglish
            ? "Recording is on. Speak now; press Stop when finished."
            : "Запись идёт. Говори сейчас; нажми «Остановить», когда закончишь."
        );
      };

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          angelLabAudioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = angelLabAudioChunksRef.current;
        angelLabAudioChunksRef.current = [];

        const activeStream = angelLabRecorderStreamRef.current;
        if (activeStream) {
          activeStream.getTracks().forEach((track) => track.stop());
        }
        angelLabRecorderStreamRef.current = null;
        angelLabRecorderRef.current = null;
        setAngelLabListening(false);
        setAngelLabMicMode("");

        if (!chunks.length) {
          setAngelLabMicStatus(isEnglish ? "Could not record audio." : "Не удалось записать аудио.");
          return;
        }

        try {
          setAngelLabMicStatus(isEnglish ? "Transcribing with OpenAI..." : "Распознаю через OpenAI...");
          const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const audioBase64 = await blobToBase64(audioBlob);
          let idToken = "";
          try {
            if (auth.currentUser) {
              idToken = await auth.currentUser.getIdToken();
            }
          } catch (error) {
            // ignore token read errors
          }

          if (!idToken) {
            setAngelLabMicStatus(
              isEnglish
                ? "Sign in first to transcribe speech on the server."
                : "Нужно войти в аккаунт, чтобы распознать речь на сервере."
            );
            return;
          }

          const response = await fetch("/api/speech-to-text", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              audioBase64,
              mimeType: audioBlob.type || "audio/webm",
              language: "auto",
            }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || payload?.ok === false) {
            throw new Error(payload?.error || "Speech-to-text failed");
          }

          const transcript = String(payload?.text || "").trim();
          if (transcript) {
            setAngelLabText((previous) => mergeAngelLabTranscriptChunk(previous, transcript));
            setAngelLabMicStatus(
              isEnglish
                ? "Transcribed. Press Draft task cards to split this into tasks."
                : "Распознано. Нажми «Разбить на задачи», чтобы получить карточки."
            );
          } else {
            setAngelLabMicStatus(isEnglish ? "Speech was not recognized." : "Речь не распознана.");
          }
        } catch (error) {
          setAngelLabMicStatus(
            error?.message || (isEnglish ? "Could not transcribe speech." : "Не удалось распознать речь.")
          );
        } finally {
          setAngelLabFinalizing(false);
        }
      };

      recorder.start();
      setAngelLabListening(true);
      setAngelLabFinalizing(false);
      setAngelLabMicMode("record");
      setAngelLabMicStatus(
        isEnglish
          ? "Recording is on. Speak now; press Stop when finished."
          : "Запись идёт. Говори сейчас; нажми «Остановить», когда закончишь."
      );
      return true;
    } catch (error) {
      angelLabMicRequestIdRef.current += 1;
      if (permissionHintTimer) clearTimeout(permissionHintTimer);
      if (microphoneTimeoutTimer) clearTimeout(microphoneTimeoutTimer);
      setAngelLabListening(false);
      setAngelLabFinalizing(false);
      setAngelLabMicMode("");
      setAngelLabMicStatus(
        error?.message === "microphone_request_timeout"
          ? (isEnglish
            ? "The browser did not hand over the microphone. Press Speak again; I reset the stuck request."
            : "Браузер не отдал микрофон. Нажми «Говорить» ещё раз: я сбросила зависший запрос.")
          : isEnglish
          ? "No microphone access. Check browser permission."
          : "Нет доступа к микрофону. Проверь разрешение браузера."
      );
      return false;
    }
  };

  const handleAngelLabMicToggle = async () => {
    if (angelLabSaving) return;
    if (angelLabFinalizing) {
      setAngelLabMicStatus(
        language === "en"
          ? "Wait a few seconds, transcription is finishing..."
          : "Подожди пару секунд, завершаю распознавание..."
      );
      return;
    }
    if (angelLabListening) {
      stopAngelLabListening();
      return;
    }

    setAngelLabMicStatus("");
    if (await startRecordedSpeechFallback()) return;
    if (startBrowserSpeechRecognition()) return;

    setAngelLabMicStatus(
      language === "en" ? "Microphone is unavailable in this browser." : "Микрофон недоступен в этом браузере."
    );
  };

  const handleAngelLabAudioFile = async (file) => {
    if (!file || angelLabSaving || angelLabFinalizing) return;
    const isEnglish = language === "en";
    stopAngelLabListening();
    setAngelLabFinalizing(true);
    setAngelLabMicMode("");
    setAngelLabMicStatus(
      isEnglish
        ? "Transcribing recorded audio with OpenAI..."
        : "Распознаю записанное аудио через OpenAI..."
    );

    try {
      const audioBlob = file instanceof Blob ? file : new Blob([file], { type: "audio/webm" });
      const audioBase64 = await blobToBase64(audioBlob);
      let idToken = "";
      try {
        if (auth.currentUser) {
          idToken = await auth.currentUser.getIdToken();
        }
      } catch (error) {
        // ignore token read errors
      }

      if (!idToken) {
        setAngelLabMicStatus(
          isEnglish
            ? "Sign in first to transcribe speech on the server."
            : "Нужно войти в аккаунт, чтобы распознать речь на сервере."
        );
        return;
      }

      const response = await fetch("/api/speech-to-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          audioBase64,
          mimeType: audioBlob.type || file.type || "audio/webm",
          language: "auto",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Speech-to-text failed");
      }

      const transcript = String(payload?.text || "").trim();
      if (transcript) {
        setAngelLabText((previous) => mergeAngelLabTranscriptChunk(previous, transcript));
        setAngelLabMicStatus(
          isEnglish
            ? "Transcribed. Press Draft task cards to split this into tasks."
            : "Распознано. Нажми «Разбить на задачи», чтобы получить карточки."
        );
      } else {
        setAngelLabMicStatus(isEnglish ? "Speech was not recognized." : "Речь не распознана.");
      }
    } catch (error) {
      setAngelLabMicStatus(
        error?.message || (isEnglish ? "Could not transcribe speech." : "Не удалось распознать речь.")
      );
    } finally {
      setAngelLabFinalizing(false);
    }
  };

  const buildDemoAngelLabSuggestions = (rawText, captureId) => {
    const isEnglishUi = language === "en";
    const normalizedText = normalizeAngelLabTranscript(rawText);
    const actionStartsPattern = "(?:купить|разобрать|подготовить|отправить|записать|написать|сделать|проверить|обновить|доделать|finish|record|write|send|buy|check|prepare|update)";
    const hasCyrillic = (value = "") => /[а-яё]/i.test(value);
    const stripDemoTaskPrefix = (value = "") => {
      let next = normalizeAngelLabTranscript(value)
        .replace(/^[,.;:\s]+/, "")
        .replace(/^(?:и|а|но|then|and|but)\s+/i, "")
        .trim();
      let previous = "";
      while (next && next !== previous) {
        previous = next;
        next = next
          .replace(/^(?:мне\s+(?:надо|нужно)|я\s+(?:должна|должен|должны|должно)|надо|нужно|хочу|i\s+need\s+to|i\s+have\s+to|need\s+to|have\s+to)\s+/i, "")
          .trim();
      }
      return next;
    };
    const isDemoMetaNoise = (value = "") => {
      const clean = value.toLowerCase();
      return !clean ||
        /не\s+знаю\s+с\s+чего\s+начать/.test(clean) ||
        /с\s+чего\s+начать/.test(clean) ||
        /не\s+понятно\s+с\s+чего/.test(clean) ||
        /don't\s+know\s+where\s+to\s+start/.test(clean) ||
        /do\s+not\s+know\s+where\s+to\s+start/.test(clean) ||
        /where\s+to\s+start/.test(clean);
    };
    const splitDemoTaskChunk = (value = "") => {
      const clean = stripDemoTaskPrefix(value);
      if (!clean || isDemoMetaNoise(clean)) return [];
      const connectorPattern = new RegExp(`\\s+(?:и|and)\\s+(?=${actionStartsPattern}(?:\\s|$))`, "gi");
      return clean
        .split(connectorPattern)
        .map(stripDemoTaskPrefix)
        .filter((item) => item.length >= 4 && !isDemoMetaNoise(item));
    };
    const buildDemoSteps = (title = "") => {
      const lower = title.toLowerCase();
      const ru = hasCyrillic(title);
      if (/почт|mail|email|inbox/.test(lower)) {
        return ru
          ? ["Открыть почту и найти 3 важных письма.", "Ответить только на одно письмо."]
          : ["Open the inbox and find 3 important emails.", "Reply to only one email."];
      }
      if (/корм|cat food|pet food/.test(lower)) {
        return ru
          ? ["Проверить, какой корм нужен.", "Заказать один подходящий вариант."]
          : ["Check which food is needed.", "Order one suitable option."];
      }
      if (/демо|demo|walkthrough/.test(lower)) {
        return ru
          ? ["Открыть демо и проверить первый экран.", "Записать 90-секундный walkthrough."]
          : ["Open the demo and check the first screen.", "Record a 90-second walkthrough."];
      }
      if (/портфолио|portfolio/.test(lower)) {
        return ru
          ? ["Открыть портфолио и выбрать одну ссылку.", "Отправить портфолио в одно место."]
          : ["Open the portfolio and pick one link.", "Send the portfolio to one place."];
      }
      if (/application|отклик|заявк/.test(lower)) {
        return ru
          ? ["Выбрать один отклик для отправки.", "Написать короткое первое сообщение."]
          : ["Pick one application to send.", "Write the short first message."];
      }
      return isEnglishUi
        ? [
          `Open this and write the first visible next action for "${title}".`,
          "Make it smaller until it fits into 2 minutes.",
        ]
        : [
          `Открыть это и записать первый видимый следующий шаг для «${title}».`,
          "Уменьшить до шага на 2 минуты.",
        ];
    };
    const fallbackItems = isEnglishUi
      ? [
        "Prepare one portfolio demo block",
        "Record a short planner walkthrough",
        "Send one job application",
      ]
      : [
        "подготовить один блок демо для портфолио",
        "записать короткое видео планера",
        "отправить один отклик",
      ];
    const parsedItems = normalizedText
      .split(/\n|[;•]+|,(?=\s)/)
      .flatMap(splitDemoTaskChunk)
      .filter((item) => item.length >= 4)
      .filter((item, index, list) => list.findIndex((candidate) => (
        candidate.toLowerCase() === item.toLowerCase()
      )) === index)
      .slice(0, 4);
    const items = (parsedItems.length > 0 ? parsedItems : fallbackItems).slice(0, 4);

    return items.map((title, index) => {
      const cleanTitle = title.length > 96 ? `${title.slice(0, 93)}...` : title;
      const [firstStep, secondStep] = buildDemoSteps(cleanTitle);

      return {
        id: `${captureId}-demo-task-${index + 1}`,
        mode: "create",
        title: cleanTitle,
        text: cleanTitle,
        steps: [
          {
            id: `${captureId}-demo-task-${index + 1}-step-1`,
            text: firstStep,
            selected: true,
          },
          {
            id: `${captureId}-demo-task-${index + 1}-step-2`,
            text: secondStep,
            selected: false,
          },
        ],
      };
    });
  };

  const openAngelLab = () => {
    setAngelLabStatus({ kind: "", message: "" });
    setAngelLabMicStatus("");
    setAngelLabHandledNotice(null);
    setAngelLabHandledStats({ added: 0, skipped: 0 });
    setAngelLabExecutiveAssessment(null);
    if (isDemoRoute && !normalizeAngelLabTranscript(angelLabText).trim()) {
      setAngelLabText(language === "en"
        ? "I need to finish the planner demo, record the onboarding video, write portfolio copy, and send one application."
        : "Мне нужно доделать демо планера, записать видео онбординга, написать текст для портфолио и отправить один отклик.");
    }
    setAngelLabOpen(true);
  };

  const closeAngelLab = () => {
    if (angelLabSaving) return;
    stopAngelLabListening();
    setAngelLabOpen(false);
  };

  const handleSaveAngelLab = async () => {
    const text = normalizeAngelLabTranscript(angelLabText);
    if (!text.trim() || angelLabSaving) return;
    if (angelLabFinalizing) {
      setAngelLabStatus({
        kind: "error",
        message: "Подожди секунду: микрофон ещё завершает распознавание.",
      });
      return;
    }
    if (angelLabListening) {
      setAngelLabStatus({
        kind: "error",
        message: "Сначала останови микрофон, потом сохраняй dump.",
      });
      return;
    }

    if (isLowQualityAngelLabTranscript(text)) {
      setAngelLabStatus({
        kind: "error",
        message: "Текст распознан криво. Попробуй ещё раз или поправь вручную перед сохранением.",
      });
      return;
    }

    setAngelLabSaving(true);
    setAngelLabStatus({ kind: "", message: "" });
    setAngelLabHandledNotice(null);
    setAngelLabHandledStats({ added: 0, skipped: 0 });
    setAngelLabProcessing(true);

    try {
      if (isDemoRoute) {
        const dumpText = text.trim();
        const captureId = `demo-angel-${Date.now()}`;
        const cardsForUi = buildDemoAngelLabSuggestions(dumpText, captureId);
        setAngelLabExecutiveAssessment(null);
        setAngelLabDumpHistory((previous) => [
          { id: captureId, text: dumpText, createdAt: Date.now() },
          ...previous,
        ].slice(0, 8));

        await new Promise((resolve) => setTimeout(resolve, 350));
        setAngelLabSuggestions(cardsForUi);
        setAngelLabText("");
        const totalSteps = cardsForUi.reduce((sum, card) => sum + (Array.isArray(card.steps) ? card.steps.length : 0), 0);
        setAngelLabStatus({
          kind: "success",
          message: language === "en"
            ? `Demo draft ready: ${cardsForUi.length} cards and ${totalSteps} optional micro-steps. Nothing was added until you confirm.`
            : `Демо-черновик готов: ${cardsForUi.length} карточки и ${totalSteps} опциональных микрошагов. Ничего не добавлено без подтверждения.`,
        });
        return;
      }

      const inMemoryActiveTasks = tasksRef.current
        .filter((task) => task?.status === "active")
        .map((task) => ({
          id: String(task.id || ""),
          text: String(task.text || ""),
          status: String(task.status || "active"),
	          subtasks: Array.isArray(task.subtasks)
	            ? task.subtasks.map((subtask) => ({
	              id: String(subtask?.id || ""),
	              text: String(subtask?.text || ""),
	              completed: Boolean(subtask?.completed),
	            }))
	            : [],
	          isToday: Boolean(task.isToday),
	          isVital: Boolean(task.isVital),
	          urgency: String(task.urgency || ""),
	          resistance: String(task.resistance || ""),
	          deadlineAt: Number(task.deadlineAt || 0) || null,
	        }));

      let activeTasksPayload = inMemoryActiveTasks;
      if (activeTasksPayload.length === 0) {
        try {
          const parsedLocalTasks = loadGuestPlannerState(user?.id, {
            demoUserId: DEMO_USER_ID,
            demoTasksKey: DEMO_TASKS_KEY,
            demoScoreKey: DEMO_SCORE_KEY,
            stripTasks: stripLocalTaskStateList,
          }).tasks;
          if (Array.isArray(parsedLocalTasks)) {
            activeTasksPayload = parsedLocalTasks
              .filter((task) => task?.status === "active")
              .map((task) => ({
                id: String(task.id || ""),
                text: String(task.text || ""),
                status: String(task.status || "active"),
	                subtasks: Array.isArray(task.subtasks)
	                  ? task.subtasks.map((subtask) => ({
	                    id: String(subtask?.id || ""),
	                    text: String(subtask?.text || ""),
	                    completed: Boolean(subtask?.completed),
	                  }))
	                  : [],
	                isToday: Boolean(task.isToday),
	                isVital: Boolean(task.isVital),
	                urgency: String(task.urgency || ""),
	                resistance: String(task.resistance || ""),
	                deadlineAt: Number(task.deadlineAt || 0) || null,
	              }));
          }
        } catch (_error) {
          activeTasksPayload = inMemoryActiveTasks;
        }
      }

      const response = await fetch("/api/captures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          source: "angel_lab",
          idempotencyKey: `angel-${getShortIdempotencyBucket()}-${Math.random().toString(36).slice(2, 8)}`,
          activeTasks: activeTasksPayload,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || payload?.message || "Не удалось сохранить dump");
      }
      const executiveAssessment = normalizeAngelLabExecutiveAssessment(payload?.executiveAssessment);
      setAngelLabExecutiveAssessment(executiveAssessment);
      if (executiveAssessment && executiveAssessment.state !== "normal") {
        setExecutiveState(executiveAssessment.state);
        setExecutivePlannerOpen(!isRescueFirstExecutiveState(executiveAssessment.state));
        setExecutiveLayerDismissed(false);
        persistExecutiveState(executiveAssessment.state);
        appendExecutiveStateLog({
          state: executiveAssessment.state,
          action: "angel_lab_detected",
          source: "angel_lab",
          taskId: executiveAssessment.controlTaskId,
          taskTitle: executiveAssessment.controlTaskTitle,
          stepText: executiveAssessment.stepText,
          confidence: executiveAssessment.confidence,
        });
      }

      const dumpText = text.trim();
      const captureId = String(payload?.captureId || `angel-${Date.now()}`);
      setAngelLabDumpHistory((previous) => [
        { id: captureId, text: dumpText, createdAt: Date.now() },
        ...previous,
      ].slice(0, 8));

      await new Promise((resolve) => setTimeout(resolve, 900));
      const serverTaskCards = normalizeAngelLabServerTaskCards(payload?.taskCards);
      const cardsForUi = serverTaskCards.map((card, cardIndex) => ({
        ...card,
        id: card.id || `${captureId}-task-${cardIndex + 1}`,
        steps: (card.steps || []).map((step, stepIndex) => ({
          ...step,
          id: step.id || `${captureId}-task-${cardIndex + 1}-step-${stepIndex + 1}`,
        })),
        subtasks: (card.subtasks || []).map((subtask, stepIndex) => ({
          ...subtask,
          id: subtask.id || `${captureId}-task-${cardIndex + 1}-step-${stepIndex + 1}`,
        })),
      }));

      setAngelLabSuggestions(cardsForUi);
      const taskEnrichmentMessage = formatAngelLabTaskEnrichmentMessage(payload?.taskEnrichment);
      const aiDraftMessage = formatAngelLabAiDraftMessage(payload?.aiDraft, language);
      const executiveAssessmentMessage = formatAngelLabExecutiveAssessmentMessage(executiveAssessment, language);

      setAngelLabText("");
      if (cardsForUi.length > 0) {
        const totalSteps = cardsForUi.reduce((sum, card) => sum + ((card.subtasks || card.steps || []).length), 0);
        setAngelLabStatus({
          kind: "success",
	          message: totalSteps > 0
	            ? `Готово. Справа ${cardsForUi.length} карточек и ${totalSteps} вариантов шагов.${aiDraftMessage}${taskEnrichmentMessage}${executiveAssessmentMessage}`
	            : `Готово. Справа ${cardsForUi.length} карточек.${aiDraftMessage}${taskEnrichmentMessage}${executiveAssessmentMessage}`,
	        });
	      } else if (taskEnrichmentMessage || aiDraftMessage) {
	        setAngelLabStatus({
	          kind: aiDraftMessage && !taskEnrichmentMessage ? "error" : "success",
	          message: `Сохранила dump.${aiDraftMessage}${taskEnrichmentMessage}${executiveAssessmentMessage}`,
	        });
	      } else if (executiveAssessmentMessage) {
	        setAngelLabStatus({
	          kind: "success",
	          message: `Сохранила dump.${executiveAssessmentMessage}`,
	        });
	      } else {
        setAngelLabStatus({
          kind: "error",
          message: "Сохранила dump, но черновой разбор не дал задач. Можно попробовать переформулировать.",
        });
      }
    } catch (error) {
      setAngelLabStatus({
        kind: "error",
        message: error?.message || "Не удалось сохранить dump",
      });
    } finally {
      setAngelLabSaving(false);
      setAngelLabProcessing(false);
    }
  };

  const applyAngelLabTaskCard = async (cardId, withSelectedSteps = false) => {
    const card = angelLabSuggestions.find((item) => item.id === cardId);
    if (!card || card.added) return;

    const candidateText = normalizeAngelLabTranscript(card.title || card.text || "");
    const mode = String(card.mode || "create").toLowerCase();
    const targetTaskId = card.targetTaskId ? String(card.targetTaskId) : null;
    const removeAngelLabCard = () => {
      setAngelLabSuggestions((previous) => previous.filter((item) => item.id !== cardId));
    };
    const restoreAngelLabCard = () => {
      setAngelLabSuggestions((previous) => {
        if (previous.some((item) => item.id === cardId)) return previous;
        return [card, ...previous];
      });
    };

    if (mode === "reject") {
      setAngelLabStatus({
        kind: "error",
        message: "Эта карточка шумная. Ничего не применяла.",
      });
      return;
    }

    const cardSubtasks = Array.isArray(card.subtasks) && card.subtasks.length > 0
      ? card.subtasks
      : (Array.isArray(card.steps) ? card.steps : []);

    const selectedSteps = withSelectedSteps
      ? cardSubtasks
        .filter((step) => isAngelLabDraftStepSelected(step) && !step.added)
        .map((step) => normalizeAngelLabTranscript(step.text))
        .filter(Boolean)
      : [];

    const stepSet = new Set();
    const cleanSteps = [];
    const candidateKey = candidateText.toLowerCase();
    for (const step of selectedSteps) {
      const key = step.toLowerCase();
      if (key === candidateKey) continue;
      if (!key || stepSet.has(key)) continue;
      stepSet.add(key);
      cleanSteps.push(step);
    }

    if (mode === "merge") {
      if (!targetTaskId) {
        setAngelLabStatus({
          kind: "error",
          message: "Не нашла целевую задачу для объединения.",
        });
        return;
      }

      if (!withSelectedSteps) {
        removeAngelLabCard();
        setHighlightTaskId(targetTaskId);
        trackDailyAction();
        setAngelLabHandledStats((previous) => ({ ...previous, added: previous.added + 1 }));
        setAngelLabHandledNotice({
          kind: "success",
          message: `Оставила существующую задачу «${candidateText}» без новых шагов.`,
        });
        setAngelLabStatus({
          kind: "success",
          message: `Похожая задача уже есть («${candidateText}»). Без новых шагов.`,
        });
        return;
      }

      let addedStepsCount = 0;
      removeAngelLabCard();
      setAngelLabStatus({
        kind: "success",
        message: "Применяю выбранные шаги...",
      });
      if (cleanSteps.length > 0) {
        if (isCloudUser) {
          const targetTask = tasksRef.current.find((task) => String(task.id) === String(targetTaskId));
          const existingSubtasks = Array.isArray(targetTask?.subtasks) ? targetTask.subtasks : [];
          const stepsToAdd = [];

          for (const stepText of cleanSteps) {
            const normalizedStep = normalizeAngelLabTranscript(stepText);
            if (!normalizedStep) continue;
            if (normalizedStep.toLowerCase() === normalizeAngelLabTranscript(targetTask?.text || candidateText).toLowerCase()) continue;

            const duplicateInTask = existingSubtasks.some((subtask) => (
              isAngelLabNearDuplicate(subtask.text || "", normalizedStep)
            ));
            if (duplicateInTask) continue;

            const duplicateInAppend = stepsToAdd.some((existingStep) => (
              isAngelLabNearDuplicate(existingStep, normalizedStep)
            ));
            if (duplicateInAppend) continue;

            stepsToAdd.push(normalizedStep);
          }

          addedStepsCount = stepsToAdd.length;
          if (addedStepsCount > 0) {
            try {
              for (let stepIndex = 0; stepIndex < stepsToAdd.length; stepIndex += 1) {
                const stepText = stepsToAdd[stepIndex];
                await runPlannerClientAction({
                  action: PLANNER_ACTIONS.ADD_SUBTASK,
                  source: "web_angel_lab_merge",
                  payload: {
                    taskId: targetTaskId,
                    taskRef: targetTaskId,
                    taskText: targetTask?.text || candidateText,
                    subtaskText: stepText,
                    idempotencyKey: `web_angel_lab_merge_${targetTaskId}_${cardId}_${stepIndex}_${getShortIdempotencyBucket()}`,
                  },
                });
              }
            } catch (error) {
              console.error("[planner-client-actions:web_angel_lab_merge]", error);
              restoreAngelLabCard();
              setAngelLabStatus({
                kind: "error",
                message: "Шаги показаны в карточке, но backend их не добавил. Обнови страницу и попробуй ещё раз.",
              });
              return;
            }
          }
        } else {
          const saved = mutateGuestSingleTask("angel_lab_merge_subtasks", targetTaskId, (task) => {
            const result = appendGuestUniqueSubtasks(task, cleanSteps, {
              markTaskPendingSync,
              withActiveDay,
              normalizeText: normalizeAngelLabTranscript,
              isNearDuplicate: isAngelLabNearDuplicate,
            });
            addedStepsCount = result.addedCount;
            return result.task;
          });

          if (saved) persistTask(saved);
        }
      }

      removeAngelLabCard();

      setHighlightTaskId(targetTaskId);
      trackDailyAction();
      setAngelLabHandledStats((previous) => ({ ...previous, added: previous.added + 1 }));
      setAngelLabHandledNotice({
        kind: "success",
        message: addedStepsCount > 0
          ? `Добавила ${addedStepsCount} шаг(а) в «${candidateText}».`
          : `Новых шагов для «${candidateText}» не было.`,
      });
      setAngelLabStatus({
        kind: "success",
        message: addedStepsCount > 0
          ? `Добавила ${addedStepsCount} шаг(а) в существующую задачу «${candidateText}».`
          : `Похожая задача уже есть («${candidateText}»). Новые шаги не добавлены.`,
      });
      return;
    }

    const removeAngelLabCreateCard = () => {
      removeAngelLabCard();
    };

    const markAngelLabCreateCardAdded = () => {
      removeAngelLabCreateCard();

      setAngelLabStatus({
        kind: "success",
        message: withSelectedSteps
          ? cleanSteps.length > 0
            ? `Задача добавлена с шагами (${cleanSteps.length}).`
            : "Задача добавлена. Шаги не выбраны."
          : "Задача добавлена в план.",
      });
      setAngelLabHandledNotice({
        kind: "success",
        message: withSelectedSteps && cleanSteps.length > 0
          ? `Добавила «${candidateText}» + ${cleanSteps.length} шаг(а).`
          : `Добавила «${candidateText}».`,
      });
      setAngelLabHandledStats((previous) => ({ ...previous, added: previous.added + 1 }));
    };

    const markAngelLabCreateCardAlreadyExists = (existingTask) => {
      removeAngelLabCreateCard();
      if (existingTask?.id) setHighlightTaskId(existingTask.id);
      setAngelLabHandledStats((previous) => ({ ...previous, skipped: previous.skipped + 1 }));
      setAngelLabHandledNotice({
        kind: "success",
        message: `«${existingTask?.text || candidateText}» уже есть, карточку убрала.`,
      });
      setAngelLabStatus({
        kind: "success",
        message: `Такая активная задача уже есть: «${existingTask?.text || candidateText}». Карточку убрала из черновика.`,
      });
    };

    if (isCloudUser) {
      removeAngelLabCreateCard();
      setAngelLabStatus({
        kind: "success",
        message: "Добавляю задачу в план...",
      });
      handleAddTask(candidateText, {
        subtasks: withSelectedSteps ? cleanSteps : [],
        source: "web_angel_lab_create",
        onCloudSuccess: markAngelLabCreateCardAdded,
        onAlreadyExists: markAngelLabCreateCardAlreadyExists,
        onCloudError: () => {
          restoreAngelLabCard();
          setAngelLabStatus({
            kind: "error",
            message: "Не удалось добавить задачу через backend. Карточку вернула в черновик.",
          });
        },
      });
      return;
    }

    let handledExistingTask = false;
    removeAngelLabCreateCard();
    setAngelLabStatus({
      kind: "success",
      message: withSelectedSteps
        ? cleanSteps.length > 0
          ? `Добавляю задачу с шагами (${cleanSteps.length})...`
          : "Добавляю задачу. Шаги не выбраны..."
        : "Добавляю задачу в план...",
    });
    handleAddTask(candidateText, {
      subtasks: withSelectedSteps ? cleanSteps : [],
      onAlreadyExists: (existingTask) => {
        handledExistingTask = true;
        markAngelLabCreateCardAlreadyExists(existingTask);
      },
    });

    if (!handledExistingTask) {
      markAngelLabCreateCardAdded();
    }
  };

  const handleAngelLabAddTaskOnly = (cardId) => {
    applyAngelLabTaskCard(cardId, false);
  };

  const handleAngelLabAddTaskWithSteps = (cardId) => {
    applyAngelLabTaskCard(cardId, true);
  };

  const handleAngelLabDismissTask = (cardId) => {
    const card = angelLabSuggestions.find((item) => item.id === cardId);
    const title = normalizeAngelLabTranscript(card?.title || card?.text || "");
    setAngelLabSuggestions((previous) => previous.filter((item) => item.id !== cardId));
    setAngelLabHandledStats((previous) => ({ ...previous, skipped: previous.skipped + 1 }));
    setAngelLabHandledNotice({
      kind: "skip",
      message: title ? `Пропустила «${title}».` : "Карточка пропущена.",
    });
    setAngelLabStatus({ kind: "success", message: "Карточка убрана." });
  };

  const handleAngelLabToggleStep = (cardId, stepId) => {
    setAngelLabSuggestions((previous) => previous.map((item) => {
      if (item.id !== cardId || item.added) return item;
      return {
        ...item,
        steps: (item.steps || []).map((step) => {
          if (step.id !== stepId || step.added) return step;
          return {
            ...step,
            selected: !isAngelLabDraftStepSelected(step),
          };
        }),
        subtasks: (item.subtasks || []).map((step) => {
          if (step.id !== stepId || step.added) return step;
          return {
            ...step,
            selected: !isAngelLabDraftStepSelected(step),
          };
        }),
      };
    }));
  };

  const handleResurrect = (taskId) => {
    if (runCloudTaskAction({
      action: PLANNER_ACTIONS.REOPEN_TASK,
      taskId,
      source: "web_reopen",
      pendingMessage: language === "en" ? "Returning to Active through backend..." : "Возвращаю задачу в активные через backend...",
      successMessage: language === "en" ? "Task is active again." : "Задача снова активна.",
      optimisticMutator: (task) => (
        reopenGuestTask(task, {
          markTaskPendingSync,
          getNextTaskOrder,
          tasks: tasksRef.current,
          taskId,
          defaultTaskHeat: DEFAULT_TASK_HEAT,
        })
      ),
    })) {
      trackDailyAction();
      return;
    }

    const saved = mutateGuestSingleTask("reopen_task", taskId, (task) => (
      reopenGuestTask(task, {
        markTaskPendingSync,
        getNextTaskOrder,
        tasks: tasksRef.current,
        taskId,
        defaultTaskHeat: DEFAULT_TASK_HEAT,
      })
    ));
    if (!saved) return;
    const newScore = score - 2;
    setScore(newScore);
    persistTask(saved);
    persistScore(newScore);
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const handleReopenCompleted = (taskId) => {
    if (runCloudTaskAction({
      action: PLANNER_ACTIONS.REOPEN_TASK,
      taskId,
      source: "web_reopen",
      pendingMessage: language === "en" ? "Returning to Active through backend..." : "Возвращаю задачу в активные через backend...",
      successMessage: language === "en" ? "Task is active again." : "Задача снова активна.",
      optimisticMutator: (task) => (
        reopenGuestTask(task, {
          markTaskPendingSync,
          getNextTaskOrder,
          tasks: tasksRef.current,
          taskId,
          defaultTaskHeat: DEFAULT_TASK_HEAT,
        })
      ),
    })) {
      trackDailyAction();
      flashCompanion("angel", ANGEL_RESURRECT_PHRASES);
      return;
    }

    const saved = mutateGuestSingleTask("reopen_completed_task", taskId, (task) => (
      reopenGuestTask(task, {
        markTaskPendingSync,
        getNextTaskOrder,
        tasks: tasksRef.current,
        taskId,
        defaultTaskHeat: DEFAULT_TASK_HEAT,
      })
    ));
    if (!saved) return;
    const newScore = score - 10;
    setScore(newScore);
    persistTask(saved);
    persistScore(newScore);
    setHighlightTaskId(taskId);
    trackDailyAction();
    flashCompanion("angel", ANGEL_RESURRECT_PHRASES);
  };

  const handleTrashCompleted = (taskId) => {
    if (runCloudTaskAction({
      action: PLANNER_ACTIONS.KILL_TASK,
      taskId,
      source: "web_trash_completed",
      pendingMessage: language === "en" ? "Moving from Heaven to Cemetery through backend..." : "Переношу из рая на кладбище через backend...",
      successMessage: language === "en" ? "Task moved from Heaven to Cemetery." : "Задача перенесена из рая на кладбище.",
      optimisticMutator: (task) => (
        moveGuestTaskToCemetery(task, {
          markTaskPendingSync,
          getNextTaskOrder,
          tasks: tasksRef.current,
          taskId,
        })
      ),
    })) {
      flashCompanion("devil", DEVIL_KILL_PHRASES);
      return;
    }

    const saved = mutateGuestSingleTask("trash_completed_task", taskId, (task) => (
      moveGuestTaskToCemetery(task, {
        markTaskPendingSync,
        getNextTaskOrder,
        tasks: tasksRef.current,
        taskId,
      })
    ));
    if (!saved) return;
    persistTask(saved);
    setScore((prev) => {
      const next = prev - 10;
      persistScore(next);
      return next;
    });
    recordPlannerEvent({
      type: "task_dead",
      actor: "devil",
      source: "trash_completed",
      taskId: saved.id,
      taskText: saved.text,
      message: `Чёртик убрал из рая «${saved.text || "задачу"}» на кладбище.`,
      createdAt: saved.deadAt || Date.now(),
    });
    setNudgeStatus("Убрала задачу из рая в мусор.");
  };

  const handleCleanHeavenJunk = () => {
    const completed = completedTasks;
    if (completed.length === 0) {
      setNudgeStatus("В раю пока нечего чистить.");
      return;
    }

    const junk = completed.filter((task) => isHeavenJunkTaskText(task.text));
    const eligible = junk.filter((task) => isEligibleHeavenJunkTask(task));
    const protectedCount = junk.length - eligible.length;

    if (eligible.length === 0) {
      setNudgeStatus("Тестового мусора в раю не нашла.");
      return;
    }

    if (isCloudUser) {
      const taskIds = eligible.map((task) => String(task.id)).filter(Boolean);
      const suffix = protectedCount > 0 ? ` (${protectedCount} защищены)` : "";
      setNudgeStatus("Очищаю рай через backend.");
      runPlannerClientAction({
        action: PLANNER_ACTIONS.BULK_MOVE_COMPLETED_TO_CEMETERY,
        source: "web_heaven_junk_clean",
        payload: {
          taskIds,
          protectedCount,
          idempotencyKey: `web_heaven_junk_clean_${taskIds.join("_")}_${getShortIdempotencyBucket()}`,
        },
      }).then((data) => {
        setNudgeStatus(`Рай очищен: убрала ${taskIds.length} мусорных задач${suffix}.`);
        flashCompanion("devil", DEVIL_AUTO_CLEAN_PHRASES);
      }).catch((error) => {
        console.warn("[Planner] Backend heaven clean failed:", error);
        setNudgeStatus("Backend не очистил рай. Попробуй ещё раз.");
      });
      return;
    }

    runGuestOnlyBulkOperation("bulk_move_completed_to_cemetery", () => {
      const result = moveGuestTasksToCemetery(
        tasksRef.current,
        eligible.map((task) => task.id),
        {
          markTaskPendingSync,
          startDeadOrder: getNextTaskOrder(tasksRef.current, "dead"),
        },
      );

      if (result.movedTasks.length === 0) return 0;

      commitTasks(result.tasks);
      result.movedTasks.forEach((task) => persistTask(task));
      setScore((prev) => {
        const next = prev - result.movedTasks.length * 10;
        persistScore(next);
        return next;
      });
      const suffix = protectedCount > 0 ? ` (${protectedCount} защищены)` : "";
      setNudgeStatus(`Рай очищен: убрала ${result.movedTasks.length} мусорных задач${suffix}.`);
      result.movedTasks.forEach((task) => {
        recordPlannerEvent({
          type: "task_dead",
          actor: "devil",
          source: "heaven_junk_clean",
          taskId: task.id,
          taskText: task.text,
          message: `Чёртик выкинул мусорную задачу «${task.text || "без названия"}» на кладбище.`,
          createdAt: task.deadAt || Date.now(),
        });
      });
      flashCompanion("devil", DEVIL_AUTO_CLEAN_PHRASES);
      return result.movedTasks.length;
    }, "heaven_junk_clean");
  };

  const handlePurgeHeavenJunk = () => {
    const completed = completedTasks;
    if (completed.length === 0) {
      setNudgeStatus("В раю пока нечего чистить.");
      return;
    }

    const junk = completed.filter((task) => isHeavenJunkTaskText(task.text));
    const eligible = junk.filter((task) => isEligibleHeavenJunkTask(task));
    const protectedCount = junk.length - eligible.length;

    if (eligible.length === 0) {
      setNudgeStatus("Тестового мусора в раю не нашла.");
      return;
    }

    if (isCloudUser) {
      const taskIds = eligible.map((task) => String(task.id)).filter(Boolean);
      const suffix = protectedCount > 0 ? ` (${protectedCount} защищены)` : "";
      setNudgeStatus("Отправляю мусор из рая в небытие через backend.");
      runPlannerClientAction({
        action: PLANNER_ACTIONS.DELETE_TASK_FOREVER,
        source: "web_heaven_junk_purge",
        payload: {
          taskIds,
          idempotencyKey: `web_heaven_junk_purge_${taskIds.join("_")}_${getShortIdempotencyBucket()}`,
        },
      }).then((data) => {
        setNudgeStatus(`Отправила в небытие ${taskIds.length} задач${suffix}.`);
      }).catch((error) => {
        console.warn("[Planner] Backend heaven purge failed:", error);
        setNudgeStatus("Backend не удалил задачи навсегда. Попробуй ещё раз.");
      });
      return;
    }

    runGuestOnlyBulkOperation("purge_heaven_junk", () => {
    const result = removeGuestTasksById(tasksRef.current, eligible.map((task) => task.id));
    commitTasks(result.tasks);

    setScore((prev) => {
      const next = prev - result.removedTasks.length * 10;
      persistScore(next);
      return next;
    });

    const suffix = protectedCount > 0 ? ` (${protectedCount} защищены)` : "";
    setNudgeStatus(`Отправила в небытие ${result.removedTasks.length} задач${suffix}.`);
    return result.removedTasks.length;
    }, "heaven_junk_purge");
  };

  const handleDeleteForever = (taskId) => {
    const currentTasks = tasksRef.current.some((task) => String(task.id) === String(taskId))
      ? tasksRef.current
      : tasks;
    const target = currentTasks.find((task) => String(task.id) === String(taskId));
    if (!target) return;

    if (isCloudUser) {
      setNudgeStatus("Отправляю задачу в небытие через backend.");
      const optimistic = applyOptimisticCloudTaskRemoval([taskId]);
      runPlannerClientAction({
        action: PLANNER_ACTIONS.DELETE_TASK_FOREVER,
        source: "web_delete_forever",
        payload: {
          taskId,
          taskRef: taskId,
          taskText: target.text,
          idempotencyKey: `web_delete_forever_${taskId}_${getShortIdempotencyBucket()}`,
        },
      }).then((data) => {
        if (!data?.__appliedState) {
          applyPlannerClientState(data);
        }
        const rawServerTask = getRawResponseTask(data, taskId);
        if (!rawServerTask) {
          pendingCloudRemovalTimestamps.delete(String(taskId));
        }
        setNudgeStatus("Задача отправлена в небытие.");
      }).catch((error) => {
        let appliedErrorState = error?.__appliedState || null;
        if (!appliedErrorState && error?.payload && typeof error.payload === "object") {
          appliedErrorState = applyPlannerClientState(error.payload);
        }
        if (!appliedErrorState && optimistic?.rollback) {
          optimistic.rollback();
        }
        console.warn("[Planner] Backend delete forever failed:", error);
        setNudgeStatus("Backend не удалил задачу. Попробуй ещё раз.");
      });
      return;
    }

    runGuestOnlyBulkOperation("delete_task_forever", () => {
    const result = removeGuestTasksById(currentTasks, [taskId]);
    commitTasks(result.tasks);

    if (target.status === "completed") {
      setScore((prev) => {
        const next = prev - 10;
        persistScore(next);
        return next;
      });
    }

    setNudgeStatus("Задача отправлена в небытие.");
    return true;
    }, taskId);
  };

  const handleLoadSnapshots = async () => {
    if (!user?.id || snapshotLoading) return;
    setSnapshotLoading(true);
    const list = await loadTaskSnapshots(user.id);
    setSnapshots(list);
    setSnapshotLoading(false);
  };

  const handleCreateSnapshot = async () => {
    if (!user?.id) return;
    setSnapshotLoading(true);
    try {
      if (isCloudUser) {
        await runPlannerClientAction({
          action: PLANNER_ACTIONS.CREATE_SNAPSHOT,
          source: "web_snapshot_create",
          payload: {
            snapshotSource: "manual_web",
            reason: "manual_snapshot",
            idempotencyKey: `web_snapshot_create_${user.id}_${getShortIdempotencyBucket()}`,
          },
        });
        await handleLoadSnapshots();
        return;
      }
      await runGuestOnlyBulkOperation("create_snapshot", async () => {
        return createGuestTaskSnapshot({
          userId: user.id,
          tasks,
          score,
          saveTaskSnapshot,
          loadSnapshots: handleLoadSnapshots,
        });
      }, user.id);
    } catch (e) {
      console.error("Snapshot save failed:", e);
      setSnapshotLoading(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget || !user?.id) return;
    const snapshotTasks = restoreTarget.tasks || [];
    setSnapshotLoading(true);
    try {
      if (isCloudUser) {
        await runPlannerClientAction({
          action: PLANNER_ACTIONS.RESTORE_SNAPSHOT,
          source: "web_snapshot_restore",
          payload: {
            snapshotId: restoreTarget.id,
            idempotencyKey: `web_snapshot_restore_${restoreTarget.id}_${getShortIdempotencyBucket()}`,
          },
        });
        setNudgeStatus(language === "en" ? "Snapshot restored through backend." : "Снапшот восстановлен через backend.");
        setRestoreTarget(null);
        setSnapshots(null);
        setSnapshotLoading(false);
        return;
      }

      await runGuestOnlyBulkOperation("restore_snapshot", async () => {
        const { restoreFromSnapshot } = await import("./firestoreUtils");
        const result = await restoreGuestTaskSnapshot({
          userId: user.id,
          currentTasks: tasks,
          currentScore: score,
          snapshot: restoreTarget,
          saveTaskSnapshot,
          restoreFromSnapshot,
          normalizeTask: markTaskFromCloud,
        });
        if (result.restored) {
          commitTasks(result.tasks);
          setScore(result.score);
          persistScore(result.score);
        }
        return result.restored;
      }, user.id);
    } catch (e) {
      console.error("Restore failed:", e);
    }
    setRestoreTarget(null);
    setSnapshots(null); // will reload next open
    setSnapshotLoading(false);
  };

  const handleToggleToday = (taskId) => {
    let message = "";
    const cloudTask = tasksRef.current.find((task) => String(task.id) === String(taskId));
    if (cloudTask && isCloudUser) {
      const currentTodayCount = tasksRef.current.filter((task) => task.status === "active" && task.isToday).length;
      const nextValue = !cloudTask.isToday;
      if (nextValue && currentTodayCount >= 3) {
        message = language === "en"
          ? "You can pin at most 3 tasks for today. Otherwise the list gets blurry again."
          : "На сегодня можно закрепить максимум 3 задачи. Иначе список снова расползётся.";
        setNudgeStatus(message);
        flashCompanion(
          "angel",
          language === "en"
            ? [
              "Stop. Three is already a real plan. Unpin something before adding more.",
              "More than three and the list melts again. I believe in you, not in that list.",
              "Three tasks for today is a plan. Four is anxiety. Unpin one.",
            ]
            : [
              "Стоп. Три задачи — это уже настоящий план. Сначала сними одну.",
              "Больше трёх — и список снова расплывётся. Я верю в тебя, не в этот список.",
              "Три задачи на сегодня — план. Четыре — тревога. Сними одну.",
            ],
        );
        return;
      }

      message = nextValue
        ? (language === "en" ? "Task added to today's shortlist." : "Задача попала в шортлист на сегодня.")
        : (language === "en" ? "Task removed from today's manual list." : "Задача снята с ручного списка на сегодня.");

      if (runCloudTaskPayloadAction({
        action: nextValue ? "set_today" : "unset_today",
        taskId,
        source: "web_today",
        payload: {
          idempotencyKey: `web_today_${cloudTask.id}_${nextValue ? "set" : "unset"}_${getShortIdempotencyBucket()}`,
        },
        optimisticMutator: (task) => (
          toggleGuestToday(task, tasksRef.current, {
            markTaskPendingSync,
            todayLimit: 3,
          }).task
        ),
        successMessage: message,
        errorMessage: "Шортлист не сохранился через backend. Обнови страницу и попробуй ещё раз.",
      })) {
        setHighlightTaskId(taskId);
        return;
      }

      if (blockCloudLocalFallback("toggle_today", taskId)) return;
    }

    const saved = mutateGuestSingleTask("toggle_today", taskId, (task, currentTasks) => {
      const result = toggleGuestToday(task, currentTasks, {
        markTaskPendingSync,
        todayLimit: 3,
      });

      if (result.limitHit) {
        message = language === "en"
          ? "You can pin at most 3 tasks for today. Otherwise the list gets blurry again."
          : "На сегодня можно закрепить максимум 3 задачи. Иначе список снова расползётся.";
        return null;
      }

      message = result.nextValue
        ? (language === "en" ? "Task added to today's shortlist." : "Задача попала в шортлист на сегодня.")
        : (language === "en" ? "Task removed from today's manual list." : "Задача снята с ручного списка на сегодня.");

      return result.task;
    });
    if (saved) {
      persistTask(saved);
    }
    if (message) setNudgeStatus(message);
    if (!message.includes(language === "en" ? "at most 3" : "максимум 3")) {
      setHighlightTaskId(taskId);
    } else {
      flashCompanion(
        "angel",
        language === "en"
          ? [
            "Stop. Three is already a real plan. Unpin something before adding more.",
            "More than three and the list melts again. I believe in you, not in that list.",
            "Three tasks for today is a plan. Four is anxiety. Unpin one.",
          ]
          : [
            "Стоп-стоп-стоп! Три — это уже подвиг. Открепи что-то, чтобы добавить новое 😇",
            "Больше трёх — и всё снова расползётся. Я верю в тебя, но не в этот список! 🙏",
            "Три задачи на сегодня — это план. Четыре — это тревога. Открепи одну! ✨",
          ]
      );
    }
  };

  const handleQuickRescue = () => {
    if (!rescueTask) return;
    setDismissedMissionBubbleTaskId(String(rescueTask.id));
    rememberMissionBubbleCooldown(rescueTask.id);
    if (todayMissionResistanceSession) {
      clearAngelEntryResistance(todayMissionResistanceSession);
    }
    appendExecutiveStateLog({
      state: executiveState || "stuck",
      action: "rescue_started",
      taskId: rescueTask.id,
      taskTitle: rescueTask.text || rescueTask.title || "",
      source: "executive_state_layer",
    });
    openPanicMode(rescueTask, { autoStartTimer: true, source: "web_quick_rescue_started" });
    setNudgeStatus(language === "en" ? "Opening a rescue session: one task, one microstep." : "Открываю rescue-сессию: одна задача и один микрошаг.");
  };

  const handleExecutiveControlRescue = () => {
    const suggestion = executiveControlSuggestion;
    if (!suggestion?.task) {
      handleQuickRescue();
      return;
    }
    appendExecutiveStateLog({
      state: executiveState || "stuck",
      action: "control_task_rescue_started",
      taskId: suggestion.taskId,
      taskTitle: suggestion.taskTitle,
      stepText: suggestion.stepText,
      source: "executive_state_layer",
    });
    openPanicMode(suggestion.task, {
      stepOverride: suggestion.stepText,
      autoStartTimer: true,
      source: "web_executive_rescue_started",
    });
    setNudgeStatus(
      language === "en"
        ? `Angel chose “${suggestion.taskTitle}”. Starting with one control-restoring step.`
        : `Ангел выбрал «${suggestion.taskTitle}». Начинаем с одного шага, который вернёт контроль.`
    );
  };

  const handleExecutiveAddControlStepAndRescue = () => {
    const suggestion = executiveControlSuggestion;
    if (!suggestion?.task) {
      handleQuickRescue();
      return;
    }
    if (suggestion.shouldAddStep && suggestion.stepText) {
      handleAddSubtask(suggestion.taskId, suggestion.stepText);
    }
    appendExecutiveStateLog({
      state: executiveState || "stuck",
      action: suggestion.shouldAddStep ? "control_step_added_and_rescue_started" : "control_task_rescue_started",
      taskId: suggestion.taskId,
      taskTitle: suggestion.taskTitle,
      stepText: suggestion.stepText,
      source: "executive_state_layer",
    });
    openPanicMode(suggestion.task, {
      stepOverride: suggestion.stepText,
      autoStartTimer: true,
      source: "web_executive_rescue_started",
    });
    setNudgeStatus(
      language === "en"
        ? `Added the first step and opened rescue for “${suggestion.taskTitle}”.`
        : `Добавила первый шаг и открыла rescue по «${suggestion.taskTitle}».`
    );
  };

  const handleExecutiveStateSelect = (state) => {
    if (!EXECUTIVE_STATE_COPY[state]) return;
    setAngelLabExecutiveAssessment(null);
    setExecutiveState(state);
    setExecutivePlannerOpen(!isRescueFirstExecutiveState(state));
    setExecutiveLayerDismissed(false);
    persistExecutiveState(state);
    appendExecutiveStateLog({
      state,
      action: "selected",
      source: isDemoRoute ? "demo" : "web",
    });
    setNudgeStatus(
      language === "en"
        ? `Executive state set: ${EXECUTIVE_STATE_COPY[state].en.label}.`
        : `Режим выбран: ${EXECUTIVE_STATE_COPY[state].ru.label}.`
    );
  };

  const handleExecutiveLayerDismiss = () => {
    setExecutiveState("");
    setExecutivePlannerOpen(false);
    setExecutiveLayerDismissed(true);
    setAngelLabExecutiveAssessment(null);
    try {
      localStorage.removeItem(EXECUTIVE_STATE_STORAGE_KEY);
    } catch (error) {
      console.warn("[Planner] Не удалось очистить executive state:", error);
    }
    setNudgeStatus(
      language === "en"
        ? "Executive State Layer is hidden. Use Brain state to bring it back."
        : "Executive State Layer скрыт. Вернуть можно кнопкой Brain state."
    );
  };

  const handleExecutiveLayerEnable = () => {
    const nextState = executiveState || "stuck";
    setExecutiveState(nextState);
    setExecutivePlannerOpen(!isRescueFirstExecutiveState(nextState));
    setExecutiveLayerDismissed(false);
    persistExecutiveState(nextState);
    appendExecutiveStateLog({
      state: nextState,
      action: "enabled",
      source: isDemoRoute ? "demo" : "web",
    });
    setNudgeStatus(
      language === "en"
        ? `Brain state layer is back: ${EXECUTIVE_STATE_COPY[nextState].en.label}.`
        : `Слой состояния вернулся: ${EXECUTIVE_STATE_COPY[nextState].ru.label}.`
    );
  };

  const handleExecutiveShowPlanner = () => {
    setExecutivePlannerOpen(true);
    setActiveTab("active");
    appendExecutiveStateLog({
      state: executiveState || "normal",
      action: "show_full_planner",
      source: isDemoRoute ? "demo" : "web",
    });
    window.setTimeout(() => {
      plannerContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const handleAngelEntryDismiss = () => {
    if (!visibleAngelEntrySession) return;
    setDismissedAngelEntryId(String(visibleAngelEntrySession.id || ""));
    rememberAngelEntryCooldown(visibleAngelEntrySession, getAngelEntryDismissCooldownMs(visibleAngelEntrySession));
    const resistanceCount = rememberAngelEntryResistance(visibleAngelEntrySession);
    const relationMemory = rememberQuestRelationSignal(visibleAngelEntrySession, "not_now", {
      source: "angel_entry_dismiss",
    });
    appendExecutiveStateLog({
      state: executiveState || "stuck",
      action: "angel_entry_dismissed",
      trigger: visibleAngelEntrySession.trigger || "",
      mode: visibleAngelEntrySession.mode || "",
      taskId: visibleAngelEntrySession.taskId || "",
      resistanceCount,
      relationSignal: relationMemory?.lastSignal || "",
      relationStrategy: relationMemory?.lastStrategy || "",
      source: "angel_entry_session",
    });
    if (resistanceCount >= ANGEL_ENTRY_RESISTANCE_THRESHOLD && visibleAngelEntrySession?.taskId) {
      setDismissedAngelEntryId("");
      setNudgeStatus(language === "en"
        ? "Angel noticed this quest keeps resisting. Switching to sticky diagnosis."
        : "Ангел заметил, что квест сопротивляется. Переключаюсь на диагностику липкого места.");
      return;
    }
    setNudgeStatus(
      language === "en"
        ? "Angel entry dismissed for now."
        : "Вход ангела скрыт на сейчас."
    );
  };

  const handleAngelEntryShowPlanner = () => {
    if (visibleAngelEntrySession?.id) {
      setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
      rememberAngelEntryCooldown(visibleAngelEntrySession, ANGEL_ENTRY_SHOW_PLANNER_COOLDOWN_MS);
      clearAngelEntryResistance(visibleAngelEntrySession);
      appendExecutiveStateLog({
        state: executiveState || "normal",
        action: "angel_entry_opened_full_planner",
        trigger: visibleAngelEntrySession.trigger || "",
        mode: visibleAngelEntrySession.mode || "",
        taskId: visibleAngelEntrySession.taskId || "",
        source: "angel_entry_session",
      });
    }
    handleExecutiveShowPlanner();
  };

  const focusClarificationTask = () => {
    const task = clarificationTask;
    if (!task) return;
    setActiveTab(task.status === "dead"
      ? "dead"
      : task.status === "completed"
        ? "completed"
        : "active");
    setHighlightTaskId(task.id);
    setRequestedTuneTaskId(task.id);
    schedulePlannerContentScroll();
  };

  const normalizeStepForComparison = (value = "") => String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  const getSuggestedStepHistory = (prompt = {}) => {
    const rawHistory = Array.isArray(prompt.suggestedStepHistory)
      ? prompt.suggestedStepHistory
      : [];
    return Array.from(new Set([
      ...rawHistory,
      prompt.previousSuggestedStep,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => normalizeStepForComparison(value))
      .filter(Boolean)));
  };

  const pickFirstNewSuggestion = (candidates = [], prompt = {}) => {
    const normalizedHistory = new Set(getSuggestedStepHistory(prompt));
    const usableCandidates = candidates
      .map((candidate) => String(candidate || "").trim())
      .filter(Boolean);
    return usableCandidates.find((candidate) => !normalizedHistory.has(normalizeStepForComparison(candidate))) ||
      usableCandidates[0] ||
      "";
  };

  const pickFirstNewSuggestionObject = (candidates = [], prompt = {}) => {
    const normalizedHistory = new Set(getSuggestedStepHistory(prompt));
    const usableCandidates = candidates.filter((candidate) => String(candidate?.text || "").trim());
    return usableCandidates.find((candidate) => !normalizedHistory.has(normalizeStepForComparison(candidate.text))) ||
      usableCandidates[0] ||
      { text: "", subtaskId: "", source: "empty_suggestion" };
  };

  const detectClarificationLanguage = (prompt = {}, reason = "") => {
    const combined = [
      prompt.taskTitle,
      prompt.confusionLabel,
      prompt.confusion,
      reason,
    ].map((value) => String(value || "")).join(" ");
    if (/[А-Яа-яЁё]/.test(combined)) return "ru";
    if (/[A-Za-z]/.test(combined)) return "en";
    return language || "auto";
  };

  const buildShrinkFallbackSuggestion = (prompt = {}) => {
    const task = tasksRef.current.find((item) => String(item.id) === String(prompt.taskId)) ||
      tasks.find((item) => String(item.id) === String(prompt.taskId)) ||
      null;
    const candidates = [];
    if (Array.isArray(task?.subtasks)) {
      task.subtasks
        .filter((subtask) => !subtask.completed && String(subtask.text || "").trim())
        .forEach((subtask) => {
          candidates.push({
            text: String(subtask.text).trim(),
            subtaskId: subtask.id || "",
            source: "existing_open_subtask",
          });
        });
    }
    const explicitNextStep = String(
      task?.nextAction ||
      task?.next_action ||
      task?.nextStep ||
      task?.next_step ||
      ""
    ).trim();
    if (explicitNextStep) {
      candidates.push({
        text: explicitNextStep,
        subtaskId: "",
        source: "task_next_action",
      });
    }
    const panicPlanForTask = task ? buildPanicPlan(task, language) : null;
    if (Array.isArray(panicPlanForTask?.steps)) {
      panicPlanForTask.steps
        .map((step) => String(step || "").trim())
        .filter(Boolean)
        .forEach((step) => {
          candidates.push({
            text: step,
            subtaskId: "",
            source: "panic_plan",
          });
        });
    }
    candidates.push({
      text: language === "en"
        ? "Open the quest and do one visible 2-minute piece."
        : "Открыть квест и сделать один видимый кусок за 2 минуты.",
      subtaskId: "",
      source: "generic_shrink_fallback",
    });
    candidates.push({
      text: language === "en"
        ? "Do the smallest ugly version for 2 minutes."
        : "Сделать самый маленький кривой вариант за 2 минуты.",
      subtaskId: "",
      source: "generic_shrink_fallback_retry",
    });
    return pickFirstNewSuggestionObject(candidates, prompt);
  };

  const buildShrinkFallbackStep = (prompt = {}) => {
    const suggestion = buildShrinkFallbackSuggestion(prompt);
    return suggestion.text || "";
  };

  const buildClarificationFallbackStep = (prompt = {}, reason = "") => {
    const task = tasksRef.current.find((item) => String(item.id) === String(prompt.taskId)) ||
      tasks.find((item) => String(item.id) === String(prompt.taskId)) ||
      null;
    const reasonKey = String(reason || prompt.confusion || "").trim().toLowerCase();
    const openSubtasks = Array.isArray(task?.subtasks)
      ? task.subtasks
        .filter((subtask) => !subtask.completed && String(subtask.text || "").trim())
        .map((subtask) => String(subtask.text || "").trim())
      : [];
    const explicitNextStep = String(
      task?.nextAction ||
      task?.next_action ||
      task?.nextStep ||
      task?.next_step ||
      ""
    ).trim();
    const panicPlanForTask = task ? buildPanicPlan(task, language) : null;
    const rescueSteps = Array.isArray(panicPlanForTask?.steps)
      ? panicPlanForTask.steps.map((step) => String(step || "").trim()).filter(Boolean)
      : [];
    const existingCandidates = [
      ...openSubtasks,
      explicitNextStep,
      ...rescueSteps,
    ].filter(Boolean);

    if (reasonKey.includes("options")) {
      return pickFirstNewSuggestion([
        language === "en"
          ? "Pick one option and ignore the rest for 2 minutes."
          : "Выбрать один вариант и 2 минуты игнорировать остальные.",
        language === "en"
          ? "Write down only two possible options, then stop."
          : "Записать только два возможных варианта и остановиться.",
        language === "en"
          ? "Choose the least annoying option as a temporary default."
          : "Выбрать наименее бесячий вариант как временный.",
      ], prompt);
    }
    if (reasonKey.includes("done")) {
      return pickFirstNewSuggestion([
        language === "en"
          ? "Write one sentence: what would count as done enough?"
          : "Записать одной фразой, что будет считаться достаточно готовым.",
        language === "en"
          ? "Name the smallest version that would be acceptable."
          : "Назвать самый маленький вариант, который уже приемлем.",
        language === "en"
          ? "Decide what can stay imperfect for now."
          : "Решить, что пока может остаться несовершенным.",
      ], prompt);
    }
    if (reasonKey.includes("first_step")) {
      return pickFirstNewSuggestion([
        ...existingCandidates,
        language === "en"
          ? "Write the first physical action this quest needs."
          : "Записать первое физическое действие для этого квеста.",
        language === "en"
          ? "Find the object, tab, document, or place where this starts."
          : "Найти предмет, вкладку, документ или место, где это начинается.",
      ], prompt);
    }
    if (reasonKey.includes("start")) {
      return pickFirstNewSuggestion([
        ...existingCandidates,
        language === "en"
          ? "Open the quest and write where the next visible move starts."
          : "Открыть квест и записать, с какого видимого движения начать.",
        language === "en"
          ? "Point to the first visible surface this quest lives on."
          : "Назвать первую видимую поверхность, где живёт этот квест.",
      ], prompt);
    }
    return pickFirstNewSuggestion([
      ...existingCandidates,
      language === "en"
        ? "Write one messy note: what would make this quest easier to start?"
        : "Записать одной кривой фразой, что сделало бы этот квест легче начать.",
      language === "en"
        ? "Write the part that feels most unclear in five words."
        : "Записать пятью словами, какая часть самая мутная.",
    ], prompt);
  };

  const requestAiClarificationStep = async (prompt = {}, reason = "") => {
    let idToken = "";
    try {
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
    } catch (error) {
      idToken = "";
    }
    if (!idToken) return null;

    const response = await fetch("/api/planner-client-actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        mode: PLANNER_CLIENT_MODES.CLARIFY_STEP,
        taskTitle: prompt.taskTitle || "",
        confusion: reason || prompt.confusionLabel || prompt.confusion || "",
        language: detectClarificationLanguage(prompt, reason),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || "Clarification step request failed");
    }
    const clarifyStep = payload?.clarifyStep || {};
    const step = String(clarifyStep.step || "").trim();
    if (!step) return null;
    return {
      text: step,
      source: String(clarifyStep.source || "clarify_step_api"),
      rationale: String(clarifyStep.rationale || "").trim(),
    };
  };

  const requestClarificationStep = async (reason = "", promptOverride = null) => {
    const activeClarificationPrompt = promptOverride || clarificationPrompt;
    if (!activeClarificationPrompt?.taskId) return;
    const normalizedReason = String(reason || activeClarificationPrompt.confusion || "").trim();
    const isTooBig = String(activeClarificationPrompt.mode || "").trim() === "too_big"
      || normalizedReason === "too_big";
    const suggestedStepHistory = Array.isArray(activeClarificationPrompt.suggestedStepHistory)
      ? activeClarificationPrompt.suggestedStepHistory
      : [];
    setClarificationPrompt((previous) => previous
      ? {
          ...previous,
          mode: activeClarificationPrompt.mode || previous.mode || (isTooBig ? "too_big" : ""),
          loading: true,
          confusion: normalizedReason || previous.confusion || "",
          confusionLabel: activeClarificationPrompt.confusionLabel || previous.confusionLabel || (isTooBig
            ? (language === "en" ? "too big" : "слишком большое")
            : ""),
          suggestedStep: "",
          suggestedStepHistory,
        }
      : {
          ...activeClarificationPrompt,
          mode: activeClarificationPrompt.mode || (isTooBig ? "too_big" : ""),
          loading: true,
          confusion: normalizedReason || "",
          confusionLabel: activeClarificationPrompt.confusionLabel || (isTooBig
            ? (language === "en" ? "too big" : "слишком большое")
            : ""),
          suggestedStep: "",
          suggestedStepHistory,
        });
    setNudgeStatus(isTooBig
      ? (language === "en"
        ? "Angel is shrinking the quest into one small move..."
        : "Ангел сжимает квест до одного маленького хода...")
      : (language === "en"
        ? "Angel is shrinking the fog into one step..."
        : "Ангел сжимает туман до одного шага..."));

    if (isTooBig) {
      const shrinkSuggestion = buildShrinkFallbackSuggestion(activeClarificationPrompt);
      rememberQuestRelationSignal({
        id: `clarification_${activeClarificationPrompt.taskId}`,
        taskId: activeClarificationPrompt.taskId,
        taskTitle: activeClarificationPrompt.taskTitle,
        mode: activeClarificationPrompt.mode || "too_big",
        trigger: "clarification_step_suggested",
      }, "too_big", {
        source: "shrink_flow_suggested_step",
        confusion: normalizedReason || "too_big",
        confusionLabel: activeClarificationPrompt.confusionLabel || (language === "en" ? "too big" : "слишком большое"),
        suggestedStep: shrinkSuggestion.text || "",
        subtaskId: shrinkSuggestion.subtaskId || "",
        stepSource: shrinkSuggestion.source || "client_shrink_fallback",
      });
      setClarificationPrompt((previous) => previous
        ? {
            ...previous,
            loading: false,
            suggestedStep: shrinkSuggestion.text || "",
            suggestedSubtaskId: shrinkSuggestion.subtaskId || "",
            suggestionSource: shrinkSuggestion.source || "client_shrink_fallback",
            suggestedStepHistory,
          }
        : previous);
      return;
    }

    let clarifySuggestion = null;
    try {
      clarifySuggestion = await requestAiClarificationStep(activeClarificationPrompt, normalizedReason);
    } catch (error) {
      clarifySuggestion = null;
    }
    const clarifySuggestionText = String(clarifySuggestion?.text || "").trim();
    const clarifySuggestionRepeats = clarifySuggestionText
      ? getSuggestedStepHistory(activeClarificationPrompt).includes(normalizeStepForComparison(clarifySuggestionText))
      : false;
    const clarifyStep = String(
      clarifySuggestionText && !clarifySuggestionRepeats
        ? clarifySuggestionText
        : buildClarificationFallbackStep(activeClarificationPrompt, normalizedReason)
    ).trim();
    const clarifyStepSource = clarifySuggestionText && !clarifySuggestionRepeats
      ? (clarifySuggestion?.source || "clarify_step_api")
      : "client_clarify_fallback";
    rememberQuestRelationSignal({
      id: `clarification_${activeClarificationPrompt.taskId}`,
      taskId: activeClarificationPrompt.taskId,
      taskTitle: activeClarificationPrompt.taskTitle,
      mode: activeClarificationPrompt.mode || "clarify_task",
      trigger: "clarification_step_suggested",
    }, "unclear", {
      source: clarifySuggestion?.source || "client_clarify_fallback",
      confusion: normalizedReason || "unclear",
      confusionLabel: activeClarificationPrompt.confusionLabel || "",
      suggestedStep: clarifyStep,
        stepSource: clarifyStepSource,
    });
    setClarificationPrompt((previous) => previous
      ? {
          ...previous,
          loading: false,
          suggestedStep: clarifyStep,
        suggestionSource: clarifyStepSource,
        suggestedStepHistory,
        suggestionRationale: clarifySuggestion?.rationale || "",
      }
    : previous);
  };

  const handleClarificationOption = (option = {}) => {
    const effect = String(option.effect || option.id || "").trim();
    if (!clarificationPrompt?.taskId) return;
    const isRetrySuggestion = effect === "suggest_step" && Boolean(clarificationPrompt.suggestedStep);
    const previousSuggestedStep = String(clarificationPrompt.suggestedStep || "").trim();
    const nextSuggestedStepHistory = Array.from(new Set([
      ...(Array.isArray(clarificationPrompt.suggestedStepHistory)
        ? clarificationPrompt.suggestedStepHistory
        : []),
      ...(isRetrySuggestion && previousSuggestedStep ? [previousSuggestedStep] : []),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)));
    const confusion = isRetrySuggestion
      ? String(clarificationPrompt.confusionLabel || clarificationPrompt.confusion || "unclear").trim()
      : String(option.label || option.description || effect || "unclear").trim();
    const nextConfusion = isRetrySuggestion
      ? String(clarificationPrompt.confusion || "unclear").trim()
      : String(effect || confusion || "unclear").trim();
    const nextPrompt = {
      ...clarificationPrompt,
      mode: clarificationPrompt.mode || "clarify_task",
      confusion: nextConfusion,
      confusionLabel: confusion,
      suggestedStep: "",
      loading: true,
      suggestedStepHistory: nextSuggestedStepHistory,
      retryCount: Number(clarificationPrompt.retryCount || 0) + (isRetrySuggestion ? 1 : 0),
    };
    const relationSignal = String(nextPrompt.mode || clarificationPrompt.mode || "").trim() === "too_big"
      ? "too_big"
      : "unclear";
    rememberQuestRelationSignal({
      id: `clarification_${clarificationPrompt.taskId}`,
      taskId: clarificationPrompt.taskId,
      taskTitle: clarificationPrompt.taskTitle,
      mode: nextPrompt.mode,
      trigger: "clarification_option",
    }, relationSignal, {
      source: "clarification_flow",
      optionEffect: effect,
      optionLabel: confusion,
      confusion: nextConfusion,
      confusionLabel: confusion,
    });
    setClarificationPrompt(nextPrompt);
    requestClarificationStep(nextConfusion || "unclear", nextPrompt);
    setNudgeStatus(language === "en"
      ? `Angel is turning the foggy part into one clear entry point: ${confusion}.`
      : `Ангел превращает мутное место в один понятный вход: ${confusion}.`);
  };

  const handleAngelEntryDiagnosisOption = (option = {}) => {
    if (!visibleAngelEntrySession) return;
    const normalizedOption = localizeStickyDiagnosisOption(option, language);
    const effect = normalizedOption.normalizedEffect || normalizeStickyDiagnosisEffect(normalizedOption);
    clearAngelEntryResistance(visibleAngelEntrySession);
    const relationMemory = rememberQuestRelationSignal(visibleAngelEntrySession, effect, {
      source: "angel_entry_diagnosis_option",
      optionLabel: normalizedOption.label || "",
    });
    appendExecutiveStateLog({
      state: executiveState || "stuck",
      action: "angel_entry_diagnosis_option",
      trigger: visibleAngelEntrySession.trigger || "",
      mode: visibleAngelEntrySession.mode || "",
      taskId: visibleAngelEntrySession.taskId || "",
      optionId: normalizedOption.id || "",
      optionLabel: normalizedOption.label || "",
      optionEffect: effect || "",
      relationSignal: relationMemory?.lastSignal || "",
      relationStrategy: relationMemory?.lastStrategy || "",
      source: "angel_entry_session",
    });

    if (angelEntryTask) {
      if (effect === "still_waiting") {
        const currentBlocker = angelEntryTask.blocked || angelEntryTask.notYourMove || {};
        if (visibleAngelEntrySession?.id) {
          setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
        }
        handleMarkNotYourMove(angelEntryTask.id, {
          days: 3,
          reason: currentBlocker.reason || "other",
          source: "not_your_move_checkin",
        });
        return;
      }
      if (effect === "back_in_my_hands") {
        handleClearNotYourMove(angelEntryTask.id);
        if (visibleAngelEntrySession?.id) {
          setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
        }
        return;
      }
      if (effect === "not_my_move") {
        setCompanionPromptQuietUntil(Date.now() + 45 * 1000);
        if (visibleAngelEntrySession?.id) {
          setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
        }
        openNotYourMoveDraft(angelEntryTask, "sticky_diagnosis");
        return;
      }
      if (effect === "unclear") {
        const nextPrompt = {
          taskId: angelEntryTask.id,
          taskTitle: getTaskDisplayTitle(angelEntryTask),
          mode: "clarify_task",
          confusion: "",
          suggestedStep: "",
          loading: false,
          source: "sticky_diagnosis",
        };
        setClarificationPrompt(nextPrompt);
        if (visibleAngelEntrySession?.id) {
          setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
        }
        setNudgeStatus(language === "en"
          ? "Angel will ask where the quest is foggy before suggesting a step."
          : "Ангел сначала спросит, где квест мутный, а потом предложит шаг.");
        return;
      }
      if (effect === "too_big") {
        handleSetResistance(angelEntryTask.id, "high");
        const nextPrompt = {
          taskId: angelEntryTask.id,
          taskTitle: getTaskDisplayTitle(angelEntryTask),
          mode: "too_big",
          confusion: "too_big",
          confusionLabel: language === "en" ? "too big" : "слишком большое",
          suggestedStep: "",
          loading: true,
          source: "sticky_diagnosis",
        };
        setClarificationPrompt(nextPrompt);
        if (visibleAngelEntrySession?.id) {
          setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
        }
        requestClarificationStep("too_big", nextPrompt);
        return;
      }
      if (effect === "kill_without_guilt") {
        setStickyKillConfirmPrompt({
          taskId: angelEntryTask.id,
          taskTitle: getTaskDisplayTitle(angelEntryTask),
          source: "sticky_diagnosis",
          createdAt: Date.now(),
        });
        if (visibleAngelEntrySession?.id) {
          setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
        }
        setCompanionPromptQuietUntil(0);
        setNudgeStatus(language === "en"
          ? "Angel is asking for confirmation before Cemetery."
          : "Ангел просит подтверждение перед кладбищем.");
        return;
      }
      setRequestedTuneTaskId(angelEntryTask.id);
      setActiveTab(angelEntryTask.status === "dead"
        ? "dead"
        : angelEntryTask.status === "completed"
          ? "completed"
          : "active");
      setHighlightTaskId(angelEntryTask.id);
      schedulePlannerContentScroll();
    }

    const nextStep = String(normalizedOption.suggestedNextStep || "").trim();
    setNudgeStatus(nextStep || (language === "en"
      ? "Angel recorded the sticky point. No task state changed."
      : "Ангел записал липкое место. Статус задачи не изменён."));
  };

  const handleAngelEntryStart = () => {
    if (!visibleAngelEntrySession) return;
    const directorAction = String(visibleAngelEntrySession.directorAction || "").trim();
    const directorPrimaryOption = visibleAngelEntrySession.mode === "diagnose_resistance" && angelEntryTask
      ? QUEST_DIRECTOR_PRIMARY_OPTION_BY_ACTION[directorAction]
      : null;
    if (directorPrimaryOption) {
      handleAngelEntryDiagnosisOption({
        ...directorPrimaryOption,
        source: "quest_relation_director_primary",
      });
      return;
    }

    const nextState = getAngelEntryExecutiveState(visibleAngelEntrySession);
    clearAngelEntryResistance(visibleAngelEntrySession);
    setAngelLabExecutiveAssessment(null);
    setExecutiveState(nextState);
    setExecutivePlannerOpen(!isRescueFirstExecutiveState(nextState));
    setExecutiveLayerDismissed(false);
    persistExecutiveState(nextState);
    setDismissedAngelEntryId(String(visibleAngelEntrySession.id || ""));
    appendExecutiveStateLog({
      state: nextState,
      action: "angel_entry_started",
      trigger: visibleAngelEntrySession.trigger || "",
      mode: visibleAngelEntrySession.mode || "",
      taskId: visibleAngelEntrySession.taskId || "",
      source: "angel_entry_session",
    });

    if (visibleAngelEntrySession.mode === "diagnose_resistance" && angelEntryTask) {
      setRequestedTuneTaskId(angelEntryTask.id);
      setActiveTab(angelEntryTask.status === "dead"
        ? "dead"
        : angelEntryTask.status === "completed"
          ? "completed"
          : "active");
      setHighlightTaskId(angelEntryTask.id);
      schedulePlannerContentScroll();
    } else if (angelEntryTask && isRescueFirstExecutiveState(nextState)) {
      openPanicMode(angelEntryTask, { autoStartTimer: true, source: "web_angel_entry_rescue_started" });
    } else if (angelEntryTask) {
      setActiveTab(angelEntryTask.status === "dead"
        ? "dead"
        : angelEntryTask.status === "completed"
          ? "completed"
          : "active");
      setHighlightTaskId(angelEntryTask.id);
      schedulePlannerContentScroll();
    }

    setNudgeStatus(
      visibleAngelEntrySession.mode === "not_your_move_checkin"
        ? (language === "en"
          ? "Angel opened a check-in, not a demand to finish."
          : "Ангел открыл проверку, не требование закончить.")
        : (language === "en"
          ? "Angel opened one safe entry point."
          : "Ангел открыл один безопасный вход.")
    );
  };

  const handleStickyKillConfirmCemetery = (promptOverride = null) => {
    const activeCompanionPrompt = promptOverride || stickyKillCompanionPrompt || companionPrompt;
    const quotedTaskTitle = String(activeCompanionPrompt?.message || stickyKillConfirmPrompt?.message || "")
      .match(/[“"]([^”"]+)[”"]/)?.[1] || "";
    const requestedTaskTitle = activeCompanionPrompt?.taskTitle || stickyKillConfirmPrompt?.taskTitle || quotedTaskTitle || "";
    const normalizedRequestedTaskTitle = normalizeTaskTitleForDuplicateCheck(requestedTaskTitle);
    const currentTasks = tasksRef.current;
    const targetTask = currentTasks.find((task) => String(task.id) === String(activeCompanionPrompt?.taskId || stickyKillConfirmPrompt?.taskId || "")) ||
      currentTasks.find((task) => getTaskDisplayTitle(task) === requestedTaskTitle) ||
      currentTasks.find((task) => normalizeTaskTitleForDuplicateCheck(getTaskDisplayTitle(task)) === normalizedRequestedTaskTitle) ||
      currentTasks.find((task) => String(task.id) === String(visibleAngelEntrySession?.taskId || angelEntryTask?.id || ""));
    const taskId = String(targetTask?.id || activeCompanionPrompt?.taskId || stickyKillConfirmPrompt?.taskId || "");
    const taskTitle = getTaskDisplayTitle(targetTask) || requestedTaskTitle;

    setStickyKillConfirmPrompt(null);

    if (!targetTask || !taskId) {
      setNudgeStatus(language === "en"
        ? "I could not find that quest to move it safely."
        : "Не нашла этот квест, чтобы безопасно перенести его.");
      return;
    }

    setDismissedMissionBubbleTaskId(taskId);
    rememberMissionBubbleCooldown(taskId, DAY_MS);
    suppressTaskFromPressureNow(taskId);
    moveMissionAwayFromTask(taskId, taskTitle);
    rememberQuestRelationSignal({
      id: `sticky_kill_${taskId}`,
      taskId,
      taskTitle,
      trigger: "sticky_kill_confirmed",
      mode: "diagnose_resistance",
      source: "sticky_kill_confirm",
    }, "kill_without_guilt", {
      source: "sticky_kill_confirm",
      cemeteryConfirmed: true,
      lastBuriedAt: Date.now(),
      lastBuriedReason: "kill_without_guilt",
    });
    appendExecutiveStateLog({
      state: executiveState || "stuck",
      action: "sticky_kill_confirmed",
      taskId,
      taskTitle,
      source: "sticky_kill_confirm",
    });
    const quietUntil = Date.now() + 3 * 60 * 1000;
    setCompanionPromptQuietUntil(quietUntil);
    rememberCompanionPromptQuietUntil(quietUntil);

    if (isDemoRoute || !isCloudUser) {
      if (targetTask.status === "dead") {
        setNudgeStatus(language === "en"
          ? "This quest is already in Cemetery."
          : "Этот квест уже на кладбище.");
        return;
      }
      const saved = moveGuestTaskToCemetery(targetTask, {
        markTaskPendingSync,
        getNextTaskOrder,
        tasks: currentTasks,
        taskId: targetTask.id,
      });
      commitTasks(currentTasks.map((task) => (
        String(task.id) === String(targetTask.id) ? saved : task
      )));
      const newScore = score - 5;
      setScore(newScore);
      recordPlannerEvent({
        type: "task_dead",
        actor: "user",
        source: isDemoRoute ? "sticky_kill_confirm_demo" : "sticky_kill_confirm_guest",
        taskId: saved.id,
        taskText: saved.text,
        message: language === "en"
          ? `You moved “${saved.text || "task"}” to Cemetery without deleting it forever.`
          : `Вы отправили «${saved.text || "задачу"}» на кладбище без удаления навсегда.`,
        createdAt: saved.deadAt || Date.now(),
      });
      flashCompanion("devil", DEVIL_KILL_PHRASES, { scene: "devil_cemetery" });
      setNudgeStatus(language === "en"
        ? "Quest moved to Cemetery without deleting it forever."
        : "Квест перенесён на кладбище, не удалён навсегда.");
      return;
    }

    handleKill(taskId, { companionScene: "devil_cemetery" });
    setNudgeStatus(language === "en"
      ? "Quest moved to Cemetery without deleting it forever."
      : "Квест перенесён на кладбище, не удалён навсегда.");
  };

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    let lastHandledAt = 0;
    const handleNativeCompanionCemeteryMove = (event) => {
      const eventTarget = event.target?.nodeType === 1
        ? event.target
        : event.target?.parentElement;
      const target = eventTarget?.closest?.("[data-companion-cemetery-action='move']");
      if (!target) return;
      const taskId = target.getAttribute("data-companion-cemetery-task-id") || "";
      const taskTitle = target.getAttribute("data-companion-cemetery-task-title") || "";
      if (!taskId) return;
      const now = Date.now();
      if (now - lastHandledAt < 350) return;
      if (cemeteryMoveInFlightRef.current.has(taskId)) return;
      lastHandledAt = now;
      cemeteryMoveInFlightRef.current.add(taskId);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      try {
        const currentTasks = tasksRef.current || [];
        const targetTask = currentTasks.find((task) => String(task.id) === String(taskId));
        const resolvedTaskTitle = getTaskDisplayTitle(targetTask) || taskTitle;
        const quietUntil = now + 3 * 60 * 1000;

        setStickyKillConfirmPrompt(null);
        setCompanionPromptQuietUntil(quietUntil);
        rememberCompanionPromptQuietUntil(quietUntil);
        setDismissedMissionBubbleTaskId(taskId);
        rememberMissionBubbleCooldown(taskId, DAY_MS);
        suppressTaskFromPressureNow(taskId);
        moveMissionAwayFromTask(taskId, resolvedTaskTitle);

        if (isDemoRoute || !isCloudUser) {
          if (!targetTask) {
            setNudgeStatus(language === "en"
              ? "I could not find that quest to move it safely."
              : "Не нашла этот квест, чтобы безопасно перенести его.");
            return;
          }
          if (targetTask.status === "dead") {
            setNudgeStatus(language === "en"
              ? "This quest is already in Cemetery."
              : "Этот квест уже на кладбище.");
            return;
          }

          const saved = moveGuestTaskToCemetery(targetTask, {
            markTaskPendingSync,
            getNextTaskOrder,
            tasks: currentTasks,
            taskId: targetTask.id,
          });
          commitTasks(currentTasks.map((task) => (
            String(task.id) === String(targetTask.id) ? saved : task
          )));
          const newScore = score - 5;
          setScore(newScore);
          recordPlannerEvent({
            type: "task_dead",
            actor: "user",
            source: isDemoRoute ? "companion_cemetery_confirm_demo" : "companion_cemetery_confirm_guest",
            taskId: saved.id,
            taskText: saved.text,
            message: language === "en"
              ? `You moved “${saved.text || "task"}” to Cemetery without deleting it forever.`
              : `Вы отправили «${saved.text || "задачу"}» на кладбище без удаления навсегда.`,
            createdAt: saved.deadAt || Date.now(),
          });
          flashCompanion("devil", DEVIL_KILL_PHRASES, { scene: "devil_cemetery" });
          setNudgeStatus(language === "en"
            ? "Quest moved to Cemetery without deleting it forever."
            : "Квест перенесён на кладбище, не удалён навсегда.");
          return;
        }

        handleKill(taskId, { companionScene: "devil_cemetery" });
        setNudgeStatus(language === "en"
          ? "Quest moved to Cemetery without deleting it forever."
          : "Квест перенесён на кладбище, не удалён навсегда.");
      } finally {
        window.setTimeout(() => {
          cemeteryMoveInFlightRef.current.delete(taskId);
        }, 500);
      }
    };
    document.addEventListener("click", handleNativeCompanionCemeteryMove, true);
    return () => {
      document.removeEventListener("click", handleNativeCompanionCemeteryMove, true);
    };
  }, [commitTasks, handleKill, isCloudUser, isDemoRoute, language, score]);

  const handleCompanionPromptStart = (promptOverride = null) => {
    const activeCompanionPrompt = promptOverride || companionPrompt;
    if (activeCompanionPrompt?.kind === "sticky_kill_confirm") {
      handleStickyKillConfirmCemetery(activeCompanionPrompt);
      return;
    }
    if (activeCompanionPrompt?.kind === "angel_entry" && activeCompanionPrompt?.directorAction === "confirm_cemetery") {
      handleStickyKillConfirmCemetery(activeCompanionPrompt);
      return;
    }
    if (activeCompanionPrompt?.kind === "planner_report_summary") {
      setPlannerReportModalOpen(true);
      return;
    }
    if (activeCompanionPrompt?.kind === "angel_opening_move") {
      const taskId = String(activeCompanionPrompt.taskId || "").trim();
      const task = taskId
        ? tasks.find((candidate) => String(candidate.id) === taskId)
        : rescueTask;
      if (task?.id) {
        const quietUntil = Date.now() + ANGEL_OPENING_MOVE_COOLDOWN_MS;
        setDismissedMissionBubbleTaskId(String(task.id));
        rememberMissionBubbleCooldown(`opening_${task.id}`, ANGEL_OPENING_MOVE_COOLDOWN_MS);
        rememberCompanionPromptQuietUntil(quietUntil);
        setCompanionPromptQuietUntil(quietUntil);
        appendExecutiveStateLog({
          state: executiveState || "stuck",
          action: "angel_opening_move_started",
          taskId: task.id,
          taskTitle: getTaskDisplayTitle(task),
          source: "companion_opening_move",
        });
        openPanicMode(task, { autoStartTimer: true, source: "web_angel_opening_move_started" });
        setNudgeStatus(language === "en"
          ? "Angel opened one safe entry point, not the full list."
          : "Ангел открыл один безопасный вход, а не весь список.");
      }
      return;
    }
    if (activeCompanionPrompt?.kind === "clarify_quest" || activeCompanionPrompt?.kind === "shrink_quest") {
      if (clarificationPrompt?.suggestedStep && clarificationPrompt?.taskId) {
        const suggestedStep = String(clarificationPrompt.suggestedStep || "").trim();
        const targetTask = clarificationTask || tasks.find((task) => String(task.id) === String(clarificationPrompt.taskId));
        const existingSubtasks = Array.isArray(targetTask?.subtasks) ? targetTask.subtasks : [];
        const existingSuggestedSubtask = existingSubtasks.find((subtask) =>
          String(subtask.id || "") === String(clarificationPrompt.suggestedSubtaskId || "")
        ) || existingSubtasks.find((subtask) =>
          normalizeStepForComparison(subtask.text) === normalizeStepForComparison(suggestedStep)
        );
        let suggestedSubtaskId = String(existingSuggestedSubtask?.id || clarificationPrompt.suggestedSubtaskId || "");
        if (!suggestedSubtaskId) {
          suggestedSubtaskId = `${clarificationIsTooBig ? "shrink" : "clarify"}-${Date.now()}`;
          handleAddSubtask(clarificationPrompt.taskId, suggestedStep, {
            subtaskId: suggestedSubtaskId,
            source: clarificationIsTooBig ? "web_shrink_step" : "web_clarify_step",
          });
        }
        setClarificationPrompt(null);
        rememberQuestRelationSignal({
          id: `clarification_${clarificationPrompt.taskId}`,
          taskId: clarificationPrompt.taskId,
          taskTitle: clarificationPrompt.taskTitle,
          mode: clarificationPrompt.mode || "clarify_task",
          trigger: "clarification_step_confirmed",
        }, clarificationIsTooBig ? "too_big" : "unclear", {
          source: clarificationIsTooBig ? "shrink_flow_start_step" : "clarification_flow_start_step",
          confusion: clarificationPrompt.confusion || "",
          confusionLabel: clarificationPrompt.confusionLabel || "",
          suggestedStep,
          subtaskId: suggestedSubtaskId,
          stepSource: clarificationIsTooBig ? "angel_shrink" : "angel_clarification",
        });
        setCompanionPromptQuietUntil(Date.now() + 45 * 1000);
        if (targetTask && suggestedStep) {
          openPanicMode(targetTask, {
            stepOverride: suggestedStep,
            stepSubtaskId: suggestedSubtaskId,
            stepSource: clarificationIsTooBig ? "angel_shrink" : "angel_clarification",
            autoStartTimer: true,
            source: "web_clarify_step_rescue_started",
          });
          setNudgeStatus(language === "en"
            ? (clarificationIsTooBig
              ? "Angel opened rescue with the smaller 2-minute step."
              : "Angel opened rescue with the new clarified step.")
            : (clarificationIsTooBig
              ? "Ангел открыл rescue с уменьшенным шагом на 2 минуты."
              : "Ангел открыл rescue уже с новым прояснённым шагом."));
        } else {
          setNudgeStatus(language === "en"
            ? "Clarifying step added. One visible move is enough."
            : "Проясняющий шаг добавлен. Одного видимого движения достаточно.");
        }
        return;
      }
      if (!clarificationPrompt?.loading) {
        requestClarificationStep(
          clarificationIsTooBig ? "too_big" : (clarificationPrompt?.confusion || "unclear"),
          clarificationPrompt
        );
      }
      return;
    }
    if (companionPrompt?.kind === "today_mission_hint") {
      const relationStrategy = String(companionPrompt.relationStrategy || "").trim().toLowerCase();
      const relationSignal = String(companionPrompt.relationSignal || "").trim().toLowerCase();
      if (rescueTask?.id && (relationStrategy === "make_it_smaller" || relationSignal === "too_big")) {
        const nextPrompt = {
          taskId: rescueTask.id,
          taskTitle: getTaskDisplayTitle(rescueTask),
          mode: "too_big",
          confusion: "too_big",
          confusionLabel: language === "en" ? "too big" : "слишком большое",
          suggestedStep: "",
          loading: true,
          source: "today_mission_relation_memory",
        };
        setDismissedMissionBubbleTaskId(String(rescueTask.id));
        setClarificationPrompt(nextPrompt);
        requestClarificationStep("too_big", nextPrompt);
        return;
      }
      if (rescueTask?.id && (relationStrategy === "clarify_task" || relationSignal === "unclear")) {
        setDismissedMissionBubbleTaskId(String(rescueTask.id));
        setClarificationPrompt({
          taskId: rescueTask.id,
          taskTitle: getTaskDisplayTitle(rescueTask),
          mode: "clarify_task",
          confusion: "",
          suggestedStep: "",
          loading: false,
          source: "today_mission_relation_memory",
        });
        setNudgeStatus(language === "en"
          ? "Angel will clarify the fog before opening action."
          : "Ангел сначала прояснит туман, а не откроет действие.");
        return;
      }
      if (rescueTask?.id && (relationStrategy === "hold_external_dependency" || relationSignal === "not_my_move" || relationSignal === "still_waiting")) {
        setDismissedMissionBubbleTaskId(String(rescueTask.id));
        openNotYourMoveDraft(rescueTask, "today_mission_relation_memory");
        return;
      }
      handleQuickRescue();
      return;
    }
    handleAngelEntryStart();
  };

  const handleCompanionPromptDismiss = () => {
    if (companionPrompt?.kind === "sticky_kill_confirm") {
      const taskId = companionPrompt.taskId || stickyKillConfirmPrompt?.taskId;
      setStickyKillConfirmPrompt(null);
      if (taskId) {
        setDismissedMissionBubbleTaskId(String(taskId));
      }
      setCompanionPromptQuietUntil(Date.now() + 30 * 1000);
      setNudgeStatus(language === "en"
        ? "Angel kept the quest alive."
        : "Ангел оставил квест живым.");
      return;
    }
    if (companionPrompt?.kind === "planner_report_summary") {
      dismissPlannerReport();
      return;
    }
    if (companionPrompt?.kind === "angel_opening_move") {
      const taskId = String(companionPrompt.taskId || "").trim();
      if (taskId) {
        rememberMissionBubbleCooldown(`opening_${taskId}`, ANGEL_OPENING_MOVE_COOLDOWN_MS);
      }
      const quietUntil = Date.now() + ANGEL_OPENING_MOVE_COOLDOWN_MS;
      rememberCompanionPromptQuietUntil(quietUntil);
      setCompanionPromptQuietUntil(quietUntil);
      setNudgeStatus(language === "en"
        ? "Angel will stay quiet for now."
        : "Ангел пока не будет лезть.");
      return;
    }
    if (companionPrompt?.kind === "clarify_quest" || companionPrompt?.kind === "shrink_quest") {
      if (clarificationPrompt?.taskId) {
        rememberQuestRelationSignal({
          id: `clarification_${clarificationPrompt.taskId}`,
          taskId: clarificationPrompt.taskId,
          taskTitle: clarificationPrompt.taskTitle,
          mode: clarificationPrompt.mode || "clarify_task",
          trigger: "clarification_not_now",
        }, "not_now", {
          source: "clarification_flow_dismiss",
          preserveLastSignal: true,
        });
      }
      setClarificationPrompt(null);
      setCompanionPromptQuietUntil(Date.now() + 30 * 1000);
      setNudgeStatus(language === "en"
        ? "Clarification paused."
        : "Прояснение отложено.");
      return;
    }
    if (companionPrompt?.kind === "today_mission_hint") {
      if (rescueTask?.id) {
        const resistanceCount = todayMissionResistanceSession
          ? rememberAngelEntryResistance(todayMissionResistanceSession)
          : 0;
        if (todayMissionResistanceSession) {
          rememberQuestRelationSignal(todayMissionResistanceSession, "not_now", {
            source: "today_mission_hint",
          });
        }
        setDismissedMissionBubbleTaskId(String(rescueTask.id));
        if (resistanceCount >= ANGEL_ENTRY_RESISTANCE_THRESHOLD && todayMissionResistanceSession) {
          setDismissedAngelEntryId("");
          setClarificationPrompt({
            taskId: rescueTask.id,
            taskTitle: getTaskDisplayTitle(rescueTask),
            mode: "diagnose_resistance",
            confusion: "not_now",
            relationSignal: "not_now",
            suggestedStep: "",
            loading: false,
            source: "today_mission_not_now_threshold",
          });
          setCompanionPromptQuietUntil(0);
        } else {
          rememberMissionBubbleCooldown(rescueTask.id);
          setCompanionPromptQuietUntil(Date.now() + 30 * 1000);
        }
      }
      setNudgeStatus(language === "en"
        ? "Angel noticed this quest did not open easily."
        : "Ангел заметил, что этот квест не открывается прямым входом.");
      return;
    }
    handleAngelEntryDismiss();
  };

  const handleCompanionPromptShowPlanner = () => {
    if (companionPrompt?.kind === "sticky_kill_confirm") {
      const taskId = companionPrompt.taskId || stickyKillConfirmPrompt?.taskId;
      const task = taskId
        ? tasks.find((candidate) => String(candidate.id) === String(taskId))
        : null;
      if (task) {
        setActiveTab(task.status === "dead"
          ? "dead"
          : task.status === "completed"
            ? "completed"
            : "active");
        setHighlightTaskId(task.id);
        setRequestedTuneTaskId(task.id);
        schedulePlannerContentScroll();
      }
      setStickyKillConfirmPrompt(null);
      setCompanionPromptQuietUntil(Date.now() + 30 * 1000);
      return;
    }
    if (companionPrompt?.kind === "planner_report_summary") {
      dismissPlannerReport();
      openPlannerProgress();
      return;
    }
    if (companionPrompt?.kind === "angel_opening_move") {
      const taskId = String(companionPrompt.taskId || "").trim();
      if (taskId) {
        setDismissedMissionBubbleTaskId(taskId);
        rememberMissionBubbleCooldown(`opening_${taskId}`, ANGEL_OPENING_MOVE_COOLDOWN_MS);
        focusTaskInList(taskId);
      } else {
        handleExecutiveShowPlanner();
      }
      const quietUntil = Date.now() + ANGEL_OPENING_MOVE_COOLDOWN_MS;
      rememberCompanionPromptQuietUntil(quietUntil);
      setCompanionPromptQuietUntil(quietUntil);
      return;
    }
    if (companionPrompt?.kind === "clarify_quest" || companionPrompt?.kind === "shrink_quest") {
      focusClarificationTask();
      return;
    }
    if (companionPrompt?.kind === "today_mission_hint") {
      if (rescueTask?.id) {
        setDismissedMissionBubbleTaskId(String(rescueTask.id));
        if (todayMissionResistanceSession) {
          clearAngelEntryResistance(todayMissionResistanceSession);
          rememberQuestRelationSignal(todayMissionResistanceSession, "show_planner", {
            source: "today_mission_show_planner",
          });
        }
      }
      setCompanionPromptQuietUntil(Date.now() + 45 * 1000);
      handleExecutiveShowPlanner();
      return;
    }
    handleAngelEntryShowPlanner();
  };

  const handleCompanionPromptOption = (option = {}, promptOverride = null) => {
    const activeCompanionPrompt = promptOverride || companionPrompt;
    if (activeCompanionPrompt?.kind === "sticky_kill_confirm") {
      const normalizedOption = localizeStickyDiagnosisOption(option, language);
      const effect = normalizedOption.normalizedEffect || normalizeStickyDiagnosisEffect(normalizedOption);
      if (effect === "confirm_cemetery_move" || normalizedOption.id === "confirm_cemetery_move") {
        handleStickyKillConfirmCemetery(activeCompanionPrompt);
      }
      return;
    }
    if (activeCompanionPrompt?.kind === "diagnose_resistance") {
      const normalizedOption = localizeStickyDiagnosisOption(option, language);
      const effect = normalizedOption.normalizedEffect || normalizeStickyDiagnosisEffect(normalizedOption);
      const task = clarificationTask;
      const taskId = String(clarificationPrompt?.taskId || task?.id || "").trim();
      const taskTitle = getTaskDisplayTitle(task) || String(clarificationPrompt?.taskTitle || "").trim();
      if (!taskId || !taskTitle) return;

      rememberQuestRelationSignal({
        id: `cooldown_diagnosis_${taskId}`,
        taskId,
        taskTitle,
        mode: "diagnose_resistance",
        trigger: "task_card_cooldown_diagnosis",
        source: "task_card_cooldown_chip",
      }, effect, {
        source: "task_card_cooldown_diagnosis",
        optionLabel: normalizedOption.label || "",
      });
      appendExecutiveStateLog({
        state: executiveState || "stuck",
        action: "cooldown_diagnosis_option",
        taskId,
        taskTitle,
        optionId: normalizedOption.id || "",
        optionLabel: normalizedOption.label || "",
        optionEffect: effect || "",
        source: "task_card_cooldown_chip",
      });

      if (effect === "too_big") {
        handleSetResistance(taskId, "high");
        const nextPrompt = {
          taskId,
          taskTitle,
          mode: "too_big",
          confusion: "too_big",
          confusionLabel: language === "en" ? "too big" : "слишком большое",
          suggestedStep: "",
          loading: true,
          source: "task_card_cooldown_diagnosis",
        };
        setClarificationPrompt(nextPrompt);
        requestClarificationStep("too_big", nextPrompt);
        return;
      }

      if (effect === "unclear") {
        setClarificationPrompt({
          taskId,
          taskTitle,
          mode: "clarify_task",
          confusion: "",
          suggestedStep: "",
          loading: false,
          source: "task_card_cooldown_diagnosis",
        });
        setNudgeStatus(language === "en"
          ? "Angel will ask what is unclear before suggesting a step."
          : "Ангел сначала спросит, что неясно, а потом предложит шаг.");
        return;
      }

      if (effect === "not_my_move") {
        setClarificationPrompt(null);
        if (task) {
          openNotYourMoveDraft(task, "task_card_cooldown_diagnosis");
        }
        return;
      }

      if (effect === "kill_without_guilt") {
        setClarificationPrompt(null);
        setStickyKillConfirmPrompt({
          taskId,
          taskTitle,
          source: "task_card_cooldown_diagnosis",
          createdAt: Date.now(),
        });
        setCompanionPromptQuietUntil(0);
        setNudgeStatus(language === "en"
          ? "Angel asks for confirmation before Cemetery."
          : "Ангел просит подтверждение перед кладбищем.");
      }
      return;
    }
    if (activeCompanionPrompt?.kind === "clarify_quest" || activeCompanionPrompt?.kind === "shrink_quest") {
      handleClarificationOption(option);
      return;
    }
    const normalizedOption = localizeStickyDiagnosisOption(option, language);
    const effect = normalizedOption.normalizedEffect || normalizeStickyDiagnosisEffect(normalizedOption);
    if (
      activeCompanionPrompt?.kind === "angel_entry" &&
      (effect === "confirm_cemetery_move" || normalizedOption.id === "confirm_cemetery_move")
    ) {
      handleStickyKillConfirmCemetery(activeCompanionPrompt);
      return;
    }
    if (activeCompanionPrompt?.kind === "angel_entry" && effect === "kill_without_guilt") {
      const taskId = String(activeCompanionPrompt.taskId || visibleAngelEntrySession?.taskId || angelEntryTask?.id || "").trim();
      const taskTitle = String(
        activeCompanionPrompt.taskTitle ||
        (angelEntryTask ? getTaskDisplayTitle(angelEntryTask) : "") ||
        visibleAngelEntrySession?.taskTitle ||
        ""
      ).trim();
      if (!taskId || !taskTitle) {
        setNudgeStatus(language === "en"
          ? "I could not find that quest to move it safely."
          : "Не нашла этот квест, чтобы безопасно перенести его.");
        return;
      }
      setStickyKillConfirmPrompt({
        taskId,
        taskTitle,
        source: "angel_entry_diagnosis_option",
        createdAt: Date.now(),
      });
      if (visibleAngelEntrySession?.id) {
        setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
      }
      setCompanionPromptQuietUntil(0);
      setNudgeStatus(language === "en"
        ? "Angel is asking for confirmation before Cemetery."
        : "Ангел просит подтверждение перед кладбищем.");
      return;
    }
    handleAngelEntryDiagnosisOption(option);
  };

  const handleQuestRelationClick = (task = {}, relationMemory = {}) => {
    const taskId = String(task?.id || relationMemory?.taskId || "").trim();
    const taskTitle = getTaskDisplayTitle(task) || String(relationMemory?.taskTitle || "").trim();
    const signal = String(relationMemory?.lastSignal || "").trim().toLowerCase();
    if (!taskId || !signal) return;

    const strategy = getQuestRelationStrategy(signal);
    rememberQuestRelationSignal({
      id: `quest_relation_chip_${taskId}`,
      taskId,
      taskTitle,
      mode: "quest_relation_memory",
      trigger: "task_card_relation_chip",
      source: "task_card",
    }, signal, {
      source: "task_card_relation_chip",
      optionLabel: relationMemory?.lastOptionLabel || "",
    });
    appendExecutiveStateLog({
      state: executiveState || "stuck",
      action: "quest_relation_chip_clicked",
      taskId,
      taskTitle,
      relationSignal: signal,
      relationStrategy: strategy,
      source: "task_card",
    });

    setActiveTab(task.status === "dead"
      ? "dead"
      : task.status === "completed"
        ? "completed"
        : "active");
    setHighlightTaskId(taskId);
    setDismissedMissionBubbleTaskId(taskId);
    schedulePlannerContentScroll();

    if (signal === "too_big") {
      handleSetResistance(taskId, "high");
      const nextPrompt = {
        taskId,
        taskTitle,
        mode: "too_big",
        confusion: "too_big",
        confusionLabel: language === "en" ? "too big" : "слишком большое",
        suggestedStep: "",
        loading: true,
        source: "task_card_relation_chip",
      };
      setClarificationPrompt(nextPrompt);
      requestClarificationStep("too_big", nextPrompt);
      setNudgeStatus(language === "en"
        ? "Angel reopened the smaller-entry flow for this quest."
        : "Ангел снова открыл уменьшенный вход для этого квеста.");
      return;
    }

    if (signal === "unclear") {
      setClarificationPrompt({
        taskId,
        taskTitle,
        mode: "clarify_task",
        confusion: "",
        suggestedStep: "",
        loading: false,
        source: "task_card_relation_chip",
      });
      setNudgeStatus(language === "en"
        ? "Angel reopened the clarification flow for this quest."
        : "Ангел снова открыл уточнение для этого квеста.");
      return;
    }

    if (signal === "not_my_move" || signal === "still_waiting") {
      openNotYourMoveDraft(task, "task_card_relation_chip");
      setNudgeStatus(language === "en"
        ? "Angel reopened the Not Your Move check before applying pressure."
        : "Ангел снова проверяет «не мой ход», прежде чем давить.");
      return;
    }

    if (signal === "kill_without_guilt") {
      setStickyKillConfirmPrompt({
        taskId,
        taskTitle,
        source: "task_card_relation_chip",
        createdAt: Date.now(),
      });
      setCompanionPromptQuietUntil(0);
      setNudgeStatus(language === "en"
        ? "Angel asks for confirmation before moving this quest to Cemetery."
        : "Ангел просит подтверждение перед переносом квеста на кладбище.");
      return;
    }

    if (signal === "not_now" || signal === "rescue_later") {
      setClarificationPrompt({
        taskId,
        taskTitle,
        mode: "diagnose_resistance",
        confusion: signal,
        relationSignal: signal,
        suggestedStep: "",
        loading: false,
        source: "task_card_cooldown_chip",
      });
      setNudgeStatus(language === "en"
        ? "Angel reopened this cooled-down quest as a question, not a demand."
        : "Ангел открыл этот остывший квест как вопрос, а не требование.");
      return;
    }

    if (signal === "microstep_completed") {
      openPanicMode(task, {
        autoStartTimer: true,
        source: "task_card_relation_chip_continue",
      });
      setNudgeStatus(language === "en"
        ? "Angel opened another tiny step, not the full quest."
        : "Ангел открыл ещё один маленький шаг, а не весь квест.");
      return;
    }

    setRequestedTuneTaskId(taskId);
    setNudgeStatus(language === "en"
      ? "Angel opened this quest because it recently resisted."
      : "Ангел открыл этот квест, потому что он недавно сопротивлялся.");
  };

  const handleParkUntilTomorrow = () => {
    const pressureTasks = tasksRef.current.filter((task) => task.status === "active" && task.isToday);
    appendExecutiveStateLog({
      state: executiveState || "normal",
      action: "park_until_tomorrow",
      count: pressureTasks.length,
      source: isDemoRoute ? "demo" : "web",
    });

    if (pressureTasks.length === 0) {
      setNudgeStatus(
        language === "en"
          ? "Nothing is pinned for today. No pressure to park."
          : "На сегодня ничего не закреплено. Давление уже снято."
      );
      return;
    }

    pressureTasks.slice(0, 3).forEach((task) => handleToggleToday(task.id));
    setExecutivePlannerOpen(false);
    setNudgeStatus(
      language === "en"
        ? `Parked ${pressureTasks.length} today task(s). They stay active, just not pressing today.`
        : `Запарковала ${pressureTasks.length} задач до завтра. Они остались активными, просто больше не давят сегодня.`
    );
  };

  const openPanicMode = (task = rescueTask, options = {}) => {
    const targetTask = task || rescueTask;
    setPanicTaskId(targetTask?.id || null);
    setPanicOpen(true);
    setFogMode(false);
    const now = Date.now();
    const shouldAutoStartTimer = Boolean(options.autoStartTimer);
    if (shouldAutoStartTimer) {
      startPanicCountdownTimer(now + 2 * 60 * 1000);
    } else {
      clearPanicCountdownTimer();
      setPanicEndsAt(null);
      setPanicTick(now);
    }
    setPanicStepOverride(String(options.stepOverride || ""));
    setPanicStepOverrideSubtaskId(String(options.stepSubtaskId || ""));
    setPanicStepSource(String(options.stepSource || ""));
    setPanicDraftStep("");
    setPanicStepEditorOpen(false);
    if (shouldAutoStartTimer && targetTask) {
      const targetPlan = buildPanicPlan(targetTask, language);
      const rescueMicrostep = String(options.stepOverride || (Array.isArray(targetPlan?.steps) ? targetPlan.steps[0] : "") || "");
      runCloudTaskPayloadAction({
        action: PLANNER_ACTIONS.RESCUE_STARTED,
        taskId: targetTask.id,
        source: options.source || "web_rescue_started",
        payload: {
          microstepText: rescueMicrostep,
          durationMs: 2 * 60 * 1000,
          idempotencyKey: buildWebIdempotencyKey(options.source || "web_rescue_started", targetTask.id, getShortIdempotencyBucket()),
        },
        errorMessage: language === "en"
          ? "Rescue start was not saved through backend. Refresh and try again."
          : "Старт rescue не сохранился через backend. Обнови страницу и попробуй ещё раз.",
      });
      setHighlightTaskId(targetTask.id);
    }
  };

  const recordRescueCloseSignal = (closeReason = "") => {
    if (!panicTask || !closeReason) return;
    const rescueMicrostep = Array.isArray(panicPlan?.steps) ? String(panicPlan.steps[0] || "") : "";
    const normalizedReason = closeReason === "later" ? "later" : "exit";
    const action = normalizedReason === "later"
      ? PLANNER_ACTIONS.RESCUE_CLOSED_LATER
      : PLANNER_ACTIONS.RESCUE_ABORTED;
    const source = normalizedReason === "later" ? "web_rescue_later" : "web_rescue_exit";
    appendExecutiveStateLog({
      state: executiveState || "stuck",
      action,
      closeReason: normalizedReason,
      taskId: panicTask.id,
      taskTitle: panicTask.text || panicTask.title || "",
      secondsLeft: panicSecondsLeft,
      source: "rescue_overlay",
    });
    if (normalizedReason === "later") {
      rememberQuestRelationSignal({
        id: `rescue_${panicTask.id}`,
        taskId: panicTask.id,
        taskTitle: panicTask.text || panicTask.title || "",
        mode: "rescue_me",
        trigger: "rescue_later",
        source: "rescue_overlay",
      }, "rescue_later", {
        source: "rescue_overlay_later",
        microstepText: rescueMicrostep,
        secondsLeft: panicSecondsLeft,
      });
      setCompanionPromptQuietUntil(Date.now() + 60 * 1000);
    }
    runCloudTaskPayloadAction({
      action,
      taskId: panicTask.id,
      source,
      payload: {
        microstepText: rescueMicrostep,
        durationMs: 2 * 60 * 1000,
        closeReason: normalizedReason,
        secondsLeft: panicSecondsLeft,
        idempotencyKey: buildWebIdempotencyKey(source, panicTask.id, getShortIdempotencyBucket()),
      },
      errorMessage: language === "en"
        ? "Rescue close signal was not saved through backend."
        : "Сигнал закрытия rescue не сохранился через backend.",
    });
  };

  const closePanicMode = (closeReason = "") => {
    recordRescueCloseSignal(closeReason);
    setPanicOpen(false);
    clearPanicCountdownTimer();
    setPanicEndsAt(null);
    setPanicStepOverride("");
    setPanicStepOverrideSubtaskId("");
    setPanicStepSource("");
    setPanicDraftStep("");
    setPanicStepEditorOpen(false);
  };

  const handleSpotlightMission = () => {
    if (!rescueTask) {
      setNudgeStatus(language === "en" ? "No active mission. Add a task and rescue will appear." : "Нет активной цели. Добавь задачу, и rescue-сессия появится.");
      return;
    }
    openPanicMode(rescueTask, { autoStartTimer: true, source: "web_mission_rescue_started" });
    setNudgeStatus(language === "en" ? "Opening rescue for today's mission." : "Открываю rescue-сессию по цели дня.");
  };

  const handleNotificationsClick = async () => {
    if (notificationPermission === "unsupported") {
      setNudgeStatus(language === "en" ? "This browser does not support system notifications." : "Этот браузер не умеет системные уведомления.");
      return;
    }

    if (notificationPermission === "granted") {
      setPulseState((previous) => ({
        ...previous,
        notificationsEnabled: !previous.notificationsEnabled,
      }));
      setNudgeStatus(
        pulseState.notificationsEnabled
          ? (language === "en" ? "Nudges are off. Planner will back off for now." : "Пинки выключены. Planner временно отстал.")
          : (language === "en" ? "Nudges are on. If you hide the tab, planner will remind you." : "Пинки включены. Если спрячете вкладку, planner будет напоминать.")
      );
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setPulseState((previous) => ({
        ...previous,
        notificationsEnabled: true,
      }));
      setNudgeStatus(language === "en" ? "Notifications are on. Nudging is now legal." : "Уведомления включены. Теперь можно легально надоедать.");
      if (rescueTask) {
        sendBrowserNudge(rescueTask, { isTest: true });
      }
      return;
    }

    setPulseState((previous) => ({
      ...previous,
      notificationsEnabled: false,
    }));
    setNudgeStatus(language === "en" ? "Permission was not granted. System nudges will not fly without it." : "Разрешение не выдано. Без него системные пинки не полетят.");
  };

  const handleTestNudge = () => {
    sendBrowserNudge(rescueTask, { isTest: true });
  };

  const handleStartPanicSprint = () => {
    if (!panicTask) return;
    if (panicEndsAt && panicSecondsLeft > 0) return;
    const rescueMicrostep = Array.isArray(panicPlan?.steps) ? String(panicPlan.steps[0] || "") : "";
    if (runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.RESCUE_STARTED,
      taskId: panicTask.id,
      source: "web_rescue_started",
      payload: {
        microstepText: rescueMicrostep,
        durationMs: 2 * 60 * 1000,
        idempotencyKey: buildWebIdempotencyKey("web_rescue_started", panicTask.id, getShortIdempotencyBucket()),
      },
      errorMessage: language === "en"
        ? "Rescue start was not saved through backend. Refresh and try again."
        : "Старт rescue не сохранился через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      setHighlightTaskId(panicTask.id);
    }
    startPanicCountdownTimer(Date.now() + 2 * 60 * 1000);
    focusTaskInList(panicTask.id);
    setNudgeStatus(language === "en" ? "Shift mode started. Just 2 minutes and one step." : "Режим сдвига запущен. Сейчас только 2 минуты и один шаг.");
  };

  const handleExtendPanicSprint = () => {
    if (!panicTask) return;
    startPanicCountdownTimer(Date.now() + 2 * 60 * 1000, { force: true });
    setNudgeStatus(language === "en" ? "Added 2 more minutes. Same one step." : "Добавила ещё 2 минуты. Всё ещё один шаг.");
  };

  const isExternalWaitingStepText = (text) => {
    const value = String(text || "").trim().toLowerCase();
    if (!value) return false;
    return /\b(wait|waiting|respond|response|reply|answer|buro|bureau|burger|bürger|jobcenter|amt|office|organization|organisation)\b/.test(value)
      || /жду|ожидаю|ответ|ответа|отвеч|бюро|бюргер|джоб|ведомств|организац|учрежден|документ/.test(value);
  };

  const classifyRescueStepIntent = async (text, task) => {
    const heuristicNotYourMove = isExternalWaitingStepText(text);
    let idToken = "";
    try {
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
    } catch (error) {
      idToken = "";
    }

    if (!idToken) {
      return heuristicNotYourMove
        ? {
          intent: "not_your_move",
          reason: "waiting_for_organization",
          waitingFor: String(text || "").trim(),
          source: "client_heuristic",
        }
        : { intent: "ordinary_step", source: "client_heuristic" };
    }

    try {
      const response = await fetch("/api/planner-client-actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          mode: "rescue_intent",
          text,
          taskId: task?.id || "",
          taskTitle: getTaskDisplayTitle(task || {}),
          language,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Rescue intent classification failed");
      }
      const rescueIntent = payload?.rescueIntent || payload;
      return {
        intent: String(rescueIntent?.intent || "ordinary_step"),
        reason: String(rescueIntent?.reason || "other"),
        waitingFor: String(rescueIntent?.waitingFor || text || "").trim(),
        source: String(rescueIntent?.source || "llm"),
      };
    } catch (error) {
      return heuristicNotYourMove
        ? {
          intent: "not_your_move",
          reason: "waiting_for_organization",
          waitingFor: String(text || "").trim(),
          source: "client_heuristic_fallback",
        }
        : { intent: "ordinary_step", source: "client_heuristic_fallback" };
    }
  };

  const handlePanicAddStep = async () => {
    if (!panicTask || !panicDraftStep.trim()) return;
    const cleanDraftStep = panicDraftStep.trim();
    setNudgeStatus(language === "en"
      ? "Angel is checking whether this is your move or an external wait..."
      : "Ангел проверяет: это твой ход или ожидание внешней стороны...");
    const rescueIntent = await classifyRescueStepIntent(cleanDraftStep, panicTask);
    if (rescueIntent.intent === "not_your_move") {
      setNotYourMoveDraft({
        taskId: panicTask.id,
        taskTitle: getTaskDisplayTitle(panicTask),
        reason: rescueIntent.reason || "waiting_for_organization",
        waitingFor: rescueIntent.waitingFor || cleanDraftStep,
        source: `web_rescue_waiting_step_${rescueIntent.source || "intent"}`,
      });
      setPanicDraftStep("");
      setPanicStepEditorOpen(false);
      setNudgeStatus(language === "en"
        ? "This looks like Not Your Move. Confirm what we are waiting for."
        : "Похоже, сейчас не твой ход. Подтверди, чего ждём.");
      return;
    }
    handleAddSubtask(panicTask.id, cleanDraftStep);
    setPanicDraftStep("");
    setPanicStepEditorOpen(false);
    setNudgeStatus(language === "en" ? "Microstep added. Moving should be easier now." : "Микрошаг добавлен. Теперь двигаться проще.");
  };

  const findRescueSubtaskForCurrentStep = (stepText = "") => {
    if (!panicTask) return null;
    const currentTask = tasksRef.current.find((task) => String(task.id) === String(panicTask.id)) || panicTask;
    const subtasks = Array.isArray(currentTask.subtasks) ? currentTask.subtasks : [];
    if (panicStepOverrideSubtaskId) {
      const byOverrideId = subtasks.find((subtask) => String(subtask.id) === String(panicStepOverrideSubtaskId));
      if (byOverrideId) return byOverrideId;
    }
    const normalizedStep = normalizeRescueStepText(stepText);
    if (!normalizedStep) return null;
    return subtasks.find((subtask) =>
      !subtask.completed &&
      normalizeRescueStepText(subtask.text) === normalizedStep
    ) || subtasks.find((subtask) =>
      normalizeRescueStepText(subtask.text) === normalizedStep
    ) || null;
  };

  const handlePanicDone = () => {
    if (!panicTask) return;
    const rescueMicrostep = Array.isArray(panicPlan?.steps) ? String(panicPlan.steps[0] || "") : "";
    const rescueSubtask = findRescueSubtaskForCurrentStep(rescueMicrostep);
    const shouldWaitForServerSubtask = Boolean(rescueSubtask && isCloudUser && isTemporarySubtaskId(rescueSubtask.id));
    if (rescueSubtask && !rescueSubtask.completed && !shouldWaitForServerSubtask) {
      handleToggleSubtask(panicTask.id, rescueSubtask.id);
    } else if ((!rescueSubtask || shouldWaitForServerSubtask) && panicStepOverride && rescueMicrostep) {
      setPendingRescueStepCompletion({
        taskId: panicTask.id,
        stepText: rescueMicrostep,
        createdAt: Date.now(),
      });
    }
    const quietUntil = Date.now() + 3 * 60 * 1000;
    setCompanionPromptQuietUntil(quietUntil);
    rememberCompanionPromptQuietUntil(quietUntil);
    setDismissedMissionBubbleTaskId(String(panicTask.id));
    rememberMissionBubbleCooldown(panicTask.id, 3 * 60 * 1000);
    if (visibleAngelEntrySession?.id) {
      setDismissedAngelEntryId(String(visibleAngelEntrySession.id));
      rememberAngelEntryCooldown(visibleAngelEntrySession, 3 * 60 * 1000);
    }
    const relationMemory = rememberQuestRelationSignal({
      id: `rescue_${panicTask.id}`,
      taskId: panicTask.id,
      taskTitle: panicTask.text || panicTask.title || "",
      mode: "rescue_me",
      trigger: "microstep_completed",
      source: "rescue_overlay",
    }, "microstep_completed", {
      source: "rescue_i_moved",
      microstepText: rescueMicrostep,
      subtaskId: rescueSubtask?.id || panicStepOverrideSubtaskId || "",
      stepSource: panicStepSource || "",
    });
    appendExecutiveStateLog({
      state: executiveState || "stuck",
      action: "microstep_completed",
      taskId: panicTask.id,
      taskTitle: panicTask.text || panicTask.title || "",
      microstepText: rescueMicrostep,
      subtaskId: rescueSubtask?.id || panicStepOverrideSubtaskId || "",
      stepSource: panicStepSource || "",
      relationSignal: relationMemory?.lastSignal || "",
      relationStrategy: relationMemory?.lastStrategy || "",
      source: "rescue_overlay",
    });
    const rescueDoneMessage = isPublicDemoRoute
      ? (language === "en"
        ? "Core demo loop complete: Today Mission -> Rescue -> one tiny step. This is the product idea."
        : "Главный demo-loop пройден: Today Mission -> Rescue -> один микрошаг. Это ядро продукта.")
      : (language === "en"
        ? "Shift counted. That is enough for today's momentum."
        : "Сдвиг засчитан. Этого уже достаточно для сегодняшнего импульса.");
    closePanicMode();
    if (isPublicDemoRoute) {
      showCompletionBanner(rescueDoneMessage);
    }
    if (runCloudTaskPayloadAction({
      action: PLANNER_ACTIONS.RESCUE_SHIFT_RECORDED,
      taskId: panicTask.id,
      source: "web_rescue_shift",
      payload: {
        microstepText: rescueMicrostep,
        stepSource: panicStepSource || "",
        durationMs: 2 * 60 * 1000,
        idempotencyKey: buildWebIdempotencyKey("web_rescue_shift", panicTask.id, getShortIdempotencyBucket()),
      },
      errorMessage: language === "en"
        ? "Rescue shift was not saved through backend. Refresh and try again."
        : "Rescue-сдвиг не сохранился через backend. Обнови страницу и попробуй ещё раз.",
    })) {
      trackDailyAction();
      setNudgeStatus(rescueDoneMessage);
      return;
    }
    handleTouch(panicTask.id, { source: "web_rescue_shift" });
    recordPlannerEvent({
      type: "rescue_shift",
      actor: "angel",
      source: "rescue",
      taskId: panicTask.id,
      taskText: panicTask.text,
      message: language === "en"
        ? `Rescue micro-step counted for “${panicTask.text || "untitled task"}”: ${rescueMicrostep || "one visible move"}.`
        : `Rescue-микрошаг засчитан по задаче «${panicTask.text || "без названия"}»: ${rescueMicrostep || "один видимый сдвиг"}.`,
      createdAt: Date.now(),
    });
    setNudgeStatus(rescueDoneMessage);
  };

  const handlePanicFocusTask = () => {
    if (!panicTask) return;
    setPanicStepEditorOpen(true);
    setNudgeStatus(language === "en" ? "Clarifying the rescue microstep." : "Уточняем микрошаг для rescue-сессии.");
  };

  const openOnboarding = () => {
    setOnboardingOpen(true);
  };

  const closeOnboarding = () => {
    if (user?.id && !(isPublicDemoRoute && !demoPreserveRequested)) {
      try {
        localStorage.setItem(`adhd_onboarding_seen_${user.id}`, "1");
      } catch (error) {
        console.warn("[Planner] Не удалось сохранить onboarding state:", error);
      }
    }
    setOnboardingOpen(false);
    if (isPublicDemoRoute && !demoPreserveRequested) {
      setActiveTab("active");
      setActiveFilter("all");
      setNudgeStatus(language === "en"
        ? "Start here: click Today Mission to open Rescue."
        : "Начни здесь: нажми Today Mission, чтобы открыть Rescue.");
      window.setTimeout(() => {
        const missionElement = document.querySelector(".apus-mission, .daily-pulse-panel");
        missionElement?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }
  };

  if (loading || !minLoadDone) return <LoadingScreen />;

  const draggedTask = dragTaskId ? tasks.find(t => t.id === dragTaskId) : null;
  const angelEntryFocusActive = Boolean(visibleAngelEntrySession) && !angelEntryPanelRequested;
  const executiveStateLayerEnabled = !angelEntryFocusActive
    && !executiveLayerDismissed
    && (stateLayerRequested || (!isDemoRoute && Boolean(executiveState)));
  const executiveStateLayerCanReopen = !angelEntryFocusActive && !executiveStateLayerEnabled && !isDemoRoute;
  const executivePlannerGateActive = executiveStateLayerEnabled
    && isRescueFirstExecutiveState(executiveState)
    && !executivePlannerOpen;
  const executiveGateCopy = language === "en"
    ? {
      title: "Full planner is paused for this mode.",
      body: "Start rescue, park today's pressure, or explicitly show the full planner.",
      action: "Show full planner",
    }
    : {
      title: "Полный планер на паузе для этого режима.",
      body: "Сначала rescue, парковка давления или явное открытие полного списка.",
      action: "Показать полный планер",
    };

  return (
    <DndContext sensors={dndSensors} collisionDetection={dndCollision} onDragStart={({ active }) => setDragTaskId(String(active.id).replace("task-", ""))} onDragEnd={handleDragEnd}>
    <AngelLabScreen
      open={angelLabOpen}
      text={angelLabText}
      saving={angelLabSaving}
      listening={angelLabListening}
      finalizing={angelLabFinalizing}
      micStatus={angelLabMicStatus}
      micMode={angelLabMicMode}
      processing={angelLabProcessing}
      status={angelLabStatus}
      dumpHistory={angelLabDumpHistory}
      suggestions={angelLabSuggestions}
      handledNotice={angelLabHandledNotice}
      handledStats={angelLabHandledStats}
      imageSrc={angelLabCat}
      language={language}
      onChange={setAngelLabText}
      onToggleMic={handleAngelLabMicToggle}
      onAudioFile={handleAngelLabAudioFile}
      onToggleStep={handleAngelLabToggleStep}
      onAddTaskOnly={handleAngelLabAddTaskOnly}
      onAddTaskWithSteps={handleAngelLabAddTaskWithSteps}
      onDismissTask={handleAngelLabDismissTask}
      onClose={closeAngelLab}
      onSave={handleSaveAngelLab}
    />
    <OnboardingOverlay open={onboardingOpen} onClose={closeOnboarding} demoMode={isDemoRoute} />

    <div className="app-wrapper">
      {completionCelebration && (
        <div className="completion-celebration" role="status" aria-live="polite">
          <video
            className="completion-celebration__mascot"
            src="/mascots/angel_celebrate_short.mp4"
            poster="/mascots/angel_celebrate.png"
            autoPlay
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
          <div className="completion-celebration__burst" aria-hidden="true">
            {completionCelebration.isHeroic ? "🎺🎉" : "🎉"}
          </div>
          <div className="completion-celebration__label">
            {completionCelebration.hasBonus
              ? (language === "en"
                ? `🎉 Support bonus +${completionCelebration.bonus} earned`
                : `🎉 Ты получила поддерживающий бонус +${completionCelebration.bonus}`)
              : (language === "en" ? "🎉 Closed. One shift already counted." : "🎉 Отлично закрыта! Один сдвиг уже засчитан.")}
          </div>
          <div className="completion-celebration__particles" aria-hidden="true">
            {completionCelebration.particles.map((particle) => (
              <span
                key={particle.id}
                className={`completion-particle ${particle.kind === "confetti" ? `is-confetti ${particle.shape}` : "is-emoji"}`}
                style={{
                  "--celebration-start-x": particle.startX,
                  "--celebration-start-y": particle.startY,
                  "--celebration-drift-x": particle.driftX,
                  "--celebration-drop-y": particle.dropY,
                  "--celebration-rotate": particle.rotate,
                  "--celebration-delay": particle.delay,
                  "--celebration-size": particle.size,
                  "--celebration-duration": particle.duration,
                  color: particle.kind === "emoji" ? particle.color : undefined,
                  backgroundColor: particle.kind === "confetti" ? particle.color : undefined,
                  boxShadow:
                    particle.kind === "confetti"
                      ? `0 0 10px ${particle.color}`
                      : undefined,
                  textShadow:
                    particle.kind === "emoji"
                      ? `0 0 12px ${particle.color}`
                      : undefined,
                }}
              >
                {particle.kind === "emoji" ? particle.emoji : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {completionBanner && (
        <div className="completion-banner" role="status" aria-live="polite">
          {completionBanner}
        </div>
      )}

      {USE_APUS_SHELL ? (
        <ApusPlannerShell
          user={user}
          score={score}
          theme={theme}
          calendarConnected={calendarConnected}
          calendarToken={calendarToken}
          activeTab={activeTab}
          activeFilter={activeFilter}
          language={language}
          demoMode={isDemoRoute}
          setLanguage={setLanguage}
          stats={{
            streak: pulseState.streak,
            todayActions,
            tasksInDanger,
            activeTasksCount: activeTasks.length,
            todayPinnedCount: todayPinnedTasks.length,
            completedTasksCount: completedTasks.length,
            deadTasksCount: deadTasks.length,
            latestDevilEvent: latestDevilStatus,
            deliveryStatus: deliveryStatusForUi,
          }}
          mission={{
            task: rescueTask,
            copy: buildMissionCopy(rescueTask, missionReason, language),
            reasonLabel: getMissionReasonLabel(missionReason, language),
            deadline: rescueDeadline,
            vitalLabel: getVitalLabel(rescueTask?.isVital, language),
            urgencyLabel: getUrgencyLabel(rescueTask?.urgency, language),
            resistanceLabel: getResistanceLabel(rescueTask?.resistance, language),
          }}
          nudgeStatus={nudgeStatus}
          handlers={{
            toggleTheme,
            setLanguage,
            connectCalendar: handleConnectCalendar,
            openProgress: openPlannerProgress,
            filterActive: applyPlannerFilter,
            openAngelLab,
            angelLabOpen,
            openRescue: handleQuickRescue,
            openOnboarding,
            onboardingOpen,
          }}
          logoutNode={<LogoutButton />}
        />
      ) : (
        <>
          <div className="score-panel animated-fade-in">
            <span className="score-icon">⚡</span>
            <span className="score-value">{score}</span>
          </div>

          <header className="header-container animated-fade-in">
            <div className="glass-panel" style={{padding: '15px 25px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <h1 className="app-title">ADHD Planner</h1>
                <p className="greeting-text">{language === "en" ? "Hi" : "Привет"}, {user?.first_name || (language === "en" ? "Guest" : "Гость")}!</p>
              </div>
              <div style={{display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end'}}>
                <button
                  type="button"
                  onClick={() => setLanguage((current) => current === "en" ? "ru" : "en")}
                  className="theme-toggle-btn"
                  title="Switch language"
                >
                  {language === "en" ? "RU" : "EN"}
                </button>
                <button onClick={toggleTheme} className="theme-toggle-btn" title={language === "en" ? "Change theme" : "Сменить тему"}>
                  {theme === 'dark' ? '🌆' : theme === 'neon' ? '☀️' : '🌙'}
                </button>
                <button
                  onClick={handleConnectCalendar}
                  className="theme-toggle-btn"
                  title={calendarConnected || calendarToken ? (language === "en" ? "Calendar connected" : "Календарь подключён") : (language === "en" ? "Connect Google Calendar" : "Подключить Google Calendar")}
                  style={{ opacity: calendarConnected || calendarToken ? 0.5 : 1 }}
                >
                  📅
                </button>
                <button
                  type="button"
                  onClick={openOnboarding}
                  className="theme-toggle-btn"
                  title="Start tour"
                >
                  ?
                </button>
                <LogoutButton />
              </div>
            </div>
          </header>

          <PlannerStatusBar
            activeTab={activeTab}
            activeFilter={activeFilter}
            openPlannerProgress={openPlannerProgress}
            onFilterChange={applyPlannerFilter}
            streak={pulseState.streak}
            todayActions={todayActions}
            tasksInDanger={plannerStatusCounts.danger}
            activeTasksCount={plannerStatusCounts.active}
            todayPinnedCount={plannerStatusCounts.today}
            latestDevilEvent={latestDevilStatus}
            deliveryStatus={deliveryStatusForUi}
            angelLabOpen={angelLabOpen}
            openAngelLab={openAngelLab}
            language={language}
          />

          <TodayMissionPanel
            rescueTask={rescueTask}
            missionCopy={buildMissionCopy(rescueTask, missionReason, language)}
            missionReasonLabel={getMissionReasonLabel(missionReason, language)}
            missionExplanation={missionExplanation}
            rescueDeadline={rescueDeadline}
            vitalLabel={getVitalLabel(rescueTask?.isVital, language)}
            urgencyLabel={getUrgencyLabel(rescueTask?.urgency, language)}
            resistanceLabel={getResistanceLabel(rescueTask?.resistance, language)}
            onRescue={handleQuickRescue}
            nudgeStatus={nudgeStatus}
            notificationPermission={notificationPermission}
            notificationsEnabled={pulseState.notificationsEnabled}
            onNotificationsClick={handleNotificationsClick}
            onTestNudge={handleTestNudge}
            language={language}
          />
        </>
      )}

      {visibleAngelEntrySession && angelEntryPanelRequested && (
        <AngelEntrySessionCard
          language={language}
          session={visibleAngelEntrySession}
          task={angelEntryTask}
          onStart={handleAngelEntryStart}
          onDismiss={handleAngelEntryDismiss}
          onShowPlanner={handleAngelEntryShowPlanner}
          onDiagnosisOption={handleAngelEntryDiagnosisOption}
        />
      )}

      {demoStoryRequested && (
        <ExecutiveDemoStoryLayer
          language={language}
          onSelectState={handleExecutiveStateSelect}
          onShowPlanner={handleExecutiveShowPlanner}
        />
      )}

      {executiveStateLayerEnabled && (
        <ExecutiveStateLayer
          language={language}
          selectedState={executiveState}
          plannerOpen={executivePlannerOpen}
          controlSuggestion={executiveControlSuggestion}
          onSelectState={handleExecutiveStateSelect}
          onStartRescue={handleExecutiveControlRescue}
          onStartControlRescue={handleExecutiveControlRescue}
          onAddControlStepAndRescue={handleExecutiveAddControlStepAndRescue}
          onParkUntilTomorrow={handleParkUntilTomorrow}
          onShowPlanner={handleExecutiveShowPlanner}
          onDismiss={handleExecutiveLayerDismiss}
          dismissible={!isDemoRoute}
          todayPinnedCount={todayPinnedTasks.length}
          rescueTask={rescueTask}
        />
      )}

      {executiveStateLayerCanReopen && (
        <section className="executive-state-reopen glass-panel" aria-label={language === "en" ? "Brain state layer" : "Слой состояния мозга"}>
          <div>
            <p>{language === "en" ? "Executive state layer is hidden." : "Слой состояния мозга скрыт."}</p>
            <span>
              {language === "en"
                ? "Turn it back on when you want the planner to adapt before showing the full list."
                : "Включи его, когда нужно, чтобы планер сначала учёл состояние, а потом показал список."}
            </span>
          </div>
          <button type="button" onClick={handleExecutiveLayerEnable}>
            {language === "en" ? "Brain state" : "Состояние мозга"}
          </button>
        </section>
      )}

      <RescueOverlay
        open={panicOpen}
        panicPlan={panicPlan}
        closePanicMode={closePanicMode}
        panicEndsAt={panicEndsAt}
        panicSecondsLeft={panicSecondsLeft}
        panicStepEditorOpen={panicStepEditorOpen}
        panicDraftStep={panicDraftStep}
        panicStepSource={panicStepSource}
        language={language}
        setPanicDraftStep={setPanicDraftStep}
        handlePanicAddStep={handlePanicAddStep}
        handleStartPanicSprint={handleStartPanicSprint}
        handleExtendPanicSprint={handleExtendPanicSprint}
        handlePanicDone={handlePanicDone}
        handlePanicFocusTask={handlePanicFocusTask}
      />
      
      {cemeteryDigest && (
        <div className="cemetery-digest animated-fade-in">
          <div className="cemetery-digest-header">
            <span>{language === "en" ? "👼 Angel checked the Cemetery" : "👼 Ангел заглянул на кладбище"}</span>
            <button className="cemetery-digest-close" onClick={() => setCemeteryDigest(null)}>✕</button>
          </div>
          <p className="cemetery-digest-subtitle">
            {language === "en"
              ? `${tasks.filter(t => t.status === "dead").length} tasks are resting. Maybe one deserves a second chance?`
              : `${tasks.filter(t => t.status === "dead").length} задач отдыхают. Может, кому-то дать второй шанс?`}
          </p>
          <div className="cemetery-digest-list">
            {cemeteryDigest.tasks.map(t => (
              <div key={t.id} className="cemetery-digest-item">
                <span className="cemetery-digest-name">{t.text}</span>
                <button className="cemetery-digest-resurrect" onClick={() => {
                  handleResurrect(t.id);
                  setCemeteryDigest(prev => prev
                    ? { ...prev, tasks: prev.tasks.filter(x => x.id !== t.id) }
                    : null
                  );
                }}>{language === "en" ? "↩️ Restore" : "↩️ Воскресить"}</button>
              </div>
            ))}
          </div>
          <div className="cemetery-digest-footer">
            <button className="cemetery-digest-goto" onClick={() => { setActiveTab('cemetery'); setCemeteryDigest(null); }}>
              {language === "en" ? "Open Cemetery" : "Открыть кладбище"}
            </button>
            <button className="cemetery-digest-dismiss" onClick={() => setCemeteryDigest(null)}>
              {language === "en" ? "Close" : "Закрыть"}
            </button>
          </div>
        </div>
      )}

      {plannerReport && plannerReportModalOpen && (
        <div className={`devil-report planner-report ${plannerReportVoiceIsDevil ? "planner-report-devil" : "planner-report-angel"} animated-fade-in`} role="status" aria-live="polite">
          <video
            className="devil-report-mascot"
            src={
              plannerReportVoiceIsDevil
                ? "/mascots/devil_cemetery_short.mp4"
                : "/mascots/angel_celebrate_short.mp4"
            }
            poster={
              plannerReportVoiceIsDevil
                ? "/mascots/devil_cemetery.png"
                : "/mascots/angel_celebrate.png"
            }
            autoPlay
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
          <div className="devil-report-header">
            <span>{language === "en" ? "While you were away" : "Пока тебя не было"}</span>
            <button className="devil-report-close" onClick={dismissPlannerReport}>✕</button>
          </div>
          <p className="devil-report-subtitle">
            {plannerReportDigest?.title || (language === "en"
              ? "Here is what changed since you were away."
              : "Вот что изменилось, пока тебя не было.")}
          </p>
          {plannerReportDigest?.subtitle && (
            <div className="devil-report-digest">
              {plannerReportDigest.subtitle}
            </div>
          )}
          <div className="devil-report-list">
            {(plannerReportDigest?.highlights || []).map((item) => (
              <div key={item.id} className={`devil-report-item devil-report-item-${item.actor || "system"}`}>
                <span className="devil-report-name">{item.text}</span>
                {item.time && (
                  <time className="devil-report-time">{item.time}</time>
                )}
              </div>
            ))}
          </div>
          <div className="devil-report-footer">
            <button className="devil-report-goto" onClick={() => { dismissPlannerReport(); openPlannerProgress(); }}>
              {language === "en" ? "Open Progress" : "Открыть прогресс"}
            </button>
            <button className="devil-report-dismiss" onClick={dismissPlannerReport}>
              {language === "en" ? "Got it" : "Понятно"}
            </button>
          </div>
        </div>
      )}

      {executivePlannerGateActive ? (
        <div className="executive-planner-gate glass-panel animated-fade-in" ref={plannerContentRef}>
          <div>
            <p className="executive-state-kicker">
              {language === "en" ? "Rescue-first mode" : "Rescue-first режим"}
            </p>
            <h3>{executiveGateCopy.title}</h3>
            <p>{executiveGateCopy.body}</p>
          </div>
          <button type="button" onClick={handleExecutiveShowPlanner}>
            {executiveGateCopy.action}
          </button>
        </div>
      ) : (
        <>
      <div className="tabs-navigation animated-fade-in" style={{maxWidth: '1200px'}}>
        <button className={`tab-btn ${activeTab === 'active' ? 'active tab-active' : ''}`} onClick={() => setActiveTab('active')}>
          🔥 {activeTasks.length} {language === "en" ? "Active" : "В процессе"}
        </button>
        <button className={`tab-btn ${activeTab === 'heaven' ? 'active tab-heaven' : ''}`} onClick={() => setActiveTab('heaven')}>
          ☁️ {completedTasks.length} {language === "en" ? "Heaven" : "Рай"}
        </button>
        <button className={`tab-btn ${activeTab === 'cemetery' ? 'active tab-cemetery' : ''}`} onClick={() => setActiveTab('cemetery')}>
          🪦 {deadTasks.length} {language === "en" ? "Cemetery" : "Кладбище"}
        </button>
        <button className={`tab-btn ${activeTab === 'stats' ? 'active tab-stats' : ''}`} onClick={() => setActiveTab('stats')}>
          📊 {language === "en" ? "Progress" : "Прогресс"}
        </button>
      </div>

      <div className="columns-wrapper" style={{maxWidth: '1200px', width: '100%'}} ref={plannerContentRef}>
        {activeTab === 'active' && (
          <TaskColumn
            type="active"
            tasks={visibleActiveTasks}
            onTouch={handleTouch}
            onComplete={handleComplete}
            onKill={handleKill}
            onAddTask={handleAddTask}
            onEditTask={handleEditTask}
            onAddTime={handleAddTime}
            onAddSubtask={handleAddSubtask}
            onDeleteSubtask={handleDeleteSubtask}
            onEditSubtask={handleEditSubtask}
            onToggleSubtask={handleToggleSubtask}
            onToggleToday={handleToggleToday}
            onToggleVital={handleToggleVital}
            onSetUrgency={handleSetUrgency}
            onSetResistance={handleSetResistance}
            onSetDeadline={handleSetDeadline}
            onClearNotYourMove={handleClearNotYourMove}
            getQuestRelationMemoryForTask={(task) => getQuestRelationMemory({
              taskId: task.id,
              taskTitle: getTaskDisplayTitle(task),
            })}
            onQuestRelationClick={handleQuestRelationClick}
            requestedTuneTaskId={requestedTuneTaskId}
            onTuneRequestHandled={() => setRequestedTuneTaskId(null)}
            highlightTaskId={highlightTaskId}
            calendarConnected={calendarConnected || Boolean(calendarToken)}
            onScheduleTaskToCalendar={handleScheduleTaskToCalendar}
            language={language}
          />
        )}
        {activeTab === 'heaven' && (
          <TaskColumn
            type="heaven"
            tasks={completedTasks}
            onReopenCompleted={handleReopenCompleted}
            onTrashCompleted={handleTrashCompleted}
            onCleanHeavenJunk={handleCleanHeavenJunk}
            onPurgeHeavenJunk={handlePurgeHeavenJunk}
            onDeleteForever={handleDeleteForever}
            language={language}
          />
        )}
        {activeTab === 'cemetery' && (
          <TaskColumn
            type="cemetery"
            tasks={deadTasks}
            onResurrect={handleResurrect}
            onDeleteForever={handleDeleteForever}
            language={language}
          />
        )}
        {activeTab === 'stats' && (() => {
          const totalMs = tasks.reduce((sum, t) => sum + (t.timeSpent || 0), 0);
          // Tasks with any tracked activity (auto activeDays OR manual timer)
          const topByActivity = [...tasks]
            .filter(t => (t.activeDays || []).length > 0 || (t.timeSpent || 0) > 0)
            .sort((a, b) => {
              const aDays = (a.activeDays || []).length;
              const bDays = (b.activeDays || []).length;
              if (bDays !== aDays) return bDays - aDays;
              return (b.timeSpent || 0) - (a.timeSpent || 0);
            })
            .slice(0, 10);
          const statusEmoji = t => t.status === 'completed' ? '☁️' : t.status === 'dead' ? '🪦' : '🔥';
          const isEnglishStats = language === "en";
          const streakLabel = isEnglishStats
            ? (pulseState.streak === 1 ? "day streak" : "day streak")
            : pulseState.streak === 1 ? 'день подряд' : pulseState.streak >= 2 && pulseState.streak <= 4 ? 'дня подряд' : 'дней подряд';
          const statsCopy = {
            timeInvested: isEnglishStats ? "time invested" : "вложено времени",
            completed: isEnglishStats ? "tasks completed" : "завершено задач",
            points: isEnglishStats ? "points earned" : "очков набрано",
            history: isEnglishStats ? "Quest movement" : "Движение квестов",
            historyHint: isEnglishStats
              ? "Shows tracked movement days. This is not total task age or a full event log."
              : "Показывает дни, где движение было записано. Это не возраст задачи и не полный лог событий.",
            deliveryTitle: isEnglishStats ? "Delivery health" : "Здоровье доставки",
            deliverySubtitle: isEnglishStats ? "Telegram, email, and engine heartbeat" : "Telegram, email и heartbeat движка",
            active: isEnglishStats ? "tracked movement" : "движение записано",
            age: isEnglishStats ? "age" : "возраст",
            dayOne: isEnglishStats ? "day" : "день",
            daysFew: isEnglishStats ? "days" : "дня",
            daysMany: isEnglishStats ? "days" : "дней",
            exactTime: isEnglishStats ? "⏱ Exact time (timer)" : "⏱ Точное время (таймер)",
            emptyHistory: isEnglishStats ? "No history yet." : "Пока нет истории.",
            emptyHistoryHint: isEnglishStats ? "Work with tasks and a timeline will appear here." : "Работай с задачами — и здесь появится хроника.",
            loading: isEnglishStats ? "Loading..." : "Загружается...",
            noSnapshots: isEnglishStats ? "No snapshots yet. Click “Create snapshot”." : "Снапшотов пока нет. Нажми «Создать снапшот»!",
            taskCount: isEnglishStats ? "tasks" : "задач",
            restore: isEnglishStats ? "↩️ Restore" : "↩️ Восстановить",
            sourceAutoBackup: isEnglishStats ? "auto backup" : "авто-бэкап",
            sourceMigration: isEnglishStats ? "migration" : "миграция",
            sourceManual: isEnglishStats ? "manual" : "ручной",
          };
          const resolveStatsTimestamp = (...values) => {
            for (const value of values) {
              if (!value) continue;
              if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
              if (typeof value === "string") {
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric > 1000000000) return numeric;
                const parsed = Date.parse(value);
                if (Number.isFinite(parsed)) return parsed;
              }
              if (typeof value?.toMillis === "function") {
                const millis = value.toMillis();
                if (Number.isFinite(millis) && millis > 0) return millis;
              }
              if (typeof value?.seconds === "number") {
                const millis = value.seconds * 1000;
                if (Number.isFinite(millis) && millis > 0) return millis;
              }
            }
            return null;
          };
          const formatStatsDays = (count) => {
            if (isEnglishStats) return count === 1 ? "day" : "days";
            return count === 1 ? "день" : count >= 2 && count <= 4 ? "дня" : "дней";
          };
          return (
            <div className="stats-panel animated-fade-in">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">⏱️</div>
                  <div className="stat-value">{formatTimeSpent(totalMs, language)}</div>
                  <div className="stat-label">{statsCopy.timeInvested}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">☁️</div>
                  <div className="stat-value">{completedTasks.length}</div>
                  <div className="stat-label">{statsCopy.completed}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">⚡</div>
                  <div className="stat-value">{score}</div>
                  <div className="stat-label">{statsCopy.points}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🔥</div>
                  <div className="stat-value">{pulseState.streak || 0}</div>
                  <div className="stat-label">{streakLabel}</div>
                </div>
              </div>

              {topByActivity.length > 0 ? (
                <div className="stats-top-section">
                  <h3 className="stats-section-title">{statsCopy.history}</h3>
                  <p className="stats-section-hint">{statsCopy.historyHint}</p>
                  <div className="stats-top-list">
                    {topByActivity.map((t, i) => {
                      const isExpanded = expandedTimeTaskId === t.id;
                      const createdAt = resolveStatsTimestamp(
                        t.createdAt,
                        t.created_at,
                        t.createdAtMs,
                        t.created_at_ms,
                        t.created_at_server,
                        t.id
                      );
                      const endAt = resolveStatsTimestamp(t.completedAt, t.completed_at, t.deadAt, t.dead_at);
                      const lifespanDays = createdAt && endAt
                        ? Math.ceil((endAt - createdAt) / DAY_MS)
                        : createdAt
                          ? Math.ceil((Date.now() - createdAt) / DAY_MS)
                          : null;

                      const activeDaySet = new Set(t.activeDays || []);
                      const timeDayKeys = Object.keys(t.timeByDay || {});
                      const trackedDayKeys = [...activeDaySet, ...timeDayKeys].filter(Boolean).sort();
                      const calStart = trackedDayKeys[0] || (createdAt ? getDayKey(createdAt) : null);
                      const calEnd = trackedDayKeys[trackedDayKeys.length - 1] || (endAt ? getDayKey(endAt) : getDayKey());
                      const calDays = [];
                      if (calStart) {
                        const startNum = Math.floor(new Date(calStart).getTime() / DAY_MS);
                        const endNum = Math.floor(new Date(calEnd).getTime() / DAY_MS);
                        const totalCal = Math.min(60, endNum - startNum + 1);
                        for (let d = 0; d < totalCal; d++) {
                          const dayKey = getDayKey(new Date((startNum + d) * DAY_MS).getTime());
                          calDays.push({ key: dayKey, active: activeDaySet.has(dayKey) });
                        }
                      }

                      const activeDaysCount = (t.activeDays || []).length;

                      return (
                        <div key={t.id} className="stats-top-item-wrap">
                          <div
                            className={`stats-top-item stats-top-item--clickable${isExpanded ? ' stats-top-item--open' : ''}`}
                            onClick={() => setExpandedTimeTaskId(isExpanded ? null : t.id)}
                          >
                            <span className="stats-status-icon">{statusEmoji(t)}</span>
                            <span className="stats-task-name">{t.text}</span>
                            <span className="stats-activity-badge">
                              {activeDaysCount > 0 && (isEnglishStats
                                ? `${activeDaysCount} tracked ${activeDaysCount === 1 ? "day" : "days"}`
                                : `движение ${activeDaysCount} ${formatStatsDays(activeDaysCount)}`)}
                              {activeDaysCount > 0 && (t.timeSpent || 0) > 0 && ' · '}
                              {(t.timeSpent || 0) > 0 && formatTimeSpent(t.timeSpent, language)}
                            </span>
                            <span className="stats-expand-arrow">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                          {isExpanded && (
                            <div className="stats-time-detail">
                              <div className="stats-time-meta">
                                {createdAt && (
                                  <span>📅 {new Date(createdAt).toLocaleDateString(isEnglishStats ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short' })}</span>
                                )}
                                {t.completedAt && (
                                  <span>→ ☁️ {new Date(t.completedAt).toLocaleDateString(isEnglishStats ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short' })}</span>
                                )}
                                {t.deadAt && !t.completedAt && (
                                  <span>→ 🪦 {new Date(t.deadAt).toLocaleDateString(isEnglishStats ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short' })}</span>
                                )}
                                {lifespanDays !== null && (
                                  <span>· {statsCopy.age} {lifespanDays} {formatStatsDays(lifespanDays)}</span>
                                )}
                                {activeDaysCount > 0 && (
                                  <span>· {statsCopy.active} {activeDaysCount} {formatStatsDays(activeDaysCount)}</span>
                                )}
                              </div>

                              {/* Day-dot calendar */}
                              {calDays.length > 0 && (
                                <div className="stats-cal-wrap">
                                  {calDays.map(({ key, active }) => (
                                    <div
                                      key={key}
                                      className={`stats-cal-dot${active ? ' stats-cal-dot--active' : ''}`}
                                      title={key}
                                    />
                                  ))}
                                </div>
                              )}

                              {/* Timer log per day (optional, if user used manual timer) */}
                              {t.timeByDay && Object.keys(t.timeByDay).length > 0 && (
                                <div className="stats-day-log">
                                  <div className="stats-day-log-title">{statsCopy.exactTime}</div>
                                  {Object.entries(t.timeByDay)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([date, ms]) => {
                                      const pct = Math.min(100, Math.round(ms / (60 * 60 * 1000) * 100 / 3));
                                      return (
                                        <div key={date} className="stats-day-row">
                                          <span className="stats-day-label">{date.slice(5)}</span>
                                          <div className="stats-day-bar-wrap">
                                            <div className="stats-day-bar" style={{ width: `${pct}%` }} />
                                          </div>
                                          <span className="stats-day-time">{formatTimeSpent(ms, language)}</span>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="stats-empty">
                  {statsCopy.emptyHistory}<br />
                  {statsCopy.emptyHistoryHint}
                </p>
              )}

              {isDemoRoute && (
                <div className="stats-top-section">
                  <section className="delivery-health-panel demo-decision-trace-panel animated-fade-in" aria-label={language === "en" ? "Demo decision trace" : "След решения демо"}>
                    <div className="delivery-health-header">
                      <span>{language === "en" ? "Decision trace" : "След решения"}</span>
                      <small>
                        {language === "en"
                          ? "why this demo starts with one mission"
                          : "почему демо начинает с одной цели"}
                      </small>
                    </div>
                    {(() => {
                      const missionTitle = rescueTask ? getTaskDisplayTitle(rescueTask) : "";
                      const missionCopy = buildMissionCopy(rescueTask, missionReason, language);
                      const reasonLabel = getMissionReasonLabel(missionReason, language);
                      const openStep = rescueTask?.subtasks?.find((subtask) => !subtask.completed)?.text || panicPlan?.steps?.[0] || "";
                      const isManualToday = Boolean(rescueTask?.isToday);
                      const decisionRows = [
                        {
                          key: "demo-mission",
                          persona: "angel",
                          label: language === "en" ? "Mission" : "Цель",
                          text: missionTitle
                            ? (language === "en" ? `Angel is holding one quest: “${missionTitle}”.` : `Ангел держит один квест: «${missionTitle}».`)
                            : (language === "en" ? "No mission is selected." : "Цель не выбрана."),
                        },
                        {
                          key: "demo-reason",
                          persona: "system",
                          label: language === "en" ? "Reason" : "Причина",
                          text: missionExplanation || `${reasonLabel}: ${missionCopy}`,
                        },
                        {
                          key: "demo-rescue",
                          persona: "angel",
                          label: "Rescue",
                          text: openStep
                            ? (language === "en" ? `If stuck, the next visible move is: ${openStep}.` : `Если застряло, следующий видимый ход: ${openStep}.`)
                            : (language === "en" ? "Rescue will ask for one tiny move, not a full task rewrite." : "Rescue попросит один маленький ход, не переписывание всей задачи."),
                        },
                        {
                          key: "demo-boundary",
                          persona: "system",
                          label: language === "en" ? "Boundary" : "Граница",
                          text: isManualToday
                            ? (language === "en" ? "Today is still a manual pin; the system explains selection without silently changing that field." : "Today остаётся ручным пином; система объясняет выбор и не меняет это поле молча.")
                            : (language === "en" ? "This is a system suggestion, separate from the manual Today pin." : "Это системная подсказка отдельно от ручного Today-пина."),
                        },
                        {
                          key: "demo-delivery",
                          persona: "system",
                          label: language === "en" ? "Delivery" : "Доставка",
                          text: language === "en"
                            ? "Demo mode does not send Telegram/email. Production pressure must leave event, report, and outbox traces."
                            : "Демо не отправляет Telegram/email. В проде давление должно оставлять event, report и outbox следы.",
                        },
                      ];
                      return (
                        <div className="engine-decisions-panel demo-engine-decisions-panel">
                          <div className="engine-decisions-title">
                            {language === "en" ? "Planner Engine preview" : "Preview движка планера"}
                          </div>
                          <div className="engine-decisions-list">
                            {decisionRows.map((decision) => (
                              <div key={decision.key} className={`engine-decision engine-decision-${decision.persona}`}>
                                <span className="engine-decision-label">{decision.label}</span>
                                <span className="engine-decision-text">{decision.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </section>
                </div>
              )}

              {!isDemoRoute && (
                <div className="stats-top-section">
                  <section className="delivery-health-panel animated-fade-in" aria-label={statsCopy.deliveryTitle}>
                    <div className="delivery-health-header">
                      <span>{statsCopy.deliveryTitle}</span>
                      <small>{statsCopy.deliverySubtitle}</small>
                    </div>
                    {(() => {
                      const summary = getDeliveryHealthSummary({ deliveryStatus: deliveryStatusForUi, plannerMeta, plannerEvents, language });
                      const deliveryRows = getDeliveryHealthRows({ deliveryStatus: deliveryStatusForUi, plannerMeta, plannerEvents, language });
                      const telegramRow = deliveryRows.find((row) => row.key === "telegram");
                      const telegramNeedsRelink = telegramRow?.status === "dead"
                        && String(telegramRow?.errorCode || "").toLowerCase() === "telegram_chat_unreachable";
                      const telegramTargetGuard = getTelegramTargetGuard(plannerMeta, language);
                      const deliveryWatchdog = getDeliveryWatchdogSummary(plannerMeta, language);
                      const deliveryWatchdogHistory = getDeliveryWatchdogHistory(plannerMeta, language);
                      const deliveryTelegramHistory = getDeliveryTelegramHistory(plannerMeta, language);
                      const deliveryEmailHistory = getDeliveryEmailHistory(plannerMeta, language);
                      return (
                        <>
                          <div className={`delivery-health-summary delivery-health-summary-${summary.tone}`}>
                            <strong>{summary.title}</strong>
                            <span>{summary.body}</span>
                          </div>
                          {telegramNeedsRelink && (
                            <div className="telegram-relink-card">
                              <strong>{language === "en" ? "Telegram needs reconnect" : "Telegram нужно переподключить"}</strong>
                              <span>
                                {language === "en"
                                  ? "Open the planner bot in Telegram, unblock it if needed, and send /start. Then run the engine and drain the outbox below."
                                  : "Открой бота планера в Telegram, разблокируй его если нужно, и отправь /start. Потом ниже нажми «Запустить движок» и «Прогнать outbox»."}
                              </span>
                              <code>/start</code>
                            </div>
                          )}
                          {telegramTargetGuard && (
                            <div className={`delivery-health-summary delivery-health-summary-${telegramTargetGuard.tone}`}>
                              <strong>{telegramTargetGuard.title}</strong>
                              <span>{telegramTargetGuard.body}</span>
                            </div>
                          )}
                          {deliveryWatchdog && (
                            <div className={`delivery-health-summary delivery-health-summary-${deliveryWatchdog.tone}`}>
                              <strong>{deliveryWatchdog.title}</strong>
                              <span>{deliveryWatchdog.body}</span>
                            </div>
                          )}
                          {deliveryWatchdogHistory.length > 0 && (
                            <div className="delivery-watchdog-history" aria-label={language === "en" ? "Recent delivery watchdog checks" : "Последние проверки доставки"}>
                              <strong>{language === "en" ? "Recent delivery checks" : "Последние проверки доставки"}</strong>
                              <div className="delivery-watchdog-history-list">
                                {deliveryWatchdogHistory.map((item) => (
                                  <div key={item.key} className={`delivery-watchdog-history-item delivery-watchdog-history-item-${item.tone}`}>
                                    <span>{item.label}</span>
                                    <b>{item.status}</b>
                                    <small>{item.detail}</small>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {deliveryTelegramHistory.length > 0 && (
                            <div className="delivery-watchdog-history" aria-label={language === "en" ? "Recent Telegram sends" : "Последние Telegram-отправки"}>
                              <strong>{language === "en" ? "Recent Telegram sends" : "Последние Telegram-отправки"}</strong>
                              <div className="delivery-watchdog-history-list">
                                {deliveryTelegramHistory.map((item) => (
                                  <div key={item.key} className={`delivery-watchdog-history-item delivery-watchdog-history-item-${item.tone}`}>
                                    <span>{item.label}</span>
                                    <b>{item.status}</b>
                                    <small>{item.detail}</small>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {deliveryEmailHistory.length > 0 && (
                            <div className="delivery-watchdog-history" aria-label={language === "en" ? "Recent email sends" : "Последние email-отправки"}>
                              <strong>{language === "en" ? "Recent email sends" : "Последние email-отправки"}</strong>
                              <div className="delivery-watchdog-history-list">
                                {deliveryEmailHistory.map((item) => (
                                  <div key={item.key} className={`delivery-watchdog-history-item delivery-watchdog-history-item-${item.tone}`}>
                                    <span>{item.label}</span>
                                    <b>{item.status}</b>
                                    <small>{item.detail}</small>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div className="delivery-health-grid">
                      {getDeliveryHealthRows({ deliveryStatus: deliveryStatusForUi, plannerMeta, plannerEvents, language }).map((row) => (
                        <article key={row.key} className={`delivery-health-card delivery-health-card-${row.tone}`}>
                          <div className="delivery-health-card-top">
                            <span className="delivery-health-dot" />
                            <strong>{row.label}</strong>
                          </div>
                          <p>{row.text}</p>
                          {row.detail && <small>{row.detail}</small>}
                        </article>
                      ))}
                    </div>
                    {(() => {
                      const decisions = getPlannerEngineDecisions(plannerMeta, language);
                      const inboxItems = getPlannerEngineInbox(plannerMeta, language);
                      const engineLock = getPlannerEngineLock(plannerMeta, language);
                      const contractStatus = getPlannerEngineContractStatus(plannerMeta, language);
                      const clientContractStatus = getPlannerClientContractStatus(plannerClientContractStatus, language);
                      const debugRuns = getPlannerDebugRuns(plannerMeta, language);
                      const outboxQueue = getPlannerOutboxQueue(plannerMeta, language);
                      const commandHealth = getPlannerCommandHealth(plannerMeta, language);
                      const commandHistory = getPlannerCommandHistory(plannerMeta, language);
                      if (!decisions.length && !inboxItems.length && !engineLock && !contractStatus && !clientContractStatus && !commandHealth && !commandHistory.length && !outboxQueue.length && !debugRuns.engine.length && !debugRuns.outbox.length && !auth.currentUser) return null;
                      return (
                        <div className="engine-decisions-panel">
                          {decisions.length > 0 && (
                            <>
                              <div className="engine-decisions-title">
                                {language === "en" ? "Latest engine decisions" : "Последние решения движка"}
                              </div>
                              <div className="engine-decisions-list">
                                {decisions.map((decision) => (
                                  <div key={decision.key} className={`engine-decision engine-decision-${decision.persona}`}>
                                    <span className="engine-decision-label">{decision.label}</span>
                                    <span className="engine-decision-text">{decision.text}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                          {inboxItems.length > 0 && (
                            <>
                              <div className="engine-decisions-title engine-inbox-title">
                                {language === "en" ? "Engine inbox" : "Inbox движка"}
                              </div>
                              <div className="engine-decisions-list">
                                {inboxItems.map((item) => (
                                  <div key={item.key} className={`engine-decision engine-inbox-item engine-decision-${item.persona} engine-inbox-severity-${item.severity}`}>
                                    <span className="engine-decision-label">{item.label}</span>
                                    <span className="engine-decision-text">{item.text}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                          {engineLock && (
                            <div className={`engine-lock-card engine-lock-card-${engineLock.tone}`}>
                              <span>{engineLock.title}</span>
                              <small>{engineLock.body}</small>
                            </div>
                          )}
                          {contractStatus && (
                            <>
                              <div className={`engine-lock-card engine-contract-card engine-lock-card-${contractStatus.tone}`}>
                                <span>{contractStatus.title}</span>
                                <small>{contractStatus.body}</small>
                              </div>
                              {contractStatus.layers.length > 0 && (
                                <details className="engine-debug-runs engine-contract-layers">
                                  <summary>{language === "en" ? "Contract layers" : "Слои контракта"}</summary>
                                  <div className="engine-command-list">
                                    {contractStatus.layers.map((layer) => (
                                      <div key={layer.key} className={`engine-command-item engine-command-item-${layer.tone}`}>
                                        <span>{layer.title}</span>
                                        <strong>{layer.status}</strong>
                                        {layer.body && <small>{layer.body}</small>}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </>
                          )}
                          {clientContractStatus && (
                            <div className={`engine-lock-card engine-contract-card engine-lock-card-${clientContractStatus.tone}`}>
                              <span>{clientContractStatus.title}</span>
                              <small>{clientContractStatus.body}</small>
                            </div>
                          )}
                          {commandHealth && (
                            <div className={`engine-lock-card engine-command-health engine-lock-card-${commandHealth.tone}`}>
                              <span>{commandHealth.title}</span>
                              <small>{commandHealth.body}</small>
                            </div>
                          )}
                          {commandHistory.length > 0 && (
                            <details className="engine-debug-runs engine-command-history">
                              <summary>{language === "en" ? "Backend commands" : "Backend-команды"}</summary>
                              <div className="engine-command-list">
                                {commandHistory.map((item) => (
                                  <div key={item.key} className={`engine-command-item engine-command-item-${item.tone}`}>
                                    <span>{item.label}</span>
                                    <strong>{item.status}</strong>
                                    {item.detail && <small>{item.detail}</small>}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                          {(auth.currentUser || debugRuns.engine.length > 0 || debugRuns.outbox.length > 0) && (
                            <details className="engine-debug-runs">
                              <summary>{language === "en" ? "Debug runs" : "Debug-запуски"}</summary>
                              <div className="engine-debug-actions">
                                <button
                                  type="button"
                                  onClick={() => runPlannerDebugAction("engine")}
                                  disabled={Boolean(engineDebugBusy)}
                                >
                                  {engineDebugBusy === "engine"
                                    ? (language === "en" ? "Running..." : "Запускаю...")
                                    : (language === "en" ? "Run engine now" : "Запустить движок")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => runPlannerDebugAction("outbox")}
                                  disabled={Boolean(engineDebugBusy)}
                                >
                                  {engineDebugBusy === "outbox"
                                    ? (language === "en" ? "Draining..." : "Прогоняю...")
                                    : (language === "en" ? "Drain outbox now" : "Прогнать outbox")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => runPlannerDebugAction("telegram-nudge")}
                                  disabled={Boolean(engineDebugBusy)}
                                >
                                  {engineDebugBusy === "telegram-nudge"
                                    ? (language === "en" ? "Sending..." : "Отправляю...")
                                    : (language === "en" ? "Send Telegram nudge now" : "Отправить Telegram nudge")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => runPlannerDebugAction("delivery-watchdog")}
                                  disabled={Boolean(engineDebugBusy)}
                                >
                                  {engineDebugBusy === "delivery-watchdog"
                                    ? (language === "en" ? "Checking..." : "Проверяю...")
                                    : (language === "en" ? "Run delivery watchdog" : "Проверить доставку")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => runPlannerDebugAction("self-test")}
                                  disabled={Boolean(engineDebugBusy)}
                                >
                                  {engineDebugBusy === "self-test"
                                    ? (language === "en" ? "Testing..." : "Проверяю...")
                                    : (language === "en" ? "Run self-test" : "Self-test")}
                                </button>
                              </div>
                              {lastDebugActionResult && (
                                <div className={`engine-debug-run engine-debug-result engine-debug-run-${lastDebugActionResult.tone || (lastDebugActionResult.status === "running" ? "neutral" : "ok")}`}>
                                  <span>{language === "en" ? "Last manual run" : "Последний ручной запуск"}</span>
                                  <strong>{lastDebugActionResult.status}</strong>
                                  <small>
                                    {lastDebugActionResult.message}
                                    {lastDebugActionResult.detail ? ` · ${lastDebugActionResult.detail}` : ""}
                                    {lastDebugActionResult.at ? ` · ${formatPlannerDeliveryTime(lastDebugActionResult.at, language)}` : ""}
                                  </small>
                                </div>
                              )}
                              {plannerSelfTestResult && (
                                <div className={`engine-self-test-card engine-debug-run engine-debug-run-${plannerSelfTestResult.ok ? "ok" : "warning"}`}>
                                  <span>{language === "en" ? "Planner self-test" : "Self-test планера"}</span>
                                  <strong>{plannerSelfTestResult.ok ? "passed" : "failed"}</strong>
                                  <small>
                                    {(() => {
                                      const summary = plannerSelfTestResult.summary && typeof plannerSelfTestResult.summary === "object"
                                        ? plannerSelfTestResult.summary
                                        : {};
                                      const passed = Number(summary.passed || 0);
                                      const failed = Number(summary.failed || 0);
                                      const total = Number(summary.total || passed + failed || 0);
                                      return language === "en"
                                        ? `${passed}/${total} passed · ${failed} failed`
                                        : `${passed}/${total} шагов ок · ${failed} ошибок`;
                                    })()}
                                  </small>
                                  {Array.isArray(plannerSelfTestResult.steps) && plannerSelfTestResult.steps.length > 0 && (
                                    <div className="engine-self-test-steps">
                                      {plannerSelfTestResult.steps.map((step, index) => (
                                        <div key={`${step.name || "step"}-${index}`} className={`engine-self-test-step ${step.ok ? "is-ok" : "is-failed"}`}>
                                          <span>{step.ok ? "✓" : "!"}</span>
                                          <small>
                                            {step.name || "step"}
                                            {step.expected || step.actual ? ` · ${step.expected || "?"} → ${step.actual || "?"}` : ""}
                                            {step.error ? ` · ${step.error}` : ""}
                                          </small>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="engine-debug-runs-grid">
                                {[
                                  ...debugRuns.engine,
                                  ...debugRuns.outbox,
                                ].map((run) => (
                                  <div key={run.key} className={`engine-debug-run engine-debug-run-${run.tone}`}>
                                    <span>{run.title}</span>
                                    <strong>{run.status}</strong>
                                    <small>{run.time}{run.detail ? ` · ${run.detail}` : ""}</small>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                          {outboxQueue.length > 0 && (
                            <details className="engine-debug-runs engine-outbox-queue">
                              <summary>{language === "en" ? "Outbox queue" : "Очередь outbox"}</summary>
                              <div className="engine-outbox-list">
                                {outboxQueue.map((item) => (
                                  <div key={item.key} className={`engine-outbox-item engine-outbox-item-${item.tone}`}>
                                    <span>{item.label}</span>
                                    <strong>{item.title}</strong>
                                    {item.detail && <small>{item.detail}</small>}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })()}
                  </section>
                </div>
              )}

              {/* Planner report + full event log */}
              <div className="stats-top-section">
                <section className="planner-report-history-panel animated-fade-in" aria-label={language === "en" ? "Planner report" : "Отчёт планера"}>
                  <div className="planner-report-history-header">
                    <div>
                      <span>{language === "en" ? "Planner Report" : "Отчёт планера"}</span>
                      <small>
                        {language === "en"
                          ? "human-readable updates from angel, devil, and the engine"
                          : "человеческая сводка от ангела, чертика и движка"}
                      </small>
                    </div>
                    <div className="planner-report-history-filters" role="group" aria-label={language === "en" ? "Planner report filters" : "Фильтры отчёта планера"}>
                      {["all", "user", "angel", "devil", "system"].map((filterKey) => (
                        <button
                          key={filterKey}
                          type="button"
                          className={plannerReportFilter === filterKey ? "is-active" : ""}
                          onClick={() => setPlannerReportFilter(filterKey)}
                        >
                          {filterKey === "all"
                            ? (language === "en" ? "All" : "Все")
                            : filterKey === "angel"
                              ? (language === "en" ? "Angel" : "Ангел")
                              : filterKey === "devil"
                                ? (language === "en" ? "Devil" : "Чёртик")
                                : filterKey === "user"
                                  ? (language === "en" ? "You" : "Ты")
                                  : (language === "en" ? "System" : "Система")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {plannerReportHistoryEvents.some((event) => matchesPlannerReportFilter(event, plannerReportFilter)) ? (
                    <div className="planner-report-history-list">
                      {plannerReportHistoryEvents
                        .filter((event) => matchesPlannerReportFilter(event, plannerReportFilter))
                        .slice(0, 8)
                        .map((event) => (
                        <article key={event.id} className={`planner-report-history-item planner-report-history-item-${event.actor || event.persona || "system"}`}>
                          <span className="planner-report-history-icon">{getPlannerReportIcon(event)}</span>
                          <div className="planner-report-history-copy">
                            <div className="planner-report-history-meta">
                              <span>{getPlannerReportPersona(event, language)}</span>
                              {formatPlannerEventTime(event.createdAt) && (
                                <time>{formatPlannerEventTime(event.createdAt)}</time>
                              )}
                            </div>
                            <p>{getHumanPlannerEvent(event, language)}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="planner-report-history-empty">
                      {language === "en"
                        ? "Nothing in this filter yet. When the planner picks a focus, warns you, or cleans something up, it will appear here."
                        : "В этом фильтре пока пусто. Когда планер выберет фокус, предупредит или что-то уберёт, это появится здесь."}
                    </div>
                  )}
                </section>

                {!isDemoRoute && (
                  <>
                    <section className="planner-events-panel animated-fade-in" aria-label={language === "en" ? "Planner event log" : "Журнал событий планера"}>
                      <div className="planner-events-header">
                        <span>{language === "en" ? "Event log" : "Журнал событий"}</span>
                        <small>{language === "en" ? "human actions and visible system changes" : "действия и видимые изменения системы"}</small>
                      </div>
                      {humanPlannerEvents.length > 0 ? (
                        <div className="planner-events-list">
                          {humanPlannerEvents.map((event) => (
                            <div key={event.id} className={`planner-event planner-event-${event.actor || "system"}`}>
                              <span className="planner-event-icon">{event.actor === "devil" ? "😈" : event.actor === "angel" ? "👼" : event.actor === "user" ? "•" : "✦"}</span>
                              <span className="planner-event-message">{getHumanPlannerEvent(event, language)}</span>
                              {formatPlannerEventTime(event.createdAt) && (
                                <time className="planner-event-time">{formatPlannerEventTime(event.createdAt)}</time>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="planner-events-empty">
                          {language === "en"
                            ? "No events yet. Angel, devil, and system changes will appear here."
                            : "Пока событий нет. Здесь появятся действия ангела, чертика и системы."}
                        </div>
                      )}
                      {technicalPlannerEvents.length > 0 && (
                        <details className="planner-technical-trace">
                          <summary>
                            {language === "en"
                              ? `Technical trace (${technicalPlannerEvents.length})`
                              : `Технический trace (${technicalPlannerEvents.length})`}
                          </summary>
                          <div className="planner-events-list">
                            {technicalPlannerEvents.slice(0, 20).map((event) => (
                              <div key={event.id} className="planner-event planner-event-technical">
                                <span className="planner-event-icon">◇</span>
                                <span className="planner-event-message">{getHumanPlannerEvent(event, language)}</span>
                                {formatPlannerEventTime(event.createdAt) && (
                                  <time className="planner-event-time">{formatPlannerEventTime(event.createdAt)}</time>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </section>

                    <div className="stats-snapshots-header">
                      <h3 className="stats-section-title">{language === "en" ? "Snapshots (backups)" : "Снапшоты (резервные копии)"}</h3>
                      <div className="stats-snapshots-actions">
                        <button
                          className="snapshot-btn"
                          onClick={handleCreateSnapshot}
                          disabled={snapshotLoading}
                        >
                          {snapshotLoading ? "..." : language === "en" ? "💾 Create snapshot" : "💾 Создать снапшот"}
                        </button>
                        {snapshots === null && (
                          <button
                            className="snapshot-btn secondary"
                            onClick={handleLoadSnapshots}
                            disabled={snapshotLoading}
                          >
                            {language === "en" ? "📂 Load list" : "📂 Загрузить список"}
                          </button>
                        )}
                      </div>
                    </div>

                    {snapshots === null && !snapshotLoading && (
                      <p className="stats-empty" style={{padding: '10px 0'}}>
                        {language === "en"
                          ? "Click “Load list” to see snapshots"
                          : "Нажми «Загрузить список», чтобы увидеть снапшоты"}
                      </p>
                    )}

                    {snapshotLoading && (
                      <p className="stats-empty" style={{padding: '10px 0'}}>{statsCopy.loading}</p>
                    )}

                    {snapshots !== null && snapshots.length === 0 && (
                      <p className="stats-empty" style={{padding: '10px 0'}}>{statsCopy.noSnapshots}</p>
                    )}

                    {snapshots !== null && snapshots.length > 0 && (
                      <div className="stats-top-list">
                        {snapshots.map(snap => {
                          const date = snap.capturedAt
                            ? new Date(snap.capturedAt).toLocaleString(isEnglishStats ? "en-US" : "ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                            : "—";
                          const sourceLabel = snap.source === "pre_restore_backup" ? statsCopy.sourceAutoBackup : snap.source === "migration_pre_subcollection" ? statsCopy.sourceMigration : snap.source || statsCopy.sourceManual;
                          return (
                            <div key={snap.id} className="stats-top-item snapshot-item">
                              <span className="snapshot-date">{date}</span>
                              <span className="snapshot-count">{snap.taskCount ?? (snap.tasks?.length ?? "?")} {statsCopy.taskCount}</span>
                              <span className="snapshot-source">{sourceLabel}</span>
                              <button
                                className="snapshot-restore-btn"
                                onClick={() => setRestoreTarget(snap)}
                              >{statsCopy.restore}</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>
        </>
      )}

      <Companions
        activeTab={activeTab}
        tasksCount={activeTasks.length}
        deadCount={deadTasks.length}
        completedCount={completedTasks.length}
        tasks={tasks}
        onAddTask={handleAddTask}
        onAddSubtask={handleAddSubtask}
        onDeleteSubtask={handleDeleteSubtask}
        onKillTask={handleKill}
        onSetVital={handleToggleVital}
        onSetUrgency={handleSetUrgency}
        calendarToken={calendarToken}
        companionFlash={companionFlash}
        language={language}
        companionPrompt={visibleCompanionPrompt}
        idleEnabled={!onboardingOpen}
        suppressAngelAvatar={activeTab === "stats" || Boolean(plannerReport && plannerReportModalOpen)}
        suppressDevilAvatar={activeTab === "stats" || Boolean(plannerReport && plannerReportModalOpen)}
        onCompanionPromptStart={handleCompanionPromptStart}
        onCompanionPromptConfirmCemetery={handleStickyKillConfirmCemetery}
        onCompanionPromptDismiss={handleCompanionPromptDismiss}
        onCompanionPromptShowPlanner={handleCompanionPromptShowPlanner}
        onCompanionPromptOption={handleCompanionPromptOption}
      />
    </div>
    <DragOverlay>
      {draggedTask ? (
        <div style={{
          background: 'rgba(30,30,60,0.95)',
          border: '2px solid rgba(255,255,255,0.3)',
          borderRadius: '12px',
          padding: '10px 16px',
          color: '#fff',
          fontSize: '0.95rem',
          fontFamily: "'Inter', sans-serif",
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          maxWidth: '280px',
          pointerEvents: 'none',
        }}>
          {draggedTask.text}
        </div>
      ) : null}
    </DragOverlay>

    {fogMode && (() => {
      const fogTask = rescueTask || activeTasks[0] || null;
      return (
        <div className="fog-overlay" onClick={() => setFogMode(false)}>
          <div className="fog-card" onClick={e => e.stopPropagation()}>
            {fogTask ? (
              <>
                <div className="fog-label">{language === "en" ? "🌫️ FOCUS NOW" : "🌫️ ФОКУС СЕЙЧАС"}</div>
                <h2 className="fog-task-title">{fogTask.text}</h2>

                {(fogTask.subtasks || []).length > 0 && (
                  <div className="fog-subtasks">
                    {fogTask.subtasks.map(sub => (
                      <div key={sub.id} className={`fog-subtask${sub.completed ? ' done' : ''}`}>
                        <span className="fog-subtask-dot">{sub.completed ? '✓' : '○'}</span>
                        {sub.text}
                      </div>
                    ))}
                  </div>
                )}

                <div className="fog-actions">
                  <button className="fog-action primary" onClick={() => { setFogMode(false); openPanicMode(fogTask, { autoStartTimer: true, source: "web_fog_rescue_started" }); setNudgeStatus(language === "en" ? "Starting a soft 2-minute rescue." : "Включаю мягкий старт на 2 минуты."); }}>
                    {language === "en" ? "⏱️ 2 minutes" : "⏱️ 2 минуты"}
                  </button>
                  <button className="fog-action" onClick={() => { setFogMode(false); openPanicMode(fogTask); }}>
                    {language === "en" ? "➕ Add a tiny step" : "➕ Добавить маленький шаг"}
                  </button>
                  <button className="fog-action" onClick={() => { handleTouch(fogTask.id); setNudgeStatus(language === "en" ? "Movement recorded." : "Сдвиг засчитан."); setFogMode(false); }}>
                    {language === "en" ? "✅ I moved" : "✅ Я сдвинулась"}
                  </button>
                </div>
                <button className="fog-help-link" onClick={() => { setFogMode(false); openPanicMode(fogTask); }}>
                  {language === "en" ? "stuck?" : "застряла?"}
                </button>
              </>
            ) : (
              <>
                <div className="fog-label">{language === "en" ? "🌫️ FOG MODE" : "🌫️ РЕЖИМ ТУМАНА"}</div>
                <p style={{color: 'rgba(240,224,255,0.6)', textAlign: 'center', margin: 0, fontSize: '1rem'}}>
                  {language === "en" ? "No active tasks." : "Нет активных задач."}<br />{language === "en" ? "Add a task and fog mode will open." : "Добавь задачу — туман откроется."}
                </p>
              </>
            )}

            <button className="fog-exit" onClick={() => setFogMode(false)}>
              {language === "en" ? "Exit fog" : "Выйти из тумана"}
            </button>
          </div>
        </div>
      );
    })()}
    {notYourMoveDraft && (
      <div className="fog-overlay" onClick={() => closeNotYourMoveDraft("overlay")}>
        <div className="fog-card" style={{maxWidth: '560px'}} onClick={e => e.stopPropagation()}>
          <div className="fog-label">
            {language === "en" ? "🪽 NOT YOUR MOVE" : "🪽 НЕ ТВОЙ ХОД"}
          </div>
          <h2 className="fog-task-title" style={{fontSize: '1.55rem'}}>
            {notYourMoveDraft.taskTitle}
          </h2>
          <p style={{color: '#f0e0ff', fontSize: '1rem', lineHeight: 1.5, margin: 0}}>
            {language === "en"
              ? "This means Angel stops pushing this as something you should finish today. It stays alive, but becomes a waiting/check-in quest."
              : "Это значит: ангел перестаёт давить на выполнение сегодня. Задача остаётся живой, но становится квестом ожидания/проверки."}
          </p>
          {notYourMoveDraft.waitingFor && (
            <div style={{
              width: '100%',
              padding: '0.85rem 1rem',
              borderRadius: '18px',
              border: '1px solid rgba(251,191,36,0.45)',
              background: 'rgba(251,191,36,0.12)',
              color: '#fff7d6',
              lineHeight: 1.45,
            }}>
              <p className="fog-label" style={{margin: '0 0 0.35rem'}}>
                {language === "en" ? "Angel heard" : "Ангел понял"}
              </p>
              <p style={{margin: 0, fontSize: '0.95rem'}}>
                {notYourMoveDraft.waitingFor}
              </p>
            </div>
          )}
          <label style={{width: '100%', display: 'grid', gap: '0.45rem'}}>
            <span className="fog-label" style={{margin: 0}}>
              {language === "en" ? "What exactly are we waiting for?" : "Чего именно ждём?"}
            </span>
            <textarea
              value={notYourMoveDraft.waitingFor || ""}
              onChange={(event) => {
                const value = event.target.value;
                setNotYourMoveDraft((previous) => ({
                  ...(previous || {}),
                  waitingFor: value,
                }));
              }}
              onClick={(event) => event.stopPropagation()}
              rows={3}
              placeholder={language === "en"
                ? "Example: reply from Burgerbüro, document, access code..."
                : "Например: ответ из Bürgerbüro, документ, код доступа..."}
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: '18px',
                border: '1px solid rgba(251,191,36,0.42)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff7d6',
                padding: '0.9rem 1rem',
                font: 'inherit',
                lineHeight: 1.35,
                outline: 'none',
              }}
            />
          </label>
          <div style={{width: '100%', display: 'grid', gap: '0.75rem'}}>
            <p className="fog-label" style={{margin: 0}}>
              {language === "en" ? "What are we waiting for?" : "Чего ждём?"}
            </p>
            <div className="fog-actions" style={{justifyContent: 'center'}}>
              {NOT_YOUR_MOVE_REASON_OPTIONS.map((option) => {
                const active = notYourMoveDraft.reason === option.value;
                return (
                  <button
                    key={option.value}
                    className={`fog-action${active ? ' primary' : ''}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setNotYourMoveDraft((previous) => ({
                        ...(previous || {}),
                        reason: option.value,
                      }));
                    }}
                  >
                    {language === "en" ? option.en : option.ru}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{width: '100%', display: 'grid', gap: '0.75rem'}}>
            <p className="fog-label" style={{margin: 0}}>
              {language === "en" ? "When should Angel check back?" : "Когда ангелу проверить снова?"}
            </p>
            <div className="fog-actions" style={{justifyContent: 'center'}}>
              {NOT_YOUR_MOVE_CHECKIN_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  className={`fog-action${option.days === 3 ? ' primary' : ''}`}
                  type="button"
                  disabled={!String(notYourMoveDraft.waitingFor || "").trim()}
                  title={!String(notYourMoveDraft.waitingFor || "").trim()
                    ? (language === "en" ? "Write what we are waiting for first." : "Сначала напиши, чего ждём.")
                    : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!String(notYourMoveDraft.waitingFor || "").trim()) {
                      setNudgeStatus(language === "en"
                        ? "Write what this depends on first, then choose a check-in."
                        : "Сначала напиши, от чего это зависит, потом выбери проверку.");
                      return;
                    }
                    handleConfirmNotYourMoveCheckIn(option.days);
                  }}
                >
                  {language === "en" ? option.en : option.ru}
                </button>
              ))}
              <button className="fog-action" type="button" onClick={(event) => {
                event.stopPropagation();
                closeNotYourMoveDraft("cancel");
              }}>
                {language === "en" ? "Cancel" : "Отмена"}
              </button>
            </div>
          </div>
          <p style={{color: 'rgba(240,224,255,0.58)', fontSize: '0.85rem', lineHeight: 1.45, margin: 0}}>
            {language === "en"
              ? `Selected blocker: ${getNotYourMoveReasonLabel(notYourMoveDraft.reason, language)}.${String(notYourMoveDraft.waitingFor || "").trim() ? "" : " Add the waiting context above to enable check-in."}`
              : `Выбранный блокер: ${getNotYourMoveReasonLabel(notYourMoveDraft.reason, language)}.${String(notYourMoveDraft.waitingFor || "").trim() ? "" : " Добавь контекст ожидания выше, чтобы включить проверку."}`}
          </p>
        </div>
      </div>
    )}
    {restoreTarget && (
      <div className="fog-overlay" onClick={() => setRestoreTarget(null)}>
        <div className="fog-card" style={{maxWidth: '440px'}} onClick={e => e.stopPropagation()}>
          <div className="fog-label">{language === "en" ? "⚠️ RESTORE FROM SNAPSHOT" : "⚠️ ВОССТАНОВЛЕНИЕ ИЗ СНАПШОТА"}</div>
          <p style={{color: '#f0e0ff', fontSize: '0.95rem', lineHeight: 1.5, margin: 0}}>
            {language === "en" ? "Current tasks will be replaced with tasks from the snapshot " : "Текущие задачи будут заменены задачами из снапшота "}{' '}
            <strong style={{color: '#fbbf24'}}>
              {restoreTarget.capturedAt
                ? new Date(restoreTarget.capturedAt).toLocaleString(language === "en" ? "en-US" : "ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : ""}
            </strong>
            {' '}({restoreTarget.taskCount ?? restoreTarget.tasks?.length ?? "?"} {language === "en" ? "tasks" : "задач"}).
          </p>
          <p style={{color: 'rgba(240,224,255,0.5)', fontSize: '0.82rem', margin: 0}}>
            {language === "en" ? "Before restore, the current state will be backed up automatically." : "Перед восстановлением автоматически сохранится резервная копия текущего состояния."}
          </p>
          <div className="fog-actions">
            <button className="fog-action primary" onClick={handleConfirmRestore} disabled={snapshotLoading}>
              {snapshotLoading ? (language === "en" ? "Restoring..." : "Восстанавливаю...") : (language === "en" ? "✅ Yes, restore" : "✅ Да, восстановить")}
            </button>
            <button className="fog-action" onClick={() => setRestoreTarget(null)}>
              {language === "en" ? "Cancel" : "Отмена"}
            </button>
          </div>
        </div>
      </div>
    )}
    </DndContext>
  );
}
