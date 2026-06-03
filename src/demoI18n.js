const originalText = new WeakMap();
const originalAttrs = new WeakMap();

const EXACT_TEXT = new Map([
  ["состояние планера", "planner status"],
  ["Состояние планера", "Planner status"],
  ["today mission", "today mission"],
  ["Сегодня всё под контролем", "Everything is under control today"],
  ["нажми, если застряла", "click when stuck"],
  ["streak", "streak"],
  ["сегодня", "today"],
  ["на грани", "at risk"],
  ["активных", "active"],
  ["выгрузить", "brain dump"],
  ["В процессе", "Active"],
  ["В ФОКУСЕ", "IN FOCUS"],
  ["НА ФОНЕ", "IN BACKGROUND"],
  ["ЧИСТИЛИЩЕ", "PURGATORY"],
  ["Рай", "Heaven"],
  ["Кладбище", "Cemetery"],
  ["Прогресс", "Progress"],
  ["Все активные", "All active"],
  ["Только сегодня", "Today only"],
  ["Angel Lab", "Angel Lab"],
  ["Dump", "Dump"],
  ["Черновик от ангела", "Angel draft"],
  ["Задача", "Task"],
  ["Подзадачи", "Subtasks"],
  ["выбрано для добавления", "chosen to add"],
  ["Опциональные шаги", "Optional steps"],
  ["Выбери подзадачи для добавления", "Choose subtasks to add"],
  ["Добавлено", "Added"],
  ["Добавить только задачу", "Add task only"],
  ["Добавить без шагов", "Add without steps"],
  ["Добавить главную задачу без подзадач", "Add main task without subtasks"],
  ["Добавить задачу + выбранные шаги", "Add task + selected steps"],
  ["Добавить задачу + выбранные подзадачи", "Add task + chosen subtasks"],
  ["Оставить без изменений", "Leave unchanged"],
  ["Нет выбранных шагов", "No selected steps"],
  ["Выбери шаги для добавления", "Select steps to add"],
  ["Сначала выбери подзадачи выше", "Select subtasks above first"],
  ["Готово — выйти из Angel Lab", "Done — close Angel Lab"],
  ["Не это", "Not this"],
  ["Назад", "Back"],
  ["Пропустить", "Skip"],
  ["Дальше", "Next"],
  ["В планер", "Open planner"],
  ["Сохранить dump", "Save dump"],
  ["Сохраняю...", "Saving..."],
  ["Останови микрофон", "Stop the mic first"],
  ["Остановить", "Stop"],
  ["Говорить", "Talk"],
  ["Пока пусто. Сохрани первый дамп выше.", "Empty for now. Save the first dump above."],
  ["Делаю черновой разбор...", "Making a draft breakdown..."],
  ["После сохранения здесь появятся карточки задач и опциональные шаги.", "After saving, task cards and optional steps will appear here."],
  ["Начни здесь: нажми Today Mission, чтобы открыть Rescue.", "Start here: click Today Mission to open Rescue."],
  ["В существующую задачу", "Into an existing task"],
  ["Шум/неясно — лучше пропустить", "Noise/unclear — better skip"],
  ["Пока без новых подшагов для добавления.", "No new subtasks to add yet."],
  ["Пока без подшагов. Можно добавить только задачу.", "No subtasks yet. You can add just the task."],
  ["apus · rescue", "apus · rescue"],
  ["× выйти", "× exit"],
  ["«я с тобой. давай одну.»", "\"I'm with you. One thing.\""],
  ["сейчас разбираем", "working on now"],
  ["первый шаг · 2 минуты", "first step · 2 minutes"],
  ["спринт идёт", "sprint running"],
  ["мягкий старт", "soft start"],
  ["если нужно больше опоры", "if you need more support"],
  ["давай", "start"],
  ["сдвиг есть", "I moved"],
  ["✅ Сдвиг есть", "✅ I moved"],
  ["ещё 2 минуты", "2 more minutes"],
  ["✏️ Шаг не ясен", "✏️ Step is unclear"],
  ["Позже", "Later"],
  ["вдох · выдох", "inhale · exhale"],
  ["Сохранить шаг", "Save step"],
  ["Завершить!", "Done!"],
  ["🚀 Завершить!", "🚀 Done!"],
  ["Вспомнил", "I moved"],
  ["👀 Вспомнил", "👀 I moved"],
  ["Старт", "Start"],
  ["▶ Старт", "▶ Start"],
  ["Стоп", "Stop"],
  ["⏹ Стоп", "⏹ Stop"],
  ["На кладбище", "To cemetery"],
  ["× На кладбище", "× To cemetery"],
  ["✖️ На кладбище", "✖️ To cemetery"],
  ["Критично", "Critical"],
  ["Обычно", "Normal"],
  ["критично", "critical"],
  ["☆ Закрепить", "☆ Pin today"],
  ["📌 Закреплено", "📌 Pinned"],
  ["Цель дня", "Mission"],
  ["Срочность", "Urgency"],
  ["Сопротивление", "Resistance"],
  ["Дедлайн", "Deadline"],
  ["Можно позже", "Can wait"],
  ["Нормально", "Normal"],
  ["Срочно", "Urgent"],
  ["Легко", "Easy"],
  ["Средне", "Medium"],
  ["Страшно", "Scary"],
  ["Пульс", "Pulse"],
  ["пульс", "pulse"],
  ["Жизненно важно", "Critical"],
  ["жёсткий дедлайн", "hard deadline"],
  ["жесткий дедлайн", "hard deadline"],
  ["из шортлиста на сегодня", "today shortlist"],
  ["критичный приоритет", "critical priority"],
  ["автовыбор по приоритету", "auto priority"],
  ["без цели", "no mission"],
  ["Просрочено", "Overdue"],
  ["Сегодня", "Today"],
  ["Завтра", "Tomorrow"],
  ["сегодня", "today"],
  ["срочно", "urgent"],
  ["норм", "normal"],
  ["позже", "later"],
  ["страшно", "scary"],
  ["средне", "medium"],
  ["легко", "easy"],
  ["Открыть кладбище", "Open cemetery"],
  ["Закрыть", "Close"],
  ["Понятно", "Got it"],
  ["Чёртик навёл порядок", "Devil cleaned things up"],
  ["Пока тебя не было, кое-что ушло на кладбище.", "While you were away, some tasks went to the cemetery."],
  ["Я навёл порядок", "I cleaned things up"],
  ["Пока тебя не было, я отправил кое-что на кладбище.", "While you were away, I sent a few things to the cemetery."],
  ["Чёртик что-то сделал", "The devil did something"],
  ["Задача без названия", "Untitled task"],
  ["без названия", "untitled"],
  ["вложено времени", "time invested"],
  ["завершено задач", "tasks completed"],
  ["очков набрано", "points earned"],
  ["дней подряд", "day streak"],
  ["дня подряд", "day streak"],
  ["день подряд", "day streak"],
  ["История задач по дням", "Task history by day"],
  ["Журнал событий", "Event log"],
  ["что делали ангел, чертик и система", "what angel, devil, and the system did"],
  ["Пока событий нет. Здесь появятся действия ангела, чертика и системы.", "No events yet. Angel, devil, and system actions will appear here."],
  ["Событие планера", "Planner event"],
  ["Пока нет истории.", "No history yet."],
  ["Работай с задачами — и здесь появится хроника.", "Work with tasks, and the timeline will appear here."],
  ["Точное время (таймер)", "Exact time (timer)"],
  ["Снапшоты (резервные копии)", "Snapshots (backups)"],
  ["Создать снапшот", "Create snapshot"],
  ["Загрузить список", "Load list"],
  ["Загружается...", "Loading..."],
  ["Рай пуст. Завершите задачу!", "Heaven is empty. Complete a task!"],
  ["Кладбище пустует. Так держать!", "The cemetery is empty. Keep it up!"],
  ["Вернуть в активные", "Return to active"],
  ["↩️ Вернуть в активные", "↩️ Return to active"],
  ["В мусор", "To cemetery"],
  ["В небытие", "Delete forever"],
  ["💥 В небытие", "💥 Delete forever"],
  ["Воскресить", "Resurrect"],
  ["🔄 Воскресить", "🔄 Resurrect"],
  ["Убрать тестовый мусор", "Clean test junk"],
  ["В небытие (только тест-мусор)", "Delete forever (test junk only)"],
  ["Нет пламенных задач", "No burning tasks"],
  ["Все либо горит, либо замерзает", "Everything is either burning or freezing"],
  ["Никто не замерзает", "Nobody is freezing"],
  ["Точно всё?", "Really done?"],
  ["Эта задача отправится в Рай. Уверены?", "This task will go to Heaven. Are you sure?"],
  ["ДА!", "YES!"],
  ["ЕЩЕ НЕТ", "NOT YET"],
  ["ФОКУС СЕЙЧАС", "FOCUS NOW"],
  ["РЕЖИМ ТУМАНА", "FOG MODE"],
  ["Нет активных задач.", "No active tasks."],
  ["Добавь задачу — туман откроется.", "Add a task, and fog mode will open."],
  ["Выйти из тумана", "Exit fog"],
  ["ВОССТАНОВЛЕНИЕ ИЗ СНАПШОТА", "RESTORE FROM SNAPSHOT"],
  ["Перед восстановлением автоматически сохранится резервная копия текущего состояния.", "Before restoring, a backup of the current state will be saved automatically."],
  ["Отмена", "Cancel"],
]);

