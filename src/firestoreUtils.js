// firestoreUtils.js
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Если документа пользователя (userId) нет, создаём его с именем и пустым массивом tasks.
 */
export async function addUserIfNotExists(userId, name) {
  try {
    const userDocRef = doc(db, "Users", userId);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
      await setDoc(userDocRef, { name, tasks: [] });
      console.log("Новый пользователь создан:", userId);
    } else {
      console.log("Пользователь уже существует:", userId);
    }
  } catch (error) {
    console.error("Ошибка при создании пользователя:", error);
  }
}

/**
 * Получаем задачи пользователя.
 */
export async function getUserTasks(userId) {
  try {
    const userDocRef = doc(db, "Users", userId);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const tasks = userDocSnap.data().tasks || [];
      console.log("Получены задачи для пользователя", userId, ":", tasks);
      return tasks;
    } else {
      console.log("Пользователь не найден:", userId);
      return [];
    }
  } catch (error) {
    console.error("Ошибка при получении задач:", error);
    return [];
  }
}

/**
 * Обновляем задачи пользователя.
 */
export async function updateUserTasks(userId, tasks) {
  try {
    const userDocRef = doc(db, "Users", userId);
    await updateDoc(userDocRef, { tasks });
    console.log("Задачи обновлены для пользователя", userId, ":", tasks);
  } catch (error) {
    console.error("Ошибка при обновлении задач:", error);
  }
}
