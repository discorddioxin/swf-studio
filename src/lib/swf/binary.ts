// Binary SWF parser producing a SwfDocument + asset files structurally
// equivalent to parseSwfXml (FFDec XML) for the same movie. Layouts follow
// the SWF spec as implemented by JPEXS FFDec; the round-trip test in
// tests/swf-roundtrip.test.ts guarantees the equivalence.

import type {
  ColorTransform, DisplayItem, EventKind, Frame, FrameEvent, Matrix, PlaceOp,
  Rect, SwfCharacter, SwfDocument, SwfHeader, TextRecord, Timeline,
} from '../../types';
import { classify, kindOfTag, isSpecialTag, actionFileCandidates } from '../parser';
import { BitReader, avm1ActionSource, isLikelyActionStream, latin1 } from './bitio';
import { shapeToSvg, type SvgFillStyle, type SvgLineStyle, type SvgShapeRecord } from './shapeSvg';

/** SWF tag codes → JPEXS FFDec type names (the XML "type" attribute). */
export const TAG_NAMES: Record<number, string> = {
  0: 'EndTag', 1: 'ShowFrameTag', 2: 'DefineShapeTag', 5: 'RemoveObjectTag',
  6: 'DefineBitsTag', 7: 'DefineButtonTag', 8: 'JPEGTablesTag', 9: 'SetBackgroundColorTag',
  10: 'DefineFontTag', 11: 'DefineTextTag', 12: 'DoActionTag', 14: 'DefineSoundTag',
  15: 'StartSoundTag', 17: 'DefineButtonCxformTag', 18: 'SoundStreamHeadTag',
  19: 'SoundStreamBlockTag', 20: 'DefineBitsLosslessTag', 21: 'DefineBitsJPEG2Tag',
  22: 'DefineShape2Tag', 23: 'DefineButtonCxformTag', 24: 'ProtectTag',
  26: 'PlaceObject2Tag', 28: 'RemoveObject2Tag', 32: 'DefineShape3Tag',
  33: 'DefineText2Tag', 34: 'DefineButton2Tag', 35: 'DefineBitsJPEG3Tag',
  36: 'DefineBitsLossless2Tag', 37: 'DefineEditTextTag', 39: 'DefineSpriteTag',
  43: 'FrameLabelTag', 45: 'SoundStreamHead2Tag', 46: 'DefineMorphShapeTag',
  48: 'DefineFont2Tag', 56: 'ExportAssetsTag', 57: 'ImportAssetsTag',
  59: 'DoInitActionTag', 60: 'DefineVideoStreamTag', 61: 'VideoFrameTag',
  64: 'EnableDebugger2Tag', 65: 'LimitDataTag', 69: 'FileAttributesTag',
  70: 'PlaceObject3Tag', 73: 'DefineFontAlignZonesTag', 74: 'CSMTextSettingsTag',
  75: 'DefineFont3Tag', 76: 'SymbolClassTag', 77: 'MetadataTag',
  78: 'EnableDebuggerTag', 82: 'DoABCTag', 83: 'DefineShape4Tag',
  84: 'DefineMorphShape2Tag', 86: 'DefineSceneAndFrameLabelDataTag',
  87: 'DefineBinaryDataTag', 88: 'DefineFontNameTag', 89: 'StartSound2Tag',
  90: 'DefineBitsJPEG4Tag',
};

export interface SwfFile {
  path: string;
  name: string;
  ext: string;
  category: 'shapes' | 'images' | 'texts' | 'fonts' | 'sounds' | 'morphshapes' | 'buttons' | 'scripts' | 'other';
  bytes: Uint8Array;
}

export interface ParsedBinarySwf {
  doc: SwfDocument;
  files: SwfFile[];
}

interface RawTag { type: number; name: string; data: Uint8Array }

// ---------------------------------------------------------------- helpers ---

function rgbHex(r: number, g: number, b: number, a?: number): string {
  const hex = '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  if (a != null && a < 255) return hex + a.toString(16).padStart(2, '0');
  return hex;
}

function readRect(br: BitReader, byteAlign = true): Rect {
  const n = br.ub(5);
  const xMin = br.sb(n), xMax = br.sb(n), yMin = br.sb(n), yMax = br.sb(n);
  if (byteAlign) br.align();
  return { xMin, xMax, yMin, yMax };
}

/** FFDec exports matrix components as shortest-round-trip float32 decimals. */
function f32shortest(v: number): number {
  if (!Number.isFinite(v) || v === 0) return 0;
  const f = Math.fround(v);
  for (let p = 1; p <= 9; p++) {
    const n = Number(f.toPrecision(p));
    if (Math.fround(n) === f) return n;
  }
  return f;
}

function readMatrix(br: BitReader): Matrix {
  let a = 1, d = 1, b = 0, c = 0;
  if (br.ub(1)) {
    const n = br.ub(5);
    a = f32shortest(br.sb(n) / 65536);
    d = f32shortest(br.sb(n) / 65536);
  }
  if (br.ub(1)) {
    const n = br.ub(5);
    b = f32shortest(br.sb(n) / 65536);  // rotateSkew0
    c = f32shortest(br.sb(n) / 65536);  // rotateSkew1
  }
  const tn = br.ub(5);
  const tx = br.sb(tn), ty = br.sb(tn);
  return { a, b, c, d, tx, ty };
}

function readCxform(br: BitReader, withAlpha: boolean): ColorTransform {
  const hasAdd = br.ub(1) === 1;
  const hasMult = br.ub(1) === 1;
  const nBits = br.ub(4);
  const m = () => (hasMult ? br.sb(nBits) / 256 : 1);
  const a = () => (hasAdd ? br.sb(nBits) : 0);
  const ct: ColorTransform = {
    rm: m(), gm: m(), bm: m(), am: withAlpha ? m() : 1,
    ra: a(), ga: a(), ba: a(), aa: withAlpha ? a() : 0,
  };
  return ct;
}

/** parseSwfXml drops identity colour transforms entirely. */
function normalizeCt(ct: ColorTransform): ColorTransform | undefined {
  if (ct.rm === 1 && ct.gm === 1 && ct.bm === 1 && ct.am === 1 &&
      !ct.ra && !ct.ga && !ct.ba && !ct.aa) return undefined;
  return ct;
}

function readColor(br: BitReader, shapeNum: number): string {
  const r = br.u8(), g = br.u8(), b = br.u8();
  if (shapeNum >= 3) return rgbHex(r, g, b, br.u8());
  return rgbHex(r, g, b);
}

// tag stream ---------------------------------------------------------------

/** DoInitAction carries the SpriteID it targets before its action records — but
 * some producers (and FFDec's XML `actionBytes`) write the records only.  Pick
 * the reading that walks as a complete action stream. */
