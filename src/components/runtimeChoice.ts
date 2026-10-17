// Which virtual machine a movie runs on (P-13).
//
// A SWF asks for AVM2 with the ActionScript3 flag of its FileAttributes tag
// (SWF 19, "FileAttributes"); a movie without the tag is AVM1 — the tag only
// exists from SWF 8, and Flash Player treats a SWF that lacks it as AVM1.
// An FFDec XML export with no FileAttributesTag carries no such statement (it
// may be hand-written or partial), so only there is the runtime guessed from
// what came with the export.

import type { AssetBundle, SwfDocument } from '../types';

export interface RuntimeChoice {
  runtime: 'as2' | 'as3';
  /** The rule that decided, for the Execute console. */
  rule: string;
}

export function chooseRuntime(doc: SwfDocument, assets: AssetBundle | null): RuntimeChoice {
  const { as3, source } = doc.header;
  if (as3 != null) return { runtime: as3 ? 'as3' : 'as2', rule: `FileAttributes: ActionScript3 = ${as3 ? 1 : 0}` };
  if (source !== 'xml') return { runtime: 'as2', rule: 'no FileAttributes tag: an AVM1 movie' };
  const hasAs = !!assets?.files.some((f) => /\.as$/i.test(f.path));
  const oldMovie = Number(doc.header.version ?? 0) <= 8;
  const as2 = hasAs && (oldMovie || !doc.symbolClasses?.size);
  return {
    runtime: as2 ? 'as2' : 'as3',
    rule: `FFDec XML without FileAttributes: guessed from the export — ${as2
      ? `.as files and ${oldMovie ? 'SWF version ≤ 8' : 'no SymbolClass'}`
      : hasAs ? 'a SymbolClass table in a SWF 9+ export' : 'no .as files'}`,
  };
}

/** The console line that reports the choice. */
export const runtimeLogMessage = (choice: RuntimeChoice) =>
  `runtime: ${choice.runtime === 'as3' ? 'AVM2 (ActionScript 3)' : 'AVM1 (ActionScript 1/2)'} — ${choice.rule}`;
