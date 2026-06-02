// =============================================================================
// FILE: src/App.jsx
// FIXES: B4, U1, U2, U3, U4, L3-5
// + P3-1, P3-2, P3-3 từ session trước
// =============================================================================

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { useGameState } from './hooks/useGameState';
import { useMultiplayer } from './hooks/useMultiplayer';
import './App.css';
import { supabase } from './core/supabaseClient';

function menuBtnStyle(theme) {
  return {
    padding: '15px 30px', backgroundColor: theme.panelBg, color: theme.textColor,
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
    fontSize: '1.1rem', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', transition: 'transform 0.1s',
  };
}

const THEMES = {
  day: {
    background: '#f5f5f7', board: '#e3c697', lines: '#333333', buttonBg: '#333', buttonText: '#fff',
    pieceBg: '#ffffff', pieceBorder: '#c29d62', redText: '#d32f2f', blackText: '#1a1a1a',
    hiddenPiece: '#e0c8a0', panelBg: '#ffffff', textColor: '#333', selectedGlow: 'rgba(52, 152, 219, 0.6)',
  },
  night: {
    background: '#121212', board: '#2c2c2c', lines: '#666666', buttonBg: '#e3c697', buttonText: '#121212',
    pieceBg: '#1e1e1e', pieceBorder: '#555555', redText: '#e57373', blackText: '#90caf9',
    hiddenPiece: '#3a3a3a', panelBg: '#1e1e1e', textColor: '#f5f5f7', selectedGlow: 'rgba(241, 196, 15, 0.6)',
  },
};

export default function App() {
  const [screen, setScreen]           = useState('menu');
  const [gameMode, setGameMode]       = useState('standard');
  const [isNightMode, setIsNightMode] = useState(false);
  const [matchId, setMatchId]         = useState(null);
  const auth  = useAuth();
  const theme = isNightMode ? THEMES.night : THEMES.day;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.background, transition: 'all 0.3s ease', fontFamily: 'sans-serif' }}>
      {screen === 'menu' ? (
        <MainMenu
          setScreen={setScreen} setGameMode={setGameMode} setMatchId={setMatchId}
          theme={theme} auth={auth} isNightMode={isNightMode} setIsNightMode={setIsNightMode}
        />
      ) : (
        <GameBoard
          gameMode={gameMode} setScreen={setScreen} matchId={matchId} theme={theme}
          playerId={auth.playerId} playerName={auth.playerName} playerElo={auth.playerElo}
          isNightMode={isNightMode} setIsNightMode={setIsNightMode}
        />
      )}
    </div>
  );
}

