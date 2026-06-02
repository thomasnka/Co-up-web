// =============================================================================
// FILE: src/hooks/useMultiplayer.js
// FIXES: U2 (draw request 2-chiều), L4-5 (Presence room cleanup),
//        B5 (stale closure callbacks), L3-5 (syncMove/syncResult trả error)
// + giữ nguyên: L4-1, L4-2, L4-3, L4-4
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../core/supabaseClient';

// -----------------------------------------------------------------------------
// HƯỚNG DẪN SỬ DỤNG:
//
//   const mp = useMultiplayer({
//     matchId, playerId,
//     onRemoteMove,    // (remoteState) => void
//     onMatchUpdate,   // (matchData) => void
//     onDrawRequest,   // () => void — đối thủ xin hòa
//   });
//
//   mp.matchData, mp.myColor, mp.isSpectator, mp.isWaiting
//   mp.isSyncing, mp.drawRequestFrom  ← U2: id của người xin hòa
//   mp.getIsMyTurn(currentTurn)
//   mp.syncMove(state)    → Promise<{ error }>  ← L3-5
//   mp.syncResult(status) → Promise<{ error }>  ← L3-5
//   mp.requestDraw()      ← U2
//   mp.respondDraw(true/false) ← U2
// -----------------------------------------------------------------------------

