// firestoreUtils.js
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

// ── Subcollection: subscribe to all tasks (real-time) ─────────────────────────
export function subscribeToTasks(userId, onTasks, onError) {
  const tasksRef = collection(db, "Users", userId, "tasks");
  return onSnapshot(
    tasksRef,
    (snapshot) => {
      const tasks = snapshot.docs.map((d) => d.data());
      onTasks(tasks, snapshot.metadata);
    },
    (error) => {
      console.error("[Firestore] subscribeToTasks error:", error);
      if (typeof onError === "function") onError(error);
    },
  );
}

// ── Subcollection: write one task ─────────────────────────────────────────────
export async function saveTask(userId, task) {
  const taskRef = doc(db, "Users", userId, "tasks", String(task.id));
  await setDoc(taskRef, task, { merge: true });
}

// ── Root doc: write score ─────────────────────────────────────────────────────
export async function saveScore(userId, score) {
  await setDoc(doc(db, "Users", userId), { score }, { merge: true });
}

// ── Root doc: read score (one-time) ──────────────────────────────────────────
export async function getUserScore(userId) {
  try {
    const snap = await getDoc(doc(db, "Users", userId));
    if (!snap.exists()) return 0;
    return typeof snap.data().score === "number" ? snap.data().score : 0;
  } catch (e) {
    console.warn("[Firestore] getUserScore failed:", e);
    return 0;
  }
}

// ── Migration: array-in-doc → subcollection (runs once) ──────────────────────
export async function migrateTasksToSubcollection(userId) {
  try {
    const userDocRef = doc(db, "Users", userId);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) return { migrated: 0 };

    const data = userDocSnap.data();
    const oldTasks = Array.isArray(data.tasks) ? data.tasks : [];
    if (oldTasks.length === 0) return { migrated: 0 };

    // Check subcollection is still empty (don't double-migrate)
    const existingSnap = await getDocs(collection(db, "Users", userId, "tasks"));
    if (!existingSnap.empty) return { migrated: 0, skipped: true };

    // Write backup snapshot of old state before migrating
    try {
      await addDoc(collection(db, "Users", userId, "taskSnapshots"), {
        source: "migration_pre_subcollection",
        kind: "backup",
        taskCount: oldTasks.length,
        score: data.score || 0,
        capturedAt: Date.now(),
        createdAt: serverTimestamp(),
        tasks: oldTasks,
      });
    } catch (snapErr) {
      console.warn("[Migration] Could not write pre-migration snapshot:", snapErr);
    }

    // Write each task to subcollection
    for (const task of oldTasks) {
      if (!task.id) continue;
      await saveTask(userId, task);
    }

    console.log(`[Migration] Moved ${oldTasks.length} tasks to subcollection`);
    return { migrated: oldTasks.length, score: data.score };
  } catch (e) {
    console.error("[Migration] Failed:", e);
    return { migrated: 0, error: e };
  }
}

// ── Legacy: getUserData (still used for brand-new account init) ───────────────
export async function getUserData(userId, email, name) {
  try {
    const userDocRef = doc(db, "Users", userId);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
      const initialData = { name, email, tasks: [], score: 0 };
      await setDoc(userDocRef, initialData);
      return initialData;
    }
    return userDocSnap.data();
  } catch (error) {
    console.error("Ошибка при получении данных:", error);
    if (error.code === "permission-denied") {
      alert(
        "🚨 Ошибка доступа к Firestore (чтение). Зайдите в Firebase Console -> Firestore Database -> Rules.",
      );
    }
    return null;
  }
}

// ── No-ops kept so any still-imported callers don't crash ────────────────────
export function buildClientFingerprint() {
  return "";
}

export async function updateUserData() {
  // Deprecated: use saveTask() per task instead
}

export function subscribeUserData() {
  // Deprecated: use subscribeToTasks() instead
  return () => {};
}
