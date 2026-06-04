// =============================================================================
// FILE: src/hooks/useGameState.js
// FIXES: B4, U2, L2-5
// + giữ nguyên tất cả fix cũ: F1, F2, F4, F5, F6, L2-1, L2-2, L2-4
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  generatePieces,
  isValidMove,
  getEffectiveColor,
  isKingInCheck,
  getNotation,
  getBoardHash,
  checkGameStatus,
} from '../core/chessLogic';

// P1: tính valid moves cho 1 quân — dùng ngoài render cycle
const computeValidMoves = (piece, pieces, historyStates) => {
  if (!piece) return [];
  const moves = [];
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      if (isValidMove(piece, r, c, pieces, historyStates)) {
        moves.push({ row: r, col: c });
      }
    }
  }
  return moves;
};

// -----------------------------------------------------------------------------
// HƯỚNG DẪN SỬ DỤNG:
//
//   const game = useGameState({
//     gameMode,
//     theme,
//     isWaitingForOpponent,   // boolean từ useMultiplayer
//     canInteract,            // (currentTurn) => boolean — turn enforcement
//     onMoveMade,             // (nextState) => void — sync Supabase
//     onGameEnd,              // (status) => void — sync result
//     onDrawRequest,          // () => void — U2: host gửi request hòa lên Supabase
//   });
// -----------------------------------------------------------------------------