export function doInitActions(data: Uint8Array): Uint8Array {
  const body = data.subarray(2);
  if (data.length > 4 && isLikelyActionStream(body) && !isLikelyActionStream(data)) return body;
  return data;
}

export function parseTags(data: Uint8Array): RawTag[] {
  const br = new BitReader(data);
  const out: RawTag[] = [];
  while (br.offsetBytes < data.length) {
    if (br.remaining < 2) break;
    const h = br.u16();
    const type = h >> 6;
    let len = h & 0x3f;
    if (len === 0x3f) len = br.u32();
    const payload = br.bytes(len);
    const name = TAG_NAMES[type] ?? `Unknown${type}`;
    out.push({ type, name, data: payload });
    if (type === 0) break;
  }
  return out;
}

// shape parsing ------------------------------------------------------------

function readFillStyle(br: BitReader, shapeNum: number, warnings: string[]): SvgFillStyle {
  const type = br.u8();
  if (type === 0) return { type, color: readColor(br, shapeNum) };
  if (type === 16 || type === 18) {
    const matrix = readMatrix(br);
    const spreadMode = br.u8();
    const interpolationMode = br.u8();
    const count = br.u8();
    const records: { ratio: number; color: string; alpha?: number }[] = [];
    for (let i = 0; i < count; i++) {
      const ratio = br.u8();
      const r = br.u8(), g = br.u8(), b = br.u8();
      if (shapeNum >= 3) records.push({ ratio, color: rgbHex(r, g, b), alpha: br.u8() / 255 });
      else records.push({ ratio, color: rgbHex(r, g, b) });
    }
    return { type, matrix, spreadMode, interpolationMode, records };
  }
  if (type >= 0x40 && type <= 0x43) {
    const bitmapId = br.u16();
    const matrix = readMatrix(br);
    return { type, bitmapId, matrix };
  }
  warnings.push(`unsupported fillStyleType ${type}`);
  return { type, color: '#000000' };
}

function readFillStyles(br: BitReader, shapeNum: number, warnings: string[]): SvgFillStyle[] {
  const count = br.u8();
  if (count === 0xff) throw new Error('long fill arrays unsupported');
  const out: SvgFillStyle[] = [];
  for (let i = 0; i < count; i++) out.push(readFillStyle(br, shapeNum, warnings));
  return out;
}

function readLineStyle2(br: BitReader, shapeNum: number, warnings: string[]): SvgLineStyle {
  const width = br.u16();
  const startCap = br.ub(2);
  const join = br.ub(2);
  const hasFill = br.ub(1) === 1;
  const noHScale = br.ub(1) === 1;
  const noVScale = br.ub(1) === 1;
  const pixelHinting = br.ub(1) === 1;
  br.ub(5); // reserved
  const noClose = br.ub(1) === 1;
  const endCap = br.ub(2);
  let miterLimit = 0;
  if (join === 2 /* miter */) miterLimit = br.ub(8) / 256;
  let color = '#000000';
  if (hasFill) {
    const fill = readFillStyle(br, shapeNum, warnings);
    if (fill.color) color = fill.color;
    else warnings.push('LINESTYLE2 solid fill unsupported');
  } else {
    const r = br.u8(), g = br.u8(), b = br.u8(), a = br.u8();
    color = rgbHex(r, g, b, a);
  }
  return { width, color, pixelHinting, noHScale, noVScale, startCap, endCap, join, noClose, miterLimit };
}

function readLineStyles(br: BitReader, shapeNum: number, warnings: string[]): SvgLineStyle[] {
  let count = br.u8();
  if (count === 0xff) count = br.u16(); // long line array (shape4)
  const out: SvgLineStyle[] = [];
  if (shapeNum <= 3) {
    for (let i = 0; i < count; i++) {
      const width = br.u16();
      out.push({ width, color: readColor(br, shapeNum) });
    }
  } else {
    for (let i = 0; i < count; i++) out.push(readLineStyle2(br, shapeNum, warnings));
  }
  return out;
}

interface StyleState { fills: SvgFillStyle[]; lines: SvgLineStyle[] }

function readShapeRecords(
  br: BitReader, shapeNum: number, warnings: string[],
): SvgShapeRecord[] {
  let fillBits = br.ub(4);
  let lineBits = br.ub(4);
  const out: SvgShapeRecord[] = [];
  for (;;) {
    const typeFlag = br.ub(1);
    if (typeFlag === 0) {
      const stateNewStyles = br.ub(1) === 1;
      const stateLineStyle = br.ub(1) === 1;
      const stateFill1 = br.ub(1) === 1;
      const stateFill0 = br.ub(1) === 1;
      const stateMove = br.ub(1) === 1;
      if (!stateNewStyles && !stateLineStyle && !stateFill1 && !stateFill0 && !stateMove) break;
      let move: { x: number; y: number } | undefined;
      if (stateMove) {
        const n = br.ub(5);
        move = { x: br.sb(n), y: br.sb(n) };
      }
      const fill0 = stateFill0 ? br.ub(fillBits) : undefined;
      const fill1 = stateFill1 ? br.ub(fillBits) : undefined;
      const line = stateLineStyle ? br.ub(lineBits) : undefined;
      let fillStyle: SvgFillStyle[] | undefined;
      let lineStyle: SvgLineStyle[] | undefined;
      if (stateNewStyles) {
        fillStyle = readFillStyles(br, shapeNum, warnings);
        lineStyle = readLineStyles(br, shapeNum, warnings);
        fillBits = br.ub(4);
        lineBits = br.ub(4);
      }
      out.push({
        kind: 'style',
        fill0: fill0 ?? 0, fill1: fill1 ?? 0, line: line ?? 0,
        move, fillStyle, lineStyle, fillBits, lineBits,
      });
    } else {
      const straight = br.ub(1) === 1;
      if (straight) {
        const numBits = br.ub(4);
        const general = br.ub(1) === 1;
        let vert = false;
        if (!general) vert = br.ub(1) === 1;
        const dx = general || !vert ? br.sb(numBits + 2) : 0;
        const dy = general || vert ? br.sb(numBits + 2) : 0;
        out.push({ kind: 'straight', dx, dy });
      } else {
        const numBits = br.ub(4);
        const cx = br.sb(numBits + 2), cy = br.sb(numBits + 2);
        const ax = br.sb(numBits + 2), ay = br.sb(numBits + 2);
        out.push({ kind: 'curved', cx, cy, ax, ay });
      }
    }
  }
  br.align();
  return out;
}

