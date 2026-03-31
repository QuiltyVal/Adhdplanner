import React, { useState, useEffect, useRef } from 'react';

const customStyles = {
  root: {
    '--bg-deep': '#0a0a0a',
    '--bg-panel': '#c0c0c0',
    '--color-blood': '#8a1c1c',
    '--color-ghost': '#e0e0e0',
    '--color-void': '#1a1a1a',
  },
  detailContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 20px',
    background: 'radial-gradient(circle at top, #1a0505 0%, #000 80%)',
  },
  ghostChamber: {
    width: '280px',
    height: '280px',
    border: '4px solid #303030',
    background: '#050505',
    position: 'relative',
    marginBottom: '30px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: 'inset 0 0 50px rgba(138, 28, 28, 0.2), 0 0 20px rgba(0,0,0,1)',
  },
  soulInfo: {
    width: '100%',
    background: 'rgba(20, 20, 20, 0.9)',
    border: '2px solid #404040',
    padding: '20px',
    marginBottom: '40px',
    boxShadow: '4px 4px 0 rgba(138, 28, 28, 0.3)',
  },
  btnFeed: {
    flex: 1,
    padding: '20px',
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '0.8rem',
    cursor: 'pointer',
    textAlign: 'center',
    border: '4px solid #fff',
    transition: 'all 0.1s',
    background: '#c0c0c0',
    color: '#000',
    borderRightColor: '#404040',
    borderBottomColor: '#404040',
  },
  btnRelease: {
    flex: 1,
    padding: '20px',
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '0.8rem',
    cursor: 'pointer',
    textAlign: 'center',
    border: '4px solid #404040',
    transition: 'all 0.1s',
    background: '#202020',
    color: '#8a1c1c',
    borderRightColor: '#101010',
    borderBottomColor: '#101010',
  },
};

