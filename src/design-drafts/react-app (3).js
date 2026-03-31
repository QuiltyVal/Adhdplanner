import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const customStyles = {
  root: {
    '--bg-deep': '#0a0a0a',
    '--bg-panel': '#c0c0c0',
    '--bg-mist': '#404040',
    '--color-blood': '#8a1c1c',
    '--color-gold': '#e66827',
    '--color-text': '#ffffff',
  },
  scanlines: {
    content: '""',
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)',
    backgroundSize: '100% 4px',
    pointerEvents: 'none',
    zIndex: 100,
  },
  graveyardContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: '40px 20px',
    background: 'linear-gradient(to bottom, #000 0%, #1a1a1a 100%)',
    overflowY: 'auto',
    scrollbarWidth: 'none',
    position: 'relative',
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px',
    position: 'sticky',
    top: 0,
    background: '#000',
    padding: '10px 0',
    zIndex: 10,
    borderBottom: '2px solid #8a1c1c',
  },
  headerTitle: {
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '1.2rem',
    color: '#8a1c1c',
    textShadow: '2px 2px #000',
    marginBottom: '5px',
  },
  headerSubtitle: {
    fontSize: '1.2rem',
    color: '#808080',
    textTransform: 'uppercase',
    fontFamily: "'VT323', monospace",
  },
  tombstoneGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    paddingBottom: '100px',
  },
  tombstoneWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'pointer',
  },
  tombstone: {
    width: '100px',
    height: '120px',
    background: '#4a4a4a',
    border: '4px solid #2a2a2a',
    borderTopLeftRadius: '40px',
    borderTopRightRadius: '40px',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 0 #1a1a1a',
    marginBottom: '10px',
  },
  tombstoneRip: {
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '0.5rem',
    color: '#2a2a2a',
    position: 'absolute',
    top: '30px',
  },
  tombstoneTaskName: {
    fontSize: '1rem',
    color: '#000',
    textAlign: 'center',
    padding: '0 10px',
    marginTop: '15px',
    textTransform: 'uppercase',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
    fontFamily: "'VT323', monospace",
  },
  epitaph: {
    fontSize: '0.9rem',
    color: '#a0a0a0',
    textAlign: 'center',
    fontStyle: 'italic',
    maxWidth: '140px',
    lineHeight: 1,
    fontFamily: "'VT323', monospace",
  },
  graveDirt: {
    width: '120px',
    height: '15px',
    background: '#2b1d0e',
    borderRadius: '50%',
    filter: 'blur(2px)',
    marginTop: '-8px',
    zIndex: -1,
  },
  navBack: {
    position: 'fixed',
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#c0c0c0',
    border: '4px solid #fff',
    borderRightColor: '#404040',
    borderBottomColor: '#404040',
    padding: '12px 24px',
    color: '#000',
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '0.8rem',
    cursor: 'pointer',
    zIndex: 20,
    whiteSpace: 'nowrap',
  },
  mistOverlay: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    width: '100%',
    height: '200px',
    background: 'linear-gradient(transparent, rgba(64, 64, 64, 0.4))',
    pointerEvents: 'none',
    zIndex: 5,
  },
  ghostOrb: {
    position: 'absolute',
    width: '4px',
    height: '4px',
    background: 'rgba(255, 255, 255, 0.4)',
    borderRadius: '50%',
    boxShadow: '0 0 10px #fff',
  },
  outerWrapper: {
    width: '390px',
    height: '844px',
    backgroundColor: '#000',
    color: '#fff',
    fontFamily: "'VT323', monospace",
    overflow: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    margin: '0 auto',
  },
};

const tombstones = [
  { id: 1, name: 'EXERCISE', epitaph: 'FORGOTTEN BY THE FLESH.', delay: '0s' },
  { id: 2, name: 'REPLY EMAIL', epitaph: 'SILENCE BECAME ETERNAL.', delay: '0.2s' },
  { id: 3, name: 'MEDITATE', epitaph: 'PEACE NEVER FOUND.', delay: '0.4s' },
  { id: 4, name: 'DRINK WATER', epitaph: 'PARCHED IN THE VOID.', delay: '0.6s' },
  { id: 5, name: 'CALL MOM', epitaph: 'GUILT IS THE ONLY ECHO.', delay: '0.8s' },
  { id: 6, name: 'FIX BUG', epitaph: 'CRASHED AND BURIED.', delay: '1.0s' },
];