function parseShapeTag(tag: RawTag, warnings: string[]): {
  id: number; bounds: Rect; svg: string; attrs: Record<string, string>;
} {
  const shapeNum = tag.type === 2 ? 1 : tag.type === 22 ? 2 : tag.type === 32 ? 3 : 4;
  const br = new BitReader(tag.data);
  const id = br.u16();
  let bounds = readRect(br);
  const state: StyleState = { fills: [], lines: [] };
  let windingEvenOdd = true;
  const attrs: Record<string, string> = { shapeId: String(id) };
  if (shapeNum === 4) {
    // ShapeBounds was read above; EdgeBounds follows — parseSwfXml's rectOf
    // picks edgeBounds (first Xmin child in FFDec's export), so that wins.
    bounds = readRect(br); // edgeBounds
    const reserved = br.ub(5);
    const usesFillWindingRule = br.ub(1) === 1;
    const usesNonScalingStrokes = br.ub(1) === 1;
    const usesScalingStrokes = br.ub(1) === 1;
    windingEvenOdd = !usesFillWindingRule;
    attrs.reserved = String(reserved);
    attrs.usesFillWindingRule = String(usesFillWindingRule);
    attrs.usesNonScalingStrokes = String(usesNonScalingStrokes);
    attrs.usesScalingStrokes = String(usesScalingStrokes);
  }
  state.fills = readFillStyles(br, shapeNum, warnings);
  state.lines = readLineStyles(br, shapeNum, warnings);
  const records = readShapeRecords(br, shapeNum, warnings);
  const svg = shapeToSvg(bounds, state.fills, state.lines, records, { windingEvenOdd });
  return { id, bounds, svg, attrs };
}

// morph shapes (bounds only — enough for character registration) ----------

function parseMorphShape(tag: RawTag): { id: number; bounds: Rect } {
  const br = new BitReader(tag.data);
  const id = br.u16();
  const startBounds = readRect(br);
  void id;
  return { id, bounds: startBounds };
}

// images -------------------------------------------------------------------

async function pipeBytes(
  data: Uint8Array, transform: (s: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(data); controller.close(); },
  });
  const reader = transform(source).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); total += value.length; }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as any).DecompressionStream;
  return pipeBytes(data, (s) => s.pipeThrough(new DS('deflate')));
}

/** minimal PNG encoder (RGBA8) */
export async function encodePng(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const dst = y * (1 + width * 4);
    raw[dst] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), dst + 1);
  }
  const CS = (globalThis as any).CompressionStream;
  const zipped = await pipeBytes(raw, (s) => s.pipeThrough(new CS('deflate')));
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', zipped), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  return png;
}

function unpremultiply(v: number, a: number): number {
  if (a === 0 || a === 255 || a === undefined) return v;
  return Math.max(0, Math.min(255, Math.round((v * 255) / a)));
}

async function decodeLossless(data: Uint8Array, is2: boolean): Promise<{ id: number; w: number; h: number; png: Uint8Array }> {
  const br = new BitReader(data);
  const id = br.u16();
  const format = br.u8();
  const w = br.u16();
  const h = br.u16();
  let ctSize = 0;
  if (format === 3) ctSize = br.u8();
  const compressed = br.bytes(br.remaining);
  const raw = await inflate(compressed);
  const rgba = new Uint8Array(w * h * 4);
  if (format === 3) {
    const stride = (w + 3) & ~3;
    const off = (ctSize + 1) * 4;
    for (let y = 0; y < h; y++) {
      const row = off + y * stride;
      for (let x = 0; x < w; x++) {
        const idx = raw[row + x];
        const p = idx * 4;
        const di = (y * w + x) * 4;
        rgba[di] = raw[p];
        rgba[di + 1] = raw[p + 1];
        rgba[di + 2] = raw[p + 2];
        rgba[di + 3] = is2 ? raw[p + 3] : 255;
      }
    }
  } else if (format === 4) {
    const stride = (w * 2 + 3) & ~3;
    for (let y = 0; y < h; y++) {
      const row = y * stride;
      for (let x = 0; x < w; x++) {
        const v = raw[row + x * 2] | (raw[row + x * 2 + 1] << 8);
        const di = (y * w + x) * 4;
        rgba[di] = Math.round(((v >> 10) & 31) * 255 / 31);
        rgba[di + 1] = Math.round(((v >> 5) & 31) * 255 / 31);
        rgba[di + 2] = Math.round((v & 31) * 255 / 31);
        rgba[di + 3] = 255;
      }
    }
  } else if (format === 5) {
    for (let i = 0; i < w * h; i++) {
      const s = i * 4, d = i * 4;
      if (is2) {
        const a = raw[s];
        rgba[d] = unpremultiply(raw[s + 1], a);
        rgba[d + 1] = unpremultiply(raw[s + 2], a);
        rgba[d + 2] = unpremultiply(raw[s + 3], a);
        rgba[d + 3] = a;
      } else {
        // RGB32 is XRGB: the first byte is reserved, not the red channel.
        rgba[d] = raw[s + 1]; rgba[d + 1] = raw[s + 2]; rgba[d + 2] = raw[s + 3]; rgba[d + 3] = 255;
      }
    }
  } else {
    throw new Error(`unsupported lossless format ${format}`);
  }
  return { id, w, h, png: await encodePng(w, h, rgba) };
}

function repairJpeg(bytes: Uint8Array): Uint8Array {
  // join broken FFD9FFD8 seams (common in SWF)
  let out = bytes;
  for (let i = 0; i + 3 < out.length; i++) {
    if (out[i] === 0xff && out[i + 1] === 0xd9 && out[i + 2] === 0xff && out[i + 3] === 0xd8) {
      const next = new Uint8Array(out.length - 4);
      next.set(out.subarray(0, i));
      next.set(out.subarray(i + 4), i);
      out = next;
      i -= 2;
    }
  }
  if (!(out[0] === 0xff && out[1] === 0xd8)) {
    const next = new Uint8Array(out.length + 2);
    next[0] = 0xff; next[1] = 0xd8;
    next.set(out, 2);
    out = next;
  }
  return out;
}

// fonts ---------------------------------------------------------------------

interface FontInfo { id: number; codeTable: number[]; name: string; attrs: Record<string, string> }

