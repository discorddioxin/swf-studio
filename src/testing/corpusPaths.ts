// Where the uploaded game corpus is, for tests and dev tools only.
//
// The real game SWFs (six Gaia game sets, 43 files) live outside this repo, on
// the `swf-uploads` branch of discorddioxin/swf-forge:
//
//   git clone --depth 1 --branch swf-uploads https://github.com/discorddioxin/swf-forge.git /tmp/swf-forge2
//
// Override the location with SWF_CORPUS=/path/to/games-swfs (and SWF_SCRIPTS for
// the FFDec `.as` export, used only to check the ABC reader).
//
// Node built-ins only, so plain `node` dev tools can import it too (tests use
// ./corpus, which adds the skipping `describe`). Nothing in the app imports it.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** How to get the corpus: shown on every skipped corpus test. */
export const CORPUS_CLONE = 'git clone --depth 1 --branch swf-uploads https://github.com/discorddioxin/swf-forge.git /tmp/swf-forge2';

const env = (name: string): string | undefined => (typeof process !== 'undefined' ? process.env[name] : undefined) || undefined;

/** `games-swfs/`: SWF_CORPUS, else the usual clone locations, else null. */
export function corpusRoot(): string | null {
  const candidates = [
    env('SWF_CORPUS'),
    '/tmp/swf-forge2/games-swfs',
    resolve(HERE, '../../../swf-forge/games-swfs'),
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
 * How to make an FFDec export folder: shown on skipped oracle tests. FFDec output
 * is a test oracle only — the app never reads it.
 */
export const FFDEC_EXPORT_HOWTO = 'export the SWFs with tools/ffdec-export/export.sh <dir> <corpus>/<set>/*.swf, then set SWF_FFDEC=<dir>';

/** A folder of FFDec exports (`<name>/<name>.xml` + asset folders): SWF_FFDEC, else `games-swfs-ffdec` beside the corpus, else null. */
export function ffdecExports(): string | null {
  const explicit = env('SWF_FFDEC');
  if (explicit) return existsSync(explicit) ? explicit : null;
  const root = corpusRoot();
  const sibling = root && join(dirname(root), 'games-swfs-ffdec');
  return sibling && existsSync(sibling) ? sibling : null;
}

/** The movies exported there (folder names that hold `<name>.xml`), sorted. */
export function ffdecExportNames(): string[] {
  const dir = ffdecExports();
  if (!dir) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, `${d.name}.xml`)))
    .map((d) => d.name).sort();
}

/** One movie's FFDec export folder (whether or not it exists) — for dev dumpers that check themselves. */
export function ffdecExportDir(name: string): string {
  return join(ffdecExports() ?? join(dirname(corpusPath('')), 'games-swfs-ffdec'), name);
}
