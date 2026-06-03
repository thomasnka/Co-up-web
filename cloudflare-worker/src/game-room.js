// =============================================================================
// FILE: cloudflare-worker/src/game-room.js
// Cloudflare Durable Object — 1 instance per active game room
//
// RESPONSIBILITIES:
//   - WebSocket hub: broadcast moves giữa host ↔ guest (O(1) relay, không validate)
//   - Spectator support: read-only connections
//   - Draw request 2-chiều
//   - Disconnect detection via heartbeat (30s timeout)
//   - Write kết quả về Supabase khi game kết thúc
//
// SUPABASE WRITE (game end only):
//   Dùng Supabase REST API với service role key (từ env secret)
//   Không dùng Supabase Realtime trong worker
//
// PROTOCOL (JSON over WebSocket):
//   Client → DO:
//     { type: 'join',         matchId, playerId, playerName, playerElo }
//     { type: 'move',         state: GameState }
//     { type: 'draw_request', from: playerId }
//     { type: 'draw_respond', accept: boolean }
//     { type: 'game_end',     gameStatus: string }
//     { type: 'ping' }
//
//   DO → Client:
//     { type: 'room_state',          players: [{id, name, elo, role}], status }
//     { type: 'move',                state: GameState, from: playerId }
//     { type: 'draw_request',        from: playerId }
//     { type: 'draw_respond',        accept: boolean }
//     { type: 'opponent_connected',  player: {id, name, elo} }
//     { type: 'opponent_disconnected' }
//     { type: 'pong' }
//     { type: 'error',               message: string }
// =============================================================================

const HEARTBEAT_INTERVAL_MS = 15_000; // ping mỗi 15s
const HEARTBEAT_TIMEOUT_MS  = 30_000; // coi là disconnect nếu không pong sau 30s
const MAX_SPECTATORS        = 20;

export class GameRoom {
  constructor(state, env) {
    this.state = state;   // DurableObjectState
    this.env   = env;     // bindings: SUPABASE_URL, SUPABASE_SERVICE_KEY

    // In-memory session (reset nếu DO hibernate)
    // Persistent state dùng this.state.storage
    this.sessions = new Map(); // playerId → { ws, role: 'host'|'guest'|'spectator', name, elo, lastPong }
    this.heartbeatTimer = null;
  }

