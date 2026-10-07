/**
 * Offline mock implementations for Gaia Online's "Sushi" multiuser socket
 * server (`SushiServer`) and unified HTTP + socket network layer (`MockServer`).
 *
 * The game (`com.rawfishsoftware.sushi.SushiAPI`, compiled into
 * `bassken_game4.21.swf`, plus `gsecs2.9.swf`) communicates with its backend
 * via:
 *   1. `GSItools.GSIGateway` (`http://www.gaiaonline.com/chat/gsi/gateway.php`)
 *      for server discovery (`50`), session check (`109`), user profile (`107`),
 *      captcha (`3009`), and abuse reporting (`1001`), plus `LoadVars`
 *      inventory requests.
 *   2. `XMLSocket` (`com.rawfishsoftware.sushi.SushiSocket`) for real-time
 *      sessions, rooms, members, chat, mobs, and the `"G_FISH_PLUGIN"` server
 *      plugin (`501` `loadGetData`, `500` `loadFishData`, `510` `savingGame`).
 *
 * Wire format (from `com.rawfishsoftware.sushi.Logger` and `SushiAPI.$p` in
 * `bassken_game4.21.swf`):
 *   - Messages are terminated by `\x03` (`$e`), fields separated by `\x02` (`$d`),
 *     nested array items separated by `\x01`, and team-limit pairs by `\x04`.
 *   - Client → server (`mess_out`):
 *       `2`  `clientSpeed(time)` (client hello after `S55` handshake)
 *       `3`  `netSpeed(time)`
 *       `4`  `receiveMyUpdates(value)`
 *       `6`  `meUpdate(myID, !data)`
 *       `10` `chatMessage(myID, routing, targetUserID, message)`
 *       `11` `removeMe(myID)`
 *       `14` `getMemberList(roomID)`
 *       `15` `mobSilentUpdate(mobID, !data)`
 *       `16` `sessionUpdate(!data)`
 *       `17` `sessionIndexUpdate($data)`
 *       `19` `callPlugin(callId, pluginID, !data)`
 *       `20` `changeRoom(callId, myID, roomID, password, !data)`
 *       `22` `createRoom(callId, myID, password, name, roomTemplate, !clientIdList)`
 *       `25` `createMob(mobID, roomID, delete, !data)`
 *       `26` `mobUpdate(mobID, !data)`
 *       `27` `removeMob(mobID)`
 *       `28` `leaveSession("")`
 *       `29` `loadSessionList(callId, game)`
 *       `31` `meSilentUpdate(myID, !data)`
 *       `36` `changeName(callId, myID, newName)`
 *       `38` `roomUpdate(roomID, !data)`
 *       `39` `lockRoom(roomID, lock)`
 *       `40` `teamUpdate(teamID, !data)`
 *       `41` `mobIndexUpdateEval(mobID, %data)`
 *       `42` `changeTeam(callId, userID, oldTeamID, newTeamID)`
 *       `45` `joinSession(callId, sessionID, teamID, roomID, password, name, spectator, !data)`
 *       `47` `initMob(mobID, roomID, delete, !data)`
 *       `48` `beSpectator(callId, value)`
 *       `51` `searchClient(callId, !names)`
 *       `53` `userMessage(messageID, "", routing, targetID, !data)`
 *       `54` `meIndexUpdate(myID, $data)`
 *       `57` `isBadword(callId, word)`
 *       `58` `roomIndexUpdateEval(roomID, %data)`
 *       `59` `sessionIndexUpdateEval(%data)`
 *       `60` `mobIndexUpdate(mobID, $data)`
 *       `64` `in/excludeMember(memberID, value)`
 *       `74` `teamIndexUpdate(teamID, $data)`
 *       `75` `roomIndexUpdate(roomID, $data)`
 *       `86` `sendObject(routing, targetID, object)`
 *       `87` `enableLogging(value)`
 *   - Server → client (`mess_in`):
 *       `1`  `idMessage(ID)`
 *       `2`  `serverReady` (invokes `sushiConnectCB(0)`)
 *       `5`  `newMember(ID, name, teamID, roomID, platform, !data)`
 *       `6`  `memberUpdate(ID, !data)`
 *       `8`  `masterClient`
 *       `9`  `slaveClient`
 *       `10` `chatMessage(senderID, routing, "", message)`
 *       `11` `removeMember(ID, teamID, roomID)`
 *       `16` `sessionUpdate(!data)`
 *       `17` `sessionIndexUpdate($data)`
 *       `19` `pluginAnswer(callId, pluginID, !data)`
 *       `21` `changeRoom(ID, newRoomID, oldRoomID, !data)`
 *       `23` `removeRoom(roomID)`
 *       `25` `newMob(mobID, roomID, creatorID, !data)`
 *       `26` `mobUpdate(mobID, !data)`
 *       `27` `removeMob(mobID)`
 *       `30` `newRoom(roomID, password, name, teamLimits, !data)`
 *       `32` `callback(callId, status, ...extra)`
 *       `33` `bulkMemberList`
 *       `35` `bulkRoomList`
 *       `36` `memberNameChanged(memberID, newName)`
 *       `38` `roomUpdate(roomID, !data)`
 *       `39` `lockRoom(roomID, value)`
 *       `43` `changeTeam(userID, oldTeamID, newTeamID)`
 *       `44` `loadSessionListAnswer`
 *       `49` `beSpectator(value)`
 *       `52` `memberSearchResult(callId, !resultList)`
 *       `53` `userMessage(messageID, "", routing, targetID, !data)`
 *       `54` `memberIndexUpdate(memberID, $data)`
 *       `57` `isBadwordAnswer(callId, result)`
 *       `60` `mobIndexUpdate(mobID, $data)`
 *       `75` `roomIndexUpdate(roomID, $data)`
 *       `86` `sendObject(routing, targetID, object)`
 */
