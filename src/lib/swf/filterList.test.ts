// FILTERLIST decoding (SWF 8+).
//
// Every filter kind in a FILTERLIST has a fixed byte size, except the gradient
// and convolution kinds, whose size is derived from a leading colour-count /
// matrix size. A RegisterButton2 record or a PlaceObject3 place record that
// carries a filter list is parsed as a plain sequence — matrix/cxform/filters/
// blend mode — so a single wrong size desynchronises the record. The next byte
// is then read as a filter id, the parser throws `unknown filter N` and the
// whole character (or the whole file, from the timeline pass) is dropped.
//
// The payloads below use distinct non-zero values for every field: with an
// all-zero filter list a wrong size stays invisible, because reading zeroes
// yields `filter 0` (drop shadow) again and again.
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from './binary';

/** MSB-first bit writer, the counterpart of decompiler/swf/bitio.ts's BitReader. */
class BitWriter {
  bytes: number[] = [];
  private bit = 0;
  private value = 0;
  ub(v: number, n: number) {
    for (let i = n - 1; i >= 0; i--) {
      this.value = (this.value << 1) | ((v >> i) & 1);
      if (++this.bit === 8) { this.bytes.push(this.value); this.value = 0; this.bit = 0; }
    }
    return this;
  }
  align() {
    if (this.bit) { this.bytes.push(this.value << (8 - this.bit)); this.value = 0; this.bit = 0; }
    return this;
  }
  u8(v: number) { this.align(); this.bytes.push(v & 0xff); return this; }
  u16(v: number) { return this.u8(v & 0xff).u8((v >> 8) & 0xff); }
  u32(v: number) { return this.u16(v & 0xffff).u16((v >>> 16) & 0xffff); }
  raw(values: number[]) { for (const v of values) this.u8(v); return this; }
  sb(v: number, n: number) { return this.ub(v & ((1 << n) - 1), n); }
  str(s: string) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this.u8(0); }
}

/** little-endian FLOAT32 bytes for a value. */
function f32(v: number): number[] {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, v, true);
  return [...b];
}