const GhostOrb = ({ style }) => {
  return (
    <div style={{ ...customStyles.ghostOrb, ...style }} />
  );
};

const Tombstone = ({ name, epitaph, delay, onChillClick }) => {
  const [isActive, setIsActive] = useState(false);

  const handleClick = () => {
    setIsActive(true);
    onChillClick();
    setTimeout(() => setIsActive(false), 200);
  };

  return (
    <div
      style={{
        ...customStyles.tombstoneWrapper,
        animation: `fadeIn 1s ease-out ${delay} both`,
      }}
      onClick={handleClick}
    >
      <div style={customStyles.tombstone}>
        <span style={customStyles.tombstoneRip}>R.I.P.</span>
        <div style={customStyles.tombstoneTaskName}>{name}</div>
      </div>
      <div style={customStyles.graveDirt} />
      <div style={customStyles.epitaph}>{epitaph}</div>
    </div>
  );
};

const GraveyardPage = () => {
  const [chillMessage, setChillMessage] = useState('');
  const [navActive, setNavActive] = useState(false);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');

      * {
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
      }

      body {
        margin: 0;
        padding: 0;
        background-color: #000;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }

      #graveyard-scroll::-webkit-scrollbar {
        display: none;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes mist-float {
        from { opacity: 0.3; transform: translateX(-10px); }
        to { opacity: 0.6; transform: translateX(10px); }
      }

      @keyframes float-up {
        0% { transform: translateY(0); opacity: 0; }
        50% { opacity: 1; }
        100% { transform: translateY(-100px); opacity: 0; }
      }

      @keyframes scanline {
        0% { background-position: 0 0; }
        100% { background-position: 0 100%; }
      }

      .ghost-orb-1 {
        animation: float-up 5s linear infinite;
        animation-delay: 0s;
      }
      .ghost-orb-2 {
        animation: float-up 5s linear infinite;
        animation-delay: 2s;
      }
      .ghost-orb-3 {
        animation: float-up 5s linear infinite;
        animation-delay: 4s;
      }
      .mist-animated {
        animation: mist-float 8s infinite alternate;
      }
      .scanlines-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%);
        background-size: 100% 4px;
        pointer-events: none;
        z-index: 100;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const handleChillClick = () => {
    console.log('A chill runs down your spine...');
    setChillMessage('A chill runs down your spine...');
    setTimeout(() => setChillMessage(''), 2000);
  };

  const handleNavClick = () => {
    setNavActive(true);
    setTimeout(() => setNavActive(false), 200);
  };

  return (
    <div style={customStyles.outerWrapper}>
      <div className="scanlines-overlay" />

      <div
        id="graveyard-scroll"
        style={{
          ...customStyles.graveyardContainer,
          width: '390px',
          height: '844px',
        }}
      >
        <div style={customStyles.header}>
          <div style={customStyles.headerTitle}>THE PURGATORY</div>
          <div style={customStyles.headerSubtitle}>COLLECTION OF NEGLECTED SOULS</div>
        </div>

        <div style={customStyles.tombstoneGrid}>
          {tombstones.map((t) => (
            <Tombstone
              key={t.id}
              name={t.name}
              epitaph={t.epitaph}
              delay={t.delay}
              onChillClick={handleChillClick}
            />
          ))}
        </div>

        <GhostOrb
          style={{
            left: '20%',
            bottom: '30%',
          }}
        />
        <GhostOrb
          style={{
            left: '70%',
            bottom: '50%',
          }}
        />
        <GhostOrb
          style={{
            left: '40%',
            bottom: '20%',
          }}
        />

        {chillMessage && (
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0,0,0,0.85)',
              border: '2px solid #8a1c1c',
              padding: '16px 24px',
              color: '#fff',
              fontFamily: "'VT323', monospace",
              fontSize: '1.1rem',
              zIndex: 200,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            {chillMessage}
          </div>
        )}

        <button
          style={{
            ...customStyles.navBack,
            ...(navActive
              ? {
                  transform: 'translateX(-50%) scale(0.95)',
                  background: '#808080',
                }
              : {}),
          }}
          onClick={handleNavClick}
        >
          RETURN TO GATE
        </button>

        <div
          className="mist-animated"
          style={customStyles.mistOverlay}
        />
      </div>
    </div>
  );
};

const App = () => {
  return (
    <Router basename="/">
      <Routes>
        <Route path="/" element={<GraveyardPage />} />
      </Routes>
    </Router>
  );
};

export default App;