// A TrueType font built from an SWF's own embedded font (DefineFont2/DefineFont3).
//
// SWF glyphs are quadratic outlines, which is exactly what TrueType's `glyf` table
// stores: a straight edge is an on-curve point, a curved edge an off-curve control
// point followed by its on-curve anchor. Nothing is approximated, so the font the
// browser draws is the font the movie carries, and no exported font file is needed.
//
// Layout follows the OpenType specification (head, hhea, maxp, OS/2, name, cmap
// format 4, post 3.0, hmtx, loca long, glyf). SWF y points down; TrueType y points up.

import type { SwfFontOutline } from '../types';

/** The em square of the built font and the factor that takes SWF units onto it. */
function emOf(font: SwfFontOutline): { unitsPerEm: number; scale: number } {
  // TrueType allows at most 16384 units per em; DefineFont3's 20480 is scaled to 2048.
  return font.em > 16384 ? { unitsPerEm: 2048, scale: 2048 / font.em } : { unitsPerEm: font.em, scale: 1 };
}

class Out {
  private bytes: number[] = [];
  get length() { return this.bytes.length; }
  u8(v: number) { this.bytes.push(v & 0xff); return this; }
  u16(v: number) { return this.u8(v >> 8).u8(v); }
  i16(v: number) { return this.u16(v < 0 ? v + 0x10000 : v); }
  u32(v: number) { return this.u16(Math.floor(v / 0x10000) & 0xffff).u16(v & 0xffff); }
  tag(s: string) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)); return this; }
  raw(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.bytes.push(b[i]); return this; }
  pad4() { while (this.bytes.length % 4) this.bytes.push(0); return this; }
  done(): Uint8Array { return Uint8Array.from(this.bytes); }
}

function checksum(b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) {
    sum = (sum + ((b[i] << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0))) >>> 0;
  }
  return sum;
}

const clamp16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));

interface BuiltGlyph { data: Uint8Array; xMin: number; yMin: number; xMax: number; yMax: number; points: number; contours: number }

function buildGlyph(contours: SwfFontOutline['glyphs'][number], scale: number): BuiltGlyph {
  const pts = contours.map((c) => c.map((p) => ({ x: clamp16(p.x * scale), y: clamp16(-p.y * scale), on: p.on })));
  const all = pts.flat();
  if (!all.length) return { data: new Uint8Array(0), xMin: 0, yMin: 0, xMax: 0, yMax: 0, points: 0, contours: 0 };
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const p of all) {
    xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
    yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
  }
  const o = new Out();
  o.i16(pts.length).i16(xMin).i16(yMin).i16(xMax).i16(yMax);
  let end = -1;
  for (const c of pts) { end += c.length; o.u16(end); }
  o.u16(0); // no instructions
  for (const p of all) o.u8(p.on ? 1 : 0); // full int16 deltas follow for x and y
  let px = 0, py = 0;
  for (const p of all) { o.i16(p.x - px); px = p.x; }
  for (const p of all) { o.i16(p.y - py); py = p.y; }
  return { data: o.done(), xMin, yMin, xMax, yMax, points: all.length, contours: pts.length };
}

/** cmap format 4 over (code → glyph) pairs: runs of consecutive codes and glyphs share a segment. */
function cmap4(map: Map<number, number>): Uint8Array {
  const codes = [...map.keys()].filter((c) => c >= 0 && c < 0xffff).sort((a, b) => a - b);
  const segs: { start: number; end: number; delta: number }[] = [];
  for (const c of codes) {
    const g = map.get(c)!;
    const last = segs[segs.length - 1];
    if (last && c === last.end + 1 && g === ((c + last.delta) & 0xffff)) last.end = c;
    else segs.push({ start: c, end: c, delta: (g - c) & 0xffff });
  }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const n = segs.length;
  const searchRange = 2 * 2 ** Math.floor(Math.log2(n));
  const sub = new Out();
  sub.u16(4).u16(16 + 8 * n).u16(0).u16(2 * n).u16(searchRange).u16(Math.log2(searchRange / 2)).u16(2 * n - searchRange);
  for (const s of segs) sub.u16(s.end);
  sub.u16(0);
  for (const s of segs) sub.u16(s.start);
  for (const s of segs) sub.u16(s.delta);
  for (let i = 0; i < n; i++) sub.u16(0);
  const body = sub.done();
  return new Out().u16(0).u16(1).u16(3).u16(1).u32(12).raw(body).done();
}

