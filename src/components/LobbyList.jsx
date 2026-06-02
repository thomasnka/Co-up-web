// src/components/LobbyList.jsx

import React from 'react';

export default function LobbyList({
  waitingRooms, liveGames, isLoading,
  playerId, theme,
  onJoinRoom,
}) {
  const cardStyle = {
    backgroundColor: theme.panelBg, borderRadius: '8px', padding: '12px 15px', marginBottom: '10px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${theme.lines}`,
  };

  const emptyStyle = {
    textAlign: 'center', padding: '20px', opacity: 0.6,
    fontStyle: 'italic', border: `1px dashed ${theme.lines}`, borderRadius: '8px',
    color: theme.textColor,
  };

  return (
    <>
      {/* Bàn chờ */}
      <div>
        <h3 style={{ borderBottom: `2px solid ${theme.lines}`, paddingBottom: '10px', marginBottom: '15px', color: theme.textColor }}>
          ⏳ Bàn chờ ({waitingRooms.length})
        </h3>
        {isLoading ? (
          <div style={{ ...emptyStyle }}>Đang kết nối máy chủ...</div>
        ) : waitingRooms.length === 0 ? (
          <div style={emptyStyle}>Chưa có phòng chờ. Hãy tạo phòng để bắt đầu.</div>
        ) : (
          waitingRooms.map(room => (
            <div key={room.id} style={cardStyle}>
              <div>
                <div style={{ fontWeight: 'bold', color: theme.textColor }}>
                  {room.host_name}
                  <span style={{ fontSize: '0.85rem', color: theme.redText }}> ({room.host_elo})</span>
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7, color: theme.textColor }}>
                  {room.mode === 'standard' ? 'Tiêu Chuẩn' : 'Cải Tiến'}
                </div>
              </div>
              <button
                onClick={() => onJoinRoom(room)}
                style={{ padding: '6px 12px', backgroundColor: theme.lines, color: theme.background, border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {room.host_id === playerId ? 'Đang chờ...' : 'Vào Bàn'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Đang diễn ra */}
      <div>
        <h3 style={{ borderBottom: `2px solid ${theme.lines}`, paddingBottom: '10px', marginBottom: '15px', color: theme.textColor }}>
          👁 Đang diễn ra ({liveGames.length})
        </h3>
        {isLoading ? (
          <div style={emptyStyle}>Đang kết nối máy chủ...</div>
        ) : liveGames.length === 0 ? (
          <div style={emptyStyle}>Hiện không có trận đấu nào.</div>
        ) : (
          liveGames.map(game => (
            <div key={game.id} style={cardStyle}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                  <span style={{ color: theme.redText }}>{game.host_name}</span>
                  <span style={{ color: theme.textColor }}> vs </span>
                  <span style={{ color: theme.textColor }}>{game.guest_name}</span>
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7, color: theme.textColor }}>
                  {game.mode === 'standard' ? 'Tiêu Chuẩn' : 'Cải Tiến'}
                </div>
              </div>
              <button style={{ padding: '6px 12px', backgroundColor: 'transparent', color: theme.textColor, border: `1px solid ${theme.lines}`, borderRadius: '4px', cursor: 'pointer' }}>
                Xem
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}