// src/components/ResultOverlay.jsx

import React from 'react';
import { menuBtnStyle } from '../constants/themes';

export default function ResultOverlay({ result, theme, onNewGame, onExit }) {
  if (!result) return null;

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      // BUG-1 FIX: bỏ backdropFilter blur — để nhìn thấy nước chiếu bí cuối
      // Chỉ dùng gradient mờ dần từ dưới lên, không che board
      background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)',
      pointerEvents: 'none',
    }}>
      <div className="result-sheet" style={{
        backgroundColor: theme.panelBg,
        padding: '24px 20px 28px',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        border: `1px solid ${theme.lines}`,
        borderBottom: 'none',
        width: '100%', maxWidth: '520px',
        textAlign: 'center',
        pointerEvents: 'auto',
      }}>
        {/* Handle bar */}
        <div style={{ width: '40px', height: '4px', backgroundColor: theme.lines, borderRadius: '2px', marginBottom: '16px', opacity: 0.4 }} />

        <h2 style={{ fontSize: '2rem', color: theme.textColor, margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '2px' }}>
          {result.title}
        </h2>
        <p style={{ fontSize: '0.95rem', opacity: 0.7, margin: '0 0 24px 0', color: theme.textColor }}>
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