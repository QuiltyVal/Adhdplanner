# Migration: Tasks Array → Firestore Subcollection

## Зачем

Сейчас все задачи хранятся как массив в одном документе:
```
Users/{userId} → { tasks: [...], score: 0 }
```

Это антипаттерн для Firestore при мультиустройственном доступе:
- Каждый `save` перезаписывает ВЕСЬ массив
- При двух устройствах — race condition, задачи пропадают
- Нет атомарности на уровне отдельной задачи

## Целевая структура

```
Users/{userId}/
  score: number
  tasks/                    ← subcollection
    {taskId}/               ← отдельный документ для каждой задачи
      id: string
      text: string
      status: "active" | "completed" | "dead"
      urgency: "low" | "medium" | "high"
      resistance: "low" | "medium" | "high"
      isToday: boolean
      isVital: boolean
      isFixed: boolean
      deadlineAt: string | null
      heatBase: number
      heatCurrent: number
      lastUpdated: number
      subtasks: array        ← subtasks остаются массивом внутри задачи
      source: string
```

`score` остаётся в корневом документе `Users/{userId}`.

## Файлы для изменения

### 1. `src/firestoreUtils.js` — полная переработка

Убрать:
- `getUserData` (one-time read всего документа)
- `updateUserData` (write всего массива)
- `subscribeUserData` (listener на весь документ)

Добавить:
```js
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, getDoc, getDocs, serverTimestamp } from "firebase/firestore";

// Подписка на коллекцию задач (real-time)
export function subscribeToTasks(userId, onTasks, onError) {
  const tasksRef = collection(db, "Users", userId, "tasks");
  return onSnapshot(tasksRef, (snapshot) => {
    const tasks = snapshot.docs.map(d => d.data());
    onTasks(tasks);
  }, onError);
}

// Создать или обновить одну задачу
export async function saveTask(userId, task) {
  const taskRef = doc(db, "Users", userId, "tasks", task.id);
  await setDoc(taskRef, task, { merge: true });
}

// Удалить задачу (физически)
export async function deleteTask(userId, taskId) {
  await deleteDoc(doc(db, "Users", userId, "tasks", taskId));
}

// Сохранить score отдельно
export async function saveScore(userId, score) {
  await setDoc(doc(db, "Users", userId), { score }, { merge: true });
}

// Разовое чтение (нужно для миграции)
export async function getAllTasks(userId) {
  const snap = await getDocs(collection(db, "Users", userId, "tasks"));
  return snap.docs.map(d => d.data());
}
```

### 2. `src/App.js` — изменить логику загрузки и синхронизации

**Убрать:**
- весь блок `loadCloudData` с `subscribeUserData`
- `syncReadyRef`, `skipNextCloudSyncRef`, `firestoreReadyRef`, `lastWrittenFingerprintRef`
- sync effect `useEffect([tasks, score, dataLoaded, user])`
- `saveCloudCache` / `loadCloudCache` (можно оставить как запасной вариант)

**Добавить — загрузка:**
```js
useEffect(() => {
  if (!user?.id || user.id.startsWith("guest_")) return;

  const unsubscribe = subscribeToTasks(user.id, (tasks) => {
    setTasks(tasks);
    setLoading(false);
    setDataLoaded(true);
  }, (err) => {
    console.error(err);
    setLoading(false);
  });

  return () => unsubscribe();
}, [user?.id]);
```

**Изменить каждый обработчик задач:**

Вместо `setTasks(newArray)` + ожидания sync effect:

```js
// handleAddTask
const handleAddTask = (text) => {
  const newTask = { id: Date.now().toString(), text, ...defaults };
  setTasks(prev => [newTask, ...prev]);  // optimistic update
  saveTask(user.id, newTask);            // write только эту задачу
};

// handleKill
const handleKill = (taskId) => {
  setTasks(prev => prev.map(t => t.id === taskId ? {...t, status:"dead"} : t));
  saveTask(user.id, { ...tasks.find(t=>t.id===taskId), status:"dead" });
};

// handleComplete
const handleComplete = (taskId) => {
  setTasks(prev => prev.map(t => t.id === taskId ? {...t, status:"completed"} : t));
  saveTask(user.id, { ...tasks.find(t=>t.id===taskId), status:"completed" });
};

// handleTouch, handleToggleVital, handleSetUrgency, handleSetDeadline, etc. — то же самое
// handleAddSubtask, handleDeleteSubtask, handleToggleSubtask — saveTask для родительской задачи

// Game tick — НЕ сохранять heatCurrent в Firestore (он вычисляется от heatBase + lastUpdated)
// Только когда задача умирает (status: "dead") — saveTask
```

**score:**
```js
useEffect(() => {
  if (!user?.id || !dataLoaded) return;
  saveScore(user.id, score);
}, [score]);
```

### 3. `src/AgentChat.js` — обновить импорты

Заменить вызовы через `onAddTask`, `onAddSubtask` и т.д. — они уже проходят через App.js хэндлеры, поэтому агент не трогает Firestore напрямую. **AgentChat.js менять не нужно.**

### 4. Firestore Rules — добавить доступ к subcollection

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /Users/{userId} {
      allow read, write: if request.auth.uid == userId;

      match /tasks/{taskId} {
        allow read, write: if request.auth.uid == userId;
      }

      match /taskSnapshots/{snapshotId} {
        allow read, write: if request.auth.uid == userId;
      }
    }
  }
}
```

Применить в Firebase Console → Firestore → Rules.

### 5. Миграция существующих данных

Написать и запустить одноразовый скрипт (или прямо в браузере после деплоя):

```js
// Запустить один раз в devtools консоли на planner.valquilty.com
// Читает старый массив tasks из корневого документа
// Записывает каждую задачу в subcollection

async function migrate() {
  const { getFirestore, doc, getDoc, collection, setDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
  // ... migration logic
}
```

**Важно:** перед миграцией убедиться что в Firestore есть свежие данные (не потеряны).

## Порядок выполнения

1. ✅ Обновить Firestore Rules (сначала, иначе subcollection недоступна)
2. ✅ Переписать `firestoreUtils.js`
3. ✅ Переписать загрузку в `App.js`
4. ✅ Обновить каждый handler в `App.js` (добавить `saveTask` вызов)
5. ✅ Обновить game tick (не писать heat в Firestore)
6. ✅ Запустить миграцию данных
7. ✅ Проверить: добавить задачу на устройстве А → сразу появляется на устройстве Б

## Что НЕ нужно менять

- `Companions.js` / `AgentChat.js` / `TaskColumn.js` — они работают с локальным state через props
- UI компоненты — не трогать
- Логика heat decay / purgatory / scoring — только убрать запись heatCurrent в Firestore из game tick

## Риски

- **Миграция**: если что-то пойдёт не так, старые данные в `Users/{userId}.tasks[]` останутся нетронутыми — можно откатиться
- **score**: при ошибке записи score может разойтись — некритично
- **MCP сервер на Hetzner**: он тоже пишет в `Users/{userId}.tasks[]` напрямую. После миграции нужно обновить и его (читать/писать в subcollection)

## Текущее состояние (на момент написания плана)

- Ветка: `main`
- Последний коммит: `c76e133`
- Задачи сейчас в: `Users/{userId}.tasks` (массив)
- `firestoreUtils.js` уже имеет `subscribeUserData` + backup snapshots (работа домашнего агента)
- Баг с потерей задач частично закрыт (fromCache guard, hasPendingWrites skip)
- Полное решение — только эта миграция
