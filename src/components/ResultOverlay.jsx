// src/components/ResultOverlay.jsx
// Fix: popup center, không blur board, scroll-safe trên mobile

import React from 'react';
import { menuBtnStyle } from '../constants/themes';

export default function ResultOverlay({ result, theme, onNewGame, onExit }) {
  if (!result) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      // Không blur — để nhìn thấy nước cuối trên board
      backgroundColor: 'rgba(0,0,0,0.45)',
      // Đảm bảo scroll được trên mobile
      overflowY: 'auto',
      padding: '20px',
      boxSizing: 'border-box',
    }}>
      <div className="confirm-popup" style={{
        backgroundColor: theme.panelBg,
        padding: '28px 24px',
        borderRadius: '20px',
        boxShadow: '0 15px 40px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: `1px solid ${theme.lines}`,
        width: '100%',
        maxWidth: '360px',
        textAlign: 'center',
        // Đảm bảo không bị che trên mobile
        margin: 'auto',
        flexShrink: 0,
      }}>
        <h2 style={{
          fontSize: '2rem',
          color: theme.textColor,
          margin: '0 0 8px 0',
          textTransform: 'uppercase',
          letterSpacing: '2px',
        }}>
          {result.title}
        </h2>
        <p style={{
          fontSize: '1rem',
          opacity: 0.75,
          margin: '0 0 24px 0',
          color: theme.textColor,
        }}>
          {result.sub}
        </p>
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button
            onClick={onNewGame}
            style={{ ...menuBtnStyle(theme), flex: 1, backgroundColor: theme.redText, color: '#fff', fontSize: '1rem', padding: '14px' }}
          >
            🔄 Ván mới
          </button>
          <button
            onClick={onExit}
            style={{ ...menuBtnStyle(theme), flex: 1, backgroundColor: '#555', color: '#fff', fontSize: '1rem', padding: '14px' }}
          >
            🚪 Thoát
          </button>
        </div>
      </div>
    </div>
  );
}