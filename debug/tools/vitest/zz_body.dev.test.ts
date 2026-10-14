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

/** SWF_BODY=<body index> prints a whole method body: `SWF_FROM`/`SWF_TO` clip it. */
const CORPUS_OK = existsSync(process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf') && !!process.env.SWF_BODY;

describe.skipIf(!CORPUS_OK)('corpus harness', () => {
  it('disassembles a whole body', () => {
    const abc = abcOf(payloads(process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf')[0]);
    const want = Number(process.env.SWF_BODY);
    const owned = new Map<number, string>();
    for (const c of abc.classes) {
      for (const t of [...c.instance.traits, ...c.traits]) if (t.method != null) owned.set(t.method, `${c.instance.name}::${t.name}`);
      if (c.instance.iinit != null) owned.set(c.instance.iinit, `${c.instance.name}::<iinit>`);
    }
    const body = abc.bodies.find((b) => b.method === want);
    if (!body) throw new Error(`no body for method ${want}`);
    console.log(`##### ${owned.get(body.method) ?? body.method} body=${body.method} bytes=${body.code.length} locals=${body.localCount}`);
    for (const ex of body.exceptions ?? []) console.log(`exception from=${ex.from} to=${ex.to} target=${ex.target} type=${ex.type} name=${ex.name}`);
    const from = Number(process.env.SWF_FROM ?? 0);
    const to = Number(process.env.SWF_TO ?? Number.MAX_SAFE_INTEGER);
    for (const i of disassemble(body.code).instructions) {
      if (i.offset < from || i.offset > to) continue;
      console.log(`${String(i.offset).padStart(4)} ${i.name}${i.operands.length ? ' ' + i.operands.join(',') : ''}${i.target != null ? ' -> ' + i.target : ''}${i.targets?.length ? ' -> [' + i.targets.join(',') + ']' : ''}`);
    }
  }, 600_000);
});
