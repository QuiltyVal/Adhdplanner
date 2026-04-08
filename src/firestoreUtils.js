// firestoreUtils.js
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

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
    async (userDocSnap) => {
      if (!userDocSnap.exists()) {
        const initialData = { name, email, tasks: [], score: 0 };
        await setDoc(userDocRef, initialData);
        onData(initialData);
        return;
      }

      onData(userDocSnap.data());
    },
    (error) => {
      console.error("Ошибка realtime-подписки на Firestore:", error);
      if (typeof onError === "function") {
        onError(error);
      }
    },
  );
}
