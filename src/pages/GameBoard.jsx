// src/pages/GameBoard.jsx
// FIXES: Demo mode bypass isSpectator, mobile header layout, remove "Choi tiep" button

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useGameState } from '../hooks/useGameState';
import { useMultiplayer } from '../hooks/useMultiplayer';
import { useSound } from '../hooks/useSound';
import ChessBoard from '../components/ChessBoard';
import ResultOverlay from '../components/ResultOverlay';
import DrawBanner from '../components/DrawBanner';

// Batch 2/4: render quân bị ăn dạng SVG mini
function CapturedPieces({ pieces, theme }) {
  if (!pieces || pieces.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', minHeight: '22px', alignItems: 'center' }}>
      {pieces.map((p, i) => (
        <svg key={i} width="22" height="22" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r="10"
            fill={theme.pieceBg}
            stroke={p.color === 'red' ? theme.redText : theme.blackText}
            strokeWidth="1.5"
          />
          <circle cx="11" cy="11" r="8" fill="none"
            stroke={p.color === 'red' ? theme.redText : theme.blackText}
            strokeWidth="0.8" opacity="0.5"
          />
          {p.isHidden ? (
            <>
              <line x1="7" y1="7" x2="15" y2="15" stroke={theme.lines} strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
              <line x1="15" y1="7" x2="7" y2="15" stroke={theme.lines} strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
            </>
          ) : (
            <text x="11" y="14.5" textAnchor="middle" fontSize="11" fontWeight="700"
              fill={p.color === 'red' ? theme.redText : theme.blackText}
              style={{ fontFamily: '"Noto Serif SC", "STKaiti", serif', userSelect: 'none' }}
            >{p.name}</text>
          )}
        </svg>
      ))}
    </div>
  );
}

