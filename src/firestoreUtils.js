// firestoreUtils.js
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

function stripClientTaskState(task) {
  if (!task || typeof task !== "object") return task;
  const { __baseLastUpdated, __pendingSyncAt, ...cleanTask } = task;
  return cleanTask;
}

function stripClientTaskStateList(tasks = []) {
  return tasks.map((task) => stripClientTaskState(task));
}

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
  const baseUpdatedAt =
    typeof task?.__baseLastUpdated === "number"
      ? task.__baseLastUpdated
      : typeof task?.lastUpdated === "number"
        ? task.lastUpdated
        : 0;
  const cleanTask = stripClientTaskState(task);
  let normalizedTask = cleanTask;

  await runTransaction(db, async (transaction) => {
    const existingSnap = await transaction.get(taskRef);
    if (existingSnap.exists()) {
      const existingTask = existingSnap.data() || {};
      const existingUpdatedAt =
        typeof existingTask.lastUpdated === "number" ? existingTask.lastUpdated : 0;
      const incomingUpdatedAt =
        typeof cleanTask.lastUpdated === "number" ? cleanTask.lastUpdated : 0;

      // Reject writes coming from a stale base version. This blocks an old tab
      // from overwriting a task that was already changed on another device.
      if (existingUpdatedAt > baseUpdatedAt) {
        const conflictError = new Error("Task changed on another device");
        conflictError.code = "planner/conflict";
        conflictError.existingTask = existingTask;
        console.warn("[Firestore] saveTask rejected remote conflict", {
          taskId: task.id,
          existingUpdatedAt,
          baseUpdatedAt,
          incomingUpdatedAt,
          existingStatus: existingTask.status,
          incomingStatus: cleanTask.status,
        });
        throw conflictError;
      }

      // Device clocks can drift. Make every accepted mutation strictly newer
      // than the base version it was derived from.
      normalizedTask = {
        ...cleanTask,
        lastUpdated: Math.max(incomingUpdatedAt, baseUpdatedAt + 1),
      };
    } else if (typeof cleanTask.lastUpdated !== "number") {
      normalizedTask = { ...cleanTask, lastUpdated: Date.now() };
    }

    transaction.set(taskRef, normalizedTask, { merge: true });
  });

  return normalizedTask;
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

// ── Task Snapshots ─────────────────────────────────────────────────────────────
export async function loadTaskSnapshots(userId) {
  try {
    const q = query(
      collection(db, "Users", userId, "taskSnapshots"),
      orderBy("capturedAt", "desc"),
      limit(8),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("[Firestore] loadTaskSnapshots failed:", e);
    return [];
  }
}

export async function saveTaskSnapshot(userId, tasks, score, source = "manual_web") {
  await addDoc(collection(db, "Users", userId, "taskSnapshots"), {
    source,
    kind: "manual",
    taskCount: tasks.length,
    score: score || 0,
    capturedAt: Date.now(),
    createdAt: serverTimestamp(),
    tasks: stripClientTaskStateList(tasks),
  });
}

// Restores tasks from a snapshot: writes all snapshot tasks (bypassing stale-check),
// and deletes any current tasks not present in the snapshot.
export async function restoreFromSnapshot(userId, currentTaskIds, snapshotTasks) {
  const cleanSnapshotTasks = stripClientTaskStateList(snapshotTasks);
  const snapshotIds = new Set(cleanSnapshotTasks.map(t => String(t.id)));

  // Delete tasks that exist now but are absent from the snapshot
  for (const id of currentTaskIds) {
    if (!snapshotIds.has(String(id))) {
      try {
        await deleteDoc(doc(db, "Users", userId, "tasks", String(id)));
      } catch (e) {
        console.warn("[Firestore] restoreFromSnapshot delete failed:", id, e);
      }
    }
  }

  // Write all snapshot tasks (direct setDoc, no stale-write guard)
  const now = Date.now();
  for (const task of cleanSnapshotTasks) {
    if (!task.id) continue;
    await setDoc(doc(db, "Users", userId, "tasks", String(task.id)), {
      ...task,
      lastUpdated: now,
    });
  }
}
