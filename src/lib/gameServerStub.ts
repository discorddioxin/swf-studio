/**
 * Offline stand-in for Gaia Online's "Sushi" game server.
 *
 * The game (`com.rawfishsoftware.sushi.SushiAPI`, compiled into
 * bassken_game4.21.swf) talks to its game server over an `XMLSocket`. Offline
 * there is no server, so the games that need one (multiplayer Bass'ken Lake)
 * can never leave the "choose a game server" screen. This module implements the
 * server side of that socket in-process: it speaks the wire format the client
 * uses and keeps one test session with one test room so the game can be played
 * in the Execute tab.
 *
 * Wire format (from the client's own SushiAPI bytecode):
 *   - messages are terminated by `\x03` (`$e`), fields separated by `\x02` (`$d`)
 *   - the first field of every message is a numeric tag; the rest are fields
 *   - client → server tags observed so far:
 *       51  `searchMember`-style call: [51, callId, name]
 *       53  `joinSession`:              [53, sessionId, me.id, ?, ?, joinPayload]
 *       86  `sendObject`:               [86, routing, targetId, serialized]
 *   - server → client tags are dispatched by SushiAPI.$p; the definitions live
 *     in the escaped bytecode of the main SWF (see audits/GAIA_FISHING_INVESTIGATION.md).
 *
 * This file starts with the framing plus the connection handshake and the
 * session list, and grows as more of the protocol is recovered.
 */
import type { GameServerBackend, GameSocket } from '../engine/as2/player';

/** Field separator (`$d`) and message terminator (`$e`) used by the Sushi client. */
export const SUSHI_FIELD = '\u0002';
export const SUSHI_END = '\u0003';

export interface SushiMessage {
  /** Numeric message tag (first field). */
  tag: number;
  /** The remaining fields, decoded from the `\x02`-separated record. */
  fields: string[];
  /** The raw record (without the `\x03` terminator). */
  raw: string;
}

/** Split an incoming socket chunk into messages. Chunks may hold several
 *  messages and messages may be split across chunks, so a partial tail is kept. */
export class SushiDecoder {
  private buffer = '';

  push(chunk: string): SushiMessage[] {
    this.buffer += chunk;
    const out: SushiMessage[] = [];
    let end = this.buffer.indexOf(SUSHI_END);
    while (end >= 0) {
      const raw = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      const msg = decodeMessage(raw);
      if (msg) out.push(msg);
      end = this.buffer.indexOf(SUSHI_END);
    }
    return out;
  }
}

export function decodeMessage(raw: string): SushiMessage | null {
  if (!raw) return null;
  const fields = raw.split(SUSHI_FIELD);
  const tag = Number.parseInt(fields[0], 10);
  // Handshake records start with `S<revision>` and have no numeric tag.
  if (!Number.isFinite(tag)) return { tag: Number.NaN, fields, raw };
  return { tag, fields: fields.slice(1), raw };
}

export function encodeMessage(tag: number | string, ...fields: (string | number)[]): string {
  return [String(tag), ...fields.map((f) => String(f))].join(SUSHI_FIELD) + SUSHI_END;
}

/** The client's first message after `XMLSocket.connect` succeeded. */
export interface Handshake {
  /** e.g. `S55` — the client's protocol revision + delimiter. */
  banner: string;
  product: string;
  version: string;
  limit: string;
  subVersion: string;
  clientSpeed: string;
}

export function parseHandshake(raw: string): Handshake | null {
  const fields = raw.split(SUSHI_FIELD);
  if (!/^S\d+$/.test(fields[0] ?? '')) return null;
  return {
    banner: fields[0],
    product: fields[1] ?? '',
    version: fields[2] ?? '',
    limit: fields[3] ?? '',
    subVersion: fields[4] ?? '',
    clientSpeed: fields[5] ?? '',
  };
}

export interface TestRoom {
  id: number;
  name: string;
}

export interface TestSession {
  id: number;
  name: string;
  rooms: TestRoom[];
}

