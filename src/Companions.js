import React, { useState, useEffect } from 'react';
import angelImg from './angel.png';
import devilImg from './devil.png';
import { askAI } from './openrouter';
import './Companions.css';

const ANGEL_SYSTEM = `Ты ангел-компаньон в приложении для людей с СДВГ.
Отвечай ОЧЕНЬ коротко — 1 предложение максимум. Тепло, с лёгким юмором, по-русски.
Иногда добавляй эмодзи. Не повторяйся.`;

const DEVIL_SYSTEM = `Ты чертик-провокатор в приложении для людей с СДВГ.
Отвечай ОЧЕНЬ коротко — 1 предложение максимум. Саркастично, немного злодейски, но смешно. По-русски.
Иногда добавляй тёмные эмодзи. Не повторяйся.`;

const ANGEL_FALLBACK = [
  "Ты молодец! Так держать! ✨",
  "Одна маленькая задача — и ты герой!",
  "Дыши глубоко, всё под контролем 😇",
];

const DEVIL_FALLBACK = [
  "Остывает, остывает... муахаха! 💀",
  "На кладбище полно места.",
  "Я жду. Я всегда жду 😈",
];

export default function Companions({ tasksCount, deadCount, completedCount, tasks = [] }) {
  const [angelSpeech, setAngelSpeech] = useState(null);
  const [devilSpeech, setDevilSpeech] = useState(null);
  const [angelBounce, setAngelBounce] = useState(false);
  const [devilBounce, setDevilBounce] = useState(false);
  const [angelThinking, setAngelThinking] = useState(false);
  const [devilThinking, setDevilThinking] = useState(false);

  const getTaskContext = () => {
    const active = tasks.filter(t => t.status === 'active').map(t => t.text).slice(0, 3);
    return `Активных задач: ${tasksCount}. Завершено: ${completedCount}. Умерло: ${deadCount}.${active.length ? ` Примеры: ${active.join(', ')}.` : ''}`;
  };

  useEffect(() => {
    const angelTimer = setInterval(() => {
      if (Math.random() > 0.6 && !angelThinking) {
        const phrase = ANGEL_FALLBACK[Math.floor(Math.random() * ANGEL_FALLBACK.length)];
        setAngelSpeech(phrase);
        setTimeout(() => setAngelSpeech(null), 5000);
      }
    }, 15000);

    const devilTimer = setInterval(() => {
      if (Math.random() > 0.6 && !devilThinking) {
        const phrase = DEVIL_FALLBACK[Math.floor(Math.random() * DEVIL_FALLBACK.length)];
        setDevilSpeech(phrase);
        setTimeout(() => setDevilSpeech(null), 5000);
      }
    }, 18000);

    return () => { clearInterval(angelTimer); clearInterval(devilTimer); };
  }, [angelThinking, devilThinking]);

  const handleAngelClick = async () => {
    setAngelBounce(true);
    setTimeout(() => setAngelBounce(false), 400);
    setAngelThinking(true);
    setAngelSpeech("думаю...");

    try {
      const reply = await askAI(ANGEL_SYSTEM, `Контекст: ${getTaskContext()}. Скажи что-нибудь мотивирующее.`);
      setAngelSpeech(reply);
      setTimeout(() => setAngelSpeech(null), 6000);
    } catch {
      const fallback = ANGEL_FALLBACK[Math.floor(Math.random() * ANGEL_FALLBACK.length)];
      setAngelSpeech(fallback);
      setTimeout(() => setAngelSpeech(null), 4000);
    } finally {
      setAngelThinking(false);
    }
  };

  const handleDevilClick = async () => {
    setDevilBounce(true);
    setTimeout(() => setDevilBounce(false), 400);
    setDevilThinking(true);
    setDevilSpeech("думаю...");

    try {
      const reply = await askAI(DEVIL_SYSTEM, `Контекст: ${getTaskContext()}. Скажи что-нибудь язвительное про задачи.`);
      setDevilSpeech(reply);
      setTimeout(() => setDevilSpeech(null), 6000);
    } catch {
      const fallback = DEVIL_FALLBACK[Math.floor(Math.random() * DEVIL_FALLBACK.length)];
      setDevilSpeech(fallback);
      setTimeout(() => setDevilSpeech(null), 4000);
    } finally {
      setDevilThinking(false);
    }
  };

  return (
    <div className="companions-container">
      <div className="companion angel">
        <div className={`speech-bubble angel-bubble ${angelSpeech ? 'show' : ''}`}>
          {angelSpeech}
        </div>
        <div
          className={`avatar angel-avatar ${angelBounce ? 'bounce' : ''} ${angelThinking ? 'thinking' : ''}`}
          onClick={!angelThinking ? handleAngelClick : undefined}
          style={{
            padding: 0,
            overflow: 'hidden',
            background: 'radial-gradient(circle, rgba(255,255,220,0.98) 5%, rgba(180,230,255,0.85) 35%, rgba(100,180,255,0.4) 65%, transparent 85%)',
            boxShadow: '0 0 18px rgba(160,220,255,0.7)'
          }}
        >
          <img src={angelImg} alt="Angel" style={{width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.9))'}} />
        </div>
      </div>

      <div className="companion devil">
        <div className={`speech-bubble devil-bubble ${devilSpeech ? 'show' : ''}`}>
          {devilSpeech}
        </div>
        <div
          className={`avatar devil-avatar ${devilBounce ? 'bounce' : ''} ${devilThinking ? 'thinking' : ''}`}
          onClick={!devilThinking ? handleDevilClick : undefined}
          style={{
            padding: 0,
            overflow: 'hidden',
            background: 'radial-gradient(circle, rgba(255,220,0,0.95) 5%, rgba(255,120,0,0.8) 30%, rgba(200,0,0,0.5) 65%, transparent 85%)',
            boxShadow: '0 0 20px rgba(255,160,0,0.7)'
          }}
        >
          <img src={devilImg} alt="Devil" style={{width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.8))'}} />
        </div>
      </div>
    </div>
  );
}