import type { GameSocket } from '../engine/as2/player';
import type { NetworkEvent, NetworkObserver } from '../engine/flash/player';
import {
  GSI_SERVER_LIST,
  gsiInventoryResponse,
  isGsiUrl,
  parseGatewayRequest,
  phpSerialize,
  type GsiStubLogger,
  type PhpValue,
} from './gsiStub';
import type {
  FishPluginState,
  GsiUserData,
  Handshake,
  MockMember,
  MockRoom,
  MockServerEntry,
  MockServerInterface,
  MockSession,
  SushiMessage,
  SushiPluginInterface,
  SushiServerInterface,
} from './mockNetwork';

export type {
  FishPluginState,
  GsiUserData,
  Handshake,
  MockMember,
  MockRoom,
  MockServerEntry,
  MockServerInterface,
  MockSession,
  SushiMessage,
  SushiPluginInterface,
  SushiServerInterface,
};

/** Field separator (`$d`) and message terminator (`$e`) used by the Sushi client. */
export const SUSHI_FIELD = '\u0002';
export const SUSHI_END = '\u0003';

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

export type TestRoom = MockRoom;
export type TestSession = MockSession;

export interface GameServerOptions {
  host?: string;
  port?: number;
  session?: MockSession;
  fishState?: Partial<FishPluginState>;
  plugins?: SushiPluginInterface[];
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

/** Default mock rooms: Lobby (`1`) plus two active multiplayer fishing rooms (`2`, `3`). */
export const DEFAULT_MOCK_ROOMS: MockRoom[] = [
  {
    id: 1,
    name: 'Lobby',
    templateId: 0,
    locked: false,
    hasPassword: false,
    maxMembers: 200,
    teamLimits: '0\u0004200',
    waitingQueue: [],
    memberIds: [],
    mobs: [],
    data: [],
  },
  {
    id: 2,
    name: "dracogenius's Room|10001",
    templateId: 0,
    locked: false,
    hasPassword: false,
    maxMembers: 6,
    teamLimits: '0\u00046',
    waitingQueue: [],
    memberIds: [2],
    mobs: [],
    data: [],
  },
  {
    id: 3,
    name: "Princess Lethe's Room|10002",
    templateId: 0,
    locked: false,
    hasPassword: false,
    maxMembers: 6,
    teamLimits: '0\u00046',
    waitingQueue: [],
    memberIds: [3, 4, 5, 6, 7],
    mobs: [],
    data: [],
  },
];

/** Default mock NPC anglers populating rooms `2` (`1/6`) and `3` (`5/6`). */
export const DEFAULT_MOCK_MEMBERS: MockMember[] = [
  {
    id: 2,
    name: 'dracogenius',
    roomId: 2,
    teamId: 0,
    spectator: false,
    platform: 'FLASH',
    data: ['', 1, 1, 180, 150, 1, 'baita', 0, 0],
  },
  {
    id: 3,
    name: 'Princess Lethe',
    roomId: 3,
    teamId: 0,
    spectator: false,
    platform: 'FLASH',
    data: ['', 1, 1, 180, 150, 1, 'baita', 0, 0],
  },
  {
    id: 4,
    name: 'kuro_neko',
    roomId: 3,
    teamId: 0,
    spectator: false,
    platform: 'FLASH',
    data: ['', 2, 1, 190, 150, 1, 'baita', 0, 0],
  },
  {
    id: 5,
    name: 'starfisher',
    roomId: 3,
    teamId: 0,
    spectator: false,
    platform: 'FLASH',
    data: ['', 3, 1, 200, 150, 1, 'baita', 0, 0],
  },
  {
    id: 6,
    name: 'lake_spirit',
    roomId: 3,
    teamId: 0,
    spectator: false,
    platform: 'FLASH',
    data: ['', 4, 1, 210, 150, 1, 'baita', 0, 0],
  },
  {
    id: 7,
    name: 'bass_master',
    roomId: 3,
    teamId: 0,
    spectator: false,
    platform: 'FLASH',
    data: ['', 5, 1, 220, 150, 1, 'baita', 0, 0],
  },
];

/** Default fishing plugin state matching the reference recording (`Grade A=95, D=0, F=2`). */
export const DEFAULT_FISH_PLUGIN_STATE: FishPluginState = {
  baitA: 95,
  baitD: 0,
  baitF: 2,
  rods: ['2525', '2523', '2527', '2529'],
  timeOfDay: 0,
};

/** One player-visible test session with lobby + two active fishing rooms. */
export const DEFAULT_TEST_SESSION: MockSession = {
  id: 1,
  name: 'fishing',
  version: '1.0',
  teamId: 0,
  teamName: 'default',
  teamLimit: 6,
  maxMembers: 200,
  rooms: DEFAULT_MOCK_ROOMS,
  members: DEFAULT_MOCK_MEMBERS,
  data: [],
};

/**
 * Server-side `"G_FISH_PLUGIN"` implementation for `bassken_game4.21.swf`.
 *
 * Handles:
 * - `501` (`loadGetData`): returns bait counts (`100003:A|100002:D|100001:F`),
 *   unlocked rod IDs (`2525|2523|2527|2529`), and lake time-of-day (`0`).
 * - `500` (`loadFishData`): decrements the selected bait and returns the
 *   pre-computed MD5 validation tokens (`sid2`, `sid3`) verified by
 *   `calcMD5` in `bassken_game4.21.swf`.
 * - `510` (`savingGame`): acknowledges fish/catch persistence.
 */
export class FishPlugin implements SushiPluginInterface {
  readonly pluginId: string;
  readonly state: FishPluginState;