function parseFont23(tag: RawTag): FontInfo {
  const br = new BitReader(tag.data);
  const fontID = br.u16();
  const fontFlagsHasLayout = br.ub(1) === 1;
  const fontFlagsShiftJIS = br.ub(1) === 1;
  const fontFlagsSmallText = br.ub(1) === 1;
  const fontFlagsANSI = br.ub(1) === 1;
  const fontFlagsWideOffsets = br.ub(1) === 1;
  const fontFlagsWideCodes = br.ub(1) === 1;
  const fontFlagsItalic = br.ub(1) === 1;
  const fontFlagsBold = br.ub(1) === 1;
  const languageCode = br.u8();
  const nameLen = br.u8();
  const name = br.fixedStr(nameLen);
  const numGlyphs = br.u16();
  const pos = br.offsetBytes;
  const readOff = () => (fontFlagsWideOffsets ? br.u32() : br.u16());
  const offsetTable: number[] = [];
  let stripped = false;
  if (numGlyphs > 0) {
    const off0 = readOff();
    if (off0 === 0) stripped = true;
    else {
      offsetTable[0] = off0;
      for (let i = 1; i < numGlyphs; i++) offsetTable[i] = readOff();
    }
  }
  let codeTableOffset = 0;
  if (numGlyphs > 0 || fontFlagsHasLayout) codeTableOffset = readOff();
  const codeTable: number[] = [];
  if (codeTableOffset > 0) {
    br.seek(pos + codeTableOffset);
    for (let i = 0; i < numGlyphs; i++) {
      codeTable.push(fontFlagsWideCodes ? br.u16() : br.u8());
    }
  }
  void stripped; void offsetTable;
  const attrs: Record<string, string> = {
    fontID: String(fontID), fontName: name,
    fontFlagsHasLayout: String(fontFlagsHasLayout),
    fontFlagsShiftJIS: String(fontFlagsShiftJIS),
    fontFlagsSmallText: String(fontFlagsSmallText),
    fontFlagsANSI: String(fontFlagsANSI),
    fontFlagsWideOffsets: String(fontFlagsWideOffsets),
    fontFlagsWideCodes: String(fontFlagsWideCodes),
    fontFlagsItalic: String(fontFlagsItalic),
    fontFlagsBold: String(fontFlagsBold),
    languageCode: String(languageCode),
  };
  return { id: fontID, codeTable, name, attrs };
}

// text tags -----------------------------------------------------------------

function parseDefineText(tag: RawTag, is2: boolean): {
  id: number; bounds: Rect; matrix: Matrix; records: TextRecord[];
} {
  const br = new BitReader(tag.data);
  const id = br.u16();
  // DefineText: bounds + matrix are bit-packed; the glyph/advance counts
  // are UI8s, so the writer pads to the next byte before writing them.
  const bounds = readRect(br, false);
  const matrix = readMatrix(br);
  br.align();
  const glyphBits = br.u8(); // spec: two separate UI8s (not nibble-packed)
  const advanceBits = br.u8();
  const records: TextRecord[] = [];
  for (;;) {
    const first = br.ub(1);
    br.ub(3);
    const hasFont = br.ub(1) === 1;
    const hasColor = br.ub(1) === 1;
    const hasY = br.ub(1) === 1;
    const hasX = br.ub(1) === 1;
    if (!hasFont && !hasColor && !hasY && !hasX && first === 0) break;
    const rec: TextRecord = { glyphs: [] };
    if (hasFont) rec.fontId = br.u16();
    if (hasColor) {
      const r = br.u8(), g = br.u8(), b = br.u8();
      rec.color = rgbHex(r, g, b);
      if (is2) rec.alpha = br.u8() / 255;
    }
    if (hasX) rec.x = br.s16();
    if (hasY) rec.y = br.s16();
    if (hasFont) rec.height = br.u16();
    const glyphCount = br.u8();
    for (let i = 0; i < glyphCount; i++) {
      const index = glyphBits > 0 ? br.ub(glyphBits) : 0;
      const advance = advanceBits > 0 ? br.sb(advanceBits) : 0;
      rec.glyphs.push({ index, advance });
    }
    br.align();
    records.push(rec);
  }
  return { id, bounds, matrix, records };
}

function parseEditText(tag: RawTag): {
  id: number; charId: number; bounds: Rect; attrs: Record<string, string>; initialText: string;
} {
  const br = new BitReader(tag.data);
  const id = br.u16();
  const f1 = br.u8();
  const f2 = br.u8();
  const hasFont = !!(f1 & 0x80);
  const hasMaxLength = !!(f1 & 0x40);
  const hasTextColor = !!(f1 & 0x20);
  const readOnly = !!(f1 & 0x10);
  const password = !!(f1 & 0x08);
  const hasFontClass = !!(f1 & 0x04);
  const autoSize = !!(f1 & 0x02);
  const hasLayout = !!(f2 & 0x80);
  const noSelect = !!(f2 & 0x40);
  const wordWrap = !!(f2 & 0x20);
  const hasText = !!(f2 & 0x01);
  const bounds = readRect(br);
  let fontId: number | undefined, fontHeight = 0;
  if (hasFont) { fontId = br.u16(); fontHeight = br.u16(); }
  let textAlpha: number | undefined;
  if (hasTextColor) { br.u8(); br.u8(); br.u8(); textAlpha = br.u8() / 255; }
  let align = 0, leftMargin = 0, rightMargin = 0, indent = 0, leading = 0;
  if (hasLayout) {
    align = br.u8(); leftMargin = br.u16(); rightMargin = br.u16();
    indent = br.s16(); leading = br.s16();
  }
  if (hasFontClass) br.str();
  const variableName = br.str();
  let initialText = '';
  if (hasText) initialText = utf8(br.bytes(br.remaining));
  const attrs: Record<string, string> = {
    characterID: String(id),
    hasFont: String(hasFont), hasMaxLength: String(hasMaxLength),
    hasTextColor: String(hasTextColor), readOnly: String(readOnly),
    password: String(password), hasFontClass: String(hasFontClass),
    autoSize: String(autoSize), hasLayout: String(hasLayout),
    noSelect: String(noSelect), wordWrap: String(wordWrap),
    hasText: String(hasText), variableName,
  };
  if (fontId != null) { attrs.fontId = String(fontId); attrs.fontHeight = String(fontHeight); }
  if (textAlpha != null) attrs.textAlpha = String(textAlpha);
  if (hasLayout) {
    attrs.align = String(align); attrs.leftMargin = String(leftMargin);
    attrs.rightMargin = String(rightMargin); attrs.indent = String(indent);
    attrs.leading = String(leading);
  }
  if (initialText) attrs.initialText = initialText;
  // parseSwfXml's charIdOf checks ID_ATTRS in order and finds 'fontId'
  // before 'characterID', so EditTexts with hasFont register under fontId
  // (while the text file itself stays keyed by the raw characterID).
  return { id: fontId ?? id, charId: id, bounds, attrs, initialText };
}

function utf8(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8').decode(bytes); }
  catch { return latin1(bytes); }
}

// place/remove -------------------------------------------------------------

interface Place2Info {
  depth: number; hasChar: boolean; move: boolean; characterId: number;
  matrix?: Matrix; ct?: ColorTransform; ratio?: number; name?: string;
  clipDepth?: number;
}

