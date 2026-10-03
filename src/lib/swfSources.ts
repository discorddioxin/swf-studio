// Which SWFs a user's selection contains, and which one is the *main* movie.
//
// An upload can mix two shapes of the same thing:
//
//   game/bassken_game4.21.swf           a raw SWF binary (parseSwfBinary)
//   game/bassken_game4.21.xml           a JPEXS/FFDec XML export (parseSwfXml)
//   game/external/scene/scene.swf       a SWF the game loads at run time
//
// Every `.swf` / `.xml` in the selection becomes a SwfSource. The user then
// picks one of them as the main movie: it is the document the Execute
// workspace plays, and every other source is loaded as a dependency (the
// external SWFs a game pulls in with loadMovie / Loader).
//
// The same movie is often present twice — once as its folder of FFDec exports
// and once as the .swf the user had lying around — so `dedupeByMovie` keeps a
// single copy, preferring the XML export (it carries fonts and images the
// binary parser cannot recover) unless the user explicitly chose the .swf.

import JSZip from 'jszip';
import { filePath } from './assets';

export type SwfSourceKind = 'binary' | 'xml';

export interface SwfSource {
  /** identity inside the selection: the file's path ("folder/name.ext") */
  key: string;
  /** basename without extension, e.g. "bassken_scene" */
  stem: string;
  /** basename with extension, e.g. "bassken_scene.swf" */
  fileName: string;
  kind: SwfSourceKind;
  /** folder of the file inside the selection ("" = selection root) */
  root: string;
  /** folder depth — the shallowest SWF is the best default guess for the main movie */
  depth: number;
  /** what the Main-SWF drop-down shows (folder-qualified only on stem collisions) */
  label: string;
}

const SWF_EXT = /\.swf$/i;
const KEEP = /\.(swf|xml)$/i;

/** The identity of a movie regardless of which form it was uploaded in. */
export function movieKey(source: SwfSource): string {
  return source.stem.toLowerCase();
}

function sourceFromPath(path: string): SwfSource | null {
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const base = clean.slice(clean.lastIndexOf('/') + 1);
  if (!KEEP.test(base)) return null;
  const root = clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/')) : '';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return {
    key: clean,
    stem,
    fileName: base,
    kind: SWF_EXT.test(base) ? 'binary' : 'xml',
    root,
    depth: root ? root.split('/').length : 0,
    label: stem,
  };
}

/**
 * The SWFs in an already-expanded selection (folder upload or unpacked ZIP).
 * Sorted the way the Loader lists them: shallowest first (the main movie of an
 * FFDec export sits above its `external/` folder), then alphabetically.
 */
export function swfSourcesFromFiles(files: File[]): SwfSource[] {
  const sources: SwfSource[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const source = sourceFromPath(filePath(file));
    if (!source || seen.has(source.key)) continue;
    seen.add(source.key);
    sources.push(source);
  }
  return labelAndSort(sources);
}

/**
 * Like `swfSourcesFromFiles`, but also looks inside ZIP archives. Only the
 * archive's name table is read (no entry is inflated), so this stays cheap
 * enough to run on every change of the queue.
 */
export async function collectSwfSources(files: File[]): Promise<SwfSource[]> {
  const out: SwfSource[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name)) {
      const source = sourceFromPath(filePath(file));
      if (source) out.push(source);
      continue;
    }
    try {
      // Read the bytes ourselves: JSZip only accepts a Blob in a browser, and
      // the name table is all this needs (no entry is inflated).
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const source = sourceFromPath(entry.name);
        if (source) out.push(source);
      }
    } catch (e) {
      // not a readable archive — the load step reports the real error
      console.warn(`${file.name} could not be listed as a ZIP:`, e);
    }
  }
  const seen = new Set<string>();
  return labelAndSort(out.filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true))));
}

function labelAndSort(sources: SwfSource[]): SwfSource[] {
  const byStem = new Map<string, number>();
  for (const s of sources) byStem.set(s.stem.toLowerCase(), (byStem.get(s.stem.toLowerCase()) ?? 0) + 1);
  return sources
    .map((s) => (byStem.get(s.stem.toLowerCase())! > 1 && s.root ? { ...s, label: `${s.stem} — ${s.root}` } : s))
    .sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key));
}

/** The source the user picked, or the first one (the current default guess). */
export function pickMainSource(sources: SwfSource[], mainKey?: string | null): SwfSource | undefined {
  if (!sources.length) return undefined;
  const hit = mainKey ? sources.find((s) => s.key === mainKey) : undefined;
  return hit ?? sources[0];
}

/**
 * Drop the second copy of a movie that was uploaded in both forms, then put
 * the main source first. The main movie has to be `packages[0]` — that is what
 * the workspace plays — and everything after it is handed to the Execute tab
 * as a dependency.
 */
export function orderSources(sources: SwfSource[], mainKey?: string | null): SwfSource[] {
  // Only an explicit pick is protected from the duplicate-form merge below;
  // the default (first) source can still be replaced by its XML twin.
  const picked = mainKey ? sources.find((source) => source.key === mainKey) : undefined;
  const byMovie = new Map<string, SwfSource>();
  for (const source of sources) {
    const key = movieKey(source);
    const previous = byMovie.get(key);
    if (!previous) { byMovie.set(key, source); continue; }
    if (source === picked) byMovie.set(key, source);
    else if (previous !== picked && previous.kind !== 'xml' && source.kind === 'xml') byMovie.set(key, source);
  }
  const kept = [...byMovie.values()];
  const main = pickMainSource(kept, mainKey);
  return main ? [main, ...kept.filter((source) => source !== main)] : kept;
}
