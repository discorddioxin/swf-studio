// Gaia Online Fishing — the adapter for the game SWF Studio ships as a sample
// (`game-files/fish-full`, main movie `bassken_game4.21.swf`).
//
// Everything in this folder is specific to that game: the PHP-serialized GSI
// gateway (`gsi.ts`), the Rawfish "Sushi" socket server (`gameServer.ts`), the
// wire codec (`wire.ts`), the guest boot script, the server-list injection and
// the CDN URL policy. Nothing outside this folder knows any of it.
//
// Detection is deliberately conservative: an explicit `adapter` field in the
// bundled manifest wins, otherwise the main/external SWF names must match the
// set this adapter was written for. An unrelated game therefore falls through
// to the generic adapter and runs as authored.

import type { MockServer, MockServerOptions } from './gameServer';
import { createMockServer } from './gameServer';
import type { AdapterNetwork, GameAdapter, GameContext } from '../types';

/** SWF names that identify this game (main movie + its run-time externals). */
const FISHING_SWF_NAMES = /^(bassken(_game4\.21|_overview|_pier|_scene|_fish4\.20)?|gsecs2\.9|game_chat|OmnitureActionSource)$/i;

/** In-game help page linked from the fishing instructions (`getURL`). */
const HELP_URL = /\/info\/help\.php(?:[?#]|$)/i;

/**
 * Loaded assets that are expected to be absent offline:
 * - dynamic member avatar strips (`a2.cdn.gaiaonline.com/gaia/members/*.swf`),
 * - moderator report overlays (`avatar_reporting*.swf`).
 * Both are optional decoration; the bundled clip artwork stands in for them.
 */
const OPTIONAL_EXTERNAL = [
  /gaiaonline\.com\/gaia\/members\//i,
  /(^|[\\/])avatar(_reporting(_low)?)?\.swf([?#]|$)/i,
];

function nameScore(ctx: GameContext): number {
  const names = [ctx.main.name, ...ctx.externals.map((e) => e.name)];
  const hits = names.filter((n) => FISHING_SWF_NAMES.test(n.replace(/\.swf$/i, ''))).length;
  if (!hits) return 0;
  // A couple of hits is enough to claim the set, but stay below the explicit
  // 100 the manifest hands out.
  return Math.min(90, 40 + hits * 10);
}

/**
 * One offline fishing session: the mocked GSI gateway + Sushi socket server and
 * the player hooks that point the game at them. The Execute tab builds this
 * through the adapter (`createNetwork`); tests and tools use it directly so
 * they exercise the same wiring the app does.
 */
export interface FishingSession {
  network: AdapterNetwork;
  server: MockServer;
  /** copy into `new AS2Player({...})` to run the game against the stand-in */
  playerOptions(): {
    fetchText: (url: string, method: string, body: string | null, onNetwork?: Parameters<NonNullable<AdapterNetwork['fetchText']>>[4]) => Promise<string | null>;
    gameServer: MockServer;
    isOptionalExternal: (url: string) => boolean;
  };
}

export function createFishingSession(log?: (level: 'info' | 'warn' | 'error', message: string) => void, opts: Omit<MockServerOptions, 'log'> = {}): FishingSession {
  const server = createMockServer(log, opts);
  const network: AdapterNetwork = {
    fetchText: (url, method, body, netLog, onNetwork) => server.fetchText(url, method, body, netLog, onNetwork),
    gameServer: server,
    reset: () => server.reset(),
    sessionInfo: () => ({ servers: server.servers, rooms: server.getRooms() }),
  };
  return {
    network,
    server,
    playerOptions: () => ({
      fetchText: (url, method, body, onNetwork) => server.fetchText(url, method, body, undefined, onNetwork),
      gameServer: server,
      isOptionalExternal: (url) => !!gaiaFishingAdapter.isOptionalExternal?.(url),
    }),
  };
}

export const gaiaFishingAdapter: GameAdapter = {
  id: 'gaia-fishing',
  label: 'Gaia Online Fishing (bundled sample)',
  description:
    'Offline GSI gateway + Rawfish Sushi server, guest boot script, server-list seeding and the '
    + 'Gaia CDN URL policy, for bassken_game4.21.swf / gsecs2.9.swf / game_chat.swf.',

  detect(ctx) {
    if (ctx.declaredId === 'gaia-fishing' || ctx.declaredId === 'gaia') return 100;
    return nameScore(ctx);
  },

  bootPresets: [
    {
      id: 'gaia-guest',
      label: 'Gaia: play as guest',
      code: '_root.playAsGuest = true;\n_root.startGameSingle();',
      hint: "Uses the game's own guest mode to skip the GSECS login server (gsecs2.9.swf), which cannot be reached offline.",
    },
  ],

  createNetwork(ctx, hooks) {
    void ctx;
    return createFishingSession(hooks.log).network;
  },

  /**
   * `gsecs2.9.swf` fills its server chooser from the GSI response. The mock
   * gateway answers method 50 with the same list, but the AS2 code path that
   * consumes it runs before the socket is up in some states, so the list is
   * seeded directly. This is the one place the adapter reaches into game
   * objects — everything else is protocol-level.
   */
  onStart(root, player, ctx, network) {
    void ctx;
    const server = (network?.gameServer ?? null) as MockServer | null;
    const list = root?.gsecs?.mc_ServerChooser?.serverListing_lt;
    if (!list || !server) return;
    try {
      if (typeof list.removeAll === 'function') list.removeAll();
      for (const entry of server.servers) {
        const label = entry.name || `${entry.ip}:${entry.port}`;
        if (typeof list.addItem === 'function') list.addItem(label);
      }
      if (typeof list.refresh === 'function') list.refresh();
      player.log('info', `server list seeded: ${server.servers.length} server(s) in mc_ServerChooser`);
    } catch {
      // the chooser is a game object; a shape mismatch must never break the boot
    }
  },

  helpPanel: {
    title: 'Fishing instructions',
    subtitle: 'Offline guide for the bundled game.',
    steps: [
      'Choose a location and select bait before fishing.',
      'Click the water once to build casting power, then click again to cast.',
      'When a fish bites, move the mouse side to side to keep the fish between the guide lines.',
      'Click a spot on the overview map to move your player along the coast.',
    ],
    dismiss: 'Got it',
  },

  isHelpUrl: (url) => HELP_URL.test(url),
  isOptionalExternal: (url) => OPTIONAL_EXTERNAL.some((re) => re.test(url)),
};

export { createMockServer } from './gameServer';
export type { MockServer } from './gameServer';
