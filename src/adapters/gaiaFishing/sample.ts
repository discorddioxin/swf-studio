// Facts about the bundled Gaia Online Fishing sample.
//
// The app never needs these: at run time the Loader reads
// `game-files/manifest.json` → the game set (`games/gaia-fishing.json`) → the
// .swf paths from the data. Tests and dev tooling that must open the *actual*
// bundled files import them from here, so the sample's names are spelled out in
// exactly one place — inside its own adapter — instead of being scattered
// across the repo.
//
// Keep this in sync with `game-files/games/gaia-fishing.json`;
// `src/lib/bundled.test.ts` asserts the two agree.

export const SAMPLE_GAME_SET_ID = 'gaia-fishing';

/** Folder under `game-files/` (the served root) holding the sample's SWFs. */
export const SAMPLE_ROOT = 'game-files/fish-full';
export const SAMPLE_SWF_DIR = `${SAMPLE_ROOT}/swfs`;
/**
 * FFDec exports of some sample SWFs: test oracles for the parser only (never
 * served, never read by the app, which works from the SWFs alone).
 */
export const SAMPLE_EXTERNAL_DIR = `fixtures/ffdec/${SAMPLE_GAME_SET_ID}`;

/** The SWF that plays the game (the game set's `main`). */
export const SAMPLE_MAIN = 'bassken_game4.21';

/** Every SWF of the set, in game-set order (main first). */
export const SAMPLE_SWF_NAMES = [
  'bassken_game4.21',
  'bassken_overview',
  'bassken_pier',
  'bassken_fish4.20',
  'bassken_scene',
  'game_chat',
  'gsecs2.9',
  'OmnitureActionSource',
] as const;

/** The sample's login/chat service movie — the usual component under test. */
export const SAMPLE_SERVICE = 'gsecs2.9';

/** The sample's in-game chat movie (second component kit of the set). */
export const SAMPLE_CHAT = 'game_chat';

/**
 * Movies that are component kits / service helpers rather than game art: they
 * carry no actor proposals (see `transcom/transpiler/as2/actorHeuristics.ts`).
 */
export const SAMPLE_LIBRARY_NAMES = [SAMPLE_SERVICE, SAMPLE_CHAT] as const;

/** The sample's map/overview movie (tests pin its DoInitAction order: sprites 29, 28). */
export const SAMPLE_OVERVIEW = 'bassken_overview';

/** The sample's coast/scene movie (tests use it as the dependency SWF). */
export const SAMPLE_SCENE = 'bassken_scene';

/** The sample's pier movie (embeds a font of its own). */
export const SAMPLE_PIER = 'bassken_pier';

/**
 * The sample's third-party analytics helper SWF. Not game art and not specific
 * to this game: it ships in the set because the movie loads it at start-up.
 */
export const SAMPLE_TRACKING = 'OmnitureActionSource';

/** Sample SWFs whose FFDec exports are committed as test oracles. */
export const SAMPLE_EXPORTED_NAMES = [
  'bassken_overview',
  'bassken_pier',
  'bassken_fish4.20',
  'bassken_scene',
  SAMPLE_CHAT,
  SAMPLE_SERVICE,
] as const;

/** Path of a bundled sample SWF, relative to the public root. */
export const sampleSwfPath = (name: string): string => `${SAMPLE_SWF_DIR}/${name}.swf`;

/** FFDec export folder (test oracle) of one sample SWF. */
export const sampleExportDir = (name: string): string => `${SAMPLE_EXTERNAL_DIR}/${name}`;

