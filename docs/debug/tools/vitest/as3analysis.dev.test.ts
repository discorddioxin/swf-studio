// P-06: the Execute tab's static AS3 summary (`analyzeAs3Program`) must say what
// linking would say, without running anything. For every AVM2 movie of the
// uploaded corpus the static result is compared with an actual `linkProgram`:
// the same exported classes, the same document-class candidates, the same
// unresolved symbol classes, and no import error linking would not also report.
//
//   SWF_CORPUS=/tmp/swf-forge2/games-swfs npx vitest run docs/debug/tools/vitest/as3analysis.dev.test.ts
//
// @vitest-environment jsdom
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from '@/../transcom/decompiler/swf/binary';
import { abcSources } from '@/../src/engine/flash/abc';
import { compileSources, expectedClasses, linkProgram } from '@/../src/engine/flash/loader';
import { analyzeCompiled } from '@/../src/engine/flash/analyze';
import { DisplayObject } from '@/../src/engine/flash/display';

const CORPUS = process.env.SWF_CORPUS ?? '/tmp/swf-forge2/games-swfs';
const movies = existsSync(CORPUS)
  ? readdirSync(CORPUS).flatMap((set) => readdirSync(join(CORPUS, set)).filter((f) => f.endsWith('.swf')).map((f) => join(CORPUS, set, f)))
  : [];

describe.skipIf(!movies.length)('static AS3 analysis agrees with linking (uploaded corpus)', () => {
  it.each(movies)('%s', async (path) => {
    const raw = readFileSync(path);
    const { doc } = await parseSwfBinary(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, path.split('/').pop()!);
    if (!doc.abc?.length) return;
    const compiled = compileSources(abcSources(doc.abc).sources);
    const wanted = expectedClasses(doc);
    const analysis = analyzeCompiled(compiled, wanted);
    const linked = linkProgram(compiled);

    const byName = (a: { qualifiedName: string }, b: { qualifiedName: string }) => a.qualifiedName.localeCompare(b.qualifiedName);
    expect([...analysis.classes].sort(byName)).toEqual([...linked.classes].sort(byName));
    const display = linked.classes
      .filter((c) => { const d = linked.getDefinition(c.qualifiedName); return typeof d === 'function' && d.prototype instanceof DisplayObject; })
      .map((c) => c.qualifiedName);
    expect([...analysis.displayClasses].sort()).toEqual(display.sort());
    expect(analysis.unresolved).toEqual(wanted.filter((name) => !linked.getDefinition(name)));
    const linkMessages = new Set(linked.errors.map((e) => e.message));
    for (const e of analysis.errors) expect([...linkMessages].some((m) => m.includes(e.message.split('. Make sure')[0]))).toBe(true);
    console.log(`${path.split('/').slice(-2).join('/')}: ${analysis.classes.length} classes, ${analysis.displayClasses.length} display, ${analysis.unresolved.length} unresolved, ${analysis.errors.length} static / ${linked.errors.length} link errors`);
  }, 120_000);
});
