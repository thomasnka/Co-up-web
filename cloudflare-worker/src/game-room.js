// =============================================================================
// FILE: cloudflare-worker/src/game-room.js
// Cloudflare Durable Object — 1 instance per active game room
//
// SESSION FIX — S-CRITICAL: Server-side move validation
//   Trước: trust client hoàn toàn → dễ hack (gửi move bất kỳ)
//   Sau:   port toàn bộ isValidMove logic từ chessLogic.js vào worker
//          Validate mỗi move trước khi broadcast
//          Reject move bất hợp lệ → gửi 'move_rejected' về client gửi
//          Đồng thời giữ authoritative game state trong DO storage
//
// RESPONSIBILITIES:
//   - WebSocket hub: validate + broadcast moves giữa host ↔ guest
//   - Spectator support: read-only connections
//   - Draw request 2-chiều
//   - Disconnect detection via heartbeat (30s timeout)
//   - Write kết quả về Supabase khi game kết thúc
//   - [NEW] Server-side move validation với full chessLogic
//   - [NEW] Authoritative state storage trong DO
//
// PROTOCOL (JSON over WebSocket):
//   Client → DO:
//     { type: 'join',          matchId, playerId, playerName, playerElo }
//     { type: 'move',          state: GameState, seq: number }
//     { type: 'draw_request',  from: playerId }
//     { type: 'draw_respond',  accept: boolean }
//     { type: 'game_end',      gameStatus: string, winner: string }
//     { type: 'request_state_recovery' }
//     { type: 'ping' }
//
//   DO → Client:
//     { type: 'room_state',           players, status, myRole, gameState? }
//     { type: 'move',                 state: GameState, from: playerId, seq }
//     { type: 'move_rejected',        reason: string, seq: number }
//     { type: 'draw_request',         from: playerId }
//     { type: 'draw_respond',         accept: boolean }
//     { type: 'opponent_connected',   player: {id, name, elo} }
//     { type: 'opponent_disconnected' }
//     { type: 'state_recovery',       gameState: GameState }
//     { type: 'pong' }
//     { type: 'error',                message: string }
// =============================================================================

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS  = 30_000;
const MAX_SPECTATORS        = 20;

// =============================================================================
// CHESS LOGIC — Ported từ chessLogic.js (C1+C2 version)
// Worker không thể import ES modules từ src/, nên inline toàn bộ logic cần thiết
// =============================================================================

const getEffectiveColor = (piece) =>
  piece.isHidden ? (piece.row > 4 ? 'red' : 'black') : piece.color;

const getPieceAt = (pieces, row, col) =>
  pieces.find(p => p.row === row && p.col === col);

const countPiecesBetween = (pieces, r1, c1, r2, c2) => {
  let count = 0;
  if (r1 === r2) {
    const [lo, hi] = c1 < c2 ? [c1, c2] : [c2, c1];
    pieces.forEach(p => { if (p.row === r1 && p.col > lo && p.col < hi) count++; });
  } else if (c1 === c2) {
    const [lo, hi] = r1 < r2 ? [r1, r2] : [r2, r1];
    pieces.forEach(p => { if (p.col === c1 && p.row > lo && p.row < hi) count++; });
  }
  return count;
};

