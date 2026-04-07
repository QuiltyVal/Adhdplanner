import React, { useState, useEffect } from 'react';
import angelImg from './angel.png';
import devilImg from './devil.png';
import AgentChat from './AgentChat';
import './Companions.css';

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

export default function Companions({ tasksCount, deadCount, completedCount, tasks = [], onAddTask, onAddSubtask, onDeleteSubtask }) {
  const [angelSpeech, setAngelSpeech] = useState(null);
  const [devilSpeech, setDevilSpeech] = useState(null);
  const [angelBounce, setAngelBounce] = useState(false);
  const [devilBounce, setDevilBounce] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPersona, setChatPersona] = useState("angel");

  useEffect(() => {
    const angelTimer = setInterval(() => {
      if (Math.random() > 0.6) {
        const phrase = ANGEL_FALLBACK[Math.floor(Math.random() * ANGEL_FALLBACK.length)];
        setAngelSpeech(phrase);
        setTimeout(() => setAngelSpeech(null), 5000);
      }
    }, 15000);

    const devilTimer = setInterval(() => {
      if (Math.random() > 0.6) {
        const phrase = DEVIL_FALLBACK[Math.floor(Math.random() * DEVIL_FALLBACK.length)];
        setDevilSpeech(phrase);
        setTimeout(() => setDevilSpeech(null), 5000);
      }
    }, 18000);

    return () => { clearInterval(angelTimer); clearInterval(devilTimer); };
  }, []);

  const openChat = (persona) => {
    setChatPersona(persona);
    setChatOpen(true);
    if (persona === "angel") {
      setAngelBounce(true);
      setTimeout(() => setAngelBounce(false), 400);
    } else {
      setDevilBounce(true);
      setTimeout(() => setDevilBounce(false), 400);
    }
  };

  return (
    <>
      <div className="companions-container">
        <div className="companion angel">
          <div className={`speech-bubble angel-bubble ${angelSpeech ? 'show' : ''}`}>
            {angelSpeech}
          </div>
          <div
            className={`avatar angel-avatar ${angelBounce ? 'bounce' : ''}`}
            onClick={() => openChat("angel")}
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
            className={`avatar devil-avatar ${devilBounce ? 'bounce' : ''}`}
            onClick={() => openChat("devil")}
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

      <AgentChat
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        persona={chatPersona}
        tasks={tasks}
        onAddTask={onAddTask}
        onAddSubtask={onAddSubtask}
        onDeleteSubtask={onDeleteSubtask}
      />
    </>
  );
}
