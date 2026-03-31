import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const customStyles = {
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
    background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)',
    backgroundSize: '100% 4px',
    pointerEvents: 'none',
    zIndex: 100,
  },
  splashContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '60px 30px',
    textAlign: 'center',
    background: 'radial-gradient(circle at center, #200000 0%, #000 70%)',
    position: 'relative',
  },
  titleTop: {
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '1.5rem',
    color: '#fff',
    textShadow: '4px 4px 0 #8a1c1c',
    marginBottom: '8px',
  },
  version: {
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '0.8rem',
    color: '#808080',
  },
  gateVisual: {
    position: 'relative',
    width: '240px',
    height: '240px',
    margin: '20px 0',
    imageRendering: 'pixelated',
  },
  pixelGate: {
    width: '100%',
    height: '100%',
    border: '8px double #404040',
    background: '#101010',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 0 30px rgba(138, 28, 28, 0.5)',
  },
  gateBars: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'space-around',
    padding: '0 20px',
  },
  bar: {
    width: '4px',
    height: '100%',
    background: '#606060',
    border: '1px solid #000',
  },
  loreBox: {
    background: 'rgba(0, 0, 0, 0.8)',
    border: '2px solid #fff',
    padding: '20px',
    fontSize: '1.4rem',
    lineHeight: '1.2',
    color: '#c0c0c0',
    textTransform: 'uppercase',
    boxShadow: '4px 4px 0 #404040',
    maxWidth: '320px',
  },
  loreSpan: {
    color: '#e66827',
    display: 'block',
    marginTop: '10px',
    fontSize: '0.9rem',
    fontFamily: "'Press Start 2P', cursive",
  },
  startBtn: {
    background: '#c0c0c0',
    borderTop: '4px solid #fff',
    borderLeft: '4px solid #fff',
    borderRight: '4px solid #404040',
    borderBottom: '4px solid #404040',
    padding: '16px 32px',
    color: '#000',
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '1rem',
    cursor: 'pointer',
    boxShadow: '0 0 20px rgba(255,255,255,0.2)',
    transition: 'all 0.1s',
  },
  startBtnActive: {
    transform: 'scale(0.95)',
    background: '#808080',
    borderTop: '4px solid #404040',
    borderLeft: '4px solid #404040',
    borderRight: '4px solid #fff',
    borderBottom: '4px solid #fff',
  },
  fog: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '200%',
    height: '150px',
    background: 'linear-gradient(transparent, rgba(128, 128, 128, 0.2))',
    pointerEvents: 'none',
    filter: 'blur(20px)',
  },
};

const SplashPage = () => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [btnActive, setBtnActive] = useState(false);
  const [eyeStyle, setEyeStyle] = useState({
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) scaleY(1)',
    width: '40px',
    height: '20px',
    background: '#fff',
    borderRadius: '50%',
    transition: 'transform 0.1s',
  });
  const [titleOpacity, setTitleOpacity] = useState(1);
  const [bodyStyle, setBodyStyle] = useState({});

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');

      @keyframes flicker {
        0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% { opacity: 1; }
        20%, 24%, 55% { opacity: 0.7; }
      }

      @keyframes blink {
        0%, 90%, 100% { transform: translate(-50%, -50%) scaleY(1); }
        95% { transform: translate(-50%, -50%) scaleY(0.1); }
      }

      @keyframes drift {
        from { transform: translateX(0); }
        to { transform: translateX(-50%); }
      }

      @keyframes scanline-anim {
        0% { opacity: 1; }
        100% { opacity: 1; }
      }

      .title-flicker {
        animation: flicker 2s infinite;
      }

      .eye-blink {
        animation: blink 4s infinite;
      }

      .fog-drift {
        animation: drift 10s linear infinite;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const enterVoid = () => {
    setIsAnimating(true);
    setBodyStyle({
      transition: 'all 1s ease-out',
      transform: 'scale(5)',
      opacity: '0',
      background: '#fff',
    });
    setTimeout(() => {
      setIsAnimating(false);
      setBodyStyle({});
    }, 800);
  };

  return (
    <div style={{ ...customStyles.body, ...bodyStyle }}>
      <div style={customStyles.scanlines} />
      <div style={customStyles.splashContainer}>
        <div className="title-flicker">
          <div style={customStyles.titleTop}>SOUL PLANNER</div>
          <div style={customStyles.version}>VERSION 1.0</div>
        </div>

        <div style={customStyles.gateVisual}>
          <div style={customStyles.pixelGate}>
            <div
              className="eye-blink"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '40px',
                height: '20px',
                background: '#fff',
                borderRadius: '50%',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  width: '15px',
                  height: '15px',
                  background: '#8a1c1c',
                  borderRadius: '50%',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
            <div style={customStyles.gateBars}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} style={customStyles.bar} />
              ))}
            </div>
          </div>
        </div>

        <div style={customStyles.loreBox}>
          YOUR UNFINISHED TASKS ARE LINGERING SOULS. FEED THEM ATTENTION OR WATCH THEM PERISH.
          <span style={customStyles.loreSpan}>PURGATORY AWAITS...</span>
        </div>

        <button
          style={btnActive ? { ...customStyles.startBtn, ...customStyles.startBtnActive } : customStyles.startBtn}
          onMouseDown={() => setBtnActive(true)}
          onMouseUp={() => { setBtnActive(false); enterVoid(); }}
          onTouchStart={() => setBtnActive(true)}
          onTouchEnd={() => { setBtnActive(false); enterVoid(); }}
        >
          ENTER THE VOID
        </button>

        <div className="fog-drift" style={customStyles.fog} />
      </div>
    </div>
  );
};

const App = () => {
  return (
    <Router basename="/">
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#000' }}>
        <Routes>
          <Route path="/" element={<SplashPage />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;