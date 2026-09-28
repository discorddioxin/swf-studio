import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { CLOSE, createEngineServer, sanitizeBindings } from './engine-server.mjs';

let server;
afterEach(async () => { await server?.close(); server = undefined; });

function start(options = {}) {
  server = createEngineServer({ port: 0, host: '127.0.0.1', ...options });
  return new Promise((resolve) => server.wss.on('listening', () => resolve(server.wss.address().port)));
}

/** Connect and collect packets; resolves once open. */
function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.packets = [];
    ws.closed = new Promise((r) => ws.on('close', (code) => r(code)));
    ws.on('message', (data) => ws.packets.push(JSON.parse(String(data))));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

const until = async (predicate, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('condition not met in time');
};

const hello = (ws, userId, extra = {}) => ws.send(JSON.stringify({ type: 'hello', userId, username: userId, room: 'r1', ...extra }));

describe('room server', () => {
  it('relays chat with the server-side identity', async () => {
    const port = await start();
    const a = await connect(port); const b = await connect(port);
    hello(a, 'alice'); await until(() => a.packets.some((p) => p.type === 'room-state'));
    hello(b, 'bob'); await until(() => b.packets.some((p) => p.type === 'room-state' && p.count === 2));
    // Bob tries to spoof Alice in the payload: the relay uses Bob's id.
    b.send(JSON.stringify({ type: 'chat', userId: 'alice', username: 'alice', text: 'hi' }));
    const chat = await until(() => a.packets.find((p) => p.type === 'chat'));
    expect(chat.userId).toBe('bob');
    a.close(); b.close();
  });

  it('refuses a second connection claiming a live user id (impersonation)', async () => {
    const port = await start();
    const a = await connect(port); const intruder = await connect(port);
    hello(a, 'alice'); await until(() => a.packets.some((p) => p.type === 'room-state'));
    hello(intruder, 'alice');
    expect(await intruder.closed).toBe(CLOSE.userIdInUse);
    expect(intruder.packets[0]).toMatchObject({ type: 'error', code: 'user-id-in-use' });
    expect(server.rooms.get('r1').clients.size).toBe(1);
    a.close();
  });

  it('lets the same session (same private key) reconnect and replace its stale socket', async () => {
    const port = await start();
    const key = 'k'.repeat(32);
    const first = await connect(port);
    hello(first, 'alice', { key }); await until(() => first.packets.some((p) => p.type === 'room-state'));
    const again = await connect(port);
    hello(again, 'alice', { key }); await until(() => again.packets.some((p) => p.type === 'room-state'));
    expect(await first.closed).toBe(CLOSE.replaced);
    expect(server.rooms.get('r1').clients.size).toBe(1);
    const thief = await connect(port);
    hello(thief, 'alice', { key: 'x'.repeat(32) });
    expect(await thief.closed).toBe(CLOSE.userIdInUse);
    again.close();
  });

  it('requires the access token when ROOM_TOKEN is configured', async () => {
    const port = await start({ token: 's3cret' });
    const bad = await connect(port);
    hello(bad, 'eve', { token: 'nope' });
    expect(await bad.closed).toBe(CLOSE.unauthorized);
    const good = await connect(port);
    hello(good, 'alice', { token: 's3cret' });
    await until(() => good.packets.some((p) => p.type === 'room-state'));
    good.close();
  });

  it('enforces per-room, room-count and connection limits', async () => {
    const port = await start({ maxClientsPerRoom: 1, maxRooms: 1, maxConnections: 3 });
    const a = await connect(port);
    hello(a, 'a'); await until(() => a.packets.some((p) => p.type === 'room-state'));
    const b = await connect(port);
    hello(b, 'b');
    expect(await b.closed).toBe(CLOSE.roomFull);
    const c = await connect(port);
    hello(c, 'c', { room: 'other' });
    expect(await c.closed).toBe(CLOSE.tryAgainLater);
    const d = await connect(port); const e = await connect(port); const f = await connect(port);
    expect(await f.closed).toBe(CLOSE.tryAgainLater);
    a.close(); d.close(); e.close();
  });

  it('closes connections that never say hello', async () => {
    const port = await start({ helloTimeoutMs: 50 });
    const idle = await connect(port);
    expect(await idle.closed).toBe(CLOSE.helloTimeout);
  });

  it('rate-limits floods and eventually disconnects', async () => {
    const port = await start({ rateCapacity: 5, ratePerSecond: 1, maxDroppedMessages: 10 });
    const a = await connect(port); const b = await connect(port);
    hello(a, 'a'); hello(b, 'b');
    await until(() => a.packets.some((p) => p.type === 'room-state' && p.count === 2));
    for (let i = 0; i < 40; i++) b.send(JSON.stringify({ type: 'chat', text: `m${i}` }));
    expect(await b.closed).toBe(CLOSE.rateLimited);
    // Only the first few (bucket capacity minus the hello) were relayed.
    expect(a.packets.filter((p) => p.type === 'chat').length).toBeLessThanOrEqual(4);
    a.close();
  });

  it('bounds the bindings object', () => {
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, 'x'.repeat(100)]));
    const out = sanitizeBindings({ ...many, bad: 5 });
    expect(Object.keys(out)).toHaveLength(32);
    expect(Object.values(out).every((v) => v.length === 32)).toBe(true);
    expect(sanitizeBindings([1, 2], { keep: 'me' })).toEqual({ keep: 'me' });
  });
});