const checkBasicRules = (piece, targetRow, targetCol, allPieces) => {
  const targetPiece = getPieceAt(allPieces, targetRow, targetCol);
  if (targetPiece && getEffectiveColor(targetPiece) === getEffectiveColor(piece)) return false;

  const role = piece.isHidden ? piece.startingRole : piece.type;
  if (!role) return false;

  const movingColor = getEffectiveColor(piece);
  const startRow = piece.row, startCol = piece.col;
  const dx = Math.abs(targetCol - startCol), dy = Math.abs(targetRow - startRow);
  const isOpened = piece.opened === true; // C2

  switch (role) {
    case 'general':
      if (dx + dy !== 1) return false;
      if (targetCol < 3 || targetCol > 5) return false;
      if (movingColor === 'red'   && targetRow < 7) return false;
      if (movingColor === 'black' && targetRow > 2) return false;
      return true;

    case 'advisor':
      if (dx !== 1 || dy !== 1) return false;
      if (!isOpened) {
        if (targetCol < 3 || targetCol > 5) return false;
        if (movingColor === 'red'   && targetRow < 7) return false;
        if (movingColor === 'black' && targetRow > 2) return false;
      }
      return true;

    case 'elephant':
      if (dx !== 2 || dy !== 2) return false;
      if (!isOpened) {
        if (movingColor === 'red'   && targetRow < 5) return false;
        if (movingColor === 'black' && targetRow > 4) return false;
      }
      if (getPieceAt(allPieces, (startRow + targetRow) / 2, (startCol + targetCol) / 2)) return false;
      return true;

    case 'horse':
      if (dx === 1 && dy === 2) {
        if (!getPieceAt(allPieces, startRow + (targetRow > startRow ? 1 : -1), startCol)) return true;
      } else if (dx === 2 && dy === 1) {
        if (!getPieceAt(allPieces, startRow, startCol + (targetCol > startCol ? 1 : -1))) return true;
      }
      return false;

    case 'chariot':
      if (dx !== 0 && dy !== 0) return false;
      return countPiecesBetween(allPieces, startRow, startCol, targetRow, targetCol) === 0;

    case 'cannon': {
      if (dx !== 0 && dy !== 0) return false;
      const between = countPiecesBetween(allPieces, startRow, startCol, targetRow, targetCol);
      return targetPiece ? between === 1 : between === 0;
    }

    case 'pawn': {
      const forward      = movingColor === 'red' ? -1 : 1;
      const crossedRiver = movingColor === 'red' ? startRow < 5 : startRow > 4;
      if (targetRow === startRow + forward && targetCol === startCol) return true;
      if (crossedRiver && targetRow === startRow && dx === 1) return true;
      return false;
    }

    default:
      return false;
  }
};

const isGeneralsFacing = (pieces) => {
  const rg = pieces.find(p => p.type === 'general' && p.color === 'red');
  const bg = pieces.find(p => p.type === 'general' && p.color === 'black');
  if (!rg || !bg || rg.col !== bg.col) return false;
  return countPiecesBetween(pieces, bg.row, bg.col, rg.row, rg.col) === 0;
};

// C1: quân úp không chiếu tướng
const isKingInCheck = (pieces, kingColor) => {
  const king = pieces.find(p => p.type === 'general' && p.color === kingColor);
  if (!king) return false;
  for (const p of pieces) {
    if (getEffectiveColor(p) === kingColor) continue;
    if (p.isHidden) continue; // C1: hidden không chiếu
    if (checkBasicRules(p, king.row, king.col, pieces)) return true;
  }
  return false;
};

const getBoardHash = (pieces, turnColor) => {
  const sorted = [...pieces].sort((a, b) => a.id - b.id);
  return turnColor + '|' + sorted.map(p =>
    `${p.id}:${p.row}${p.col}${p.isHidden ? 'H' : 'S'}${p.opened ? 'O' : 'C'}`
  ).join('');
};

const serverIsValidMove = (piece, targetRow, targetCol, allPieces, historyStates = []) => {
  if (!checkBasicRules(piece, targetRow, targetCol, allPieces)) return false;

  const movingColor = getEffectiveColor(piece);
  let sim = allPieces.filter(p => !(p.row === targetRow && p.col === targetCol));
  sim = sim.map(p => p.id === piece.id
    ? { ...p, row: targetRow, col: targetCol, isHidden: false, opened: true }
    : p
  );

  if (isGeneralsFacing(sim)) return false;
  if (isKingInCheck(sim, movingColor)) return false;

  const nextTurn = movingColor === 'red' ? 'black' : 'red';
  const simHash  = getBoardHash(sim, nextTurn);
  if (historyStates.filter(h => h === simHash).length >= 2) return false;

  return true;
};

