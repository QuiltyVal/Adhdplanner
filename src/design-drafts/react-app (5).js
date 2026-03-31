import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const customStyles = {
  root: {
    '--bg-deep': '#0a0a0a',
    '--color-spirit': '#e0faff',
    '--color-glow': '#3aedff',
  },
  body: {
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
  scanlines: {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(rgba(255, 255, 255, 0.05) 50%, rgba(0, 0, 0, 0.1) 50%)',
    backgroundSize: '100% 4px',
    pointerEvents: 'none',
    zIndex: 100,
  },
  peaceContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '60px 30px',
    textAlign: 'center',
    background: 'radial-gradient(circle at center, #001a1a 0%, #000 80%)',
  },
  statusTop: {
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '1.2rem',
    color: '#e0faff',
    textShadow: '0 0 10px #3aedff',
    marginBottom: '8px',
    letterSpacing: '-1px',
  },
  gateVisual: {
    position: 'relative',
    width: '260px',
    height: '260px',
    margin: '20px 0',
    imageRendering: 'pixelated',
  },
  pixelGateOpen: {
    width: '100%',
    height: '100%',
    border: '4px solid #3aedff',
    background: '#000',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 0 40px rgba(58, 237, 255, 0.2)',
  },
  gateDoorLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '50%',
    height: '100%',
    background: '#151515',
    border: '2px solid #333',
    borderRight: '4px double #3aedff',
    zIndex: 10,
    transform: 'translateX(-85%)',
    display: 'flex',
    justifyContent: 'space-around',
    padding: '0 10px',
  },
  gateDoorRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '50%',
    height: '100%',
    background: '#151515',
    border: '2px solid #333',
    borderLeft: '4px double #3aedff',
    zIndex: 10,
    transform: 'translateX(85%)',
    display: 'flex',
    justifyContent: 'space-around',
    padding: '0 10px',
  },
  barStatic: {
    width: '2px',
    height: '100%',
    background: '#222',
  },
  voidLight: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '120px',
    height: '120px',
    background: 'radial-gradient(circle, #3aedff 0%, transparent 70%)',
    filter: 'blur(20px)',
  },
  loreBox: {
    background: 'rgba(0, 20, 20, 0.6)',
    border: '2px solid #e0faff',
    padding: '25px',
    fontSize: '1.5rem',
    lineHeight: '1.3',
    color: '#e0faff',
    textTransform: 'uppercase',
    boxShadow: '0 0 15px rgba(58, 237, 255, 0.3)',
    maxWidth: '320px',
    letterSpacing: '1px',
  },
  loreSpan: {
    color: '#fff',
    display: 'block',
    marginTop: '12px',
    fontSize: '0.85rem',
    fontFamily: "'Press Start 2P', cursive",
    opacity: 0.8,
  },
  returnBtn: {
    background: 'transparent',
    border: '2px solid #e0faff',
    padding: '16px 32px',
    color: '#e0faff',
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '0.8rem',
    cursor: 'pointer',
    textShadow: '0 0 5px #3aedff',
    transition: 'all 0.3s',
  },
  returnBtnActive: {
    background: '#e0faff',
    color: '#000',
  },
};

const PeacePage = () => {
  const [btnActive, setBtnActive] = useState(false);
  const [fading, setFading] = useState(false);
  const [particles, setParticles] = useState([]);
  const gateVisualRef = useRef(null);

  useEffect(() => {
    const generated = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 5,
    }));
    setParticles(generated);
  }, []);

  const handleReturn = () => {
    setFading(true);
    setTimeout(() => {
      setFading(false);
    }, 1500);
  };

  return (
    <div
      style={{
        ...customStyles.body,
        opacity: fading ? 0 : 1,
        transition: fading ? 'opacity 1.5s ease-in-out' : 'none',
      }}
    >
      {/* Scanlines overlay */}
      <div style={customStyles.scanlines} />

      {/* Keyframe injection handled by useEffect in App */}
      <div style={customStyles.peaceContainer} className="peace-container-anim">
        {/* Status */}
        <div className="status-container-anim">
          <div style={customStyles.statusTop}>THE VOID IS STILL</div>
        </div>

        {/* Gate Visual */}
        <div ref={gateVisualRef} style={customStyles.gateVisual}>
          <div style={customStyles.pixelGateOpen}>
            <div style={customStyles.voidLight} className="void-light-anim" />
            <div style={customStyles.gateDoorLeft}>
              <div style={customStyles.barStatic} />
              <div style={customStyles.barStatic} />
            </div>
            <div style={customStyles.gateDoorRight}>
              <div style={customStyles.barStatic} />
              <div style={customStyles.barStatic} />
            </div>
          </div>

          {/* Particles */}
          {particles.map((p) => (
            <div
              key={p.id}
              className="particle-anim"
              style={{
                position: 'absolute',
                width: '2px',
                height: '2px',
                background: '#e0faff',
                pointerEvents: 'none',
                left: `${p.left}%`,
                top: `${p.top}%`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>

        {/* Lore Box */}
        <div style={customStyles.loreBox}>
          ALL SOULS HAVE PASSED ON.
          THE DEBT IS PAID.
          <span style={customStyles.loreSpan}>REST IN ETERNITY.</span>
        </div>

        {/* Return Button */}
        <button
          style={btnActive ? { ...customStyles.returnBtn, ...customStyles.returnBtnActive } : customStyles.returnBtn}
          onMouseDown={() => setBtnActive(true)}
          onMouseUp={() => setBtnActive(false)}
          onTouchStart={() => setBtnActive(true)}
          onTouchEnd={() => setBtnActive(false)}
          onClick={handleReturn}
        >
          REMAIN IN PEACE
        </button>
      </div>
    </div>
  );
};

const App = () => {
  useEffect(() => {
    // Inject Google Fonts
    const link1 = document.createElement('link');
    link1.rel = 'preconnect';
    link1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(link1);

    const link2 = document.createElement('link');
    link2.rel = 'preconnect';
    link2.href = 'https://fonts.gstatic.com';
    link2.crossOrigin = '';
    document.head.appendChild(link2);

    const link3 = document.createElement('link');
    link3.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap';
    link3.rel = 'stylesheet';
    document.head.appendChild(link3);

    // Inject keyframe animations
    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
      }
      body, html {
        margin: 0;
        padding: 0;
        background: #000;
      }
      .peace-container-anim {
        animation: breathe 8s ease-in-out infinite;
      }
      .status-container-anim {
        animation: float 4s ease-in-out infinite;
      }
      .void-light-anim {
        animation: pulse-light 4s infinite;
      }
      .particle-anim {
        animation: rise 5s linear infinite;
      }
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      @keyframes breathe {
        0%, 100% { opacity: 0.9; }
        50% { opacity: 1; }
      }
      @keyframes pulse-light {
        0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
        50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0.8; }
      }
      @keyframes rise {
        from { transform: translateY(0) scale(1); opacity: 1; }
        to { transform: translateY(-100px) scale(0); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(link1);
      document.head.removeChild(link2);
      document.head.removeChild(link3);
      document.head.removeChild(style);
    };
  }, []);

  return (
    <Router basename="/">
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#000' }}>
        <Routes>
          <Route path="/" element={<PeacePage />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;