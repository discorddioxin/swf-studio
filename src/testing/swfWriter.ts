// Tests only: a minimal, uncompressed SWF writer (SWF file format spec v19,
// "The SWF header" and "Tag format"), enough to wrap a hand-assembled ABC in a
// movie the app's reader parses like any other. Nothing in src/ imports this at
// run time.
import { deflateSync } from 'node:zlib';

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

/** The record header of one tag: short form below 63 bytes, else long form. */
function tagBytes(out: Bytes, { code, body }: SwfTag) {
  if (body.length < 0x3f) out.u16((code << 6) | body.length);
  else out.u16((code << 6) | 0x3f).u32(body.length);
  out.raw(body);
}

export const tag = {
  end: (): SwfTag => ({ code: 0, body: new Uint8Array() }),
  showFrame: (): SwfTag => ({ code: 1, body: new Uint8Array() }),
  backgroundColor: (rgb: number): SwfTag => ({ code: 9, body: new Bytes().u8(rgb >> 16).u8(rgb >> 8).u8(rgb).bytes() }),
  /** FileAttributes: ActionScript 3 (0x08), plus UseNetwork (0x01) when asked. */
  fileAttributes: ({ as3 = true, network = false } = {}): SwfTag => ({ code: 69, body: new Bytes().u32((as3 ? 0x08 : 0) | (network ? 0x01 : 0)).bytes() }),
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
  /** PlaceObject2 of `character` at `depth` (PlaceFlagHasCharacter only, identity matrix). */
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
