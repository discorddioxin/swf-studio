import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { it } from 'vitest';
import { disassemble, parseAbc, type AbcFile } from '@/../transcom/decompiler/swf/abc';
import { liftMethod } from '@/../transcom/transpiler/avm2';

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

/** `SWF_REF=UIScrollBar::setScrollProperties` → lift that body, print diagnostic + disassembly. */
it('explains one refusal', () => {
  const [cls, name] = (process.env.SWF_REF ?? 'UIScrollBar::setScrollProperties').split('::');
  const abc = abcOf(payloads('/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf')[0]);
  const def = abc.classes.find((c) => c.instance.name.split('.').pop() === cls);
  if (!def) { console.log(`no class ${cls}`); return; }
  const scope = { target: 'instance' as const, memberNames: new Set<string>(), staticMembers: new Set<string>(), staticOwner: cls, globals: new Set<string>() };
  for (const t of [...def.instance.traits, ...def.traits]) {
    if (t.name.split('.').pop() !== name || t.method == null) continue;
    const body = abc.bodies.find((b) => b.method === t.method);
    if (!body) continue;
    const lifted = liftMethod({ abc, body, ...scope, paramNames: [] });
    console.log(`${t.name}: ${lifted.stmts ? 'lifted' : 'REFUSED ' + JSON.stringify(lifted.diagnostics)}`);
    for (const i of disassemble(body.code).instructions) {
      const ops = i.operands.map((o) => {
        const m = typeof o === 'number' ? abc.multinames[o] : undefined;
        return m ? `${m.ns ? m.ns + '::' : ''}${m.name}|${m.kind}` : String(o);
      });
      console.log(`${String(i.offset).padStart(4)} ${i.name} ${ops.join(', ')}${i.target != null ? ' -> ' + i.target : ''}`);
    }
  }
});
