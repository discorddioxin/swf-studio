// External SWFs for the AS2 player.
//
// A Flash game is usually split over several SWFs that it pulls in at run time
// with loadMovie / MovieClipLoader (lake scenery, chat, login, …). Each one is
// loaded into the studio as its own FFDec export (a folder with <name>.xml and
// scripts/), and this module turns such a package into a player `Movie` when
// the game asks for its URL:
//
//   loadMovie("../sharedsource/game_chat/game_chat.swf?v=3")
//        └─ swfNameOf → "game_chat" ─▶ package "game_chat" ─as2ts─▶ Movie
//
// Scripts are transpiled and linked lazily, the first time the game requests
// the SWF (AS2 class bodies run while linking, exactly like the class
// DoInitActions of a SWF run when it loads). The Movie is then shared by every
// clip the same SWF is loaded into.

import type { SwfDocument } from '../../types';
import type { AudioBackend } from '../flash/media';
import type { AssetSource } from '../flash/player';
import { buildAS2Program, type AS2Build, type SourceInput } from './program';
import type { Movie } from './player';

export interface ExternalSwf {
  /** SWF name, e.g. "bassken_fish4.20" (the export's .xml / .swf file name; extension optional) */
  name: string;
  doc: SwfDocument;
  assets: AssetSource | null;
  audio?: AudioBackend | null;
  /** key used for this SWF's embedded fonts ("swf-font-<key>-<id>") */
  key?: string;
  /** the FFDec .as export of this SWF */
  sources: () => Promise<SourceInput[]> | SourceInput[];
}

/** "../sharedsource/GSECS/gsecs2.9.swf?x=1" → "gsecs2.9" (also accepts .xml export names) */
export function swfNameOf(urlOrName: string): string {
  const path = String(urlOrName).split(/[?#]/)[0].replace(/\\/g, '/');
  let base = path.slice(path.lastIndexOf('/') + 1);
  try { base = decodeURIComponent(base); } catch { /* keep as is */ }
  return base.replace(/\.(swf|xml)$/i, '').toLowerCase();
}

export interface ExternalResolverHooks {
  /** called once per SWF after its scripts were transpiled and linked */
  onBuild?: (swf: ExternalSwf, build: AS2Build, ms: number) => void;
  onError?: (swf: ExternalSwf, error: Error) => void;
}

export type ExternalResolver = ((url: string) => Promise<Movie | null> | null) & {
  /** SWF names that can be resolved */
  readonly available: string[];
};

/** A resolver for AS2PlayerOptions.resolveExternal. Create one per player: builds are cached per resolver. */
export function createExternalResolver(externals: ExternalSwf[], hooks: ExternalResolverHooks = {}): ExternalResolver {
  const byName = new Map<string, ExternalSwf>();
  for (const e of externals) {
    byName.set(swfNameOf(e.name), e);
    if (e.doc.header.fileName) byName.set(swfNameOf(e.doc.header.fileName), e);
  }
  const movies = new Map<ExternalSwf, Promise<Movie | null>>();

  const load = async (swf: ExternalSwf): Promise<Movie | null> => {
    try {
      const sources = await swf.sources();
      const t = Date.now();
      const build = buildAS2Program(sources);
      hooks.onBuild?.(swf, build, Date.now() - t);
      return { doc: swf.doc, program: build.program, assets: swf.assets, audio: swf.audio ?? null, url: swf.name, key: swf.key };
    } catch (e) {
      hooks.onError?.(swf, e instanceof Error ? e : new Error(String(e)));
      return null;
    }
  };

  const resolve = ((url: string) => {
    const swf = byName.get(swfNameOf(url));
    if (!swf) return null;
    let m = movies.get(swf);
    if (!m) { m = load(swf); movies.set(swf, m); }
    return m;
  }) as ExternalResolver;
  Object.defineProperty(resolve, 'available', { get: () => [...new Set([...byName.values()].map((e) => e.name))] });
  return resolve;
}