const SoulEye = ({ eyeOffset }) => {
  return (
    <div
      style={{
        width: '12px',
        height: '12px',
        background: '#000',
        borderRadius: '50%',
        transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`,
        transition: 'transform 0.1s ease',
      }}
    />
  );
};

const TorturedSoul = ({ eyeOffset }) => {
  return (
    <div
      style={{
        width: '100px',
        height: '140px',
        background: '#e0e0e0',
        borderRadius: '50% 50% 0 0',
        position: 'relative',
        filter: 'blur(1px)',
        opacity: 0.8,
        boxShadow: '0 0 30px rgba(255,255,255,0.2)',
        animation: 'float 3s ease-in-out infinite, distort 5s infinite',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '40px',
          width: '100%',
          display: 'flex',
          justifyContent: 'space-around',
          padding: '0 20px',
        }}
      >
        <SoulEye eyeOffset={eyeOffset} />
        <SoulEye eyeOffset={eyeOffset} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: '70px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '20px',
          height: '30px',
          background: '#000',
          borderRadius: '50%',
          animation: 'wail 2s infinite',
        }}
      />
    </div>
  );
};

const GhostChamber = ({ eyeOffset }) => {
  return (
    <div style={customStyles.ghostChamber}>
      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.05,
          animation: 'rise 20s linear infinite',
        }}
      />
      <TorturedSoul eyeOffset={eyeOffset} />
    </div>
  );
};

const SoulInfo = () => {
  return (
    <div style={customStyles.soulInfo}>
      <div
        style={{
          fontFamily: "'Press Start 2P', cursive",
          fontSize: '1rem',
          color: '#fff',
          marginBottom: '15px',
          textTransform: 'uppercase',
          borderBottom: '1px solid #303030',
          paddingBottom: '10px',
        }}
      >
        FINISH THE RITUAL
      </div>
      <div
        style={{
          fontSize: '1.3rem',
          color: '#c0c0c0',
          marginBottom: '20px',
          lineHeight: 1.2,
          fontFamily: "'VT323', monospace",
        }}
      >
        THE DOCUMENT REMAINS INCOMPLETE. THE CLIENTS ARE GROWLING IN THE DARKNESS. SUBMIT THE FINAL DRAFT BEFORE THE SECOND MOON.
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '1rem',
          color: '#808080',
          textTransform: 'uppercase',
          fontFamily: "'VT323', monospace",
        }}
      >
        <div>
          WEIGHT:{' '}
          <span style={{ color: '#8a1c1c' }}>CRITICAL</span>
        </div>
        <div>DECAY: OCT 31</div>
      </div>
    </div>
  );
};

const ActionButtons = ({ onAction }) => {
  const [releaseActive, setReleaseActive] = useState(false);
  const [feedActive, setFeedActive] = useState(false);

  return (
    <div style={{ width: '100%', display: 'flex', gap: '15px', marginTop: 'auto' }}>
      <button
        style={{
          ...customStyles.btnRelease,
          transform: releaseActive ? 'translateY(2px)' : 'none',
          filter: releaseActive ? 'brightness(0.8)' : 'none',
        }}
        onMouseDown={() => setReleaseActive(true)}
        onMouseUp={() => setReleaseActive(false)}
        onTouchStart={() => setReleaseActive(true)}
        onTouchEnd={() => setReleaseActive(false)}
        onClick={() => onAction('Released')}
      >
        RELEASE
      </button>
      <button
        style={{
          ...customStyles.btnFeed,
          transform: feedActive ? 'translateY(2px)' : 'none',
          filter: feedActive ? 'brightness(0.8)' : 'none',
        }}
        onMouseDown={() => setFeedActive(true)}
        onMouseUp={() => setFeedActive(false)}
        onTouchStart={() => setFeedActive(true)}
        onTouchEnd={() => setFeedActive(false)}
        onClick={() => onAction('Fed')}
      >
        FEED SOUL
      </button>
    </div>
  );
};

const App = () => {
  const [opacity, setOpacity] = useState(1);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [actionMessage, setActionMessage] = useState(null);

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
        background-color: #000;
        overflow: hidden;
      }

      #root {
        width: 390px;
        height: 844px;
        margin: 0 auto;
        position: relative;
        overflow: hidden;
      }

      #root::after {
        content: "";
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%);
        background-size: 100% 4px;
        pointer-events: none;
        z-index: 100;
      }

      @keyframes float {
        0%, 100% { transform: translateY(0) rotate(-2deg); }
        50% { transform: translateY(-20px) rotate(2deg); }
      }

      @keyframes distort {
        0%, 100% { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 80% 90%, 60% 100%, 40% 90%, 20% 100%, 0% 90%); }
        50% { clip-path: polygon(0% 0%, 100% 0%, 100% 90%, 85% 100%, 65% 90%, 45% 100%, 25% 90%, 0% 100%); }
      }

      @keyframes soul-blink {
        0%, 90%, 100% { transform: scaleY(1); }
        95% { transform: scaleY(0.1); }
      }

      @keyframes wail {
        0%, 100% { height: 20px; width: 15px; }
        50% { height: 35px; width: 25px; }
      }

      @keyframes rise {
        from { background-position: 0 0; }
        to { background-position: 0 -400px; }
      }

      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 4;
      const y = (e.clientY / window.innerHeight - 0.5) * 4;
      setEyeOffset({ x, y });
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleAction = (type) => {
    setOpacity(0);
    setActionMessage(type);
    setTimeout(() => {
      setOpacity(1);
      setActionMessage(null);
    }, 600);
  };

  return (
    <div
      style={{
        width: '390px',
        height: '844px',
        background: '#000',
        color: '#fff',
        fontFamily: "'VT323', monospace",
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          ...customStyles.detailContainer,
          opacity,
          transition: 'opacity 0.5s ease',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '30px',
            fontFamily: "'Press Start 2P', cursive",
            fontSize: '0.7rem',
            color: '#808080',
          }}
        >
          <div
            style={{ cursor: 'pointer', color: '#fff' }}
            onClick={() => handleAction('Escaped')}
          >
            &lt; ESCAPE
          </div>
          <div>SOUL #7742</div>
        </div>

        {/* Ghost Chamber */}
        <GhostChamber eyeOffset={eyeOffset} />

        {/* Soul Info */}
        <SoulInfo />

        {/* Action Buttons */}
        <ActionButtons onAction={handleAction} />

        {/* Action feedback */}
        {actionMessage && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontFamily: "'Press Start 2P', cursive",
              fontSize: '1.2rem',
              color: '#fff',
              background: 'rgba(0,0,0,0.85)',
              padding: '20px 30px',
              border: '2px solid #8a1c1c',
              zIndex: 200,
              animation: 'fadeInUp 0.3s ease',
              whiteSpace: 'nowrap',
            }}
          >
            SOUL {actionMessage.toUpperCase()}
          </div>
        )}
      </div>

      {/* Scanline overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%)',
          backgroundSize: '100% 4px',
          pointerEvents: 'none',
          zIndex: 100,
        }}
      />
    </div>
  );
};

export default App;