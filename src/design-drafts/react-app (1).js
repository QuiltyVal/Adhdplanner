import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';

const customStyles = {
  scanlines: {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.15) 50%)',
    backgroundSize: '100% 4px',
    pointerEvents: 'none',
    zIndex: 100,
  },
};

const GhostSprite = ({ color = '#a0d6ff' }) => (
  <div style={{ width: 40, height: 40, position: 'relative', flexShrink: 0 }}>
    <div
      style={{
        width: '100%',
        height: '100%',
        background: color,
        clipPath: 'polygon(50% 0%, 100% 30%, 100% 100%, 80% 85%, 60% 100%, 40% 85%, 20% 100%, 0% 100%, 0% 30%)',
        opacity: 0.6,
        animation: 'pulse 2s infinite',
      }}
    />
    <div
      style={{
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '60%',
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ width: 6, height: 6, background: '#000' }} />
      <div style={{ width: 6, height: 6, background: '#000' }} />
    </div>
  </div>
);

const HealthBar = ({ width, isCritical }) => (
  <div
    style={{
      width: '100%',
      height: 8,
      background: '#222',
      border: '1px solid #444',
      position: 'relative',
    }}
  >
    <div
      style={{
        height: '100%',
        width: `${width}%`,
        background: '#8a1c1c',
        transition: 'width 0.3s ease',
        boxShadow: '0 0 10px #8a1c1c',
        animation: isCritical ? 'flicker 0.2s infinite' : 'none',
      }}
    />
  </div>
);

const SoulCard = ({ soul, onFeed }) => {
  const isCritical = soul.health <= 20;
  const ghostColor = isCritical ? '#ff4444' : '#a0d6ff';

  return (
    <div
      style={{
        background: 'rgba(10, 10, 10, 0.9)',
        border: '2px solid #333',
        padding: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 15,
        position: 'relative',
        animation: 'drift-subtle 4s ease-in-out infinite alternate',
      }}
    >
      <GhostSprite color={ghostColor} />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "'Press Start 2P', cursive",
            fontSize: '0.65rem',
            marginBottom: 8,
            color: '#ddd',
            textTransform: 'uppercase',
          }}
        >
          {soul.name}
        </div>
        <HealthBar width={soul.health} isCritical={isCritical} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <button
          onClick={() => onFeed(soul.id)}
          style={{
            background: '#222',
            border: '1px solid #555',
            color: '#fff',
            fontFamily: "'VT323', monospace",
            fontSize: '0.9rem',
            padding: '4px 8px',
            cursor: 'pointer',
          }}
          onMouseDown={e => {
            e.currentTarget.style.background = '#a0d6ff';
            e.currentTarget.style.color = '#000';
          }}
          onMouseUp={e => {
            e.currentTarget.style.background = '#222';
            e.currentTarget.style.color = '#fff';
          }}
          onTouchStart={e => {
            e.currentTarget.style.background = '#a0d6ff';
            e.currentTarget.style.color = '#000';
          }}
          onTouchEnd={e => {
            e.currentTarget.style.background = '#222';
            e.currentTarget.style.color = '#fff';
          }}
        >
          FEED
        </button>
      </div>
    </div>
  );
};

