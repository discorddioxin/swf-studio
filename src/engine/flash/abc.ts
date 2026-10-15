// The game's own ActionScript 3 code, read out of the movie.
//
// AVM1 movies have never needed an export of the game's source: the code is in
// the SWF as DoAction / DoInitAction bytecode and the AS2 side lifts it. `DoABC`
// is the AVM2 counterpart, so an AS3 movie is run the same way — take the
// payload, lift it to TypeScript (`transcom/transpiler/avm2`), hand the modules to the
// flash loader. No folder of `.ts` files is involved.
//
// One payload is one ABC file, but a project is usually several SWFs (a shell
// plus the game, libraries, …), and classes in one refer to classes in another.
// The class names of every payload are collected first so a reference to a
// sibling movie's class stays an import instead of turning into a stub.

import { abcClassNames, parseAbc, type AbcFile } from '../../lib/swf/abc';
import { transpileAbc } from '../../../transcom/transpiler/avm2';
import type { SourceFile } from './loader';

export interface AbcSources {
  /** Modules for the loader, in payload order, first occurrence of a path winning. */
  sources: SourceFile[];
  /** Every class name the payloads declare, package-qualified. */
  classes: string[];
  /** Bodies that could not be lifted: they throw loudly where they were called. */
  refusals: { path: string; message: string }[];
  /** `flash.*` / `fl.*` names the payloads use that the engine does not provide. */
  unsupported: string[];
  /** How many ABC files were read. */
  payloads: number;
}

/** The ABC file inside a DoABC payload: flags(u32), a name, then the ABC. */
function abcOffset(payload: Uint8Array): number {
  if (payload.length <= 5) return -1;
  // The name is a SWF string: null-terminated. (Some producers length-prefix it
  // as a u30 instead, so both reads are tried before falling back to a scan.)
  const end = payload.indexOf(0, 4);
  if (end >= 0 && end + 1 + 4 <= payload.length) return end + 1;
  let at = 4;
  let len = 0;
  let shift = 0;
  for (; at < payload.length && shift < 32; at++, shift += 7) {
    const byte = payload[at];
    len |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) { at++; break; }
  }
  const start = at + len;
  return start + 4 <= payload.length ? start : -1;
}

/** The ABC at the payload's declared offset, else the first offset that parses. */
function abcOf(payload: Uint8Array): AbcFile {
  const declared = abcOffset(payload);
  if (declared >= 0) {
    try {
      return parseAbc(payload.subarray(declared));
    } catch {
      // fall through to the scan: a producer that laid the payload out
      // differently (RawABC and friends) still has the ABC file inside.
    }
  }
  let last: unknown;
  for (let at = 0; at < Math.min(payload.length, 512); at++) {
    const major = payload[at + 2] | (payload[at + 3] << 8);
    if (major < 40 || major > 70) continue;
    try {
      return parseAbc(payload.subarray(at));
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`no ABC file in a ${payload.length}-byte DoABC payload${last ? ` (${last})` : ''}`);
}

/**
 * Lift every DoABC payload of a movie (usually `doc.abc`, main movie first) to
 * TypeScript modules the flash loader can compile and link.
 */
export function abcSources(payloads: Iterable<Uint8Array>): AbcSources {
  const abcFiles: AbcFile[] = [];
  for (const payload of payloads) {
    try {
      abcFiles.push(abcOf(payload));
    } catch {
      // A payload we cannot read at all is reported by the caller as "no code";
      // an unreadable one must not take the readable ones down with it.
    }
  }

  // Classes are resolved against the whole project, not one movie: an AS3 game
  // spread over several SWFs imports across them.
  const projectClasses = new Set<string>();
  for (const abc of abcFiles) for (const name of abcClassNames(abc)) projectClasses.add(name);

  const sources: SourceFile[] = [];
  const seen = new Set<string>();
  const refusals: { path: string; message: string }[] = [];
  const unsupported = new Set<string>();
  for (const abc of abcFiles) {
    const result = transpileAbc({ abc, projectClasses });
    for (const file of result.files) {
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      sources.push({ path: file.path, text: file.text });
    }
    for (const diagnostic of result.diagnostics) {
      refusals.push({ path: diagnostic.where, message: diagnostic.message });
    }
    for (const name of result.unsupported) unsupported.add(name);
  }
  return { sources, classes: [...projectClasses].sort(), refusals, unsupported: [...unsupported].sort(), payloads: abcFiles.length };
}