export function useMultiplayer({ matchId, playerId, onRemoteMove, onMatchUpdate, onDrawRequest }) {

  const [matchData, setMatchData]         = useState(null);
  const [isSyncing, setIsSyncing]         = useState(false);
  const [drawRequestFrom, setDrawRequestFrom] = useState(null); // U2

  const lastSyncedTurn = useRef(null);

  // B5 FIX: wrap callbacks trong ref để tránh stale closure trong subscription
  // Subscription chỉ tạo 1 lần theo [matchId], nhưng callback có thể thay đổi
  const onRemoteMoveRef   = useRef(onRemoteMove);
  const onMatchUpdateRef  = useRef(onMatchUpdate);
  const onDrawRequestRef  = useRef(onDrawRequest);
  useEffect(() => { onRemoteMoveRef.current  = onRemoteMove; },  [onRemoteMove]);
  useEffect(() => { onMatchUpdateRef.current = onMatchUpdate; }, [onMatchUpdate]);
  useEffect(() => { onDrawRequestRef.current = onDrawRequest; }, [onDrawRequest]);

  // ── FETCH & SUBSCRIBE ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!matchId) return;

    const fetchMatch = async () => {
      const { data, error } = await supabase
        .from('matches').select('*').eq('id', matchId).single();
      if (data) {
        setMatchData(data);
        onMatchUpdateRef.current?.(data);
        // Restore draw request state nếu reconnect giữa chừng
        if (data.draw_request && data.draw_request !== 'accepted') {
          setDrawRequestFrom(data.draw_request);
        }
      }
      if (error) console.error('[useMultiplayer] fetch error:', error.message);
    };

    fetchMatch();

    const sub = supabase
      .channel(`match_meta_${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        (payload) => {
          const updated = payload.new;
          setMatchData(updated);
          onMatchUpdateRef.current?.(updated);

          // L4-1: nhận nước đi từ đối thủ
          if (updated.game_state && updated.current_turn !== lastSyncedTurn.current) {
            onRemoteMoveRef.current?.({
              pieces:         updated.game_state.pieces,
              currentTurn:    updated.current_turn,
              historyLog:     updated.game_state.historyLog     ?? [],
              lastMove:       updated.game_state.lastMove       ?? null,
              capturedPieces: updated.game_state.capturedPieces ?? { red: [], black: [] },
              historyStates:  updated.game_state.historyStates  ?? [],
            });
          }

          // U2: nhận draw request từ đối thủ
          if (updated.draw_request && updated.draw_request !== 'accepted' && updated.draw_request !== playerId) {
            setDrawRequestFrom(updated.draw_request);
            onDrawRequestRef.current?.();
          }
          // U2: draw accepted — cả 2 phía đều nhận được
          if (updated.draw_request === 'accepted') {
            setDrawRequestFrom(null);
          }
          // U2: draw declined — reset
          if (!updated.draw_request) {
            setDrawRequestFrom(null);
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(sub);
  }, [matchId, playerId]);

  // ── L4-5: PRESENCE — room cleanup khi host disconnect ─────────────────────
  useEffect(() => {
    if (!matchId || !playerId) return;
    // Chỉ host mới cần track — guest join là match đã 'playing', không cần cleanup
    // Xác định host sau khi matchData load
    if (!matchData || matchData.host_id !== playerId) return;
    if (matchData.status !== 'waiting') return;

    const presenceChannel = supabase.channel(`presence_${matchId}`, {
      config: { presence: { key: playerId } },
    });

    presenceChannel
      .on('presence', { event: 'leave' }, async ({ leftPresences }) => {
        // Nếu host rời → cancel phòng
        const hostLeft = leftPresences.some(p => p.key === playerId || p.user_id === playerId);
        if (hostLeft) {
          await supabase
            .from('matches')
            .update({ status: 'cancelled' })
            .eq('id', matchId)
            .eq('status', 'waiting'); // chỉ cancel nếu vẫn waiting
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ user_id: playerId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      presenceChannel.untrack().then(() => supabase.removeChannel(presenceChannel));
    };
  }, [matchId, playerId, matchData?.host_id, matchData?.status]);

  // ── COMPUTED ───────────────────────────────────────────────────────────────
  const myColor = (() => {
    if (!matchData || !playerId) return null;
    if (matchData.host_id  === playerId) return matchData.host_color || 'red';
    if (matchData.guest_id === playerId) return matchData.host_color === 'red' ? 'black' : 'red';
    return null; // spectator
  })();

  const isSpectator = matchData !== null && myColor === null;
  const isWaiting   = !!(matchId && matchData?.status === 'waiting');

  // L4-2: turn enforcement
  const getIsMyTurn = useCallback((currentTurn) => {
    if (isSpectator) return false;
    if (!matchId)    return true;  // offline — luôn cho phép
    return currentTurn === myColor;
  }, [isSpectator, matchId, myColor]);

  // ── SYNC MOVE — L3-5: trả về { error } để caller xử lý trước setScreen ───
  const syncMove = useCallback(async (state) => {
    if (!matchId || isSpectator) return { error: null };
    setIsSyncing(true);
    lastSyncedTurn.current = state.currentTurn;
    try {
      const { error } = await supabase
        .from('matches')
        .update({
          current_turn: state.currentTurn,
          game_state: {
            pieces:         state.pieces,
            historyLog:     state.historyLog,
            lastMove:       state.lastMove,
            capturedPieces: state.capturedPieces,
            historyStates:  state.historyStates,
          },
        })
        .eq('id', matchId);
      if (error) console.error('[useMultiplayer] syncMove error:', error.message);
      return { error };
    } catch (e) {
      console.error('[useMultiplayer] syncMove exception:', e.message);
      return { error: e };
    } finally {
      setIsSyncing(false);
    }
  }, [matchId, isSpectator]);

  // ── SYNC RESULT — L3-5: trả về { error } ──────────────────────────────────
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

    try {
      const { error } = await supabase
        .from('matches')
        .update({ status: 'finished', winner, game_status: gameStatus })
        .eq('id', matchId);
      if (error) console.error('[useMultiplayer] syncResult error:', error.message);
      return { error };
    } catch (e) {
      console.error('[useMultiplayer] syncResult exception:', e.message);
      return { error: e };
    }
  }, [matchId, isSpectator]);

  // ── ASSIGN HOST COLOR (L4-3) ───────────────────────────────────────────────
  useEffect(() => {
    if (!matchData) return;
    if (matchData.status !== 'playing') return;
    if (matchData.host_color) return;
    if (matchData.host_id !== playerId) return;

    const randomColor = Math.random() < 0.5 ? 'red' : 'black';
    supabase.from('matches')
      .update({ host_color: randomColor })
      .eq('id', matchData.id)
      .then(({ error }) => {
        if (error) console.error('[useMultiplayer] assignColor error:', error.message);
      });
  }, [matchData?.status, matchData?.host_color, playerId]);

  // ── U2: DRAW REQUEST ───────────────────────────────────────────────────────
  const requestDraw = useCallback(async () => {
    if (!matchId || isSpectator) return;
    await supabase.from('matches')
      .update({ draw_request: playerId })
      .eq('id', matchId);
  }, [matchId, isSpectator, playerId]);

  const respondDraw = useCallback(async (accept) => {
    if (!matchId) return;
    await supabase.from('matches')
      .update({ draw_request: accept ? 'accepted' : null })
      .eq('id', matchId);
    setDrawRequestFrom(null);
  }, [matchId]);

  // ── RETURN ─────────────────────────────────────────────────────────────────
  return {
    matchData,
    myColor,
    isSpectator,
    isWaiting,
    isSyncing,
    drawRequestFrom,    // U2: id của người đang xin hòa (null nếu không có)
    getIsMyTurn,
    syncMove,
    syncResult,
    requestDraw,        // U2
    respondDraw,        // U2
  };
}