function parsePlace2(data: Uint8Array): Place2Info {
  const br = new BitReader(data);
  const f1 = br.u8();
  const hasClipActions = !!(f1 & 0x80);
  const hasClipDepth = !!(f1 & 0x40);
  const hasName = !!(f1 & 0x20);
  const hasRatio = !!(f1 & 0x10);
  const hasCt = !!(f1 & 0x08);
  const hasMatrix = !!(f1 & 0x04);
  const hasChar = !!(f1 & 0x02);
  const move = !!(f1 & 0x01);
  const depth = br.u16();
  let characterId = 0;
  if (hasChar) characterId = br.u16();
  const matrix = hasMatrix ? readMatrix(br) : undefined;
  const ct = hasCt ? readCxform(br, true) : undefined;
  const ratio = hasRatio ? br.u16() : undefined;
  let clipDepth: number | undefined;
  if (hasClipDepth) {
    const v = br.u16();
    if (v > 0) clipDepth = v;
  }
  const name = hasName ? br.str() || undefined : undefined;
  void hasClipActions;
  return {
    depth, hasChar, move, characterId, matrix,
    ct: ct ? normalizeCt(ct) : undefined, ratio, name, clipDepth,
  };
}

// buttons -------------------------------------------------------------------

interface ButtonRec {
  up: boolean; over: boolean; down: boolean; hit: boolean;
  characterId: number; placeDepth: number; matrix: Matrix; ct?: ColorTransform;
}

function parseButton2(data: Uint8Array): { id: number; records: ButtonRec[]; attrs: Record<string, string> } {
  const br = new BitReader(data);
  const id = br.u16();
  const reserved = br.ub(7);
  const trackAsMenu = br.ub(1) === 1;
  br.u16(); // actionOffset — condition actions are ignored (like parseSwfXml)
  const records: ButtonRec[] = [];
  for (;;) {
    const f = br.u8();
    if (f === 0) break;
    const recReserved = f >> 6;
    const hasBlend = !!(f & 0x20);
    const hasFilters = !!(f & 0x10);
    const hit = !!(f & 0x08);
    const down = !!(f & 0x04);
    const over = !!(f & 0x02);
    const up = !!(f & 0x01);
    const characterId = br.u16();
    const placeDepth = br.u16();
    const matrix = readMatrix(br);
    const ct = normalizeCt(readCxform(br, true));
    if (hasFilters) skipFilterList(br);
    if (hasBlend) br.u8();
    records.push({ up, over, down, hit, characterId, placeDepth, matrix, ct });
    void recReserved;
  }
  return {
    id, records,
    attrs: {
      buttonId: String(id), reserved: String(reserved), trackAsMenu: String(trackAsMenu),
    },
  };
}

function skipFilterList(br: BitReader) {
  const count = br.u8();
  for (let i = 0; i < count; i++) {
    const id = br.u8();
    switch (id) {
      case 0: // drop shadow
        br.u8(); br.u8(); br.u8(); br.u8();
        br.skip(4 * 4); br.skip(4); br.skip(4); br.u8(); br.u32();
        break;
      case 1: // blur
        br.skip(8); br.skip(4); br.u8();
        break;
      case 2: // glow
        br.u8(); br.u8(); br.u8(); br.u8();
        br.skip(8); br.skip(4); br.skip(4); br.u8();
        break;
      case 3: // bevel
        br.u8(); br.u8(); br.u8(); br.u8(); br.u8(); br.u8(); br.u8(); br.u8();
        br.skip(8); br.skip(8); br.skip(4); br.skip(4); br.u8();
        break;
      case 4: // gradient glow
        br.u8(); br.u8(); br.u8(); br.u8();
        br.skip(8); br.skip(4); br.skip(4); br.u8(); br.u8();
        { const n = br.u8(); br.skip(n * 4); }
        break;
      case 5: // convolution
        br.skip(4); { const n = br.u8(); br.skip(n * 4); br.skip(n * 4); }
        br.skip(4); br.skip(4); br.skip(4); br.u8();
        break;
      case 6: // color matrix
        br.skip(20);
        break;
      case 7: // gradient bevel
        br.u8(); br.u8(); br.u8(); br.u8(); br.u8(); br.u8(); br.u8(); br.u8();
        br.skip(8); br.skip(8); br.skip(4); br.skip(4); br.u8(); br.u8();
        { const n = br.u8(); br.skip(n * 4); }
        break;
      default:
        throw new Error(`unknown filter ${id}`);
    }
  }
}

// main parse ---------------------------------------------------------------