export function useGameState({
  gameMode,
  theme,
  isWaitingForOpponent = false,
  canInteract          = null,
  onMoveMade           = null,
  onGameEnd            = null,
  onDrawRequest        = null,   // U2: callback mới
}) {

  // ── STATE ──────────────────────────────────────────────────────────────────
  const [pieces, setPieces]                 = useState([]);
  const [currentTurn, setCurrentTurn]       = useState('red');
  const [historyLog, setHistoryLog]         = useState([]);
  const [capturedPieces, setCapturedPieces] = useState({ red: [], black: [] });
  const [lastMove, setLastMove]             = useState(null);
  const [shakingPieceId, setShakingPieceId] = useState(null);
  const [selectedPiece, setSelectedPiece]   = useState(null);
  const [kingInCheckId, setKingInCheckId]   = useState(null);
  const [gameStatus, setGameStatus]         = useState('playing');
  const [timeLeft, setTimeLeft]             = useState(60);
  const [isDemoMode, setIsDemoMode]         = useState(false);
  const [historyStates, setHistoryStates]   = useState([]);
  const [halfMoveClock, setHalfMoveClock]   = useState(0);
  const [validMoves, setValidMoves]         = useState([]);   // F3: ô hợp lệ khi chọn quân
  const [movedPieceId, setMovedPieceId]     = useState(null); // F4/F5: animation
  // xqchess: roomState lifecycle — New(0) → Ready(1 nước) → Running(2+ nước) → Ended
  // Dùng để quyết định có confirm khi quit/resign/draw không
  const [turnCount, setTurnCount]           = useState(0);
  // lastMoveSound: 'move' | 'eat' | 'check' — để GameBoard play sound đúng
  const [lastMoveSound, setLastMoveSound]   = useState(null);

  const timerRef = useRef(null);
  // P1: ref cho DOM timer display — update trực tiếp, không trigger re-render
  const timerDisplayRefsRef = useRef(new Map()); // color → DOM element ref

  // ── INIT ───────────────────────────────────────────────────────────────────
  const initGame = useCallback(() => {
    setPieces(generatePieces(gameMode));
    setCurrentTurn('red');
    setHistoryLog([]);
    setCapturedPieces({ red: [], black: [] });
    setLastMove(null);
    setSelectedPiece(null);
    setKingInCheckId(null);
    setTimeLeft(60);
    setGameStatus('playing');
    setIsDemoMode(false);
    setHistoryStates([]);
    setHalfMoveClock(0);
    setValidMoves([]);
    setMovedPieceId(null);
    setTurnCount(0);
    setLastMoveSound(null);
  }, [gameMode]);

  useEffect(() => { initGame(); }, [initGame]);

  // L2-5: reset historyStates khi gameMode thay đổi mid-session
  // (initGame đã reset, nhưng nếu GameBoard không unmount thì effect này đảm bảo)
  const prevGameModeRef = useRef(gameMode);
  useEffect(() => {
    if (prevGameModeRef.current !== gameMode) {
      prevGameModeRef.current = gameMode;
      setHistoryStates([]);
      setHalfMoveClock(0);
      setTurnCount(0);
    }
  }, [gameMode]);

  // ── TIMER — xqchess style: absolute endAt + 250ms tick ──────────────────
  // Lý do: drift-safe dưới setInterval jitter và tab throttling
  // 250ms tick: smoother display (xqchess dùng 250ms)
  // Alert strict < 10s (không phải <=, giữ đúng boundary xqchess)
  const timeLeftRef = useRef(60);
  const timerEndAtRef = useRef(null); // absolute timestamp khi hết giờ

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (gameStatus !== 'playing' || (isWaitingForOpponent && !isDemoMode)) return;

    // Set absolute end timestamp
    timerEndAtRef.current = Date.now() + timeLeftRef.current * 1000;

    const render = () => {
      const remainMs = timerEndAtRef.current - Date.now();
      if (remainMs <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        // Update DOM
        const displayEl = timerDisplayRefsRef.current.get(currentTurn);
        if (displayEl) {
          displayEl.textContent = '00:00';
          displayEl.style.backgroundColor = '#d32f2f';
        }
        setTimeLeft(0);
        return;
      }

      const totalSec = Math.ceil(remainMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      const pad = (n) => (n < 10 ? '0' + n : '' + n);

      // P1: update DOM trực tiếp — không setState
      const displayEl = timerDisplayRefsRef.current.get(currentTurn);
      if (displayEl) {
        displayEl.textContent = pad(m) + ':' + pad(s);
        // Alert strict < 10s (xqchess: remainMs < alertFromMs, không phải <=)
        if (remainMs < 10_000) {
          displayEl.style.backgroundColor = '#d32f2f';
          displayEl.style.color = '#fff';
        } else {
          displayEl.style.backgroundColor = '';
          displayEl.style.color = '';
        }
      }

      // Sync timeLeftRef cho reset
      timeLeftRef.current = Math.ceil(remainMs / 1000);
    };

    render(); // render ngay lập tức
    timerRef.current = setInterval(render, 250); // 250ms tick

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentTurn, gameStatus, isDemoMode, isWaitingForOpponent]);

  useEffect(() => {
    if (timeLeft <= 0 && gameStatus === 'playing') {
      setGameStatus(`timeout_${currentTurn}`);
    }
  }, [timeLeft, gameStatus, currentTurn]);

  // ── INTERACTION ────────────────────────────────────────────────────────────
  // B4 FIX: xóa tham số isWaitingForOpponent khỏi signature
  // Hook đã có isWaitingForOpponent từ prop closure — nhất quán, không leak param
  const handleInteraction = useCallback((targetRow, targetCol, clickedPiece) => {

    if (gameStatus !== 'playing') return;
    if (isWaitingForOpponent && !isDemoMode) return;

    // Turn enforcement — inject từ GameBoard qua mp.getIsMyTurn
    if (canInteract && !canInteract(currentTurn)) return;

    // Bước 1: chưa chọn quân
    if (!selectedPiece) {
      if (clickedPiece && getEffectiveColor(clickedPiece) === currentTurn) {
        setSelectedPiece(clickedPiece);
        // F3: tính valid moves ngay khi chọn quân
        setValidMoves(computeValidMoves(clickedPiece, pieces, historyStates));
      } else if (clickedPiece) {
        triggerErrorShake(clickedPiece.id);
      }
      return;
    }

    // Bước 2: click quân cùng phe → đổi lựa chọn
    if (clickedPiece && getEffectiveColor(clickedPiece) === currentTurn) {
      setSelectedPiece(clickedPiece);
      // F3: recalculate valid moves cho quân mới được chọn
      setValidMoves(computeValidMoves(clickedPiece, pieces, historyStates));
      return;
    }

    // Bước 3: kiểm tra nước đi
    if (isValidMove(selectedPiece, targetRow, targetCol, pieces, historyStates)) {

      const isReveal  = selectedPiece.isHidden;
      const isCapture = clickedPiece != null;

      if (isCapture) {
        setCapturedPieces(prev => ({
          ...prev,
          // Bug3 fix: giữ nguyên isHidden của quân bị ăn — không force reveal
          [clickedPiece.color]: [...prev[clickedPiece.color], clickedPiece],
        }));
      }

      let nextPieces = pieces.filter(p => !(isCapture && p.id === clickedPiece.id));
      nextPieces = nextPieces.map(p =>
        p.id === selectedPiece.id
          // C2: set opened=true sau mỗi lần di chuyển → advisor/elephant thoát ràng buộc palace/river
          ? { ...p, row: targetRow, col: targetCol, isHidden: false, opened: true }
          : p
      );

      const nextTurnColor     = currentTurn === 'red' ? 'black' : 'red';
      const newHash           = getBoardHash(nextPieces, nextTurnColor);
      const nextHistoryStates = [...historyStates, newHash];
      setHistoryStates(nextHistoryStates);

      // Notation
      let notationData = { move: '?' };
      try { notationData = getNotation(selectedPiece, targetRow, targetCol, pieces); }
      catch (e) { console.warn('[useGameState] getNotation error:', e.message); }

      const actualPieceName = nextPieces.find(p => p.id === selectedPiece.id)?.name || '?';
      const moveColor       = currentTurn === 'red' ? 'Đỏ' : 'Đen';

      let logEntry = isReveal
        ? `${moveColor} lật ${actualPieceName} (${notationData.move})`
        : `${moveColor} ${notationData.move}`;
      if (isCapture) logEntry += ` ăn ${clickedPiece.isHidden ? 'Úp' : clickedPiece.name}`;

      // Check detection
      let checkStatus = false;
      try { checkStatus = isKingInCheck(nextPieces, nextTurnColor); }
      catch (e) { console.warn('[useGameState] isKingInCheck error:', e.message); }

      if (checkStatus) {
        logEntry += ' 🔴 (CHIẾU TƯỚNG)';
        const enemyKing = nextPieces.find(p => p.type === 'general' && p.color === nextTurnColor && !p.isHidden);
        if (enemyKing) setKingInCheckId(enemyKing.id);
      } else {
        setKingInCheckId(null);
      }

      // halfMoveClock: reset khi ăn quân hoặc lật quân
      const nextHalfMoveClock = (isCapture || isReveal) ? 0 : halfMoveClock + 1;
      setHalfMoveClock(nextHalfMoveClock);

      // Commit state
      const newLog = [{ entry: logEntry, color: currentTurn === 'red' ? theme.redText : theme.blackText }, ...historyLog];
      const newLastMove = { from: { row: selectedPiece.row, col: selectedPiece.col }, to: { row: targetRow, col: targetCol } };
      const newCaptured = isCapture
        // Bug3 fix: giữ nguyên isHidden
        ? { ...capturedPieces, [clickedPiece.color]: [...capturedPieces[clickedPiece.color], clickedPiece] }
        : capturedPieces;

      setPieces(nextPieces);
      setHistoryLog(newLog);
      setLastMove(newLastMove);
      setSelectedPiece(null);
      setValidMoves([]);        // F3: clear valid moves sau khi đi
      setMovedPieceId(selectedPiece.id); // F4/F5: trigger animation
      setCurrentTurn(nextTurnColor);
      // xqchess: track turnCount để quyết định roomState (Running khi >= 2 nước)
      setTurnCount(prev => prev + 1);
      // xqchess sound priority: check > eat > move
      const soundName = checkStatus ? 'check' : isCapture ? 'eat' : 'move';
      setLastMoveSound(soundName);
      // P1: reset timer — absolute endAt style
      timeLeftRef.current = 60;
      timerEndAtRef.current = Date.now() + 60_000;
      setTimeLeft(60);

      // Game end check
      const status = checkGameStatus(nextPieces, nextTurnColor, nextHalfMoveClock, nextHistoryStates);
      if (status !== 'playing') {
        setGameStatus(status);
        onGameEnd?.(status);
      }

      // Sync lên Supabase
      onMoveMade?.({
        pieces:         nextPieces,
        currentTurn:    nextTurnColor,
        historyLog:     newLog,
        lastMove:       newLastMove,
        capturedPieces: newCaptured,
        historyStates:  nextHistoryStates,
        lastMoveSound:  soundName, // xqchess: sync sound cho remote player
      });

    } else {
      triggerErrorShake(selectedPiece.id);
    }

  }, [
    gameStatus, isDemoMode, isWaitingForOpponent, canInteract,
    selectedPiece, currentTurn, pieces, historyStates,
    halfMoveClock, capturedPieces, historyLog, theme,
    onMoveMade, onGameEnd, turnCount,
  ]);

  // ── APPLY REMOTE STATE (từ đối thủ qua Supabase) ──────────────────────────
  const applyRemoteState = useCallback((remoteState) => {
    if (remoteState.pieces)                    setPieces(remoteState.pieces);
    if (remoteState.currentTurn)               setCurrentTurn(remoteState.currentTurn);
    if (remoteState.historyLog)                setHistoryLog(remoteState.historyLog);
    if (remoteState.lastMove !== undefined)    setLastMove(remoteState.lastMove);
    if (remoteState.capturedPieces)            setCapturedPieces(remoteState.capturedPieces);
    if (remoteState.historyStates)             setHistoryStates(remoteState.historyStates);
    setSelectedPiece(null);
    setValidMoves([]);
    setMovedPieceId(null);
    setKingInCheckId(null);
    timeLeftRef.current = 60;
    timerEndAtRef.current = Date.now() + 60_000;
    setTimeLeft(60);
    // Sound cho remote move
    if (remoteState.lastMoveSound) setLastMoveSound(remoteState.lastMoveSound);
  }, []);

  // ── HANDLERS ───────────────────────────────────────────────────────────────
  const triggerErrorShake = (id) => {
    setShakingPieceId(id);
    setTimeout(() => setShakingPieceId(null), 300);
  };

  // P1: đăng ký DOM element để timer update trực tiếp
  const registerTimerDisplay = useCallback((color, el) => {
    if (el) timerDisplayRefsRef.current.set(color, el);
    else timerDisplayRefsRef.current.delete(color);
  }, []);

  const formatTime = (seconds) => {
    const s = Math.max(0, seconds || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `0${m}:${r < 10 ? '0' : ''}${r}`;
  };

  const activateDemo = useCallback(() => { setIsDemoMode(true); }, []);

  // xqchess: chỉ confirm resign khi game đang Running (>= 2 nước đi)
  const handleResign = useCallback((turnColor) => {
    if (turnCount < 2) {
      // New/Ready: thoát thẳng không confirm
      setGameStatus(`resign_${turnColor}`);
      return;
    }
    if (window.confirm('Bạn xác nhận muốn nhận thua ván đấu này?')) {
      setGameStatus(`resign_${turnColor}`);
    }
  }, [turnCount]);

  // xqchess: draw chỉ có nghĩa khi game đang Running (>= 2 nước)
  // New/Ready: bấm hòa = thoát thẳng
  const handleDraw = useCallback(() => {
    if (turnCount < 2) {
      setGameStatus('draw_agreed');
      return;
    }
    const isOnline = !isDemoMode && onDrawRequest !== null;
    if (isOnline) {
      onDrawRequest?.();
    } else {
      if (window.confirm('Xác nhận cầu hòa?')) {
        setGameStatus('draw_agreed');
      }
    }
  }, [isDemoMode, onDrawRequest, turnCount]);

  // U2: accept draw khi đối thủ xin hòa và mình đồng ý (gọi từ GameBoard banner)
  const acceptDraw = useCallback(() => {
    setGameStatus('draw_agreed');
    onGameEnd?.('draw_agreed');
  }, [onGameEnd]);

  // ── RESULT MESSAGE ─────────────────────────────────────────────────────────
  const getResultMessage = useCallback(() => {
    if (!gameStatus || gameStatus === 'playing') return null;
    const map = {
      checkmate_red:   { title: 'CHIẾU BÍ',  sub: 'Đen thắng! Đỏ bị chiếu bí.',        winner: 'black' },
      checkmate_black: { title: 'CHIẾU BÍ',  sub: 'Đỏ thắng! Đen bị chiếu bí.',         winner: 'red'   },
      stalemate_red:   { title: 'BÍ NƯỚC',   sub: 'Hòa! Đỏ không có nước đi hợp lệ.',   winner: null    },
      stalemate_black: { title: 'BÍ NƯỚC',   sub: 'Hòa! Đen không có nước đi hợp lệ.',  winner: null    },
      timeout_red:     { title: 'HẾT GIỜ',   sub: 'Đỏ hết thời gian. Đen thắng!',        winner: 'black' },
      timeout_black:   { title: 'HẾT GIỜ',   sub: 'Đen hết thời gian. Đỏ thắng!',        winner: 'red'   },
      resign_red:      { title: 'ĐẦU HÀNG',  sub: 'Đỏ đầu hàng. Đen thắng!',             winner: 'black' },
      resign_black:    { title: 'ĐẦU HÀNG',  sub: 'Đen đầu hàng. Đỏ thắng!',             winner: 'red'   },
      draw_agreed:     { title: 'HÒA',        sub: 'Hai bên đồng ý hòa.',                 winner: null    },
      draw_50:         { title: 'HÒA',        sub: 'Hòa do 50 nước không ăn quân/lật.',   winner: null    },
      draw_material:   { title: 'HÒA',        sub: 'Hòa do không đủ quân tấn công.',      winner: null    },
    };
    return map[gameStatus] || { title: 'KẾT THÚC', sub: gameStatus, winner: null };
  }, [gameStatus]);

  // ── RETURN ─────────────────────────────────────────────────────────────────
  return {
    // State
    pieces, currentTurn, historyLog, capturedPieces, lastMove,
    shakingPieceId, selectedPiece, kingInCheckId, gameStatus, timeLeft, isDemoMode,
    validMoves, movedPieceId, turnCount, lastMoveSound,

    // Actions
    initGame,
    handleInteraction,  // B4: 3 params (targetRow, targetCol, clickedPiece)
    handleResign,
    handleDraw,         // U2: online → callback, offline → confirm
    acceptDraw,         // U2: gọi khi mình đồng ý hòa
    activateDemo,
    applyRemoteState,

    // Utilities
    formatTime,
    getResultMessage,
    registerTimerDisplay, // P1: đăng ký DOM ref cho timer
  };
}