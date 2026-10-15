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

it('frame script encoding', () => {
  const abc = abcOf(payloads('/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf')[0]);
  const withNames = abc.methods.map((m, i) => ({ i, name: m.name })).filter((m) => m.name);
  console.log(`named methods: ${withNames.length}; samples: ${withNames.slice(0, 24).map((m) => `${m.i}:${m.name}`).join(', ')}`);
  const target = abc.classes.findIndex((c) => /mcRampBank_Gate_113/.test(c.instance.name));
  const def = abc.classes[target];
  console.log(`class #${target} ${def.instance.name} extends ${def.instance.superName} iinit=${def.instance.iinit} cinit=${def.cinit}`);
  console.log(`  instance traits: ${def.instance.traits.map((t) => `${t.name}:${t.kind}${t.method != null ? `#${t.method}` : ''}`).join(', ')}`);
  console.log(`  class traits: ${def.traits.map((t) => `${t.name}:${t.kind}${t.method != null ? `#${t.method}` : ''}`).join(', ')}`);
  const body = abc.bodies.find((b) => b.method === def.instance.iinit);
  if (body) {
    console.log('  iinit:');
    for (const ins of disassemble(body.code).instructions) {
      const extra = (ins.name.startsWith('get_lex') || ins.name.includes('property') || ins.name.includes('call'))
        ? ` ${ins.operands.map((o) => `${o}=${abc.multinames[o] ? `${abc.multinames[o].ns ? abc.multinames[o].ns + ':' : ''}${abc.multinames[o].name}` : '?'}`).join(' ')}` : '';
      console.log(`    ${ins.offset}: ${ins.name}${extra}`);
    }
  }
  // the method table entries surrounding this class's own methods
  const own = [...def.instance.traits, ...def.traits].map((t) => t.method).filter((m): m is number => m != null);
  console.log(`  own method indices: ${own.join(', ')}`);
  const all = abc.bodies.map((b) => b.method).sort((a, b) => a - b);
  const near = all.filter((m) => m >= Math.min(...own, def.instance.iinit) - 3 && m <= Math.max(...own, def.instance.iinit) + 8);
  console.log(`  bodies near: ${near.map((m) => `${m}[${abc.methods[m]?.name || ''}:len=${abc.bodies.find((b) => b.method === m)?.code.length}]`).join(', ')}`);
  console.log(`  total bodies ${abc.bodies.length}`);
});
