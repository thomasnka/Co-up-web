import { useState, useEffect } from 'react';
import { supabase } from '../core/supabaseClient';

const RESULT_COLORS = {
  win:  { bg: '#1a3a1a', border: '#27ae60', label: 'Thắng', color: '#27ae60' },
  lose: { bg: '#3a1a1a', border: '#e74c3c', label: 'Thua',  color: '#e74c3c' },
  draw: { bg: '#2a2a1a', border: '#f39c12', label: 'Hòa',   color: '#f39c12' },
};

function getResult(m, userId) {
  if (m.winner === 'draw') return 'draw';
  const iAmHost = m.host_id === userId;
  const myColor = iAmHost ? 'red' : 'black';
  if (m.winner === myColor) return 'win';
  if (m.winner && m.winner !== 'draw' && m.winner !== 'unknown') return 'lose';
  return 'draw';
}

function getOpponent(m, userId) {
  return m.host_id === userId
    ? (m.guest_name || '?')
    : (m.host_name || '?');
}

function getMyColor(m, userId) {
  return m.host_id === userId ? 'Đỏ' : 'Đen';
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/* ─── Replay Modal ─── */
function ReplayModal({ match, onClose, theme }) {
  const moves = match.move_log ?? [];
  const [step, setStep] = useState(0);

  const bg = theme?.background ?? '#1a1a2e';
  const panel = theme?.panelBg ?? '#16213e';
  const text = theme?.textColor ?? '#eee';
  const line = theme?.lines ?? '#333';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', boxSizing: 'border-box',
    }}>
      <div style={{
        backgroundColor: panel, borderRadius: '12px', padding: '20px',
        width: '100%', maxWidth: '480px', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', gap: '12px',
        border: `1px solid ${line}`, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: text, fontWeight: 'bold', fontSize: '1rem' }}>
            Xem lại: {match.host_name} vs {match.guest_name}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: text,
            fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1,
          }}>✕</button>
        </div>

        {moves.length === 0 ? (
          <div style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>
            Trận này chưa có dữ liệu nước đi được lưu.
          </div>
        ) : (
          <>
            {/* Step counter */}
            <div style={{ color: '#aaa', fontSize: '0.82rem', textAlign: 'center' }}>
              Nước {step + 1} / {moves.length}
            </div>

            {/* Current move display */}
            <div style={{
              backgroundColor: bg, borderRadius: '8px', padding: '12px 16px',
              border: `1px solid ${line}`, minHeight: '52px',
              display: 'flex', alignItems: 'center',
            }}>
              <span style={{
                color: moves[step]?.color === theme?.redText ? '#e74c3c' : '#ccc',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
              }}>
                {moves[step]?.entry ?? '—'}
              </span>
            </div>

            {/* Scrollable move list */}
            <div style={{
              flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px',
              maxHeight: '280px',
            }}>
              {moves.map((mv, idx) => (
                <div key={idx}
                  onClick={() => setStep(idx)}
                  style={{
                    padding: '5px 10px', borderRadius: '5px', cursor: 'pointer',
                    backgroundColor: idx === step ? (theme?.redText ? '#3a1a1a' : '#1a3060') : 'transparent',
                    borderLeft: idx === step ? `3px solid ${mv.color ?? text}` : '3px solid transparent',
                    color: mv.color ?? text,
                    fontSize: '0.82rem', fontFamily: 'monospace',
                  }}
                >
                  <span style={{ opacity: 0.5, marginRight: '8px' }}>#{moves.length - idx}</span>
                  {mv.entry}
                </div>
              ))}
            </div>

            {/* Nav buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer',
                  backgroundColor: '#2c3e50', color: '#fff', border: 'none',
                  opacity: step === 0 ? 0.4 : 1,
                }}>← Trước</button>
              <button onClick={() => setStep(Math.min(moves.length - 1, step + 1))}
                disabled={step === moves.length - 1}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer',
                  backgroundColor: '#2c3e50', color: '#fff', border: 'none',
                  opacity: step === moves.length - 1 ? 0.4 : 1,
                }}>Sau →</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Main MatchHistory ─── */
export default function MatchHistory({ auth, theme, setScreen }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replayMatch, setReplayMatch] = useState(null);

  const bg = theme?.background ?? '#1a1a2e';
  const panel = theme?.panelBg ?? '#16213e';
  const text = theme?.textColor ?? '#eee';
  const subColor = theme?.subText ?? '#aaa';
  const line = theme?.lines ?? '#333';

  useEffect(() => {
    if (!auth?.userId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('matches')
        .select('id, host_id, host_name, host_elo, guest_id, guest_name, guest_elo, mode, winner, game_status, created_at, move_log')
        .or(`host_id.eq.${auth.userId},guest_id.eq.${auth.userId}`)
        .eq('status', 'finished')
        .order('created_at', { ascending: false })
        .limit(10);
      if (!error) setMatches(data ?? []);
      setLoading(false);
    })();
  }, [auth?.userId]);

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: bg, color: text,
      padding: '16px', boxSizing: 'border-box',
    }}>
      {replayMatch && (
        <ReplayModal match={replayMatch} onClose={() => setReplayMatch(null)} theme={theme} />
      )}

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <button onClick={() => setScreen('menu')} style={{
            background: 'none', border: `1px solid ${line}`, color: text,
            padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
          }}>← Menu</button>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>📋 Lịch Sử Trận Đấu</h2>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: subColor, padding: '40px' }}>Đang tải...</div>
        ) : matches.length === 0 ? (
          <div style={{
            textAlign: 'center', color: subColor, padding: '40px',
            backgroundColor: panel, borderRadius: '10px', border: `1px solid ${line}`,
          }}>
            Chưa có trận nào được lưu.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {matches.map((m) => {
              const res = getResult(m, auth.userId);
              const r = RESULT_COLORS[res];
              const hasMoveLog = m.move_log && m.move_log.length > 0;
              return (
                <div key={m.id} style={{
                  backgroundColor: r.bg, borderRadius: '10px',
                  border: `1px solid ${r.border}`, padding: '12px 14px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
                }}>
                  {/* Result badge */}
                  <div style={{
                    flexShrink: 0, backgroundColor: r.border, color: '#fff',
                    borderRadius: '6px', padding: '4px 10px', fontWeight: 'bold',
                    fontSize: '0.85rem', minWidth: '48px', textAlign: 'center',
                  }}>{r.label}</div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                      vs {getOpponent(m, auth.userId)}
                    </div>
                    <div style={{ color: subColor, fontSize: '0.78rem', marginTop: '2px' }}>
                      {getMyColor(m, auth.userId)} · {m.mode === 'standard' ? 'Tiêu chuẩn' : 'Tùy chỉnh'}
                      {m.move_log ? ` · ${m.move_log.length} nước` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    {/* Date */}
                    <div style={{ color: subColor, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {formatDate(m.created_at)}
                    </div>
                    {/* Replay button */}
                    <button
                      onClick={() => setReplayMatch(m)}
                      style={{
                        padding: '3px 10px', borderRadius: '5px', cursor: 'pointer',
                        backgroundColor: hasMoveLog ? '#2c3e50' : '#222',
                        color: hasMoveLog ? '#fff' : '#666',
                        border: `1px solid ${hasMoveLog ? '#4a6278' : '#444'}`,
                        fontSize: '0.75rem',
                      }}
                    >
                      {hasMoveLog ? '▶ Xem lại' : '—'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