  constructor(state: Partial<FishPluginState> = {}, pluginId = 'G_FISH_PLUGIN') {
    this.pluginId = pluginId;
    this.state = {
      baitA: state.baitA ?? DEFAULT_FISH_PLUGIN_STATE.baitA,
      baitD: state.baitD ?? DEFAULT_FISH_PLUGIN_STATE.baitD,
      baitF: state.baitF ?? DEFAULT_FISH_PLUGIN_STATE.baitF,
      rods: state.rods ? [...state.rods] : [...DEFAULT_FISH_PLUGIN_STATE.rods],
      timeOfDay: state.timeOfDay ?? DEFAULT_FISH_PLUGIN_STATE.timeOfDay,
    };
  }

  reset(state: Partial<FishPluginState> = {}): void {
    this.state.baitA = state.baitA ?? DEFAULT_FISH_PLUGIN_STATE.baitA;
    this.state.baitD = state.baitD ?? DEFAULT_FISH_PLUGIN_STATE.baitD;
    this.state.baitF = state.baitF ?? DEFAULT_FISH_PLUGIN_STATE.baitF;
    this.state.rods.splice(0, this.state.rods.length, ...(state.rods ? [...state.rods] : [...DEFAULT_FISH_PLUGIN_STATE.rods]));
    this.state.timeOfDay = state.timeOfDay ?? DEFAULT_FISH_PLUGIN_STATE.timeOfDay;
  }

  handleCall(_callId: string, subOp: string, params: string[]): string {
    if (subOp === '501') {
      const baits = `100003:${this.state.baitA}|100002:${this.state.baitD}|100001:${this.state.baitF}`;
      const rods = this.state.rods.join('|');
      return `501\u0001\u0005\u0001${baits}\u0001${rods}\u0001${this.state.timeOfDay}`;
    }
    if (subOp === '500') {
      const baitItemId = params[0] ?? '100003';
      if (baitItemId === '100003' && this.state.baitA > 0) this.state.baitA--;
      else if (baitItemId === '100002' && this.state.baitD > 0) this.state.baitD--;
      else if (baitItemId === '100001' && this.state.baitF > 0) this.state.baitF--;
      // MD5 hashes verified by `calcMD5(sid + baitItemId + "s3cr3t")` and
      // `calcMD5(sid2 + "2" + "s3cr3t")` in `bassken_game4.21.swf`
      const sid2 = baitItemId === '100003'
        ? 'c90b2f8da134c0889936adec6466d290'
        : baitItemId === '100002'
          ? '2d4c488e581879c8bfc0664c35cb2ccc'
          : '0bec1093f7a3de5a1fb0481a90c72387';
      const sid3 = 'c56b5ba08a469081f0032cc04ebd562b';
      return `500\u0001\u0005\u0001${sid2}\u0001${sid3}\u00010`;
    }
    if (subOp === '510') {
      return '510\u0001\u0005\u00010';
    }
    return `${subOp}\u0001\u0005\u00010`;
  }
}

function cloneRoom(r: MockRoom): MockRoom {
  return {
    id: r.id,
    name: r.name,
    templateId: r.templateId ?? 0,
    locked: r.locked ?? false,
    hasPassword: r.hasPassword ?? false,
    password: r.password,
    maxMembers: r.maxMembers ?? (r.id === 1 ? 200 : 6),
    teamLimits: r.teamLimits ?? (r.id === 1 ? '0\u0004200' : '0\u00046'),
    waitingQueue: r.waitingQueue ? [...r.waitingQueue] : [],
    memberIds: r.memberIds ? [...r.memberIds] : [],
    mobs: r.mobs ? [...r.mobs] : [],
    data: r.data ? [...r.data] : [],
  };
}

function cloneMember(m: MockMember): MockMember {
  return {
    id: m.id,
    name: m.name,
    roomId: m.roomId,
    teamId: m.teamId,
    spectator: m.spectator,
    platform: m.platform,
    data: [...m.data],
  };
}

function cloneSession(session: MockSession): MockSession {
  return {
    ...session,
    rooms: (session.rooms ?? []).map(cloneRoom),
    members: (session.members ?? []).map(cloneMember),
    data: session.data ? [...session.data] : [],
  };
}

/**
 * In-process implementation of the Rawfish `SushiServer` (`com.rawfishsoftware.sushi.*`).
 *
 * Manages mock sessions, rooms, members, mobs, chat, and server plugins without
 * opening any real network sockets.
 */
export class SushiServer implements SushiServerInterface {
  readonly host: string;
  readonly port: number;
  readonly session: MockSession;
  readonly fishPlugin: FishPlugin;
  protected readonly log: (level: 'info' | 'warn' | 'error', message: string) => void;
  private readonly initialSession: MockSession;
  private readonly initialFishState: Partial<FishPluginState>;
  protected decoders = new WeakMap<GameSocket, SushiDecoder>();
  protected socketLogs = new WeakMap<GameSocket, (level: 'info' | 'warn' | 'error', message: string) => void>();
  protected socketNetwork = new WeakMap<GameSocket, NetworkObserver>();
  protected readonly plugins = new Map<string, SushiPluginInterface>();
  protected readonly mobs = new Map<string, { id: string; roomId: number; data: string[] }>();
  /** Every message the client sent, for the Execute log / tests. */
  readonly received: SushiMessage[] = [];
  /** Every message sent back to the client, for the Execute log / tests. */
  readonly sent: string[] = [];
  private nextRoomId: number;
  private nextSocketRequestId = 1;