export interface GameServerOptions {
  host?: string;
  port?: number;
  session?: TestSession;
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

/** One player-visible test session with one test room. */
export const DEFAULT_TEST_SESSION: TestSession = {
  id: 1,
  name: 'Test Lake',
  rooms: [
    { id: 1, name: "Bass'ken Lake — Test Room" },
  ],
};

export class GameServerStub implements GameServerBackend {
  readonly host: string;
  readonly port: number;
  readonly session: TestSession;
  private readonly log: (level: 'info' | 'warn' | 'error', message: string) => void;
  private readonly decoders = new WeakMap<GameSocket, SushiDecoder>();
  /** Every message the client sent, for the Execute log / tests. */
  readonly received: SushiMessage[] = [];
  /** Every message sent back to the client, for the Execute log / tests. */
  readonly sent: string[] = [];

  constructor(opts: GameServerOptions = {}) {
    this.host = opts.host ?? '127.0.0.1';
    this.port = opts.port ?? 8080;
    this.session = opts.session ?? DEFAULT_TEST_SESSION;
    this.log = opts.log ?? (() => {});
  }

  connect(host: string, port: number, socket: GameSocket): void {
    this.decoders.set(socket, new SushiDecoder());
    this.log('info', `local test game server: accepted ${host}:${port} (session "${this.session.name}", room "${this.session.rooms[0]?.name ?? '-'}")`);
  }

  send(socket: GameSocket, data: string): void {
    const decoder = this.decoders.get(socket) ?? new SushiDecoder();
    this.decoders.set(socket, decoder);
    for (const msg of decoder.push(data)) {
      this.received.push(msg);
      if (Number.isNaN(msg.tag) && !parseHandshake(msg.raw)) {
        this.log('warn', `test server ← unknown record ${JSON.stringify(msg.raw.slice(0, 120))}`);
        continue;
      }
      if (!parseHandshake(msg.raw)) this.log('info', `test server ← [${msg.tag}] ${msg.fields.join(' | ').slice(0, 160)}`);
      const reply = this.respond(socket, msg);
      if (reply) this.deliver(socket, reply);
    }
  }

  close(socket: GameSocket): void {
    this.decoders.delete(socket);
    this.log('info', 'local test game server: client closed the connection');
  }

  /** Reply to a client message.
   *
   * Recovered from the client's own dispatcher (`SushiAPI.$p`):
   *   - the client's `2` is its hello; the server answers with tag `2`, which makes
   *     the client register the pending connect callback and ask for the session
   *     list (`29 <callId> <gameId>`) plus a latency probe (`3 <ms>`);
   *   - the client's `29` (loadSessionList) is answered with the call reply
   *     envelope `32 <callId> <status>`, where a falsy status runs the callback. */
  protected respond(_socket: GameSocket, msg: SushiMessage): string | null {
    const handshake = parseHandshake(msg.raw);
    if (handshake) {
      this.log('info', `test server ← handshake ${handshake.banner} (${handshake.product} ${handshake.version}, limit ${handshake.limit})`);
      return null;
    }
    switch (msg.tag) {
      case 2:
        // Client hello → server hello. (The client sends this immediately after
        // the handshake.)
        return encodeMessage(2);
      case 29: {
        // loadSessionList: remember the call so the reply can run its callback.
        const callId = msg.fields[0] ?? '0';
        this.sessionListCalls.add(callId);
        return encodeMessage(32, callId, 0);
      }
      case 3:
        // latency probe — nothing to answer
        return null;
      default:
        return null;
    }
  }

  /** Call ids that asked for the session list (to answer them with data first). */
  private readonly sessionListCalls = new Set<string>();

  /** Push a message to the client (through the socket's `onData`). */
  deliver(socket: GameSocket, message: string): void {
    this.sent.push(message);
    this.log('info', `test server → ${message.split(SUSHI_FIELD)[0]}`);
    socket.deliver(message);
  }
}

/** Create the stub used by the Execute tab (safe to share between players). */
export function createGameServerStub(log?: (level: 'info' | 'warn' | 'error', message: string) => void): GameServerStub {
  return new GameServerStub({ log });
}
