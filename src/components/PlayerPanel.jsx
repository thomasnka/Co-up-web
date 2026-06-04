// src/components/PlayerPanel.jsx
// Hiển thị thông tin người chơi trong header MainMenu
// Fix: tên Google thay Guest, thêm Wins/Losses/Win rate

import React from 'react';

export default function PlayerPanel({ auth, theme, isNightMode, setIsNightMode }) {
  const {
    playerName, playerElo, isLoggedIn, isLoading: authLoading,
    loginWithGoogle, loginWithFacebook, logout, profile,
  } = auth;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '15px',
      backgroundColor: theme.panelBg, padding: '8px 20px',
      borderRadius: '20px', border: `1px solid ${theme.lines}`,
      boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
    }}>
      {/* Night toggle */}
      <button
        onClick={() => setIsNightMode(!isNightMode)}
        style={{ padding: '4px 10px', backgroundColor: theme.buttonBg, color: theme.buttonText, border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
      >
        {isNightMode ? '☀️ Sáng' : '🌙 Tối'}
      </button>

      <div style={{ width: '1px', height: '20px', backgroundColor: theme.lines, margin: '0 5px' }} />

      {/* Player info */}
      {authLoading ? (
        <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>Đang tải...</span>

      ) : isLoggedIn ? (
        /* Đã đăng nhập */
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {profile?.avatar_url && (
            <img
              src={profile.avatar_url} alt="avatar"
              style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${theme.lines}` }}
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            {/* Tên từ Google profile */}
            <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: theme.textColor }}>
              {profile?.display_name || playerName}
            </span>
            {/* ELO */}
            <span style={{ fontSize: '0.8rem', color: theme.redText, fontWeight: 'bold' }}>
              ELO: {playerElo}
            </span>
            {/* Wins / Losses / Win rate */}
            {profile && (
              <span style={{ fontSize: '0.75rem', opacity: 0.65, color: theme.textColor }}>
                {profile.wins}W · {profile.losses}L · {profile.draws}D
                {(profile.wins + profile.losses + profile.draws) > 0 && (
                  <span style={{ marginLeft: '4px', color: '#4CAF50', fontWeight: 'bold' }}>
                    ({Math.round(profile.wins / (profile.wins + profile.losses + profile.draws) * 100)}%)
                  </span>
                )}
              </span>
            )}
          </div>
          <button
            onClick={logout}
            style={{ padding: '3px 10px', fontSize: '0.75rem', backgroundColor: 'transparent', color: theme.textColor, border: `1px solid ${theme.lines}`, borderRadius: '4px', cursor: 'pointer', opacity: 0.7 }}
          >
            Đăng xuất
          </button>
        </div>

      ) : (
        /* Chưa đăng nhập */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '0.9rem', opacity: 0.7, color: theme.textColor }}>
            {playerName}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={loginWithGoogle}
              style={{ padding: '4px 12px', fontSize: '0.8rem', backgroundColor: '#db4437', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              GG
            </button>
            <button
              onClick={loginWithFacebook}
              style={{ padding: '4px 12px', fontSize: '0.8rem', backgroundColor: '#1877F2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              FB
            </button>
          </div>
        </div>
      )}
    </div>
  );
}