// =============================================================================
// FILE: src/hooks/useMultiplayer.js — v2 (WebSocket via Cloudflare DO)
//
// CHANGES từ v1:
//   - Supabase Realtime subscription → XÓA hoàn toàn
//   - useWebSocket hook xử lý real-time
//   - Supabase giữ: fetchMatch, syncResult (write kết thúc), assignColor
//   - Tất cả game moves đi qua WebSocket
//
// GIỮ NGUYÊN public API (GameBoard.jsx không cần thay đổi):
//   mp.matchData, mp.myColor, mp.isSpectator, mp.isWaiting
//   mp.isSyncing, mp.drawRequestFrom
//   mp.getIsMyTurn(currentTurn)
//   mp.syncMove(state)    → Promise<{ error }>
//   mp.syncResult(status) → Promise<{ error }>
//   mp.requestDraw()
//   mp.respondDraw(accept)
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase }       from '../core/supabaseClient';
import { useWebSocket }   from './useWebSocket';

export function useMultiplayer({
  matchId,
  playerId,
  playerName,
  playerElo,
  onRemoteMove,
  onMatchUpdate,
  onDrawRequest,
}) {

  const [matchData, setMatchData]               = useState(null);
  const [isSyncing, setIsSyncing]               = useState(false);
  const [drawRequestFrom, setDrawRequestFrom]   = useState(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false); // U1

  // ── Stable callback refs ──────────────────────────────────────────────────
  const onRemoteMoveRef    = useRef(onRemoteMove);
  const onMatchUpdateRef   = useRef(onMatchUpdate);
  const onDrawRequestRef   = useRef(onDrawRequest);
  const onMoveRejectedRef  = useRef(null);   // B2: rollback callback
  const onPieceRevealedRef = useRef(null);   // S1: piece reveal callback
  useEffect(() => { onRemoteMoveRef.current  = onRemoteMove; },  [onRemoteMove]);
  useEffect(() => { onMatchUpdateRef.current = onMatchUpdate; }, [onMatchUpdate]);
  useEffect(() => { onDrawRequestRef.current = onDrawRequest; }, [onDrawRequest]);

  // ── Fetch match từ Supabase (1 lần lúc mount) ─────────────────────────────
  useEffect(() => {
    if (!matchId) return;

    const fetchMatch = async () => {
      const { data, error } = await supabase
        .from('matches').select('*').eq('id', matchId).single();
      if (data) {
        setMatchData(data);
        onMatchUpdateRef.current?.(data);
        if (data.draw_request && data.draw_request !== 'accepted') {
          setDrawRequestFrom(data.draw_request);
        }
      }
      if (error) console.error('[useMultiplayer] fetch error:', error.message);
    };

    fetchMatch();
  }, [matchId]);

  // ── Assign host color khi guest vừa join ──────────────────────────────────
  // Chạy sau khi matchData load và status mới chuyển sang 'playing'
  const assignedRef = useRef(false);
  useEffect(() => {
    if (!matchData) return;
    if (matchData.status !== 'playing') return;
    if (matchData.host_color) return;
    if (matchData.host_id !== playerId) return;
    if (assignedRef.current) return;

    assignedRef.current = true;
    const randomColor = Math.random() < 0.5 ? 'red' : 'black';

    supabase.from('matches')
      .update({ host_color: randomColor })
      .eq('id', matchData.id)
      .then(({ data, error }) => {
        if (error) {
          console.error('[useMultiplayer] assignColor error:', error.message);
        } else {
          // Cập nhật local matchData ngay
          setMatchData(prev => prev ? { ...prev, host_color: randomColor } : prev);
        }
      });
  }, [matchData?.status, matchData?.host_color, matchData?.host_id, playerId]);

  // ── WebSocket message handler ─────────────────────────────────────────────
  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {

      case 'room_state': {
        // Server xác nhận join — cập nhật matchData với thông tin players
        setMatchData(prev => {
          if (!prev) return prev;
          const updated = { ...prev };
          // Nếu status chuyển sang playing → update local
          if (msg.status === 'playing' && prev.status === 'waiting') {
            updated.status = 'playing';
          }
          return updated;
        });
        break;
      }



      case 'move': {
        // Nước đi từ đối thủ
        if (msg.from !== playerId) {
          onRemoteMoveRef.current?.({
            pieces:         msg.state.pieces,
            currentTurn:    msg.state.currentTurn,
            historyLog:     msg.state.historyLog     ?? [],
            lastMove:       msg.state.lastMove       ?? null,
            capturedPieces: msg.state.capturedPieces ?? { red: [], black: [] },
            historyStates:  msg.state.historyStates  ?? [],
          });
        }
        break;
      }

      case 'draw_request': {
        if (msg.from !== playerId) {
          setDrawRequestFrom(msg.from);
          onDrawRequestRef.current?.();
        }
        break;
      }

      case 'draw_respond': {
        if (msg.from !== playerId) {
          if (msg.accept) {
            setDrawRequestFrom(null);
            // GameBoard sẽ detect qua onDrawRequest flow — không cần thêm callback
          } else {
            setDrawRequestFrom(null);
          }
        }
        break;
      }

      case 'game_end': {
        break;
      }

      case 'opponent_disconnected': {
        // U1 FIX: set flag riêng thay vì nhét vào matchData
        setOpponentDisconnected(true);
        break;
      }

      case 'opponent_connected': {
        // Đối thủ reconnect — clear disconnect flag
        setOpponentDisconnected(false);
        setMatchData(prev => {
          if (!prev) return prev;
          const isHost = prev.host_id === playerId;
          const patch = isHost
            ? { guest_id: msg.player.id, guest_name: msg.player.name, guest_elo: msg.player.elo, status: 'playing' }
            : { host_name: msg.player.name, host_elo: msg.player.elo };
          const updated = { ...prev, ...patch };
          onMatchUpdateRef.current?.(updated);
          return updated;
        });
        break;
      }

      case 'move_rejected': {
        // B2 FIX: server reject move do stale sequence
        // Trigger applyRemoteState callback để rollback
        console.warn('[useMultiplayer] Move rejected by server:', msg.reason, 'seq:', msg.seq);
        onMoveRejectedRef.current?.(msg);
        break;
      }

      case 'piece_revealed': {
        // S1 FIX: server xác nhận identity quân vừa lật
        onPieceRevealedRef.current?.(msg);
        break;
      }

      case 'error': {
        console.error('[useMultiplayer] WS server error:', msg.message);
        break;
      }
    }
  }, [playerId, matchData]);

  // ── WebSocket connection ──────────────────────────────────────────────────
  const { send: wsSend, status: wsStatus, reconnectCount } = useWebSocket({
    matchId,
    playerId,
    playerName,
    playerElo,
    onMessage: handleWsMessage,
    enabled:   !!matchId,
  });

  // Expose wsStatus → isSyncing khi reconnecting
  useEffect(() => {
    setIsSyncing(wsStatus === 'connecting' || wsStatus === 'reconnecting');
  }, [wsStatus]);

  // F1 FIX: khi WS reconnect thành công → request state recovery từ DO
  const prevWsStatus = useRef(wsStatus);
  useEffect(() => {
    if (prevWsStatus.current !== 'open' && wsStatus === 'open' && matchId) {
      // Reconnect sau khi mất kết nối → yêu cầu server gửi lại state hiện tại
      wsSend({ type: 'request_state_recovery', matchId, playerId });
      setOpponentDisconnected(false);
    }
    prevWsStatus.current = wsStatus;
  }, [wsStatus, matchId, playerId, wsSend]);

  // ── COMPUTED ──────────────────────────────────────────────────────────────
  const myColor = (() => {
    if (!matchData || !playerId) return null;
    if (matchData.host_id  === playerId) return matchData.host_color || 'red';
    if (matchData.guest_id === playerId) return matchData.host_color === 'red' ? 'black' : 'red';
    return null;
  })();

  const isSpectator = matchData !== null && myColor === null && !!matchData.guest_id;
  const isWaiting   = !!(matchId && matchData?.status === 'waiting');

  const getIsMyTurn = useCallback((currentTurn) => {
    if (isSpectator) return false;
    if (!matchId)    return true;
    return currentTurn === myColor;
  }, [isSpectator, matchId, myColor]);

  // ── SYNC MOVE (WebSocket) ─────────────────────────────────────────────────
  // v2: gửi qua WebSocket thay vì Supabase PATCH
  const syncMove = useCallback(async (state) => {
    if (!matchId || isSpectator) return { error: null };
    try {
      wsSend({ type: 'move', state });
      return { error: null };
    } catch (e) {
      console.error('[useMultiplayer] syncMove error:', e.message);
      return { error: e };
    }
  }, [matchId, isSpectator, wsSend]);

  // ── SYNC RESULT (Supabase HTTP — game end) ────────────────────────────────
  // Supabase trigger sẽ tự tính ELO sau khi status = 'finished'
  // Cả 2 client đều gọi — idempotent do PATCH chỉ update 1 row
  const syncResult = useCallback(async (gameStatus) => {
    if (!matchId || isSpectator) return { error: null };

    const winnerMap = {
      checkmate_red:   'black', checkmate_black: 'red',
      timeout_red:     'black', timeout_black:   'red',
      resign_red:      'black', resign_black:    'red',
      stalemate_red:   'draw',  stalemate_black: 'draw',
      draw_agreed:     'draw',  draw_50:         'draw',
      draw_material:   'draw',
    };
    const winner = winnerMap[gameStatus] ?? 'unknown';

    // Gửi qua WS để Cloudflare DO write về Supabase
    wsSend({ type: 'game_end', gameStatus, winner });

    // Đồng thời write trực tiếp từ client (fallback — idempotent)
    try {
      const { error } = await supabase
        .from('matches')
        .update({ status: 'finished', winner, game_status: gameStatus })
        .eq('id', matchId);
      if (error) console.error('[useMultiplayer] syncResult Supabase error:', error.message);
      return { error };
    } catch (e) {
      console.error('[useMultiplayer] syncResult exception:', e.message);
      return { error: e };
    }
  }, [matchId, isSpectator, wsSend]);

  // ── DRAW REQUEST (WebSocket) ──────────────────────────────────────────────
  const requestDraw = useCallback(() => {
    if (!matchId || isSpectator) return;
    wsSend({ type: 'draw_request', from: playerId });
  }, [matchId, isSpectator, wsSend, playerId]);

  const respondDraw = useCallback(async (accept) => {
    wsSend({ type: 'draw_respond', accept, from: playerId });
    setDrawRequestFrom(null);

    // Sync về Supabase để persist (cũ: draw_request field)
    if (matchId) {
      await supabase.from('matches')
        .update({ draw_request: accept ? 'accepted' : null })
        .eq('id', matchId);
    }

    return { error: null };
  }, [wsSend, playerId, matchId]);

  // ── REGISTER CALLBACKS (B2, S1) ──────────────────────────────────────────
  const registerCallbacks = useCallback(({ onMoveRejected, onPieceRevealed } = {}) => {
    if (onMoveRejected)  onMoveRejectedRef.current  = onMoveRejected;
    if (onPieceRevealed) onPieceRevealedRef.current = onPieceRevealed;
  }, []);

  // ── RETURN ─────────────────────────────────────────────────────────────────
  return {
    matchData,
    myColor,
    isSpectator,
    isWaiting,
    isSyncing,
    wsStatus,
    reconnectCount,
    drawRequestFrom,
    opponentDisconnected,  // U1: flag rõ ràng cho GameBoard
    getIsMyTurn,
    syncMove,
    syncResult,
    requestDraw,
    respondDraw,
    registerCallbacks,     // B2+S1: đăng ký callbacks
  };
}