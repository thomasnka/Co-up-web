// src/pages/GameBoard.jsx
// FIXES: Demo mode bypass isSpectator, mobile header layout, remove "Choi tiep" button

import React, { useState, useCallback, useRef } from 'react';
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

  const { matchData, isWaiting, isSpectator, isSyncing,
          getIsMyTurn, syncMove, syncResult, requestDraw, respondDraw } = mp;

  const isWaitingForOpponent = isWaiting;

  const handleOnDrawRequest = useCallback(() => {
    if (matchId && !isSpectator) requestDraw();
  }, [matchId, isSpectator, requestDraw]);

  const game = useGameState({
    gameMode, theme,
    isWaitingForOpponent,
    // FIX Demo: isDemoMode bypass canInteract hoan toan — khong can matchId/myColor
    canInteract: (turn) => {
      // Demo mode: luon cho phep ca 2 phia
      if (game?.isDemoMode) return true;
      // Spectator: khong cho phep
      if (isSpectator) return false;
      // Online: check turn
      return getIsMyTurn(turn);
    },
    onMoveMade:    (s) => { if (matchId && !isSpectator) syncMove(s); },
    onGameEnd:     (s) => { if (matchId && !isSpectator) syncResult(s); },
    onDrawRequest: matchId ? handleOnDrawRequest : null,
  });

  gameRef.current = game;

  const {
    pieces, currentTurn, historyLog, capturedPieces, lastMove,
    shakingPieceId, selectedPiece, kingInCheckId, gameStatus, timeLeft, movedPieceId,
    initGame, handleInteraction, handleDraw, handleResign,
    formatTime, activateDemo, getResultMessage, acceptDraw, isDemoMode,
  } = game;

  const result = getResultMessage();

  const handleExitGame = useCallback(async () => {
    if (isSpectator) { setScreen('menu'); return; }
    if (gameStatus === 'playing' && !isWaitingForOpponent) {
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
              {/* FIX mobile: nut Demo gon lai */}
              {isWaitingForOpponent && !isDemoMode && (
                <button onClick={activateDemo} style={{ flexShrink: 0, padding: '3px 7px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  Demo
                </button>
              )}
              {isSpectator && <span style={{ flexShrink: 0, padding: '2px 6px', backgroundColor: '#757575', color: '#fff', borderRadius: '4px', fontSize: '0.7rem' }}>👁</span>}
              {isSyncing   && <span style={{ flexShrink: 0, fontSize: '0.7rem', opacity: 0.6 }}>⏳</span>}
            </div>
            <div style={{ flexShrink: 0, backgroundColor: theme.buttonBg, color: theme.buttonText, padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85rem', opacity: currentTurn === 'black' ? 1 : 0.5 }}>
              {currentTurn === 'black' ? formatTime(timeLeft) : '01:00'}
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: theme.redText, minHeight: '18px', marginTop: '4px', fontWeight: 'bold' }}>
            {capturedPieces.red.map((p, i) => <span key={i} style={{ marginRight: '4px' }}>{p.isHidden ? '?' : p.name}</span>)}
          </div>
        </div>

        <ChessBoard
          theme={theme} gameMode={gameMode}
          pieces={pieces} selectedPiece={selectedPiece}
          shakingPieceId={shakingPieceId} kingInCheckId={kingInCheckId} movedPieceId={movedPieceId}
          lastMove={lastMove}
          onPieceClick={(row, col, piece) => handleInteraction(row, col, piece)}
          onCellClick={(row, col) => handleInteraction(row, col, null)}
        />

        {/* Ban */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px', backgroundColor: theme.panelBg, borderTop: `1px solid ${theme.lines}`, borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', boxShadow: currentTurn === 'red' ? '0 4px 10px rgba(76,175,80,0.2)' : 'none', transition: 'all 0.3s' }}>
          <div style={{ fontSize: '0.8rem', color: theme.blackText, minHeight: '18px', marginBottom: '4px', fontWeight: 'bold' }}>
            {capturedPieces.black.map((p, i) => <span key={i} style={{ marginRight: '4px' }}>{p.isHidden ? '?' : p.name}</span>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
              <div style={{ width: '12px', height: '12px', flexShrink: 0, borderRadius: '50%', backgroundColor: currentTurn === 'red' ? '#4CAF50' : '#888', border: `2px solid ${theme.lines}` }} />
              <span style={{ fontWeight: 'bold', color: theme.redText, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {myDisplayName}
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}> ({playerElo})</span>
              </span>
            </div>
            <div style={{ flexShrink: 0, backgroundColor: timeLeft <= 10 && currentTurn === 'red' ? '#d32f2f' : theme.buttonBg, color: theme.buttonText, padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85rem', opacity: currentTurn === 'red' ? 1 : 0.5, transition: 'background-color 0.3s' }}>
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