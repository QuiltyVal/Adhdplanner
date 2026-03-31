// src/LoadingScreen.js
import React, { useEffect, useState } from 'react';

export default function LoadingScreen() {
  const [isLight, setIsLight] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'light'
  );

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'loading-screen-styles';
    style.textContent = `
      @keyframes ring-cw {
        from { transform: translate(-50%, -50%) rotate(0deg); }
        to   { transform: translate(-50%, -50%) rotate(360deg); }
      }
      @keyframes ring-ccw {
        from { transform: translate(-50%, -50%) rotate(0deg); }
        to   { transform: translate(-50%, -50%) rotate(-360deg); }
      }
      @keyframes core-pulse-dark {
        0%, 100% { transform: translate(-50%, -50%) rotate(45deg) scale(0.9); opacity: 0.7; box-shadow: 0 0 40px #fff, 0 0 80px #8a1c1c; }
        50%       { transform: translate(-50%, -50%) rotate(45deg) scale(1.1); opacity: 1;   box-shadow: 0 0 60px #fff, 0 0 120px #8a1c1c; }
      }
      @keyframes core-pulse-light {
        0%, 100% { transform: translate(-50%, -50%) rotate(45deg) scale(0.9); box-shadow: 0 0 30px #f472b6, 0 0 60px #c084fc; }
        50%       { transform: translate(-50%, -50%) rotate(45deg) scale(1.1); box-shadow: 0 0 50px #f472b6, 0 0 100px #c084fc; }
      }
      @keyframes scanline-sweep {
        0%   { top: -80px; }
        100% { top: 110%; }
      }
      @keyframes glitch-fall {
        0%   { transform: translateY(-60px); opacity: 0; }
        20%  { opacity: 0.7; }
        100% { transform: translateY(110vh); opacity: 0; }
      }
      @keyframes manifesting-dark {
        0%, 100% { opacity: 1; color: #8a1c1c; }
        50%       { opacity: 0.15; }
      }
      @keyframes manifesting-light {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.3; }
      }
      /* Orbit: container rotates around center */
      @keyframes orbit-angel {
        from { transform: translate(-50%, -50%) rotate(0deg)    translateX(95px); }
        to   { transform: translate(-50%, -50%) rotate(360deg)  translateX(95px); }
      }
      @keyframes orbit-devil {
        from { transform: translate(-50%, -50%) rotate(0deg)    translateX(75px); }
        to   { transform: translate(-50%, -50%) rotate(-360deg) translateX(75px); }
      }
      /* Counter-rotate emoji so it stays upright */
      @keyframes counter-angel {
        from { transform: rotate(0deg); }
        to   { transform: rotate(-360deg); }
      }
      @keyframes counter-devil {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
      @keyframes light-bg-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.85; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById('loading-screen-styles');
      if (el) el.remove();
    };
  }, []);

  if (isLight) {
    return <LightLoadingScreen />;
  }
  return <DarkLoadingScreen />;
}

/* ── LIGHT MODE: angel & devil orbiting ── */
function LightLoadingScreen() {
  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'linear-gradient(135deg, #fce4ec 0%, #f3e5f5 50%, #ede7f6 100%)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      position: 'fixed', top: 0, left: 0, zIndex: 9998, overflow: 'hidden',
      fontFamily: "'VT323', monospace",
      animation: 'light-bg-pulse 3s ease-in-out infinite',
    }}>
      {/* Portal area */}
      <div style={{ position: 'relative', width: '280px', height: '280px' }}>
        {/* Ring 3 — slow CW, pink */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '260px', height: '260px',
          border: '4px solid rgba(192, 132, 252, 0.4)',
          animation: 'ring-cw 9s linear infinite',
        }} />
        {/* Ring 2 — CCW, lavender */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '200px', height: '200px',
          border: '5px dashed rgba(244, 114, 182, 0.5)',
          animation: 'ring-ccw 6s linear infinite',
        }} />
        {/* Ring 1 — fast CW */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '148px', height: '148px',
          border: '3px dotted rgba(192, 132, 252, 0.6)',
          animation: 'ring-cw 3.5s linear infinite',
        }} />

        {/* Portal core — pink/purple */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '52px', height: '52px',
          background: 'linear-gradient(135deg, #f472b6, #c084fc)',
          animation: 'core-pulse-light 1.5s ease-in-out infinite',
        }} />

        {/* Angel orbiting CW, outer */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          animation: 'orbit-angel 3s linear infinite',
          willChange: 'transform',
        }}>
          <span style={{
            display: 'block',
            fontSize: '2rem',
            animation: 'counter-angel 3s linear infinite',
            willChange: 'transform',
          }}>😇</span>
        </div>

        {/* Devil orbiting CCW, inner */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          animation: 'orbit-devil 2.2s linear infinite',
          willChange: 'transform',
        }}>
          <span style={{
            display: 'block',
            fontSize: '2rem',
            animation: 'counter-devil 2.2s linear infinite',
            willChange: 'transform',
          }}>😈</span>
        </div>
      </div>

      {/* Status text */}
      <div style={{
        position: 'absolute', bottom: '15%',
        textAlign: 'center', width: '100%', padding: '0 20px',
      }}>
        <div style={{
          fontFamily: "'Press Start 2P', cursive",
          fontSize: 'clamp(0.45rem, 1.8vw, 0.65rem)',
          color: '#7c3aed',
          letterSpacing: '2px',
          lineHeight: '2.2',
        }}>
          WAKING UP YOUR COMPANIONS...<br />
          <span style={{ animation: 'manifesting-light 0.6s infinite', color: '#f472b6', display: 'inline-block' }}>
            PREPARING THE VOID
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── DARK MODE: portal + glitch blocks ── */
function DarkLoadingScreen() {
  const glitchBlocks = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2.5,
    width: Math.random() * 60 + 20,
    duration: 1.2 + Math.random() * 1,
  }));

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#000',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      position: 'fixed', top: 0, left: 0, zIndex: 9998, overflow: 'hidden',
      fontFamily: "'VT323', monospace",
    }}>
      {/* CRT scanlines */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%)',
        backgroundSize: '100% 4px',
        pointerEvents: 'none', zIndex: 10,
      }} />

      {/* Sweeping scanline */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: '80px',
        background: 'linear-gradient(transparent, rgba(138,28,28,0.18), transparent)',
        animation: 'scanline-sweep 3s linear infinite',
        pointerEvents: 'none', zIndex: 5,
      }} />

      {/* Glitch blocks */}
      {glitchBlocks.map(b => (
        <div key={b.id} style={{
          position: 'absolute', left: `${b.left}%`,
          width: `${b.width}px`, height: '10px',
          background: '#8a1c1c', opacity: 0.55,
          animation: `glitch-fall ${b.duration}s linear infinite`,
          animationDelay: `${b.delay}s`,
        }} />
      ))}

      {/* Portal area */}
      <div style={{ position: 'relative', width: '280px', height: '280px' }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '260px', height: '260px',
          border: '5px double #8a1c1c',
          animation: 'ring-cw 8s linear infinite',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '200px', height: '200px',
          border: '7px dotted #8a1c1c',
          animation: 'ring-ccw 5s linear infinite',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '148px', height: '148px',
          border: '4px dashed rgba(138,28,28,0.7)',
          animation: 'ring-cw 3s linear infinite',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '60px', height: '60px',
          background: '#fff',
          animation: 'core-pulse-dark 1.5s ease-in-out infinite',
        }} />
      </div>

      {/* Status text */}
      <div style={{
        position: 'absolute', bottom: '15%',
        textAlign: 'center', width: '100%', padding: '0 20px',
      }}>
        <div style={{
          fontFamily: "'Press Start 2P', cursive",
          fontSize: 'clamp(0.5rem, 2vw, 0.7rem)',
          color: '#c0c0c0',
          letterSpacing: '2px', lineHeight: '2',
        }}>
          COLLECTING FRAGMENTED SOULS...<br />
          <span style={{ animation: 'manifesting-dark 0.4s infinite', display: 'inline-block' }}>
            INITIALIZING PURGATORY
          </span>
        </div>
      </div>
    </div>
  );
}
