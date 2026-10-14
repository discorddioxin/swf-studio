// Scratch: classify bodies by which "hard" opcodes they use, and show a few.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { describe, it } from 'vitest';
import { disassemble, parseAbc, type AbcFile } from '@/../decompiler/swf/abc';

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

const CORPUS_OK = existsSync(process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf');

describe.skipIf(!CORPUS_OK)('corpus harness', () => {
  it('scans bodies for opcodes', () => {
  const file = process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf';
  const abc = abcOf(payloads(file)[0]);
  const kind = process.env.SWF_KIND ?? 'get_scope_object';
  const bodies = abc.bodies.map((b) => ({ b, dis: disassemble(b.code) }));
  const hits = bodies.filter((x) => x.dis.instructions.some((i) => i.name.includes(kind)));
  const depths = new Map<string, number>();
  for (const h of hits) {
    for (const i of h.dis.instructions) if (i.name.includes(kind)) {
      const key = i.name + ' ' + i.operands.join(',');
      depths.set(key, (depths.get(key) ?? 0) + 1);
    }
  }
  console.log(`${hits.length} / ${abc.bodies.length} bodies use ${kind}`);
  if (process.env.SWF_SWITCH) {
    let fwd = 0, back = 0;
    const shapes = new Map<string, number>();
    for (const h of hits) {
      const sw = h.dis.instructions.find((i) => i.name === 'lookup_switch' && i.operands[1] > 0)!;
      const targets = (sw.targets ?? []).slice(0, -1);
      const dflt = sw.target ?? 0;
      const allFwd = dflt > sw.offset && targets.every((t) => t > sw.offset);
      if (allFwd) fwd++; else back++;
      const key = `cases=${targets.length} ${allFwd ? 'forward' : 'backward'}`;
      shapes.set(key, (shapes.get(key) ?? 0) + 1);
    }
    console.log(`  lookupswitch bodies: ${fwd} forward, ${back} with a backward target`);
    for (const [k, n] of [...shapes].sort((a, b) => b[1] - a[1])) console.log(`   ${n}  ${k}`);
  }
  if (process.env.SWF_SAMPLE) {
    const with0 = hits.filter((x) => x.dis.instructions.some((i) => i.name === kind && i.operands[0] === 0));
    for (const x of with0.slice(0, 6)) {
      const names = x.dis.instructions.slice(0, 18).map((i) => `${i.name}${i.operands.length ? '#' + i.operands.join('/') : ''}`);
      console.log(`  body ${x.b.method} (${x.b.code.length}B, locals ${x.b.localCount}): ${names.join(' ')}`);
    }
  }
  for (const [k, n] of [...depths].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${n}  ${k}`);
  // bodies that reference a method index (new_function/new_class) and also read scope objects
  if (process.env.SWF_SHOW_CLOSURES) {
    const closures = new Set<number>();
    for (const x of bodies) for (const i of x.dis.instructions) if (i.name === 'new_function' || i.name === 'new_class') closures.add(i.operands[0]);
    const reading = [...closures].filter((m) => {
      const x = bodies.find((y) => y.b.method === m);
      return x?.dis.instructions.some((i) => i.name.startsWith('get_scope_object') || i.name.startsWith('get_slot') || i.name.startsWith('set_slot'));
    });
    console.log(`closures: ${closures.size}, of which read/write scope slots: ${reading.length}`);
    for (const m of reading.slice(0, 20)) {
      const x = bodies.find((y) => y.b.method === m)!;
      console.log(`  method ${m}|${x.b.code.length}B: ${x.dis.instructions.map((i) => i.name).slice(0, 14).join(' ')}`);
    }
    const m0 = Number(process.env.SWF_SHOW_ID ?? reading[0]);
    const x = bodies.find((y) => y.b.method === m0);
    if (x) for (const i of x.dis.instructions) console.log(`   ${String(i.offset).padStart(4)} ${i.name}${i.operands.length ? ' ' + i.operands.join(',') : ''}${i.target != null ? ' -> ' + i.target : ''}`);
  }
  }, 600_000);
});
