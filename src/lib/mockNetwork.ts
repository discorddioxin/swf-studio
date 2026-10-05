/**
 * Network mocking interfaces for Gaia Online Fishing (`bassken_game4.21.swf` +
 * `gsecs2.9.swf`).
 *
 * The game performs two categories of network operations:
 * 1. HTTP requests via `XML.sendAndLoad` / `LoadVars.sendAndLoad`:
 *    - `GSItools.GSIGateway` (`http://www.gaiaonline.com/chat/gsi/gateway.php`)
 *      invoking methods `50` (server list), `109` (session ID), `107` (user
 *      profile), `100` (login), `1001` (abuse report), and `3009` (captcha).
 *    - `LoadVars` inventory/shop endpoints (`gsiUrl`).
 * 2. Persistent `XMLSocket` connection via `com.rawfishsoftware.sushi.SushiAPI`:
 *    - Connects to the selected game server IP/port (`SushiSocket`), sends the
 *      `S55` handshake, and exchanges `\x03`-terminated (`$e`) messages with
 *      `\x02`-separated (`$d`) fields (plus `\x01` sub-delimiters and `\x04`
 *      team-limit pairs) with the Rawfish `SushiServer` and its `"G_FISH_PLUGIN"`
 *      server plugin (`FishPlugin`).
 *
 * All network operations are mocked in-process with zero external network
 * connections.
 */

import type { GameServerBackend, GameSocket } from '../engine/as2/player';
import type { LogLevel } from '../engine/flash/player';

export type NetworkLogger = (level: LogLevel, message: string, detail?: string) => void;

/** Decoded Sushi wire record (`<tag>\x02<field0>\x02<field1>...\x03`). */
export interface SushiMessage {
  /** Numeric message tag (first field), or `NaN` for non-numeric handshake records. */
  tag: number;
  /** The remaining fields, decoded from the `\x02`-separated record. */
  fields: string[];
  /** The raw record (without the `\x03` terminator). */
  raw: string;
}

/** Parsed client handshake (`S55\x02FLASH\x02...`). */
export interface Handshake {
  banner: string;
  product: string;
  version: string;
  limit: string;
  subVersion: string;
  clientSpeed: string;
}

/** User profile returned by GSI method `107`. */
export interface GsiUserData {
  gaiaSID: string;
  gaia_id: number;
  username: string;
  avatar: string;
  user_level: number;
  filter_level: number;
  user_active: number;
}

/** Game server entry returned by GSI method `50` (`_root.serverListing`). */
export interface MockServerEntry {
  ip: string;
  port: number;
  name: string;
}

/**
 * Mock room entry inside a `SushiServer` session (`sushi.room.list['_' + id]`).
 *
 * Note: `gsecs2.9.swf` splits `room.name` on `"|"` (`removeUIDFromRoomName`)
 * to display the clean room title in `mChooser.gameListing_lt`, so player
 * rooms follow `"<Title>|<CreatorGaiaId>"` and room `1` is `"Lobby"`.
 */
export interface MockRoom {
  id: number;
  name: string;
  templateId?: number;
  locked?: boolean;
  hasPassword?: boolean;
  password?: string;
  maxMembers?: number;
  /** `\u0004`-delimited `teamId\u0004limit` pairs (e.g. `'0\u00046'`). */
  teamLimits?: string;
  waitingQueue?: number[];
  memberIds?: number[];
  mobs?: string[];
  data?: (string | number)[];
}

