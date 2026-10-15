// The uploaded game corpus, for tests only.
//
// The real game SWFs (six Gaia game sets, 43 files) live outside this repo, on
// the `swf-uploads` branch of discorddioxin/swf-forge. Tests that need them ask
// here, so every test finds the corpus the same way and skips the same way when
// it is not checked out. Nothing in the app imports this module, so it is never
// bundled.
//
//   git clone --depth 1 --branch swf-uploads https://github.com/discorddioxin/swf-forge.git /tmp/swf-forge2
//
// Override the location with SWF_CORPUS=/path/to/games-swfs (and SWF_SCRIPTS for
// the FFDec `.as` export, used only to check the ABC reader).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe } from 'vitest';

/** How to get the corpus: shown on every skipped corpus test. */
export const CORPUS_CLONE = 'git clone --depth 1 --branch swf-uploads https://github.com/discorddioxin/swf-forge.git /tmp/swf-forge2';

const env = (name: string): string | undefined => (typeof process !== 'undefined' ? process.env[name] : undefined) || undefined;

/** `games-swfs/`: SWF_CORPUS, else the usual clone locations, else null. */
export function corpusRoot(): string | null {
  const candidates = [
    env('SWF_CORPUS'),
    '/tmp/swf-forge2/games-swfs',
    resolve(__dirname, '../../../swf-forge/games-swfs'),
    join(homedir(), 'swf-forge/games-swfs'),
  ];
  for (const dir of candidates) if (dir && existsSync(dir)) return dir;
  return null;
}

/** The FFDec `.as` export next to the SWFs (`games-swfs-scripts/`): SWF_SCRIPTS, else the root's sibling. */
export function corpusScripts(): string | null {
  const explicit = env('SWF_SCRIPTS');
  if (explicit) return existsSync(explicit) ? explicit : null;
  const root = corpusRoot();
  const sibling = root && join(dirname(root), 'games-swfs-scripts');
  return sibling && existsSync(sibling) ? sibling : null;
}

export const hasCorpus = corpusRoot() !== null;

/** The game sets present (`fishing-swfs`, `pinball-swfs`, …). */
export function corpusSets(): string[] {
  const root = corpusRoot();
  return root ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
}

/** Absolute paths of one set's SWFs, sorted; empty when the set is absent. */
export function corpusSet(id: string): string[] {
  const root = corpusRoot();
  const dir = root && join(root, id);
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.swf')).sort().map((f) => join(dir, f));
}

/** Absolute path of one corpus file (`corpusFile('pinball-swfs', 'game.swf')`), or null. */
export function corpusFile(set: string, name: string): string | null {
  const root = corpusRoot();
  const file = root && join(root, set, name);
  return file && existsSync(file) ? file : null;
}

/**
 * A path inside the corpus (`corpusPath('pinball-swfs/game.swf')`), whether or not
 * it exists — for dev tools that check `existsSync` themselves.
 */
export function corpusPath(relative: string): string {
  return join(corpusRoot() ?? '/tmp/swf-forge2/games-swfs', relative);
}

/** Every SWF of every set. */
export function corpusSwfs(): { set: string; name: string; path: string }[] {
  return corpusSets().flatMap((set) => corpusSet(set).map((path) => ({ set, name: path.slice(path.lastIndexOf('/') + 1), path })));
}

/** A file's bytes as the SWF reader takes them. */
export function readArrayBuffer(path: string): ArrayBuffer {
  const raw = readFileSync(path);
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

/**
 * `describe` for tests that need the corpus: skipped when it is absent, and the
 * skipped suite's name says how to get it.
 */
export function describeCorpus(name: string, fn: () => void, needs: () => boolean = () => hasCorpus): void {
  const available = needs();
  describe.skipIf(!available)(available ? name : `${name} (skipped: no game corpus — ${CORPUS_CLONE})`, fn);
}
