// The sample game set for library tests (test-only; never part of the app).
//
// It used to be read from `game-files/manifest.json`, when the sample shipped
// with the repo; it now comes from the uploaded corpus (the adapter's
// `sample.ts` names it, `src/testing/corpusPaths.ts` finds it). Tests that use
// it skip with `describeSample` when the corpus is not checked out.
import { hasSample, sampleGameSet, sampleSwfPath } from '@/adapters/gaiaFishing/sample';
import { describeCorpus } from '@/testing/corpus';

export interface BundledSwfEntry {
  name: string;
  /** absolute path */
  path: string;
}

export interface BundledGameSet {
  id: string;
  label?: string;
  adapter?: string;
  main?: string;
  swfs: BundledSwfEntry[];
}

export { hasSample as hasBundledSet };

/** `describe` for tests that need the sample files; skipped (saying how to get them) without the corpus. */
export const describeSample = (name: string, fn: () => void) => describeCorpus(name, fn, hasSample);

/** The sample game set. */
export const bundledSet = (): BundledGameSet => sampleGameSet();

/** Every SWF of the set, main first. */
export const bundledSwfNames = (): string[] => bundledSet().swfs.map((e) => e.name);

/** The movie the game set plays first. */
export const bundledMainName = (): string => bundledSet().main ?? bundledSwfNames()[0];

/** Absolute path of one SWF of the set. */
export function bundledSwfFile(name: string): string {
  if (!bundledSwfNames().includes(name)) throw new Error(`"${name}" is not part of the sample set ${bundledSet().id}`);
  return sampleSwfPath(name);
}
