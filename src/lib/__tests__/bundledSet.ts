// Fixture access for the bundled game sets (test-only; never part of the app).
//
// Reads exactly what the app reads — `game-files/manifest.json` → the default
// game set → its `.swf` entries — so tests drive the real bundled files through
// the real resolution path and never need to know a game's name. A different
// bundled set changes the data, not these tests.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** `game-files/` — the public root the Loader fetches from. */
export const BUNDLED_DIR = resolve(__dirname, '../../../game-files');

export interface BundledSwfEntry {
  name: string;
  path: string;
  fileBase?: string;
  fonts?: string[];
  scriptOverrides?: { path: string; target: string }[];
}

export interface BundledGameSet {
  id: string;
  label?: string;
  adapter?: string;
  main?: string;
  swfs: BundledSwfEntry[];
}

interface Manifest {
  default?: string;
  games?: (string | BundledGameSet)[];
  /** legacy flat shape: one anonymous set */
  swfs?: BundledSwfEntry[];
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

let cached: BundledGameSet | null = null;

/** The index's default game set. */
export function bundledSet(): BundledGameSet {
  if (cached) return cached;
  const manifest = readJson<Manifest>(resolve(BUNDLED_DIR, 'manifest.json'));
  if (!manifest.games?.length) {
    if (!manifest.swfs?.length) throw new Error('game-files/manifest.json lists no game set');
    cached = { id: manifest.default ?? 'bundled', swfs: manifest.swfs };
    return cached;
  }
  const sets = manifest.games.map((g) => (typeof g === 'string' ? readJson<BundledGameSet>(resolve(BUNDLED_DIR, g)) : g));
  const picked = (manifest.default && sets.find((s) => s.id === manifest.default)) || sets[0];
  if (!picked?.swfs?.length) throw new Error('the default game set lists no SWFs');
  cached = picked;
  return cached;
}

function entry(name: string): BundledSwfEntry {
  const found = bundledSet().swfs.find((e) => e.name === name);
  if (!found) throw new Error(`"${name}" is not part of the bundled set ${bundledSet().id}`);
  return found;
}

/** Every SWF of the default set, in manifest order (main first). */
export const bundledSwfNames = (): string[] => bundledSet().swfs.map((e) => e.name);

/** The movie the app plays first (falls back to the first manifest entry). */
export const bundledMainName = (): string => bundledSet().main ?? bundledSwfNames()[0];

/** Absolute path of one bundled SWF. */
export const bundledSwfFile = (name: string): string => resolve(BUNDLED_DIR, entry(name).path);

/** Absolute folder holding the set's FFDec exports (`<set root>/external`). */
export function bundledExternalDir(): string {
  const first = resolve(BUNDLED_DIR, bundledSet().swfs[0].path);
  return resolve(dirname(dirname(first)), 'external');
}

/** Absolute FFDec export folder of one SWF. */
export const bundledExportDir = (name: string): string => resolve(bundledExternalDir(), name);

/** SWFs of the set that ship a committed FFDec XML export, in manifest order. */
export const bundledExportedNames = (): string[] =>
  bundledSwfNames().filter((name) => existsSync(resolve(bundledExportDir(name), `${name}.xml`)));
