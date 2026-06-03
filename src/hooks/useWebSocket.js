// =============================================================================
// FILE: src/hooks/useWebSocket.js
// WebSocket client kết nối đến Cloudflare Durable Object
//
// FEATURES:
//   - Auto-reconnect với exponential backoff (max 30s)
//   - Heartbeat: server gửi ping, client trả pong
//   - Message queue: buffer tin nhắn khi đang reconnect
//   - Cleanup đúng khi unmount
//
// USAGE:
//   const ws = useWebSocket({
//     matchId,          // string | null
//     playerId,         // string
//     playerName,       // string
//     playerElo,        // number
//     onMessage,        // (msg: object) => void
//     enabled,          // boolean — chỉ connect khi true
//   });
//
//   ws.send(msg)        // object → tự JSON.stringify
//   ws.status           // 'connecting' | 'open' | 'closed' | 'reconnecting'
//   ws.reconnectCount   // number
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

// Đọc từ env Vite — đặt trong .env.local:
//   VITE_WS_URL=wss://co-up-game-server.<subdomain>.workers.dev
// Fallback về localhost khi dev
const WS_BASE_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8787';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;
const MAX_QUEUE_SIZE    = 50;

export function useWebSocket({
  matchId,
  playerId,
  playerName,
  playerElo,
  onMessage,
  enabled = true,
}) {
  const [status, setStatus]               = useState('closed');
  const [reconnectCount, setReconnectCount] = useState(0);

  const wsRef              = useRef(null);
  const onMessageRef       = useRef(onMessage);
  const reconnectTimerRef  = useRef(null);
  const reconnectCountRef  = useRef(0);
  const messageQueueRef    = useRef([]);     // buffer khi đang reconnect
  const isMountedRef       = useRef(true);
  const shouldConnectRef   = useRef(false);  // dùng để cancel reconnect khi unmount

  // Cập nhật callback ref mà không trigger re-connect
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  // ── CONNECT ──────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!shouldConnectRef.current) return;
    if (!matchId || !playerId)     return;

    // Đóng connection cũ nếu còn
    if (wsRef.current) {
      wsRef.current.onclose = null; // ngăn trigger reconnect
      wsRef.current.onerror = null;
      try { wsRef.current.close(1000, 'Reconnecting'); } catch {}
      wsRef.current = null;
    }

    const url = `${WS_BASE_URL}/room?matchId=${encodeURIComponent(matchId)}&playerId=${encodeURIComponent(playerId)}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error('[useWebSocket] Failed to create WebSocket:', e.message);
      _scheduleReconnect();
      return;
    }

    wsRef.current = ws;
    if (isMountedRef.current) setStatus('connecting');

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      console.log('[useWebSocket] Connected');
      setStatus('open');
      reconnectCountRef.current = 0;
      setReconnectCount(0);

      // Gửi join ngay sau khi open
      _rawSend({
        type: 'join',
        matchId,
        playerId,
        playerName,
        playerElo,
      });

      // Flush queue
      while (messageQueueRef.current.length > 0) {
        const queued = messageQueueRef.current.shift();
        _rawSend(queued);
      }
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        console.warn('[useWebSocket] Invalid JSON from server:', event.data);
        return;
      }

      // Tự xử lý ping từ server — không forward lên caller
      if (msg.type === 'ping') {
        _rawSend({ type: 'pong' });
        return;
      }

      // Tự xử lý pong — không forward
      if (msg.type === 'pong') return;

      onMessageRef.current?.(msg);
    };

    ws.onclose = (event) => {
      if (!isMountedRef.current) return;
      console.log(`[useWebSocket] Closed: ${event.code} ${event.reason}`);
      wsRef.current = null;

      // 1000 = clean close (intentional) → không reconnect
      if (event.code === 1000 || !shouldConnectRef.current) {
        setStatus('closed');
        return;
      }

      setStatus('reconnecting');
      _scheduleReconnect();
    };

    ws.onerror = (event) => {
      console.error('[useWebSocket] Error:', event);
      // onclose sẽ fires sau onerror — không cần xử lý reconnect ở đây
    };
  }, [matchId, playerId, playerName, playerElo]);

  // ── RAW SEND (internal) ───────────────────────────────────────────────────
  const _rawSend = (msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  // ── SCHEDULE RECONNECT ────────────────────────────────────────────────────
  const _scheduleReconnect = () => {
    if (!shouldConnectRef.current) return;
    const count = reconnectCountRef.current;
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, count), RECONNECT_MAX_MS);

    console.log(`[useWebSocket] Reconnect in ${delay}ms (attempt ${count + 1})`);
    reconnectCountRef.current += 1;
    setReconnectCount(count + 1);

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      if (shouldConnectRef.current) connect();
    }, delay);
  };

  // ── PUBLIC SEND ───────────────────────────────────────────────────────────
  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      _rawSend(msg);
    } else {
      // Queue khi đang reconnect (tránh drop message)
      if (messageQueueRef.current.length < MAX_QUEUE_SIZE) {
        messageQueueRef.current.push(msg);
      } else {
        console.warn('[useWebSocket] Message queue full — dropping message');
      }
    }
  }, []);

  // ── DISCONNECT ────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    shouldConnectRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      try { wsRef.current.close(1000, 'Intentional disconnect'); } catch {}
      wsRef.current = null;
    }
    if (isMountedRef.current) setStatus('closed');
  }, []);

  // ── LIFECYCLE ─────────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (enabled && matchId && playerId) {
      shouldConnectRef.current = true;
      reconnectCountRef.current = 0;
      messageQueueRef.current = [];
      connect();
    } else {
      disconnect();
    }
    // BUG-1 FIX: KHÔNG set shouldConnectRef = false ở đây
    // Cleanup này chạy mỗi lần deps thay đổi — nếu set false sẽ cancel reconnect timer
    // shouldConnectRef chỉ được set false trong disconnect() hoặc unmount effect
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [enabled, matchId, playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // BUG-1 FIX: iOS Safari suspend WebSocket khi switch app
  // visibilitychange + pageshow để reconnect khi quay lại foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!shouldConnectRef.current) return;
      const ws = wsRef.current;
      const isDead = !ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING;
      if (isDead) {
        console.log('[useWebSocket] App foregrounded — reconnecting...');
        reconnectCountRef.current = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean close khi unmount
  useEffect(() => {
    return () => {
      shouldConnectRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        try { wsRef.current.close(1000, 'Component unmount'); } catch {}
      }
    };
  }, []);

  return { send, disconnect, status, reconnectCount };
}