function MainMenu({ setScreen, setGameMode, setMatchId, theme, auth, isNightMode, setIsNightMode }) {
  const [waitingRooms, setWaitingRooms] = useState([]);
  const [liveGames, setLiveGames]       = useState([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [leaderboard, setLeaderboard]   = useState([]);

  const { playerId, playerName, playerElo, isLoggedIn, isLoading: authLoading,
          loginWithGoogle, loginWithFacebook, logout, profile, user } = auth;

  const cardStyle = {
    backgroundColor: theme.panelBg, borderRadius: '8px', padding: '12px 15px', marginBottom: '10px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${theme.lines}`,
  };

  React.useEffect(() => {
    const fetchMatches = async () => {
      try {
        const { data, error } = await supabase.from('matches').select('*').in('status', ['waiting', 'playing']);
        if (error) throw error;
        if (data) {
          const now = Date.now();
          setWaitingRooms(data.filter(m => m.status === 'waiting' && (now - new Date(m.created_at).getTime()) < 30 * 60 * 1000));
          setLiveGames(data.filter(m => m.status === 'playing'));
        }
      } catch (e) { console.error('Loi du lieu sanh:', e.message); }
      finally { setIsLoading(false); }
    };
    const fetchLeaderboard = async () => {
      try {
        const { data, error } = await supabase.from('leaderboard').select('rank, id, display_name, elo').limit(10);
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

  React.useEffect(() => {
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
    } catch (err) { alert('Loi he thong: ' + err.message); }
    finally { setIsLoading(false); }
  };

  const handleJoinRoom = async (room) => {
    if (room.host_id === playerId) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('matches').update({
        guest_id: playerId, guest_name: playerName, guest_elo: playerElo, status: 'playing',
      }).eq('id', room.id);
      // L3-5: check error truoc khi setScreen
      if (error) throw error;
      setGameMode(room.mode); setMatchId(room.id); setScreen('playing');
    } catch (err) { alert('Khong the vao phong: ' + err.message); }
    finally { setIsLoading(false); }
  };

  const handleQuickMatch = async () => {
    setIsLoading(true);
    const available = waitingRooms.filter(r => r.host_id !== playerId);
    if (available.length === 0) { await handleCreateRoom('standard'); return; }
    const best = [...available].sort((a, b) => Math.abs(a.host_elo - playerElo) - Math.abs(b.host_elo - playerElo))[0];
    await handleJoinRoom(best);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', color: theme.textColor, padding: '20px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: '1200px', display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', backgroundColor: theme.panelBg, padding: '8px 20px', borderRadius: '20px', border: `1px solid ${theme.lines}`, boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
          <button onClick={() => setIsNightMode(!isNightMode)} style={{ padding: '4px 10px', backgroundColor: theme.buttonBg, color: theme.buttonText, border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
            {isNightMode ? 'Sang' : 'Toi'}
          </button>
          <div style={{ width: '1px', height: '20px', backgroundColor: theme.lines, margin: '0 5px' }} />
          {authLoading ? (
            <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>Dang tai...</span>
          ) : isLoggedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {profile?.avatar_url && <img src={profile.avatar_url} alt="avatar" style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${theme.lines}` }} />}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{playerName}</span>
                <span style={{ fontSize: '0.8rem', color: theme.redText, fontWeight: 'bold' }}>ELO: {playerElo}</span>
              </div>
              <button onClick={logout} style={{ padding: '3px 10px', fontSize: '0.75rem', backgroundColor: 'transparent', color: theme.textColor, border: `1px solid ${theme.lines}`, borderRadius: '4px', cursor: 'pointer', opacity: 0.7 }}>Dang xuat</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '0.9rem', opacity: 0.7 }}>{playerName}</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={loginWithGoogle} style={{ padding: '4px 10px', fontSize: '0.75rem', backgroundColor: '#db4437', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Google</button>
                <button onClick={loginWithFacebook} style={{ padding: '4px 10px', fontSize: '0.75rem', backgroundColor: '#1877F2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Facebook</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <h1 style={{ fontSize: '3rem', margin: '0 0 5px 0' }}>CO UP <span style={{ color: theme.redText }}>PRO</span></h1>
      <p style={{ margin: '0 0 30px 0', opacity: 0.8, fontSize: '1.1rem' }}>Lac nuoc hai Xe danh bo phi. Gap thoi mot Tot cung thanh cong!</p>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '40px', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
        <button onClick={handleQuickMatch} disabled={isLoading} style={{ ...menuBtnStyle(theme), width: '280px', backgroundColor: '#4CAF50', color: '#fff', transform: 'scale(1.05)', boxShadow: '0 8px 20px rgba(76,175,80,0.4)', opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
          Tim phong Tieu Chuan
          <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '5px', fontWeight: 'normal' }}>Ghep doi thu cung ELO</div>
        </button>
        <button onClick={() => handleCreateRoom('standard')} disabled={isLoading} style={{ ...menuBtnStyle(theme), width: '280px', opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
          Tao phong Tieu Chuan
          <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '5px', fontWeight: 'normal' }}>Lat mau co chuan quoc te</div>
        </button>
        <button onClick={() => handleCreateRoom('innovative')} disabled={isLoading} style={{ ...menuBtnStyle(theme), width: '280px', opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
          Tao phong Cai Tien
          <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '5px', fontWeight: 'normal' }}>Lat mau ngau nhien (Khong tinh ELO)</div>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '25px', width: '100%', maxWidth: '1200px', flex: 1 }}>
        <div>
          <h3 style={{ borderBottom: `2px solid ${theme.lines}`, paddingBottom: '10px', marginBottom: '15px' }}>Ban cho ({waitingRooms.length})</h3>
          {isLoading ? <div style={{ textAlign: 'center', padding: '20px', opacity: 0.6 }}>Dang ket noi may chu...</div>
          : waitingRooms.length === 0 ? <div style={{ textAlign: 'center', padding: '20px', opacity: 0.6, fontStyle: 'italic', border: `1px dashed ${theme.lines}`, borderRadius: '8px' }}>Chua co phong cho.</div>
          : waitingRooms.map(room => (
            <div key={room.id} style={cardStyle}>
              <div>
                <div style={{ fontWeight: 'bold' }}>{room.host_name} <span style={{ fontSize: '0.85rem', color: theme.redText }}>({room.host_elo})</span></div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{room.mode === 'standard' ? 'Tieu Chuan' : 'Cai Tien'}</div>
              </div>
              <button onClick={() => handleJoinRoom(room)} style={{ padding: '6px 12px', backgroundColor: theme.lines, color: theme.background, border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                {room.host_id === playerId ? 'Dang cho...' : 'Vao Ban'}
              </button>
            </div>
          ))}
        </div>

        <div>
          <h3 style={{ borderBottom: `2px solid ${theme.lines}`, paddingBottom: '10px', marginBottom: '15px' }}>Dang dien ra ({liveGames.length})</h3>
          {isLoading ? <div style={{ textAlign: 'center', padding: '20px', opacity: 0.6 }}>Dang ket noi may chu...</div>
          : liveGames.length === 0 ? <div style={{ textAlign: 'center', padding: '20px', opacity: 0.6, fontStyle: 'italic', border: `1px dashed ${theme.lines}`, borderRadius: '8px' }}>Hien khong co tran dau nao.</div>
          : liveGames.map(game => (
            <div key={game.id} style={cardStyle}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                  <span style={{ color: theme.redText }}>{game.host_name}</span> vs <span>{game.guest_name}</span>
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{game.mode === 'standard' ? 'Tieu Chuan' : 'Cai Tien'}</div>
              </div>
              <button style={{ padding: '6px 12px', backgroundColor: 'transparent', color: theme.textColor, border: `1px solid ${theme.lines}`, borderRadius: '4px', cursor: 'pointer' }}>Xem</button>
            </div>
          ))}
        </div>

        <div>
          <h3 style={{ borderBottom: `2px solid ${theme.lines}`, paddingBottom: '10px', marginBottom: '15px' }}>Top Cao Thu</h3>
          {leaderboard.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', opacity: 0.6, fontStyle: 'italic', border: `1px dashed ${theme.lines}`, borderRadius: '8px' }}>Chua co du lieu xep hang.</div>
          ) : (
            leaderboard.map(entry => {
              const isMe  = isLoggedIn && entry.id === user?.id;
              const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
              return (
                <div key={entry.id} style={{ ...cardStyle, backgroundColor: isMe ? (isNightMode ? '#1a2a1a' : '#f0fff0') : theme.panelBg, border: isMe ? '1px solid #4CAF50' : `1px solid ${theme.lines}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.1rem', minWidth: '28px' }}>{medal}</span>
                    <span style={{ fontWeight: isMe ? 'bold' : 'normal', color: isMe ? '#4CAF50' : theme.textColor }}>
                      {entry.display_name}
                      {isMe && <span style={{ fontSize: '0.75rem', marginLeft: '6px', opacity: 0.7 }}>(ban)</span>}
                    </span>
                  </div>
                  <span style={{ fontWeight: 'bold', color: theme.redText, fontSize: '0.95rem' }}>{entry.elo} ELO</span>
                </div>
              );
            })
          )}
          {isLoggedIn && leaderboard.length > 0 && !leaderboard.find(r => r.id === user?.id) && (
            <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', border: `1px dashed ${theme.lines}`, fontSize: '0.85rem', opacity: 0.7, textAlign: 'center' }}>
              ELO cua ban: <strong>{playerElo}</strong> — Chua vao top 10
            </div>
          )}
        </div>
      </div>

      <footer style={{ marginTop: '60px', width: '100%', maxWidth: '1200px', borderTop: `1px solid ${theme.lines}`, paddingTop: '30px', paddingBottom: '30px', textAlign: 'left', opacity: 0.85, fontSize: '0.9rem', lineHeight: '1.6' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '15px', color: theme.textColor }}>Choi Co Up Online Mien Phi Tai Co Up Pro</h2>
        <p><strong>Co Up Pro</strong> la nen tang choi co up online voi he thong ELO chuan xac, ho tro PC va Mobile.</p>
      </footer>
    </div>
  );
}

function GameBoard({ gameMode, setScreen, theme, matchId, playerId, playerName, playerElo, isNightMode, setIsNightMode }) {
  const gameRef = useRef(null);
  const [showDrawBanner, setShowDrawBanner] = useState(false);

  const handleRemoteMove = useCallback((remoteState) => {
    gameRef.current?.applyRemoteState(remoteState);
  }, []);

  const handleDrawRequestReceived = useCallback(() => {
    setShowDrawBanner(true);
  }, []);

  const mp = useMultiplayer({
    matchId, playerId,
    onRemoteMove:  handleRemoteMove,
    onMatchUpdate: null,
    onDrawRequest: handleDrawRequestReceived,
  });

  const { matchData, isWaiting, isSpectator, isSyncing, getIsMyTurn,
          syncMove, syncResult, requestDraw, respondDraw } = mp;

  const isWaitingForOpponent = isWaiting;

  const handleOnDrawRequest = useCallback(() => {
    if (matchId && !isSpectator) requestDraw();
  }, [matchId, isSpectator, requestDraw]);

  const game = useGameState({
    gameMode, theme,
    isWaitingForOpponent,
    canInteract:   (currentTurn) => !isSpectator && getIsMyTurn(currentTurn),
    onMoveMade:    (nextState)   => { if (matchId && !isSpectator) syncMove(nextState); },
    onGameEnd:     (status)      => { if (matchId && !isSpectator) syncResult(status); },
    onDrawRequest: matchId ? handleOnDrawRequest : null,
  });

  gameRef.current = game;

  const {
    pieces, currentTurn, historyLog, capturedPieces, lastMove,
    shakingPieceId, selectedPiece, kingInCheckId, gameStatus, timeLeft,
    initGame, handleInteraction, handleDraw, handleResign,
    formatTime, activateDemo, getResultMessage, acceptDraw, isDemoMode,
  } = game;

  const result = getResultMessage();

  // U3: spectator thoat thang, khong confirm
  // L3-5: await syncResult truoc setScreen
  const handleExitGame = useCallback(async () => {
    if (isSpectator) { setScreen('menu'); return; }
    if (gameStatus === 'playing' && !isWaitingForOpponent) {
      if (window.confirm('Thoat tran giua chung ban se bi xu thua. Xac nhan thoat?')) {
        const resignStatus = `resign_${currentTurn}`;
        if (matchId && !isSpectator) await syncResult(resignStatus);
        setScreen('menu');
      }
    } else {
      setScreen('menu');
    }
  }, [isSpectator, gameStatus, isWaitingForOpponent, currentTurn, matchId, syncResult, setScreen]);

  // U1: rematch
  const handleRematch = useCallback(() => { initGame(); }, [initGame]);

  // U2: phan hoi xin hoa
  const handleAcceptDraw = useCallback(async () => {
    setShowDrawBanner(false);
    await respondDraw(true);
    acceptDraw();
  }, [respondDraw, acceptDraw]);

  const handleDeclineDraw = useCallback(async () => {
    setShowDrawBanner(false);
    await respondDraw(false);
  }, [respondDraw]);

  const gridIntersections = useMemo(() => {
    const pts = [];
    for (let r = 0; r <= 9; r++) for (let c = 0; c <= 8; c++) pts.push({ row: r, col: c });
    return pts;
  }, []);

  const crosshairPoints = useMemo(() => [
    { r: 2, c: 1 }, { r: 2, c: 7 }, { r: 7, c: 1 }, { r: 7, c: 7 },
    { r: 3, c: 0 }, { r: 3, c: 2 }, { r: 3, c: 4 }, { r: 3, c: 6 }, { r: 3, c: 8 },
    { r: 6, c: 0 }, { r: 6, c: 2 }, { r: 6, c: 4 }, { r: 6, c: 6 }, { r: 6, c: 8 },
  ], []);

  const myDisplayName  = matchData?.host_id === playerId ? (matchData?.host_name  || playerName) : (matchData?.guest_name || playerName);
  const oppDisplayName = matchData?.host_id === playerId ? (matchData?.guest_name || 'Dang cho doi thu...') : (matchData?.host_name || 'Dang cho doi thu...');
  const oppElo         = matchData?.host_id === playerId ? matchData?.guest_elo : matchData?.host_elo;

  // B4: 3 params, U4: onPointerDown
  const handlePiecePointer = useCallback((e, row, col, piece) => {
    e.stopPropagation();
    handleInteraction(row, col, piece);
  }, [handleInteraction]);

  const handleGridPointer = useCallback((e, row, col) => {
    handleInteraction(row, col, null);
  }, [handleInteraction]);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px', padding: '10px', minHeight: '100vh', width: '100%', boxSizing: 'border-box', position: 'relative' }}>

      {/* U1: RESULT OVERLAY */}
      {gameStatus !== 'playing' && result && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}>
          <div className="confirm-popup" style={{ backgroundColor: theme.panelBg, padding: '30px 20px', borderRadius: '16px', boxShadow: '0 15px 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', border: `1px solid ${theme.lines}`, width: '85%', maxWidth: '400px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2rem', color: theme.textColor, margin: '0 0 8px 0', textTransform: 'uppercase' }}>{result.title}</h2>
            <p style={{ fontSize: '1rem', opacity: 0.75, margin: '0 0 20px 0' }}>{result.sub}</p>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button onClick={handleRematch} style={{ ...menuBtnStyle(theme), flex: 1, backgroundColor: '#4CAF50', color: '#fff', fontSize: '0.9rem', padding: '12px' }}>Choi tiep</button>
              <button onClick={initGame}      style={{ ...menuBtnStyle(theme), flex: 1, backgroundColor: theme.redText, color: '#fff', fontSize: '0.9rem', padding: '12px' }}>Van moi</button>
              <button onClick={() => setScreen('menu')} style={{ ...menuBtnStyle(theme), flex: 1, backgroundColor: '#555', color: '#fff', fontSize: '0.9rem', padding: '12px' }}>Thoat</button>
            </div>
          </div>
        </div>
      )}

      {/* U2: DRAW BANNER */}
      {showDrawBanner && gameStatus === 'playing' && (
        <div style={{ position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 40, backgroundColor: theme.panelBg, border: `1px solid ${theme.lines}`, borderRadius: '12px', padding: '14px 20px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 'bold', color: theme.textColor }}>Doi thu xin hoa</span>
          <button onClick={handleAcceptDraw}  style={{ padding: '6px 14px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Dong y</button>
          <button onClick={handleDeclineDraw} style={{ padding: '6px 14px', backgroundColor: '#d32f2f', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Tu choi</button>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 15px', backgroundColor: theme.panelBg, borderBottom: `1px solid ${theme.lines}`, borderTopLeftRadius: '8px', borderTopRightRadius: '8px', boxShadow: currentTurn === 'black' ? '0 -4px 10px rgba(76,175,80,0.2)' : 'none', transition: 'all 0.3s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: currentTurn === 'black' ? '#4CAF50' : '#888', border: `2px solid ${theme.lines}` }} />
              <span style={{ fontWeight: 'bold', color: theme.blackText, fontSize: '1.05rem' }}>
                {oppDisplayName}
                {oppElo && <span style={{ fontSize: '0.85rem', opacity: 0.7 }}> ({oppElo})</span>}
              </span>
              {isWaitingForOpponent && !isDemoMode && (
                <button onClick={activateDemo} style={{ marginLeft: '10px', padding: '4px 8px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>Demo</button>
              )}
              {isSpectator && <span style={{ marginLeft: '8px', padding: '2px 8px', backgroundColor: '#757575', color: '#fff', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>Dang xem</span>}
              {isSyncing   && <span style={{ marginLeft: '8px', fontSize: '0.75rem', opacity: 0.6 }}>dang sync...</span>}
            </div>
            <div style={{ backgroundColor: theme.buttonBg, color: theme.buttonText, padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold', opacity: currentTurn === 'black' ? 1 : 0.5 }}>
              {currentTurn === 'black' ? formatTime(timeLeft) : '01:00'}
            </div>
          </div>
          <div style={{ fontSize: '0.85rem', color: theme.redText, minHeight: '20px', marginTop: '5px', fontWeight: 'bold' }}>
            {capturedPieces.red.map((p, i) => <span key={i} style={{ marginRight: '6px' }}>{p.isHidden ? '?' : p.name}</span>)}
          </div>
        </div>

        {/* U4: touchAction none tren SVG */}
        <svg viewBox="0 0 900 1000" style={{ width: '100%', backgroundColor: theme.board, display: 'block', touchAction: 'none' }}>
          <defs>
            <filter id="piece-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="1.5" dy="3" stdDeviation="3" floodOpacity="0.25" />
            </filter>
            <radialGradient id="revealed-grad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor={theme.pieceBg} />
            </radialGradient>
            <radialGradient id="hidden-grad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#f7f2ea" />
              <stop offset="100%" stopColor="#d4c8b8" />
            </radialGradient>
          </defs>

          {lastMove && (
            <>
              <rect x={lastMove.from.col * 100 + 5} y={lastMove.from.row * 100 + 5} width="90" height="90" fill="#ffeb3b" opacity="0.3" rx="8" />
              <rect x={lastMove.to.col   * 100 + 5} y={lastMove.to.row   * 100 + 5} width="90" height="90" fill="#4CAF50" opacity="0.3" rx="8" />
            </>
          )}

          <rect x="40" y="40" width="820" height="920" fill="none" stroke={theme.lines} strokeWidth="4" />
          {[...Array(10)].map((_, i) => <line key={`h-${i}`} x1="50" y1={i*100+50} x2="850" y2={i*100+50} stroke={theme.lines} strokeWidth="2" />)}
          {[...Array(9)].map((_, i) => (
            <React.Fragment key={`v-${i}`}>
              <line x1={i*100+50} y1="50"  x2={i*100+50} y2={i===0||i===8?'950':'450'} stroke={theme.lines} strokeWidth="2" />
              {i>0&&i<8&&<line x1={i*100+50} y1="550" x2={i*100+50} y2="950" stroke={theme.lines} strokeWidth="2" />}
            </React.Fragment>
          ))}
          <line x1="350" y1="50"  x2="550" y2="250" stroke={theme.lines} strokeWidth="2" />
          <line x1="550" y1="50"  x2="350" y2="250" stroke={theme.lines} strokeWidth="2" />
          <line x1="350" y1="750" x2="550" y2="950" stroke={theme.lines} strokeWidth="2" />
          <line x1="550" y1="750" x2="350" y2="950" stroke={theme.lines} strokeWidth="2" />

          <text x="450" y="505" textAnchor="middle" dominantBaseline="middle" fontSize="28" fontWeight="bold" fill={theme.lines} opacity="0.25" letterSpacing="8">
            CO UP PRO — {gameMode === 'standard' ? 'TIEU CHUAN' : 'CAI TIEN'}
          </text>

          {[...Array(9)].map((_, i) => (
            <React.Fragment key={`coord-${i}`}>
              <text x={i*100+50} y="32"  textAnchor="middle" fontSize="16" fontWeight="bold" fill={theme.lines} opacity="0.6">{i+1}</text>
              <text x={i*100+50} y="978" textAnchor="middle" fontSize="16" fontWeight="bold" fill={theme.lines} opacity="0.6">{9-i}</text>
            </React.Fragment>
          ))}

          {crosshairPoints.map((pt, idx) => {
            const cx=pt.c*100+50, cy=pt.r*100+50, d=8, l=20;
            return (
              <g key={`ch-${idx}`} stroke={theme.lines} strokeWidth="2">
                {pt.c>0&&<path d={`M ${cx-d-l} ${cy-d} L ${cx-d} ${cy-d} L ${cx-d} ${cy-d-l} M ${cx-d-l} ${cy+d} L ${cx-d} ${cy+d} L ${cx-d} ${cy+d+l}`} fill="none"/>}
                {pt.c<8&&<path d={`M ${cx+d+l} ${cy-d} L ${cx+d} ${cy-d} L ${cx+d} ${cy-d-l} M ${cx+d+l} ${cy+d} L ${cx+d} ${cy+d} L ${cx+d} ${cy+d+l}`} fill="none"/>}
              </g>
            );
          })}

          {gridIntersections.map(pt => (
            <circle key={`grid-${pt.row}-${pt.col}`} cx={pt.col*100+50} cy={pt.row*100+50} r="45"
              fill="transparent"
              onPointerDown={(e) => handleGridPointer(e, pt.row, pt.col)}
              style={{ cursor: selectedPiece ? 'crosshair' : 'default', touchAction: 'none' }}
            />
          ))}

          {pieces.map(p => {
            const cx=p.col*100+50, cy=p.row*100+50;
            const isSelected = selectedPiece?.id === p.id;
            return (
              <g key={p.id}
                onPointerDown={(e) => handlePiecePointer(e, p.row, p.col, p)}
                className={shakingPieceId===p.id ? 'shake-error' : kingInCheckId===p.id ? 'in-check-warning' : ''}
                filter="url(#piece-shadow)"
                style={{ cursor: 'pointer', touchAction: 'none' }}
              >
                {isSelected && <circle cx={cx} cy={cy} r="50" fill="none" stroke={theme.selectedGlow} strokeWidth="4" filter="none"/>}
                <circle cx={cx} cy={cy} r="42" fill="url(#revealed-grad)" stroke="#999" strokeWidth="1.5"/>
                {p.isHidden
                  ? <circle cx={cx} cy={cy} r="34" fill="url(#hidden-grad)" stroke="#bba993" strokeWidth="1.5"/>
                  : <text x={cx} y={cy+2} textAnchor="middle" dominantBaseline="middle" fontSize="46" fontWeight="bold" fill={p.color==='red'?theme.redText:theme.blackText}>{p.name}</text>
                }
              </g>
            );
          })}
        </svg>

        <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 15px', backgroundColor: theme.panelBg, borderTop: `1px solid ${theme.lines}`, borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', boxShadow: currentTurn==='red'?'0 4px 10px rgba(76,175,80,0.2)':'none', transition: 'all 0.3s' }}>
          <div style={{ fontSize: '0.85rem', color: theme.blackText, minHeight: '20px', marginBottom: '5px', fontWeight: 'bold' }}>
            {capturedPieces.black.map((p, i) => <span key={i} style={{ marginRight: '6px' }}>{p.isHidden?'?':p.name}</span>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: currentTurn==='red'?'#4CAF50':'#888', border: `2px solid ${theme.lines}` }} />
              <span style={{ fontWeight: 'bold', color: theme.redText, fontSize: '1.05rem' }}>
                {myDisplayName}
                <span style={{ fontSize: '0.85rem', opacity: 0.7 }}> ({playerElo})</span>
              </span>
            </div>
            <div style={{ backgroundColor: timeLeft<=10&&currentTurn==='red'?'#d32f2f':theme.buttonBg, color: theme.buttonText, padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold', opacity: currentTurn==='red'?1:0.5, transition: 'background-color 0.3s' }}>
              {currentTurn==='red'?formatTime(timeLeft):'01:00'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setIsNightMode(!isNightMode)} style={{ flex: '0 0 46px', padding: '12px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.panelBg, color: theme.textColor, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}>
            {isNightMode ? 'S' : 'T'}
          </button>
          <button onClick={handleExitGame} style={{ flex: 1, padding: '12px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.panelBg, color: theme.textColor, fontWeight: 'bold', cursor: 'pointer' }}>Thoat</button>
          {!isSpectator && (
            <>
              <button onClick={handleDraw}                    disabled={gameStatus!=='playing'} style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: '6px', backgroundColor: gameStatus!=='playing'?'#aaa':'#757575', color: '#fff', fontWeight: 'bold', cursor: gameStatus!=='playing'?'not-allowed':'pointer' }}>Hoa</button>
              <button onClick={() => handleResign(currentTurn)} disabled={gameStatus!=='playing'} style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: '6px', backgroundColor: gameStatus!=='playing'?'#aaa':'#d32f2f', color: '#fff', fontWeight: 'bold', cursor: gameStatus!=='playing'?'not-allowed':'pointer' }}>Thua</button>
            </>
          )}
        </div>

        <div style={{ flex: 1, minHeight: '260px', maxHeight: '450px', backgroundColor: theme.panelBg, borderRadius: '8px', border: `1px solid ${theme.lines}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 15px', backgroundColor: isNightMode?'#222':'#f0f0f0', borderBottom: `1px solid ${theme.lines}`, fontWeight: 'bold' }}>Bien ban tran dau</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {historyLog.length === 0
              ? <div style={{ opacity: 0.5, fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>Cho nuoc di khai cuoc...</div>
              : historyLog.map((log, idx) => (
                <div key={idx} style={{ padding: '6px 10px', backgroundColor: idx===0?(isNightMode?'#333':'#e3f2fd'):'transparent', borderRadius: '4px', fontSize: '0.9rem', color: log.color, fontWeight: idx===0?'bold':'normal', borderLeft: idx===0?`3px solid ${log.color}`:'3px solid transparent' }}>
                  <span style={{ opacity: 0.6, marginRight: '8px' }}>#{historyLog.length-idx}</span> {log.entry}
                </div>
              ))
            }
          </div>
        </div>
      </div>

    </div>
  );
}