const ATTR_TEXT = new Map([
  ["Сменить тему", "Change theme"],
  ["Очки", "Score"],
  ["Календарь подключён", "Calendar connected"],
  ["Подключить Google Calendar", "Connect Google Calendar"],
  ["Angel Lab — единый вход для выгрузки из головы", "Angel Lab — one place to unload your brain"],
  ["Открыть rescue-сессию", "Open rescue session"],
  ["Открыть настройку задачи", "Open task settings"],
  ["Скрыть настройки", "Hide settings"],
  ["Настроить задачу", "Tune task"],
  ["Жизненно важный приоритет", "Critical priority"],
  ["Двойной клик — редактировать", "Double-click to edit"],
  ["Перетащить", "Drag"],
  ["Удалить шаг", "Delete step"],
  ["Остановить таймер", "Stop timer"],
  ["Запустить таймер", "Start timer"],
  ["Запланировать в Google Calendar", "Schedule in Google Calendar"],
  ["Журнал событий планера", "Planner event log"],
  ["Закрыть Angel Lab", "Close Angel Lab"],
  ["Запустить микрофон", "Start microphone"],
  ["Остановить запись/распознавание", "Stop recording/recognition"],
  ["Таймер rescue-сессии", "Rescue timer"],
  ["Запустить мягкий старт на 2 минуты", "Start a 2-minute soft start"],
  ["Если шаг не ясен, впиши сюда самый крошечный следующий шаг", "If the step is unclear, write the tiniest next move here"],
  ["Например: я запуталась, надо корм коту, врач, документы и я не знаю с чего начать...", "For example: I'm stuck, cat food, doctor, documents, and I don't know where to start..."],
]);

