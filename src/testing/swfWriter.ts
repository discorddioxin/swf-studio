// Tests only: a minimal, uncompressed SWF writer (SWF file format spec v19,
// "The SWF header" and "Tag format"), enough to wrap a hand-assembled ABC in a
// movie the app's reader parses like any other. Nothing in src/ imports this at
// run time.
import { deflateSync } from 'node:zlib';
import type { SwfFilter } from '@/types';

export interface SwfTag { code: number; body: Uint8Array }

class Bytes {
  private out: number[] = [];
  u8(v: number) { this.out.push(v & 0xff); return this; }
  u16(v: number) { return this.u8(v).u8(v >> 8); }
  u32(v: number) { return this.u16(v & 0xffff).u16(v >>> 16); }
  str(s: string) { this.raw(new TextEncoder().encode(s)); return this.u8(0); }
  raw(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.out.push(b[i]); return this; }
  bytes(): Uint8Array { return Uint8Array.from(this.out); }
}

/** RECT in twips: `UB[5] nbits` then four `SB[nbits]`, padded to a byte. */
function rect(xMin: number, xMax: number, yMin: number, yMax: number): Uint8Array {
  const values = [xMin, xMax, yMin, yMax];
  const nbits = Math.max(1, ...values.map((v) => (v === 0 ? 0 : Math.abs(v).toString(2).length + 1)));
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  put(nbits, 5);
  for (const v of values) put(v & ((1 << nbits) - 1), nbits);
  while (bits.length % 8) bits.push(0);
  return Uint8Array.from({ length: bits.length / 8 }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));
}

/** Bit-packed fields (MATRIX, CXFORM): big-endian bit order, padded to a byte. */
class Bits {
  private bits: number[] = [];
  ub(v: number, n: number) { for (let i = n - 1; i >= 0; i--) this.bits.push((v >> i) & 1); return this; }
  sb(v: number, n: number) { return this.ub(v & ((1 << n) - 1), n); }
  bytes(): Uint8Array {
    const bits = [...this.bits];
    while (bits.length % 8) bits.push(0);
    return Uint8Array.from({ length: bits.length / 8 }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((x, y) => (x << 1) | y, 0));
  }
}
/** Bits a signed field needs to hold every value. */
const signedBits = (values: number[]) => Math.max(1, ...values.map((v) => (v === 0 ? 1 : (v < 0 ? ~v : v).toString(2).length + 1)));

export interface MatrixFields { scaleX?: number; scaleY?: number; tx?: number; ty?: number }
/** MATRIX: optional scale (16.16), no rotation, translation in twips. */
function matrix({ scaleX = 1, scaleY = 1, tx = 0, ty = 0 }: MatrixFields): Uint8Array {
  const b = new Bits();
  if (scaleX !== 1 || scaleY !== 1) {
    const sx = Math.round(scaleX * 65536), sy = Math.round(scaleY * 65536);
    const n = signedBits([sx, sy]);
    b.ub(1, 1).ub(n, 5).sb(sx, n).sb(sy, n);
  } else b.ub(0, 1);
  b.ub(0, 1);
  const n = tx || ty ? signedBits([tx, ty]) : 0;
  b.ub(n, 5);
  if (n) b.sb(tx, n).sb(ty, n);
  return b.bytes();
}

export interface SoundInfoFields {
  syncStop?: boolean; syncNoMultiple?: boolean;
  inPoint?: number; outPoint?: number; loopCount?: number;
  envelope?: { pos44: number; left: number; right: number }[];
}
/** SOUNDINFO: flags (reserved 2, SyncStop, SyncNoMultiple, HasEnvelope, HasLoops, HasOutPoint, HasInPoint), then the fields present. */
function soundInfo(i: SoundInfoFields, b: Bytes) {
  const flags = (i.syncStop ? 0x20 : 0) | (i.syncNoMultiple ? 0x10 : 0) | (i.envelope ? 0x08 : 0)
    | (i.loopCount != null ? 0x04 : 0) | (i.outPoint != null ? 0x02 : 0) | (i.inPoint != null ? 0x01 : 0);
  b.u8(flags);
  if (i.inPoint != null) b.u32(i.inPoint);
  if (i.outPoint != null) b.u32(i.outPoint);
  if (i.loopCount != null) b.u16(i.loopCount);
  if (i.envelope) { b.u8(i.envelope.length); for (const e of i.envelope) b.u32(e.pos44).u16(e.left).u16(e.right); }
}

