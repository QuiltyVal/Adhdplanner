import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const customStyles = {
  root: {
    '--bg-deep': '#000000',
    '--color-blood': '#8a1c1c',
    '--color-void': '#1a0000',
  },
  portalContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  portalCore: {
    position: 'relative',
    width: '120px',
    height: '120px',
    background: '#fff',
    boxShadow: '0 0 50px #fff, 0 0 100px #8a1c1c',
    zIndex: 10,
  },
  ring1: {
    position: 'absolute',
    border: '4px dashed #8a1c1c',
    width: '160px',
    height: '160px',
  },
  ring2: {
    position: 'absolute',
    border: '8px dotted #8a1c1c',
    width: '220px',
    height: '220px',
  },
  ring3: {
    position: 'absolute',
    border: '6px double #8a1c1c',
    width: '280px',
    height: '280px',
  },
  glitchBlock: {
    position: 'absolute',
    background: '#8a1c1c',
    height: '10px',
    opacity: 0.6,
  },
  statusArea: {
    position: 'absolute',
    bottom: '120px',
    textAlign: 'center',
    width: '100%',
  },
  countdown: {
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '3rem',
    color: '#fff',
    textShadow: '4px 4px 0 #8a1c1c',
    marginBottom: '20px',
  },
  countdownRed: {
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '3rem',
    color: '#8a1c1c',
    textShadow: '4px 4px 0 #fff',
    marginBottom: '20px',
  },
  loadingText: {
    fontFamily: "'Press Start 2P', cursive",
    fontSize: '0.7rem',
    color: '#808080',
    letterSpacing: '2px',
    lineHeight: '1.6',
  },
  scanline: {
    width: '100%',
    height: '100px',
    background: 'linear-gradient(transparent, rgba(138, 28, 28, 0.2), transparent)',
    position: 'absolute',
    left: 0,
    pointerEvents: 'none',
    zIndex: 50,
  },
  screenOverlay: {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.3) 50%)',
    backgroundSize: '100% 4px',
    pointerEvents: 'none',
    zIndex: 100,
  },
};