  constructor(opts: GameServerOptions = {}) {
    this.host = opts.host ?? '127.0.0.1';
    this.port = opts.port ?? 8080;
    const baseSession = cloneSession(opts.session ?? DEFAULT_TEST_SESSION);
    this.initialSession = cloneSession(baseSession);
    this.session = cloneSession(this.initialSession);
    this.initialFishState = {
      ...opts.fishState,
      ...(opts.fishState?.rods ? { rods: [...opts.fishState.rods] } : {}),
    };
    this.nextRoomId = Math.max(3, ...this.session.rooms.map((r) => r.id)) + 1;
    this.fishPlugin = new FishPlugin(this.initialFishState);
    this.registerPlugin(this.fishPlugin);
    this.plugins.set('fish', this.fishPlugin);
    for (const plugin of opts.plugins ?? []) {
      this.registerPlugin(plugin);
    }
    this.log = opts.log ?? (() => {});
  }

  get fishState(): FishPluginState {
    return this.fishPlugin.state;
  }

  reset(): void {
    Object.assign(this.session, cloneSession(this.initialSession));
    this.fishPlugin.reset(this.initialFishState);
    this.decoders = new WeakMap<GameSocket, SushiDecoder>();
    this.socketLogs = new WeakMap<GameSocket, (level: 'info' | 'warn' | 'error', message: string) => void>();
    this.socketNetwork = new WeakMap<GameSocket, NetworkObserver>();
    this.nextSocketRequestId = 1;
    this.mobs.clear();
    this.received.length = 0;
    this.sent.length = 0;
    this.nextRoomId = Math.max(3, ...this.session.rooms.map((room) => room.id)) + 1;
  }

  registerPlugin(plugin: SushiPluginInterface): void {
    this.plugins.set(plugin.pluginId, plugin);
  }

  getRooms(): MockRoom[] {
    return this.session.rooms;
  }

  getRoom(roomId: number): MockRoom | undefined {
    return this.session.rooms.find((r) => r.id === roomId);
  }

  getMembers(): MockMember[] {
    return this.session.members ?? [];
  }

  getMember(memberId: number): MockMember | undefined {
    return (this.session.members ?? []).find((m) => m.id === memberId);
  }

  protected logSocket(socket: GameSocket, level: 'info' | 'warn' | 'error', message: string): void {
    (this.socketLogs.get(socket) ?? this.log)(level, message);
  }

  protected recordSocketNetwork(socket: GameSocket, event: NetworkEvent): void {
    this.socketNetwork.get(socket)?.(event);
  }

  connect(
    host: string,
    port: number,
    socket: GameSocket,
    log?: (level: 'info' | 'warn' | 'error', message: string) => void,
    onNetwork?: NetworkObserver,
  ): void {
    this.decoders.set(socket, new SushiDecoder());
    if (log) this.socketLogs.set(socket, log);
    if (onNetwork) this.socketNetwork.set(socket, onNetwork);
    const url = `${host}:${port}`;
    const requestId = `socket-${this.nextSocketRequestId++}`;
    this.recordSocketNetwork(socket, { kind: 'request', transport: 'xmlsocket', direction: 'outgoing', requestId, method: 'CONNECT', url, status: 'sent' });
    this.recordSocketNetwork(socket, { kind: 'response', transport: 'xmlsocket', direction: 'incoming', requestId, method: 'CONNECT', url, status: 'mocked', message: 'Local mock server accepted the XMLSocket connection.' });
    this.logSocket(
      socket,
      'info',
      `local test game server: accepted ${host}:${port} (session "${this.session.name}", room "${this.session.rooms[1]?.name ?? this.session.rooms[0]?.name ?? '-'}")`,
    );
  }

  send(socket: GameSocket, data: string): void {
    const decoder = this.decoders.get(socket) ?? new SushiDecoder();
    this.decoders.set(socket, decoder);
    for (const msg of decoder.push(data)) {
      this.received.push(msg);
      const requestId = `socket-${this.nextSocketRequestId++}`;
      const method = Number.isNaN(msg.tag) ? 'handshake' : `message ${msg.tag}`;
      this.recordSocketNetwork(socket, {
        kind: 'request', transport: 'xmlsocket', direction: 'outgoing', requestId,
        method, url: `${socket.host}:${socket.port}`, status: 'sent', payload: msg.raw,
      });
      if (Number.isNaN(msg.tag) && !parseHandshake(msg.raw)) {
        this.logSocket(socket, 'warn', `test server ← unknown record ${JSON.stringify(msg.raw.slice(0, 120))}`);
        continue;
      }
      if (!parseHandshake(msg.raw)) {
        this.logSocket(socket, 'info', `test server ← [${msg.tag}] ${msg.fields.join(' | ').slice(0, 160)}`);
      }
      const reply = this.respond(socket, msg);
      if (reply) this.deliver(socket, reply, requestId);
    }
  }

