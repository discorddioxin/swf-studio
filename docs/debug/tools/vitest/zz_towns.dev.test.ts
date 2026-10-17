import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { describe, it } from 'vitest';
import { abcClassNames, parseAbc, type AbcFile } from '@/../transcom/decompiler/swf/abc';
import { transpileAbc } from '@/../transcom/transpiler/avm2';
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

/** SWF_SHOW=<substring>, SWF_FILE=<path> */
const CORPUS_OK = existsSync(process.env.SWF_FILE ?? corpusPath('pinball-swfs/game.swf'));

describe.skipIf(!CORPUS_OK)('corpus harness', () => {
  it('prints one emitted module from any movie', () => {
  const file = process.env.SWF_FILE ?? corpusPath('towns2-swfs/towns2.swf');
  const page = process.env.SWF_SHOW ?? 'GSIGateway';
  const result = transpileAbc({ abc: abcOf(payloads(file)[0]), projectClasses: new Set(abcClassNames(abcOf(payloads(file)[0]))) });
  const hit = result.files.filter((f) => f.path.includes(page));
  console.log(`matched ${hit.length}: ${hit.map((f) => f.path).slice(0, 4).join(', ')}`);
  const one = hit[0];
  if (!one) return;
  const lines = one.text.split('\n');
  const lo = Number(process.env.SWF_FROM ?? 125);
  const hi = Number(process.env.SWF_TO ?? 155);
  console.log(`=== ${one.path} lines ${lo}-${hi} of ${lines.length}\n` + lines.slice(lo - 1, hi).map((l, n) => `${String(lo + n).padStart(4)}| ${l}`).join('\n'));
  }, 600_000);
});