function nameTable(family: string, style: string, postscript: string): Uint8Array {
  const strings: [number, string][] = [
    [1, family], [2, style], [3, `${postscript};swf`], [4, style === 'Regular' ? family : `${family} ${style}`], [6, postscript],
  ];
  const encoded = strings.map(([id, s]) => {
    const b = new Out();
    for (let i = 0; i < s.length; i++) b.u16(s.charCodeAt(i));
    return [id, b.done()] as const;
  });
  const o = new Out().u16(0).u16(encoded.length).u16(6 + 12 * encoded.length);
  let off = 0;
  for (const [id, b] of encoded) { o.u16(3).u16(1).u16(0x409).u16(id).u16(b.length).u16(off); off += b.length; }
  for (const [, b] of encoded) o.raw(b);
  return o.done();
}

/**
 * The TrueType bytes of an SWF font. `codeTable[i]` is the character of SWF glyph
 * `i` (UCS-2, as SWF 6+ stores it), which becomes glyph `i + 1` after `.notdef`.
 */
export function buildTrueType(font: SwfFontOutline, codeTable: readonly number[]): Uint8Array {
  const { unitsPerEm, scale } = emOf(font);
  const glyphs = [buildGlyph([], scale), ...font.glyphs.map((g) => buildGlyph(g, scale))];
  const numGlyphs = glyphs.length;
  const withPoints = glyphs.filter((g) => g.points);
  const bbox = withPoints.length
    ? {
        xMin: Math.min(...withPoints.map((g) => g.xMin)), yMin: Math.min(...withPoints.map((g) => g.yMin)),
        xMax: Math.max(...withPoints.map((g) => g.xMax)), yMax: Math.max(...withPoints.map((g) => g.yMax)),
      }
    : { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  const advances = glyphs.map((g, i) => {
    const adv = i > 0 ? font.advances?.[i - 1] : undefined;
    if (adv != null) return Math.max(0, clamp16(adv * scale));
    return g.points ? Math.max(0, g.xMax) + Math.round(unitsPerEm / 20) : Math.round(unitsPerEm / 4);
  });
  const ascent = font.ascent != null ? clamp16(font.ascent * scale) : Math.max(bbox.yMax, Math.round(unitsPerEm * 0.8));
  const descent = font.descent != null ? clamp16(font.descent * scale) : Math.max(-bbox.yMin, Math.round(unitsPerEm * 0.2));
  const lineGap = font.leading != null ? Math.max(0, clamp16(font.leading * scale)) : 0;

  // glyf + loca (long offsets, every glyph padded to 4 bytes)
  const glyf = new Out();
  const loca = new Out();
  for (const g of glyphs) { loca.u32(glyf.length); glyf.raw(g.data).pad4(); }
  loca.u32(glyf.length);

  const head = new Out()
    .u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5)
    .u16(0x000b).u16(unitsPerEm)
    .u32(0).u32(3029529600).u32(0).u32(3029529600) // created, modified: 2000-01-01 (seconds since 1904)
    .i16(bbox.xMin).i16(bbox.yMin).i16(bbox.xMax).i16(bbox.yMax)
    .u16((font.bold ? 1 : 0) | (font.italic ? 2 : 0))
    .u16(8).i16(2).i16(1).i16(0);

  const lsbs = glyphs.map((g) => (g.points ? g.xMin : 0));
  const hhea = new Out()
    .u32(0x00010000).i16(ascent).i16(-descent).i16(lineGap)
    .u16(Math.max(...advances))
    .i16(withPoints.length ? Math.min(...withPoints.map((g) => g.xMin)) : 0)
    .i16(withPoints.length ? Math.min(...glyphs.map((g, i) => (g.points ? advances[i] - g.xMax : 0))) : 0)
    .i16(bbox.xMax)
    .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0)
    .u16(numGlyphs);

  const maxp = new Out()
    .u32(0x00010000).u16(numGlyphs)
    .u16(Math.max(0, ...glyphs.map((g) => g.points))).u16(Math.max(0, ...glyphs.map((g) => g.contours)))
    .u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

  const hmtx = new Out();
  glyphs.forEach((_, i) => hmtx.u16(advances[i]).i16(lsbs[i]));

  const map = new Map<number, number>();
  codeTable.forEach((code, i) => { if (i < font.glyphs.length && !map.has(code)) map.set(code, i + 1); });
  const codes = [...map.keys()].filter((c) => c < 0xffff);
  const avg = Math.round(advances.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, numGlyphs - 1));
  const os2 = new Out()
    .u16(4).i16(avg).u16(font.bold ? 700 : 400).u16(5).u16(0)
    .i16(unitsPerEm >> 1).i16(unitsPerEm >> 1).i16(0).i16(unitsPerEm >> 3)
    .i16(unitsPerEm >> 1).i16(unitsPerEm >> 1).i16(0).i16(unitsPerEm >> 2)
    .i16(Math.round(unitsPerEm / 20)).i16(Math.round(unitsPerEm / 4))
    .i16(0).raw([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    .u32(1).u32(0).u32(0).u32(0) // Basic Latin
    .tag('SWF ')
    .u16((font.italic ? 1 : 0) | (font.bold ? 0x20 : 0) | (!font.italic && !font.bold ? 0x40 : 0))
    .u16(codes.length ? Math.min(...codes) : 0x20).u16(codes.length ? Math.max(...codes) : 0x20)
    .i16(ascent).i16(-descent).i16(lineGap)
    .u16(Math.max(ascent, bbox.yMax, 0)).u16(Math.max(descent, -bbox.yMin, 0))
    .u32(1).u32(0) // Latin 1 code page
    .i16(Math.round(ascent * 0.5)).i16(Math.round(ascent * 0.7))
    .u16(0).u16(0x20).u16(1);

  const post = new Out()
    .u32(0x00030000).u32(font.italic ? (-12 * 0x10000) >>> 0 : 0)
    .i16(-Math.round(unitsPerEm / 10)).i16(Math.round(unitsPerEm / 20))
    .u32(0).u32(0).u32(0).u32(0).u32(0);

  const family = font.name.replace(/[^\x20-\x7e]/g, '').trim() || 'SWF Font';
  const style = font.bold && font.italic ? 'Bold Italic' : font.bold ? 'Bold' : font.italic ? 'Italic' : 'Regular';
  const postscript = `${family}-${style}`.replace(/[^\x21-\x7e]|[[\](){}<>/%]/g, '').slice(0, 63) || 'SWFFont';

  const tables: [string, Uint8Array][] = ([
    ['OS/2', os2.done()], ['cmap', cmap4(map)], ['glyf', glyf.done()], ['head', head.done()],
    ['hhea', hhea.done()], ['hmtx', hmtx.done()], ['loca', loca.done()], ['maxp', maxp.done()],
    ['name', nameTable(family, style, postscript)], ['post', post.done()],
  ] as [string, Uint8Array][]).sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const n = tables.length;
  const searchRange = 16 * 2 ** Math.floor(Math.log2(n));
  const out = new Out().u32(0x00010000).u16(n).u16(searchRange).u16(Math.log2(searchRange / 16)).u16(n * 16 - searchRange);
  let offset = 12 + 16 * n;
  for (const [tag, data] of tables) {
    out.tag(tag).u32(checksum(data)).u32(offset).u32(data.length);
    offset += (data.length + 3) & ~3;
  }
  for (const [, data] of tables) out.raw(data).pad4();
  const font_ = out.done();
  // head.checkSumAdjustment makes the whole font sum to 0xB1B0AFBA.
  let headOffset = 12 + 16 * n;
  for (const [tag, data] of tables) { if (tag === 'head') break; headOffset += (data.length + 3) & ~3; }
  const adjust = (0xb1b0afba - checksum(font_)) >>> 0;
  new DataView(font_.buffer).setUint32(headOffset + 8, adjust);
  return font_;
}

/** Every SWF font of a document that carries its outlines, as TrueType bytes by character id. */
export function swfFontFiles(characters: Iterable<{ id: number; kind: string; font?: SwfFontOutline; codeTable?: number[] }>): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  for (const c of characters) {
    if (c.kind !== 'font' || !c.font || !c.font.glyphs.length) continue;
    out.set(c.id, buildTrueType(c.font, c.codeTable ?? []));
  }
  return out;
}