  close(socket: GameSocket): void {
    this.decoders.delete(socket);
    this.logSocket(socket, 'info', 'local test game server: client closed the connection');
    this.socketLogs.delete(socket);
    this.socketNetwork.delete(socket);
  }

  /** Reply to a client message (`SushiAPI.$p` protocol). */
  protected respond(socket: GameSocket, msg: SushiMessage): string | null {
    const handshake = parseHandshake(msg.raw);
    if (handshake) {
      this.logSocket(
        socket,
        'info',
        `test server ← handshake ${handshake.banner} (${handshake.product} ${handshake.version}, limit ${handshake.limit})`,
      );
      return null;
    }
    switch (msg.tag) {
      case 2:
        // Client hello (`clientSpeed`) → assign member id 1 (`1\x021`) + server ready (`2`).
        return encodeMessage(1, 1) + encodeMessage(2);

      case 29: {
        // loadSessionList(callId, gameName) → reply with opcode 44
        const callId = msg.fields[0] ?? '0';
        const gameName = msg.fields[1] || this.session.name;
        this.session.name = gameName;
        return encodeMessage(
          44,
          callId,
          this.session.id,
          gameName,
          this.session.version ?? '1.0',
          this.session.teamId ?? 0,
          this.session.teamName ?? 'default',
          this.session.teamLimit ?? 6,
          this.session.maxMembers ?? 200,
          '\u0001',
          '',
          '\u0001',
        );
      }

      case 3: // netSpeed
      case 4: // receiveMyUpdates
      case 87: // enableLogging
        return null;

      case 6: // meUpdate(myId, ...data)
      case 31: { // meSilentUpdate(myId, ...data)
        const memberId = Number.parseInt(msg.fields[0] ?? '1', 10);
        const data = msg.fields.slice(1);
        const member = this.getMember(memberId);
        if (member) member.data = data;
        return null;
      }

      case 54: {
        // meIndexUpdate(myId, index0, val0, index1, val1, ...)
        const memberId = Number.parseInt(msg.fields[0] ?? '1', 10);
        const member = this.getMember(memberId);
        if (member) {
          for (let i = 1; i + 1 < msg.fields.length; i += 2) {
            const idx = Number.parseInt(msg.fields[i], 10);
            if (Number.isFinite(idx) && idx >= 0) {
              member.data[idx] = msg.fields[i + 1];
            }
          }
        }
        return null;
      }

      case 10: {
        // chatMessage: [myId, routing, targetUserId, message] → broadcast [10, senderId, routing, targetUserId, message]
        const [myId = '1', routing = '1', targetId = '0', text = ''] = msg.fields;
        return encodeMessage(10, myId, routing, targetId, text);
      }

      case 11: // removeMe(myId)
      case 28: { // leaveSession
        const memberId = Number.parseInt(msg.fields[0] || '1', 10);
        const member = this.getMember(memberId);
        if (member) {
          const room = this.getRoom(member.roomId);
          if (room?.memberIds) {
            room.memberIds = room.memberIds.filter((id) => id !== memberId);
          }
        }
        return null;
      }

      case 14: {
        // getMemberList(roomId)
        const roomId = Number.parseInt(msg.fields[0] ?? '0', 10);
        const members = this.getMembers().filter((m) => !roomId || m.roomId === roomId);
        const memberFields: (string | number)[] = [];
        for (const m of members) {
          memberFields.push(m.teamId, m.roomId, m.spectator ? 1 : 0, m.id, m.name, m.platform);
        }
        return encodeMessage(33, ...memberFields);
      }

      case 16: {
        // sessionUpdate(...data)
        this.session.data = msg.fields.slice();
        return encodeMessage(16, ...msg.fields);
      }

      case 17:
      case 59: {
        // sessionIndexUpdate / sessionIndexUpdateEval
        this.session.data ??= [];
        for (let i = 0; i + 1 < msg.fields.length; i += 2) {
          const idx = Number.parseInt(msg.fields[i], 10);
          if (Number.isFinite(idx) && idx >= 0) {
            this.session.data[idx] = msg.fields[i + 1];
          }
        }
        return encodeMessage(17, ...msg.fields);
      }

      case 45: {
        // joinSession: [callId, sessionId, teamId, roomId, password, name, ...data]
        const callId = msg.fields[0] ?? '0';
        const teamId = Number.parseInt(msg.fields[2] ?? '0', 10) || 0;
        const roomId = Number.parseInt(msg.fields[3] ?? '1', 10) || 1;
        const playerName = msg.fields[5] || 'GaiaPlayer';
        const initData = msg.fields.slice(6);

        // Register or update local player (memberId = 1)
        const members = (this.session.members ??= []);
        let me = members.find((m) => m.id === 1);
        if (!me) {
          me = {
            id: 1,
            name: playerName,
            roomId,
            teamId,
            spectator: false,
            platform: 'FLASH',
            data: initData,
          };
          members.unshift(me);
        } else {
          me.name = playerName;
          me.roomId = roomId;
          me.teamId = teamId;
          if (initData.length > 0) me.data = initData;
        }
        const startRoom = this.getRoom(roomId);
        if (startRoom) {
          startRoom.memberIds ??= [];
          if (!startRoom.memberIds.includes(1)) startRoom.memberIds.push(1);
        }

        // Build bulk room list (opcode 35)
        const roomFields: (string | number)[] = [];
        for (const r of this.session.rooms) {
          const limit = r.teamLimits ?? (r.id === 1 ? '0\u0004200' : '0\u00046');
          const locked = r.locked ? 1 : 0;
          const hasPw = r.hasPassword ? 1 : 0;
          const roomData = r.data?.length ? r.data.join('\u0001') : '\u0001';
          roomFields.push(r.id, r.templateId ?? 0, locked, hasPw, r.name, 0, limit, roomData);
        }

        // Build bulk member list (opcode 33) and initial member data packets (opcode 6)
        const memberFields: (string | number)[] = [];
        let memberUpdates = '';
        for (const m of members) {
          if (m.id === 1) continue;
          memberFields.push(m.teamId, m.roomId, m.spectator ? 1 : 0, m.id, m.name, m.platform);
          if (m.data.length > 0) {
            memberUpdates += encodeMessage(6, m.id, ...m.data);
          }
        }

        return (
          encodeMessage(35, ...roomFields)
          + encodeMessage(33, ...memberFields)
          + encodeMessage(32, callId, 0)
          + memberUpdates
        );
      }

      case 20: {
        // changeRoom: [callId, myId, roomId, password, ...data]
        const callId = msg.fields[0] ?? '0';
        const memberId = Number.parseInt(msg.fields[1] ?? '1', 10) || 1;
        const targetRoomId = Number.parseInt(msg.fields[2] ?? '1', 10) || 1;
        const password = msg.fields[3] ?? '';
        const data = msg.fields.slice(4);

        const targetRoom = this.getRoom(targetRoomId);
        if (!targetRoom) {
          return encodeMessage(32, callId, 7); // "room doesn't exist"
        }
        if (targetRoom.locked) {
          return encodeMessage(32, callId, 6); // "user is not allowed to enter room"
        }
        if (targetRoom.hasPassword && targetRoom.password && targetRoom.password !== password) {
          return encodeMessage(32, callId, 14); // "wrong password"
        }

        for (const r of this.session.rooms) {
          if (r.memberIds) {
            r.memberIds = r.memberIds.filter((id) => id !== memberId);
          }
        }
        targetRoom.memberIds ??= [];
        if (!targetRoom.memberIds.includes(memberId)) {
          targetRoom.memberIds.push(memberId);
        }

        const member = this.getMember(memberId);
        if (member) {
          member.roomId = targetRoomId;
          if (data.length > 0) member.data = data;
        }

        return encodeMessage(32, callId, 0) + encodeMessage(8);
      }

      case 22: {
        // createRoom: [callId, myId, password, roomName, templateName, ...]
        const callId = msg.fields[0] ?? '0';
        const password = msg.fields[2] ?? '';
        const roomName = msg.fields[3] || `Room ${this.nextRoomId}|10002`;
        const roomId = this.nextRoomId++;
        const hasPassword = password.length > 0;
        const newRoom: MockRoom = {
          id: roomId,
          name: roomName,
          templateId: 0,
          locked: false,
          hasPassword,
          password: hasPassword ? password : undefined,
          maxMembers: 6,
          teamLimits: '0\u00046',
          waitingQueue: [],
          memberIds: [],
          mobs: [],
          data: [],
        };
        this.session.rooms.push(newRoom);
        return (
          encodeMessage(30, roomId, hasPassword ? 1 : 0, roomName, newRoom.teamLimits ?? '0\u00046')
          + encodeMessage(32, callId, 0, roomId)
        );
      }

      case 36: {
        // changeName: [callId, myId, newName]
        const callId = msg.fields[0] ?? '0';
        const memberId = Number.parseInt(msg.fields[1] ?? '1', 10) || 1;
        const newName = msg.fields[2] ?? 'GaiaPlayer';
        const member = this.getMember(memberId);
        if (member) member.name = newName;
        return encodeMessage(32, callId, 0) + encodeMessage(36, memberId, newName);
      }

      case 38: {
        // roomUpdate: [roomId, ...data]
        const roomId = Number.parseInt(msg.fields[0] ?? '0', 10);
        const data = msg.fields.slice(1);
        const room = this.getRoom(roomId);
        if (room) room.data = data;
        return encodeMessage(38, roomId, ...data);
      }

      case 39: {
        // lockRoom: [roomId, lockFlag]
        const roomId = Number.parseInt(msg.fields[0] ?? '0', 10);
        const lockFlag = msg.fields[1] ?? '0';
        const room = this.getRoom(roomId);
        if (room) room.locked = lockFlag === '1' || lockFlag === 'true';
        return encodeMessage(39, roomId, room?.locked ? 1 : 0);
      }

      case 58:
      case 75: {
        // roomIndexUpdateEval / roomIndexUpdate: [roomId, idx0, val0, ...]
        const roomId = Number.parseInt(msg.fields[0] ?? '0', 10);
        const room = this.getRoom(roomId);
        if (room) {
          room.data ??= [];
          for (let i = 1; i + 1 < msg.fields.length; i += 2) {
            const idx = Number.parseInt(msg.fields[i], 10);
            if (Number.isFinite(idx) && idx >= 0) {
              room.data[idx] = msg.fields[i + 1];
            }
          }
        }
        return encodeMessage(75, ...msg.fields);
      }

      case 42: {
        // changeTeam: [callId, userId, oldTeamId, newTeamId]
        const callId = msg.fields[0] ?? '0';
        const memberId = Number.parseInt(msg.fields[1] ?? '1', 10) || 1;
        const oldTeamId = Number.parseInt(msg.fields[2] ?? '0', 10) || 0;
        const newTeamId = Number.parseInt(msg.fields[3] ?? '0', 10) || 0;
        const member = this.getMember(memberId);
        if (member) member.teamId = newTeamId;
        return encodeMessage(32, callId, 0) + encodeMessage(43, memberId, oldTeamId, newTeamId);
      }

      case 48: {
        // beSpectator: [callId, status]
        const callId = msg.fields[0] ?? '0';
        const status = msg.fields[1] === '1' || msg.fields[1] === 'true';
        const me = this.getMember(1);
        if (me) me.spectator = status;
        return encodeMessage(32, callId, 0) + encodeMessage(49, status ? 1 : 0);
      }

      case 25:
      case 47: {
        // createMob / initMob: [mobId, roomId, creatorId, deleteOnExit, ...data]
        const [mobId = '1m0', roomIdStr = '1', creatorId = '1', _del = '1', ...data] = msg.fields;
        const roomId = Number.parseInt(roomIdStr, 10) || 1;
        this.mobs.set(mobId, { id: mobId, roomId, data });
        const room = this.getRoom(roomId);
        if (room) {
          room.mobs ??= [];
          if (!room.mobs.includes(mobId)) room.mobs.push(mobId);
        }
        return encodeMessage(25, mobId, roomId, creatorId, ...data);
      }

      case 15:
      case 26: {
        // mobSilentUpdate / mobUpdate: [mobId, ...data]
        const [mobId = '', ...data] = msg.fields;
        const mob = this.mobs.get(mobId);
        if (mob) mob.data = data;
        return msg.tag === 26 ? encodeMessage(26, mobId, ...data) : null;
      }

      case 27: {
        // removeMob: [mobId]
        const mobId = msg.fields[0] ?? '';
        const mob = this.mobs.get(mobId);
        if (mob) {
          const room = this.getRoom(mob.roomId);
          if (room?.mobs) room.mobs = room.mobs.filter((id) => id !== mobId);
          this.mobs.delete(mobId);
        }
        return encodeMessage(27, mobId);
      }

      case 57: {
        // isBadword: [callId, word] → [57, callId, 0]
        const callId = msg.fields[0] ?? '0';
        return encodeMessage(57, callId, 0);
      }

      case 19: {
        // callPlugin: [callId, pluginId, subOp, ...params]
        const callId = msg.fields[0] ?? '0';
        const pluginId = msg.fields[1] ?? 'G_FISH_PLUGIN';
        const subOp = msg.fields[2] ?? '501';
        const params = msg.fields.slice(3);
        const plugin = this.plugins.get(pluginId) ?? this.fishPlugin;
        const payload = plugin.handleCall(callId, subOp, params);
        return encodeMessage(19, callId, pluginId, payload);
      }

      case 51: {
        // searchClient: [callId, ...names] → [52, callId, ...foundRoomIds]
        const callId = msg.fields[0] ?? '0';
        const query = (msg.fields[1] ?? '').toLowerCase();
        const match = this.getMembers().find((m) => m.name.toLowerCase() === query);
        return encodeMessage(52, callId, match ? match.roomId : 0);
      }

      case 53: {
        // userMessage: [messageId, "", routing, targetId, ...data]
        return encodeMessage(53, ...msg.fields);
      }

      case 86: {
        // sendObject: [routing, targetId, serialized]
        const callId = msg.fields[0] ?? '0';
        return encodeMessage(32, callId, 0);
      }

      default:
        return null;
    }
  }

