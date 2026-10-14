import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { it } from 'vitest';
import { abcClassNames, parseAbc, type AbcFile } from '@/../decompiler/swf/abc';
import { transpileAbc } from '@/../transpiler/avm2';
import { disassemble, simpleName as _sn } from '@/../decompiler/swf/abc';
import { liftMethod } from '@/../transpiler/avm2';

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

it('dumps the two broken files', () => {
  const abc = abcOf(payloads('/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf')[0]);
  const result = transpileAbc({ abc, projectClasses: new Set(abcClassNames(abc)) });
  for (const f of result.files) {
    if (/Equations\.ts$/.test(f.path)) {
      console.log(f.text);
      const def = abc.classes.find((c) => /Equations$/.test(c.instance.name));
      for (const t of def ? [...def.instance.traits, ...def.traits] : []) {
        if (!/easeOutBounce$/.test(t.name) || t.method == null) continue;
        const body = abc.bodies.find((b) => b.method === t.method);
        if (!body) continue;
        const dis = disassemble(body.code);
        for (const i of dis.instructions) console.log(`${String(i.offset).padStart(4)} ${i.name} ${i.operands.join(', ')}${i.target != null ? ' -> ' + i.target : ''}`);
      }
    }
    if (/BaseTransition\.ts$|ScaleTransitionOut\.ts$|FadeTransitionIn\.ts$/.test(f.path)) {
      console.log(`=== ${f.path}\n${f.text.split('\n').slice(0, 16).join('\n')}`);
      const def = abc.classes.find((c) => c.instance.name === f.path.replace(/\//g, '.').replace(/\.ts$/, ''));
      if (def) console.log(`   flags=${def.instance.flags} super=${def.instance.superName} interfaces=[${[...def.instance.interfaces].join(', ')}] traits=${def.instance.traits.length}`);
    }
    if (/fl\/controls\/UIScrollBar\.ts$/.test(f.path)) {
      const def = abc.classes.find((c) => /UIScrollBar$/.test(c.instance.name));
      const scope = { target: 'instance' as const, memberNames: new Set<string>(), staticMembers: new Set<string>(), staticOwner: 'UIScrollBar', globals: new Set<string>() };
      for (const t of def ? [...def.instance.traits, ...def.traits] : []) {
        if (t.method == null) continue;
        const body = abc.bodies.find((b) => b.method === t.method);
        if (!body) continue;
        const lifted = liftMethod({ abc, body, ...scope, paramNames: [] });
        if (!lifted.stmts) continue;
        const text = JSON.stringify(lifted.stmts);
        if (!text.includes('"setScrollProperties"')) continue;
        console.log(`=== UIScrollBar.${t.name} disassembly`);
        for (const i of disassemble(body.code).instructions) {
          const mn = i.operands.map((o) => (typeof o === 'number' && abc.multinames[o] ? `${o}=${abc.multinames[o].ns ? abc.multinames[o].ns + '::' : ''}${abc.multinames[o].name}` : String(o)));
          console.log(`${String(i.offset).padStart(4)} ${i.name} ${mn.join(', ')}${i.target != null ? ' -> ' + i.target : ''}`);
        }
      }
    }
    if (false) {
      const def = abc.classes.find((c) => /UIScrollBar$/.test(c.instance.name));
      for (const t of def ? [...def.instance.traits, ...def.traits] : []) {
        const body = t.method != null ? abc.bodies.find((b) => b.method === t.method) : undefined;
        if (!body || !/updateScrollProperties|draw/.test(t.name)) continue;
        console.log(`=== ${t.name}`);
        for (const i of disassemble(body.code).instructions) {
          console.log(`${String(i.offset).padStart(4)} ${i.name} ${i.operands.join(', ')}${i.target != null ? ' -> ' + i.target : ''}`);
        }
      }
    }
  }
});
