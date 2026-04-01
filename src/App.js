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

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const MIN_LOADING_MS = 2200;

export default function App() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [score, setScore] = useState(0);
  const [activeTab, setActiveTab] = useState("active");
  const [loading, setLoading] = useState(true);
  const [minLoadDone, setMinLoadDone] = useState(false);
  const [isDark, setIsDark] = useState(
    () => (localStorage.getItem('theme') || 'light') === 'dark'
  );

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      const themeName = next ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', themeName);
      localStorage.setItem('theme', themeName);
      return next;
    });
  };

  // Flag to distinct first load from component updates
  const [dataLoaded, setDataLoaded] = useState(false);
  const navigate = useNavigate();

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
      } else {
        // Fetch from Firestore but ONLY after Firebase auth state is restored
        onAuthStateChanged(auth, async (firebaseUser) => {
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
            // НЕ ставим dataLoaded=true чтобы не перезаписать данные пустым массивом!
            console.warn("Пользователь не авторизован в Firebase. Перенаправляем на логин.");
            setLoading(false);
            localStorage.removeItem("adhdUser");
            navigate("/login");
          }
        });
      }
    };

    loadCloudData();
  }, [navigate]);

  // Sync to Cloud / Local Storage whenever tasks or score change
  useEffect(() => {
    // Prevent overwriting DB with empty array before initial load
    if (!dataLoaded || !user) return; 

    // Guest mode saves to localStorage
    if (user.id.startsWith("guest_")) {
      localStorage.setItem("adhd_planner_tasks", JSON.stringify(tasks));
      localStorage.setItem("adhd_planner_score", score.toString());
    } else {
      // Cloud mode saves to Firestore
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
          const currentHeatValue = Math.max(0, task.heatBase - (timeElapsed / FORTY_EIGHT_HOURS_MS) * 100);
          
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

  const handleAddTask = (text) => {
    const newTask = {
      id: Date.now().toString(),
      text,
      lastUpdated: Date.now(),
      heatBase: 50, // Starts WARM
      heatCurrent: 50,
      status: "active",
      subtasks: []
    };
    setTasks([newTask, ...tasks]);
  };

  const handleTouch = (taskId) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const newHeatBase = Math.min(100, t.heatCurrent + 15);
        return { ...t, lastUpdated: Date.now(), heatBase: newHeatBase, heatCurrent: newHeatBase };
      }
      return t;
    }));
  };

  const handleAddSubtask = (taskId, text) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const newSubtasks = [...(t.subtasks || []), { id: Date.now().toString(), text, completed: false }];
        return { ...t, subtasks: newSubtasks };
      }
      return t;
    }));
  };

  const handleToggleSubtask = (taskId, subtaskId) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        let isCompleting = false;
        const newSubtasks = (t.subtasks || []).map(s => {
          if (s.id === subtaskId) {
            isCompleting = !s.completed;
            return { ...s, completed: !s.completed };
          }
          return s;
        });
        
        const subtasksCount = newSubtasks.length;
        const subtaskWeight = subtasksCount > 0 ? (50 / subtasksCount) : 10;
        
        let newHeatBase = t.heatCurrent;
        if (isCompleting) {
          newHeatBase = Math.min(100, newHeatBase + subtaskWeight);
        } else {
          newHeatBase = Math.max(0, newHeatBase - subtaskWeight);
        }
        
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
  };

  const handleComplete = (taskId) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: "completed" } : t));
    setScore(s => s + 10);
  };

  const handleKill = (taskId) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: "dead" } : t));
    setScore(s => s - 5);
  };

  const handleResurrect = (taskId) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: "active", heatBase: 50, heatCurrent: 50, lastUpdated: Date.now() } : t));
    setScore(s => s - 2);
  };

  if (loading || !minLoadDone) return <LoadingScreen />;

  const activeTasks = tasks.filter(t => t.status === "active");
  const completedTasks = tasks.filter(t => t.status === "completed");
  const deadTasks = tasks.filter(t => t.status === "dead");

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

      <div className="columns-wrapper" style={{maxWidth: '1200px', width: '100%'}}>
        {activeTab === 'active' && (
          <TaskColumn
            type="active"
            tasks={activeTasks}
            onTouch={handleTouch}
            onComplete={handleComplete}
            onKill={handleKill}
            onAddTask={handleAddTask}
            onAddSubtask={handleAddSubtask}
            onToggleSubtask={handleToggleSubtask}
          />
        )}
        {activeTab === 'heaven' && <TaskColumn type="heaven" tasks={completedTasks} />}
        {activeTab === 'cemetery' && <TaskColumn type="cemetery" tasks={deadTasks} onResurrect={handleResurrect} />}
      </div>

      <Companions tasksCount={activeTasks.length} deadCount={deadTasks.length} completedCount={completedTasks.length} />
    </div>
  );
}