  /** Push a message to the client (through the socket's `onData`). */
  deliver(socket: GameSocket, message: string, requestId?: string): void {
    this.sent.push(message);
    const decoded = new SushiDecoder().push(message);
    for (const response of decoded) {
      this.recordSocketNetwork(socket, {
        kind: 'response', transport: 'xmlsocket', direction: 'incoming', requestId,
        method: Number.isNaN(response.tag) ? 'handshake' : `message ${response.tag}`,
        url: `${socket.host}:${socket.port}`, status: 'mocked', payload: response.raw,
      });
    }
    this.logSocket(socket, 'info', `test server → ${message.split(SUSHI_FIELD)[0]}`);
    socket.deliver(message);
  }
}

/** Backward-compatible alias for `SushiServer`. */
export class GameServerStub extends SushiServer {}

export interface MockServerOptions extends GameServerOptions {
  servers?: MockServerEntry[];
  userData?: Partial<GsiUserData>;
}

export const DEFAULT_GSI_USER_DATA: GsiUserData = {
  gaiaSID: 'gaiafishing_guest',
  gaia_id: 10002,
  username: 'GaiaPlayer',
  avatar: 'avatar_1',
  user_level: 2,
  filter_level: 0,
  user_active: 1,
};

/**
 * Unified mock server implementing both the HTTP/GSI gateway (`fetchText`,
 * `handleGsiMethod`) and the Rawfish `SushiServer` socket server (`connect`,
 * `send`, `close`).
 *
 * Ensures zero external connections are made while providing full server,
 * room, member, inventory, and fishing plugin functionality.
 */
export class MockServer implements MockServerInterface {
  readonly servers: MockServerEntry[];
  readonly userData: GsiUserData;
  readonly sushiServer: SushiServer;
  private requestSequence = 0;

