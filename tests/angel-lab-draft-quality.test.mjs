import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const capturesHandler = require("../api/captures.js");
const { parseDumpUnits } = require("../api/_lib/angel-lab-core.js");

assert.equal(typeof capturesHandler._test?.polishAngelLabTaskCards, "function");
assert.equal(typeof capturesHandler._test?.applyCreateCardSubtaskPreselection, "function");

function countSelectedDraftSubtasks(card) {
  return (Array.isArray(card?.subtasks) ? card.subtasks : [])
    .filter((subtask) => Boolean(subtask?.selected === true || subtask?.selectedByDefault === true || subtask?.checked === true))
    .length;
}

const dumpText = [
  "Мне нужно сегодня разобрать письма от Jobcenter, купить корм коту,",
  "подготовить один блок для портфолио про Apus Planner и записать короткое демо-видео.",
  "Я не понимаю, с чего начать, потому что всё кажется срочным.",
].join(" ");

const rawCards = [
  {
    id: "jobcenter",
    mode: "create",
    title: "Разобрать письма от Jobcenter",
    subtasks: [
      { text: "Открыть Apus Planner demo", confidence: 0.9 },
      { text: "Сделать 3 скриншота: Angel Lab, Quest Loop, Progress", confidence: 0.9 },
      { text: "Составить план", confidence: 0.7 },
    ],
  },
  {
    id: "cat-food",
    mode: "create",
    title: "Купить корм коту",
    subtasks: [
      { text: "Открыть Apus Planner demo", confidence: 0.9 },
      { text: "Добавить корм в корзину или список", confidence: 0.8 },
    ],
  },
  {
    id: "portfolio",
    mode: "create",
    title: "Подготовить блок для портфолио про Apus Planner",
    subtasks: [
      { text: "Собрать материалы", confidence: 0.9 },
      { text: "Создать визуальные элементы", confidence: 0.9 },
    ],
  },
  {
    id: "meta",
    mode: "create",
    title: "Я не понимаю, с чего начать, потому что всё кажется срочным.",
    subtasks: [],
    reason: "noise_unclear",
  },
];

const polished = capturesHandler._test.polishAngelLabTaskCards(rawCards, dumpText);
const preselected = capturesHandler._test.applyCreateCardSubtaskPreselection(polished);

assert.equal(preselected.length, 3, "meta-confusion card should be filtered out");

const jobcenter = preselected.find((card) => card.id === "jobcenter");
assert.ok(jobcenter, "Jobcenter card should remain");
assert.deepEqual(
  jobcenter.subtasks.map((subtask) => subtask.text),
  [
    "Собрать письма в одно место",
    "Открыть первое письмо",
    "Выписать важные даты или требования",
    "Сфотографировать или сохранить письмо",
  ],
);
assert.deepEqual(
  jobcenter.subtasks.map((subtask) => Boolean(subtask.selectedByDefault)),
  [true, false, false, false],
  "Jobcenter should only preselect the first safe step",
);

const catFood = preselected.find((card) => card.id === "cat-food");
assert.ok(catFood, "cat food card should remain");
assert.deepEqual(
  catFood.subtasks.map((subtask) => subtask.text),
  [
    "Проверить, какой корм нужен",
    "Открыть магазин или приложение для заказа",
    "Добавить корм в корзину или список",
    "Купить или заказать корм",
  ],
);
assert.deepEqual(
  catFood.subtasks.map((subtask) => Boolean(subtask.selectedByDefault)),
  [true, false, false, false],
  "Cat food should only preselect the first safe step",
);

const portfolio = preselected.find((card) => card.id === "portfolio");
assert.ok(portfolio, "portfolio card should remain");
assert.deepEqual(
  portfolio.subtasks.map((subtask) => subtask.text),
  [
    "Открыть Apus Planner demo",
    "Сделать 3 скриншота: Angel Lab, Quest Loop, Progress",
    "Записать 30-секундное демо-видео Apus Planner",
    "Написать 3 предложения для portfolio block про Apus Planner",
  ],
);
assert.deepEqual(
  portfolio.subtasks.map((subtask) => Boolean(subtask.selectedByDefault)),
  [true, false, false, false],
  "Portfolio should only preselect the first safe step",
);

const combinedCards = capturesHandler._test.polishAngelLabTaskCards([
  {
    id: "combined",
    mode: "create",
    title: "Разобрать письма от Jobcenter и купить корм коту",
    subtasks: [
      { text: "Открыть первое письмо", confidence: 0.8 },
      { text: "Добавить корм в корзину или список", confidence: 0.8 },
    ],
  },
], "Мне нужно разобрать письма от Jobcenter и купить корм коту.");

assert.deepEqual(
  combinedCards.map((card) => card.title),
  [
    "Разобрать письма от Jobcenter",
    "купить корм коту",
  ],
  "Independent needs joined by 'и' should become separate cards",
);
assert.deepEqual(
  combinedCards[0].subtasks.map((subtask) => subtask.text),
  [
    "Собрать письма в одно место",
    "Открыть первое письмо",
    "Выписать важные даты или требования",
    "Сфотографировать или сохранить письмо",
  ],
  "Split Jobcenter card should get document-specific steps",
);
assert.deepEqual(
  combinedCards[1].subtasks.map((subtask) => subtask.text),
  [
    "Проверить, какой корм нужен",
    "Открыть магазин или приложение для заказа",
    "Добавить корм в корзину или список",
    "Купить или заказать корм",
  ],
  "Split cat-food card should get cat-food-specific steps",
);

const multiplySelectedCards = capturesHandler._test.applyCreateCardSubtaskPreselection([
  {
    id: "multi-selected-cat-food",
    mode: "create",
    title: "Купить корм коту",
    subtasks: [
      { text: "Проверить, какой корм нужен", selected: true, confidence: 0.95 },
      { text: "Открыть магазин или приложение для заказа", selectedByDefault: true, confidence: 0.9 },
      { text: "Добавить корм в корзину или список", checked: true, confidence: 0.88 },
      { text: "Купить или заказать корм", confidence: 0.7 },
    ],
  },
]);

assert.equal(
  countSelectedDraftSubtasks(multiplySelectedCards[0]),
  1,
  "Angel Lab should cap default selected subtasks to one even if the model marks several",
);
assert.deepEqual(
  multiplySelectedCards[0].subtasks.map((subtask) => Boolean(subtask.selectedByDefault)),
  [true, false, false, false],
  "The first explicit safe step should be the only selected default",
);

assert.deepEqual(
  parseDumpUnits("Мне нужно разобрать письма от Jobcenter и купить корм коту.")
    .filter((unit) => unit.actionable)
    .map((unit) => unit.text),
  [
    "разобрать письма от jobcenter",
    "купить корм коту",
  ],
  "Parser should not leave trailing conjunctions when splitting independent actions",
);

console.log("angel lab draft quality tests passed");
