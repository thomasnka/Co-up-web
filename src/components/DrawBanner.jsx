// src/components/DrawBanner.jsx

import React from 'react';

export default function DrawBanner({ theme, onAccept, onDecline }) {
  return (
    <div style={{
      position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 40, backgroundColor: theme.panelBg, border: `1px solid ${theme.lines}`,
      borderRadius: '12px', padding: '14px 20px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap',
    }}>
      <span style={{ fontWeight: 'bold', color: theme.textColor }}>🤝 Đối thủ xin hòa</span>
      <button
        onClick={onAccept}
        style={{ padding: '6px 14px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
      >
        Đồng ý
      </button>
      <button
        onClick={onDecline}
        style={{ padding: '6px 14px', backgroundColor: '#d32f2f', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
      >
        Từ chối
      </button>
    </div>
  );
}