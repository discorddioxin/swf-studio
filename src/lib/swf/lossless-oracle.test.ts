// @vitest-environment jsdom
// Lossless bitmap decode vs the committed FFDec PNG exports (the oracle):
// same pixels for palette (fmt3), 15-bit (fmt4) and 24/32-bit (fmt5) bitmaps,
// with Lossless2 premultiplication matching FFDec's PNG output.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { parseSwfXml } from '../parser';
import { parseSwfBinary } from './binary';
import { xmlToSwf } from '../../../tools/xml2swf/xml2swf.mjs';

const EXTERNAL = resolve(__dirname, '../../../game-files/fish-full/external');

interface Decoded { w: number; h: number; rgba: Uint8Array }

/** Minimal PNG reader: bit depth 8, non-interlaced, colour types 0/2/3/6. */
function decodePng(buf: Buffer): Decoded {
  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG depth=${bitDepth} interlace=${interlace}`);
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 0 ? 1 : -1;
  if (channels < 0) throw new Error(`unsupported PNG colour type ${colorType}`);
  const stride = w * channels;
  const out = new Uint8Array(stride * h);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Uint8Array.prototype.slice.call(raw, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      line[i] = v & 0xff;
    }
    out.set(line, y * stride);
    prev = line;
  }
  // normalise to RGBA
  const rgba = new Uint8Array(w * h * 4);
  if (colorType === 6) rgba.set(out);
  else if (colorType === 2) {
    for (let i = 0, j = 0; i < out.length; i += 3, j += 4) {
      rgba[j] = out[i]; rgba[j + 1] = out[i + 1]; rgba[j + 2] = out[i + 2]; rgba[j + 3] = 255;
    }
  } else if (colorType === 3) {
    if (!plte) throw new Error('palette PNG without PLTE');
    for (let i = 0; i < out.length; i++) {
      const idx = out[i];
      rgba[i * 4] = plte[idx * 3];
      rgba[i * 4 + 1] = plte[idx * 3 + 1];
      rgba[i * 4 + 2] = plte[idx * 3 + 2];
      rgba[i * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  } else if (colorType === 0) {
    for (let i = 0; i < out.length; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = out[i];
      rgba[i * 4 + 3] = trns && out[i] === trns.readUInt16BE(0) ? 0 : 255;
    }
  }
  return { w, h, rgba };
}

/** FFDec appends export names: `1_ic_warning_icon.png` → id 1. */
function oraclePng(dir: string, id: number): Buffer | null {
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => new RegExp(`^${id}(_|\\.)`).test(f) && f.endsWith('.png'));
  return hit ? readFileSync(resolve(dir, hit)) : null;
}

describe('lossless images vs FFDec oracle', () => {
  for (const name of ['bassken_fish4.20', 'gsecs2.9']) {
    it(`${name}: decoded PNGs match the committed exports pixel-for-pixel`, async () => {
      const xml = readFileSync(resolve(EXTERNAL, name, `${name}.xml`), 'utf8');
      const xmlDoc = parseSwfXml(xml, { fileName: `${name}.xml` });
      const losslessIds = [...xmlDoc.characters.values()]
        .filter((c: any) => /DefineBitsLossless2?Tag/.test(c.tagType ?? ''))
        .map((c: any) => c.id);
      expect(losslessIds.length).toBeGreaterThan(0);

      const bytes = xmlToSwf(xml);
      const { files } = await parseSwfBinary(bytes.slice().buffer as ArrayBuffer, `${name}.xml`);
      const imageFiles = new Map(files.filter((f) => f.category === 'images').map((f) => [Number(f.name), f]));

      for (const id of losslessIds) {
        const oracleBuf = oraclePng(resolve(EXTERNAL, name, 'images'), id);
        if (!oracleBuf) continue; // FFDec may not export unused ids
        const mine = imageFiles.get(id);
        expect(mine, `image ${id} present in binary output`).toBeTruthy();
        const oracle = decodePng(oracleBuf);
        const decoded = decodePng(Buffer.from(mine!.bytes));
        expect(decoded.w, `id ${id} width`).toBe(oracle.w);
        expect(decoded.h, `id ${id} height`).toBe(oracle.h);
        let mismatch = -1;
        for (let i = 0; i < oracle.rgba.length; i++) {
          if (oracle.rgba[i] !== decoded.rgba[i]) { mismatch = i; break; }
        }
        if (mismatch >= 0) {
          const px = Math.floor(mismatch / 4) % oracle.w;
          const py = Math.floor(mismatch / 4 / oracle.w);
          const at = (arr: Uint8Array) => Array.from(arr.slice((py * oracle.w + px) * 4, (py * oracle.w + px) * 4 + 4));
          expect.fail(`id ${id} pixel (${px},${py}): oracle rgba=${at(oracle.rgba)} mine rgba=${at(decoded.rgba)}`);
        }
      }
    }, 30000);
  }
});
