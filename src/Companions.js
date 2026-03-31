import React, { useState, useEffect } from 'react';
import './Companions.css';

const ANGEL_PHRASES = [
  "Ты молодец! Так держать!",
  "Не сдавайся, ты сможешь!",
  "Каждая задача — шаг к раю!",
  "Отличная работа, я тобой горжусь ✨",
  "Сделай ещё чуть-чуть!",
  "Дыши глубоко, у нас всё под контролем."
];

const DEVIL_PHRASES = [
  "Эта задача всё равно умрёт...",
  "Зачем напрягаться? Брось это.",
  "Остывает, остывает... муахаха!",
  "Даже не пытайся.",
  "Всё тлен 💀",
  "На кладбище полно места!"
];

export default function Companions({ tasksCount, deadCount, completedCount }) {
  const [angelSpeech, setAngelSpeech] = useState(null);
  const [devilSpeech, setDevilSpeech] = useState(null);

  useEffect(() => {
    // Randomly show angel speech
    const angelTimer = setInterval(() => {
      if (Math.random() > 0.6) {
        setAngelSpeech(ANGEL_PHRASES[Math.floor(Math.random() * ANGEL_PHRASES.length)]);
        setTimeout(() => setAngelSpeech(null), 5000);
      }
    }, 15000);

    // Randomly show devil speech
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

  return (
    <div className="companions-container">
      <div className="companion angel">
        <div className={`speech-bubble angel-bubble ${angelSpeech ? 'show' : ''}`}>
          {angelSpeech}
        </div>
        <div className="avatar angel-avatar">😇</div>
      </div>
      
      <div className="companion devil">
        <div className={`speech-bubble devil-bubble ${devilSpeech ? 'show' : ''}`}>
          {devilSpeech}
        </div>
        <div className="avatar devil-avatar">😈</div>
      </div>
    </div>
  );
}
