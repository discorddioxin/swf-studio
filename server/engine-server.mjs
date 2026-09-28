import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 8787);
const rooms = new Map();

function roomState(room) {
  return {
    type: 'room-state',
    count: room.clients.size,
    users: [...room.clients.values()].map((client) => ({
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
  for (const client of room.clients.keys()) {
    if (client !== except && client.socket.readyState === 1) client.socket.send(text);
  }
}

// maxPayload keeps a compromised or buggy client from flooding the room.
const wss = new WebSocketServer({ port, host: process.env.HOST || '0.0.0.0', maxPayload: 64 * 1024 });

wss.on('connection', (socket) => {
  const client = { socket, userId: `pending-${Math.random().toString(36).slice(2)}`, username: 'Guest', roomName: null, mode: 'keyboard', bindings: {}, actorId: null, instanceId: null };
  let room = null;

  socket.on('message', (raw) => {
    try {
      const packet = JSON.parse(raw.toString());
      if (packet.type === 'hello') {
        if (room) room.clients.delete(client);
        client.userId = String(packet.userId || client.userId);
        client.username = String(packet.username || 'Guest').slice(0, 24);
        client.roomName = String(packet.room || 'default').slice(0, 64);
        room = rooms.get(client.roomName) || { clients: new Map() };
        rooms.set(client.roomName, room);
        room.clients.set(client, client);
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
        client.mode = ['keyboard', 'mouse', 'gamepad'].includes(packet.mode) ? packet.mode : client.mode;
        client.bindings = (packet.bindings && typeof packet.bindings === 'object' && !Array.isArray(packet.bindings)) ? packet.bindings : client.bindings;
        broadcast(room, { type: 'control', userId: client.userId, username: client.username, actorId: client.actorId, instanceId: client.instanceId, mode: client.mode, bindings: client.bindings }, client);
        broadcast(room, roomState(room));
        return;
      }
      // Unknown packet types are dropped. This is a strict room relay: it only
      // forwards the three guest session packet kinds above.
    } catch { /* ignore malformed packets */ }
  });

  socket.on('close', () => {
    if (!room) return;
    room.clients.delete(client);
    broadcast(room, roomState(room));
    if (!room.clients.size) rooms.delete(client.roomName);
  });
});

console.log(`SWF Forge game server listening on ws://0.0.0.0:${port}`);