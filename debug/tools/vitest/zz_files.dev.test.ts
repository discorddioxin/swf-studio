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

it('per-file compile: attribute every error to its file', () => {
  const abc = abcOf(payloads(process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf')[0]);
  const result = transpileAbc({ abc, projectClasses: new Set(abcClassNames(abc)) });
  const text = new Map(result.files.map((f) => [f.path, f.text]));
  const bad: string[] = [];
  for (const f of result.files) {
    const program = linkProgram(compileSources([f]));
    for (const e of program.errors) {
      if (/Cannot resolve import/.test(e.message) && /unsupported|__flash/.test(e.message)) continue;
      if (/Cannot resolve import/.test(e.message)) continue;
      bad.push(`${f.path}: ${e.message}`);
      const m = /\((\d+):(\d+)\)/.exec(e.message);
      if (m && !/super|left-hand/.test(e.message)) {
        const line = Number(m[1]);
        console.log(`${f.path}\n${f.text.split('\n').slice(Math.max(0, line - 2), line + 1).map((l, i) => `  ${line - 1 + i}| ${l}`).join('\n')}`);
      }
    }
  }
  console.log(`files with syntax/type errors: ${bad.length}`);
  const kinds = new Map<string, number>();
  const bucket = (m: string) => m.replace(/ at byte \d+/, '').replace(/\(.*$/, '').trim();
  for (const d of result.diagnostics) kinds.set(bucket(d.message), (kinds.get(bucket(d.message)) ?? 0) + 1);
  console.log('lift refusals by kind:');
  for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`  ${count}  ${kind}`);
  // SWF_LIST=<substring of the reason> lists each refusal with its method.
  if (process.env.SWF_LIST) for (const d of result.diagnostics) if (d.message.includes(process.env.SWF_LIST)) console.log(`REFUSE ${d.where} @${d.offset}: ${d.message}`);
  for (const b of [...new Set(bad.map((x) => x.replace(/\(.*?\)/, '').replace(/from .*$/, '')))].slice(0, 20)) console.log(`  ${b}`);
  // locate 'super' / 'left-hand side' problems: show the offending lines
  for (const [path, t] of text) {
    const lines = t.split('\n');
    lines.forEach((l, i) => {
      if (/\bsuper\b/.test(l) && !/^\s*(export class|export interface|import)/.test(l) && !/extends [A-Za-z_$]/.test(lines[0])) {
        console.log(`SUPER ${path}:${i + 1}: ${l.trim()} | header: ${lines[0]}`);
      }
    });
  }
});