const MONTHS = [
  ["янв.", "Jan"],
  ["февр.", "Feb"],
  ["мар.", "Mar"],
  ["апр.", "Apr"],
  ["мая", "May"],
  ["июн.", "Jun"],
  ["июл.", "Jul"],
  ["авг.", "Aug"],
  ["сент.", "Sep"],
  ["окт.", "Oct"],
  ["нояб.", "Nov"],
  ["дек.", "Dec"],
];

function replaceMonths(value) {
  return MONTHS.reduce((text, [ru, en]) => text.replace(new RegExp(ru.replace(".", "\\."), "gi"), en), value);
}

export function translateDemoText(value) {
  if (typeof value !== "string") return value;
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  let text = value.trim();
  if (!text) return value;

  if (EXACT_TEXT.has(text)) return `${leading}${EXACT_TEXT.get(text)}${trailing}`;
  if (ATTR_TEXT.has(text)) return `${leading}${ATTR_TEXT.get(text)}${trailing}`;

  text = replaceMonths(text);
  text = text
    .replace(/^Привет,\s*(.+)!$/i, "Hi, $1!")
    .replace(/Гость/g, "Guest")
    .replace(/^🔥\s*В ФОКУСЕ\s*\((\d+)\)$/i, "🔥 IN FOCUS ($1)")
    .replace(/^🧊\s*НА ФОНЕ\s*\((\d+)\)$/i, "🧊 IN BACKGROUND ($1)")
    .replace(/^🥶\s*ЧИСТИЛИЩЕ\s*\((\d+)\)$/i, "🥶 PURGATORY ($1)")
    .replace(/^🔥\s*(\d+)\s*В процессе$/i, "🔥 $1 Active")
    .replace(/^☁️\s*(\d+)\s*Рай$/i, "☁️ $1 Heaven")
    .replace(/^🪦\s*(\d+)\s*Кладбище$/i, "🪦 $1 Cemetery")
    .replace(/^📊\s*Прогресс$/i, "📊 Progress")
    .replace(/^⚔️\s*streak\s*(\d+)$/i, "⚔️ streak $1")
    .replace(/^🫡\s*действий сегодня\s*(\d+)$/i, "🫡 actions today $1")
    .replace(/^☠️\s*на грани\s*(\d+)$/i, "☠️ at risk $1")
    .replace(/^🔥\s*активных\s*(\d+)$/i, "🔥 active $1")
    .replace(/^☀️\s*сегодня\s*(\d+)$/i, "☀️ today $1")
    .replace(/^Открытых шагов:\s*(\d+)\.?$/i, "Open steps: $1.")
    .replace(/^Осталось шагов:\s*(\d+)\.?$/i, "Steps left: $1.")
    .replace(/^Открытых шагов:\s*(\d+)\.?$/i, "Open steps: $1.")
    .replace(/^Срок уже прошёл\.\s*Это нужно вытаскивать в первую очередь\.\s*Открытых шагов:\s*(\d+)\.?$/i, "Deadline has passed. Pull this forward first. Open steps: $1.")
    .replace(/^Срок уже прошёл, и это нормально — задача всё ещё достижима\.\s*Открытых шагов:\s*(\d+)\.?$/i, "The deadline passed, and that's okay — the task is still reachable. Open steps: $1.")
    .replace(/^Это надо закрыть сегодня\.\s*Осталось шагов:\s*(\d+)\.?$/i, "This needs to close today. Steps left: $1.")
    .replace(/^Эта задача выбрана из вашего ручного списка на сегодня\.\s*Осталось шагов:\s*(\d+)\.?$/i, "This task came from your Today shortlist. Steps left: $1.")
    .replace(/^Вы пометили это как критичное\.\s*Поэтому она сейчас сверху\.\s*Осталось шагов:\s*(\d+)\.?$/i, "You marked this as critical, so it is on top now. Steps left: $1.")
    .replace(/^Срок уже близко:\s*(.+)\.\s*Осталось шагов:\s*(\d+)\.?$/i, "The deadline is close: $1. Steps left: $2.")
    .replace(/^Это уже почти труп\.\s*Сделай один шаг прямо сейчас, иначе задача уйдёт на кладбище\.\s*Открытых шагов:\s*(\d+)\.?$/i, "This is almost dead. Do one step now, or it will go to the cemetery. Open steps: $1.")
    .replace(/^Задача опасно остыла\.\s*Одного касания хватит, чтобы вернуть ей пульс\.\s*Осталось шагов:\s*(\d+)\.?$/i, "This task is dangerously cold. One touch is enough to restore its pulse. Steps left: $1.")
    .replace(/^Она ещё жива, но уже пытается сбежать из фокуса\.\s*Осталось шагов:\s*(\d+)\.?$/i, "It is still alive, but trying to slip out of focus. Steps left: $1.")
    .replace(/^Это сейчас самый приоритетный кандидат по состоянию задач\.\s*Осталось шагов:\s*(\d+)\.?$/i, "This is currently the strongest priority candidate. Steps left: $1.")
    .replace(/^Сегодня можно не тушить пожары\.\s*Закрой хвосты или добавь новую цель\.$/i, "No fires to put out today. Close loose ends or add a new goal.")
    .replace(/^Следующий шаг:\s*/i, "Next step: ")
    .replace(/^До\s+(.+)$/i, "By $1")
    .replace(/^Просрочено\s*·\s*(.+)$/i, "Overdue · $1")
    .replace(/^Сегодня\s*·\s*(.+)$/i, "Today · $1")
    .replace(/^Завтра\s*·\s*(.+)$/i, "Tomorrow · $1")
    .replace(/^(\d+)\s*дн\.\s*·\s*(.+)$/i, "$1d · $2")
    .replace(/^(\d+)\s*дн\.$/i, "$1d")
    .replace(/^(\d+)\s*д$/i, "$1d")
    .replace(/^(\d+)д$/i, "$1d")
    .replace(/^(\d+)\s*мин$/i, "$1 min")
    .replace(/^(\d+)\s*минуты$/i, "$1 minutes")
    .replace(/^(\d+)\s*минута$/i, "$1 minute")
    .replace(/^(\d+)\s*часа$/i, "$1 hours")
    .replace(/^(\d+)\s*час$/i, "$1 hour")
    .replace(/^<\s*1\s*мин$/i, "< 1 min")
    .replace(/^(\d+)\s*ч\s*(\d+)\s*мин$/i, "$1h $2m")
    .replace(/^(\d+)\s*ч$/i, "$1h")
    .replace(/^(\d+)ч\s*(\d+)м$/i, "$1h $2m")
    .replace(/^(\d+)м\s*(\d+)с$/i, "$1m $2s")
    .replace(/^(\d+)с$/i, "$1s")
    .replace(/^Шаги:\s*(\d+)\s*·\s*выбрано:\s*(\d+)$/i, "Steps: $1 · selected: $2")
    .replace(/^Подзадачи:\s*(\d+)\s*·\s*выбрано для добавления:\s*(\d+)$/i, "Subtasks: $1 · chosen to add: $2")
    .replace(/^Добавить с шагами\s*\((\d+)\)$/i, "Add with steps ($1)")
    .replace(/^Добавить в существующую с шагами\s*\((\d+)\)$/i, "Add to existing with steps ($1)")
    .replace(/^Добавить задачу \+ выбранные подзадачи\s*\((\d+)\)$/i, "Add task + chosen subtasks ($1)")
    .replace(/^(\d+)\s*задач$/i, "$1 tasks")
    .replace(/^(\d+)\s*задачи$/i, "$1 tasks")
    .replace(/^(\d+)\s*задача$/i, "$1 task")
    .replace(/^(\d+)\s*дней$/i, "$1 days")
    .replace(/^(\d+)\s*дня$/i, "$1 days")
    .replace(/^(\d+)\s*день$/i, "$1 day")
    .replace(/^(\d+)\s*задач отдыхают\.\s*Может, кому-то дать второй шанс\?$/i, "$1 tasks are resting. Maybe one deserves a second chance?")
    .replace(/^На кладбище\s*(\d+)\s*задач\.\s*Может, кому-то дать второй шанс\?$/i, "$1 tasks are in the cemetery. Maybe one deserves a second chance?")
    .replace(/^(\d+)\s*задач ждут на кладбище\.\s*Посмотрим — вдруг что-то стоит воскресить\?$/i, "$1 tasks are waiting in the cemetery. Maybe something is worth resurrecting?")
    .replace(/^Я заглянула на кладбище\.\.\.\s*там\s*(\d+)\s*задач\.\s*Может, пора освежить список\?$/i, "I checked the cemetery: $1 tasks are there. Maybe it is time to refresh the list?")
    .replace(/^·\s*активна\s*(\d+)\s*дней$/i, "· active $1 days")
    .replace(/^·\s*активна\s*(\d+)\s*дня$/i, "· active $1 days")
    .replace(/^·\s*активна\s*(\d+)\s*день$/i, "· active $1 day")
    .replace(/^Нажми «Загрузить список», чтобы увидеть снапшоты$/i, "Click \"Load list\" to see snapshots")
    .replace(/^Снапшотов пока нет\. Нажми «Создать снапшот»!$/i, "No snapshots yet. Click \"Create snapshot\".")
    .replace(/^Ангел записал новую задачу «(.+)»\.$/i, "Angel wrote down a new task: \"$1\".")
    .replace(/^Засчитан сдвиг по задаче «(.+)»\.$/i, "Movement counted for \"$1\".")
    .replace(/^Добавлен шаг в задачу «(.+)»\.$/i, "Step added to \"$1\".")
    .replace(/^Ангел отправил «(.+)» в рай\.$/i, "Angel sent \"$1\" to Heaven.")
    .replace(/^Ангел засчитал героическое закрытие «(.+)»: \+(\d+)\.$/i, "Angel counted a heroic completion for \"$1\": +$2.")
    .replace(/^Чёртик отправил «(.+)» на кладбище\.$/i, "Devil sent \"$1\" to the cemetery.")
    .replace(/^Чёртик убрал из рая «(.+)» на кладбище\.$/i, "Devil moved \"$1\" from Heaven to the cemetery.")
    .replace(/^Чёртик выкинул мусорную задачу «(.+)» на кладбище\.$/i, "Devil threw junk task \"$1\" into the cemetery.")
    .replace(/^Текущие задачи будут заменены задачами из снапшота$/i, "Current tasks will be replaced by the snapshot")
    .replace(/^\((\d+|\?) задач\)\.$/i, "($1 tasks).")
    .replace(/^Восстанавливаю\.\.\.$/i, "Restoring...")
    .replace(/^✅ Да, восстановить$/i, "✅ Yes, restore");

  return `${leading}${text}${trailing}`;
}