const AddSoulModal = ({ isOpen, onClose, onAdd }) => {
  const [name, setName] = useState('');

  if (!isOpen) return null;

  const handleAdd = () => {
    if (name.trim()) {
      onAdd(name.trim().toUpperCase());
      setName('');
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0a0a0a',
          border: '2px solid #555',
          padding: 20,
          width: '100%',
          maxWidth: 300,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            fontFamily: "'Press Start 2P', cursive",
            fontSize: '0.7rem',
            color: '#a0d6ff',
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          SUMMON SOUL
        </div>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="SOUL NAME..."
          maxLength={24}
          style={{
            width: '100%',
            background: '#111',
            border: '1px solid #444',
            color: '#fff',
            fontFamily: "'VT323', monospace",
            fontSize: '1.1rem',
            padding: '6px 10px',
            marginBottom: 12,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleAdd}
            style={{
              flex: 1,
              background: '#8a1c1c',
              border: '1px solid #aaa',
              color: '#fff',
              fontFamily: "'VT323', monospace",
              fontSize: '1rem',
              padding: '6px 0',
              cursor: 'pointer',
            }}
          >
            SUMMON
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: '#222',
              border: '1px solid #555',
              color: '#aaa',
              fontFamily: "'VT323', monospace",
              fontSize: '1rem',
              padding: '6px 0',
              cursor: 'pointer',
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
};

const TheVoidPage = ({ souls, onFeed, onAddSoul, activeNav, setActiveNav }) => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div
      style={{
        width: 390,
        height: 844,
        background: '#050505',
        color: '#fff',
        fontFamily: "'VT323', monospace",
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Scanlines overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.15) 50%)',
          backgroundSize: '100% 4px',
          pointerEvents: 'none',
          zIndex: 100,
        }}
      />

      {/* Header */}
      <header
        style={{
          padding: '40px 20px 20px',
          textAlign: 'center',
          borderBottom: '2px solid #333',
          background: 'rgba(0,0,0,0.8)',
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            fontFamily: "'Press Start 2P', cursive",
            fontSize: '0.9rem',
            color: '#a0d6ff',
            margin: '0 0 10px 0',
            letterSpacing: 2,
            textShadow: '2px 2px 0 #8a1c1c',
          }}
        >
          THE VOID
        </h1>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: "'Press Start 2P', cursive",
            fontSize: '0.5rem',
            color: '#888',
          }}
        >
          <span>SOULS: {souls.length}</span>
          <span>PURGATORY LVL: 12</span>
        </div>
      </header>

      {/* Void Grid */}
      <div
        style={{
          flex: 1,
          padding: 20,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 15,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          position: 'relative',
        }}
      >
        {souls.map(soul => (
          <SoulCard key={soul.id} soul={soul} onFeed={onFeed} />
        ))}
        {souls.length === 0 && (
          <div
            style={{
              color: '#444',
              fontFamily: "'Press Start 2P', cursive",
              fontSize: '0.5rem',
              textAlign: 'center',
              marginTop: 40,
            }}
          >
            THE VOID IS EMPTY...
          </div>
        )}
      </div>

      {/* Add Soul Button */}
      <div
        onClick={() => setModalOpen(true)}
        style={{
          position: 'absolute',
          bottom: 100,
          right: 20,
          width: 50,
          height: 50,
          background: '#8a1c1c',
          border: '3px solid #fff',
          color: '#fff',
          fontSize: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '4px 4px 0 #000',
          zIndex: 10,
          userSelect: 'none',
        }}
      >
        +
      </div>

      {/* Footer Nav */}
      <nav
        style={{
          padding: 20,
          background: '#000',
          borderTop: '2px solid #333',
          display: 'flex',
          justifyContent: 'space-around',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        {['THE VOID', 'SACRIFICE', 'CHRONOS', 'SETTINGS'].map(item => (
          <div
            key={item}
            onClick={() => setActiveNav(item)}
            style={{
              fontFamily: "'Press Start 2P', cursive",
              fontSize: '0.4rem',
              color: activeNav === item ? '#a0d6ff' : '#666',
              textAlign: 'center',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {item}
          </div>
        ))}
      </nav>

      {/* Add Soul Modal */}
      <AddSoulModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={onAddSoul}
      />
    </div>
  );
};

const App = () => {
  const [activeNav, setActiveNav] = useState('THE VOID');
  const [souls, setSouls] = useState([
    { id: 1, name: 'FINISH PROJECT X', health: 75 },
    { id: 2, name: 'REPLY TO EMAILS', health: 15 },
    { id: 3, name: 'GYM SESSION', health: 45 },
    { id: 4, name: 'BUY GROCERIES', health: 90 },
  ]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
      
      * {
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
      }

      body, html {
        margin: 0;
        padding: 0;
        background-color: #050505;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }

      @keyframes drift-subtle {
        from { transform: translateY(0); }
        to { transform: translateY(-5px); }
      }

      @keyframes pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.8; }
      }

      @keyframes flicker {
        0% { opacity: 1; }
        50% { opacity: 0.2; }
        100% { opacity: 1; }
      }

      ::-webkit-scrollbar {
        width: 4px;
      }
      ::-webkit-scrollbar-track {
        background: #111;
      }
      ::-webkit-scrollbar-thumb {
        background: #333;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const handleFeed = (id) => {
    setSouls(prev =>
      prev.map(soul =>
        soul.id === id
          ? { ...soul, health: Math.min(100, soul.health + 10) }
          : soul
      )
    );
  };

  const handleAddSoul = (name) => {
    setSouls(prev => [
      ...prev,
      { id: Date.now(), name, health: 50 },
    ]);
  };

  return (
    <Router basename="/">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#020202',
        }}
      >
        <TheVoidPage
          souls={souls}
          onFeed={handleFeed}
          onAddSoul={handleAddSoul}
          activeNav={activeNav}
          setActiveNav={setActiveNav}
        />
      </div>
    </Router>
  );
};

export default App;