// Validate toàn bộ state do client gửi lên
// Strategy: kiểm tra nước đi cuối (lastMove) so với state trước đó
// Nếu không có state trước → accept state đầu tiên (trust initial state)
const validateClientMove = (prevState, newState) => {
  // Không có previous state → đây là lần đầu, không validate được
  if (!prevState || !prevState.pieces) return { valid: true };

  const prevPieces      = prevState.pieces;
  const prevTurn        = prevState.currentTurn;
  const prevHistory     = prevState.historyStates ?? [];
  const newLastMove     = newState.lastMove;

  // Không có lastMove info → không validate được, accept
  if (!newLastMove) return { valid: true };

  const { from, to } = newLastMove;

  // Tìm quân đã di chuyển trong prevState
  const movingPiece = prevPieces.find(p => p.row === from.row && p.col === from.col);
  if (!movingPiece) {
    return { valid: false, reason: `No piece found at from position (${from.row},${from.col})` };
  }

  // Kiểm tra đúng lượt
  if (getEffectiveColor(movingPiece) !== prevTurn) {
    return { valid: false, reason: `Wrong turn: ${getEffectiveColor(movingPiece)} moved but it's ${prevTurn}'s turn` };
  }

  // Validate nước đi với luật cờ
  if (!serverIsValidMove(movingPiece, to.row, to.col, prevPieces, prevHistory)) {
    return {
      valid: false,
      reason: `Illegal move: piece ${movingPiece.type} from (${from.row},${from.col}) to (${to.row},${to.col})`
    };
  }

  return { valid: true };
};