export interface ButtonRecordFields {
  up?: boolean; over?: boolean; down?: boolean; hit?: boolean; character: number; depth: number;
  /** ButtonHasFilterList / ButtonHasBlendMode (blend mode as the SWF byte) */
  filters?: SwfFilter[]; blendMode?: number;
}

/**
 * FILTERLIST (SWF 19): count, then per filter an id byte and its fields — FIXED
 * 16.16 blur/angle(radians)/distance, FIXED8 strength, FLOAT singles, RGBA colours.
 */
export function filterList(filters: SwfFilter[]): Uint8Array {
  const b = new Bytes().u8(filters.length);
  const fixed = (v: number) => b.u32(Math.round(v * 65536) | 0);
  const fixed8 = (v: number) => b.u16(Math.round(v * 256));
  const f32 = (v: number) => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v, true); b.raw(new Uint8Array(d.buffer)); };
  const rgba = (c: number, a: number) => b.u8(c >> 16).u8(c >> 8).u8(c).u8(Math.round(a * 255));
  const rad = (deg: number) => deg * Math.PI / 180;
  const ids = { dropShadow: 0, blur: 1, glow: 2, bevel: 3, gradientGlow: 4, convolution: 5, colorMatrix: 6, gradientBevel: 7 } as const;
  const placeBits = (t: string) => (t === 'inner' ? 0x80 : 0) | (t === 'full' ? 0x10 : 0);
  for (const f of filters) {
    b.u8(ids[f.kind]);
    switch (f.kind) {
      case 'dropShadow':
        rgba(f.color, f.alpha); fixed(f.blurX); fixed(f.blurY); fixed(rad(f.angle)); fixed(f.distance); fixed8(f.strength);
        b.u8((f.inner ? 0x80 : 0) | (f.knockout ? 0x40 : 0) | (f.hideObject ? 0 : 0x20) | (f.quality & 0x1f));
        break;
      case 'blur': fixed(f.blurX); fixed(f.blurY); b.u8((f.quality & 0x1f) << 3); break;
      case 'glow':
        rgba(f.color, f.alpha); fixed(f.blurX); fixed(f.blurY); fixed8(f.strength);
        b.u8((f.inner ? 0x80 : 0) | (f.knockout ? 0x40 : 0) | 0x20 | (f.quality & 0x1f));
        break;
      case 'bevel':
        rgba(f.highlightColor, f.highlightAlpha); rgba(f.shadowColor, f.shadowAlpha);
        fixed(f.blurX); fixed(f.blurY); fixed(rad(f.angle)); fixed(f.distance); fixed8(f.strength);
        b.u8(placeBits(f.type) | (f.knockout ? 0x40 : 0) | 0x20 | (f.quality & 0x0f));
        break;
      case 'gradientGlow': case 'gradientBevel':
        b.u8(f.colors.length);
        f.colors.forEach((c, i) => rgba(c, f.alphas[i]));
        for (const r of f.ratios) b.u8(r);
        fixed(f.blurX); fixed(f.blurY); fixed(rad(f.angle)); fixed(f.distance); fixed8(f.strength);
        b.u8(placeBits(f.type) | (f.knockout ? 0x40 : 0) | 0x20 | (f.quality & 0x0f));
        break;
      case 'convolution':
        b.u8(f.matrixX).u8(f.matrixY); f32(f.divisor); f32(f.bias);
        for (const v of f.matrix) f32(v);
        rgba(f.color, f.alpha);
        b.u8((f.clamp ? 2 : 0) | (f.preserveAlpha ? 1 : 0));
        break;
      case 'colorMatrix': for (const v of f.matrix) f32(v); break;
    }
  }
  return b.bytes();
}

export interface Place3Fields {
  depth: number; character?: number; move?: boolean; matrix?: MatrixFields; name?: string;
  filters?: SwfFilter[]; /** the SWF byte */ blendMode?: number;
}

