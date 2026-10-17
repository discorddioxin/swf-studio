import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { it } from 'vitest';
import { disassemble, parseAbc, type AbcFile } from '@/../transcom/decompiler/swf/abc';
import { liftMethod } from '@/../transcom/transpiler/avm2';
import { corpusPath } from '@/testing/corpus';

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

it('KeyCheck.isDown bytecode vs lift', () => {
  const abc = abcOf(payloads(corpusPath('pinball-swfs/game.swf'))[0]);
  for (const cls of abc.classes) {
    if (!/BetterArray$/.test(cls.instance.name)) continue;
    for (const t of [...cls.instance.traits]) {
      if (!/randomize$/.test(t.name) || t.method == null) continue;
      const body = abc.bodies.find((b) => b.method === t.method);
      if (!body) continue;
      const hx = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');
      console.log(`code(${body.code.length}): ${hx(body.code)}`);
      const dis = disassemble(body.code);
      const bounds = new Set(dis.instructions.map((i) => i.offset));
      for (const ins of dis.instructions) {
        console.log(`  ${String(ins.offset).padStart(3)} ${ins.name}${ins.operands.length ? ' ' + ins.operands.join(',') : ''}${ins.target != null ? ` -> ${ins.target}` : ''}${ins.target != null && !bounds.has(ins.target) && ins.target !== body.code.length ? ' (off-boundary!)' : ''}`);
      }
      const result = liftMethod({ abc, body, target: 'class', staticMembers: new Set(cls.traits.map((x) => x.name.split('.').pop() as string)), staticOwner: 'KeyCheck', globals: new Set<string>(), memberNames: new Set<string>() });
      console.log(`lift ok: ${result.stmts ? 'yes' : 'no'} diags=${JSON.stringify(result.diagnostics)}`);
      if (process.env.SWF_JSON) console.log(JSON.stringify(result.stmts, null, 1));
    }
  }
});
