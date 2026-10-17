// Scratch: dump the bodies that use a chosen opcode, with their owners and the
// bodies they call. `SWF_KIND=<opcode substring>` and `SWF_LIMIT=<n>`.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { describe, it } from 'vitest';
import { disassemble, parseAbc, type AbcFile } from '@/../transcom/decompiler/swf/abc';
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

function owners(abc: AbcFile): Map<number, string> {
  const owned = new Map<number, string>();
  for (const c of abc.classes) {
    for (const t of [...c.instance.traits, ...c.traits]) if (t.method != null) owned.set(t.method, `${c.instance.name}::${t.name}(${t.kind})`);
    if (c.instance.iinit != null) owned.set(c.instance.iinit, `${c.instance.name}::<iinit>`);
    if (c.cinit != null) owned.set(c.cinit, `${c.instance.name}::<cinit>`);
  }
  abc.scripts.forEach((s, i) => {
    for (const t of s.traits) if (t.method != null) owned.set(t.method, `<script${i}>::${t.name}(${t.kind})`);
  });
  return owned;
}

const METHOD_FLAG: Record<string, number> = { NEED_ARGUMENTS: 1, NEED_ACTIVATION: 2, NEED_REST: 4, HAS_OPTIONAL: 8, SET_DXNS: 64, HAS_PARAM_NAMES: 128 };
const flagText = (f: number) => Object.entries(METHOD_FLAG).filter(([, b]) => f & b).join('|') || '0';

const CORPUS_OK = existsSync(process.env.SWF_FILE ?? corpusPath('pinball-swfs/game.swf'));

describe.skipIf(!CORPUS_OK)('corpus harness', () => {
  it('dumps bodies using an opcode', () => {
  const file = process.env.SWF_FILE ?? corpusPath('pinball-swfs/game.swf');
  const abc = abcOf(payloads(file)[0]);
  const kind = process.env.SWF_KIND ?? 'newactivation';
  const limit = Number(process.env.SWF_LIMIT ?? 2);
  const owned = owners(abc);
  const bodyOf = new Map(abc.bodies.map((b) => [b.method, b]));
  const show = (mid: number, mark: string) => {
    const b = bodyOf.get(mid);
    if (!b) { console.log(`${mark} ${owned.get(mid) ?? mid}: (no body)`); return; }
    const m = abc.methods[mid];
    console.log(`${mark} ${owned.get(mid) ?? `method ${mid}`} flags=${flagText(m.flags)} params=${m.paramTypes?.length ?? '?'} locals=${b.localCount} maxstack=${b.maxStack} code=${b.code.length}`);
    for (const [k, ex] of b.exceptions.entries()) console.log(`   exception[${k}] from ${ex.from} to ${ex.to} target ${ex.target} type ${ex.type} name ${JSON.stringify(ex.name)}`);
    const ids = new Set(disassemble(b.code).instructions.flatMap((i) => /^newfunction|^newclass|^call|^construct/.test(i.name) ? i.operands.filter((o) => typeof o === 'number') : []));
    const MN = /^(get|set|call|construct|find|coerce|as_|is_|istype|astype|delete|init)_?(prop|property|super|lex|def|slot)?/;
    const named = (i: { name: string; operands: number[] }) => {
      if (!/(property|propstrict|propstatic|_lex|_super|coerce|_type)/.test(i.name)) return '';
      return i.operands
        .map((o, k) => (abc.multinames[o] ? `${k === 0 ? ' ' : ','}${o}=${JSON.stringify(abc.multinames[o].ns ? `${abc.multinames[o].ns}.${abc.multinames[o].name}` : abc.multinames[o].name)}(${abc.multinames[o].kind})` : ''))
        .join('');
    };
    void MN;
    for (const i of disassemble(b.code).instructions) {
      const t = i.target != null ? ` -> ${i.target}` : '';
      console.log(`   ${String(i.offset).padStart(4)} ${i.name}${i.operands.length ? ' ' + i.operands.join(',') : ''}${t}${named(i as never)}`);
    }
    return ids;
  };

  const only = process.env.SWF_METHOD ? Number(process.env.SWF_METHOD) : null;
  if (only != null) { show(only, '=='); return; }
  let n = 0;
  for (const b of abc.bodies) {
    const dis = disassemble(b.code);
    if (!dis.instructions.some((i) => i.name.includes(kind))) continue;
    if (n++ >= limit) break;
    console.log(`\n############ body ${b.method} ${owned.get(b.method) ?? ''}`);
    const ids = show(b.method, '==') ?? new Set<number>();
    // show the closures this body creates
    for (const i of dis.instructions) {
      if (i.name === 'new_function' || i.name === 'new_class') {
        for (const mid of i.operands.filter((o): o is number => typeof o === 'number')) show(mid, `  >> ${i.name}`);
      }
    }
  }
  console.log(`\n(${n} bodies matched ${kind})`);
  }, 600_000);
});
