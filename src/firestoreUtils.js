// firestoreUtils.js
import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

function normalizeSubtaskForFingerprint(subtask = {}) {
  return {
    id: String(subtask.id || ""),
    text: String(subtask.text || "").trim(),
    completed: Boolean(subtask.completed),
  };
}

function normalizeTaskForFingerprint(task = {}) {
  return {
    id: String(task.id || ""),
    text: String(task.text || "").trim(),
    status: String(task.status || "active"),
    urgency: String(task.urgency || "medium"),
    resistance: String(task.resistance || "medium"),
    isToday: Boolean(task.isToday),
    isVital: Boolean(task.isVital),
    deadlineAt: String(task.deadlineAt || ""),
    source: String(task.source || ""),
    subtasks: Array.isArray(task.subtasks)
      ? task.subtasks.map(normalizeSubtaskForFingerprint)
      : [],
  };
}

function buildPlannerFingerprint(tasks = [], score = 0) {
  return JSON.stringify({
    score: typeof score === "number" ? score : 0,
    tasks: Array.isArray(tasks) ? tasks.map(normalizeTaskForFingerprint) : [],
  });
}

function hasMeaningfulPlannerState(tasks = [], score = 0) {
  return (Array.isArray(tasks) && tasks.length > 0) || Number(score || 0) !== 0;
}

export function buildClientFingerprint(tasks = [], score = 0) {
  return buildPlannerFingerprint(tasks, score);
}

async function writePlannerSnapshot(userId, snapshotData, source) {
  const tasks = Array.isArray(snapshotData?.tasks) ? snapshotData.tasks : [];
  const score = typeof snapshotData?.score === "number" ? snapshotData.score : 0;

  if (!hasMeaningfulPlannerState(tasks, score)) {
    return;
  }

  await addDoc(collection(db, "Users", userId, "taskSnapshots"), {
    source,
    kind: "pre_write",
    taskCount: tasks.length,
    score,
    fingerprint: buildPlannerFingerprint(tasks, score),
    capturedAt: Date.now(),
    createdAt: serverTimestamp(),
    tasks,
  });
}

/**
 * Получаем задачи и очки пользователя из облака
 */
export async function getUserData(userId, email, name) {
  try {
    const userDocRef = doc(db, "Users", userId);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
      // Инициализация нового аккаунта
      const initialData = { name, email, tasks: [], score: 0 };
      await setDoc(userDocRef, initialData);
      return initialData;
    } else {
      return userDocSnap.data();
    }
  } catch (error) {
    console.error("Ошибка при получении данных:", error);
    if (error.code === 'permission-denied') {
      alert("🚨 Ошибка доступа к Firestore (чтение). Зайдите в Firebase Console -> Firestore Database -> Rules и разрешите доступ для авторизованных пользователей.");
    }
    return null;
  }
}

/**
 * Обновляем задачи и очки
 */
export async function updateUserData(userId, tasks, score) {
  try {
    const userDocRef = doc(db, "Users", userId);
    const currentDoc = await getDoc(userDocRef);
    const currentData = currentDoc.exists() ? currentDoc.data() : { tasks: [], score: 0 };
    const currentTasks = Array.isArray(currentData.tasks) ? currentData.tasks : [];
    const currentScore = typeof currentData.score === "number" ? currentData.score : 0;
    const currentFingerprint = buildPlannerFingerprint(currentTasks, currentScore);
    const nextFingerprint = buildPlannerFingerprint(tasks, score);

    if (currentFingerprint !== nextFingerprint) {
      try {
        await writePlannerSnapshot(userId, { tasks: currentTasks, score: currentScore }, "web");
      } catch (snapshotError) {
        console.warn("Не удалось сохранить backup snapshot перед записью:", snapshotError);
      }
    }

    await setDoc(userDocRef, { tasks, score }, { merge: true });
  } catch (error) {
    console.error("Ошибка при обновлении данных:", error);
    if (error.code === 'permission-denied') {
      alert("🚨 Ошибка сохранения в Firestore! Зайдите в Firebase Console -> Firestore Database -> Rules. Сейчас сохранение на сервер заблокировано правилами базы.");
    }
  }
}

export function subscribeUserData(userId, email, name, onData, onError) {
  const userDocRef = doc(db, "Users", userId);

  return onSnapshot(
    userDocRef,
    (userDocSnap) => {
      if (!userDocSnap.exists()) {
        // NEVER auto-create the document here. A missing doc in onSnapshot
        // can happen when the snapshot comes from an empty local cache on a
        // new device/browser while the network hasn't responded yet.
        // Writing {tasks:[]} would overwrite the real user data in Firestore.
        // Account creation is handled by getUserData during sign-up only.
        if (userDocSnap.metadata.fromCache) {
          console.warn("[Firestore] Snapshot from cache, document missing — waiting for server.");
          return;
        }
        // Server confirmed the document truly does not exist.
        // This should only happen for brand-new accounts.
        console.warn("[Firestore] Document does not exist on server — initializing.");
        const initialData = { name, email, tasks: [], score: 0 };
        setDoc(userDocRef, initialData).catch(e => console.error("Init error:", e));
        onData(initialData);
        return;
      }

      onData(userDocSnap.data(), userDocSnap.metadata);
    },
    (error) => {
      console.error("Ошибка realtime-подписки на Firestore:", error);
      if (typeof onError === "function") {
        onError(error);
      }
    },
  );
}