export default function GameBoard({
  gameMode, setScreen, theme, matchId,
  playerId, playerName, playerElo,
  isNightMode, setIsNightMode,
}) {
  const gameRef = useRef(null);
  const [showDrawBanner, setShowDrawBanner] = useState(false);
  const [localDemoMode, setLocalDemoMode] = useState(false);

  // Batch 2: Sound system
  const sound = useSound();

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
    validMoves, movedPieceId, turnCount, lastMoveSound,
    initGame, handleInteraction, handleDraw, handleResign,
    formatTime, activateDemo, getResultMessage, acceptDraw, isDemoMode,
    registerTimerDisplay,
  } = game;

  // BUG-4 FIX: sync localDemoMode khi game.isDemoMode thay đổi
  useEffect(() => { setLocalDemoMode(isDemoMode); }, [isDemoMode]);

  // xqchess roomState: Running khi đã có >= 2 nước đi
  const isRunning = turnCount >= 2;

  // Batch 2: Sound effect khi lastMoveSound thay đổi (check > eat > move)
  useEffect(() => {
    if (!lastMoveSound) return;
    sound.playMove(lastMoveSound);
  }, [lastMoveSound]); // eslint-disable-line react-hooks/exhaustive-deps

  // Batch 2: Wire join sound qua registerCallbacks
  useEffect(() => {
    mp.registerCallbacks?.({
      onOpponentJoined: () => sound.playJoin(),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const result = getResultMessage();

  // xqchess: chỉ confirm khi Running (>= 2 nước)
  const handleExitGame = useCallback(async () => {
    if (isSpectator) { setScreen('menu'); return; }
    if (gameStatus === 'playing' && !isWaitingForOpponent && isRunning) {
      if (window.confirm('Thoát trận giữa chừng bạn sẽ bị xử thua. Xác nhận thoát?')) {
        if (matchId && !isSpectator) await syncResult(`resign_${currentTurn}`);
        setScreen('menu');
      }
    } else {
      setScreen('menu');
    }
  }, [isSpectator, gameStatus, isWaitingForOpponent, isRunning, currentTurn, matchId, syncResult, setScreen]);

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
    ? (matchData?.guest_name || 'Đang chờ...')
    : (matchData?.host_name  || 'Đang chờ...');
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
              </span>
              {/* Batch 4: hiển thị màu của mình khi đang chờ đối thủ */}
              {isWaitingForOpponent && !isDemoMode && myColor && (
                <span style={{ flexShrink: 0, padding: '2px 8px', backgroundColor: myColor === 'red' ? '#d32f2f' : '#1a1a1a', color: '#fff', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                  {myColor === 'red' ? '🔴 Đỏ' : '⚫ Đen'}
                </span>
              )}
              {/* Demo button */}
              {isWaitingForOpponent && !isDemoMode && (
                <button onClick={() => { activateDemo(); setLocalDemoMode(true); }} style={{ flexShrink: 0, padding: '3px 7px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  Demo
                </button>
              )}
              {isSpectator && <span style={{ flexShrink: 0, padding: '2px 6px', backgroundColor: '#757575', color: '#fff', borderRadius: '4px', fontSize: '0.7rem' }}>👁</span>}
              {isSyncing   && <span style={{ flexShrink: 0, fontSize: '0.7rem', opacity: 0.6 }}>⏳</span>}
            </div>
            <div
              ref={el => registerTimerDisplay?.('black', el)}
              style={{ flexShrink: 0, backgroundColor: theme.buttonBg, color: theme.buttonText, padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85rem', opacity: currentTurn === 'black' ? 1 : 0.5 }}
            >
              {currentTurn === 'black' ? formatTime(timeLeft) : '01:00'}
            </div>
          </div>
          <div style={{ minHeight: '22px', marginTop: '4px' }}>
            <CapturedPieces pieces={capturedPieces.red} theme={theme} />
          </div>
        </div>

        <ChessBoard
          theme={theme} gameMode={gameMode}
          pieces={pieces} selectedPiece={selectedPiece}
          shakingPieceId={shakingPieceId} kingInCheckId={kingInCheckId}
          lastMove={lastMove} isFlipped={isFlipped}
          validMoves={validMoves} movedPieceId={movedPieceId}
          onPieceClick={(row, col, piece) => handleInteraction(row, col, piece)}
          onCellClick={(row, col) => handleInteraction(row, col, null)}
        />

        {/* Ban */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px', backgroundColor: theme.panelBg, borderTop: `1px solid ${theme.lines}`, borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', boxShadow: currentTurn === 'red' ? '0 4px 10px rgba(76,175,80,0.2)' : 'none', transition: 'all 0.3s' }}>
          <div style={{ minHeight: '22px', marginBottom: '4px' }}>
            <CapturedPieces pieces={capturedPieces.black} theme={theme} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
              <div style={{ width: '12px', height: '12px', flexShrink: 0, borderRadius: '50%', backgroundColor: currentTurn === 'red' ? '#4CAF50' : '#888', border: `2px solid ${theme.lines}` }} />
              <span style={{ fontWeight: 'bold', color: theme.redText, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {myDisplayName}
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}> ({playerElo})</span>
              </span>
            </div>
            <div
              ref={el => registerTimerDisplay?.('red', el)}
              style={{ flexShrink: 0, backgroundColor: theme.buttonBg, color: theme.buttonText, padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85rem', opacity: currentTurn === 'red' ? 1 : 0.5, transition: 'background-color 0.3s' }}
            >
              {currentTurn === 'red' ? formatTime(timeLeft) : '01:00'}
            </div>
          </div>
        </div>
      </div>

      {/* Cot 2: Dieu khien + Bien ban */}
      <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setIsNightMode(!isNightMode)} style={{ flex: '0 0 42px', padding: '10px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.panelBg, color: theme.textColor, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}>
            {isNightMode ? '☀️' : '🌙'}
          </button>
          {/* Batch 2: sound toggle */}
          <button onClick={sound.toggleMute} title={sound.isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'} style={{ flex: '0 0 42px', padding: '10px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.panelBg, color: theme.textColor, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}>
            {sound.isMuted ? '🔇' : '🔊'}
          </button>
          <button onClick={handleExitGame} style={{ flex: 1, padding: '10px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.panelBg, color: theme.textColor, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>
            ⬅ Thoát
          </button>
          {!isSpectator && (
            <>
              <button onClick={handleDraw} disabled={gameStatus !== 'playing'} style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: '6px', backgroundColor: gameStatus !== 'playing' ? '#aaa' : '#757575', color: '#fff', fontWeight: 'bold', cursor: gameStatus !== 'playing' ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}>
                🤝 Hòa
              </button>
              <button onClick={() => handleResign(currentTurn)} disabled={gameStatus !== 'playing'} style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: '6px', backgroundColor: gameStatus !== 'playing' ? '#aaa' : '#d32f2f', color: '#fff', fontWeight: 'bold', cursor: gameStatus !== 'playing' ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}>
                🏳️ Thua
              </button>
            </>
          )}
        </div>

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