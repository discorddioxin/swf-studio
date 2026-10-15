// The ABC files inside a SWF, read without the app's SWF reader: tests of the
// ABC reader use this so a SWF-reader mistake cannot hide (or fake) an ABC one.
// Test-only, never bundled.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { parseAbc, type AbcFile } from '@/lib/swf/abc';

/** Every DoABC (82) / DoABC2 (72) tag body of an uncompressed or zlib SWF, including inside sprites. */
export function abcPayloads(file: string): Uint8Array[] {
  const raw = readFileSync(file);
  const buf = raw.subarray(0, 3).toString() === 'CWS' ? Buffer.concat([raw.subarray(0, 8), inflateSync(raw.subarray(8))]) : raw;
  const u16 = (p: number) => buf[p] | (buf[p + 1] << 8);
  const out: Uint8Array[] = [];
  const walk = (start: number, end: number) => {
    let q = start;
    while (q + 2 <= end) {
      const h = u16(q); const type = h >> 6; let len = h & 0x3f; let hdr = 2;
      if (len === 0x3f) { len = buf[q + 2] | (buf[q + 3] << 8) | (buf[q + 4] << 16) | (buf[q + 5] << 24); hdr = 6; }
      const body = q + hdr;
      if (type === 39 && len > 4) walk(body + 4, body + len);
      else if (type === 82 || type === 72) out.push(new Uint8Array(buf.subarray(body, body + len)));
      q += hdr + len;
      if (type === 0 && len === 0) break;
    }
  };
  walk(8 + Math.ceil((5 + 4 * (buf[8] >> 3)) / 8) + 4, buf.length);
  return out;
}

/** The ABC file in a DoABC payload: the first offset (after flags and name) that parses. */
export function abcFrom(payload: Uint8Array): AbcFile {
  let last: unknown;
  for (let o = 0; o < Math.min(payload.length, 512); o++) {
    if (o + 4 > payload.length) break;
    const major = payload[o + 2] | (payload[o + 3] << 8);
    if (major < 40 || major > 70 || (payload[o] | (payload[o + 1] << 8)) > 32) continue;
    try { return parseAbc(payload.subarray(o)); } catch (e) { last = e; }
  }
  throw new Error(`no ABC file in a ${payload.length}-byte DoABC payload (${last})`);
}
