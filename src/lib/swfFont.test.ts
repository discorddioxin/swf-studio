// TrueType fonts built from the bundled SWFs' own DefineFont2/3 tags, read back
// with an independent reader: table checksums, glyph count, loca, the cmap from
// the SWF code table and every glyph point against the SWF outline.
// (The same fonts pass OTS, the sanitizer Chrome and Firefox apply to web fonts;
// see docs/debug/tools/vitest/zz_fonts.dev.test.ts.)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from './swf/binary';
import { buildTrueType } from './swfFont';
import { bundledSwfFile, bundledSwfNames } from './__tests__/bundledSet';
import type { SwfCharacter } from '../types';

function readFont(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint16(4);
  const tables = new Map<string, { offset: number; length: number; sum: number }>();
  const tags: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(p, p + 4));
    tags.push(tag);
    tables.set(tag, { sum: v.getUint32(p + 4), offset: v.getUint32(p + 8), length: v.getUint32(p + 12) });
  }
  const sum = (o: number, len: number) => {
    let s = 0;
    for (let i = 0; i < len; i += 4) {
      let w = 0;
      for (let k = 0; k < 4; k++) w = w * 256 + (o + i + k < o + len ? bytes[o + i + k] : 0);
      s = (s + w) >>> 0;
    }
    return s;
  };
  const t = (tag: string) => tables.get(tag)!;
  const numGlyphs = v.getUint16(t('maxp').offset + 4);
  const loca = Array.from({ length: numGlyphs + 1 }, (_, i) => v.getUint32(t('loca').offset + 4 * i));
  // cmap format 4, the single (3,1) subtable
  const sub = t('cmap').offset + v.getUint32(t('cmap').offset + 8);
  const segX2 = v.getUint16(sub + 6);
  const cmap = new Map<number, number>();
  for (let i = 0; i < segX2 / 2; i++) {
    const end = v.getUint16(sub + 14 + 2 * i);
    const start = v.getUint16(sub + 16 + segX2 + 2 * i);
    const delta = v.getUint16(sub + 16 + 2 * segX2 + 2 * i);
    for (let c = start; c <= end && c !== 0xffff; c++) cmap.set(c, (c + delta) & 0xffff);
  }
  const glyph = (g: number) => {
    const o = t('glyf').offset + loca[g];
    if (loca[g + 1] === loca[g]) return [] as { x: number; y: number; on: boolean }[][];
    const contours = v.getInt16(o);
    const ends = Array.from({ length: contours }, (_, i) => v.getUint16(o + 10 + 2 * i));
    const count = ends[ends.length - 1] + 1;
    let p = o + 10 + 2 * contours;
    p += 2 + v.getUint16(p);
    const flags = Array.from(bytes.subarray(p, p + count)); p += count;
    let x = 0, y = 0;
    const xs = flags.map(() => { x += v.getInt16(p); p += 2; return x; });
    const ys = flags.map(() => { y += v.getInt16(p); p += 2; return y; });
    const out: { x: number; y: number; on: boolean }[][] = [];
    let first = 0;
    for (const e of ends) { out.push(flags.slice(first, e + 1).map((f, k) => ({ x: xs[first + k], y: ys[first + k], on: (f & 1) === 1 }))); first = e + 1; }
    return out;
  };
  return { tags, tables, sum, numGlyphs, loca, cmap, glyph, whole: sum(0, bytes.length) };
}

describe('fonts built from the SWF itself', () => {
  it('every embedded font of the bundled set reads back as a valid TrueType font with the SWF glyphs', async () => {
    let checked = 0;
    for (const name of bundledSwfNames()) {
      const b = readFileSync(bundledSwfFile(name));
      const { doc, files } = await parseSwfBinary(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), `${name}.swf`);
      const fonts = [...doc.characters.values()].filter((c): c is SwfCharacter & { font: NonNullable<SwfCharacter['font']> } => c.kind === 'font' && !!c.font);
      for (const c of fonts) {
        const shipped = files.find((f) => f.path === `fonts/${c.id}.ttf`);
        expect(shipped, `${name} font ${c.id} is emitted`).toBeTruthy();
        const bytes = buildTrueType(c.font, c.codeTable ?? []);
        expect(Buffer.from(shipped!.bytes).equals(Buffer.from(bytes))).toBe(true);
        const f = readFont(bytes);
        const label = `${name} font ${c.id} (${c.font.name})`;
        expect(f.tags, label).toEqual([...f.tags].sort());
        expect(f.tags, label).toEqual(['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']);
        for (const [tag, e] of f.tables) {
          if (tag !== 'head') expect(f.sum(e.offset, e.length), `${label} ${tag} checksum`).toBe(e.sum);
        }
        expect(f.whole, `${label} checkSumAdjustment`).toBe(0xb1b0afba);
        expect(f.numGlyphs, label).toBe(c.font.glyphs.length + 1);
        for (let i = 1; i < f.loca.length; i++) expect(f.loca[i]).toBeGreaterThanOrEqual(f.loca[i - 1]);
        expect(f.loca[f.loca.length - 1], label).toBe(f.tables.get('glyf')!.length);
        // the code table, as the SWF stores it
        (c.codeTable ?? []).forEach((code, i) => {
          if ((c.codeTable ?? []).indexOf(code) === i) expect(f.cmap.get(code), `${label} U+${code.toString(16)}`).toBe(i + 1);
        });
        // the glyph points, as the SWF stores them (y flipped, DefineFont3 scaled 2048/20480)
        const scale = c.font.em > 16384 ? 2048 / c.font.em : 1;
        c.font.glyphs.forEach((contours, i) => {
          const expected = contours.map((k) => k.map((p) => ({ x: Math.round(p.x * scale), y: Math.round(-p.y * scale) + 0, on: p.on })));
          const got = f.glyph(i + 1).map((k) => k.map((p) => ({ ...p, y: p.y + 0 })));
          expect(got, `${label} glyph ${i}`).toEqual(expected);
        });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 60000);

  it('glyph outlines have holes: a contour drawn the other way round from its outline', async () => {
    const name = bundledSwfNames().find((n) => n.startsWith('gsecs'))!;
    const b = readFileSync(bundledSwfFile(name));
    const { doc } = await parseSwfBinary(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), `${name}.swf`);
    const area = (k: { x: number; y: number }[]) => k.reduce((s, p, i) => s + p.x * k[(i + 1) % k.length].y - k[(i + 1) % k.length].x * p.y, 0);
    let withHoles = 0;
    for (const c of doc.characters.values()) {
      if (!c.font || !c.codeTable) continue;
      const o = c.codeTable.indexOf('o'.charCodeAt(0));
      if (o < 0) continue;
      const signs = c.font.glyphs[o].map((k) => Math.sign(area(k)));
      expect(signs.length, `font ${c.id} "o" has an outline and a hole`).toBe(2);
      expect(signs[0], `font ${c.id} "o"`).toBe(-signs[1]);
      withHoles++;
    }
    expect(withHoles).toBeGreaterThan(0);
  }, 60000);
});
