// src/components/Leaderboard.jsx

import React from 'react';

export default function Leaderboard({ leaderboard, auth, theme, isNightMode }) {
  const { isLoggedIn, user, playerElo } = auth;

  const cardStyle = {
    backgroundColor: theme.panelBg, borderRadius: '8px', padding: '12px 15px', marginBottom: '10px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${theme.lines}`,
  };

  return (
    <div>
      <h3 style={{ borderBottom: `2px solid ${theme.lines}`, paddingBottom: '10px', marginBottom: '15px', color: theme.textColor }}>
        🏆 Top Cao Thủ
      </h3>

      {leaderboard.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', opacity: 0.6, fontStyle: 'italic', border: `1px dashed ${theme.lines}`, borderRadius: '8px', color: theme.textColor }}>
          Chưa có dữ liệu xếp hạng.
        </div>
      ) : (
        leaderboard.map(entry => {
          const isMe  = isLoggedIn && entry.id === user?.id;
          const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
          return (
            <div key={entry.id} style={{
              ...cardStyle,
              backgroundColor: isMe ? (isNightMode ? '#1a2a1a' : '#f0fff0') : theme.panelBg,
              border: isMe ? '1px solid #4CAF50' : `1px solid ${theme.lines}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.1rem', minWidth: '28px' }}>{medal}</span>
                <span style={{ fontWeight: isMe ? 'bold' : 'normal', color: isMe ? '#4CAF50' : theme.textColor }}>
                  {entry.display_name}
                  {isMe && <span style={{ fontSize: '0.75rem', marginLeft: '6px', opacity: 0.7 }}>(bạn)</span>}
                </span>
              </div>
              <span style={{ fontWeight: 'bold', color: theme.redText, fontSize: '0.95rem' }}>
                {entry.elo} ELO
              </span>
            </div>
          );
        })
      )}

      {/* ELO của player nếu ngoài top 10 */}
      {isLoggedIn && leaderboard.length > 0 && !leaderboard.find(r => r.id === user?.id) && (
        <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', border: `1px dashed ${theme.lines}`, fontSize: '0.85rem', opacity: 0.7, textAlign: 'center', color: theme.textColor }}>
          ELO của bạn: <strong>{playerElo}</strong> — Chưa vào top 10
        </div>
      )}
    </div>
  );
}