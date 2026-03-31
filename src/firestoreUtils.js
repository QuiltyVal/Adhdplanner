// firestoreUtils.js
import { doc, getDoc, setDoc } from "firebase/firestore";
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
  }
}