export interface CxformFields { mult?: [number, number, number]; add?: [number, number, number] }
/** CXFORM (no alpha): multipliers in 8.8 fixed point, additive terms as given. */
function cxform({ mult, add }: CxformFields): Uint8Array {
  const m = mult?.map((v) => Math.round(v * 256)) ?? [];
  const values = [...m, ...(add ?? [])];
  const n = signedBits(values);
  const b = new Bits().ub(add ? 1 : 0, 1).ub(mult ? 1 : 0, 1).ub(n, 4);
  for (const v of values) b.sb(v, n);
  return b.bytes();
}

/** The record header of one tag: short form below 63 bytes, else long form. */
function tagBytes(out: Bytes, { code, body }: SwfTag) {
  if (body.length < 0x3f) out.u16((code << 6) | body.length);
  else out.u16((code << 6) | 0x3f).u32(body.length);
  out.raw(body);
}

export const tag = {
  end: (): SwfTag => ({ code: 0, body: new Uint8Array() }),
  showFrame: (): SwfTag => ({ code: 1, body: new Uint8Array() }),
  /** DoAction: AVM1 action records, ending with ActionEndFlag (0). Default: `stop();`. */
  doAction: (actions: ArrayLike<number> = [0x07]): SwfTag => ({ code: 12, body: Uint8Array.from([...Array.from(actions), 0x00]) }),
  backgroundColor: (rgb: number): SwfTag => ({ code: 9, body: new Bytes().u8(rgb >> 16).u8(rgb >> 8).u8(rgb).bytes() }),
  /** FileAttributes: ActionScript 3 (0x08), plus UseNetwork (0x01) when asked. */
  /** FileAttributes (tag 69): flags byte (reserved, UseDirectBlit, UseGPU, HasMetadata, ActionScript3, NoCrossDomainCache, reserved, UseNetwork), 24 reserved bits. */
  fileAttributes: ({ as3 = true, network = false, metadata = false } = {}): SwfTag => ({ code: 69, body: new Bytes().u32((metadata ? 0x10 : 0) | (as3 ? 0x08 : 0) | (network ? 0x01 : 0)).bytes() }),
  /** DoABC: `UI32 flags` (1 = lazy initialize), `STRING name`, the ABC file. */
  doAbc: (name: string, abc: Uint8Array, flags = 1): SwfTag => ({ code: 82, body: new Bytes().u32(flags).str(name).raw(abc).bytes() }),
  /** SymbolClass: `UI16 count` then (`UI16 id`, `STRING class`) pairs; id 0 is the document class. */
  symbolClass: (links: [number, string][]): SwfTag => {
    const b = new Bytes().u16(links.length);
    for (const [id, name] of links) b.u16(id).str(name);
    return { code: 76, body: b.bytes() };
  },
  /** DefineSprite: id, frame count, then its own control tags (ShowFrames and End included). */
  defineSprite: (id: number, tags: SwfTag[]): SwfTag => {
    const b = new Bytes().u16(id).u16(tags.filter((t) => t.code === 1).length);
    for (const t of tags) tagBytes(b, t);
    return { code: 39, body: b.bytes() };
  },
  /**
   * DefineBitsLossless (v1, code 20) or DefineBitsLossless2 (v2, code 36): id,
   * format (3 palette, 4 15-bit, 5 32-bit), size, the palette size − 1 for
   * format 3, then `data` (palette + pixel rows, padded as the spec says) zlib'd.
   */
  bitsLossless: (version: 1 | 2, id: number, format: 3 | 4 | 5, width: number, height: number, data: ArrayLike<number>, colorTableSize = 0): SwfTag => {
    const b = new Bytes().u16(id).u8(format).u16(width).u16(height);
    if (format === 3) b.u8(colorTableSize);
    return { code: version === 1 ? 20 : 36, body: b.raw(deflateSync(Uint8Array.from(data))).bytes() };
  },
  /** PlaceObject (tag 4): `UI16 characterId, UI16 depth, MATRIX`, then a CXFORM if given. */
  placeObject: (character: number, depth: number, m: MatrixFields = {}, ct?: CxformFields): SwfTag => {
    const b = new Bytes().u16(character).u16(depth).raw(matrix(m));
    if (ct) b.raw(cxform(ct));
    return { code: 4, body: b.bytes() };
  },
  /** DefineButton2 (tag 34): records with an identity matrix and colour transform, no actions. */
  defineButton2: (id: number, records: ButtonRecordFields[]): SwfTag => {
    const b = new Bytes().u16(id).u8(0).u16(0);
    for (const r of records) {
      b.u8((r.blendMode != null ? 0x20 : 0) | (r.filters ? 0x10 : 0) | (r.hit ? 8 : 0) | (r.down ? 4 : 0) | (r.over ? 2 : 0) | (r.up ? 1 : 0))
        .u16(r.character).u16(r.depth);
      b.raw(matrix({})).raw(new Bits().ub(0, 1).ub(0, 1).ub(1, 4).bytes()); // MATRIX, CXFORMWITHALPHA (no terms)
      if (r.filters) b.raw(filterList(r.filters));
      if (r.blendMode != null) b.u8(r.blendMode);
    }
    return { code: 34, body: b.u8(0).bytes() };
  },
  /**
   * DefineButtonSound (tag 17): ButtonId, then for OverUpToIdle, IdleToOverUp,
   * OverUpToOverDown, OverDownToOverUp a sound id (0 = none) and, if set, its SOUNDINFO.
   */
  defineButtonSound: (button: number, sounds: ([number, SoundInfoFields] | null)[]): SwfTag => {
    const b = new Bytes().u16(button);
    for (let i = 0; i < 4; i++) {
      const s = sounds[i];
      b.u16(s ? s[0] : 0);
      if (s) soundInfo(s[1], b);
    }
    return { code: 17, body: b.bytes() };
  },
  /** RemoveObject (tag 5): `UI16 characterId, UI16 depth`. */
  removeObject: (character: number, depth: number): SwfTag => ({ code: 5, body: new Bytes().u16(character).u16(depth).bytes() }),
  /** RemoveObject2 (tag 28): `UI16 depth`. */
  removeObject2: (depth: number): SwfTag => ({ code: 28, body: new Bytes().u16(depth).bytes() }),
  /** PlaceObject2 of `character` at `depth` (PlaceFlagHasCharacter only, identity matrix). */
  /**
   * PlaceObject3 (tag 70): flags (ClipActions, ClipDepth, Name, Ratio, ColorTransform,
   * Matrix, Character, Move), flags (reserved 3, Image, ClassName, CacheAsBitmap,
   * BlendMode, FilterList), Depth, CharacterId, MATRIX, Name, FILTERLIST, BlendMode.
   */
  placeObject3: (p: Place3Fields): SwfTag => {
    const f1 = (p.name != null ? 0x20 : 0) | (p.matrix ? 0x04 : 0) | (p.character != null ? 0x02 : 0) | (p.move ? 0x01 : 0);
    const f2 = (p.blendMode != null ? 0x02 : 0) | (p.filters ? 0x01 : 0);
    const b = new Bytes().u8(f1).u8(f2).u16(p.depth);
    if (p.character != null) b.u16(p.character);
    if (p.matrix) b.raw(matrix(p.matrix));
    if (p.name != null) b.str(p.name);
    if (p.filters) b.raw(filterList(p.filters));
    if (p.blendMode != null) b.u8(p.blendMode);
    return { code: 70, body: b.bytes() };
  },
  placeObject2: (depth: number, character: number): SwfTag => ({ code: 26, body: new Bytes().u8(0x02).u16(depth).u16(character).bytes() }),
};

export interface SwfOptions {
  version?: number;
  /** stage size in pixels */
  width?: number;
  height?: number;
  frameRate?: number;
  tags: SwfTag[];
}

/** An uncompressed (`FWS`) SWF: header, then the tags. Add `tag.end()` yourself. */
export function writeSwf({ version = 10, width = 320, height = 240, frameRate = 24, tags }: SwfOptions): Uint8Array {
  const body = new Bytes()
    .raw(rect(0, width * 20, 0, height * 20))
    .u16(Math.round(frameRate * 256)) // 8.8 fixed point
    .u16(tags.filter((t) => t.code === 1).length);
  for (const t of tags) tagBytes(body, t);
  const rest = body.bytes();
  return new Bytes().raw([0x46, 0x57, 0x53]).u8(version).u32(8 + rest.length).raw(rest).bytes();
}
