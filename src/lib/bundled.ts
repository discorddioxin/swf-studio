// Bundled raw .swf loading.
//
// The public root holds an index (`manifest.json`) listing *game sets* — one
// JSON file per bundled game under `games/`, each naming the .swf files that
// belong to it and (optionally) the adapter that knows how to run it offline
// (see src/adapters). Keeping the sets apart is what stops one game's SWFs
// leaking into an unrelated game's session.
//
// A set names SWFs and nothing else: fonts, sounds, bitmaps and scripts all come
// out of the SWFs themselves (see swf/binary), exactly as for an upload.
//
// Everything is fetched relative to the page so it works behind any dev-server
// or preview origin without hard-coded hosts.

import { parseSwfBinary, type SwfFile } from './swf/binary';
import type { SwfDocument } from '../types';

export interface BundledSwf {
  /** package name without extension, e.g. "overview" */
  name: string;
  /** path relative to the public root, e.g. "mygame/swfs/overview.swf" */
  path: string;
}

/** One bundled game: the SWFs that make it up plus how to run it offline. */
export interface GameSet {
  /** stable id, also used as the adapter's `declaredId` (e.g. "mygame") */
  id: string;
  label: string;
  /** adapter id that should run this set (see src/adapters) */
  adapter?: string;
  /** manifest `name` of the SWF that plays the game; defaults to the first entry */
  main?: string;
  swfs: BundledSwf[];
}

/** Legacy shape (a single flat list) still loads as one anonymous set. */
const LEGACY_SET: Omit<GameSet, 'swfs'> = { id: 'bundled', label: 'Bundled SWFs' };

function parseSwfEntries(list: unknown[]): BundledSwf[] {
  const out: BundledSwf[] = [];
  for (const raw of list) {
    if (typeof raw === 'string') {
      const base = raw.split('/').pop() ?? raw;
      out.push({ name: base.replace(/\.swf$/i, ''), path: raw });
    } else if (raw && typeof raw === 'object' && typeof (raw as { path?: unknown }).path === 'string') {
      const obj = raw as Record<string, unknown>;
      const rawPath = (raw as { path: string }).path;
      const base = rawPath.split('/').pop() ?? rawPath;
      out.push({
        name: typeof obj.name === 'string' && obj.name ? obj.name : base.replace(/\.swf$/i, ''),
        path: rawPath,
      });
    }
  }
  return out;
}

function parseGame(raw: unknown, fallbackId: string): GameSet | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const swfs = parseSwfEntries(Array.isArray(obj.swfs) ? obj.swfs : []);
  if (!swfs.length) return null;
  const id = typeof obj.id === 'string' && obj.id ? obj.id : fallbackId;
  return {
    id,
    label: typeof obj.label === 'string' && obj.label ? obj.label : id,
    ...(typeof obj.adapter === 'string' && obj.adapter ? { adapter: obj.adapter } : {}),
    ...(typeof obj.main === 'string' && obj.main ? { main: obj.main } : {}),
    swfs,
  };
}