  // ── ENTRY POINT ────────────────────────────────────────────────────────────
  async fetch(request) {
    const url    = new URL(request.url);
    const matchId = url.searchParams.get('matchId');
    const playerId = url.searchParams.get('playerId');

    if (!matchId || !playerId) {
      return new Response('Missing matchId or playerId', { status: 400 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    await this._handleSession(server, matchId, playerId);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── SESSION HANDLER ────────────────────────────────────────────────────────
  async _handleSession(ws, matchId, playerId) {
    this.state.acceptWebSocket(ws);

    // Tạm thời lưu playerId vào ws tag để dùng lại trong webSocketMessage/Close
    // Cloudflare hibernation-safe: dùng setTag thay vì closure
    ws.serializeAttachment({ playerId, matchId });

    // Không emit room_state ngay — chờ client gửi 'join' với đầy đủ metadata
  }

  // ── WEBSOCKET EVENTS (hibernation-safe handlers) ───────────────────────────
  async webSocketMessage(ws, rawMessage) {
    let msg;
    try {
      msg = JSON.parse(rawMessage);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    const { playerId, matchId } = ws.deserializeAttachment();

    switch (msg.type) {

      case 'join': {
        // msg: { type, matchId, playerId, playerName, playerElo }
        const playerName = msg.playerName ?? playerId;
        const playerElo  = msg.playerElo  ?? 1500;

        // Đọc room meta từ storage
        const roomMeta = (await this.state.storage.get('roomMeta')) ?? {
          matchId,
          hostId:   null,
          guestId:  null,
          status:   'waiting', // 'waiting' | 'playing' | 'finished'
        };

        let role;
        if (!roomMeta.hostId) {
          roomMeta.hostId = playerId;
          role = 'host';
        } else if (roomMeta.hostId === playerId) {
          role = 'host'; // reconnect
        } else if (!roomMeta.guestId) {
          roomMeta.guestId = playerId;
          roomMeta.status  = 'playing';
          role = 'guest';
        } else if (roomMeta.guestId === playerId) {
          role = 'guest'; // reconnect
        } else {
          // Spectator
          if (this._spectatorCount() >= MAX_SPECTATORS) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room full (spectators)' }));
            ws.close(1008, 'Room full');
            return;
          }
          role = 'spectator';
        }

        await this.state.storage.put('roomMeta', roomMeta);

        // Đăng ký session in-memory
        this.sessions.set(playerId, { ws, role, name: playerName, elo: playerElo, lastPong: Date.now() });

        // Gửi room_state cho người vừa join
        ws.send(JSON.stringify({
          type:    'room_state',
          players: this._getPlayers(),
          status:  roomMeta.status,
          myRole:  role,
        }));

        // Nếu là guest vừa join → báo host "đối thủ đã vào"
        if (role === 'guest') {
          this._sendTo(roomMeta.hostId, {
            type:   'opponent_connected',
            player: { id: playerId, name: playerName, elo: playerElo },
          });
        }

        // Nếu là host reconnect → báo guest
        if (role === 'host' && roomMeta.guestId) {
          this._sendTo(roomMeta.guestId, {
            type:   'opponent_connected',
            player: { id: playerId, name: playerName, elo: playerElo },
          });
        }

        // Khởi động heartbeat nếu chưa chạy
        this._startHeartbeat();
        break;
      }

      case 'move': {
        // S2 FIX: validate sequence_id để chống race condition
        // S1 FIX: strip identity quân úp trước khi broadcast cho đối thủ
        const session = this.sessions.get(playerId);
        if (!session || session.role === 'spectator') break;

        const roomMeta = await this.state.storage.get('roomMeta');
        if (!roomMeta || roomMeta.status !== 'playing') break;

        // S2: kiểm tra sequence_id tăng đơn điệu (chống duplicate/race)
        const lastSeq = (await this.state.storage.get('lastSeq')) ?? 0;
        if (msg.seq !== undefined && msg.seq <= lastSeq) {
          ws.send(JSON.stringify({ type: 'move_rejected', reason: 'stale_sequence', seq: msg.seq }));
          break;
        }
        if (msg.seq !== undefined) {
          await this.state.storage.put('lastSeq', msg.seq);
        }

        // S1: strip hidden piece identity trước khi relay
        // opponent chỉ nhận được { id, row, col, isHidden: true } — không có type/name/color thật
        const safeState = msg.state ? {
          ...msg.state,
          pieces: msg.state.pieces?.map(p => p.isHidden
            ? { id: p.id, row: p.row, col: p.col, isHidden: true, startingRole: undefined, type: undefined, name: undefined, color: undefined }
            : p
          ),
        } : msg.state;

        // F1: lưu state vào storage để recovery sau reconnect
        if (msg.state) {
          await this.state.storage.put('gameState', msg.state);
        }

        this._broadcast({ type: 'move', state: safeState, from: playerId, seq: msg.seq }, playerId);
        break;
      }

      case 'reveal': {
        // S1 FIX: chỉ server mới được xác nhận identity quân vừa lật
        // Client gửi: { type: 'reveal', pieceId, row, col } — không có identity
        // Server đọc từ storage (được set lúc init) và broadcast identity thật
        const session = this.sessions.get(playerId);
        if (!session || session.role === 'spectator') break;

        const hiddenMap = await this.state.storage.get('hiddenPieces') ?? {};
        const pieceKey = `${msg.pieceId}`;
        const trueIdentity = hiddenMap[pieceKey];

        if (!trueIdentity) {
          // Piece không có trong map → đã lật trước đó hoặc invalid
          ws.send(JSON.stringify({ type: 'reveal_rejected', pieceId: msg.pieceId }));
          break;
        }

        // Xóa khỏi map sau khi lật
        delete hiddenMap[pieceKey];
        await this.state.storage.put('hiddenPieces', hiddenMap);

        // Broadcast identity thật cho TẤT CẢ (kể cả người lật)
        this._broadcastAll({
          type: 'piece_revealed',
          pieceId: msg.pieceId,
          row: msg.row,
          col: msg.col,
          trueType:  trueIdentity.type,
          trueName:  trueIdentity.name,
          trueColor: trueIdentity.color,
        });
        break;
      }

      case 'init_hidden_pieces': {
        // S1 FIX: Host gửi hidden piece map lúc game bắt đầu
        // Chỉ được gọi 1 lần, chỉ host mới được gọi
        const session = this.sessions.get(playerId);
        if (!session || session.role !== 'host') break;

        const existing = await this.state.storage.get('hiddenPieces');
        if (existing && Object.keys(existing).length > 0) break; // đã init rồi

        // msg.pieces = [{ id, type, name, color, row, col }] — chỉ quân úp
        const hiddenMap = {};
        (msg.pieces ?? []).forEach(p => {
          hiddenMap[String(p.id)] = { type: p.type, name: p.name, color: p.color };
        });
        await this.state.storage.put('hiddenPieces', hiddenMap);
        ws.send(JSON.stringify({ type: 'hidden_pieces_stored', count: Object.keys(hiddenMap).length }));
        break;
      }

      case 'draw_request': {
        this._broadcast({ type: 'draw_request', from: playerId }, playerId);
        break;
      }

      case 'draw_respond': {
        // msg: { type, accept: boolean }
        this._broadcast({ type: 'draw_respond', accept: msg.accept, from: playerId }, playerId);
        break;
      }

      case 'game_end': {
        // msg: { type, gameStatus: string, winner: 'red'|'black'|'draw' }
        // Chỉ host hoặc guest mới được khai báo kết thúc
        const session = this.sessions.get(playerId);
        if (!session || session.role === 'spectator') break;

        // Broadcast cho tất cả (kể cả người gửi nếu là relay từ opponent)
        this._broadcastAll({ type: 'game_end', gameStatus: msg.gameStatus, winner: msg.winner });

        // Write về Supabase
        await this._writeResultToSupabase(matchId, msg.gameStatus, msg.winner);

        // Đánh dấu phòng finished
        const roomMeta = await this.state.storage.get('roomMeta');
        if (roomMeta) {
          roomMeta.status = 'finished';
          await this.state.storage.put('roomMeta', roomMeta);
        }
        break;
      }

      case 'ping': {
        const session = this.sessions.get(playerId);
        if (session) session.lastPong = Date.now();
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }

      case 'request_state_recovery': {
        // F1 FIX: client reconnect và yêu cầu state hiện tại
        const savedState = await this.state.storage.get('gameState');
        if (savedState) {
          ws.send(JSON.stringify({ type: 'state_recovery', state: savedState }));
        }
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  }

  async webSocketClose(ws, code, reason) {
    const { playerId } = ws.deserializeAttachment() ?? {};
    if (!playerId) return;

    const session = this.sessions.get(playerId);
    if (!session) return;

    this.sessions.delete(playerId);

    // Không báo disconnect ngay — chờ heartbeat confirm (tránh false positive khi reconnect)
    // Nếu sau HEARTBEAT_TIMEOUT_MS vẫn không reconnect → báo đối thủ
    const roomMeta = await this.state.storage.get('roomMeta');
    if (!roomMeta || roomMeta.status === 'finished') return;

    const opponentId = session.role === 'host' ? roomMeta.guestId : roomMeta.hostId;

    // Schedule check sau 5s
    await this.state.storage.put(`disconnect_check_${playerId}`, Date.now());

    // Dùng alarm để check sau 5s (Cloudflare Alarms API)
    const currentAlarm = await this.state.storage.getAlarm();
    if (!currentAlarm) {
      await this.state.storage.setAlarm(Date.now() + 5_000);
    }
  }

  async webSocketError(ws, error) {
    const { playerId } = ws.deserializeAttachment() ?? {};
    console.error(`[GameRoom] WebSocket error for ${playerId}:`, error);
    this.sessions.delete(playerId ?? '');
  }

  // ── ALARM (disconnect check) ───────────────────────────────────────────────
  async alarm() {
    const roomMeta = await this.state.storage.get('roomMeta');
    if (!roomMeta || roomMeta.status === 'finished') return;

    // Check tất cả disconnect flags
    const keys = await this.state.storage.list({ prefix: 'disconnect_check_' });
    for (const [key, disconnectTime] of keys) {
      const playerId = key.replace('disconnect_check_', '');

      // Nếu đã reconnect (session tồn tại trong memory) → xóa flag
      if (this.sessions.has(playerId)) {
        await this.state.storage.delete(key);
        continue;
      }

      // Chưa reconnect sau 5s → thông báo đối thủ
      const opponentId = playerId === roomMeta.hostId ? roomMeta.guestId : roomMeta.hostId;
      if (opponentId) {
        this._sendTo(opponentId, { type: 'opponent_disconnected' });
      }
      await this.state.storage.delete(key);
    }
  }

  // ── HEARTBEAT ──────────────────────────────────────────────────────────────
  _startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [playerId, session] of this.sessions) {
        // Gửi ping
        try {
          session.ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // WS đã đóng — xóa session
          this.sessions.delete(playerId);
          continue;
        }
        // Check timeout
        if (now - session.lastPong > HEARTBEAT_TIMEOUT_MS) {
          console.warn(`[GameRoom] Heartbeat timeout for ${playerId}`);
          session.ws.close(1001, 'Heartbeat timeout');
          this.sessions.delete(playerId);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────
  _sendTo(playerId, msg) {
    const session = this.sessions.get(playerId);
    if (!session) return;
    try {
      session.ws.send(JSON.stringify(msg));
    } catch (e) {
      console.warn(`[GameRoom] _sendTo ${playerId} failed:`, e.message);
      this.sessions.delete(playerId);
    }
  }

  // Broadcast tới tất cả TRỪ excludeId
  _broadcast(msg, excludeId = null) {
    for (const [id, session] of this.sessions) {
      if (id === excludeId) continue;
      try {
        session.ws.send(JSON.stringify(msg));
      } catch {
        this.sessions.delete(id);
      }
    }
  }

  // Broadcast tới tất cả KỂ CẢ sender
  _broadcastAll(msg) {
    this._broadcast(msg, null);
  }

  _spectatorCount() {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.role === 'spectator') count++;
    }
    return count;
  }

  _getPlayers() {
    const players = [];
    for (const [id, s] of this.sessions) {
      if (s.role !== 'spectator') {
        players.push({ id, name: s.name, elo: s.elo, role: s.role });
      }
    }
    return players;
  }

  // ── SUPABASE WRITE (kết thúc game) ────────────────────────────────────────
  async _writeResultToSupabase(matchId, gameStatus, winner) {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_KEY) {
      console.warn('[GameRoom] Supabase env not configured — skipping result write');
      return;
    }

    try {
      const res = await fetch(
        `${this.env.SUPABASE_URL}/rest/v1/matches?id=eq.${matchId}`,
        {
          method:  'PATCH',
          headers: {
            'Content-Type':  'application/json',
            'apikey':        this.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${this.env.SUPABASE_SERVICE_KEY}`,
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify({
            status:      'finished',
            winner:      winner ?? 'unknown',
            game_status: gameStatus,
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error('[GameRoom] Supabase write error:', res.status, text);
      }
    } catch (e) {
      console.error('[GameRoom] Supabase write exception:', e.message);
    }
  }
}

// ── WORKER ENTRY ──────────────────────────────────────────────────────────────
// Route: GET /room?matchId=...&playerId=...
// DO stub: env.GAME_ROOM

export default {
  async fetch(request, env, ctx) {
    const url     = new URL(request.url);
    const matchId = url.searchParams.get('matchId');

    if (!matchId) {
      return new Response('Missing matchId', { status: 400 });
    }

    // Mỗi matchId → 1 DO instance riêng biệt (idFromName đảm bảo deterministic)
    const id   = env.GAME_ROOM.idFromName(matchId);
    const stub = env.GAME_ROOM.get(id);

    return stub.fetch(request);
  },
};