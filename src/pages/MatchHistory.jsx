import { useState, useEffect } from 'react';
import { supabase } from '../core/supabaseClient';

export default function MatchHistory({ auth, theme, isNightMode, setScreen }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const userId = auth?.userId;
  const playerName = auth?.playerName;

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('matches')
          .select('id, host_id, host_name, host_elo, guest_id, guest_name, guest_elo, mode, winner, game_status, created_at')
          .eq('status', 'finished')
          .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .limit(50);
        if (err) { setError(err.message); return; }
        setMatches(data || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  function getResult(match) {
    const isHost = match.host_id === userId;
    const myColor = isHost ? 'red' : 'black';
    const gs = match.game_status || '';
    if (gs.includes('draw') || match.winner === 'draw') return { label: 'Hoà', color: '#f5a623' };
    if (match.winner === myColor) return { label: 'Thắng', color: '#4caf50' };
    if (match.winner && match.winner !== 'unknown') return { label: 'Thua', color: '#e53935' };
    return { label: '?', color: '#888' };
  }

  function getOpponent(match) {
    if (match.host_id === userId) return match.guest_name || 'Đang chờ...';
    return match.host_name || 'Không rõ';
  }

  function getMyColor(match) {
    return match.host_id === userId ? '🔴 Đỏ' : '⚫ Đen';
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const bg = isNightMode ? '#1a1a2e' : '#f5f0e8';
  const cardBg = isNightMode ? '#16213e' : '#fff';
  const borderColor = isNightMode ? '#2d3a5a' : '#ddd';
  const textColor = isNightMode ? '#eee' : '#222';
  const subColor = isNightMode ? '#aaa' : '#555';

  return (
    <div style={{ minHeight: '100vh', background: bg, color: textColor, padding: '20px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '12px' }}>
          <button
            onClick={() => setScreen('menu')}
            style={{ background: 'none', border: `1.5px solid ${borderColor}`, color: textColor, borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.9rem' }}
          >← Về Menu</button>
          <h2 style={{ margin: 0, fontSize: '1.6rem', flex: 1, textAlign: 'center' }}>📋 Lịch sử trận đấu</h2>
          <span style={{ color: subColor, fontSize: '0.85rem' }}>{playerName}</span>
        </div>

        {/* Content */}
        {!userId && (
          <p style={{ textAlign: 'center', color: subColor }}>Vui lòng đăng nhập để xem lịch sử.</p>
        )}
        {userId && loading && (
          <p style={{ textAlign: 'center', color: subColor }}>Đang tải...</p>
        )}
        {userId && error && (
          <p style={{ textAlign: 'center', color: '#e53935' }}>Lỗi: {error}</p>
        )}
        {userId && !loading && !error && matches.length === 0 && (
          <p style={{ textAlign: 'center', color: subColor }}>Chưa có trận nào hoàn thành.</p>
        )}
        {userId && !loading && matches.map((m) => {
          const result = getResult(m);
          return (
            <div key={m.id} style={{
              background: cardBg, border: `1px solid ${borderColor}`,
              borderLeft: `4px solid ${result.color}`,
              borderRadius: '10px', padding: '14px 18px',
              marginBottom: '12px', display: 'flex',
              alignItems: 'center', gap: '16px',
            }}>
              {/* Result badge */}
              <div style={{
                minWidth: '54px', textAlign: 'center', fontWeight: 'bold',
                fontSize: '1rem', color: result.color,
                background: `${result.color}22`, borderRadius: '6px', padding: '4px 8px',
              }}>{result.label}</div>
              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '1rem' }}>vs {getOpponent(m)}</div>
                <div style={{ color: subColor, fontSize: '0.82rem', marginTop: '2px' }}>
                  {getMyColor(m)} · {m.mode === 'standard' ? 'Tiêu chuẩn' : m.mode === 'custom' ? 'Tùy chỉnh' : (m.mode || '?')}
                </div>
              </div>
              {/* Date */}
              <div style={{ color: subColor, fontSize: '0.8rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {formatDate(m.created_at)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