const fetchJson = async (path: string): Promise<unknown> => {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * What the public root says about bundled games:
 * - `none`: it ships none (no `manifest.json`) — the normal case, not an error;
 * - `ready`: the game sets of a readable index;
 * - `broken`: an index exists but cannot be used, with why.
 */
export type BundledIndexState =
  | { status: 'none' }
  | { status: 'ready'; games: GameSet[] }
  | { status: 'broken'; error: string };

/**
 * Read the bundled index. `manifest.json` is either an index (`{ "default":
 * "mygame", "games": ["games/mygame.json"] }`) or — as before a game set existed
 * — a single flat list (`{ "swfs": [...] }`), which loads as one anonymous set.
 * A game file that cannot be read is skipped so one broken set does not hide the
 * others; an index with no readable set at all is `broken`.
 *
 * "No index" is a 404, or the HTML page a dev/preview server answers any unknown
 * path with (SPA fallback).
 */
export async function loadGameIndex(): Promise<BundledIndexState> {
  let res: Response;
  try {
    res = await fetch('manifest.json', { cache: 'no-cache' });
  } catch (e) {
    return { status: 'broken', error: `manifest.json: ${message(e)}` };
  }
  if (res.status === 404) return { status: 'none' };
  if (!res.ok) return { status: 'broken', error: `manifest.json: HTTP ${res.status}` };
  const text = await res.text();
  if (/text\/html/i.test(res.headers.get('content-type') ?? '') || /^\s*</.test(text)) return { status: 'none' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { status: 'broken', error: `manifest.json is not JSON (${message(e)})` };
  }
  try {
    return { status: 'ready', games: await gamesOf(data) };
  } catch (e) {
    return { status: 'broken', error: message(e) };
  }
}

async function gamesOf(data: unknown): Promise<GameSet[]> {
  const source = (data ?? {}) as { games?: unknown; swfs?: unknown; default?: unknown };
  if (Array.isArray(source.games)) {
    const games: GameSet[] = [];
    for (let i = 0; i < source.games.length; i++) {
      const ref = source.games[i];
      try {
        const raw = typeof ref === 'string' ? await fetchJson(ref) : ref;
        const set = parseGame(raw, `game-${i + 1}`);
        if (set) games.push(set);
      } catch (e) {
        console.warn(`bundled game set ${typeof ref === 'string' ? ref : i + 1} unavailable:`, e);
      }
    }
    if (!games.length) throw new Error('bundled manifest.json lists no readable game sets');
    return games;
  }
  if (Array.isArray(source.swfs)) {
    const swfs = parseSwfEntries(source.swfs);
    if (!swfs.length) throw new Error('bundled manifest.json lists no swfs');
    return [{ ...LEGACY_SET, swfs }];
  }
  throw new Error('bundled manifest.json has neither "games" nor "swfs"');
}

/** The bundled game sets; throws when there are none or the index is broken. */
export async function fetchGameIndex(): Promise<GameSet[]> {
  const state = await loadGameIndex();
  if (state.status === 'ready') return state.games;
  throw new Error(state.status === 'none' ? 'No bundled game sets are available.' : state.error);
}

/** The first bundled set (kept for callers that only know about one game). */
export async function fetchBundledManifest(): Promise<BundledSwf[]> {
  const [set] = await fetchGameIndex();
  return set?.swfs ?? [];
}

export interface BundledPackage {
  doc: SwfDocument;
  /** synthetic File[] (with webkitRelativePath) ready for ingestFiles() */
  files: File[];
}

/**
 * Wrap the asset files the binary parser synthesized (scripts/, shapes/, …)
 * as upload Files under `prefix`, so a raw .swf upload goes through the same
 * `ingestFiles` path as an FFDec folder.
 */
export function swfFilesToFiles(files: SwfFile[], prefix: string): File[] {
  return files.map((f) => {
    const copy = f.bytes.slice(); // fresh ArrayBuffer-backed view for Blob
    const file = new File([copy.buffer as ArrayBuffer], f.path.split('/').pop() ?? f.path);
    Object.defineProperty(file, 'webkitRelativePath', {
      value: `${prefix}/${f.path}`,
      configurable: true,
    });
    if (f.tagOrder != null) Object.defineProperty(file, '__swfTagOrder', { value: f.tagOrder, configurable: true });
    if (f.targetSpriteId != null) Object.defineProperty(file, '__swfTargetSpriteId', { value: f.targetSpriteId, configurable: true });
    return file;
  });
}

/** Fetch one bundled .swf and parse it with the binary SWF parser. */
export async function fetchBundledSwf(
  entry: BundledSwf,
  onProgress?: (message: string) => void,
): Promise<BundledPackage> {
  onProgress?.(`Fetching bundled ${entry.name}.swf…`);
  const res = await fetch(entry.path);
  if (!res.ok) throw new Error(`${entry.path}: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  onProgress?.(`Parsing bundled ${entry.name}.swf…`);
  const fileName = entry.path.split('/').pop() ?? `${entry.name}.swf`;
  const { doc, files } = await parseSwfBinary(buffer, fileName);
  return { doc, files: swfFilesToFiles(files, entry.name) };
}
