import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { it } from 'vitest';
import { abcClassNames, parseAbc, type AbcFile } from '@/../decompiler/swf/abc';
import { transpileAbc } from '@/../transpiler/avm2';
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

const FILE = process.env.PINBALL ?? '/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf';

it('emitted pinball project: syntax + link detail', () => {
  const abc = abcOf(payloads(FILE)[0]);
  const result = transpileAbc({ abc, projectClasses: new Set(abcClassNames(abc)) });
  const byPath = new Map(result.files.map((f) => [f.path, f.text]));

  const under = result.diagnostics.filter((d) => /underflow|merge|loop|falls off/.test(d.message));
  console.log(`lift refusals: ${result.diagnostics.length}; of those non-closure: ${under.length}`);
  for (const d of under.slice(0, 10)) console.log(`  ${d.where} @${d.offset}: ${d.message}`);

  const program = linkProgram(compileSources(result.files));
  console.log(`link errors ${program.errors.length}`);
  const shown = new Set<string>();
  for (const e of program.errors) {
    const m = /Error transforming (.*?): (.*) \((\d+):(\d+)\)/.exec(e.message);
    const key = e.message.replace(/\(.*?\)/g, '(...)').slice(0, 90);
    if (shown.has(key) || shown.size > 14) continue;
    shown.add(key);
    console.log(`ERR ${e.message}`);
    if (!m) continue;
    const text = byPath.get(m[1]);
    if (!text) continue;
    const line = Number(m[3]);
    console.log(text.split('\n').slice(Math.max(0, line - 3), line + 2).map((l, i) => `  ${line - 2 + i}| ${l}`).join('\n'));
  }
  const superBad = [...byPath].find(([, t]) => /super\./.test(t) && !/extends [A-Za-z]/.test(t.split('\n').slice(0, 3).join('\n')));
  if (superBad) console.log(`--- no-extends class using super\n${superBad[1].split('\n').slice(0, 12).join('\n')}`);
});