/**
 * Mock member entry inside a `SushiServer` session (`sushi.member.list['_' + id]`).
 *
 * For Gaia Fishing (`bassken_game4.21.swf`), `data` holds the 9-element player
 * state array:
 * - `[0]`: `DATA_AVATAR_URL` (string)
 * - `[1]`: `DATA_PLAYER_NUM` (1..6 pier slot)
 * - `[2]`: `DATA_OUTFIT` (1..3)
 * - `[3]`: `DATA_DIST_X` (cast target X)
 * - `[4]`: `DATA_DIST_Y` (cast target Y)
 * - `[5]`: `DATA_UPDATE_TYPE` (`1`=init, `2`=cast, `3`=catch, `4`=bubble)
 * - `[6]`: `DATA_BAIT_NAME` (`"baita"`..`"baitf"`)
 * - `[7]`: `DATA_CAUGHT_TYPE` (fish category)
 * - `[8]`: `DATA_CAUGHT_SPECIES` (fish species index)
 */
export interface MockMember {
  id: number;
  name: string;
  roomId: number;
  teamId: number;
  spectator: boolean;
  platform: string;
  data: (string | number)[];
}

/** Mock session descriptor for `SushiServer` (`sushi.session`). */
export interface MockSession {
  id: number;
  name: string;
  version?: string;
  teamId?: number;
  teamName?: string;
  teamLimit?: number;
  maxMembers?: number;
  rooms: MockRoom[];
  members?: MockMember[];
  data?: (string | number)[];
}

/** State maintained by the `"G_FISH_PLUGIN"` server plugin (`sushi.callPlugin`). */
export interface FishPluginState {
  baitA: number;
  baitD: number;
  baitF: number;
  rods: string[];
  timeOfDay: number;
}

/**
 * Interface for server-side plugins invoked via Sushi opcode `19`
 * (`sushi.callPlugin(pluginId, params, callback, scope)`).
 */
export interface SushiPluginInterface {
  readonly pluginId: string;
  handleCall(callId: string, subOp: string, params: string[]): string;
}

/**
 * Interface representing the Rawfish `SushiServer` multiuser socket server
 * (`com.rawfishsoftware.sushi.*`).
 */
export interface SushiServerInterface extends GameServerBackend {
  readonly host: string;
  readonly port: number;
  readonly session: MockSession;
  readonly fishState: FishPluginState;
  readonly received: SushiMessage[];
  readonly sent: string[];
  getRooms(): MockRoom[];
  getRoom(roomId: number): MockRoom | undefined;
  getMembers(): MockMember[];
  getMember(memberId: number): MockMember | undefined;
  registerPlugin(plugin: SushiPluginInterface): void;
  deliver(socket: GameSocket, message: string): void;
}

/**
 * Unified network mock interface covering both HTTP (`GSI` gateway + `LoadVars`
 * inventory endpoints) and `XMLSocket` (`SushiServer` rooms/sessions/plugins).
 */
export interface MockServerInterface extends GameServerBackend {
  readonly servers: MockServerEntry[];
  readonly userData: GsiUserData;
  readonly sushiServer: SushiServerInterface;
  /** Handle an HTTP `XML.sendAndLoad` or `LoadVars.sendAndLoad` request offline. */
  fetchText(
    url: string,
    method: string,
    body: string | null,
    log?: (level: 'info' | 'warn', message: string, detail?: string) => void,
  ): Promise<string | null>;
  /** Invoke a single GSI gateway method (`50`, `109`, `107`, `1001`, `3009`, etc.). */
  handleGsiMethod(method: string, params?: unknown): unknown;
  /** Inspect the active mock rooms on the Sushi server. */
  getRooms(): MockRoom[];
  /** Inspect the active mock members on the Sushi server. */
  getMembers(): MockMember[];
}

export {
  DEFAULT_FISH_PLUGIN_STATE,
  DEFAULT_GSI_USER_DATA,
  DEFAULT_MOCK_MEMBERS,
  DEFAULT_MOCK_ROOMS,
  DEFAULT_TEST_SESSION,
  FishPlugin,
  GameServerStub,
  MockServer,
  SUSHI_END,
  SUSHI_FIELD,
  SushiDecoder,
  SushiServer,
  createGameServerStub,
  createMockServer,
  createSushiServer,
  decodeMessage,
  encodeMessage,
  parseHandshake,
} from './gameServerStub';