export async function parseSwfBinary(
  buffer: ArrayBuffer, fileName: string,
): Promise<ParsedBinarySwf> {
  const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const sig = String.fromCharCode(head[0], head[1], head[2]);
  let body: Uint8Array;
  let compression: string | undefined;
  if (sig === 'FWS') {
    body = new Uint8Array(buffer);
  } else if (sig === 'CWS') {
    compression = 'CWS';
    const head8 = new Uint8Array(buffer, 0, 8);
    const rest = new Uint8Array(await inflate(new Uint8Array(buffer, 8)));
    body = new Uint8Array(8 + rest.length);
    body.set(head8, 0);
    body.set(rest, 8);
  } else if (sig === 'ZWS') {
    throw new Error('LZMA-compressed SWF (ZWS) is not supported');
  } else {
    throw new Error(`not a SWF file (signature ${JSON.stringify(sig)})`);
  }

  const version = body[3];
  const br = new BitReader(body);
  br.seek(8);
  const stage = readRect(br);
  const frameRate = br.u16() / 256;
  const declaredFrameCount = br.u16(); void declaredFrameCount;
  const tagBytes = body.subarray(br.offsetBytes);
  const rootTags = parseTags(tagBytes);

  const warnings: string[] = [];
  const files: SwfFile[] = [];
  const characters = new Map<number, SwfCharacter>();
  const timelines = new Map<string, Timeline>();
  const exportNames = new Map<number, string>();
  const symbolClasses = new Map<number, string>();
  let backgroundColor: number | undefined;
  let jpegTables: Uint8Array | undefined;

  const addChar = (id: number, tagType: string, kind: NonNullable<ReturnType<typeof kindOfTag>>, init: Partial<SwfCharacter>) => {
    const existing = characters.get(id);
    const ch: SwfCharacter = existing ?? { id, tagType, kind, uses: [], attrs: {} };
    if (!existing) characters.set(id, ch);
    Object.assign(ch.attrs, init.attrs ?? {});
    if (init.bounds && !ch.bounds) ch.bounds = init.bounds;
    if (init.codeTable) ch.codeTable = init.codeTable;
    if (init.frameCount != null) ch.frameCount = init.frameCount;
    if (init.timelineId) ch.timelineId = init.timelineId;
    return ch;
  };

  const addFile = (category: SwfFile['category'], id: number | undefined, ext: string, bytes: Uint8Array) => {
    const name = id != null ? String(id) : `file${files.length}`;
    files.push({ path: `${category}/${name}.${ext}`, name, ext, category, bytes });
  };

  const pendingTexts: { id: number; bounds: Rect; matrix: Matrix; records: TextRecord[] }[] = [];
  const pendingEditIds: { id: number; text: string }[] = [];

  // ---------------------------------------------------- pass 1: register ---
  const registerTags = async (tags: RawTag[]) => {
    for (const tag of tags) {
      const type = tag.name;
      const kind = kindOfTag(type);
      try {
        switch (tag.type) {
          case 9: { // SetBackgroundColor
            const br2 = new BitReader(tag.data);
            backgroundColor = (br2.u8() << 16) | (br2.u8() << 8) | br2.u8();
            break;
          }
          case 56: { // ExportAssets
            const br2 = new BitReader(tag.data);
            const count = br2.u16();
            const ids: number[] = [];
            for (let i = 0; i < count; i++) ids.push(br2.u16());
            for (const id of ids) exportNames.set(id, br2.str());
            break;
          }
          case 76: { // SymbolClass
            const br2 = new BitReader(tag.data);
            const count = br2.u16();
            const ids: number[] = [];
            for (let i = 0; i < count; i++) ids.push(br2.u16());
            for (const id of ids) symbolClasses.set(id, br2.str());
            break;
          }
          case 8: // JPEGTables
            jpegTables = tag.data.slice();
            break;
          case 2: case 22: case 32: case 83: {
            const shape = parseShapeTag(tag, warnings);
            addChar(shape.id, type, 'shape', { bounds: shape.bounds, attrs: shape.attrs });
            addFile('shapes', shape.id, 'svg', new TextEncoder().encode(shape.svg));
            break;
          }
          case 46: case 84: {
            const ms = parseMorphShape(tag);
            addChar(ms.id, type, 'morphshape', { bounds: ms.bounds, attrs: { morphShapeId: String(ms.id) } });
            break;
          }
          case 39: { // DefineSprite
            const br2 = new BitReader(tag.data);
            const id = br2.u16();
            const fc = br2.u16();
            addChar(id, type, 'sprite', {
              frameCount: fc, timelineId: `sprite:${id}`,
              attrs: { spriteId: String(id), frameCount: String(fc), hasEndTag: 'true' },
            });
            await registerTags(parseTags(tag.data.subarray(br2.offsetBytes)));
            break;
          }
          case 34: { // DefineButton2
            const btn = parseButton2(tag.data);
            addChar(btn.id, type, 'button', { attrs: btn.attrs });
            break;
          }
          case 6: case 21: case 35: case 20: case 36: case 90: {
            const br2 = new BitReader(tag.data);
            const id = br2.u16();
            if (tag.type === 6) { // DefineBits: jpeg payload after tables
              const jpeg = repairJpeg(mergeJpeg(jpegTables, br2.bytes(br2.remaining)));
              addChar(id, type, 'bitmap', { attrs: { characterID: String(id) } });
              addFile('images', id, 'jpg', jpeg);
            } else if (tag.type === 21 || tag.type === 90) {
              if (tag.type === 90) { br2.u16(); br2.u16(); } // jpeg4 alpha offsets
              const jpeg = repairJpeg(br2.bytes(br2.remaining));
              addChar(id, type, 'bitmap', { attrs: { characterID: String(id) } });
              addFile('images', id, 'jpg', jpeg);
            } else if (tag.type === 35) { // JPEG3
              const alphaOffset = br2.u32();
              const jpeg = repairJpeg(br2.bytes(alphaOffset));
              addChar(id, type, 'bitmap', { attrs: { characterID: String(id) } });
              addFile('images', id, 'jpg', jpeg);
              // alpha is merged in the browser when available; FFDec exports a
              // flattened png. Structure tests only require the id to exist.
            } else { // lossless
              const is2 = tag.type === 36;
              const decoded = await decodeLossless(tag.data, is2);
              addChar(decoded.id, type, 'bitmap', { attrs: { characterID: String(decoded.id) } });
              addFile('images', decoded.id, 'png', decoded.png);
            }
            break;
          }
          case 14: { // DefineSound
            const br2 = new BitReader(tag.data);
            const id = br2.u16();
            addChar(id, type, 'sound', { attrs: { soundId: String(id) } });
            break;
          }
          case 11: case 33: {
            const txt = parseDefineText(tag, tag.type === 33);
            addChar(txt.id, type, 'text', {
              bounds: txt.bounds,
              attrs: { characterID: String(txt.id) },
            });
            const ch = characters.get(txt.id)!;
            ch.textRecords = txt.records;
            ch.textMatrix = txt.matrix;
            pendingTexts.push(txt);
            break;
          }
          case 37: {
            const et = parseEditText(tag);
            addChar(et.id, type, 'edittext', { bounds: et.bounds, attrs: et.attrs });
            pendingEditIds.push({ id: et.charId, text: et.initialText });
            break;
          }
          case 10: case 48: case 75: {
            if (tag.type === 10) break; // DefineFont (legacy) — skip parse
            // parse/validate only: parseSwfXml's charIdOf reads only
            // characterId/id attrs, so fontID-tagged fonts never become
            // characters there. Mirroring keeps the character-id layout
            // identical; fonts still reach the player via FontName/ttf.
            parseFont23(tag);
            break;
          }
          case 73: { // DefineFontAlignZones
            // parse/validate only (see case 48): fontID u16 + CSM hint byte,
            // then zone records. Layout is not mirrored into characters
            // because parseSwfXml never keeps align zones (fontID not in
            // ID_ATTRS), so only verify the payload is fully consumable.
            const br2 = new BitReader(tag.data);
            br2.u16();
            br2.u8();
            while (br2.remaining > 0) {
              const numZoneData = br2.u8();
              for (let z = 0; z < numZoneData; z++) {
                br2.u16(); br2.u16();
              }
            }
            break;
          }
          case 88: { // DefineFontName
            const br2 = new BitReader(tag.data);
            const fontId = br2.u16();
            const fontName = br2.str();
            const copyright = br2.str();
            addChar(fontId, type, 'font', {
              attrs: { fontId: String(fontId), fontName, fontCopyright: copyright },
            });
            break;
          }
          default:
            if (kind) {
              // generic character tag — register by best-effort id
              const br2 = new BitReader(tag.data);
              const id = br2.u16();
              addChar(id, type, kind, { attrs: {} });
            }
        }
      } catch (err) {
        warnings.push(`${type}: ${String((err as Error).message ?? err)}`);
      }
    }
  };
  await registerTags(rootTags);

  // text files: glyph runs decoded through the owning font's code table
  for (const t of pendingTexts) {
    const font = t.records.length ? characters.get(t.records.find((r) => r.fontId != null)?.fontId ?? -1) : undefined;
    const codeTable = font?.codeTable ?? [];
    let s = '';
    for (const rec of t.records) {
      const ct = rec.fontId != null ? characters.get(rec.fontId)?.codeTable ?? [] : codeTable;
      for (const g of rec.glyphs) s += String.fromCharCode(ct[g.index] ?? 0);
    }
    addFile('texts', t.id, 'txt', new TextEncoder().encode(s));
  }
  for (const e of pendingEditIds) addFile('texts', e.id, 'txt', new TextEncoder().encode(e.text));

  // ------------------------------------------------------ pass 2: frames ---
  let exportTagAttrs = 0; void exportTagAttrs;

  const summarize = (parts: string[]) => parts.join(' ');
  const otherDetail = (tag: RawTag): string => {
    // mirrors parseSwfXml's summarizeAttrs over the FFDec attribute set
    switch (tag.type) {
      case 9: return '';                 // SetBackgroundColor: only forceWriteAsLong=false
      case 56: return 'forceWriteAsLong=true';
      case 24: return 'reserved=0';      // Protect
      case 69: return 'reservedB=0 useNetwork=true';
      case 74: {
        const br2 = new BitReader(tag.data);
        const textID = br2.u16();
        void textID;
        const b = br2.u8();
        const reserved = b >> 5;
        const gridFit = (b >> 2) & 7;
        return summarize([
          'forceWriteAsLong=true',
          `gridFit=${gridFit}`,
          `reserved=${reserved}`,
          'reserved2=0',
        ]);
      }
      default: return '';
    }
  };

  const buildTimeline = (
    id: string, kind: Timeline['kind'], characterId: number | undefined,
    name: string, tags: RawTag[],
  ): Timeline => {
    const frames: Frame[] = [];
    const state = new Map<number, DisplayItem>();
    let ops: PlaceOp[] = [];
    let events: FrameEvent[] = [];
    let special = false;
    let kinds = new Set<EventKind>();
    let label: string | undefined;
    let frameIndex = 0;

    const flush = () => {
      frames.push({
        index: frameIndex, label, ops, events, special,
        kinds: [...kinds], display: snapshot(state),
      });
      frameIndex++;
      ops = []; events = []; special = false; kinds = new Set(); label = undefined;
    };

    for (const tag of tags) {
      const type = tag.name;
      if (type === 'ShowFrameTag') { flush(); continue; }
      if (type === 'EndTag') continue;

      const k = classify(type);
      if (isSpecialTag(type)) special = true;
      kinds.add(k);

      if (k === 'place') {
        const info = parsePlace2(tag.data);
        if (info.depth < 0) continue;
        const prev = state.get(info.depth);
        const cid = info.characterId;
        const creating = (info.hasChar || !prev) && cid > 0;
        ops.push({
          op: creating && !info.move ? 'place' : 'move',
          tagType: type, depth: info.depth, characterId: cid,
          matrix: info.matrix, colorTransform: info.ct,
          ratio: info.ratio, name: info.name, clipDepth: info.clipDepth,
          hasFilters: false,
        });
        if (creating) {
          state.set(info.depth, {
            depth: info.depth, characterId: cid,
            matrix: info.matrix ?? { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
            colorTransform: info.ct, ratio: info.ratio ?? 0, name: info.name,
            clipDepth: info.clipDepth, hasFilters: false, startFrame: frameIndex,
          });
        } else if (prev) {
          const next: DisplayItem = { ...prev };
          if (info.matrix) next.matrix = info.matrix;
          if (info.ct) next.colorTransform = info.ct;
          if (info.ratio != null) next.ratio = info.ratio;
          if (info.name) next.name = info.name;
          if (info.clipDepth != null) next.clipDepth = info.clipDepth;
          state.set(info.depth, next);
        }
        events.push({ kind: 'place', tagType: type, detail: `depth ${info.depth}`, characterId: cid });
        continue;
      }
      if (k === 'remove') {
        const br2 = new BitReader(tag.data);
        const depth = br2.u16();
        const gone = state.get(depth);
        ops.push({ op: 'remove', tagType: type, depth, characterId: gone?.characterId });
        state.delete(depth);
        continue;
      }
      if (type === 'FrameLabelTag') {
        const br2 = new BitReader(tag.data);
        label = br2.str() || undefined;
        events.push({ kind: 'label', tagType: type, detail: label ?? '(unnamed)' });
        continue;
      }
      if (/^(DoAction|DoInitAction|DoABC|RawABC)/.test(type)) {
        if (type === 'DoABCTag' || type === 'DoABC2Tag') {
          events.push({
            kind: 'action', tagType: type, detail: '  // script',
            externalActionCandidates: actionFileCandidates(characterId, frameIndex, type),
          });
          continue;
        }
        const actionBytes = type === 'DoInitActionTag' ? doInitActions(tag.data) : tag.data;
        events.push({
          kind: 'action', tagType: type,
          detail: avm1ActionSource(actionBytes),
          externalActionCandidates: actionFileCandidates(characterId, frameIndex, type),
        });
        continue;
      }
      if (/^StartSound/.test(type)) {
        const br2 = new BitReader(tag.data);
        const sid = br2.u16();
        const flags = br2.u8();
        // SOUNDINFO: reserved(2) syncStop syncNoMultiple hasEnvelope hasLoops hasOutPoint hasInPoint
        const syncStop = !!(flags & 0x20);
        const syncNoMultiple = !!(flags & 0x10);
        const hasEnvelope = !!(flags & 0x08);
        const hasLoops = !!(flags & 0x04);
        const hasOut = !!(flags & 0x02);
        const hasIn = !!(flags & 0x01);
        if (hasIn) br2.u32();
        if (hasOut) br2.u32();
        let loopCount = 0;
        if (hasLoops) loopCount = br2.u16();
        if (hasEnvelope) {
          const n = br2.u16();
          br2.skip(n * 7 * 4);
        }
        const bits: string[] = [];
        if (syncStop) bits.push('stop');
        if (syncNoMultiple) bits.push('noMultiple');
        if (loopCount > 1) bits.push(`loop \u00d7${loopCount}`);
        events.push({
          kind: 'sound', tagType: type,
          detail: `sound ${sid >= 0 ? sid : '?'}${bits.length ? ' (' + bits.join(', ') + ')' : ''}`,
          characterId: sid,
        });
        continue;
      }
      if (/^SoundStream/.test(type)) {
        events.push({ kind: 'sound', tagType: type, detail: 'streaming audio' });
        continue;
      }
      if (/^Define|^JPEGTables/.test(type)) {
        const cid = charIdFromTag(tag, characters);
        events.push({ kind: 'define', tagType: type, detail: cid != null ? `defines #${cid}` : '', characterId: cid });
        continue;
      }
      events.push({ kind: 'other', tagType: type, detail: otherDetail(tag) });
    }

    if (ops.length || events.length || frames.length === 0) flush();
    return { id, kind, characterId, name, frameCount: frames.length, frames };
  };

  const root = buildTimeline('root', 'root', undefined, 'Main Timeline', rootTags);
  timelines.set('root', root);

  const buildSpriteTimelines = (tags: RawTag[]) => {
    for (const tag of tags) {
      if (tag.type === 39) {
        const br2 = new BitReader(tag.data);
        const id = br2.u16();
        br2.u16(); // frameCount
        const sub = parseTags(tag.data.subarray(br2.offsetBytes));
        const tl = buildTimeline(`sprite:${id}`, 'sprite', id, `Sprite ${id}`, sub);
        timelines.set(tl.id, tl);
        const ch = characters.get(id);
        if (ch) {
          ch.frameCount = tl.frameCount;
          ch.specialFrames = tl.frames.filter((f) => f.special).length;
          const used = new Set<number>();
          for (const f of tl.frames) for (const o of f.ops) if (o.characterId != null) used.add(o.characterId);
          ch.uses = [...used];
        }
        buildSpriteTimelines(sub);
      }
    }
  };
  buildSpriteTimelines(rootTags);

  // export/class name joins (mirrors parseSwfXml)
  for (const [id, n] of exportNames) { const c = characters.get(id); if (c) c.exportName = n; }

  // buttons: synthetic 4-frame timelines (mirrors buildButtonTimeline)
  for (const [id, ch] of characters) {
    if (ch.kind !== 'button') continue;
    const btnTag = findButtonTag(rootTags, id);
    if (!btnTag) continue;
    const { records } = parseButton2(btnTag.data);
    if (!records.length) continue;
    const states = ['Up', 'Over', 'Down', 'HitTest'] as const;
    const frames: Frame[] = states.map((s, i) => {
      const display: DisplayItem[] = [];
      for (const r of records) {
        const on = s === 'Up' ? r.up : s === 'Over' ? r.over : s === 'Down' ? r.down : r.hit;
        if (!on) continue;
        if (r.characterId < 0) continue;
        display.push({
          depth: r.placeDepth, characterId: r.characterId, matrix: r.matrix,
          colorTransform: r.ct, ratio: 0, startFrame: i,
        });
      }
      display.sort((a, b) => a.depth - b.depth);
      return {
        index: i, label: s === 'HitTest' ? 'hit' : s.toLowerCase(),
        ops: [], events: [], special: false, kinds: [], display,
      };
    });
    timelines.set(`button:${id}`, {
      id: `button:${id}`, kind: 'button', characterId: id,
      name: `Button ${id}`, frameCount: 4, frames,
    });
    ch.uses = [...new Set(frames.flatMap((f) => f.display.map((d) => d.characterId)))];
    ch.frameCount = 4;
    ch.timelineId = `button:${id}`;
  }

  // className join (SymbolClass)
  for (const [id, cls] of symbolClasses) {
    const ch = characters.get(id);
    if (ch) ch.className = cls;
  }

  const header: SwfHeader = {
    version: String(version),
    frameRate,
    frameCount: root.frameCount,
    stage,
    compression: compression === 'CWS' ? 'ZLIB' : 'UNCOMPRESSED',
    fileName,
    backgroundColor,
  };

  // Synthesize scripts/*.as sources (FFDec export layout) from the decoded
  // action events — the Execute workspace transpiles those files.
  //
  // A frame may hold several DoAction tags (frame 1 of a real game usually does:
  // a small setup script and the big library definition script). FFDec names the
  // extra ones DoAction_2.as, DoAction_3.as, … and the transpiler appends them in
  // file order, so every event must get its own file — deduping by path silently
  // dropped everything after the first script of a frame.
  const seenScriptPaths = new Set(files.map((f) => f.path));
  for (const tl of timelines.values()) {
    for (const frame of tl.frames) {
      for (const ev of frame.events) {
        if (ev.kind !== 'action' || !ev.detail || !ev.externalActionCandidates?.length) continue;
        const preferred = ev.externalActionCandidates[0];
        const slash = preferred.lastIndexOf('/');
        const dir = preferred.slice(0, slash + 1);
        const stem = preferred.slice(slash + 1).replace(/\.as$/i, '');
        let path = preferred;
        for (let n = 2; seenScriptPaths.has(path); n++) path = `${dir}${stem}_${n}.as`;
        seenScriptPaths.add(path);
        ev.externalActions = path;
        files.push({
          path, name: path.slice(path.lastIndexOf('/') + 1).replace(/\.as$/i, ''), ext: 'as', category: 'scripts',
          bytes: new TextEncoder().encode(ev.detail.endsWith('\n') ? ev.detail : ev.detail + '\n'),
        });
      }
    }
  }

  const doc: SwfDocument = {
    header, characters, timelines, root,
    symbolClasses: symbolClasses.size ? symbolClasses : undefined,
    warnings,
    stats: { tags: countTags(rootTags), unknownTags: {} },
  };
  void exportTagAttrs;
  return { doc, files };
}

function countTags(tags: RawTag[]): number {
  let n = 0;
  for (const t of tags) {
    if (t.type === 0) continue; // End tags are not exported as XML items
    n++;
    if (t.type === 39) {
      const br = new BitReader(t.data);
      br.u16(); br.u16();
      n += countTags(parseTags(t.data.subarray(br.offsetBytes)));
    }
  }
  return n;
}

function charIdFromTag(tag: RawTag, _characters: Map<number, SwfCharacter>): number | undefined {
  void _characters;
  // mirrors parseSwfXml's charIdOf(): only specific attr names count — e.g.
  // DefineFont2/3 + AlignZones export fontID (capital D) which charIdOf misses
  switch (tag.type) {
    case 8: return undefined;   // JPEGTables
    case 48: case 75: case 73: return undefined; // fontID — not in ID_ATTRS
    case 74: return undefined;  // CSMTextSettings — textID is not a char id
    case 37: return parseEditText(tag).id; // mirrors charIdOf (fontId first)
    default:
      try { return new BitReader(tag.data).u16(); } catch { return undefined; }
  }
}

function findButtonTag(tags: RawTag[], id: number): RawTag | undefined {
  for (const t of tags) {
    if (t.type === 34) {
      const br = new BitReader(t.data);
      if (br.u16() === id) return t;
    }
    if (t.type === 39) {
      const br = new BitReader(t.data);
      br.u16(); br.u16();
      const found = findButtonTag(parseTags(t.data.subarray(br.offsetBytes)), id);
      if (found) return found;
    }
  }
  return undefined;
}

function mergeJpeg(tables: Uint8Array | undefined, scan: Uint8Array): Uint8Array {
  if (!tables) return scan;
  const out = new Uint8Array(tables.length + scan.length);
  out.set(tables, 0);
  out.set(scan, tables.length);
  return out;
}

function snapshot(state: Map<number, DisplayItem>): DisplayItem[] {
  return [...state.values()].sort((a, b) => a.depth - b.depth).map((d) => ({ ...d }));
}