function shouldSkipNode(node) {
  const parent = node?.parentElement;
  if (!parent) return true;
  const tag = parent.tagName;
  return ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(tag);
}

function walkTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current);
    current = walker.nextNode();
  }
  return nodes;
}

function restoreOriginals(root) {
  for (const node of walkTextNodes(root)) {
    if (originalText.has(node)) {
      const original = originalText.get(node);
      const translatedOriginal = translateDemoText(original);
      const currentValue = node.nodeValue;
      if (currentValue === original || currentValue === translatedOriginal) {
        node.nodeValue = original;
      } else {
        originalText.delete(node);
      }
    }
  }

  const elements = root.querySelectorAll("[title], [placeholder], [aria-label]");
  for (const element of elements) {
    const attrs = originalAttrs.get(element);
    if (!attrs) continue;
    Object.entries(attrs).forEach(([name, value]) => {
      const currentValue = element.getAttribute(name);
      const translatedValue = translateDemoText(value);
      if (currentValue === value || currentValue === translatedValue) {
        element.setAttribute(name, value);
      } else {
        delete attrs[name];
      }
    });
  }
}

export function applyDemoTranslations(language) {
  if (typeof document === "undefined") return;
  const root = document.body;
  if (!root) return;

  if (language !== "en") {
    restoreOriginals(root);
    document.documentElement.lang = "ru";
    return;
  }

  document.documentElement.lang = "en";

  for (const node of walkTextNodes(root)) {
    const currentValue = node.nodeValue;
    const translatedCurrent = translateDemoText(currentValue);
    const storedOriginal = originalText.get(node);

    if (translatedCurrent !== currentValue) {
      originalText.set(node, currentValue);
      node.nodeValue = translatedCurrent;
      continue;
    }

    if (!storedOriginal) continue;

    const translatedOriginal = translateDemoText(storedOriginal);
    if (currentValue === storedOriginal || currentValue === translatedOriginal) {
      node.nodeValue = translatedOriginal;
    } else {
      originalText.delete(node);
    }
  }

  const elements = root.querySelectorAll("[title], [placeholder], [aria-label]");
  for (const element of elements) {
    ["title", "placeholder", "aria-label"].forEach((name) => {
      const currentValue = element.getAttribute(name);
      if (currentValue == null) return;

      const translatedCurrent = translateDemoText(currentValue);
      let attrs = originalAttrs.get(element);
      const storedOriginal = attrs?.[name];

      if (translatedCurrent !== currentValue) {
        if (!attrs) {
          attrs = {};
          originalAttrs.set(element, attrs);
        }
        attrs[name] = currentValue;
        element.setAttribute(name, translatedCurrent);
        return;
      }

      if (!storedOriginal) return;

      const translatedOriginal = translateDemoText(storedOriginal);
      if (currentValue === storedOriginal || currentValue === translatedOriginal) {
        element.setAttribute(name, translatedOriginal);
      } else {
        delete attrs[name];
      }
    });
  }
}
