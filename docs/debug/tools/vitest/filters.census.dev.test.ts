// P-04 census: which surface filters and blend modes the corpus uses, so the
// compositor covers what the games need.
//
// Two sources per SWF:
//   timeline — PlaceObject3 / BUTTONRECORD filter lists and blend modes, as the
//              binary reader parses them (exact counts, per placement record)
//   code     — flash.filters class names and BlendMode / blendMode names in the
//              decompressed SWF bytes (AVM1 constant pools, ABC string pools):
//              presence only, a script may build filters at run time
//
//   ./node_modules/.bin/vitest run --config vitest.debug.config.ts filters.census
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { parseSwfBinary } from '@/lib/swf/binary';
import { corpusSwfs, readArrayBuffer } from '@/testing/corpusPaths';
import { itCorpus } from '@/testing/corpus';
import type { DisplayItem, PlaceOp } from '@/types';

const FILTER_CLASSES = [
  'DropShadowFilter', 'BlurFilter', 'GlowFilter', 'BevelFilter', 'GradientGlowFilter',
  'GradientBevelFilter', 'ConvolutionFilter', 'ColorMatrixFilter', 'DisplacementMapFilter', 'ShaderFilter',
];

/** The SWF body after the 8-byte header, decompressed (FWS / CWS; ZWS left as is). */
function body(path: string): string {
  const raw = readFileSync(path);
  const sig = raw.subarray(0, 3).toString('latin1');
  const rest = sig === 'CWS' ? inflateSync(raw.subarray(8)) : raw.subarray(8);
  return rest.toString('latin1');
}

/** Whole-word occurrences (so "BlurFilter" is not counted inside "GradientBlurFilter"). */
const hasWord = (text: string, word: string) => new RegExp(`(^|[^A-Za-z0-9_])${word}([^A-Za-z0-9_]|$)`).test(text);

itCorpus('filters and blend modes the corpus uses', async () => {
  const total = { timeline: new Map<string, number>(), blend: new Map<string, number>(), code: new Map<string, number>() };
  const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
  const lines: string[] = [];
  for (const swf of corpusSwfs()) {
    const { doc } = await parseSwfBinary(readArrayBuffer(swf.path), swf.name);
    const filters = new Map<string, number>(), blends = new Map<string, number>();
    const count = (o: PlaceOp | DisplayItem) => {
      for (const f of o.filters ?? []) bump(filters, f.kind);
      if (o.blendMode && o.blendMode !== 'normal') bump(blends, o.blendMode);
    };
    for (const [id, tl] of doc.timelines) {
      // place records on frames; button records (their synthetic frames repeat a record per state: count frame 0..3 once each)
      if (id.startsWith('button:')) {
        const seen = new Set<DisplayItem>();
        for (const fr of tl.frames) for (const d of fr.display) if (!seen.has(d)) { seen.add(d); count(d); }
      } else for (const fr of tl.frames) for (const op of fr.ops) if (op.op !== 'remove') count(op);
    }
    const text = body(swf.path);
    const code = FILTER_CLASSES.filter((c) => hasWord(text, c));
    if (hasWord(text, 'blendMode')) code.push('blendMode');
    for (const [k, n] of filters) bump(total.timeline, k, n);
    for (const [k, n] of blends) bump(total.blend, k, n);
    for (const c of code) bump(total.code, c);
    const fmt = (m: Map<string, number>) => [...m].map(([k, n]) => `${k}×${n}`).join(' ') || '-';
    if (filters.size || blends.size || code.length) {
      lines.push(`${swf.set}/${swf.name}: timeline filters ${fmt(filters)} | blend ${fmt(blends)} | code ${code.join(' ') || '-'}`);
    }
  }
  const fmt = (m: Map<string, number>, unit: string) => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}${unit}`).join(', ') || 'none';
  console.log([
    ...lines,
    '',
    `timeline filters (placement records): ${fmt(total.timeline, '')}`,
    `timeline blend modes (placement records): ${fmt(total.blend, '')}`,
    `code references (SWFs): ${fmt(total.code, '')}`,
  ].join('\n'));
}, 300_000);
