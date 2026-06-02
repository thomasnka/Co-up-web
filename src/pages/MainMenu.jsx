// src/pages/MainMenu.jsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../core/supabaseClient';
import { menuBtnStyle } from '../constants/themes';
import PlayerPanel from '../components/PlayerPanel';
import LobbyList from '../components/LobbyList';
import Leaderboard from '../components/Leaderboard';

export default function MainMenu({ setScreen, setGameMode, setMatchId, theme, auth, isNightMode, setIsNightMode }) {
  const [waitingRooms, setWaitingRooms] = useState([]);
  const [liveGames, setLiveGames]       = useState([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [leaderboard, setLeaderboard]   = useState([]);

  const { playerId, playerName, playerElo, isLoading: authLoading } = auth;

  // Chờ auth load xong mới render — tránh Guest flash
  const isReady = !authLoading;

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const { data, error } = await supabase.from('matches').select('*').in('status', ['waiting', 'playing']);
        if (error) throw error;
        if (data) {
          const now = Date.now();
          // Cleanup phòng rác: lọc phòng waiting quá 30 phút
          const staleIds = data
            .filter(m => m.status === 'waiting' && (now - new Date(m.created_at).getTime()) > 30 * 60 * 1000)
            .map(m => m.id);
          if (staleIds.length > 0) {
            await supabase.from('matches').update({ status: 'cancelled' }).in('id', staleIds);
          }
          setWaitingRooms(data.filter(m =>
            m.status === 'waiting' && (now - new Date(m.created_at).getTime()) < 30 * 60 * 1000
          ));
          setLiveGames(data.filter(m => m.status === 'playing'));
        }
      } catch (e) { console.error('Lỗi dữ liệu sảnh:', e.message); }
      finally { setIsLoading(false); }
    };

    const fetchLeaderboard = async () => {
      try {
        const { data, error } = await supabase
          .from('leaderboard').select('rank, id, display_name, elo').limit(10);
        if (!error && data) setLeaderboard(data);
      } catch (e) { console.warn('Leaderboard fetch failed:', e.message); }
    };

    fetchMatches();
    fetchLeaderboard();

    const sub = supabase.channel('public:matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, fetchMatches)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  // Dọn phòng khi host đóng tab
  useEffect(() => {
    const handleUnload = () => {
      const myRoom = waitingRooms.find(r => r.host_id === playerId);
      if (myRoom) {
        navigator.sendBeacon(
          `${supabase.supabaseUrl}/rest/v1/matches?id=eq.${myRoom.id}`,
          new Blob([JSON.stringify({ status: 'cancelled' })], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [waitingRooms, playerId]);

  const handleCreateRoom = async (mode) => {
    const existing = waitingRooms.find(r => r.host_id === playerId);
    if (existing) { setGameMode(existing.mode); setMatchId(existing.id); setScreen('playing'); return; }
    setIsLoading(true);
    try {
      await supabase.from('matches').update({ status: 'cancelled' }).eq('host_id', playerId).eq('status', 'waiting');
      const { data, error } = await supabase.from('matches').insert([{
        host_id: playerId, host_name: playerName, host_elo: playerElo, mode, status: 'waiting',
      }]).select();
      if (error) throw error;
      if (data?.length > 0) { setGameMode(mode); setMatchId(data[0].id); setScreen('playing'); }
    } catch (err) { alert('Lỗi hệ thống: ' + err.message); }
    finally { setIsLoading(false); }
  };

  const handleJoinRoom = async (room) => {
    if (room.host_id === playerId) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('matches').update({
        guest_id: playerId, guest_name: playerName, guest_elo: playerElo, status: 'playing',
      }).eq('id', room.id);
      if (error) throw error;
      setGameMode(room.mode); setMatchId(room.id); setScreen('playing');
    } catch (err) { alert('Không thể vào phòng: ' + err.message); }
    finally { setIsLoading(false); }
  };

  const handleQuickMatch = async () => {
    setIsLoading(true);
    const available = waitingRooms.filter(r => r.host_id !== playerId);
    if (available.length === 0) { await handleCreateRoom('standard'); return; }
    const best = [...available].sort((a, b) =>
      Math.abs(a.host_elo - playerElo) - Math.abs(b.host_elo - playerElo)
    )[0];
    await handleJoinRoom(best);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', color: theme.textColor, padding: '20px', width: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: '1200px', display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <PlayerPanel auth={auth} theme={theme} isNightMode={isNightMode} setIsNightMode={setIsNightMode} />
      </div>

      <h1 style={{ fontSize: '3rem', margin: '0 0 5px 0' }}>
        CỜ ÚP <span style={{ color: theme.redText }}>PRO</span>
      </h1>
      <p style={{ margin: '0 0 30px 0', opacity: 0.8, fontSize: '1.1rem' }}>
        Lạc nước hai Xe đành bỏ phí. Gặp thời một Tốt cũng thành công!
      </p>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '40px', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
        <button
          onClick={handleQuickMatch}
          disabled={isLoading || !isReady}
          style={{ ...menuBtnStyle(theme), width: '280px', backgroundColor: '#4CAF50', color: '#fff', transform: 'scale(1.05)', boxShadow: '0 8px 20px rgba(76,175,80,0.4)', opacity: (isLoading || !isReady) ? 0.7 : 1, cursor: (isLoading || !isReady) ? 'not-allowed' : 'pointer' }}
        >
          ⚡ Tìm phòng Tiêu Chuẩn
          <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '5px', fontWeight: 'normal' }}>Ghép đối thủ cùng ELO</div>
        </button>
        <button
          onClick={() => handleCreateRoom('standard')}
          disabled={isLoading || !isReady}
          style={{ ...menuBtnStyle(theme), width: '280px', opacity: (isLoading || !isReady) ? 0.7 : 1, cursor: (isLoading || !isReady) ? 'not-allowed' : 'pointer' }}
        >
          Tạo phòng Tiêu Chuẩn
          <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '5px', fontWeight: 'normal' }}>Lật màu cờ chuẩn quốc tế</div>
        </button>
        <button
          onClick={() => handleCreateRoom('innovative')}
          disabled={isLoading || !isReady}
          style={{ ...menuBtnStyle(theme), width: '280px', opacity: (isLoading || !isReady) ? 0.7 : 1, cursor: (isLoading || !isReady) ? 'not-allowed' : 'pointer' }}
        >
          Tạo phòng Cải Tiến
          <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '5px', fontWeight: 'normal' }}>Lật màu ngẫu nhiên (Không tính ELO)</div>
        </button>
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '25px', width: '100%', maxWidth: '1200px', flex: 1 }}>
        <LobbyList
          waitingRooms={waitingRooms} liveGames={liveGames} isLoading={isLoading}
          playerId={playerId} theme={theme} onJoinRoom={handleJoinRoom}
        />
        <Leaderboard leaderboard={leaderboard} auth={auth} theme={theme} isNightMode={isNightMode} />
      </div>

      <footer style={{ marginTop: '60px', width: '100%', maxWidth: '1200px', borderTop: `1px solid ${theme.lines}`, paddingTop: '30px', paddingBottom: '30px', textAlign: 'left', opacity: 0.85, fontSize: '0.9rem', lineHeight: '1.6', color: theme.textColor }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '15px' }}>Chơi Cờ Úp Online Miễn Phí Tại Cờ Úp Pro</h2>
        <p style={{ marginBottom: '15px' }}>
          <strong>Cờ Úp Pro</strong> là nền tảng chơi <strong>cờ úp online</strong> đa nền tảng với hệ thống ELO chuẩn xác, không cần cài đặt.
        </p>
        <h3 style={{ fontSize: '1.05rem', margin: '20px 0 10px 0' }}>Hai Chế Độ Chơi</h3>
        <ul style={{ listStyleType: 'disc', paddingLeft: '20px', marginBottom: '15px' }}>
          <li style={{ marginBottom: '8px' }}><strong>Tiêu chuẩn:</strong> Màu cờ cố định theo phe. Kết quả tính ELO.</li>
          <li><strong>Cải tiến:</strong> Màu cờ ngẫu nhiên khi lật. Không tính ELO.</li>
        </ul>
      </footer>
    </div>
  );
}