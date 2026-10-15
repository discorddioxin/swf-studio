import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { it } from 'vitest';
import { disassemble, parseAbc, type AbcFile } from '@/../transcom/decompiler/swf/abc';

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

it('dumps one transition init body', () => {
  const abc = abcOf(payloads('/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf')[0]);
  for (const cls of abc.classes) {
    if (!/FadeTransitionOut$/.test(cls.instance.name)) continue;
    console.log(`class ${cls.instance.name} extends ${cls.instance.superName}`);
    for (const t of [...cls.instance.traits, ...cls.traits]) {
      if (t.kind !== 'method' || t.method == null) continue;
      const body = abc.bodies.find((b) => b.method === t.method);
      if (!body) continue;
      console.log(`  ${t.name} method#${t.method} len=${body.code.length} localCount=${body.localCount} maxStack=${body.maxStack}`);
      const dis = disassemble(body.code);
      for (const ins of dis.instructions) {
        const names = ins.operands.map((o) => (ins.name.includes('lex') || ins.name.includes('prop') || ins.name.includes('super') || ins.name.includes('method') || ins.name.includes('find') || ins.name.includes('class') || ins.name.includes('function')) ? `#${o}(${abc.multinames[o] ? `${abc.multinames[o].ns ? abc.multinames[o].ns + '.' : ''}${abc.multinames[o].name}:${abc.multinames[o].kind}` : '?'})` : o).join(',');
        console.log(`    ${String(ins.offset).padStart(4)} ${ins.name} ${names}${ins.target != null ? ` -> ${ins.target}` : ''}`);
      }
      for (const ex of body.exceptions) console.log(`    exception ${ex.from}-${ex.to} -> ${ex.target} type=${ex.type} name=${ex.name}`);
    }
  }
});
