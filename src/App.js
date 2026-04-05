// src/App.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TaskColumn from "./TaskColumn";
import LogoutButton from "./LogoutButton";
import Companions from "./Companions";
import LoadingScreen from "./LoadingScreen";
import { getUserData, updateUserData } from "./firestoreUtils";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import "./App.css";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TASK_HEAT = 35;
const TOUCH_HEAT_BONUS = 12;
const SUBTASK_COMPLETION_CAP = 18;
const URGENCY_DECAY_WINDOWS_MS = {
  low: 7 * DAY_MS,
  medium: 5 * DAY_MS,
  high: 3 * DAY_MS,
};
const MIN_LOADING_MS = 800;
const NUDGE_INTERVAL_MS = 20 * 60 * 1000;
const PULSE_STORAGE_PREFIX = "adhd_planner_pulse";

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

function getTaskHeat(task) {
  return typeof task.heatCurrent === "number" ? task.heatCurrent : task.heatBase || 0;
}

function getTaskDecayWindowMs(task) {
  return URGENCY_DECAY_WINDOWS_MS[task?.urgency || "medium"] || URGENCY_DECAY_WINDOWS_MS.medium;
}

function parseDeadline(deadlineAt) {
  if (!deadlineAt) return null;
  const deadline = new Date(`${deadlineAt}T23:59:59`);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

function getDeadlineInfo(task) {
  const deadline = parseDeadline(task?.deadlineAt);
  if (!deadline) return null;

  const now = Date.now();
  const msLeft = deadline.getTime() - now;
  const daysLeft = Math.ceil(msLeft / DAY_MS);
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
  const urgencyScore = task?.urgency === "high" ? 90 : task?.urgency === "medium" ? 45 : 0;
  const resistanceScore =
    task?.resistance === "high" ? 55 : task?.resistance === "medium" ? 25 : 0;
  const todayScore = task?.isToday ? 40 : 0;
  const heatScore = Math.max(0, 100 - getTaskHeat(task)) * 0.35;
  const staleScore = Math.min(40, Math.max(0, (now - (task?.lastUpdated || now)) / DAY_MS) * 4);

  return deadlineScore + urgencyScore + resistanceScore + todayScore + heatScore + staleScore;
}

function pickRescueTask(tasks) {
  const activeTasks = tasks.filter((task) => task.status === "active");
  if (activeTasks.length === 0) return null;

  return [...activeTasks].sort((left, right) => {
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
  })[0];
}

function buildMissionCopy(task) {
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

  return `Это сейчас ваш самый живой проект. Добейте его, пока пламя не погасло.${openSubtasks ? ` Осталось шагов: ${openSubtasks}.` : ""}`;
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

export default function App() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [score, setScore] = useState(0);
  const [activeTab, setActiveTab] = useState("active");
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [minLoadDone, setMinLoadDone] = useState(false);
  const [isDark, setIsDark] = useState(
    () => (localStorage.getItem('theme') || 'light') === 'dark'
  );
  const [pulseState, setPulseState] = useState(() => getDefaultPulseState());
  const [highlightTaskId, setHighlightTaskId] = useState(null);
  const [nudgeStatus, setNudgeStatus] = useState("");
  const [panicOpen, setPanicOpen] = useState(false);
  const [panicTaskId, setPanicTaskId] = useState(null);
  const [panicEndsAt, setPanicEndsAt] = useState(null);
  const [panicTick, setPanicTick] = useState(Date.now());
  const [panicDraftStep, setPanicDraftStep] = useState("");

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      const themeName = next ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', themeName);
      localStorage.setItem('theme', themeName);
      return next;
    });
  };

  // Flag to distinguish first load from component updates
  const [dataLoaded, setDataLoaded] = useState(false);
  // Prevents the sync effect from firing immediately when data is first loaded
  // (no need to write back what we just read from Firestore)
  const syncReadyRef = React.useRef(false);
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

  // Load User & Data from Cloud
  useEffect(() => {
    const storedUser = localStorage.getItem("adhdUser");
    if (!storedUser) {
      navigate("/login");
      return;
    }

    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);

    const loadCloudData = () => {
      // If guest mode (offline)
      if (parsedUser.id.startsWith("guest_")) {
        const localTasks = JSON.parse(localStorage.getItem("adhd_planner_tasks")) || [];
        const localScore = parseInt(localStorage.getItem("adhd_planner_score"), 10) || 0;
        setTasks(localTasks);
        setScore(localScore);
        setLoading(false);
        setDataLoaded(true);
        return () => {};
      } else {
        // Fetch from Firestore ONCE after Firebase auth state is restored.
        // Unsubscribe immediately after first fire to prevent repeated loads
        // that could race with ongoing saves and overwrite newer data.
        let alreadyLoaded = false;
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (alreadyLoaded) return;
          alreadyLoaded = true;
          unsubscribe();

          if (firebaseUser) {
            const data = await getUserData(parsedUser.id, parsedUser.email, parsedUser.first_name);
            if (data) {
              setTasks(data.tasks || []);
              setScore(data.score || 0);
              setLoading(false);
              setDataLoaded(true);
            } else {
              // Failed to load — don't mark dataLoaded so we don't overwrite Firestore with empty data
              setLoading(false);
            }
          } else {
            console.warn("Пользователь не авторизован в Firebase. Перенаправляем на логин.");
            setLoading(false);
            localStorage.removeItem("adhdUser");
            navigate("/login");
          }
        });
        return unsubscribe;
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

  // Sync to Cloud / Local Storage whenever tasks or score change
  useEffect(() => {
    if (!dataLoaded || !user) return;

    // The first time this effect fires with dataLoaded=true, tasks/score were
    // just SET from Firestore — no need to write them back. Mark ready and skip.
    if (!syncReadyRef.current) {
      syncReadyRef.current = true;
      return;
    }

    if (user.id.startsWith("guest_")) {
      localStorage.setItem("adhd_planner_tasks", JSON.stringify(tasks));
      localStorage.setItem("adhd_planner_score", score.toString());
    } else {
      updateUserData(user.id, tasks, score);
    }
  }, [tasks, score, dataLoaded, user]);

  // Game tick (cooling tasks based on heatBase and lastUpdated)
  useEffect(() => {
    if (loading || tasks.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      let newScore = score;
      
      const updatedTasks = tasks.map(task => {
        if (task.status === "active") {
          const timeElapsed = now - task.lastUpdated;
          const decayWindowMs = getTaskDecayWindowMs(task);
          const currentHeatValue = Math.max(0, task.heatBase * (1 - timeElapsed / decayWindowMs));
          
          let newTask = { ...task, heatCurrent: currentHeatValue };
          
          if (currentHeatValue <= 0) {
            newTask.status = "dead";
            newScore -= 5;
            changed = true;
          } else if (Math.abs((task.heatCurrent || 0) - currentHeatValue) > 0.5) {
            changed = true;
          }
          return newTask;
        }
        return task;
      });

      if (changed) {
        setTasks(updatedTasks);
        if (newScore !== score) setScore(newScore);
      }
    }, 10000); 
    return () => clearInterval(interval);
  }, [tasks, score, loading]);

  const activeTasks = tasks.filter((task) => task.status === "active");
  const completedTasks = tasks.filter((task) => task.status === "completed");
  const deadTasks = tasks.filter((task) => task.status === "dead");
  const todayPinnedTasks = activeTasks.filter((task) => task.isToday);
  const visibleActiveTasks = activeFilter === "today" ? todayPinnedTasks : activeTasks;
  const rescueTask = pickRescueTask(activeTasks);
  const panicTask = tasks.find((task) => task.id === panicTaskId) || rescueTask;
  const panicPlan = buildPanicPlan(panicTask);
  const rescueDeadline = getDeadlineInfo(rescueTask);
  const tasksInDanger = activeTasks.filter((task) => getTaskHeat(task) <= 25).length;
  const todayActions = pulseState.lastActionDay === getDayKey() ? pulseState.actionsToday || 0 : 0;
  const panicSecondsLeft = panicEndsAt ? Math.max(0, Math.ceil((panicEndsAt - panicTick) / 1000)) : 0;

  const focusTaskInList = (taskId) => {
    setActiveTab("active");
    setHighlightTaskId(taskId);
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
      const element = document.querySelector(`[data-task-id="${highlightTaskId}"]`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
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

  const handleAddTask = (text) => {
    const newTask = {
      id: Date.now().toString(),
      text,
      lastUpdated: Date.now(),
      heatBase: DEFAULT_TASK_HEAT,
      heatCurrent: DEFAULT_TASK_HEAT,
      status: "active",
      subtasks: [],
      urgency: "medium",
      resistance: "medium",
      isToday: false,
    };
    setTasks([newTask, ...tasks]);
    setHighlightTaskId(newTask.id);
    trackDailyAction();
  };

  const handleTouch = (taskId) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const newHeatBase = Math.min(100, t.heatCurrent + TOUCH_HEAT_BONUS);
        return { ...t, lastUpdated: Date.now(), heatBase: newHeatBase, heatCurrent: newHeatBase };
      }
      return t;
    }));
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const handleAddSubtask = (taskId, text) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const newSubtasks = [...(t.subtasks || []), { id: Date.now().toString(), text, completed: false }];
        return { ...t, subtasks: newSubtasks };
      }
      return t;
    }));
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const handleToggleSubtask = (taskId, subtaskId) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const completedBefore = (t.subtasks || []).filter((subtask) => subtask.completed).length;
        const newSubtasks = (t.subtasks || []).map(s => {
          if (s.id === subtaskId) {
            return { ...s, completed: !s.completed };
          }
          return s;
        });
        
        const subtasksCount = newSubtasks.length;
        const completedAfter = newSubtasks.filter((subtask) => subtask.completed).length;
        const completionDelta = completedAfter - completedBefore;
        const subtaskWeight = subtasksCount > 0 ? (SUBTASK_COMPLETION_CAP / subtasksCount) : 0;
        
        let newHeatBase = t.heatCurrent;
        newHeatBase = Math.min(100, Math.max(0, newHeatBase + completionDelta * subtaskWeight));
        
        return { 
          ...t, 
          subtasks: newSubtasks, 
          heatBase: newHeatBase, 
          heatCurrent: newHeatBase,
          lastUpdated: Date.now() 
        };
      }
      return t;
    }));
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const handleSetUrgency = (taskId, urgency) => {
    setTasks(tasks.map(task => (
      task.id === taskId
        ? { ...task, urgency, lastUpdated: Date.now() }
        : task
    )));
    setHighlightTaskId(taskId);
  };

  const handleSetResistance = (taskId, resistance) => {
    setTasks(tasks.map(task => (
      task.id === taskId
        ? { ...task, resistance, lastUpdated: Date.now() }
        : task
    )));
    setHighlightTaskId(taskId);
  };

  const handleSetDeadline = (taskId, deadlineAt) => {
    setTasks(tasks.map(task => (
      task.id === taskId
        ? { ...task, deadlineAt, lastUpdated: Date.now() }
        : task
    )));
    setHighlightTaskId(taskId);
  };

  const handleComplete = (taskId) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: "completed", isToday: false } : t));
    setScore(s => s + 10);
    trackDailyAction();
  };

  const handleKill = (taskId) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: "dead", isToday: false } : t));
    setScore(s => s - 5);
  };

  const handleResurrect = (taskId) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: "active", heatBase: DEFAULT_TASK_HEAT, heatCurrent: DEFAULT_TASK_HEAT, lastUpdated: Date.now(), isToday: false } : t));
    setScore(s => s - 2);
    setHighlightTaskId(taskId);
    trackDailyAction();
  };

  const handleToggleToday = (taskId) => {
    setTasks(tasks.map((task) => (
      task.id === taskId
        ? { ...task, isToday: !task.isToday, lastUpdated: Date.now() }
        : task
    )));
    setHighlightTaskId(taskId);
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

  return (
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
            <button onClick={toggleTheme} className="theme-toggle-btn" title="Сменить тему">
              {isDark ? '☀️' : '🌙'}
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
          <p className="daily-pulse-description">{buildMissionCopy(rescueTask)}</p>
          <div className="daily-pulse-stats">
            <span className="pulse-chip streak">⚔️ streak {pulseState.streak}</span>
            <span className="pulse-chip actions">🫡 действий сегодня {todayActions}</span>
            <span className="pulse-chip danger">☠️ на грани {tasksInDanger}</span>
            <span className="pulse-chip active">🔥 активных {activeTasks.length}</span>
            <span className="pulse-chip today">☀️ сегодня {todayPinnedTasks.length}</span>
            {rescueTask && (
              <>
                {rescueDeadline && (
                  <span className={`pulse-chip deadline ${rescueDeadline.tone}`}>📅 {rescueDeadline.label}</span>
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
            onAddSubtask={handleAddSubtask}
            onToggleSubtask={handleToggleSubtask}
            onToggleToday={handleToggleToday}
            onSetUrgency={handleSetUrgency}
            onSetResistance={handleSetResistance}
            onSetDeadline={handleSetDeadline}
            highlightTaskId={highlightTaskId}
          />
        )}
        {activeTab === 'heaven' && <TaskColumn type="heaven" tasks={completedTasks} />}
        {activeTab === 'cemetery' && <TaskColumn type="cemetery" tasks={deadTasks} onResurrect={handleResurrect} />}
      </div>

      <Companions tasksCount={activeTasks.length} deadCount={deadTasks.length} completedCount={completedTasks.length} />
    </div>
  );
}
