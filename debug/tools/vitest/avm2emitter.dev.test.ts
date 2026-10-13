// Whole-game gate for the ABC → TypeScript emitter (`transpiler/avm2`).
//
// The committed unit test (`transpiler/avm2/transpile.test.ts`) proves the shape
// on one class. This one is the corpus gate: it lifts *every* body of the
// pinball movie (435 classes, 3,690 method bodies), counts the refusals, and
// links the whole result through the real engine loader. It skips when the
// uploaded corpus is not checked out.
//
//   git clone --depth 1 --branch swf-uploads \
//     https://github.com/discorddioxin/swf-forge.git /tmp/swf-forge2
//
// Assertions are deliberately loose on the refusal rate (it only ever goes
// down) and strict on the two things that mean "the movie could run":
// the project must link with zero errors, and the classes the movie names
// must be there.
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { abcClassNames, parseAbc, type AbcFile } from '@/../decompiler/swf/abc';
import { transpileAbc } from '@/../transpiler/avm2';
import { compileSources, linkProgram } from '@/../src/engine/flash/loader';
import { FLASH_DEFINITIONS } from '@/../src/engine/flash/packages';

const CORPUS = process.env.SWF_CORPUS ?? '/tmp/swf-forge2/games-swfs';
const GAME = `${CORPUS}/pinball-swfs/game.swf`;
const available = existsSync(GAME);

/** Every DoABC payload in a SWF, decompressed. */
function payloads(file: string): Uint8Array[] {
  const raw = readFileSync(file);
  const buf = raw.subarray(0, 3).toString() === 'CWS' ? Buffer.concat([raw.subarray(0, 8), inflateSync(raw.subarray(8))]) : raw;
  const u16 = (p: number) => buf[p] | (buf[p + 1] << 8);
  const out: Uint8Array[] = [];
  const walk = (s: number, e: number) => {
    let q = s;
    while (q + 2 <= e) {
      const h = u16(q); const t = h >> 6; let len = h & 0x3f; let hdr = 2;
      if (len === 0x3f) { len = buf[q + 2] | (buf[q + 3] << 8) | (buf[q + 4] << 16) | (buf[q + 5] << 24); hdr = 6; }
      const b = q + hdr;
      if (t === 39 && len > 4) walk(b + 4, b + len);                        // Sprite (nested tags)
      else if (t === 82 || t === 72) { let end = b + 4; while (buf[end] !== 0) end++; out.push(new Uint8Array(buf.subarray(end + 1, b + len))); }
      q += hdr + len;
      if (t === 0 && len === 0) break;
    }
  };
  walk(8 + Math.ceil((5 + 4 * (buf[8] >> 3)) / 8) + 4, buf.length);
  return out;
}

/** The ABC inside a DoABC payload: past the flags and the tag name, found by scanning. */
function abcOf(p: Uint8Array): AbcFile {
  let last: unknown;
  for (let o = 0; o < Math.min(p.length, 512); o++) {
    if ((p[o + 2] | (p[o + 3] << 8)) < 40 || (p[o + 2] | (p[o + 3] << 8)) > 70) continue;
    try { return parseAbc(p.subarray(o)); } catch (e) { last = e; }
  }
  throw last;
}

describe.skipIf(!available)('ABC → TypeScript, whole movie', () => {
  it('lifts the pinball movie and links it through the engine', () => {
    const abc = abcOf(payloads(GAME)[0]);
    const result = transpileAbc({
      abc,
      projectClasses: new Set(abcClassNames(abc)),
      flashAvailable: (dotted) => FLASH_DEFINITIONS.has(dotted),
    });

    const bodies = abc.bodies.length;
    const refusals = result.diagnostics.length;
    const lines = result.files.reduce((n, f) => n + f.text.split('\n').length, 0);
    console.log(`files ${result.files.length}, lines ${lines}, refusals ${refusals}/${bodies}`);
    const kinds = new Map<string, number>();
    for (const d of result.diagnostics) kinds.set(d.message, (kinds.get(d.message) ?? 0) + 1);
    for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${count}  ${kind}`);

    // A refusal is a method that throws a loud "not lifted yet" instead of running.
    expect(refusals).toBeLessThan(0.1 * bodies);

    const program = linkProgram(compileSources(result.files));
    for (const e of program.errors.slice(0, 10)) console.log(`  ${e.path}: ${e.message.slice(0, 160)}`);
    expect(program.errors).toEqual([]);
    expect(program.classes.length).toBeGreaterThan(0.9 * abc.classes.length);

    // The classes the movie itself points at must be resolvable.
    for (const name of ['com.gaiaonline.games.gPinball.Pinball', 'com.pixel.motion.Tweener', 'com.custom.KeyCheck']) {
      expect(program.getDefinition(name), name).toBeTruthy();
    }
    // A timeline symbol class: what SymbolClass linkage and `addFrameScript` need.
    const Symbol = program.getDefinition('game_fla.mcRampBank_Gate_113') as (new () => Record<string, unknown>) | undefined;
    expect(typeof Symbol).toBe('function');
    expect(() => new Symbol!()).not.toThrow();
  });
});