  constructor(opts: MockServerOptions = {}) {
    this.servers = opts.servers ? opts.servers.map((s) => ({ ...s })) : GSI_SERVER_LIST.map((s) => ({ ...s }));
    this.userData = {
      ...DEFAULT_GSI_USER_DATA,
      ...opts.userData,
    };
    this.sushiServer = new SushiServer(opts);
  }

  getRooms(): MockRoom[] {
    return this.sushiServer.getRooms();
  }

  getMembers(): MockMember[] {
    return this.sushiServer.getMembers();
  }

  reset(): void {
    this.sushiServer.reset();
    this.requestSequence = 0;
  }

  handleGsiMethod(method: string, _params?: unknown): PhpValue {
    switch (method) {
      case '50':
        return this.servers.map((s) => ({ ip: s.ip, port: s.port, name: s.name }));
      case '109':
      case '100':
      case '112':
        return [this.userData.gaiaSID];
      case '107':
        return {
          gaia_id: this.userData.gaia_id,
          username: this.userData.username,
          avatar: this.userData.avatar,
          user_level: this.userData.user_level,
          filter_level: this.userData.filter_level,
          user_active: this.userData.user_active,
        };
      case '3009':
        return [''];
      case '1001':
        return [1];
      default:
        return [];
    }
  }

