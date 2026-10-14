import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { it } from 'vitest';
import { abcClassNames, parseAbc, type AbcFile } from '@/../decompiler/swf/abc';
import { transpileAbc } from '@/../transpiler/avm2';
import { transform } from 'sucrase';

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

/** `SWF_SHOW=UIScrollBar` prints one emitted module (the first whose path matches). */
it('prints one emitted module', () => {
  const page = process.env.SWF_SHOW ?? 'UIScrollBar';
  const abc = abcOf(payloads('/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf')[0]);
  const result = transpileAbc({ abc, projectClasses: new Set(abcClassNames(abc)) });
  if (process.env.SWF_SHOW_HEADERS) {
    for (const f of result.files) {
      const line = f.text.split('\n').find((l) => /^export (class|interface|function)/.test(l));
      if (line) console.log(`${f.path}: ${line.slice(0, 110)}`);
    }
    return;
  }
  const file = result.files.find((f) => f.path.includes(page));
  if (!file) { console.log(`no module matches ${page}; have: ${result.files.length}`); return; }
  if (process.env.SWF_COMPILE) {
    const out = transform(file.text, { transforms: ['typescript', 'imports'], filePath: file.path, production: true });
    console.log(out.code.split('\n').slice(0, 40).join('\n'));
    return;
  }
  console.log(`=== ${file.path}\n${file.text}`);
});
