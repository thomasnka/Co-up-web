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
  const onOpponentJoinedRef = useRef(null);  // sound: play join khi đối thủ vào phòng
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

  // ── Color assignment — xqchess style ────────────────────────────────────────
  // xqchess: server assign color qua 'ready' event: colors = { username: colorInt }
  // Trong game của chúng ta: game-room.js assign random khi guest join,
  // trả về qua 'ready' WS message: { type: 'ready', colors: { hostId: 'red'|'black', guestId: 'red'|'black' } }
  // useMultiplayer nhận colors → update matchData.host_color
  // Không cần host tự assign nữa — tránh race condition 2 client cùng write
  //
  // Fallback: nếu WS chưa trả về (offline/slow) → giữ logic cũ assign từ host
  const assignedRef = useRef(false);
  useEffect(() => {
    if (!matchData) return;
    if (matchData.status !== 'playing') return;
    if (matchData.host_color) return;   // đã có color từ server
    if (matchData.host_id !== playerId) return;
    if (assignedRef.current) return;

    // Chờ 2s để WS 'ready' message có cơ hội đến trước
    const timeout = setTimeout(() => {
      if (assignedRef.current) return;
      // Fallback: assign local nếu vẫn chưa có color
      assignedRef.current = true;
      const randomColor = Math.random() < 0.5 ? 'red' : 'black';
      supabase.from('matches')
        .update({ host_color: randomColor })
        .eq('id', matchData.id)
        .then(({ error }) => {
          if (error) {
            console.error('[useMultiplayer] assignColor fallback error:', error.message);
          } else {
            setMatchData(prev => prev ? { ...prev, host_color: randomColor } : prev);
          }
        });
    }, 2000);

    return () => clearTimeout(timeout);
  }, [matchData?.status, matchData?.host_color, matchData?.host_id, playerId]);

  // ── WebSocket message handler ─────────────────────────────────────────────
  const handleWsMessage = useCallback((msg) => {
    switch (msg.type) {

      case 'room_state': {
        // Server xác nhận join — cập nhật matchData với thông tin players
        setMatchData(prev => {
          if (!prev) return prev;
          const updated = { ...prev };
          if (msg.status === 'playing' && prev.status === 'waiting') {
            updated.status = 'playing';
          }
          return updated;
        });
        // C4 + F1: nếu server trả về gameState khi spectator join hoặc reconnect
        if (msg.gameState) {
          onRemoteMoveRef.current?.(msg.gameState);
        }
        break;
      }

      case 'ready': {
        // xqchess: server assign colors khi game bắt đầu
        // msg.colors = { [hostId]: 'red'|'black', [guestId]: 'red'|'black' }
        if (msg.colors && playerId) {
          const myAssignedColor = msg.colors[playerId];
          if (myAssignedColor) {
            assignedRef.current = true; // ngăn fallback timeout chạy
            setMatchData(prev => {
              if (!prev) return prev;
              // host_color là màu của host — tính ngược nếu cần
              const hostColor = prev.host_id === playerId
                ? myAssignedColor
                : (myAssignedColor === 'red' ? 'black' : 'red');
              return { ...prev, host_color: hostColor, status: 'playing' };
            });
            // Persist lên Supabase
            if (matchId) {
              const hostColor = msg.colors[matchId] ?? myAssignedColor;
              supabase.from('matches')
                .update({ host_color: msg.colors[Object.keys(msg.colors)[0]] })
                .eq('id', matchId)
                .catch(() => {});
            }
          }
        }
        break;
      }

      case 'state_recovery': {
        // F1: server gửi state recovery sau reconnect request
        if (msg.gameState) {
          onRemoteMoveRef.current?.(msg.gameState);
        }
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
        // xqchess: play join sound khi đối thủ vào phòng
        onOpponentJoinedRef.current?.();
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

  // xqchess reconnect: resyncAfterReconnect gọi lại joinGame để get full state
  // Tương đương: gửi request_state_recovery → server trả gameState qua 'state_recovery'
  const prevWsStatus = useRef(wsStatus);
  useEffect(() => {
    if (prevWsStatus.current !== 'open' && wsStatus === 'open' && matchId) {
      wsSend({ type: 'request_state_recovery', matchId, playerId });
      setOpponentDisconnected(false);
      // Reset assignedRef để color có thể được reassign nếu cần
      // (xqchess: onReady reassigns colors sau reconnect)
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

  // C4: isSpectator — không phải host/guest, match đang playing
  const isSpectator = matchData !== null
    && myColor === null
    && matchData.status === 'playing'
    && matchData.host_id !== playerId
    && matchData.guest_id !== playerId;
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

  // ── REGISTER CALLBACKS ───────────────────────────────────────────────────
  const registerCallbacks = useCallback(({ onMoveRejected, onPieceRevealed, onOpponentJoined } = {}) => {
    if (onMoveRejected)   onMoveRejectedRef.current   = onMoveRejected;
    if (onPieceRevealed)  onPieceRevealedRef.current  = onPieceRevealed;
    if (onOpponentJoined) onOpponentJoinedRef.current = onOpponentJoined;
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