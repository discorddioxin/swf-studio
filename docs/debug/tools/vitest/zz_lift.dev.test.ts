import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { it } from 'vitest';
import { abcClassNames, parseAbc, type AbcFile } from '@/../transcom/decompiler/swf/abc';
import { transpileAbc } from '@/../transcom/transpiler/avm2';
import { compileSources, linkProgram } from '@/../src/engine/flash/loader';

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
      if (t === 39 && len > 4) walk(b + 4, b + len);
      else if (t === 82 || t === 72) { let end = b + 4; while (buf[end] !== 0) end++; out.push(new Uint8Array(buf.subarray(end + 1, b + len))); }
      q += hdr + len;
      if (t === 0 && len === 0) break;
    }
  };
  walk(8 + Math.ceil((5 + 4 * (buf[8] >> 3)) / 8) + 4, buf.length);
  return out;
}
function abcOf(p: Uint8Array): AbcFile {
  let last: unknown;
  for (let o = 0; o < Math.min(p.length, 512); o++) {
    if ((p[o + 2] | (p[o + 3] << 8)) < 40 || (p[o + 2] | (p[o + 3] << 8)) > 70) continue;
    try { return parseAbc(p.subarray(o)); } catch (e) { last = e; }
  }
  throw last;
}

const FILE = '/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf';

it('lifts the whole pinball ABC', () => {
  const abc = abcOf(payloads(FILE)[0]);
  console.log(`classes ${abc.classes.length} bodies ${abc.bodies.length} methods ${abc.methods.length}`);
  const result = transpileAbc({ abc, projectClasses: new Set(abcClassNames(abc)) });
  console.log(`files ${result.files.length} diagnostics ${result.diagnostics.length} of ${abc.bodies.length} bodies`);
  const kinds = new Map<string, number>();
  for (const d of result.diagnostics) {
    const key = d.message.replace(/0x[0-9a-f]+/g, '0x..').replace(/#\d+/g, '#');
    kinds.set(key, (kinds.get(key) ?? 0) + 1);
  }
  for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${n}  ${k}`);
  const sample = result.files.find((f) => f.path === 'game_fla/Board_1.ts') ?? result.files.find((f) => f.path.startsWith('game_fla/'));
  if (sample) console.log(`--- ${sample.path}\n${sample.text.split('\n').slice(0, 60).join('\n')}`);
  const program = linkProgram(compileSources(result.files));
  console.log(`link errors ${program.errors.length}`);
  for (const e of program.errors.slice(0, 6)) console.log(`  ${e.message ?? JSON.stringify(e).slice(0, 200)}`);
});
