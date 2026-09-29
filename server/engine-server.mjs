import { createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

/**
 * Small room relay for the optional multiplayer feature.
 *
 * Hardening (see audits/CODE_INSPECTOR_AUDIT.md §7):
 * - Identity: a user id is unique per room. A second connection claiming a
 *   live id is refused unless it presents the same private session key (a
 *   reconnect, which replaces the stale socket), so guests cannot
 *   impersonate each other. All relayed packets carry the server-side id, never the client's.
 * - Optional auth: when `ROOM_TOKEN` is set, `hello` must carry that token.
 * - Limits: total connections, rooms, clients per room, a hello deadline,
 *   per-connection token-bucket rate limiting, bounded `bindings`, and a
 *   heartbeat that drops dead sockets.
 */

export const CLOSE = {
  unauthorized: 4001,
  roomFull: 4003,
  helloTimeout: 4004,
  rateLimited: 4008,
  userIdInUse: 4009,
  replaced: 4010,
  tryAgainLater: 1013,
};

const intEnv = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function configFromEnv(env = process.env) {
  return {
    port: intEnv(env.PORT, 8787),
    host: env.HOST || '0.0.0.0',
    token: env.ROOM_TOKEN || '',
    maxConnections: intEnv(env.MAX_CONNECTIONS, 256),
    maxRooms: intEnv(env.MAX_ROOMS, 64),
    maxClientsPerRoom: intEnv(env.MAX_CLIENTS_PER_ROOM, 16),
    helloTimeoutMs: intEnv(env.HELLO_TIMEOUT_MS, 10_000),
    heartbeatMs: intEnv(env.HEARTBEAT_MS, 30_000),
    rateCapacity: intEnv(env.RATE_CAPACITY, 30),
    ratePerSecond: intEnv(env.RATE_PER_SECOND, 15),
    maxDroppedMessages: intEnv(env.MAX_DROPPED_MESSAGES, 100),
  };
}

const USER_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const MODES = ['keyboard', 'mouse', 'gamepad'];
const MAX_BINDINGS = 32;

const digest = (value) => createHash('sha256').update(String(value)).digest();
function tokenMatches(expected, given) {
  // Hash first so lengths match and the comparison is constant-time.
  return timingSafeEqual(digest(expected), digest(given ?? ''));
}

export function sanitizeBindings(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const out = {};
  for (const [key, action] of Object.entries(value).slice(0, MAX_BINDINGS)) {
    if (typeof action !== 'string') continue;
    out[String(key).slice(0, 32)] = action.slice(0, 32);
  }
  return out;
}

function roomState(room) {
  return {
    type: 'room-state',
    count: room.clients.size,
    users: [...room.clients].map((client) => ({
      userId: client.userId,
      username: client.username,
      actorId: client.actorId ?? null,
      instanceId: client.instanceId ?? null,
      mode: client.mode ?? 'keyboard',
      bindings: client.bindings ?? {},
      online: true,
    })),
  };
}

function broadcast(room, payload, except) {
  const text = JSON.stringify(payload);
  for (const client of room.clients) {
    if (client !== except && client.socket.readyState === 1) client.socket.send(text);
  }
}

/** Create (and start) a room server. Returns the ws server plus a close(). */
export function createEngineServer(options = {}) {
  const config = { ...configFromEnv({}), ...options };
  const rooms = new Map();
  const wss = new WebSocketServer({ port: config.port, host: config.host, maxPayload: 64 * 1024 });

  const refuse = (socket, code, closeCode, message) => {
    if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'error', code, message }));
    socket.close(closeCode, code);
  };

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, config.heartbeatMs);
  heartbeat.unref?.();

  wss.on('connection', (socket) => {
    if (wss.clients.size > config.maxConnections) {
      refuse(socket, 'server-full', CLOSE.tryAgainLater, 'The server is full. Try again later.');
      return;
    }
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });

    const client = { socket, sessionKey: null, userId: null, username: 'Guest', roomName: null, mode: 'keyboard', bindings: {}, actorId: null, instanceId: null };
    let room = null;
    const bucket = { tokens: config.rateCapacity, at: Date.now(), dropped: 0 };

    const helloTimer = setTimeout(() => {
      if (!room) refuse(socket, 'hello-timeout', CLOSE.helloTimeout, 'No hello received.');
    }, config.helloTimeoutMs);

    const leave = () => {
      if (!room) return;
      room.clients.delete(client);
      if (room.clients.size) broadcast(room, roomState(room));
      else rooms.delete(client.roomName);
      room = null;
    };

    socket.on('message', (raw) => {
      // Token bucket: refill, then spend one token per message.
      const now = Date.now();
      bucket.tokens = Math.min(config.rateCapacity, bucket.tokens + ((now - bucket.at) / 1000) * config.ratePerSecond);
      bucket.at = now;
      if (bucket.tokens < 1) {
        if (++bucket.dropped > config.maxDroppedMessages) refuse(socket, 'rate-limited', CLOSE.rateLimited, 'Too many messages.');
        return;
      }
      bucket.tokens -= 1;

      let packet;
      try { packet = JSON.parse(raw.toString()); } catch { return; /* ignore malformed packets */ }
      if (!packet || typeof packet !== 'object') return;

      if (packet.type === 'hello') {
        if (config.token && !tokenMatches(config.token, packet.token)) {
          refuse(socket, 'unauthorized', CLOSE.unauthorized, 'This room server requires a valid access token.');
          return;
        }
        const requestedId = String(packet.userId ?? '');
        if (!USER_ID_RE.test(requestedId)) {
          refuse(socket, 'invalid-user-id', CLOSE.unauthorized, 'Invalid user id.');
          return;
        }
        const roomName = String(packet.room || 'default').slice(0, 64);
        const target = rooms.get(roomName);
        const sessionKey = typeof packet.key === 'string' && packet.key.length >= 16 ? packet.key.slice(0, 128) : null;
        const holder = target && [...target.clients].find((other) => other !== client && other.userId === requestedId);
        if (holder) {
          // The same browser session reconnecting (same private key) replaces
          // its stale socket; anyone else claiming the id is refused.
          if (!sessionKey || !holder.sessionKey || !tokenMatches(holder.sessionKey, sessionKey)) {
            refuse(socket, 'user-id-in-use', CLOSE.userIdInUse, 'That user id is already connected to this room.');
            return;
          }
          target.clients.delete(holder);
          holder.socket.close(CLOSE.replaced, 'replaced');
        }
        if (target && target !== room && target.clients.size >= config.maxClientsPerRoom) {
          refuse(socket, 'room-full', CLOSE.roomFull, 'That room is full.');
          return;
        }
        if (!target && rooms.size >= config.maxRooms) {
          refuse(socket, 'server-full', CLOSE.tryAgainLater, 'No more rooms can be created right now.');
          return;
        }
        leave();
        clearTimeout(helloTimer);
        client.userId = requestedId;
        client.sessionKey = sessionKey;
        client.username = String(packet.username || 'Guest').slice(0, 24);
        client.roomName = roomName;
        room = target ?? { clients: new Set() };
        rooms.set(roomName, room);
        room.clients.add(client);
        socket.send(JSON.stringify(roomState(room)));
        broadcast(room, { type: 'presence', userId: client.userId, username: client.username, actorId: null, instanceId: null, mode: client.mode, bindings: client.bindings }, client);
        broadcast(room, roomState(room));
        return;
      }
      if (!room) return;
      if (packet.type === 'chat') {
        const id = String(packet.id || `${client.userId}:${Date.now()}`).slice(0, 64);
        const text = String(packet.text || '').slice(0, 500);
        if (!text.trim()) return;
        broadcast(room, { type: 'chat', id, userId: client.userId, username: client.username, text, at: Number(packet.at) || Date.now() }, client);
        return;
      }
      if (packet.type === 'presence' || packet.type === 'control') {
        client.username = String(packet.username || client.username).slice(0, 24);
        client.actorId = packet.actorId != null ? String(packet.actorId).slice(0, 64) : null;
        client.instanceId = packet.instanceId != null ? String(packet.instanceId).slice(0, 64) : null;
        client.mode = MODES.includes(packet.mode) ? packet.mode : client.mode;
        client.bindings = sanitizeBindings(packet.bindings, client.bindings);
        broadcast(room, { type: 'control', userId: client.userId, username: client.username, actorId: client.actorId, instanceId: client.instanceId, mode: client.mode, bindings: client.bindings }, client);
        broadcast(room, roomState(room));
      }
      // Unknown packet types are dropped. This is a strict room relay.
    });

    socket.on('close', () => {
      clearTimeout(helloTimer);
      leave();
    });
  });

  return {
    wss,
    rooms,
    config,
    close: () => new Promise((resolve) => {
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      wss.close(() => resolve());
    }),
  };
}

// Run directly: `node server/engine-server.mjs`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = createEngineServer(configFromEnv());
  console.log(`Room server listening on ws://${config.host}:${config.port}${config.token ? ' (token required)' : ''}`);
}
