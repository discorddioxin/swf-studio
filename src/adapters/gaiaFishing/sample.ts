// Facts about the Gaia Online Fishing sample, the game set most tests use.
//
// The app never needs these: it plays whatever SWFs are uploaded (or a bundled
// game set, if a deployment ships one in `game-files/`). Tests and dev tooling
// that must open the *actual* sample files import them from here, so the
// sample's names are spelled out in exactly one place — inside its own adapter.
//
// The files are the `fishing-swfs` set of the uploaded game corpus (see
// src/testing/corpusPaths.ts); `__tests__/sample.test.ts` pins their SHA-256, so
// a test that names a sprite id is reading the bytes it was written against.
// Test/dev-only: nothing the app bundles imports this module.
import { corpusPath, corpusSet } from '../../testing/corpusPaths.ts';

export const SAMPLE_GAME_SET_ID = 'gaia-fishing';
export const SAMPLE_LABEL = 'Gaia Online Fishing';
/** The adapter that runs the sample (`gaiaFishingAdapter.id`). */
export const SAMPLE_ADAPTER = 'gaia-fishing';
/** The corpus folder holding the sample's SWFs. */
export const SAMPLE_CORPUS_SET = 'fishing-swfs';

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

/** Absolute path of a sample SWF (whether or not the corpus is checked out). */
export const sampleSwfPath = (name: string): string => corpusPath(`${SAMPLE_CORPUS_SET}/${name}.swf`);

/** The folder holding the sample's SWFs, or null without the corpus. */
export function sampleSwfDir(): string | null {
  const [first] = corpusSet(SAMPLE_CORPUS_SET);
  return first ? first.slice(0, first.lastIndexOf('/')) : null;
}

/** Whether every SWF of the sample is available (tests skip without it). */
export function hasSample(): boolean {
  const present = new Set(corpusSet(SAMPLE_CORPUS_SET).map((path) => path.slice(path.lastIndexOf('/') + 1)));
  return SAMPLE_SWF_NAMES.every((name) => present.has(`${name}.swf`));
}

/** The sample as a game set (the shape `src/lib/bundled.ts` reads), paths absolute. */
export function sampleGameSet() {
  return {
    id: SAMPLE_GAME_SET_ID, label: SAMPLE_LABEL, adapter: SAMPLE_ADAPTER, main: SAMPLE_MAIN,
    swfs: SAMPLE_SWF_NAMES.map((name) => ({ name, path: sampleSwfPath(name) })),
  };
}