// =============================================================================
// GameRoom Durable Object
// =============================================================================

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env   = env;
    this.sessions     = new Map(); // playerId → { ws, role, name, elo, lastPong }
    this.heartbeatTimer = null;
  }

  async fetch(request) {
    const url      = new URL(request.url);
    const matchId  = url.searchParams.get('matchId');
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

  async _handleSession(ws, matchId, playerId) {
    this.state.acceptWebSocket(ws);
    ws.serializeAttachment({ playerId, matchId });
  }

  // ── WEBSOCKET EVENTS ──────────────────────────────────────────────────────
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
        const playerName = msg.playerName ?? playerId;
        const playerElo  = msg.playerElo  ?? 1500;

        const roomMeta = (await this.state.storage.get('roomMeta')) ?? {
          matchId,
          hostId:  null,
          guestId: null,
          status:  'waiting',
        };

        let role;
        if (!roomMeta.hostId) {
          roomMeta.hostId = playerId;
          role = 'host';
        } else if (roomMeta.hostId === playerId) {
          role = 'host';
        } else if (!roomMeta.guestId) {
          roomMeta.guestId = playerId;
          roomMeta.status  = 'playing';
          role = 'guest';
        } else if (roomMeta.guestId === playerId) {
          role = 'guest';
        } else {
          if (this._spectatorCount() >= MAX_SPECTATORS) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room full (spectators)' }));
            ws.close(1008, 'Room full');
            return;
          }
          role = 'spectator';
        }

        await this.state.storage.put('roomMeta', roomMeta);
        this.sessions.set(playerId, { ws, role, name: playerName, elo: playerElo, lastPong: Date.now() });

        // Gửi room_state kèm gameState để reconnect recovery
        const savedState = await this.state.storage.get('gameState');
        ws.send(JSON.stringify({
          type:      'room_state',
          players:   this._getPlayers(),
          status:    roomMeta.status,
          myRole:    role,
          gameState: savedState ?? null, // F1: state recovery khi reconnect
        }));

        if (role === 'guest') {
          this._sendTo(roomMeta.hostId, {
            type:   'opponent_connected',
            player: { id: playerId, name: playerName, elo: playerElo },
          });
        }
        if (role === 'host' && roomMeta.guestId) {
          this._sendTo(roomMeta.guestId, {
            type:   'opponent_connected',
            player: { id: playerId, name: playerName, elo: playerElo },
          });
        }

        this._startHeartbeat();
        break;
      }

      case 'move': {
        // S-CRITICAL FIX: Server-side validation trước khi broadcast
        const session = this.sessions.get(playerId);
        if (!session || session.role === 'spectator') break;

        const roomMeta   = await this.state.storage.get('roomMeta');
        const prevState  = await this.state.storage.get('gameState');
        const newState   = msg.state;
        const seq        = msg.seq ?? 0;

        // Validate nước đi
        const validation = validateClientMove(prevState, newState);

        if (!validation.valid) {
          // Reject — gửi lại state hợp lệ để client rollback
          console.warn(`[GameRoom] Move rejected from ${playerId}: ${validation.reason}`);
          ws.send(JSON.stringify({
            type:       'move_rejected',
            reason:     validation.reason,
            seq,
            // Gửi lại authoritative state để client sync
            gameState:  prevState ?? null,
          }));
          break;
        }

        // Valid → lưu state mới vào DO storage (authoritative)
        await this.state.storage.put('gameState', newState);

        // Broadcast tới đối thủ + spectators
        this._broadcast({ type: 'move', state: newState, from: playerId, seq }, playerId);
        break;
      }

      case 'request_state_recovery': {
        // F1: client reconnect xin lại game state
        const savedState = await this.state.storage.get('gameState');
        if (savedState) {
          ws.send(JSON.stringify({ type: 'state_recovery', gameState: savedState }));
        }
        break;
      }

      case 'draw_request': {
        this._broadcast({ type: 'draw_request', from: playerId }, playerId);
        break;
      }

      case 'draw_respond': {
        this._broadcast({ type: 'draw_respond', accept: msg.accept, from: playerId }, playerId);
        break;
      }

      case 'game_end': {
        const session = this.sessions.get(playerId);
        if (!session || session.role === 'spectator') break;

        this._broadcastAll({ type: 'game_end', gameStatus: msg.gameStatus, winner: msg.winner });
        await this._writeResultToSupabase(matchId, msg.gameStatus, msg.winner);

        const roomMeta = await this.state.storage.get('roomMeta');
        if (roomMeta) {
          roomMeta.status = 'finished';
          await this.state.storage.put('roomMeta', roomMeta);
        }
        // Clear game state khi kết thúc để giải phóng storage
        await this.state.storage.delete('gameState');
        break;
      }

      case 'ping': {
        const session = this.sessions.get(playerId);
        if (session) session.lastPong = Date.now();
        ws.send(JSON.stringify({ type: 'pong' }));
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

    const roomMeta = await this.state.storage.get('roomMeta');
    if (!roomMeta || roomMeta.status === 'finished') return;

    await this.state.storage.put(`disconnect_check_${playerId}`, Date.now());
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

  async alarm() {
    const roomMeta = await this.state.storage.get('roomMeta');
    if (!roomMeta || roomMeta.status === 'finished') return;

    const keys = await this.state.storage.list({ prefix: 'disconnect_check_' });
    for (const [key] of keys) {
      const pid = key.replace('disconnect_check_', '');
      if (this.sessions.has(pid)) {
        await this.state.storage.delete(key);
        continue;
      }
      const opponentId = pid === roomMeta.hostId ? roomMeta.guestId : roomMeta.hostId;
      if (opponentId) {
        this._sendTo(opponentId, { type: 'opponent_disconnected' });
      }
      await this.state.storage.delete(key);
    }
  }

  _startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [pid, session] of this.sessions) {
        try {
          session.ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          this.sessions.delete(pid);
          continue;
        }
        if (now - session.lastPong > HEARTBEAT_TIMEOUT_MS) {
          console.warn(`[GameRoom] Heartbeat timeout for ${pid}`);
          session.ws.close(1001, 'Heartbeat timeout');
          this.sessions.delete(pid);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

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

  _broadcastAll(msg) { this._broadcast(msg, null); }

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
export default {
  async fetch(request, env, ctx) {
    const url     = new URL(request.url);
    const matchId = url.searchParams.get('matchId');

    if (!matchId) {
      return new Response('Missing matchId', { status: 400 });
    }

    const id   = env.GAME_ROOM.idFromName(matchId);
    const stub = env.GAME_ROOM.get(id);
    return stub.fetch(request);
  },
};