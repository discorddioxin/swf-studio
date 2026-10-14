// SymbolClass (tag 76) — the linkage an AVM2 movie declares: tag id → AS3 class
// name, where id 0 is the movie's document class.
//
// The tag is `UI16 count` followed by `count` *records*, each `UI16 tagId` then
// `STRING name`. Reading all the ids first and all the names after them happens
// to work for a movie with one export and desynchronises every movie with more
// than one — which is most of them (the pinball game declares 140). The names
// then come out with stray bytes in front and get dropped from the linkage, so
// the movie runs with the wrong classes (or none).
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from './binary';

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
  str(s: string) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this.u8(0); }
}

function tagBytes(type: number, body: number[]): number[] {
  const length = body.length;
  return length < 0x3f
    ? [(type << 6) | length, (type >> 2) & 0xff, ...body]
    : [(type << 6) | 0x3f, (type >> 2) & 0xff, length & 0xff, (length >> 8) & 0xff, (length >> 16) & 0xff, (length >> 24) & 0xff, ...body];
}

/** A one-frame SWF carrying a SymbolClass tag with the given pairs. */
function swfWithSymbols(pairs: [number, string][]): ArrayBuffer {
  const record = new BitWriter().u16(pairs.length);
  for (const [id, name] of pairs) record.u16(id).str(name);
  const body = new BitWriter();
  body.ub(0, 5).align();                  // RECT: 0 bits, empty bounds
  body.u16(0x000c).u16(1);                // frame rate 12, one frame
  body.raw(tagBytes(76, record.bytes));
  body.raw(tagBytes(1, []));              // ShowFrame
  body.raw(tagBytes(0, []));              // End
  const header = new BitWriter().u8(0x46).u8(0x57).u8(0x53).u8(9).u32(8 + body.bytes.length);
  const all = Uint8Array.from([...header.bytes, ...body.bytes]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer;
}

describe('SymbolClass', () => {
  it('keeps every class name of a movie with more than one export', async () => {
    const pairs: [number, string][] = [[0, 'com.game.Main'], [12, 'com.game.Enemy'], [13, 'Hero'], [40000, 'game_fla.mcLights_7']];
    const { doc } = await parseSwfBinary(swfWithSymbols(pairs), 'symbols.swf');
    expect([...(doc.symbolClasses ?? [])]).toEqual(pairs);
  });

  it('reads the document class of a movie with a single export', async () => {
    const { doc } = await parseSwfBinary(swfWithSymbols([[0, 'deck']]), 'deck.swf');
    expect(doc.symbolClasses?.get(0)).toBe('deck');
  });
});
