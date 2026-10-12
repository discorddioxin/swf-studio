// Game adapters — the plug point between SWF Studio's engine and a specific
// game's offline stand-ins.
//
// The engine, the troubleshooter and the Execute tab are deliberately generic:
// they run whatever ActionScript the SWF carries. Anything that knows *which*
// game is running — a mocked login/gateway, a room/session server, a boot
// script that skips an unreachable login, CDN asset URLs that are expected to
// be missing offline — lives in an adapter under this folder and is selected by
// `resolveAdapter()`.
//
// To plug in a new game, see `src/adapters/README.md`.

import type { AS2Player, GameServerBackend } from '../engine/as2/player';
import type { SwfDocument } from '../types';
import type { NetworkObserver } from '../engine/flash/player';

/** A loaded SWF in the current session. */
export interface AdapterSwf {
  /** package name, e.g. `mygame` */
  name: string;
  doc: SwfDocument;
  /** script paths the package carries (cheap to compute; no file reads) */
  paths: readonly string[];
}

/** What the adapter gets to look at when deciding whether it applies. */
export interface GameContext {
  /** the movie that plays the game (the one whose frame 1 the user sees) */
  main: AdapterSwf;
  /** the SWFs the game loads at run time (loadMovie / MovieClipLoader) */
  externals: readonly AdapterSwf[];
  /** true when this load came from the bundled manifest, not a user upload */
  bundled: boolean;
  /** the adapter the bundled manifest declared for this set, if any */
  declaredId?: string | null;
}

/** A script the user can run on `_root` after frame 1 (see As2Execute). */
export interface BootPreset {
  id: string;
  label: string;
  code: string;
  hint: string;
}

/** What the Execute console's session readout shows (adapter-owned). */
export interface AdapterSessionInfo {
  servers?: { ip: string; port: number; name: string }[];
  rooms?: { id: number; name: string }[];
}

/** Offline replacement for an online instruction page the game links to. */
export interface AdapterHelpPanel {
  title: string;
  subtitle?: string;
  steps: string[];
  /** label of the dismiss button */
  dismiss?: string;
}

/** Logger the network stand-in writes through (the Execute console's network source). */
export type AdapterNetworkLogger = (level: 'info' | 'warn' | 'error', message: string, detail?: string) => void;

/** Offline stand-ins for the game's network. Omit entirely to pass through. */
export interface AdapterNetwork {
  /** drop session state (the Execute tab's Restart calls this) */
  reset?(): void;
  /** live session readout for the Execute console (servers / rooms) */
  sessionInfo?(): AdapterSessionInfo;
  /** `XML.sendAndLoad` / `LoadVars.sendAndLoad` */
  fetchText?: (url: string, method: string, body: string | null, log?: AdapterNetworkLogger, onNetwork?: NetworkObserver) => Promise<string | null>;
  /** the persistent socket (`XMLSocket`) */
  gameServer?: GameServerBackend | null;
}

export interface GameAdapter {
  id: string;
  /** shown in the Execute tab */
  label: string;
  description: string;
  /**
   * How strongly this adapter claims the loaded game. `0` = does not apply;
   * any positive score is a claim and the highest score wins. Return `100` for
   * an explicit match (manifest-declared id, exact SWF name) so it beats a
   * heuristic hit.
   */
  detect(ctx: GameContext): number;
  /** boot scripts offered in the Execute toolbar (beyond the always-present "None") */
  bootPresets?: BootPreset[];
  /** offline network; return `undefined` to leave the game's own stack alone */
  createNetwork?(ctx: GameContext, hooks: { log: (level: 'info' | 'warn' | 'error', message: string) => void }): AdapterNetwork | undefined;
  /**
   * Runs after the player started (the user's boot script runs first). This is
   * where a game-specific fix-up goes (populate a chooser, seed a variable,
   * attach a stand-in clip). `network` is what `createNetwork` returned.
   */
  onStart?(root: any, player: AS2Player, ctx: GameContext, network?: AdapterNetwork): void;
  /** content shown when the game opens its `isHelpUrl` page (offline guide) */
  helpPanel?: AdapterHelpPanel;
  /** true when `url` is the game's in-game help link (Execute shows its help panel) */
  isHelpUrl?(url: string): boolean;
  /**
   * true when a loadMovie/MovieClipLoader URL is *expected* to be missing
   * offline (CDN avatars, dynamic photo strips). Those stay quiet; everything
   * else is reported with the standard missing-asset warning.
   */
  isOptionalExternal?(url: string): boolean;
}