const SoulPlannerPage = () => {
  const [count, setCount] = useState(9);
  const [isVoid, setIsVoid] = useState(false);
  const [bgInverted, setBgInverted] = useState(false);
  const [bgWhite, setBgWhite] = useState(false);
  const [manifestingVisible, setManifestingVisible] = useState(true);
  const glitchContainerRef = useRef(null);
  const glitchBlocksRef = useRef([]);
  const scanlineRef = useRef(null);
  const animFrameRef = useRef(null);
  const scanStartRef = useRef(null);
  const coreAnimRef = useRef(null);
  const ring1AnimRef = useRef(null);
  const ring2AnimRef = useRef(null);
  const ring3AnimRef = useRef(null);

  const [coreScale, setCoreScale] = useState(0.9);
  const [ring1Angle, setRing1Angle] = useState(0);
  const [ring2Angle, setRing2Angle] = useState(0);
  const [ring3Angle, setRing3Angle] = useState(0);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');

      @keyframes manifesting-flicker {
        0% { opacity: 1; }
        50% { opacity: 0.2; }
        100% { opacity: 1; }
      }
      @keyframes glitch-cascade {
        0% { transform: translateY(-100px) scaleX(1); opacity: 0; }
        50% { opacity: 1; }
        100% { transform: translateY(844px) scaleX(2); opacity: 0; }
      }
      .manifesting-text {
        color: #8a1c1c;
        animation: manifesting-flicker 0.1s infinite;
      }
      .glitch-block-anim {
        animation: glitch-cascade 1.5s linear infinite;
      }
      .soul-planner-wrapper * {
        box-sizing: border-box;
        user-select: none;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Core pulse animation
  useEffect(() => {
    let start = null;
    let forward = true;
    const animate = (timestamp) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const duration = 500;
      const progress = (elapsed % duration) / duration;
      const scale = forward
        ? 0.9 + progress * 0.2
        : 1.1 - progress * 0.2;
      if (elapsed % duration < 16) forward = !forward;
      setCoreScale(0.9 + Math.abs(Math.sin(elapsed / 500 * Math.PI)) * 0.2);
      coreAnimRef.current = requestAnimationFrame(animate);
    };
    coreAnimRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(coreAnimRef.current);
  }, []);

  // Ring rotation animations
  useEffect(() => {
    let start = null;
    const animate = (timestamp) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      setRing1Angle((elapsed / 2000) * 360 % 360);
      setRing2Angle(-(elapsed / 2000) * 360 % 360);
      setRing3Angle((elapsed / 4000) * 360 % 360);
      ring1AnimRef.current = requestAnimationFrame(animate);
    };
    ring1AnimRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(ring1AnimRef.current);
  }, []);

  // Scanline animation
  useEffect(() => {
    let start = null;
    const animate = (timestamp) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const duration = 3000;
      const progress = (elapsed % duration) / duration;
      const topVal = -100 + progress * (844 + 100);
      if (scanlineRef.current) {
        scanlineRef.current.style.top = topVal + 'px';
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCount(prev => {
        const next = prev - 1;
        if (next < 0) {
          clearInterval(interval);
          setIsVoid(true);
          setBgWhite(true);
          setTimeout(() => {
            setCount(9);
            setIsVoid(false);
            setBgWhite(false);
          }, 1500);
          return prev;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Glitch invert effect
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.9) {
        setBgInverted(true);
        setTimeout(() => setBgInverted(false), 50);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Generate glitch blocks data
  const glitchBlocks = useRef(
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      width: Math.random() * 60 + 20,
    }))
  ).current;

  const displayCount = isVoid ? 'VOID' : count.toString().padStart(2, '0');
  const countdownStyle = count < 4 && !isVoid ? customStyles.countdownRed : customStyles.countdown;

  return (
    <div
      className="soul-planner-wrapper"
      style={{
        width: '390px',
        height: '844px',
        backgroundColor: bgWhite ? '#fff' : '#000000',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        borderRadius: '40px',
        overflow: 'hidden',
        filter: bgInverted ? 'invert(1)' : 'none',
        margin: '0 auto',
      }}
    >
      {/* CRT scanline overlay */}
      <div style={customStyles.screenOverlay} />

      {/* Portal container */}
      <div style={customStyles.portalContainer}>
        {/* Scanline */}
        <div ref={scanlineRef} style={customStyles.scanline} />

        {/* Glitch blocks */}
        {glitchBlocks.map((block) => (
          <div
            key={block.id}
            className="glitch-block-anim"
            style={{
              ...customStyles.glitchBlock,
              left: `${block.left}%`,
              width: `${block.width}px`,
              animationDelay: `${block.delay}s`,
            }}
          />
        ))}

        {/* Ring 3 */}
        <div
          style={{
            ...customStyles.ring3,
            transform: `rotate(${ring3Angle}deg)`,
          }}
        />

        {/* Ring 2 */}
        <div
          style={{
            ...customStyles.ring2,
            transform: `rotate(${ring2Angle}deg)`,
          }}
        />

        {/* Ring 1 */}
        <div
          style={{
            ...customStyles.ring1,
            transform: `rotate(${ring1Angle}deg)`,
          }}
        />

        {/* Portal Core */}
        <div
          style={{
            ...customStyles.portalCore,
            transform: `scale(${coreScale}) rotate(45deg)`,
            opacity: 0.8 + coreScale * 0.1,
          }}
        />

        {/* Status area */}
        <div style={customStyles.statusArea}>
          <div style={countdownStyle}>{displayCount}</div>
          <div style={customStyles.loadingText}>
            COLLECTING FRAGMENTED SOULS...<br />
            <span className="manifesting-text">INITIALIZING PURGATORY</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <Router basename="/">
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#000',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Routes>
          <Route path="/" element={<SoulPlannerPage />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;