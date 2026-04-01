import React, { useState, useEffect } from 'react';
import angelImg from './angel.png';
import devilImg from './devil.png';
import './Companions.css';

const ANGEL_PHRASES = [
  "Ты молодец! Так держать!",
  "Не сдавайся, ты сможешь!",
  "Каждая задача — шаг к раю!",
  "Отличная работа, я тобой горжусь ✨",
  "Сделай ещё чуть-чуть!",
  "Дыши глубоко, у нас всё под контролем.",
  "Ты уже сделала столько! Я вижу 👀",
  "Одна маленькая задача — и ты герой!",
];

const DEVIL_PHRASES = [
  "Эта задача всё равно умрёт...",
  "Зачем напрягаться? Брось это.",
  "Остывает, остывает... муахаха!",
  "Даже не пытайся.",
  "Всё тлен 💀",
  "На кладбище полно места!",
  "Я жду. Я всегда жду.",
  "Можно же завтра... или нет?",
];

const ANGEL_CLICK_PHRASES = [
  "Я тут! Покорми меня победой 🌟",
  "Нажми на задачу — я стану сильнее!",
  "Ты нажала на меня! Это уже прогресс 😇",
  "Вместе мы справимся!",
];

const DEVIL_CLICK_PHRASES = [
  "Ой, ты меня потрогала... жуть.",
  "Нажимай сколько хочешь. Задачи сами себя не сделают.",
  "Я тут живу. В твоей голове. Навсегда.",
  "Мяу 😈",
];

export default function Companions({ tasksCount, deadCount, completedCount }) {
  const [angelSpeech, setAngelSpeech] = useState(null);
  const [devilSpeech, setDevilSpeech] = useState(null);
  const [angelBounce, setAngelBounce] = useState(false);
  const [devilBounce, setDevilBounce] = useState(false);

  useEffect(() => {
    const angelTimer = setInterval(() => {
      if (Math.random() > 0.6) {
        setAngelSpeech(ANGEL_PHRASES[Math.floor(Math.random() * ANGEL_PHRASES.length)]);
        setTimeout(() => setAngelSpeech(null), 5000);
      }
    }, 15000);

    const devilTimer = setInterval(() => {
      if (Math.random() > 0.6) {
        setDevilSpeech(DEVIL_PHRASES[Math.floor(Math.random() * DEVIL_PHRASES.length)]);
        setTimeout(() => setDevilSpeech(null), 5000);
      }
    }, 18000);

    return () => {
      clearInterval(angelTimer);
      clearInterval(devilTimer);
    };
  }, []);

  const handleAngelClick = () => {
    setAngelSpeech(ANGEL_CLICK_PHRASES[Math.floor(Math.random() * ANGEL_CLICK_PHRASES.length)]);
    setAngelBounce(true);
    setTimeout(() => setAngelSpeech(null), 4000);
    setTimeout(() => setAngelBounce(false), 400);
  };

  const handleDevilClick = () => {
    setDevilSpeech(DEVIL_CLICK_PHRASES[Math.floor(Math.random() * DEVIL_CLICK_PHRASES.length)]);
    setDevilBounce(true);
    setTimeout(() => setDevilSpeech(null), 4000);
    setTimeout(() => setDevilBounce(false), 400);
  };

  return (
    <div className="companions-container">
      <div className="companion angel">
        <div className={`speech-bubble angel-bubble ${angelSpeech ? 'show' : ''}`}>
          {angelSpeech}
        </div>
        <div
          className={`avatar angel-avatar ${angelBounce ? 'bounce' : ''}`}
          onClick={handleAngelClick}
          style={{padding: 0, overflow: 'hidden'}}
        >
          <img src={angelImg} alt="Angel" style={{width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.5))'}} />
        </div>
      </div>

      <div className="companion devil">
        <div className={`speech-bubble devil-bubble ${devilSpeech ? 'show' : ''}`}>
          {devilSpeech}
        </div>
        <div
          className={`avatar devil-avatar ${devilBounce ? 'bounce' : ''}`}
          onClick={handleDevilClick}
          style={{padding: 0, overflow: 'hidden'}}
        >
          <img src={devilImg} alt="Devil" style={{width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 0 5px rgba(200,0,0,0.5))'}} />
        </div>
      </div>
    </div>
  );
}
