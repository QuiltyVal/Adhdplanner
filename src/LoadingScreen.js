// src/LoadingScreen.js
import React, { useEffect } from 'react';

export default function LoadingScreen() {
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
      @keyframes core-pulse {
        0%, 100% { transform: translate(-50%, -50%) rotate(45deg) scale(0.9); opacity: 0.7; }
        50%       { transform: translate(-50%, -50%) rotate(45deg) scale(1.1); opacity: 1; }
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
      @keyframes manifesting {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.15; }
      }
      @keyframes loading-dots {
        0%   { content: ''; }
        33%  { content: '.'; }
        66%  { content: '..'; }
        100% { content: '...'; }
      }
      .loading-manifesting {
        animation: manifesting 0.4s infinite;
        color: #8a1c1c;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById('loading-screen-styles');
      if (el) el.remove();
    };
  }, []);

  const glitchBlocks = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2.5,
    width: Math.random() * 60 + 20,
    duration: 1.2 + Math.random() * 1,
  }));

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#000',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9998,
      overflow: 'hidden',
      fontFamily: "'VT323', monospace",
    }}>
      {/* CRT scanlines */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%)',
        backgroundSize: '100% 4px',
        pointerEvents: 'none',
        zIndex: 10,
      }} />

      {/* Sweeping scanline */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        height: '80px',
        background: 'linear-gradient(transparent, rgba(138,28,28,0.18), transparent)',
        animation: 'scanline-sweep 3s linear infinite',
        pointerEvents: 'none',
        zIndex: 5,
      }} />

      {/* Glitch blocks */}
      {glitchBlocks.map(b => (
        <div key={b.id} style={{
          position: 'absolute',
          left: `${b.left}%`,
          width: `${b.width}px`,
          height: '10px',
          background: '#8a1c1c',
          opacity: 0.55,
          animation: `glitch-fall ${b.duration}s linear infinite`,
          animationDelay: `${b.delay}s`,
        }} />
      ))}

      {/* Portal area */}
      <div style={{ position: 'relative', width: '280px', height: '280px' }}>
        {/* Ring 3 — slow CW */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '260px', height: '260px',
          border: '5px double #8a1c1c',
          animation: 'ring-cw 8s linear infinite',
        }} />
        {/* Ring 2 — CCW */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '200px', height: '200px',
          border: '7px dotted #8a1c1c',
          animation: 'ring-ccw 5s linear infinite',
        }} />
        {/* Ring 1 — fast CW */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '148px', height: '148px',
          border: '4px dashed rgba(138,28,28,0.7)',
          animation: 'ring-cw 3s linear infinite',
        }} />
        {/* Portal core */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '60px', height: '60px',
          background: '#fff',
          boxShadow: '0 0 40px #fff, 0 0 80px #8a1c1c',
          animation: 'core-pulse 1.5s ease-in-out infinite',
        }} />
      </div>

      {/* Status text */}
      <div style={{
        position: 'absolute',
        bottom: '15%',
        textAlign: 'center',
        width: '100%',
        padding: '0 20px',
      }}>
        <div style={{
          fontFamily: "'Press Start 2P', cursive",
          fontSize: 'clamp(0.5rem, 2vw, 0.7rem)',
          color: '#c0c0c0',
          letterSpacing: '2px',
          lineHeight: '2',
        }}>
          COLLECTING FRAGMENTED SOULS...<br />
          <span className="loading-manifesting">INITIALIZING PURGATORY</span>
        </div>
      </div>
    </div>
  );
}