  async fetchText(
    url: string,
    method: string,
    body: string | null,
    log?: GsiStubLogger,
    onNetwork?: NetworkObserver,
  ): Promise<string | null> {
    const base = typeof location !== 'undefined' && location.href ? location.href : 'http://localhost/';
    const target = (() => {
      try {
        return new URL(url, base).href;
      } catch {
        return url;
      }
    })();
    const verb = String(method || 'GET').toUpperCase();
    const requestId = `http-${++this.requestSequence}`;
    onNetwork?.({
      kind: 'request', transport: 'http', direction: 'outgoing', requestId,
      method: verb, url: target, status: 'sent', payload: body ?? undefined,
    });
    const respond = (payload: string | null, status: string, message?: string) => {
      onNetwork?.({
        kind: 'response', transport: 'http', direction: 'incoming', requestId,
        method: verb, url: target, status, payload: payload ?? undefined, message,
      });
      return payload;
    };
    if (!isGsiUrl(target)) {
      const message = `network request not available offline: ${verb} ${target}`;
      log?.('warn', message, body ?? undefined);
      return respond(null, 'blocked offline', message);
    }
    try {
      if (/gateway\.php/i.test(target) || /(^|&)m=[a-z0-9%]/i.test(body ?? '')) {
        const calls = parseGatewayRequest(body);
        const label = calls.map(([id, params]) => `${id}(${phpSerialize(params).slice(0, 40)})`).join(', ') || 'no calls';
        log?.('info', `GSI gateway ${verb} ${target} → ${label}`, body ?? undefined);
        const rows: PhpValue[] = calls.map(([id, params]) => [0, true, this.handleGsiMethod(id, params)]);
        return respond(encodeURIComponent(phpSerialize(rows)), 'mocked', `${calls.length} GSI method(s) answered by MockServer.`);
      }
      const probe = `${target} ${body ?? ''}`;
      const inventory = /inventor|item|bait|rod|loadout|bucket|gear|equipped|(^|[^a-z])inv([^a-z]|$)/i.test(probe);
      log?.(
        'info',
        `GSI stub ${verb} ${target}${inventory ? ' → inventory reply (25× bait, all rods)' : ' → ok reply'}`,
        body ?? undefined,
      );
      return respond(inventory ? gsiInventoryResponse() : 'error=0&success=1&status=ok', 'mocked', 'Answered locally by MockServer.');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const message = `Mock HTTP handler failed for ${verb} ${target}: ${err.message}`;
      log?.('error', message, err.stack);
      return respond(err.stack ?? err.message, 'error', message);
    }
  }

  connect(
    host: string,
    port: number,
    socket: GameSocket,
    log?: (level: 'info' | 'warn' | 'error', message: string) => void,
    onNetwork?: NetworkObserver,
  ): void {
    this.sushiServer.connect(host, port, socket, log, onNetwork);
  }

  send(socket: GameSocket, data: string): void {
    this.sushiServer.send(socket, data);
  }

  close(socket: GameSocket): void {
    this.sushiServer.close(socket);
  }
}

/** Create a standalone `SushiServer` instance. */
export function createSushiServer(
  log?: (level: 'info' | 'warn' | 'error', message: string) => void,
  opts: Omit<GameServerOptions, 'log'> = {},
): SushiServer {
  return new SushiServer({ ...opts, log });
}

/** Create a unified `MockServer` instance (GSI HTTP gateway + `SushiServer`). */
export function createMockServer(
  log?: (level: 'info' | 'warn' | 'error', message: string) => void,
  opts: Omit<MockServerOptions, 'log'> = {},
): MockServer {
  return new MockServer({ ...opts, log });
}

/** Create the stub used by the Execute tab (safe to share between players). */
export function createGameServerStub(
  log?: (level: 'info' | 'warn' | 'error', message: string) => void,
): GameServerStub {
  return new GameServerStub({ log });
}
