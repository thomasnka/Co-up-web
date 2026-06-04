// src/pages/GameBoard.jsx
// FIXES: Demo mode bypass isSpectator, mobile header layout, remove "Choi tiep" button

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useGameState } from '../hooks/useGameState';
import { useMultiplayer } from '../hooks/useMultiplayer';
import ChessBoard from '../components/ChessBoard';
import ResultOverlay from '../components/ResultOverlay';
import DrawBanner from '../components/DrawBanner';

export default function GameBoard({
  gameMode, setScreen, theme, matchId,
  playerId, playerName, playerElo,
  isNightMode, setIsNightMode,
}) {
  const gameRef = useRef(null);
  const [showDrawBanner, setShowDrawBanner] = useState(false);
  const [localDemoMode, setLocalDemoMode] = useState(false);
  const [revealCaptured, setRevealCaptured] = useState(false);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('xq.muted') === 'true');
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);
  const audioCtxRef = useRef(null);

  const handleRemoteMove = useCallback((remoteState) => {
    gameRef.current?.applyRemoteState(remoteState);
  }, []);

  const handleDrawRequestReceived = useCallback(() => {
    setShowDrawBanner(true);
  }, []);

  const mp = useMultiplayer({
    matchId, playerId,
    playerName, playerElo,
    onRemoteMove:  handleRemoteMove,
    onMatchUpdate: null,
    onDrawRequest: handleDrawRequestReceived,
  });

  const { matchData, isWaiting, isSpectator, isSyncing,
          myColor, wsStatus, reconnectCount,
          opponentDisconnected,
          getIsMyTurn, syncMove, syncResult, requestDraw, respondDraw } = mp;

  const isWaitingForOpponent = isWaiting;

  // BUG-1 FIX: lật bàn cờ cho guest (đen)
  // BUG-2 FIX: myColor fallback 'red' khi host_color chưa assign
  const effectiveMyColor = myColor ?? (matchData?.host_id === playerId ? 'red' : 'black');
  const isFlipped = !!matchId && effectiveMyColor === 'black';

  const handleOnDrawRequest = useCallback(() => {
    if (matchId && !isSpectator) requestDraw();
  }, [matchId, isSpectator, requestDraw]);

  const game = useGameState({
    gameMode, theme,
    isWaitingForOpponent,
    // FIX Demo: isDemoMode bypass canInteract hoan toan — khong can matchId/myColor
    canInteract: (turn) => {
      // BUG-4 FIX: dùng localDemoMode (stable ref) thay game?.isDemoMode (stale)
      if (localDemoMode) return true;
      if (!matchId) return true;  // offline: luôn cho phép
      if (isSpectator) return false;
      return getIsMyTurn(turn);
    },
    onMoveMade:    (s) => { if (matchId && !isSpectator) syncMove(s); },
    onGameEnd:     (s) => { if (matchId && !isSpectator) syncResult(s); },
    onDrawRequest: matchId ? handleOnDrawRequest : null,
  });

  gameRef.current = game;

  const {
    pieces, currentTurn, historyLog, capturedPieces, lastMove,
    shakingPieceId, selectedPiece, kingInCheckId, gameStatus, timeLeft,
    validMoves, movedPieceId, lastMoveSound,
    initGame, handleInteraction, handleDraw, handleResign,
    formatTime, activateDemo, getResultMessage, acceptDraw, isDemoMode,
    registerTimerDisplay,
  } = game;

  // BUG-4 FIX: sync localDemoMode khi game.isDemoMode thay đổi
  useEffect(() => { setLocalDemoMode(isDemoMode); }, [isDemoMode]);

  // ── WEB AUDIO SOUND ENGINE ─────────────────────────────────────────────────
  // Dùng oscillator — không cần file mp3, không bị autoplay block
  const playSound = useCallback((type) => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const now = ctx.currentTime;
      switch (type) {
        case 'move':  // tiếng gõ nhẹ — click ngắn
          osc.type = 'sine'; osc.frequency.setValueAtTime(800, now);
          osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
          gain.gain.setValueAtTime(0.18, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.start(now); osc.stop(now + 0.09); break;
        case 'eat':   // tiếng gõ mạnh hơn — 2 tầng
          osc.type = 'triangle'; osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
          gain.gain.setValueAtTime(0.28, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          osc.start(now); osc.stop(now + 0.16); break;
        case 'check': // tiếng cảnh báo — 2 nốt
          osc.type = 'square'; osc.frequency.setValueAtTime(880, now);
          osc.frequency.setValueAtTime(1100, now + 0.1);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.setValueAtTime(0.12, now + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.start(now); osc.stop(now + 0.25); break;
        case 'join':  // tiếng chào — nốt lên
          osc.type = 'sine'; osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
          gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.start(now); osc.stop(now + 0.2); break;
        default: return;
      }
    } catch(e) {}
  }, [isMuted]);

  // Toggle mute + lưu localStorage
  const toggleMute = useCallback(() => {
    setIsMuted(prev => { const next = !prev; localStorage.setItem('xq.muted', next); return next; });
  }, []);

  // Play sound khi lastMoveSound thay đổi
  useEffect(() => {
    if (!lastMoveSound) return;
    playSound(lastMoveSound);
  }, [lastMoveSound]); // eslint-disable-line

  // ── CHAT ───────────────────────────────────────────────────────────────────
  // Scroll xuống cuối khi có tin mới
  useEffect(() => {
    if (showChat) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, showChat]);

  // Nhận chat message từ WS
  useEffect(() => {
    if (!mp.registerCallbacks) return;
    mp.registerCallbacks({
      onChatMessage: (msg) => {
        setChatMessages(prev => [...prev, { from: 'opp', text: msg.text, time: Date.now() }]);
      },
      onOpponentJoined: () => playSound('join'),
    });
  }, []); // eslint-disable-line

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text || !matchId) return;
    mp.wsSendRef?.current?.({ type: 'chat', text, from: playerId });
    setChatMessages(prev => [...prev, { from: 'me', text, time: Date.now() }]);
    setChatInput('');
  }, [chatInput, matchId, mp, playerId]);

  // ── FLIP 3D tracking ───────────────────────────────────────────────────────
  const [flippingPieceId, setFlippingPieceId] = useState(null);
  const prevPiecesRef = useRef([]);
  useEffect(() => {
    const prev = prevPiecesRef.current;
    if (prev.length === 0) { prevPiecesRef.current = pieces; return; }
    // Tìm quân vừa lật (isHidden true → false)
    for (const p of pieces) {
      const old = prev.find(o => o.id === p.id);
      if (old && old.isHidden && !p.isHidden) {
        setFlippingPieceId(p.id);
        setTimeout(() => setFlippingPieceId(null), 400);
        break;
      }
    }
    prevPiecesRef.current = pieces;
  }, [pieces]);

  // Sync kết quả lên Supabase khi gameStatus thay đổi — cả 2 bên đều gọi
  // Đảm bảo timeout/checkmate từ bên bị động cũng được update DB
  // idempotent: Supabase PATCH cùng row nhiều lần không sao
  useEffect(() => {
    if (gameStatus === 'playing') return;
    if (!matchId || isSpectator) return;
    syncResult(gameStatus);
  }, [gameStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = getResultMessage();

  const handleExitGame = useCallback(async () => {
    if (isSpectator) { setScreen('menu'); return; }

    // Đang chờ đối thủ (phòng chưa bắt đầu) → cancel match ngay, không cần confirm
    if (isWaitingForOpponent && matchId) {
      try {
        const { supabase } = await import('../core/supabaseClient');
        await supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchId);
      } catch (e) { console.warn('cancel match error:', e.message); }
      setScreen('menu');
      return;
    }

    if (gameStatus === 'playing') {
      if (window.confirm('Thoát trận giữa chừng bạn sẽ bị xử thua. Xác nhận thoát?')) {
        if (matchId && !isSpectator) await syncResult(`resign_${currentTurn}`);
        setScreen('menu');
      }
    } else {
      setScreen('menu');
    }
  }, [isSpectator, gameStatus, isWaitingForOpponent, currentTurn, matchId, syncResult, setScreen]);

  const handleAcceptDraw = useCallback(async () => {
    setShowDrawBanner(false);
    await respondDraw(true);
    acceptDraw();
  }, [respondDraw, acceptDraw]);

  const handleDeclineDraw = useCallback(async () => {
    setShowDrawBanner(false);
    await respondDraw(false);
  }, [respondDraw]);

  const myDisplayName  = matchData?.host_id === playerId
    ? (matchData?.host_name  || playerName)
    : (matchData?.guest_name || playerName);
  const oppDisplayName = matchData?.host_id === playerId
    ? (matchData?.guest_name || (isDemoMode ? 'Tự chơi 2 bên' : 'Đang chờ...'))
    : (matchData?.host_name  || (isDemoMode ? 'Tự chơi 2 bên' : 'Đang chờ...'));
  const oppElo = matchData?.host_id === playerId ? matchData?.guest_elo : matchData?.host_elo;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px', padding: '10px', minHeight: '100vh', width: '100%', boxSizing: 'border-box', position: 'relative' }}>

      {gameStatus !== 'playing' && result && (
        <ResultOverlay
          result={result} theme={theme}
          onNewGame={initGame}
          onExit={() => setScreen('menu')}
        />
      )}

      {showDrawBanner && gameStatus === 'playing' && (
        <DrawBanner theme={theme} onAccept={handleAcceptDraw} onDecline={handleDeclineDraw} />
      )}

      {/* U1: Opponent disconnect banner */}
      {opponentDisconnected && gameStatus === 'playing' && (
        <div style={{
          position: 'absolute', top: '60px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 45, backgroundColor: '#f57c00', color: '#fff',
          padding: '8px 18px', borderRadius: '20px', fontSize: '0.82rem',
          fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          ⚠️ Đối thủ mất kết nối — đang chờ reconnect...
        </div>
      )}

      {/* Reconnect banner */}
      {(wsStatus === 'reconnecting' || wsStatus === 'connecting') && matchId && (
        <div style={{
          position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 45, backgroundColor: '#455a64', color: '#fff',
          padding: '8px 18px', borderRadius: '20px', fontSize: '0.82rem',
          fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          ⚡ Đang kết nối lại... {reconnectCount > 1 ? `(lần ${reconnectCount})` : ''}
        </div>
      )}

      <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column' }}>

        {/* Doi thu — FIX mobile: wrap chu de khong xuong dong */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px', backgroundColor: theme.panelBg, borderBottom: `1px solid ${theme.lines}`, borderTopLeftRadius: '8px', borderTopRightRadius: '8px', boxShadow: currentTurn === 'black' ? '0 -4px 10px rgba(76,175,80,0.2)' : 'none', transition: 'all 0.3s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
              <div style={{ width: '12px', height: '12px', flexShrink: 0, borderRadius: '50%', backgroundColor: currentTurn === 'black' ? '#4CAF50' : '#888', border: `2px solid ${theme.lines}` }} />
              {/* FIX: truncate ten dai, khong xuong dong */}
              <span style={{ fontWeight: 'bold', color: theme.blackText, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {oppDisplayName}
                {oppElo && <span style={{ fontSize: '0.8rem', opacity: 0.7 }}> ({oppElo})</span>}
                {/* Hiển thị màu sau tên */}
                {myColor && <span style={{ marginLeft: '6px', fontSize: '0.75rem', fontWeight: 'bold', color: effectiveMyColor === 'red' ? theme.blackText : theme.redText }}>
                  [{effectiveMyColor === 'red' ? 'Đen' : 'Đỏ'}]
                </span>}
              </span>
              {/* FIX mobile: nut Demo gon lai */}
              {isWaitingForOpponent && !isDemoMode && (
                <button onClick={() => { activateDemo(); setLocalDemoMode(true); }} style={{ flexShrink: 0, padding: '3px 7px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  Tự chơi 2 bên
                </button>
              )}
              {isSpectator && <span style={{ flexShrink: 0, padding: '2px 6px', backgroundColor: '#757575', color: '#fff', borderRadius: '4px', fontSize: '0.7rem' }}>👁</span>}
              {isSyncing   && <span style={{ flexShrink: 0, fontSize: '0.7rem', opacity: 0.6 }}>⏳</span>}
            </div>
            <div
              ref={el => {
                registerTimerDisplay?.('black', el);
                // Lưu màu inactive vào dataset để DOM update dùng đúng màu
                if (el) {
                  el.dataset.activeBg = '#4CAF50';
                  el.dataset.inactiveBg = isNightMode ? '#333' : '#ddd';
                  el.dataset.activeColor = '#fff';
                  el.dataset.inactiveColor = isNightMode ? '#aaa' : '#555';
                }
              }}
              style={{
                flexShrink: 0,
                backgroundColor: currentTurn === 'black' ? '#4CAF50' : (isNightMode ? '#333' : '#ddd'),
                color: currentTurn === 'black' ? '#fff' : (isNightMode ? '#aaa' : '#555'),
                padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.9rem',
                minWidth: '58px', textAlign: 'center',
                transition: 'background-color 0.3s, color 0.3s',
                border: currentTurn === 'black' ? '2px solid #2e7d32' : '2px solid transparent',
              }}
            >
              {currentTurn === 'black' ? formatTime(timeLeft) : '01:00'}
            </div>
          </div>
          <div style={{ minHeight: '22px', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
            {capturedPieces.red.map((p, i) => {
              const showName = !p.isHidden || revealCaptured;
              return (
                <svg key={`${i}-${revealCaptured}`} width="20" height="20" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="9" fill={theme.pieceBg} stroke={theme.redText} strokeWidth="1.5"/>
                  {showName
                    ? <text x="10" y="13.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={theme.redText} style={{fontFamily:'serif',userSelect:'none'}}>{p.name}</text>
                    : <><line x1="6" y1="6" x2="14" y2="14" stroke={theme.lines} strokeWidth="1.2" strokeLinecap="round"/><line x1="14" y1="6" x2="6" y2="14" stroke={theme.lines} strokeWidth="1.2" strokeLinecap="round"/></>
                  }
                </svg>
              );
            })}
          </div>
        </div>

        <ChessBoard
          theme={theme} gameMode={gameMode}
          pieces={pieces} selectedPiece={selectedPiece}
          shakingPieceId={shakingPieceId} kingInCheckId={kingInCheckId}
          lastMove={lastMove} isFlipped={isFlipped}
          validMoves={validMoves} movedPieceId={movedPieceId}
          flippingPieceId={flippingPieceId}
          onPieceClick={(row, col, piece) => handleInteraction(row, col, piece)}
          onCellClick={(row, col) => handleInteraction(row, col, null)}
        />

        {/* Ban */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px', backgroundColor: theme.panelBg, borderTop: `1px solid ${theme.lines}`, borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', boxShadow: currentTurn === 'red' ? '0 4px 10px rgba(76,175,80,0.2)' : 'none', transition: 'all 0.3s' }}>
          <div style={{ minHeight: '22px', marginBottom: '4px', display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
            {capturedPieces.black.map((p, i) => {
              const showName = !p.isHidden || revealCaptured;
              return (
                <svg key={`${i}-${revealCaptured}`} width="20" height="20" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="9" fill={theme.pieceBg} stroke={theme.blackText} strokeWidth="1.5"/>
                  {showName
                    ? <text x="10" y="13.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={theme.blackText} style={{fontFamily:'serif',userSelect:'none'}}>{p.name}</text>
                    : <><line x1="6" y1="6" x2="14" y2="14" stroke={theme.lines} strokeWidth="1.2" strokeLinecap="round"/><line x1="14" y1="6" x2="6" y2="14" stroke={theme.lines} strokeWidth="1.2" strokeLinecap="round"/></>
                  }
                </svg>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
              <div style={{ width: '12px', height: '12px', flexShrink: 0, borderRadius: '50%', backgroundColor: currentTurn === 'red' ? '#4CAF50' : '#888', border: `2px solid ${theme.lines}` }} />
              <span style={{ fontWeight: 'bold', color: theme.redText, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {myDisplayName}
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}> ({playerElo})</span>
                {/* Hiển thị màu sau tên */}
                {myColor && <span style={{ marginLeft: '6px', fontSize: '0.75rem', fontWeight: 'bold', color: effectiveMyColor === 'red' ? theme.redText : theme.blackText }}>
                  [{effectiveMyColor === 'red' ? 'Đỏ' : 'Đen'}]
                </span>}
              </span>
            </div>
            <div
              ref={el => {
                registerTimerDisplay?.('red', el);
                if (el) {
                  el.dataset.activeBg = '#4CAF50';
                  el.dataset.inactiveBg = isNightMode ? '#333' : '#ddd';
                  el.dataset.activeColor = '#fff';
                  el.dataset.inactiveColor = isNightMode ? '#aaa' : '#555';
                }
              }}
              style={{
                flexShrink: 0,
                backgroundColor: currentTurn === 'red' ? '#4CAF50' : (isNightMode ? '#333' : '#ddd'),
                color: currentTurn === 'red' ? '#fff' : (isNightMode ? '#aaa' : '#555'),
                padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.9rem',
                minWidth: '58px', textAlign: 'center',
                transition: 'background-color 0.3s, color 0.3s',
                border: currentTurn === 'red' ? '2px solid #2e7d32' : '2px solid transparent',
              }}
            >
              {currentTurn === 'red' ? formatTime(timeLeft) : '01:00'}
            </div>
          </div>
        </div>
      </div>

      {/* Cot 2: Dieu khien + Bien ban */}
      <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {/* Control bar — thứ tự: Thoát | Cầu hòa | Nhận thua | Xem/Ẩn cờ | Tối/Sáng */}
        {/* Fit bề ngang bàn cờ (max 520px), không wrap */}
        <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
          <button onClick={handleExitGame}
            style={{ flex: 2, padding: '10px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.panelBg, color: theme.textColor, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            ⬅ Thoát
          </button>
          {!isSpectator && (
            <>
              <button onClick={handleDraw} disabled={gameStatus !== 'playing'}
                style={{ flex: 2, padding: '10px 0', border: 'none', borderRadius: '6px', backgroundColor: gameStatus !== 'playing' ? (isNightMode ? '#444' : '#bbb') : '#757575', color: '#fff', fontWeight: 'bold', cursor: gameStatus !== 'playing' ? 'not-allowed' : 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                🤝 Cầu hòa
              </button>
              <button onClick={() => handleResign(currentTurn)} disabled={gameStatus !== 'playing'}
                style={{ flex: 2, padding: '10px 0', border: 'none', borderRadius: '6px', backgroundColor: gameStatus !== 'playing' ? (isNightMode ? '#444' : '#bbb') : '#d32f2f', color: '#fff', fontWeight: 'bold', cursor: gameStatus !== 'playing' ? 'not-allowed' : 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                🏳️ Nhận thua
              </button>
            </>
          )}
          <button onClick={() => setRevealCaptured(v => !v)} title={revealCaptured ? 'Úp lại quân đã ăn' : 'Lật quân đã ăn'}
            style={{ flex: 1, padding: '10px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: revealCaptured ? (isNightMode ? '#444' : '#e8f5e9') : theme.panelBg, color: theme.textColor, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}>
            {revealCaptured ? '👁' : '🫣'}
          </button>
          <button onClick={toggleMute} title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            style={{ flex: 1, padding: '10px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.panelBg, color: theme.textColor, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}>
            {isMuted ? '🔇' : '🔊'}
          </button>
          {matchId && !isSpectator && (
            <button onClick={() => setShowChat(v => !v)} title="Chat"
              style={{ flex: 1, padding: '10px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: showChat ? (isNightMode ? '#444' : '#e3f2fd') : theme.panelBg, color: theme.textColor, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', position: 'relative' }}>
              💬
              {chatMessages.filter(m => m.from === 'opp').length > 0 && !showChat && (
                <span style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f44336' }} />
              )}
            </button>
          )}
          <button onClick={() => setIsNightMode(!isNightMode)} title={isNightMode ? 'Chế độ sáng' : 'Chế độ tối'}
            style={{ flex: 1, padding: '10px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.panelBg, color: theme.textColor, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}>
            {isNightMode ? '☀️' : '🌙'}
          </button>
        </div>

        {/* Chat box — hiển thị khi showChat=true, nằm trên biên bản */}
        {showChat && matchId && !isSpectator && (
          <div style={{ backgroundColor: theme.panelBg, borderRadius: '8px', border: `1px solid ${theme.lines}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', backgroundColor: isNightMode ? '#222' : '#f0f0f0', borderBottom: `1px solid ${theme.lines}`, fontWeight: 'bold', color: theme.textColor, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>💬 Chat</span>
              <button onClick={() => setShowChat(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: theme.textColor, fontSize: '1rem', padding: '0 4px' }}>✕</button>
            </div>
            {/* Messages */}
            <div style={{ height: '140px', overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {chatMessages.length === 0 ? (
                <div style={{ opacity: 0.4, fontStyle: 'italic', textAlign: 'center', marginTop: '16px', fontSize: '0.8rem', color: theme.textColor }}>Chưa có tin nhắn</div>
              ) : (
                chatMessages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.from === 'me' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '80%', padding: '5px 10px', borderRadius: m.from === 'me' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      backgroundColor: m.from === 'me' ? '#4CAF50' : (isNightMode ? '#333' : '#e0e0e0'),
                      color: m.from === 'me' ? '#fff' : theme.textColor,
                      fontSize: '0.82rem', wordBreak: 'break-word',
                    }}>{m.text}</div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            {/* Input */}
            <div style={{ display: 'flex', gap: '6px', padding: '8px', borderTop: `1px solid ${theme.lines}` }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Nhập tin nhắn..."
                maxLength={100}
                style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.background, color: theme.textColor, fontSize: '0.82rem', outline: 'none' }}
              />
              <button onClick={sendChat} style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', backgroundColor: '#4CAF50', color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.82rem' }}>
                Gửi
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, minHeight: '260px', maxHeight: '450px', backgroundColor: theme.panelBg, borderRadius: '8px', border: `1px solid ${theme.lines}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 15px', backgroundColor: isNightMode ? '#222' : '#f0f0f0', borderBottom: `1px solid ${theme.lines}`, fontWeight: 'bold', color: theme.textColor, fontSize: '0.9rem' }}>
            📝 Biên bản trận đấu
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {historyLog.length === 0 ? (
              <div style={{ opacity: 0.5, fontStyle: 'italic', textAlign: 'center', marginTop: '20px', color: theme.textColor }}>
                Chờ nước đi khai cuộc...
              </div>
            ) : (
              historyLog.map((log, idx) => (
                <div key={idx} style={{ padding: '5px 8px', backgroundColor: idx === 0 ? (isNightMode ? '#333' : '#e3f2fd') : 'transparent', borderRadius: '4px', fontSize: '0.85rem', color: log.color, fontWeight: idx === 0 ? 'bold' : 'normal', borderLeft: idx === 0 ? `3px solid ${log.color}` : '3px solid transparent' }}>
                  <span style={{ opacity: 0.6, marginRight: '6px' }}>#{historyLog.length - idx}</span>
                  {log.entry}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  );
}