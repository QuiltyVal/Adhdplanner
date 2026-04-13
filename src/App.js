// src/App.js
import React, { useState, useEffect, useCallback, useRef } from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, pointerWithin, closestCenter } from "@dnd-kit/core";
import { useNavigate } from "react-router-dom";
import TaskColumn from "./TaskColumn";
import LogoutButton from "./LogoutButton";
import Companions from "./Companions";
import LoadingScreen from "./LoadingScreen";
import {
  subscribeToTasks,
  saveTask,
  saveScore,
  getUserScore,
  migrateTasksToSubcollection,
  loadTaskSnapshots,
  saveTaskSnapshot,
  restoreFromSnapshot,
} from "./firestoreUtils";
import { auth, googleProvider } from "./firebase";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
} from "firebase/auth";
import "./App.css";

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
const DEVIL_AUTO_CLEAN_THRESHOLD = 5;   // purgatory tasks before devil intervenes
const DEVIL_AUTO_CLEAN_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between auto-cleans

function formatTimeSpent(ms) {
  if (!ms || ms <= 0) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "< 1 мин";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
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

function getPulseStorageKey(userId) {
  return `${PULSE_STORAGE_PREFIX}_${userId}`;
}

function getCloudCacheKey(userId) {
  return `${CLOUD_CACHE_PREFIX}_${userId}`;
}

function loadPulseState(userId) {
  if (!userId) return getDefaultPulseState();

  try {
    const rawState = localStorage.getItem(getPulseStorageKey(userId));
    if (!rawState) return getDefaultPulseState();

    const parsedState = JSON.parse(rawState);
    const today = getDayKey();

    return {
      ...getDefaultPulseState(),
      ...parsedState,
      actionsToday: parsedState.lastActionDay === today ? parsedState.actionsToday || 0 : 0,
    };
  } catch (error) {
    console.warn("Не удалось прочитать pulse state:", error);
    return getDefaultPulseState();
  }
}

function loadCloudCache(userId) {
  if (!userId) return null;

  try {
    const cacheKey = getCloudCacheKey(userId);
    const rawState = localStorage.getItem(cacheKey);
    if (!rawState) return null;
    const parsedState = JSON.parse(rawState);
    const savedAt = typeof parsedState.savedAt === "number" ? parsedState.savedAt : 0;

    if (!savedAt || Date.now() - savedAt > CLOUD_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return {
      tasks: parsedState.tasks || [],
      score: typeof parsedState.score === "number" ? parsedState.score : 0,
      savedAt,
    };
  } catch (error) {
    console.warn("Не удалось прочитать cloud cache:", error);
    return null;
  }
}

function saveCloudCache(userId, tasks, score) {
  if (!userId) return;

  try {
    localStorage.setItem(
      getCloudCacheKey(userId),
      JSON.stringify({
        tasks,
        score,
        savedAt: Date.now(),
      }),
    );
  } catch (error) {
    console.warn("Не удалось сохранить cloud cache:", error);
  }
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

function mergeTaskLists(localTasks = [], remoteTasks = []) {
  const localById = new Map(localTasks.map((task) => [String(task.id), task]));
  const remoteIds = new Set(remoteTasks.map((task) => String(task.id)));

  const mergedRemote = remoteTasks.map((remoteTask) => {
    const localTask = localById.get(String(remoteTask.id));
    if (!localTask) return remoteTask;

    // User intent: a locally-completed task must never be reverted to active/dead
    // by a stale Firestore snapshot that arrived before the completion write committed.
    // This handles both the race condition (reload before write) and the auto-death
    // race (game tick kills task the same millisecond user drags to heaven).
    if (localTask.status === "completed" && remoteTask.status !== "completed") {
      const mergedTask = { ...remoteTask, ...localTask };
      mergedTask.subtasks = mergeSubtasks(
        localTask.subtasks || [],
        remoteTask.subtasks || [],
        false, // prefer local
      );
      return mergedTask;
    }

    const remoteUpdatedAt = remoteTask.lastUpdated || 0;
    const localUpdatedAt = localTask.lastUpdated || 0;
    const preferRemote = remoteUpdatedAt >= localUpdatedAt;

    const mergedTask = preferRemote
      ? { ...localTask, ...remoteTask }
      : { ...remoteTask, ...localTask };

    mergedTask.subtasks = mergeSubtasks(
      localTask.subtasks || [],
      remoteTask.subtasks || [],
      preferRemote,
    );

    return mergedTask;
  });

  const localOnly = localTasks.filter((task) => !remoteIds.has(String(task.id)));
  return [...localOnly, ...mergedRemote];
}

function getTaskHeat(task) {
  return typeof task.heatCurrent === "number" ? task.heatCurrent : task.heatBase || 0;
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

function getMissionReasonLabel(reason) {
  if (reason === "hard_deadline") return "жёсткий дедлайн";
  if (reason === "today_shortlist") return "из шортлиста на сегодня";
  if (reason === "critical_priority") return "критичный приоритет";
  if (reason === "auto_priority") return "автовыбор по приоритету";
  return "без цели";
}

function buildMissionCopy(task, missionReason) {
  if (!task) {
    return "Сегодня можно не тушить пожары. Закрой хвосты или добавь новую цель.";
  }

  const heat = Math.floor(getTaskHeat(task));
  const openSubtasks = (task.subtasks || []).filter((subtask) => !subtask.completed).length;
  const deadlineInfo = getDeadlineInfo(task);

  if (deadlineInfo?.tone === "overdue") {
    return `Срок уже прошёл. Это нужно вытаскивать в первую очередь.${openSubtasks ? ` Открытых шагов: ${openSubtasks}.` : ""}`;
  }

  if (deadlineInfo?.tone === "today") {
    return `Это надо закрыть сегодня.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (missionReason === "today_shortlist") {
    return `Эта задача выбрана из вашего ручного списка на сегодня.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (missionReason === "critical_priority") {
    return `Вы пометили это как критичное. Поэтому она сейчас сверху.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (deadlineInfo?.tone === "soon") {
    return `Срок уже близко: ${deadlineInfo.label}.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (heat <= 15) {
    return `Это уже почти труп. Сделай один шаг прямо сейчас, иначе задача уйдёт на кладбище.${openSubtasks ? ` Открытых шагов: ${openSubtasks}.` : ""}`;
  }

  if (heat <= 35) {
    return `Задача опасно остыла. Одного касания хватит, чтобы вернуть ей пульс.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  if (heat <= 60) {
    return `Она ещё жива, но уже пытается сбежать из фокуса.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
  }

  return `Это сейчас самый приоритетный кандидат по состоянию задач.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
}

function buildNudgeMessage(task) {
  if (!task) {
    return "Planner снова здесь. Зайди и выбери себе одну задачу.";
  }

  const heat = Math.floor(getTaskHeat(task));
  const deadlineInfo = getDeadlineInfo(task);
  const isMonday = new Date().getDay() === 1;

  if (deadlineInfo?.tone === "overdue") {
    return `"${task.text}" уже просрочена. Хватит откладывать, вернись к ней сейчас.`;
  }

  if (deadlineInfo?.tone === "today") {
    return `Сегодня дедлайн по "${task.text}". Это нельзя потерять из головы.`;
  }

  if (deadlineInfo?.tone === "soon" && isMonday) {
    return `Выходные закончились. До срока по "${task.text}" осталось мало времени.`;
  }

  if (deadlineInfo?.tone === "soon") {
    return `До срока по "${task.text}" осталось мало времени. Зайди и сдвинь её.`;
  }

  if (heat <= 15) {
    return `"${task.text}" почти умерла. Зайди и спаси её одним действием.`;
  }

  if (heat <= 35) {
    return `"${task.text}" остывает. Вернись и подними ей температуру.`;
  }

  return `Пока ты отвлеклась, "${task.text}" ждёт твоего следующего шага.`;
}

function getFirstOpenSubtask(task) {
  return (task?.subtasks || []).find((subtask) => !subtask.completed) || null;
}

function buildPanicPlan(task) {
  if (!task) {
    return {
      title: "Зависать сейчас не на чем",
      intro: "Нет активной цели. Добавьте одну задачу, и panic mode сможет разрезать её на микрошаг.",
      steps: [],
    };
  }

  const firstOpenSubtask = getFirstOpenSubtask(task);

  if (firstOpenSubtask) {
    return {
      title: task.text,
      intro: "Не надо делать всю задачу. Сделайте только один открытый шаг и остановитесь, если захотите.",
      steps: [
        `Откройте всё, что нужно для шага: "${firstOpenSubtask.text}".`,
        `Поработайте над ним ровно 2 минуты, даже если получится криво.`,
        "После таймера либо отметьте сдвиг, либо добавьте следующий микрошаг.",
      ],
    };
  }

  return {
    title: task.text,
    intro: "У задачи пока нет подпунктов. Значит цель сейчас не сделать её, а всего лишь запустить движение.",
    steps: [
      `Откройте всё, что связано с задачей "${task.text}".`,
      "Сделайте один уродливый первый шаг на 2 минуты.",
      "Если станет легче, сразу добавьте первый подпункт прямо из panic mode.",
    ],
  };
}

function formatCountdown(secondsLeft) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${minutes}:${`${seconds}`.padStart(2, "0")}`;
}

function getUrgencyLabel(urgency) {
  if (urgency === "high") return "Срочно";
  if (urgency === "medium") return "Норм";
  return "Можно позже";
}

function getResistanceLabel(resistance) {
  if (resistance === "high") return "Страшно";
  if (resistance === "medium") return "Средне";
  return "Легко";
}

function getVitalLabel(isVital) {
  return isVital ? "Жизненно важно" : "Обычный приоритет";
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [score, setScore] = useState(0);
  const [activeTab, setActiveTab] = useState("active");
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [minLoadDone, setMinLoadDone] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    return saved;
  });
  const [pulseState, setPulseState] = useState(() => getDefaultPulseState());
  const [highlightTaskId, setHighlightTaskId] = useState(null);
  const [nudgeStatus, setNudgeStatus] = useState("");
  const [panicOpen, setPanicOpen] = useState(false);
  const [companionFlash, setCompanionFlash] = useState(null);
  const [dragTaskId, setDragTaskId] = useState(null);
  const [fogMode, setFogMode] = useState(false);
  const [cemeteryDigest, setCemeteryDigest] = useState(null); // { tasks: [...] }
  const [snapshots, setSnapshots] = useState(null); // null = not loaded yet
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null); // snapshot pending confirm
  const [expandedTimeTaskId, setExpandedTimeTaskId] = useState(null);
  const devilAutoCleanLastRef = useRef(0);

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
  // True once Firestore subcollection has delivered at least one snapshot (or migration finished).
  // Blocks per-task saveTask calls until server state is confirmed.
  const firestoreReadyRef = React.useRef(false);
  const navigate = useNavigate();
  const notificationPermission =
    typeof window === "undefined" || !("Notification" in window)
      ? "unsupported"
      : Notification.permission;

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

  // Safety net: if loading never resolves (Firestore unreachable, corrupt localStorage, etc.)
  // force-dismiss the loading screen after 10 seconds so the app becomes usable.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    firestoreReadyRef.current = false;
  }, [user?.id]);

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
    const storedUser = localStorage.getItem("adhdUser");
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
        const localTasks = JSON.parse(localStorage.getItem("adhd_planner_tasks") || "[]") || [];
        const localScore = parseInt(localStorage.getItem("adhd_planner_score"), 10) || 0;
        setTasks(localTasks);
        setScore(localScore);
        setLoading(false);
        setDataLoaded(true);
        return () => {};
      } else {
        const cachedCloudData = loadCloudCache(parsedUser.id);

        if (cachedCloudData) {
          setTasks(cachedCloudData.tasks || []);
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

              const healedTasks = tasks.map((task) =>
                shouldAutoReviveProtectedDeadTask(task) ? reviveProtectedDeadTask(task) : task,
              );

              const repairedTasks = healedTasks.filter(
                (task, index) => task !== tasks[index],
              );

              if (repairedTasks.length > 0) {
                console.warn(
                  "[Planner] Auto-revived protected dead tasks from stale state:",
                  repairedTasks.map((task) => task.text),
                );
                repairedTasks.forEach((task) => {
                  saveTask(parsedUser.id, task).catch((error) => {
                    console.error("[Planner] auto-revive save failed:", error);
                  });
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
  }, [navigate]);

  useEffect(() => {
    if (!user?.id) return;
    setPulseState(loadPulseState(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(getPulseStorageKey(user.id), JSON.stringify(pulseState));
  }, [pulseState, user?.id]);

  useEffect(() => {
    if (!user?.id || user.id.startsWith("guest_")) return;
    saveCloudCache(user.id, tasks, score);
  }, [tasks, score, user?.id]);

  // Guest mode: sync to localStorage whenever tasks or score change
  useEffect(() => {
    if (!dataLoaded || !user?.id.startsWith("guest_")) return;
    localStorage.setItem("adhd_planner_tasks", JSON.stringify(tasks));
    localStorage.setItem("adhd_planner_score", score.toString());
  }, [tasks, score, dataLoaded, user?.id]);

  // Game tick (cooling tasks based on heatBase and lastUpdated)
  // Uses functional setTasks so it always operates on the latest state —
  // prevents a stale closure from reverting a just-completed task back to active.
  useEffect(() => {
    if (loading || !dataLoaded) return;
    // Accumulate newly-dead tasks outside the updater so we can persist them.
    const pendingDead = { current: [] };
    const interval = setInterval(() => {
      const now = Date.now();
      pendingDead.current = [];

      setTasks(prevTasks => {
        if (prevTasks.length === 0) return prevTasks;
        let changed = false;
        const dead = [];

        const next = prevTasks.map(task => {
          if (task.status !== "active") return task;
          const timeElapsed = now - task.lastUpdated;
          const decayWindowMs = getTaskDecayWindowMs(task);
          const currentHeatValue = Math.max(0, task.heatBase * (1 - timeElapsed / decayWindowMs));
          const newTask = { ...task, heatCurrent: currentHeatValue };
          const protectedFromAutoDeath = isAutoDeathProtected(task);

          if (currentHeatValue <= 0 && !protectedFromAutoDeath) {
            newTask.status = "dead";
            newTask.deadAt = now;
            newTask.isToday = false;
            changed = true;
            dead.push(newTask);
          } else if (Math.abs((task.heatCurrent || 0) - currentHeatValue) > 0.5) {
            changed = true;
          }
          return newTask;
        });

        pendingDead.current = dead;
        return changed ? next : prevTasks;
      });

      // Handle score + Firestore persist for tasks that just died.
      // Runs synchronously after setTasks is enqueued; pendingDead is already populated.
      const dead = pendingDead.current;
      if (dead.length > 0) {
        const penalty = dead.length * 5;
        setScore(s => {
          const newS = s - penalty;
          persistScore(newS);
          return newS;
        });
        dead.forEach(t => persistTask(t));
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [loading, dataLoaded]);

  const activeTasks = tasks.filter((task) => task.status === "active");
  const completedTasks = tasks.filter((task) => task.status === "completed");
  const deadTasks = tasks.filter((task) => task.status === "dead");
  const todayPinnedTasks = activeTasks.filter((task) => task.isToday);
  const visibleActiveTasks = activeFilter === "today" ? todayPinnedTasks : activeTasks;
  const missionSelection = getMissionSelection(activeTasks);
  const rescueTask = missionSelection.task;
  const missionReason = missionSelection.reason;
  const panicTask = tasks.find((task) => task.id === panicTaskId) || rescueTask;
  const panicPlan = buildPanicPlan(panicTask);
  const rescueDeadline = getDeadlineInfo(rescueTask);
  const tasksInDanger = activeTasks.filter((task) => getTaskHeat(task) <= 25).length;
  const todayActions = pulseState.lastActionDay === getDayKey() ? pulseState.actionsToday || 0 : 0;
  const panicSecondsLeft = panicEndsAt ? Math.max(0, Math.ceil((panicEndsAt - panicTick) / 1000)) : 0;

  const scrollTaskIntoView = (taskId) => {
    const element = document.querySelector(`[data-task-id="${taskId}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const focusTaskInList = (taskId) => {
    setActiveTab("active");
    setHighlightTaskId(taskId);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => scrollTaskIntoView(taskId), 90);
    });
  };

  const sendBrowserNudge = (task, { isTest = false } = {}) => {
    if (notificationPermission === "unsupported") {
      setNudgeStatus("Браузер не поддерживает системные уведомления.");
      return;
    }

    if (notificationPermission !== "granted") {
      setNudgeStatus("Сначала разрешите уведомления, потом я смогу пинать.");
      return;
    }

    const message = isTest
      ? `Тестовый пинок. ${task ? `"${task.text}" всё ещё ждёт.` : "Planner умеет до вас докапываться."}`
      : buildNudgeMessage(task);

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

    const timer = setTimeout(() => {
      scrollTaskIntoView(highlightTaskId);
    }, 80);

    return () => clearTimeout(timer);
  }, [activeTab, highlightTaskId, tasks]);

  useEffect(() => {
    if (!highlightTaskId) return;
    const stillActive = activeTasks.some((task) => task.id === highlightTaskId);
    if (!stillActive) {
      setHighlightTaskId(null);
    }
  }, [activeTasks, highlightTaskId]);

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

    const interval = setInterval(() => {
      setPanicTick(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [panicEndsAt]);

  useEffect(() => {
    if (!panicEndsAt) return;
    if (panicSecondsLeft > 0) return;

    setPanicEndsAt(null);
    setNudgeStatus("2 минуты прошли. Даже микро-сдвиг уже считается.");
  }, [panicEndsAt, panicSecondsLeft]);

  // ── Cloud persistence helpers ──────────────────────────────────────────────
  const isCloudUser = user?.id && !user.id.startsWith("guest_");

  const persistTask = (task) => {
    if (!isCloudUser || !firestoreReadyRef.current) return;
    saveTask(user.id, task).catch((e) => console.error("[saveTask]", e));
  };

  const persistScore = (newScore) => {
    if (!isCloudUser) return;
    saveScore(user.id, newScore).catch((e) => console.error("[saveScore]", e));
  };

  const handleAddTask = (text, options = {}) => {
    const now = Date.now();
    const newTask = {
      id: now.toString(),
      text,
      lastUpdated: now,
      heatBase: DEFAULT_TASK_HEAT,
      heatCurrent: DEFAULT_TASK_HEAT,
      status: "active",
      subtasks: [],
      urgency: options.urgency || "medium",
      resistance: "medium",
      isToday: false,
      isVital: false,
    };
    setTasks((currentTasks) => [newTask, ...currentTasks]);
    persistTask(newTask);
    setHighlightTaskId(newTask.id);
    trackDailyAction();
  };

  // Adds today's date to task.activeDays (a set stored as sorted array).
  // Call this inside any setTasks updater that already has the task object.
  const withActiveDay = (task) => {
    const today = getDayKey();
    const prev = task.activeDays || [];
    if (prev.includes(today)) return task;
    return { ...task, activeDays: [...prev, today].sort() };
  };

  const handleTouch = (taskId) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(t => {
      if (t.id !== taskId) return t;
      const newHeatBase = Math.min(100, t.heatCurrent + TOUCH_HEAT_BONUS);
      saved = withActiveDay({ ...t, lastUpdated: Date.now(), heatBase: newHeatBase, heatCurrent: newHeatBase });
      return saved;
    }));
    if (saved) persistTask(saved);
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const handleAddSubtask = (taskId, text) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(t => {
      if (t.id !== taskId) return t;
      const newSubtasks = [...(t.subtasks || []), { id: Date.now().toString(), text, completed: false }];
      saved = { ...t, subtasks: newSubtasks, lastUpdated: Date.now() };
      return saved;
    }));
    if (saved) persistTask(saved);
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const handleEditTask = (taskId, newText) => {
    if (!newText.trim()) return;
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(t => {
      if (t.id !== taskId) return t;
      saved = withActiveDay({ ...t, text: newText.trim(), lastUpdated: Date.now() });
      return saved;
    }));
    if (saved) persistTask(saved);
  };

  const handleAddTime = (taskId, elapsedMs) => {
    if (!elapsedMs || elapsedMs <= 0) return;
    const today = getDayKey();
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(t => {
      if (t.id !== taskId) return t;
      const timeByDay = { ...(t.timeByDay || {}) };
      timeByDay[today] = (timeByDay[today] || 0) + elapsedMs;
      saved = withActiveDay({ ...t, timeSpent: (t.timeSpent || 0) + elapsedMs, timeByDay, lastUpdated: Date.now() });
      return saved;
    }));
    if (saved) persistTask(saved);
  };

  const handleDeleteSubtask = (taskId, subtaskId) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(t => {
      if (t.id !== taskId) return t;
      saved = { ...t, subtasks: (t.subtasks || []).filter(s => s.id !== subtaskId), lastUpdated: Date.now() };
      return saved;
    }));
    if (saved) persistTask(saved);
  };

  const handleEditSubtask = (taskId, subtaskId, newText) => {
    if (!newText.trim()) return;
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(t => {
      if (t.id !== taskId) return t;
      saved = withActiveDay({
        ...t,
        subtasks: (t.subtasks || []).map(s => s.id === subtaskId ? { ...s, text: newText.trim() } : s),
        lastUpdated: Date.now(),
      });
      return saved;
    }));
    if (saved) persistTask(saved);
  };

  const handleToggleSubtask = (taskId, subtaskId) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(t => {
      if (t.id !== taskId) return t;
      const completedBefore = (t.subtasks || []).filter((subtask) => subtask.completed).length;
      const newSubtasks = (t.subtasks || []).map(s =>
        s.id === subtaskId ? { ...s, completed: !s.completed } : s
      );
      const subtasksCount = newSubtasks.length;
      const completedAfter = newSubtasks.filter((subtask) => subtask.completed).length;
      const completionDelta = completedAfter - completedBefore;
      const subtaskWeight = subtasksCount > 0 ? (SUBTASK_COMPLETION_CAP / subtasksCount) : 0;
      let newHeatBase = Math.min(100, Math.max(0, t.heatCurrent + completionDelta * subtaskWeight));
      saved = withActiveDay({ ...t, subtasks: newSubtasks, heatBase: newHeatBase, heatCurrent: newHeatBase, lastUpdated: Date.now() });
      return saved;
    }));
    if (saved) persistTask(saved);
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const handleSetUrgency = (taskId, urgency) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(task => {
      if (task.id !== taskId) return task;
      saved = { ...task, urgency, lastUpdated: Date.now() };
      return saved;
    }));
    if (saved) persistTask(saved);
    setHighlightTaskId(taskId);
  };

  const handleSetResistance = (taskId, resistance) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(task => {
      if (task.id !== taskId) return task;
      saved = { ...task, resistance, lastUpdated: Date.now() };
      return saved;
    }));
    if (saved) persistTask(saved);
    setHighlightTaskId(taskId);
  };

  const handleSetDeadline = (taskId, deadlineAt) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(task => {
      if (task.id !== taskId) return task;
      saved = { ...task, deadlineAt, lastUpdated: Date.now() };
      return saved;
    }));
    if (saved) persistTask(saved);
    setHighlightTaskId(taskId);
  };

  const handleToggleVital = (taskId) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map(task => {
      if (task.id !== taskId) return task;
      saved = { ...task, isVital: !task.isVital, lastUpdated: Date.now() };
      return saved;
    }));
    if (saved) persistTask(saved);
    setHighlightTaskId(taskId);
  };

  const handleComplete = (taskId) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map((task) => {
      if (task.id !== taskId) return task;
      // Auto-complete all subtasks, set heat to 100%, and clear any dead state.
      // User intent (drag to heaven) has absolute priority over pulse level,
      // auto-death timer, and any pending Firestore snapshots.
      const completedSubtasks = (task.subtasks || []).map(s => ({ ...s, completed: true }));
      saved = {
        ...task,
        status: "completed",
        isToday: false,
        lastUpdated: Date.now(),
        completedAt: Date.now(),
        deadAt: null,       // clear if task was previously killed
        subtasks: completedSubtasks,
        heatBase: 100,      // pulse always 100% when user manually sends to heaven
        heatCurrent: 100,
      };
      return saved;
    }));
    const newScore = score + 10;
    setScore(newScore);
    if (saved) persistTask(saved);
    persistScore(newScore);
    trackDailyAction();
  };

  const handleDragEnd = ({ active, over }) => {
    setDragTaskId(null);
    if (!active || !over) return;
    const taskId = String(active.id).replace("task-", "");
    if (over.id === "drop-devil") {
      handleKill(taskId);
      return;
    }
    if (over.id === "drop-angel") {
      handleComplete(taskId);
      return;
    }
    const zoneHeat = { "zone-hot": 80, "zone-passive": 40, "zone-purgatory": 10 };
    if (zoneHeat[over.id] !== undefined) {
      const newHeat = zoneHeat[over.id];
      let saved = null;
      let prevStatus = null;
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t;
        prevStatus = t.status;
        const wasInactive = t.status === "completed" || t.status === "dead";
        saved = {
          ...t,
          heatBase: newHeat,
          heatCurrent: newHeat,
          lastUpdated: Date.now(),
          ...(wasInactive ? { status: "active", isToday: false, deadAt: null } : {}),
        };
        return saved;
      }));
      if (saved) persistTask(saved);
      if (prevStatus === "completed") {
        setScore(s => { const n = s - 10; persistScore(n); return n; });
        flashCompanion("angel", ANGEL_RESURRECT_PHRASES);
      } else if (prevStatus === "dead") {
        setScore(s => { const n = s - 2; persistScore(n); return n; });
        flashCompanion("angel", ANGEL_RESURRECT_PHRASES);
      }
    }
  };

  const DEVIL_KILL_PHRASES = [
    "За дело, босс! 😈",
    "Туда ей и дорога! Муахаха! 💀",
    "Давно пора! Хоронить — так хоронить! 👿",
    "Один взмах — и готово! 😏",
  ];

  const DEVIL_AUTO_CLEAN_PHRASES = [
    "Чистилище переполнено — берусь за уборку! 😈",
    "Тут слишком тесно. Освобождаю место... 💀",
    "Старьё само себя не похоронит! 👿",
    "Пора навести порядок в этом болоте! 😈",
  ];

  const ANGEL_RESURRECT_PHRASES = [
    "Принимаюсь за работу! 👼",
    "Даю второй шанс! Верю в тебя! ✨",
    "Ещё не всё потеряно! 😇",
    "Возвращаю к жизни! 💫",
  ];

  const flashCompanion = (who, phrases) => {
    const msg = phrases[Math.floor(Math.random() * phrases.length)];
    setCompanionFlash({ who, msg });
    setTimeout(() => setCompanionFlash(null), 4000);
  };

  const handleKill = (taskId) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map((task) => {
      if (task.id !== taskId) return task;
      saved = { ...task, status: "dead", isToday: false, lastUpdated: Date.now(), deadAt: Date.now() };
      return saved;
    }));
    const newScore = score - 5;
    setScore(newScore);
    if (saved) persistTask(saved);
    persistScore(newScore);
    flashCompanion("devil", DEVIL_KILL_PHRASES);
  };

  // Devil auto-cleans purgatory when too many cold tasks pile up
  useEffect(() => {
    if (!dataLoaded || tasks.length === 0) return;
    const now = Date.now();
    if (now - devilAutoCleanLastRef.current < DEVIL_AUTO_CLEAN_COOLDOWN_MS) return;

    const coldUnprotected = tasks.filter(
      t => t.status === "active" && getTaskHeat(t) <= 25 && !isAutoDeathProtected(t)
    );
    if (coldUnprotected.length < DEVIL_AUTO_CLEAN_THRESHOLD) return;

    // Kill the 2 coldest non-protected tasks
    const sorted = [...coldUnprotected].sort((a, b) => getTaskHeat(a) - getTaskHeat(b));
    const toKill = sorted.slice(0, 2);
    const killedTasks = toKill.map(t => ({
      ...t, status: "dead", isToday: false, lastUpdated: now, deadAt: now,
    }));
    const killedById = new Map(killedTasks.map(t => [t.id, t]));

    devilAutoCleanLastRef.current = now;

    setTasks(prev => prev.map(t => killedById.get(t.id) || t));
    killedTasks.forEach(t => persistTask(t));
    setScore(s => {
      const newS = s - 5 * killedTasks.length;
      persistScore(newS);
      return newS;
    });
    flashCompanion("devil", DEVIL_AUTO_CLEAN_PHRASES);
  }, [tasks, dataLoaded]); // eslint-disable-line

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

  const handleConnectCalendar = async () => {
    const calProvider = new GoogleAuthProvider();
    calProvider.addScope("https://www.googleapis.com/auth/calendar");
    calProvider.setCustomParameters({
      prompt: "consent select_account",
      include_granted_scopes: "true",
    });

    try {
      const result = await signInWithPopup(auth, calProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCalendarToken(credential.accessToken);
      }
    } catch (e) {
      const popupFlowFailed =
        e?.code === "auth/popup-blocked" ||
        e?.code === "auth/cancelled-popup-request" ||
        e?.code === "auth/popup-closed-by-user";

      if (popupFlowFailed) {
        try {
          await signInWithRedirect(auth, calProvider);
          return;
        } catch (redirectError) {
          console.error("Calendar redirect start error:", redirectError);
        }
      }
      console.error("Calendar connect error:", e);
    }
  };

  const handleResurrect = (taskId) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map((task) => {
      if (task.id !== taskId) return task;
      saved = {
        ...task,
        status: "active",
        heatBase: DEFAULT_TASK_HEAT,
        heatCurrent: DEFAULT_TASK_HEAT,
        lastUpdated: Date.now(),
        isToday: false,
        deadAt: null,
      };
      return saved;
    }));
    const newScore = score - 2;
    setScore(newScore);
    if (saved) persistTask(saved);
    persistScore(newScore);
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const handleReopenCompleted = (taskId) => {
    let saved = null;
    setTasks((currentTasks) => currentTasks.map((task) => {
      if (task.id !== taskId) return task;
      saved = {
        ...task,
        status: "active",
        heatBase: DEFAULT_TASK_HEAT,
        heatCurrent: DEFAULT_TASK_HEAT,
        lastUpdated: Date.now(),
        isToday: false,
        deadAt: null,
      };
      return saved;
    }));
    const newScore = score - 10;
    setScore(newScore);
    if (saved) persistTask(saved);
    persistScore(newScore);
    setHighlightTaskId(taskId);
    trackDailyAction();
    flashCompanion("angel", ANGEL_RESURRECT_PHRASES);
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
      await saveTaskSnapshot(user.id, tasks, score, "manual_web");
      await handleLoadSnapshots();
    } catch (e) {
      console.error("Snapshot save failed:", e);
      setSnapshotLoading(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget || !user?.id) return;
    const snapshotTasks = restoreTarget.tasks || [];
    const currentIds = tasks.map(t => t.id);
    setSnapshotLoading(true);
    try {
      // Save current state before restoring
      await saveTaskSnapshot(user.id, tasks, score, "pre_restore_backup");
      await restoreFromSnapshot(user.id, currentIds, snapshotTasks);
      const restored = snapshotTasks.map(t => ({ ...t, lastUpdated: Date.now() }));
      setTasks(restored);
      if (typeof restoreTarget.score === "number") {
        setScore(restoreTarget.score);
        persistScore(restoreTarget.score);
      }
    } catch (e) {
      console.error("Restore failed:", e);
    }
    setRestoreTarget(null);
    setSnapshots(null); // will reload next open
    setSnapshotLoading(false);
  };

  const handleToggleToday = (taskId) => {
    let message = "";
    let saved = null;

    setTasks((currentTasks) => {
      const currentTodayCount = currentTasks.filter((task) => task.status === "active" && task.isToday).length;

      return currentTasks.map((task) => {
        if (task.id !== taskId) return task;

        const nextValue = !task.isToday;
        if (nextValue && currentTodayCount >= 3) {
          message = "На сегодня можно закрепить максимум 3 задачи. Иначе список снова расползётся.";
          return task;
        }

        message = nextValue
          ? "Задача попала в шортлист на сегодня."
          : "Задача снята с ручного списка на сегодня.";

        saved = { ...task, isToday: nextValue, lastUpdated: Date.now() };
        return saved;
      });
    });

    if (saved) persistTask(saved);
    if (message) setNudgeStatus(message);
    if (message !== "На сегодня можно закрепить максимум 3 задачи. Иначе список снова расползётся.") {
      setHighlightTaskId(taskId);
    } else {
      flashCompanion("angel", [
        "Стоп-стоп-стоп! Три — это уже подвиг. Открепи что-то, чтобы добавить новое 😇",
        "Больше трёх — и всё снова расползётся. Я верю в тебя, но не в этот список! 🙏",
        "Три задачи на сегодня — это план. Четыре — это тревога. Открепи одну! ✨",
      ]);
    }
  };

  const handleQuickRescue = () => {
    if (!rescueTask) return;
    handleTouch(rescueTask.id);
    setNudgeStatus("Цель дня спасена и снова в игре.");
  };

  const openPanicMode = (task = rescueTask) => {
    setPanicTaskId(task?.id || null);
    setPanicOpen(true);
    setPanicEndsAt(null);
    setPanicTick(Date.now());
    setPanicDraftStep("");
  };

  const closePanicMode = () => {
    setPanicOpen(false);
    setPanicEndsAt(null);
    setPanicDraftStep("");
  };

  const handleSpotlightMission = () => {
    if (!rescueTask) return;
    focusTaskInList(rescueTask.id);
    setNudgeStatus("Показываю задачу, которая сейчас сильнее всего проседает.");
  };

  const handleNotificationsClick = async () => {
    if (notificationPermission === "unsupported") {
      setNudgeStatus("Этот браузер не умеет системные уведомления.");
      return;
    }

    if (notificationPermission === "granted") {
      setPulseState((previous) => ({
        ...previous,
        notificationsEnabled: !previous.notificationsEnabled,
      }));
      setNudgeStatus(
        pulseState.notificationsEnabled
          ? "Пинки выключены. Planner временно отстал."
          : "Пинки включены. Если спрячете вкладку, planner будет напоминать."
      );
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setPulseState((previous) => ({
        ...previous,
        notificationsEnabled: true,
      }));
      setNudgeStatus("Уведомления включены. Теперь можно легально надоедать.");
      if (rescueTask) {
        sendBrowserNudge(rescueTask, { isTest: true });
      }
      return;
    }

    setPulseState((previous) => ({
      ...previous,
      notificationsEnabled: false,
    }));
    setNudgeStatus("Разрешение не выдано. Без него системные пинки не полетят.");
  };

  const handleTestNudge = () => {
    sendBrowserNudge(rescueTask, { isTest: true });
  };

  const handleStartPanicSprint = () => {
    if (!panicTask) return;
    setPanicEndsAt(Date.now() + 2 * 60 * 1000);
    setPanicTick(Date.now());
    focusTaskInList(panicTask.id);
    setNudgeStatus("Panic mode запущен. Сейчас только 2 минуты и один шаг.");
  };

  const handlePanicAddStep = () => {
    if (!panicTask || !panicDraftStep.trim()) return;
    handleAddSubtask(panicTask.id, panicDraftStep.trim());
    setPanicDraftStep("");
    setNudgeStatus("Микрошаг добавлен. Теперь двигаться проще.");
  };

  const handlePanicDone = () => {
    if (!panicTask) return;
    handleTouch(panicTask.id);
    closePanicMode();
    setNudgeStatus("Сдвиг засчитан. Этого уже достаточно для сегодняшнего импульса.");
  };

  const handlePanicFocusTask = () => {
    if (!panicTask) return;
    focusTaskInList(panicTask.id);
    setNudgeStatus("Показываю задачу из panic mode.");
  };

  if (loading || !minLoadDone) return <LoadingScreen />;

  const draggedTask = dragTaskId ? tasks.find(t => t.id === dragTaskId) : null;

  return (
    <DndContext sensors={dndSensors} collisionDetection={dndCollision} onDragStart={({ active }) => setDragTaskId(String(active.id).replace("task-", ""))} onDragEnd={handleDragEnd}>
    <div className="app-wrapper">
      <div className="score-panel animated-fade-in">
        <span className="score-icon">⚡</span>
        <span className="score-value">{score}</span>
      </div>

      <header className="header-container animated-fade-in">
        <div className="glass-panel" style={{padding: '15px 25px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div>
            <h1 className="app-title">ADHD Planner</h1>
            <p className="greeting-text">Привет, {user?.first_name || "Гость"}!</p>
          </div>
          <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
            <button
              onClick={() => setFogMode(f => !f)}
              className={`theme-toggle-btn${fogMode ? ' fog-btn-active' : ''}`}
              title={fogMode ? 'Выйти из режима тумана' : 'Режим тумана — один фокус'}
            >🌫️</button>
            <button onClick={toggleTheme} className="theme-toggle-btn" title="Сменить тему">
              {theme === 'dark' ? '🌆' : theme === 'neon' ? '☀️' : '🌙'}
            </button>
            <button
              onClick={handleConnectCalendar}
              className="theme-toggle-btn"
              title={calendarToken ? "Календарь подключён" : "Подключить Google Calendar"}
              style={{ opacity: calendarToken ? 0.5 : 1 }}
            >
              📅
            </button>
            <LogoutButton />
          </div>
        </div>
      </header>

      <section className="daily-pulse-panel glass-panel animated-fade-in">
        <div className="daily-pulse-copy">
          <div className="daily-pulse-kicker">today mission</div>
          <h2 className="daily-pulse-title">
            {rescueTask ? rescueTask.text : "Сегодня всё под контролем"}
          </h2>
          <p className="daily-pulse-description">{buildMissionCopy(rescueTask, missionReason)}</p>
          <div className="daily-pulse-stats">
            <span className="pulse-chip streak">⚔️ streak {pulseState.streak}</span>
            <span className="pulse-chip actions">🫡 действий сегодня {todayActions}</span>
            <span className="pulse-chip danger">☠️ на грани {tasksInDanger}</span>
            <span className="pulse-chip active">🔥 активных {activeTasks.length}</span>
            <span className="pulse-chip today">☀️ сегодня {todayPinnedTasks.length}</span>
            {rescueTask && (
              <span className="pulse-chip mission-reason">🧭 {getMissionReasonLabel(missionReason)}</span>
            )}
            {rescueTask && (
              <>
                {rescueDeadline && (
                  <span className={`pulse-chip deadline ${rescueDeadline.tone}`}>📅 {rescueDeadline.label}</span>
                )}
                {rescueTask.isVital && (
                  <span className="pulse-chip vital">🚨 {getVitalLabel(rescueTask.isVital)}</span>
                )}
                <span className="pulse-chip urgency">⏰ {getUrgencyLabel(rescueTask.urgency)}</span>
                <span className="pulse-chip resistance">🧠 {getResistanceLabel(rescueTask.resistance)}</span>
              </>
            )}
          </div>
        </div>
        <div className="daily-pulse-actions">
          <button
            className="pulse-action-btn primary"
            onClick={handleQuickRescue}
            disabled={!rescueTask}
          >
            🧯 Спасти сейчас
          </button>
          <button
            className="pulse-action-btn"
            onClick={handleSpotlightMission}
            disabled={!rescueTask}
          >
            🎯 Показать цель
          </button>
          <button
            className="pulse-action-btn"
            onClick={() => openPanicMode(rescueTask)}
            disabled={!rescueTask}
          >
            🆘 Panic mode
          </button>
          <button className="pulse-action-btn" onClick={handleNotificationsClick}>
            {notificationPermission === "granted"
              ? pulseState.notificationsEnabled
                ? "🔕 Выключить пинки"
                : "🔔 Включить пинки"
              : "🔔 Разрешить пинки"}
          </button>
          {notificationPermission === "granted" && (
            <button className="pulse-action-btn" onClick={handleTestNudge}>
              🧪 Тестовый пинок
            </button>
          )}
        </div>
        <div className="daily-pulse-footer">
          {nudgeStatus || "Сначала спасайте цель дня, потом уже всё остальное."}
        </div>
      </section>

      {panicOpen && (
        <div className="panic-overlay">
          <div className="panic-modal glass-panel animated-fade-in">
            <div className="panic-header">
              <div>
                <div className="daily-pulse-kicker">panic mode</div>
                <h2 className="panic-title">{panicPlan.title}</h2>
              </div>
              <button className="panic-close-btn" onClick={closePanicMode}>
                ✕
              </button>
            </div>

            <p className="panic-intro">{panicPlan.intro}</p>

            <div className="panic-step-list">
              {panicPlan.steps.map((step, index) => (
                <div key={step} className="panic-step-item">
                  <span className="panic-step-index">{index + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            <div className="panic-timer-panel">
              <div className="panic-timer-label">
                {panicEndsAt ? "Спринт уже идёт" : "Нужен только микросдвиг"}
              </div>
              <div className="panic-timer-value">
                {panicEndsAt ? formatCountdown(panicSecondsLeft) : "2:00"}
              </div>
            </div>

            <div className="panic-step-builder">
              <input
                type="text"
                value={panicDraftStep}
                onChange={(event) => setPanicDraftStep(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handlePanicAddStep()}
                placeholder="Если мозг кипит, впиши сюда самый крошечный следующий шаг"
                className="panic-step-input"
              />
              <button className="pulse-action-btn" onClick={handlePanicAddStep}>
                ＋ Добавить шаг
              </button>
            </div>

            <div className="panic-actions-grid">
              <button className="pulse-action-btn primary" onClick={handleStartPanicSprint}>
                ⏱️ Запустить 2 минуты
              </button>
              <button className="pulse-action-btn" onClick={handlePanicDone}>
                ✅ Я сдвинулась
              </button>
              <button className="pulse-action-btn" onClick={handlePanicFocusTask}>
                🎯 Показать задачу
              </button>
              <button className="pulse-action-btn" onClick={closePanicMode}>
                Позже
              </button>
            </div>
          </div>
        </div>
      )}
      
      {cemeteryDigest && (
        <div className="cemetery-digest animated-fade-in">
          <div className="cemetery-digest-header">
            <span>👼 Ангел заглянул на кладбище</span>
            <button className="cemetery-digest-close" onClick={() => setCemeteryDigest(null)}>✕</button>
          </div>
          <p className="cemetery-digest-subtitle">
            {tasks.filter(t => t.status === "dead").length} задач отдыхают. Может, кому-то дать второй шанс?
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
                }}>↩️ Воскресить</button>
              </div>
            ))}
          </div>
          <div className="cemetery-digest-footer">
            <button className="cemetery-digest-goto" onClick={() => { setActiveTab('cemetery'); setCemeteryDigest(null); }}>
              Открыть кладбище
            </button>
            <button className="cemetery-digest-dismiss" onClick={() => setCemeteryDigest(null)}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      <div className="tabs-navigation animated-fade-in" style={{maxWidth: '1200px'}}>
        <button className={`tab-btn ${activeTab === 'active' ? 'active tab-active' : ''}`} onClick={() => setActiveTab('active')}>
          🔥 {activeTasks.length} В процессе
        </button>
        <button className={`tab-btn ${activeTab === 'heaven' ? 'active tab-heaven' : ''}`} onClick={() => setActiveTab('heaven')}>
          ☁️ {completedTasks.length} Рай
        </button>
        <button className={`tab-btn ${activeTab === 'cemetery' ? 'active tab-cemetery' : ''}`} onClick={() => setActiveTab('cemetery')}>
          🪦 {deadTasks.length} Кладбище
        </button>
        <button className={`tab-btn ${activeTab === 'stats' ? 'active tab-stats' : ''}`} onClick={() => setActiveTab('stats')}>
          📊 Прогресс
        </button>
      </div>

      {activeTab === 'active' && (
        <div className="active-filter-bar animated-fade-in">
          <button
            className={`active-filter-btn ${activeFilter === "all" ? "is-active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            Все активные
          </button>
          <button
            className={`active-filter-btn ${activeFilter === "today" ? "is-active" : ""}`}
            onClick={() => setActiveFilter("today")}
          >
            ☀️ Только сегодня
          </button>
        </div>
      )}

      <div className="columns-wrapper" style={{maxWidth: '1200px', width: '100%'}}>
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
            highlightTaskId={highlightTaskId}
            calendarToken={calendarToken}
          />
        )}
        {activeTab === 'heaven' && <TaskColumn type="heaven" tasks={completedTasks} onReopenCompleted={handleReopenCompleted} />}
        {activeTab === 'cemetery' && <TaskColumn type="cemetery" tasks={deadTasks} onResurrect={handleResurrect} />}
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
          const streakLabel = pulseState.streak === 1 ? 'день подряд' : pulseState.streak >= 2 && pulseState.streak <= 4 ? 'дня подряд' : 'дней подряд';
          return (
            <div className="stats-panel animated-fade-in">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">⏱️</div>
                  <div className="stat-value">{formatTimeSpent(totalMs)}</div>
                  <div className="stat-label">вложено времени</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">☁️</div>
                  <div className="stat-value">{completedTasks.length}</div>
                  <div className="stat-label">завершено задач</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">⚡</div>
                  <div className="stat-value">{score}</div>
                  <div className="stat-label">очков набрано</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🔥</div>
                  <div className="stat-value">{pulseState.streak || 0}</div>
                  <div className="stat-label">{streakLabel}</div>
                </div>
              </div>

              {topByActivity.length > 0 ? (
                <div className="stats-top-section">
                  <h3 className="stats-section-title">История задач по дням</h3>
                  <div className="stats-top-list">
                    {topByActivity.map((t, i) => {
                      const isExpanded = expandedTimeTaskId === t.id;
                      const createdAt = typeof t.id === 'number' ? t.id : null;
                      const endAt = t.completedAt || t.deadAt || null;
                      const lifespanDays = createdAt && endAt
                        ? Math.ceil((endAt - createdAt) / DAY_MS)
                        : createdAt
                          ? Math.ceil((Date.now() - createdAt) / DAY_MS)
                          : null;

                      // Build calendar: every day from creation to end (max 60 days)
                      const activeDaySet = new Set(t.activeDays || []);
                      const calStart = createdAt ? getDayKey(createdAt) : null;
                      const calEnd = endAt ? getDayKey(endAt) : getDayKey();
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
                              {activeDaysCount > 0 && `${activeDaysCount}д`}
                              {activeDaysCount > 0 && (t.timeSpent || 0) > 0 && ' · '}
                              {(t.timeSpent || 0) > 0 && formatTimeSpent(t.timeSpent)}
                            </span>
                            <span className="stats-expand-arrow">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                          {isExpanded && (
                            <div className="stats-time-detail">
                              <div className="stats-time-meta">
                                {createdAt && (
                                  <span>📅 {new Date(createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                                )}
                                {t.completedAt && (
                                  <span>→ ☁️ {new Date(t.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                                )}
                                {t.deadAt && !t.completedAt && (
                                  <span>→ 🪦 {new Date(t.deadAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                                )}
                                {lifespanDays !== null && (
                                  <span>· {lifespanDays} {lifespanDays === 1 ? 'день' : lifespanDays >= 2 && lifespanDays <= 4 ? 'дня' : 'дней'}</span>
                                )}
                                {activeDaysCount > 0 && (
                                  <span>· активна {activeDaysCount} {activeDaysCount === 1 ? 'день' : activeDaysCount >= 2 && activeDaysCount <= 4 ? 'дня' : 'дней'}</span>
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
                                  <div className="stats-day-log-title">⏱ Точное время (таймер)</div>
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
                                          <span className="stats-day-time">{formatTimeSpent(ms)}</span>
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
                  Пока нет истории.<br />
                  Работай с задачами — и здесь появится хроника.
                </p>
              )}

              {/* Snapshot restore section */}
              <div className="stats-top-section">
                <div className="stats-snapshots-header">
                  <h3 className="stats-section-title">Снапшоты (резервные копии)</h3>
                  <div className="stats-snapshots-actions">
                    <button
                      className="snapshot-btn"
                      onClick={handleCreateSnapshot}
                      disabled={snapshotLoading}
                    >
                      {snapshotLoading ? "..." : "💾 Создать снапшот"}
                    </button>
                    {snapshots === null && (
                      <button
                        className="snapshot-btn secondary"
                        onClick={handleLoadSnapshots}
                        disabled={snapshotLoading}
                      >
                        📂 Загрузить список
                      </button>
                    )}
                  </div>
                </div>

                {snapshots === null && !snapshotLoading && (
                  <p className="stats-empty" style={{padding: '10px 0'}}>
                    Нажми «Загрузить список», чтобы увидеть снапшоты
                  </p>
                )}

                {snapshotLoading && (
                  <p className="stats-empty" style={{padding: '10px 0'}}>Загружается...</p>
                )}

                {snapshots !== null && snapshots.length === 0 && (
                  <p className="stats-empty" style={{padding: '10px 0'}}>Снапшотов пока нет. Нажми «Создать снапшот»!</p>
                )}

                {snapshots !== null && snapshots.length > 0 && (
                  <div className="stats-top-list">
                    {snapshots.map(snap => {
                      const date = snap.capturedAt
                        ? new Date(snap.capturedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : "—";
                      const sourceLabel = snap.source === "pre_restore_backup" ? "авто-бэкап" : snap.source === "migration_pre_subcollection" ? "миграция" : snap.source || "ручной";
                      return (
                        <div key={snap.id} className="stats-top-item snapshot-item">
                          <span className="snapshot-date">{date}</span>
                          <span className="snapshot-count">{snap.taskCount ?? (snap.tasks?.length ?? "?")} задач</span>
                          <span className="snapshot-source">{sourceLabel}</span>
                          <button
                            className="snapshot-restore-btn"
                            onClick={() => setRestoreTarget(snap)}
                          >↩️ Восстановить</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <Companions tasksCount={activeTasks.length} deadCount={deadTasks.length} completedCount={completedTasks.length} tasks={tasks} onAddTask={handleAddTask} onAddSubtask={handleAddSubtask} onDeleteSubtask={handleDeleteSubtask} onKillTask={handleKill} onSetVital={handleToggleVital} onSetUrgency={handleSetUrgency} calendarToken={calendarToken} companionFlash={companionFlash} />
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
                <div className="fog-label">🌫️ ФОКУС СЕЙЧАС</div>
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
                  <button className="fog-action primary" onClick={() => { handleComplete(fogTask.id); setFogMode(false); }}>
                    ✅ Выполнено
                  </button>
                  <button className="fog-action" onClick={() => { handleTouch(fogTask.id); setNudgeStatus("Пульс задан!"); }}>
                    ⚡ Дать импульс
                  </button>
                  <button className="fog-action panic" onClick={() => { setFogMode(false); openPanicMode(fogTask); }}>
                    🆘 Паника
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="fog-label">🌫️ РЕЖИМ ТУМАНА</div>
                <p style={{color: 'rgba(240,224,255,0.6)', textAlign: 'center', margin: 0, fontSize: '1rem'}}>
                  Нет активных задач.<br />Добавь задачу — туман откроется.
                </p>
              </>
            )}

            <button className="fog-exit" onClick={() => setFogMode(false)}>
              Выйти из тумана
            </button>
          </div>
        </div>
      );
    })()}
    {restoreTarget && (
      <div className="fog-overlay" onClick={() => setRestoreTarget(null)}>
        <div className="fog-card" style={{maxWidth: '440px'}} onClick={e => e.stopPropagation()}>
          <div className="fog-label">⚠️ ВОССТАНОВЛЕНИЕ ИЗ СНАПШОТА</div>
          <p style={{color: '#f0e0ff', fontSize: '0.95rem', lineHeight: 1.5, margin: 0}}>
            Текущие задачи будут заменены задачами из снапшота{' '}
            <strong style={{color: '#fbbf24'}}>
              {restoreTarget.capturedAt
                ? new Date(restoreTarget.capturedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : ""}
            </strong>
            {' '}({restoreTarget.taskCount ?? restoreTarget.tasks?.length ?? "?"} задач).
          </p>
          <p style={{color: 'rgba(240,224,255,0.5)', fontSize: '0.82rem', margin: 0}}>
            Перед восстановлением автоматически сохранится резервная копия текущего состояния.
          </p>
          <div className="fog-actions">
            <button className="fog-action primary" onClick={handleConfirmRestore} disabled={snapshotLoading}>
              {snapshotLoading ? "Восстанавливаю..." : "✅ Да, восстановить"}
            </button>
            <button className="fog-action" onClick={() => setRestoreTarget(null)}>
              Отмена
            </button>
          </div>
        </div>
      </div>
    )}
    </DndContext>
  );
}