/** One FILTER record with distinctive payload bytes (id byte included). */
function filterBytes(id: number): number[] {
  const w = new BitWriter();
  w.u8(id);
  switch (id) {
    case 0: // drop shadow: colour, 4 × FIXED, strength FIXED8, flags
      return (w.raw([0x11, 0x22, 0x33, 0x44])
        .raw(f32(2.5)).raw(f32(3.25)).raw(f32(0.5)).raw(f32(7))
        .raw([0x00, 0x01]).u8(0x01)).bytes;
    case 1: // blur: 2 × FIXED, flags
      return (w.raw(f32(4)).raw(f32(1.5)).u8(0x08)).bytes;
    case 2: // glow: colour, 2 × FIXED, strength FIXED8, flags
      return (w.raw([0x55, 0x66, 0x77, 0x88]).raw(f32(6)).raw(f32(0.25))
        .raw([0x80, 0x00]).u8(0x04)).bytes;
    case 3: // bevel: 2 colours, 4 × FIXED, strength FIXED8, flags
      return (w.raw([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
        .raw(f32(2.5)).raw(f32(3.5)).raw(f32(1.25)).raw(f32(9))
        .raw([0x40, 0x00]).u8(0x02)).bytes;
    case 4: case 7: // gradient glow/bevel: n colours, n ratios, 4 × FIXED, strength, flags
      return (w.u8(3)
        .raw([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xa0, 0xb0, 0xc0])
        .raw([0x11, 0x22, 0x33])
        .raw(f32(1)).raw(f32(2)).raw(f32(3)).raw(f32(4))
        .raw([0x20, 0x00]).u8(0x01)).bytes;
    case 5: // convolution: w, h, divisor, bias, w·h matrix, colour, flags
      return (w.u8(2).u8(3).raw(f32(1)).raw(f32(0.5))
        .raw(f32(1)).raw(f32(2)).raw(f32(3)).raw(f32(4)).raw(f32(5)).raw(f32(6))
        .raw([0xaa, 0xbb, 0xcc, 0xdd]).u8(0x02)).bytes;
    case 6: // colour matrix: 20 × FLOAT
      return (w.raw(Array.from({ length: 20 }, (_, i) => f32(0.5 + i * 0.25)).flat())).bytes;
    default: throw new Error(`test helper: invalid filter id ${id}`);
  }
}

function filterList(ids: number[]): number[] {
  const w = new BitWriter();
  w.u8(ids.length);
  for (const id of ids) w.raw(filterBytes(id));
  return w.bytes;
}

function tagBytes(type: number, body: number[]): number[] {
  const w = new BitWriter();
  if (body.length < 0x3f) w.u16((type << 6) | body.length);
  else w.u16((type << 6) | 0x3f).u32(body.length);
  return [...w.bytes, ...body];
}

/** MATRIX with translation (tx, ty) and no scale/rotation. */
function matrix(w: BitWriter, tx: number, ty: number) {
  return w.ub(0, 1).ub(0, 1).ub(8, 5).sb(tx, 8).sb(ty, 8).align();
}

/** CXFORMWITHALPHA: optional multipliers/adds, all zeroed when absent. */
function cxform(w: BitWriter, mult: number[] | null, add: number[] | null) {
  w.ub(add ? 1 : 0, 1).ub(mult ? 1 : 0, 1).ub(mult || add ? 8 : 0, 4);
  if (mult) for (const v of mult) w.sb(v, 8);
  if (add) for (const v of add) w.sb(v, 8);
  return w;
}

const BUTTON_ID = 23;

/** DefineButton2 with a filtered first record and a second record that acts as a sentinel. */
function buttonBody(list: number[]): number[] {
  const records = new BitWriter();
  records.u8(0x31);                       // Up | ButtonHasFilterList | ButtonHasBlendMode
  records.u16(2).u16(1);                  // characterId, depth
  matrix(records, 7, -3);
  cxform(records, [0x40, 0x80, 0xc0, 0x80], null);
  records.raw(list);
  records.u8(0x03);                       // blend mode
  records.u8(0x01);                       // Up (sentinel record)
  records.u16(0xabcd).u16(2);             // characterId, depth
  matrix(records, -5, 11);
  cxform(records, null, null);
  records.u8(0);                          // end of button records

  const cond = new BitWriter();
  cond.u16(5).u16(0x0008).u8(0x07);       // size, release, stop()

  const w = new BitWriter();
  w.u16(BUTTON_ID).u8(0).u16(2 + records.bytes.length); // id, flags, actionOffset
  return [...w.bytes, ...records.bytes, ...cond.bytes];
}

/** PlaceObject3 that carries every trailing field, filter list included, plus clip actions. */
function placeBody(list: number[], clipDepthFirst = false, withClipActions = true): number[] {
  const w = new BitWriter();
  w.u8(withClipActions ? 0xfe : 0x7e);    // ClipDepth|Name|Ratio|CXFORM|Matrix|Character (+ClipActions)
  w.u8(0x67);                             // HasFilterList|BlendMode|CacheAsBitmap|Visible|BackgroundColour
  w.u16(3);                               // depth
  w.u16(0x0011);                          // characterId
  matrix(w, 1, 2);
  cxform(w, [0xff, 0xfe, 0xfd, 0xfc], [1, 2, 3, 4]);
  w.u16(0x0102);                          // ratio
  if (clipDepthFirst) {                   // the wrong order, for the guard test below
    w.u16(9);                             // clipDepth
    w.str('n1');                          // name
  } else {
    w.str('n1');                          // name (spec: name before clipDepth)
    w.u16(9);                             // clipDepth
  }
  w.raw(list);
  w.u8(0x02);                             // blend mode
  w.u8(1);                                // bitmap cache
  w.u8(0);                                // visible
  w.raw([0xaa, 0xbb, 0xcc, 0xdd]);        // background colour
  if (withClipActions) {
    w.u16(0).u32(1 << 1);                 // clip actions: reserved, allEventFlags (enterFrame)
    w.u32(1 << 1).u32(1).u8(0x07);        // one record: enterFrame, 1 byte of actions
    w.u32(0);                             // end of clip actions
  } else {
    w.u16(0).u32(0).u32(0);               // empty clip actions
  }
  return w.bytes;
}

function swf(opts: { button?: number[]; place?: number[]; placeClipDepthFirst?: boolean; placeClipActions?: boolean }): ArrayBuffer {
  const body = new BitWriter();
  body.ub(0, 5).align();                  // RECT: 0 bits, empty bounds
  body.u16(0x000c).u16(1);                // frame rate 12, one frame
  if (opts.button) body.raw(tagBytes(34, buttonBody(opts.button)));
  if (opts.place) body.raw(tagBytes(70, placeBody(opts.place, opts.placeClipDepthFirst, opts.placeClipActions)));
  body.raw(tagBytes(1, []));              // ShowFrame
  body.raw(tagBytes(0, []));              // End

  const header = new BitWriter();
  const length = 8 + body.bytes.length;
  header.u8(0x46).u8(0x57).u8(0x53).u8(8).u32(length); // FWS, version 8
  const all = Uint8Array.from([...header.bytes, ...body.bytes]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer;
}

const CLIP_ACTION_SCRIPT = 'scripts/frame_1/PlaceObject2_17_3/CLIPACTIONRECORD onClipEvent(enterFrame).as';

/** A SWF whose timeline carries the given tag bodies verbatim. */
function swfWithRawTags(tags: { type: number; body: number[] }[]): ArrayBuffer {
  const body = new BitWriter();
  body.ub(0, 5).align();                  // RECT: 0 bits
  body.u16(0x000c).u16(1);                // frame rate 12, one frame
  for (const t of tags) body.raw(tagBytes(t.type, t.body));
  body.raw(tagBytes(1, []));              // ShowFrame
  body.raw(tagBytes(0, []));              // End

  const header = new BitWriter();
  const length = 8 + body.bytes.length;
  header.u8(0x46).u8(0x57).u8(0x53).u8(8).u32(length);
  const all = Uint8Array.from([...header.bytes, ...body.bytes]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer;
}

const bytesOf = (hex: string) => hex.trim().split(/\s+/).map((h) => parseInt(h, 16));

describe('FILTERLIST decoding', () => {
  it('keeps the record aligned after a filter list on a button record', async () => {
    const { doc, files } = await parseSwfBinary(swf({ button: filterList([0]) }), 'button-filter.swf');
    expect(doc.warnings).toEqual([]);
    const button = doc.characters.get(BUTTON_ID);
    expect(button?.kind).toBe('button');
    const timeline = doc.timelines.get(`button:${BUTTON_ID}`);
    const up = timeline?.frames[0].display ?? [];
    expect(up.map((d) => [d.characterId, d.depth])).toEqual([[2, 1], [0xabcd, 2]]);
    expect(up[1].matrix).toMatchObject({ tx: -5, ty: 11 });
    expect(files.some((f) => f.path === `scripts/DefineButton2_${BUTTON_ID}/BUTTONCONDACTION on(release).as`)).toBe(true);
  });

  for (const id of [0, 1, 2, 3, 4, 5, 6, 7]) {
    it(`keeps the record aligned after a ${id} filter list`, async () => {
      const { doc } = await parseSwfBinary(swf({ button: filterList([id]) }), `button-filter-${id}.swf`);
      expect(doc.warnings).toEqual([]);
      const up = doc.timelines.get(`button:${BUTTON_ID}`)?.frames[0].display ?? [];
      expect(up.map((d) => d.characterId)).toEqual([2, 0xabcd]);
    });
  }

  it('keeps the record aligned after every filter kind in one list', async () => {
    const { doc } = await parseSwfBinary(swf({ button: filterList([0, 1, 2, 3, 4, 5, 6, 7]) }), 'button-all.swf');
    expect(doc.warnings).toEqual([]);
    const up = doc.timelines.get(`button:${BUTTON_ID}`)?.frames[0].display ?? [];
    expect(up.map((d) => d.characterId)).toEqual([2, 0xabcd]);
  });

  it('keeps a place record aligned through filters, blend, cache, visibility and clip actions', async () => {
    const { doc, files } = await parseSwfBinary(
      swf({ place: filterList([0, 3, 6]) }), 'place-filter.swf',
    );
    expect(doc.warnings).toEqual([]);
    const display = doc.timelines.get('root')?.frames[0].display ?? [];
    expect(display.find((d) => d.depth === 3)).toMatchObject({
      characterId: 0x0011, name: 'n1', clipDepth: 9, hasFilters: true,
    });
    expect(files.some((f) => f.path === CLIP_ACTION_SCRIPT)).toBe(true);
  });

  it('still reports a filter id that is not in the format', async () => {
    // raw FILTERLIST: one filter, id 9 — not a filter kind the format defines
    const { doc } = await parseSwfBinary(swf({ button: [1, 9] }), 'button-bad-filter.swf');
    expect(doc.warnings.join('\n')).toMatch(/unknown filter 9 \(DefineButton2 #23/);
  });
});

// A record that does not consume its tag is a misparse, not a quirk: every
// structure inside it has a fixed size. These checks are what caught the
// Name/ClipDepth swap — the reader and the writer had it wrong together, so the
// re-serialising round-trip stayed green and only the raw bytes disagreed.
describe('placed-record layout', () => {
  it('reports place records that leave bytes behind, and nothing for correct ones', async () => {
    const good = await parseSwfBinary(swf({ place: filterList([0]) }), 'good.swf');
    expect(good.doc.warnings).toEqual([]);

    const bad = await parseSwfBinary(
      swf({ place: filterList([0]), placeClipDepthFirst: true, placeClipActions: false }), 'bad.swf',
    );
    expect(bad.doc.warnings.join('\n')).toMatch(/PlaceObject3 depth 3: \d+ byte\(s\) left after the last field/);
    // and the values a reader would derive from the swapped layout
    const display = bad.doc.timelines.get('root')?.frames[0].display ?? [];
    const rec = display.find((d) => d.depth === 3) as { name?: string; clipDepth?: number } | undefined;
    expect(rec?.name).not.toBe('n1');
    expect(rec?.clipDepth).toBeGreaterThan(0x1000);
  });
});

// Real bytes, verbatim from the game SWFs the user uploaded (branch
// `swf-uploads` of discorddioxin/swf-forge, games-swfs/): a 376-filter-list
// corpus across six game sets. Each record below is one the pre-fix filter
// sizes misread — the ids they landed on are what the loader then reported.
describe('records from the uploaded game sets', () => {
  it('reads the record behind the reported "unknown filter 51"', async () => {
    // pinball-swfs/game.swf, sprite 528, depth 9: a filtered Glow + Bevel.
    // Pre-fix sizes over-consumed the Glow by 6 bytes and read the next filter
    // id from the middle of the Bevel payload: `unknown filter 51`, which
    // rejected the whole 1.8 MB file at load time.
    const record = bytesOf(`
      01 01 09 00 02 02 00 99 00 ff 00 00 01 00 00 00 01 00 00 02 e3 03
      ff ff ff ff 66 33 00 ff 00 00 01 00 00 00 01 00 1f 92 01 00 00 00 01 00 33 01 33`);
    const { doc } = await parseSwfBinary(swfWithRawTags([{ type: 70, body: record }]), 'pinball-game.swf');
    expect(doc.warnings).toEqual([]);
    const frames = doc.timelines.get('root')?.frames ?? [];
    expect(frames[0]?.ops[0]).toMatchObject({ depth: 9, hasFilters: true });
  });

  it('reads a filtered place record that carries a name', async () => {
    // towns2-swfs/towns2.swf, sprite 124, depth 4 (name "fText" — the file
    // contains `19 23 7e f6 66 54 65 78 74 00`, so the matrix ends before the
    // "f"): DropShadow + Glow. Pre-fix sizes stayed inside the tag by luck and
    // read [0, 0] — the glow came back as a second drop shadow and every field
    // after it drifted.
    const record = bytesOf(`
      26 01 04 00 6e 00 19 23 7e f6 66 54 65 78 74 00 02 00 00 00 00 cc
      00 00 02 00 00 00 01 00 1f 92 01 00 33 33 01 00 80 01 21 02 00 00
      00 ff 00 00 02 00 00 00 01 00 b3 00 21`);
    const { doc } = await parseSwfBinary(swfWithRawTags([{ type: 70, body: record }]), 'towns2.swf');
    expect(doc.warnings).toEqual([]);
    const display = doc.timelines.get('root')?.frames[0]?.display ?? [];
    expect(display[0]).toMatchObject({ depth: 4, characterId: 0x006e, name: 'fText', hasFilters: true });
  });

  it('reads a filtered button record', async () => {
    // word-bump-swfs/wordbump_game1.4.swf, DefineButton2 #541: two records, the
    // second with four DropShadow filters. Pre-fix sizes ended the list on an
    // id of 9 and the tag was dropped with `unknown filter 9`; the records now
    // end exactly where the conditional actions start (byte 125 of the body).
    const record = bytesOf(`
      1d 02 00 7a 00 0f 1b 02 01 00 00 04 1f 1c 02 02 00 c1 b3 35 b3 34
      c4 3b 08 70 04 04 00 00 66 ff ff 00 00 00 00 00 00 00 00 5f b6 04
      00 00 00 01 00 99 00 23 00 00 66 ff ff 00 00 00 00 00 00 00 00 3f
      24 03 00 00 00 01 00 99 00 23 00 00 66 ff ff 00 00 00 00 00 00 00
      00 1f 92 01 00 00 00 02 00 99 00 23 00 00 66 ff ff 00 00 01 00 00
      00 01 00 00 00 00 00 00 00 02 00 a1 00 23 00 00 00 08 00 96 09 00
      00 5f 70 61 72 65 6e 74 00 1c 96 10 00 00 6d 63 53 65 6e 64 54 6f
      46 72 69 65 6e 64 00 4e 96 0c 00 00 5f 76 69 73 69 62 6c 65 00 05
      01 4f 00`);
    const { doc } = await parseSwfBinary(swfWithRawTags([{ type: 34, body: record }]), 'wordbump.swf');
    expect(doc.warnings).toEqual([]);
    expect(doc.characters.get(541)?.kind).toBe('button');
    const display = doc.timelines.get('button:541')?.frames[0].display ?? [];
    expect(display.length).toBeGreaterThan(0);
    // the filtered record is the one with the four drop shadows
    expect(display.some((d) => d.hasFilters)).toBe(true);
  });
});
