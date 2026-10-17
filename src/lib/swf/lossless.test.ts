// @vitest-environment jsdom
// Lossless bitmaps (DefineBitsLossless / DefineBitsLossless2) decoded to the
// straight-alpha RGBA the PNG carries, checked against values worked out from
// the SWF spec (v19, "DefineBitsLossless", "DefineBitsLossless2"), not against
// another decoder. lossless-oracle.test.ts compares real movies with FFDec.
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from './binary';
import { decodePng } from '@/testing/png';
import { tag, writeSwf, type SwfTag } from '@/testing/swfWriter';

/** The RGBA pixels the reader produced for character `id` of a movie holding `bitmap`. */
async function decoded(bitmap: SwfTag, id: number): Promise<{ w: number; h: number; pixels: number[][] }> {
  const swf = writeSwf({ version: 8, tags: [bitmap, tag.showFrame(), tag.end()] });
  const { doc, files } = await parseSwfBinary(swf.buffer as ArrayBuffer, 'bitmap.swf');
  expect(doc.warnings).toEqual([]);
  const file = files.find((f) => f.category === 'images' && f.name === String(id));
  expect(file, `image ${id}`).toBeTruthy();
  const { w, h, rgba } = decodePng(Buffer.from(file!.bytes));
  return { w, h, pixels: Array.from({ length: w * h }, (_, i) => [...rgba.subarray(i * 4, i * 4 + 4)]) };
}

describe('lossless bitmaps', () => {
  it('format 5, v1: XRGB — the first byte is reserved, alpha is opaque', async () => {
    // 2×1: the reserved byte is set to show it is not read as red
    const { w, h, pixels } = await decoded(tag.bitsLossless(1, 1, 5, 2, 1, [0x77, 255, 0, 0, 0x77, 0, 128, 255]), 1);
    expect([w, h]).toEqual([2, 1]);
    expect(pixels).toEqual([[255, 0, 0, 255], [0, 128, 255, 255]]);
  });

  it('format 5, v2: premultiplied ARGB comes out straight', async () => {
    // a = 51 (= 255 / 5): premultiplied 10, 20, 0 is straight 50, 100, 0; a = 0 stays transparent black
    const { pixels } = await decoded(tag.bitsLossless(2, 2, 5, 3, 1, [51, 10, 20, 0, 255, 1, 2, 3, 0, 0, 0, 0]), 2);
    expect(pixels).toEqual([[50, 100, 0, 51], [1, 2, 3, 255], [0, 0, 0, 0]]);
  });

  it('format 3, v2: an RGBA palette, rows padded to 32 bits', async () => {
    // 3×2 image, palette of 2: rows are 3 index bytes + 1 pad byte
    const palette = [255, 0, 0, 255, 0, 0, 255, 255];
    const rows = [0, 1, 0, 9, 1, 1, 0, 9];
    const { w, h, pixels } = await decoded(tag.bitsLossless(2, 3, 3, 3, 2, [...palette, ...rows], 1), 3);
    expect([w, h]).toEqual([3, 2]);
    const red = [255, 0, 0, 255], blue = [0, 0, 255, 255];
    expect(pixels).toEqual([red, blue, red, blue, blue, red]);
  });

  it('format 3, v1: an RGB palette — 3 bytes per colour, opaque', async () => {
    // 2×2, palette of 3 (size − 1 = 2): rows are 2 index bytes + 2 pad bytes
    const palette = [255, 0, 0, 0, 255, 0, 0, 0, 255];
    const rows = [0, 1, 9, 9, 2, 0, 9, 9];
    const { pixels } = await decoded(tag.bitsLossless(1, 4, 3, 2, 2, [...palette, ...rows], 2), 4);
    expect(pixels).toEqual([[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255]]);
  });

  it('format 3: an index past the palette is transparent (v2) or black (v1)', async () => {
    // palette of 1; index 7 has no colour. The row's pad bytes must not be read as one.
    const v2 = await decoded(tag.bitsLossless(2, 5, 3, 2, 1, [10, 20, 30, 255, 0, 7, 40, 50], 0), 5);
    expect(v2.pixels).toEqual([[10, 20, 30, 255], [0, 0, 0, 0]]);
    const v1 = await decoded(tag.bitsLossless(1, 6, 3, 2, 1, [10, 20, 30, 0, 7, 40, 50], 0), 6);
    expect(v1.pixels).toEqual([[10, 20, 30, 255], [0, 0, 0, 255]]);
  });

  it('format 4: big-endian PIX15 (reserved bit, then 5 bits each of red, green, blue), rows padded to 32 bits', async () => {
    // 1×3: each row is one 2-byte pixel + 2 pad bytes. 0x7C00 red, 0x03E0 green, 0x2C1F = r 11, b 31
    const rows = [0x7c, 0x00, 9, 9, 0x03, 0xe0, 9, 9, 0x2c, 0x1f, 9, 9];
    const { w, h, pixels } = await decoded(tag.bitsLossless(1, 7, 4, 1, 3, rows), 7);
    expect([w, h]).toEqual([1, 3]);
    // a 5-bit channel c scales to round(c · 255 / 31): 31 → 255, 11 → 90
    expect(pixels).toEqual([[255, 0, 0, 255], [0, 255, 0, 255], [90, 0, 255, 255]]);
  });
});
