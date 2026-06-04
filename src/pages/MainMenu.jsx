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
          const STALE_WAITING_MS = 30 * 60 * 1000;  // 30 phut
          const STALE_PLAYING_MS = 15 * 60 * 1000;  // 15 phut — phong playing bi bo roi

          // Cleanup phong waiting qua 30 phut
          const staleWaiting = data
            .filter(m => m.status === 'waiting' && (now - new Date(m.created_at).getTime()) > STALE_WAITING_MS)
            .map(m => m.id);

          // Cleanup phong playing qua 60 phut (updated_at khong doi = bi bo roi)
          const stalePlaying = data
            .filter(m => m.status === 'playing' && (now - new Date(m.updated_at ?? m.created_at).getTime()) > STALE_PLAYING_MS)
            .map(m => m.id);

          const allStale = [...staleWaiting, ...stalePlaying];
          if (allStale.length > 0) {
            await supabase.from('matches').update({ status: 'cancelled' }).in('id', allStale);
          }

          // Dedup bằng Map để tránh hiển thị trùng khi subscription fire nhiều lần
          const waitingMap = new Map();
          const liveMap = new Map();
          data.forEach(m => {
            if (m.status === 'waiting' && (now - new Date(m.created_at).getTime()) < STALE_WAITING_MS) {
              waitingMap.set(m.id, m);
            }
            if (m.status === 'playing' && (now - new Date(m.updated_at ?? m.created_at).getTime()) < STALE_PLAYING_MS) {
              liveMap.set(m.id, m);
            }
          });
          setWaitingRooms([...waitingMap.values()]);
          setLiveGames([...liveMap.values()]);
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, fetchMatches)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
        const m = payload.new;
        // Xóa ngay khỏi UI khi status cancelled/finished — không chờ fetch lại
        if (m.status === 'cancelled' || m.status === 'finished') {
          setWaitingRooms(prev => prev.filter(r => r.id !== m.id));
          setLiveGames(prev => prev.filter(r => r.id !== m.id));
        } else {
          fetchMatches();
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'matches' }, (payload) => {
        const id = payload.old?.id;
        if (id) {
          setWaitingRooms(prev => prev.filter(r => r.id !== id));
          setLiveGames(prev => prev.filter(r => r.id !== id));
        }
      })
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
    // B5 FIX: host re-enter phòng của mình → redirect thẳng, không block
    if (room.host_id === playerId) {
      setGameMode(room.mode);
      setMatchId(room.id);
      setScreen('playing');
      return;
    }
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

  // Bug 1: handleSpectate — vào phòng đang chơi dưới dạng spectator
  const handleSpectate = (game) => {
    setGameMode(game.mode);
    setMatchId(game.id);
    setScreen('playing');
  };

  const handleQuickMatch = async () => {
    setIsLoading(true);
    const available = waitingRooms.filter(r => r.host_id !== playerId);
    if (available.length === 0) { await handleCreateRoom('standard'); return; }

    // U2 FIX: ưu tiên phòng trong ELO range ±200, fallback ra phòng gần nhất
    const ELO_RANGE = 200;
    const inRange = available.filter(r => Math.abs((r.host_elo ?? 1500) - playerElo) <= ELO_RANGE);
    const pool = inRange.length > 0 ? inRange : available;
    const best = [...pool].sort((a, b) =>
      Math.abs((a.host_elo ?? 1500) - playerElo) - Math.abs((b.host_elo ?? 1500) - playerElo)
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
          onSpectate={handleSpectate}
        />
        <Leaderboard leaderboard={leaderboard} auth={auth} theme={theme} isNightMode={isNightMode} />
      </div>

      <footer style={{
        backgroundColor: isNightMode ? '#111' : '#1a1a1a',
        color: '#cccccc',
        padding: '40px 20px',
        fontSize: '14px',
        lineHeight: '1.6',
        borderTop: '4px solid #d32f2f',
        marginTop: '40px',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ color: '#ffffff', fontSize: '24px', marginBottom: '15px' }}>Chơi Cờ Úp Online Miễn Phí Tại Cờ Úp Pro</h2>
          <p style={{ marginBottom: '20px' }}>
            Chào mừng bạn đến với <strong>Cờ Úp Pro</strong> — nền tảng giải trí hàng đầu dành cho những ai đam mê thể loại <strong>game cờ úp 2 người</strong> tại Việt Nam. Không cần cài đặt phức tạp, bạn có thể tham gia <strong>chơi cờ úp</strong> trực tiếp ngay trên trình duyệt web của máy tính hoặc điện thoại di động mọi lúc, mọi nơi.
          </p>

          <h3 style={{ color: '#ffffff', fontSize: '18px', marginTop: '20px', marginBottom: '10px' }}>Cờ Úp Là Gì?</h3>
          <p style={{ marginBottom: '15px' }}>
            Cờ úp là một biến thể độc đáo của cờ tướng truyền thống. Điểm hấp dẫn của trò chơi nằm ở yếu tố bí mật: tất cả các quân cờ (trừ quân Tướng) đều bị úp ngược và sắp xếp ngẫu nhiên khi bắt đầu trận đấu. Chỉ khi quân cờ thực hiện nước đi đầu tiên, danh tính thực sự mới được lật mở, tạo ra những bước ngoặt chiến thuật không thể lường trước.
          </p>

          <h3 style={{ color: '#ffffff', fontSize: '18px', marginTop: '20px', marginBottom: '10px' }}>Luật Chơi Cờ Úp Cơ Bản</h3>
          <ul style={{ paddingLeft: '20px', marginBottom: '15px' }}>
            <li style={{ marginBottom: '8px' }}><strong>Nước đi đầu tiên:</strong> Quân cờ đang úp di chuyển theo luật đi của vị trí đang đứng trên bàn cờ.</li>
            <li style={{ marginBottom: '8px' }}><strong>Lật quân:</strong> Sau nước đi đầu tiên, quân được lật ngửa để hiện danh tính thực (Xe, Pháo, Mã, Tượng, Sĩ, Tốt).</li>
            <li style={{ marginBottom: '8px' }}><strong>Nước đi tiếp theo:</strong> Sau khi lật ngửa, quân di chuyển theo đúng luật của quân cờ thực tế đó.</li>
            <li><strong>Quân Sĩ và Tượng:</strong> Sau khi lật ngửa, không bị giới hạn trong cung hay phần sân nhà — có thể di chuyển qua sông để tấn công.</li>
          </ul>

          <h3 style={{ color: '#ffffff', fontSize: '18px', marginTop: '20px', marginBottom: '10px' }}>Hai Chế Độ Chơi Độc Đáo</h3>
          <ul style={{ paddingLeft: '20px', marginBottom: '15px' }}>
            <li style={{ marginBottom: '8px' }}><strong>Cờ úp tiêu chuẩn:</strong> Màu quân cố định, hệ thống tính điểm ELO để phân định thứ hạng.</li>
            <li><strong>Cờ úp cải tiến:</strong> Màu quân ngẫu nhiên khi lật, tối ưu hóa tính bất ngờ. Không tính ELO.</li>
          </ul>

          <h3 style={{ color: '#ffffff', fontSize: '18px', marginTop: '20px', marginBottom: '10px' }}>Tại Sao Chọn Cờ Úp Pro?</h3>
          <ul style={{ paddingLeft: '20px', marginBottom: '15px' }}>
            <li style={{ marginBottom: '8px' }}>Hoàn toàn <strong>miễn phí</strong>, không nạp thẻ, không quảng cáo gây gián đoạn ván đấu.</li>
            <li style={{ marginBottom: '8px' }}>Thuật toán ghép bàn thông minh theo ELO, kết nối với người chơi thật cùng trình độ.</li>
            <li>Giao diện tối giản, hỗ trợ cả PC lẫn mobile, không cần cài đặt.</li>
          </ul>

          <div style={{ borderTop: '1px solid #333333', marginTop: '20px', paddingTop: '15px', textAlign: 'center', fontSize: '12px', color: '#888888' }}>
            © 2026 Cờ Úp Pro. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}