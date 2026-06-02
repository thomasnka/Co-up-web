// src/pages/GameBoard.jsx

import React, { useState, useCallback, useRef } from 'react';
import { useGameState } from '../hooks/useGameState';
import { useMultiplayer } from '../hooks/useMultiplayer';
import { menuBtnStyle } from '../constants/themes';
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
    canInteract:   (turn) => !isSpectator && getIsMyTurn(turn),
    onMoveMade:    (s)    => { if (matchId && !isSpectator) syncMove(s); },
    onGameEnd:     (s)    => { if (matchId && !isSpectator) syncResult(s); },
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

  // U3: spectator thoát thẳng / L3-5: await sync trước setScreen
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

  const handleRematch  = useCallback(() => { initGame(); }, [initGame]);

  const handleAcceptDraw = useCallback(async () => {
    setShowDrawBanner(false);
    await respondDraw(true);
    acceptDraw();
  }, [respondDraw, acceptDraw]);

  const handleDeclineDraw = useCallback(async () => {
    setShowDrawBanner(false);
    await respondDraw(false);
  }, [respondDraw]);

  // Tên hiển thị
  const myDisplayName  = matchData?.host_id === playerId
    ? (matchData?.host_name  || playerName)
    : (matchData?.guest_name || playerName);
  const oppDisplayName = matchData?.host_id === playerId
    ? (matchData?.guest_name || 'Đang chờ đối thủ...')
    : (matchData?.host_name  || 'Đang chờ đối thủ...');
  const oppElo = matchData?.host_id === playerId ? matchData?.guest_elo : matchData?.host_elo;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px', padding: '10px', minHeight: '100vh', width: '100%', boxSizing: 'border-box', position: 'relative' }}>

      {/* Result popup */}
      {gameStatus !== 'playing' && result && (
        <ResultOverlay
          result={result} theme={theme}
          onRematch={handleRematch}
          onNewGame={initGame}
          onExit={() => setScreen('menu')}
        />
      )}

      {/* Draw banner */}
      {showDrawBanner && gameStatus === 'playing' && (
        <DrawBanner theme={theme} onAccept={handleAcceptDraw} onDecline={handleDeclineDraw} />
      )}

      {/* Cột 1: Bàn cờ */}
      <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column' }}>

        {/* Đối thủ */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 15px', backgroundColor: theme.panelBg, borderBottom: `1px solid ${theme.lines}`, borderTopLeftRadius: '8px', borderTopRightRadius: '8px', boxShadow: currentTurn === 'black' ? '0 -4px 10px rgba(76,175,80,0.2)' : 'none', transition: 'all 0.3s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: currentTurn === 'black' ? '#4CAF50' : '#888', border: `2px solid ${theme.lines}` }} />
              <span style={{ fontWeight: 'bold', color: theme.blackText, fontSize: '1.05rem' }}>
                {oppDisplayName}
                {oppElo && <span style={{ fontSize: '0.85rem', opacity: 0.7 }}> ({oppElo})</span>}
              </span>
              {isWaitingForOpponent && !isDemoMode && (
                <button onClick={activateDemo} style={{ marginLeft: '10px', padding: '4px 8px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                  Tự chơi (Demo)
                </button>
              )}
              {isSpectator && <span style={{ marginLeft: '8px', padding: '2px 8px', backgroundColor: '#757575', color: '#fff', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>👁 Đang xem</span>}
              {isSyncing   && <span style={{ marginLeft: '8px', fontSize: '0.75rem', opacity: 0.6 }}>⏳ đang sync...</span>}
            </div>
            <div style={{ backgroundColor: theme.buttonBg, color: theme.buttonText, padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold', opacity: currentTurn === 'black' ? 1 : 0.5 }}>
              ⏱ {currentTurn === 'black' ? formatTime(timeLeft) : '01:00'}
            </div>
          </div>
          {/* Graveyard đỏ */}
          <div style={{ fontSize: '0.85rem', color: theme.redText, minHeight: '20px', marginTop: '5px', fontWeight: 'bold' }}>
            {capturedPieces.red.map((p, i) => <span key={i} style={{ marginRight: '6px' }}>{p.isHidden ? '?' : p.name}</span>)}
          </div>
        </div>

        {/* SVG bàn cờ */}
        <ChessBoard
          theme={theme} gameMode={gameMode}
          pieces={pieces} selectedPiece={selectedPiece}
          shakingPieceId={shakingPieceId} kingInCheckId={kingInCheckId}
          lastMove={lastMove}
          onPieceClick={(row, col, piece) => handleInteraction(row, col, piece)}
          onCellClick={(row, col) => handleInteraction(row, col, null)}
        />

        {/* Bạn */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 15px', backgroundColor: theme.panelBg, borderTop: `1px solid ${theme.lines}`, borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', boxShadow: currentTurn === 'red' ? '0 4px 10px rgba(76,175,80,0.2)' : 'none', transition: 'all 0.3s' }}>
          <div style={{ fontSize: '0.85rem', color: theme.blackText, minHeight: '20px', marginBottom: '5px', fontWeight: 'bold' }}>
            {capturedPieces.black.map((p, i) => <span key={i} style={{ marginRight: '6px' }}>{p.isHidden ? '?' : p.name}</span>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: currentTurn === 'red' ? '#4CAF50' : '#888', border: `2px solid ${theme.lines}` }} />
              <span style={{ fontWeight: 'bold', color: theme.redText, fontSize: '1.05rem' }}>
                {myDisplayName}
                <span style={{ fontSize: '0.85rem', opacity: 0.7 }}> ({playerElo})</span>
              </span>
            </div>
            <div style={{ backgroundColor: timeLeft <= 10 && currentTurn === 'red' ? '#d32f2f' : theme.buttonBg, color: theme.buttonText, padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold', opacity: currentTurn === 'red' ? 1 : 0.5, transition: 'background-color 0.3s' }}>
              ⏱ {currentTurn === 'red' ? formatTime(timeLeft) : '01:00'}
            </div>
          </div>
        </div>
      </div>

      {/* Cột 2: Điều khiển + Biên bản */}
      <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setIsNightMode(!isNightMode)}
            style={{ flex: '0 0 46px', padding: '12px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.panelBg, color: theme.textColor, fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
          >
            {isNightMode ? '☀️' : '🌙'}
          </button>
          <button onClick={handleExitGame} style={{ flex: 1, padding: '12px 0', borderRadius: '6px', border: `1px solid ${theme.lines}`, backgroundColor: theme.panelBg, color: theme.textColor, fontWeight: 'bold', cursor: 'pointer' }}>
            ⬅ Thoát
          </button>
          {!isSpectator && (
            <>
              <button
                onClick={handleDraw}
                disabled={gameStatus !== 'playing'}
                style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: '6px', backgroundColor: gameStatus !== 'playing' ? '#aaa' : '#757575', color: '#fff', fontWeight: 'bold', cursor: gameStatus !== 'playing' ? 'not-allowed' : 'pointer' }}
              >
                🤝 Hòa
              </button>
              <button
                onClick={() => handleResign(currentTurn)}
                disabled={gameStatus !== 'playing'}
                style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: '6px', backgroundColor: gameStatus !== 'playing' ? '#aaa' : '#d32f2f', color: '#fff', fontWeight: 'bold', cursor: gameStatus !== 'playing' ? 'not-allowed' : 'pointer' }}
              >
                🏳️ Thua
              </button>
            </>
          )}
        </div>

        {/* Biên bản */}
        <div style={{ flex: 1, minHeight: '260px', maxHeight: '450px', backgroundColor: theme.panelBg, borderRadius: '8px', border: `1px solid ${theme.lines}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 15px', backgroundColor: isNightMode ? '#222' : '#f0f0f0', borderBottom: `1px solid ${theme.lines}`, fontWeight: 'bold', color: theme.textColor }}>
            📝 Biên bản trận đấu
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {historyLog.length === 0 ? (
              <div style={{ opacity: 0.5, fontStyle: 'italic', textAlign: 'center', marginTop: '20px', color: theme.textColor }}>
                Chờ nước đi khai cuộc...
              </div>
            ) : (
              historyLog.map((log, idx) => (
                <div key={idx} style={{ padding: '6px 10px', backgroundColor: idx === 0 ? (isNightMode ? '#333' : '#e3f2fd') : 'transparent', borderRadius: '4px', fontSize: '0.9rem', color: log.color, fontWeight: idx === 0 ? 'bold' : 'normal', borderLeft: idx === 0 ? `3px solid ${log.color}` : '3px solid transparent' }}>
                  <span style={{ opacity: 0.6, marginRight: '8px' }}>#{historyLog.length - idx}</span>
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