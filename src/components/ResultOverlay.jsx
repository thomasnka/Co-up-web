// src/components/ResultOverlay.jsx

import React from 'react';
import { menuBtnStyle } from '../constants/themes';

export default function ResultOverlay({ result, theme, onRematch, onNewGame, onExit }) {
  if (!result) return null;

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
    }}>
      <div className="confirm-popup" style={{
        backgroundColor: theme.panelBg, padding: '30px 20px', borderRadius: '16px',
        boxShadow: '0 15px 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', border: `1px solid ${theme.lines}`,
        width: '85%', maxWidth: '400px', textAlign: 'center',
      }}>
        <h2 style={{ fontSize: '2rem', color: theme.textColor, margin: '0 0 8px 0', textTransform: 'uppercase' }}>
          {result.title}
        </h2>
        <p style={{ fontSize: '1rem', opacity: 0.75, margin: '0 0 20px 0', color: theme.textColor }}>
          {result.sub}
        </p>
        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
          <button onClick={onRematch} style={{ ...menuBtnStyle(theme), flex: 1, backgroundColor: '#4CAF50', color: '#fff', fontSize: '0.9rem', padding: '12px' }}>
            🔄 Chơi tiếp
          </button>
          <button onClick={onNewGame} style={{ ...menuBtnStyle(theme), flex: 1, backgroundColor: theme.redText, color: '#fff', fontSize: '0.9rem', padding: '12px' }}>
            ✨ Ván mới
          </button>
          <button onClick={onExit} style={{ ...menuBtnStyle(theme), flex: 1, backgroundColor: '#555', color: '#fff', fontSize: '0.9rem', padding: '12px' }}>
            🚪 Thoát
          </button>
        </div>
      </div>
    </div>
  );
}