#!/usr/bin/env node
// FFDec XML export → binary SWF (FWS).
//
// Usage: node xml2swf.mjs <input.xml> <output.swf>
//
// The writer intentionally ignores FFDec's forceWriteAsLong hints (compact
// tag headers are used instead) — the paired binary parser reads whatever
// encoding is present, and the round-trip oracle is structural equality, not
// byte equality.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { JSDOM } from 'jsdom';
import zlib from 'node:zlib';

// ---------------------------------------------------------------- bit I/O --

class BitWriter {
  constructor() {
    this.bytes = [];
    this.cur = 0;
    this.nbits = 0;
  }
  ub(n, v) {
    v = Number(v) >>> 0;
    for (let i = n - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((v >> i) & 1);
      this.nbits++;
      if (this.nbits === 8) { this.bytes.push(this.cur & 0xff); this.cur = 0; this.nbits = 0; }
    }
  }
  sb(n, v) {
    v = Number(v) | 0;
    this.ub(n, v < 0 ? v + (1 << n) : v);
  }
  align() { if (this.nbits) { this.cur <<= 8 - this.nbits; this.bytes.push(this.cur & 0xff); this.cur = 0; this.nbits = 0; } }
  raw(...vals) { this.align(); for (const v of vals) this.bytes.push(v & 0xff); }
  u8(v) { this.raw(v); }
  u16(v) { this.raw(v, v >> 8); }
  u32(v) { this.raw(v, v >> 8, v >> 16, v >> 24); }
  s16(v) { this.u16(v); }
  /** little-endian IEEE-754 single (CSMTextSettings thickness/sharpness) */
  f32(v) {
    const buf = Buffer.alloc(4);
    buf.writeFloatLE(Number(v) || 0, 0);
    for (const b of buf) this.u8(b);
  }
  str(s) {
    this.align();
    const buf = Buffer.from(s ?? '', 'utf8');
    for (const b of buf) this.bytes.push(b);
    this.bytes.push(0);
  }
  hex(hx) {
    this.align();
    const b = Buffer.from(hx ?? '', 'hex');
    for (const x of b) this.bytes.push(x);
  }
  /** minimal signed bit count (as FFDec's enlargeBitCountS) */
  static bitsS(v) {
    v = Number(v) | 0;
    if (v === 0) return 1;
    let n = 1;
    let x = v < 0 ? -v - 1 : v;   // range: [-2^(n-1), 2^(n-1)-1]
    while (x > 0) { x >>= 1; n++; }
    return Math.max(2, n);
  }
  bitsOut() { return this.bytes.length * 8 + this.nbits; }
}

const BOOL = (v) => v === 'true' || v === '1' || v === true;
/** FFDec writes Java escapes such as \u0000 inside attribute values. */
const stripEscapes = (v) => v.replace(/\\u([0-9a-fA-F]{4})/g, '');
const num = (el, name, def = 0) => {
  const v = el?.getAttribute(name);
  if (v == null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const has = (el, name) => el.hasAttribute(name);

// tag names → codes
const TAG_CODES = {
  EndTag: 0, ShowFrameTag: 1, DefineShapeTag: 2, RemoveObjectTag: 5,
  DefineBitsTag: 6, DefineButtonTag: 7, JPEGTablesTag: 8, SetBackgroundColorTag: 9,
  DefineFontTag: 10, DefineTextTag: 11, DoActionTag: 12, DefineSoundTag: 14,
  StartSoundTag: 15, DefineButtonCxformTag: 17, SoundStreamHeadTag: 18,
  SoundStreamBlockTag: 19, DefineBitsLosslessTag: 20, DefineBitsJPEG2Tag: 21,
  DefineShape2Tag: 22, ProtectTag: 24, PlaceObject2Tag: 26, RemoveObject2Tag: 28,
  DefineShape3Tag: 32, DefineText2Tag: 33, DefineButton2Tag: 34,
  DefineBitsJPEG3Tag: 35, DefineBitsLossless2Tag: 36, DefineEditTextTag: 37,
  DefineSpriteTag: 39, FrameLabelTag: 43, SoundStreamHead2Tag: 45,
  DefineMorphShapeTag: 46, DefineFont2Tag: 48, ExportAssetsTag: 56,
  ImportAssetsTag: 57, DoInitActionTag: 59, DefineVideoStreamTag: 60,
  FileAttributesTag: 69, PlaceObject3Tag: 70, DefineFontAlignZonesTag: 73,
  CSMTextSettingsTag: 74, DefineFont3Tag: 75, SymbolClassTag: 76,
  DoABCTag: 82, DefineShape4Tag: 83, DefineMorphShape2Tag: 84,
  DefineBinaryDataTag: 87, DefineFontNameTag: 88, DefineBitsJPEG4Tag: 90,
};

// ------------------------------------------------------------- primitives --

function writeRect(w, rectEl) {
  const g = (n) => num(rectEl, n, num(rectEl, n.toLowerCase()));
  const vals = [g('Xmin'), g('Xmax'), g('Ymin'), g('Ymax')];
  let n = 1;
  for (const v of vals) n = Math.max(n, BitWriter.bitsS(v));
  w.ub(5, n);
  for (const v of vals) w.sb(n, v);
  // RECTs are followed by byte-aligned structures (MATRIX, flags, strings) —
  // Flash pads the rectangle to a byte boundary, and readers assume it.
  w.align();
}

function fixedRaw(v) { return Math.round(Number(v) * 65536); }

function writeMatrix(w, mEl) {
  const hasScale = mEl ? BOOL(mEl.getAttribute('hasScale') ?? 'true') : false;
  const hasRotate = mEl ? BOOL(mEl.getAttribute('hasRotate') ?? 'true') : false;
  w.ub(1, hasScale ? 1 : 0);
  if (hasScale) {
    const sx = fixedRaw(num(mEl, 'scaleX', 1));
    const sy = fixedRaw(num(mEl, 'scaleY', 1));
    const n = Math.max(2, BitWriter.bitsS(sx), BitWriter.bitsS(sy));
    w.ub(5, n);
    w.sb(n, sx); w.sb(n, sy);
  }
  w.ub(1, hasRotate ? 1 : 0);
  if (hasRotate) {
    const b = fixedRaw(num(mEl, 'rotateSkew0', 0));
    const c = fixedRaw(num(mEl, 'rotateSkew1', 0));
    const n = Math.max(2, BitWriter.bitsS(b), BitWriter.bitsS(c));
    w.ub(5, n);
    w.sb(n, b); w.sb(n, c);
  }
  const tx = num(mEl, 'translateX', 0);
  const ty = num(mEl, 'translateY', 0);
  const n = Math.max(1, BitWriter.bitsS(tx), BitWriter.bitsS(ty));
  w.ub(5, n);
  w.sb(n, tx); w.sb(n, ty);
  // A MATRIX is a bit field, but every structure that follows one starts on a
  // byte boundary (gradient modes, colour transforms, strings, tags). Without
  // this, the following field inherits the leftover bits and the stream
  // desynchronises — Flash/Ruffle then read garbage.
  w.align();
}

function childByTag(el, name) {
  for (const c of el.children) if (c.tagName === name) return c;
  return null;
}
function childrenByTag(el, name) {
  return [...el.children].filter((c) => c.tagName === name);
}
function firstData(el, pred) {
  for (const c of el.children) if (pred(c)) return c;
  return null;
}
function deepType(el, type) {
  return deepAll(el, type)[0] ?? null;
}
function deepAll(el, type) {
  const out = [];
  const rec = (e) => {
    for (const c of e.children) {
      if ((c.getAttribute('type') ?? c.tagName) === type) out.push(c);
      rec(c);
    }
  };
  rec(el);
  return out;
}

function writeColor(w, cEl, withAlpha) {
  w.u8(num(cEl, 'red'));
  w.u8(num(cEl, 'green'));
  w.u8(num(cEl, 'blue'));
  if (withAlpha) w.u8(num(cEl, 'alpha', 255));
}

function writeCxform(w, cxEl, withAlpha) {
  const hasMult = BOOL(cxEl.getAttribute('hasMultTerms') ?? 'true');
  const hasAdd = BOOL(cxEl.getAttribute('hasAddTerms') ?? 'true');
  const mr = num(cxEl, 'redMultTerm', 256), mg = num(cxEl, 'greenMultTerm', 256);
  const mb = num(cxEl, 'blueMultTerm', 256), ma = num(cxEl, 'alphaMultTerm', 256);
  const ar = num(cxEl, 'redAddTerm', 0), ag = num(cxEl, 'greenAddTerm', 0);
  const ab = num(cxEl, 'blueAddTerm', 0), aa = num(cxEl, 'alphaAddTerm', 0);
  w.ub(1, hasAdd ? 1 : 0);
  w.ub(1, hasMult ? 1 : 0);
  let n = 1;
  if (hasMult) for (const v of [mr, mg, mb, withAlpha ? ma : 256]) n = Math.max(n, BitWriter.bitsS(v));
  if (hasAdd) for (const v of [ar, ag, ab, withAlpha ? aa : 0]) n = Math.max(n, BitWriter.bitsS(v));
  w.ub(4, n);
  if (hasMult) { w.sb(n, mr); w.sb(n, mg); w.sb(n, mb); if (withAlpha) w.sb(n, ma); }
  if (hasAdd) { w.sb(n, ar); w.sb(n, ag); w.sb(n, ab); if (withAlpha) w.sb(n, aa); }
}

// ----------------------------------------------------------------- shapes --

function writeFillStyle(w, fs, shapeNum) {
  const type = num(fs, 'fillStyleType');
  w.u8(type);
  if (type === 0) {
    writeColor(w, childByTag(fs, 'color'), shapeNum >= 3);
  } else if (type === 16 || type === 18 || type === 19) {
    writeMatrix(w, childByTag(fs, 'gradientMatrix'));
    const grad = childByTag(fs, 'gradient');
    const items = gradientItems(grad);
    if (items.length > 15) throw new Error(`gradient with ${items.length} records (max 15)`);
    // GRADIENT packs spread (2), interpolation (2) and the record count (4)
    // into a single byte — not three bytes.
    w.u8(((num(grad, 'spreadMode') & 0b11) << 6) | ((num(grad, 'interpolationMode') & 0b11) << 4) | (items.length & 0x0f));
    for (const r of items) {
      w.u8(num(r, 'ratio'));
      const color = childByTag(r, 'color');
      writeColor(w, color, shapeNum >= 3);
    }
    if (type === 19) w.u16(Math.round(num(fs, 'focalPoint', 0) * 256));
  } else if (type >= 0x40 && type <= 0x43) {
    w.u16(num(fs, 'bitmapId'));
    writeMatrix(w, childByTag(fs, 'bitmapMatrix'));
  } else {
    throw new Error(`unsupported fillStyleType ${type}`);
  }
}

function gradientItems(grad) {
  if (!grad) return [];
  const wrap = childrenByTag(grad, 'gradientRecords')[0];
  if (wrap) {
    const items = [...wrap.children];
    if (items.length) return items;
    return [];
  }
  return [...grad.children].filter((c) => c.getAttribute('type') === 'GRADRECORD' || c.tagName === 'item');
}

function writeFillStyles(w, container, shapeNum) {
  // <fillStyles type="FILLSTYLEARRAY"><fillStyles><item …
  const wrapper = childrenByTag(container, 'fillStyles')[0] ?? container;
  const items = [...wrapper.children].filter((c) => c.tagName === 'item' || c.getAttribute('type') === 'FILLSTYLE');
  if (items.length >= 0xff) throw new Error('long fill arrays unsupported');
  w.u8(items.length);
  for (const fs of items) writeFillStyle(w, fs, shapeNum);
}

function writeLineStyle2(w, ls) {
  w.u16(num(ls, 'width'));
  w.ub(2, num(ls, 'startCapStyle'));
  w.ub(2, num(ls, 'joinStyle'));
  w.ub(1, BOOL(ls.getAttribute('hasFillFlag')) ? 1 : 0);
  w.ub(1, BOOL(ls.getAttribute('noHScaleFlag')) ? 1 : 0);
  w.ub(1, BOOL(ls.getAttribute('noVScaleFlag')) ? 1 : 0);
  w.ub(1, BOOL(ls.getAttribute('pixelHintingFlag')) ? 1 : 0);
  w.ub(5, num(ls, 'reserved'));
  w.ub(1, BOOL(ls.getAttribute('noClose')) ? 1 : 0);
  w.ub(2, num(ls, 'endCapStyle'));
  if (num(ls, 'joinStyle') === 2) w.u16(Math.round(num(ls, 'miterLimitFactor') * 256)); // FIXED8
  if (BOOL(ls.getAttribute('hasFillFlag'))) {
    const fill = [...ls.children].find((c) => c.getAttribute('type') === 'FILLSTYLE');
    if (fill) writeFillStyle(w, fill, 4);
    else throw new Error('LINESTYLE2 hasFillFlag without fillStyle');
  } else {
    const color = childByTag(ls, 'color');
    writeColor(w, color, true);
  }
}

function writeLineStyles(w, container, shapeNum) {
  const oldWrapper = childrenByTag(container, 'lineStyles')[0];
  const newWrapper = childrenByTag(container, 'lineStyles2')[0];
  if (shapeNum <= 3) {
    const items = oldWrapper
      ? [...oldWrapper.children].filter((c) => c.tagName === 'item' || c.getAttribute('type') === 'LINESTYLE')
      : [];
    if (items.length >= 0xff) throw new Error('long line arrays unsupported');
    w.u8(items.length);
    for (const ls of items) {
      w.u16(num(ls, 'width'));
      writeColor(w, childByTag(ls, 'color'), shapeNum >= 3);
    }
  } else {
    const items = newWrapper
      ? [...newWrapper.children].filter((c) => c.tagName === 'item' || c.getAttribute('type') === 'LINESTYLE2')
      : [];
    if (items.length >= 0xff) throw new Error('long line arrays unsupported');
    w.u8(items.length);
    for (const ls of items) writeLineStyle2(w, ls);
  }
}

function writeShapeRecords(w, recordsEl, shapeNum, fillBits0, lineBits0) {
  let fillBits = fillBits0, lineBits = lineBits0;
  w.ub(4, fillBits);
  w.ub(4, lineBits);
  const items = [...recordsEl.children];
  for (const rec of items) {
    const type = rec.getAttribute('type') ?? rec.tagName;
    if (type === 'EndShapeRecord') break;
    if (type === 'StyleChangeRecord') {
      const newStyles = BOOL(rec.getAttribute('stateNewStyles'));
      const line = BOOL(rec.getAttribute('stateLineStyle'));
      const f1 = BOOL(rec.getAttribute('stateFillStyle1'));
      const f0 = BOOL(rec.getAttribute('stateFillStyle0'));
      const move = BOOL(rec.getAttribute('stateMoveTo'));
      w.ub(1, 0); // typeFlag
      w.ub(1, newStyles ? 1 : 0);
      w.ub(1, line ? 1 : 0);
      w.ub(1, f1 ? 1 : 0);
      w.ub(1, f0 ? 1 : 0);
      w.ub(1, move ? 1 : 0);
      if (move) {
        const dx = num(rec, 'moveDeltaX'), dy = num(rec, 'moveDeltaY');
        const n = Math.max(1, BitWriter.bitsS(dx), BitWriter.bitsS(dy));
        w.ub(5, n);
        w.sb(n, dx); w.sb(n, dy);
      }
      if (f0) w.ub(fillBits, num(rec, 'fillStyle0'));
      if (f1) w.ub(fillBits, num(rec, 'fillStyle1'));
      if (line) w.ub(lineBits, num(rec, 'lineStyle'));
      if (newStyles) {
        const fs = childByTag(rec, 'fillStyles');
        const ls = childByTag(rec, 'lineStyles');
        writeFillStyles(w, fs ?? rec, shapeNum);
        writeLineStyles(w, ls ?? rec, shapeNum);
        fillBits = num(rec, 'numFillBits', 1);
        lineBits = num(rec, 'numLineBits', 1);
        w.ub(4, fillBits);
        w.ub(4, lineBits);
      }
    } else if (type === 'StraightEdgeRecord') {
      const dx = num(rec, 'deltaX'), dy = num(rec, 'deltaY');
      const general = BOOL(rec.getAttribute('generalLineFlag'));
      const vert = BOOL(rec.getAttribute('vertLineFlag'));
      w.ub(1, 1); w.ub(1, 1);
      let n = 2;
      if (general) n = Math.max(n, BitWriter.bitsS(dx), BitWriter.bitsS(dy));
      else {
        if (!vert) n = Math.max(n, BitWriter.bitsS(dx));
        if (vert) n = Math.max(n, BitWriter.bitsS(dy));
      }
      const field = Math.max(0, n - 2);
      w.ub(4, field);
      w.ub(1, general ? 1 : 0);
      if (!general) w.ub(1, vert ? 1 : 0);
      if (general || !vert) w.sb(n, dx);
      if (general || vert) w.sb(n, dy);
    } else if (type === 'CurvedEdgeRecord') {
      const cx = num(rec, 'controlDeltaX'), cy = num(rec, 'controlDeltaY');
      const ax = num(rec, 'anchorDeltaX'), ay = num(rec, 'anchorDeltaY');
      w.ub(1, 1); w.ub(1, 0);
      let n = 2;
      for (const v of [cx, cy, ax, ay]) n = Math.max(n, BitWriter.bitsS(v));
      const field = Math.max(0, n - 2);
      w.ub(4, field);
      w.sb(n, cx); w.sb(n, cy); w.sb(n, ax); w.sb(n, ay);
    } else {
      throw new Error(`unknown shape record ${type}`);
    }
  }
  // end record: 6 zero bits, then byte-align
  w.ub(6, 0);
  w.align();
}

function writeShapeBody(w, itemEl, shapeNum) {
  const shapes = childByTag(itemEl, 'shapes');
  if (!shapes) throw new Error('shape without shapes child');
  writeFillStyles(w, childByTag(shapes, 'fillStyles'), shapeNum);
  writeLineStyles(w, childByTag(shapes, 'lineStyles'), shapeNum);
  writeShapeRecords(w, childByTag(shapes, 'shapeRecords'), shapeNum,
    num(shapes, 'numFillBits', 1), num(shapes, 'numLineBits', 1));
}

function writeIdentityCxform(w) {
  w.ub(1, 0); // hasAddTerms
  w.ub(1, 0); // hasMultTerms
  w.ub(4, 1); // nbits
}

// -------------------------------------------------------------- place etc --

function writePlace2(w, el) {
  const move = BOOL(el.getAttribute('placeFlagMove')) || BOOL(el.getAttribute('move'));
  const cidAttr = el.getAttribute('characterId') ?? el.getAttribute('characterID');
  const cidPresent = cidAttr != null && cidAttr !== '';
  const cid = cidPresent ? Number(cidAttr) : undefined;
  const hasChar = BOOL(el.getAttribute('placeFlagHasCharacter')) || (!move && cidPresent) || (cidPresent && cid > 0 && !move);
  const matrix = firstData(el, (c) => (c.getAttribute('type') ?? c.tagName) === 'MATRIX' || c.tagName === 'matrix');
  const ct = firstData(el, (c) => /^CXFORM/.test(c.getAttribute('type') ?? '') || /^colorTransform/.test(c.tagName));
  const ratioAttr = has(el, 'ratio');
  const nm = el.getAttribute('name') ?? '';
  const clipRaw = has(el, 'clipDepth') ? num(el, 'clipDepth') : 0;
  const clipDepth = has(el, 'clipDepth') && clipRaw > 0 ? clipRaw : undefined;
  const clipActions = firstData(el, (c) => c.tagName === 'clipActions' || c.getAttribute('type') === 'CLIPACTIONS');

  let f1 = 0;
  if (clipActions) f1 |= 0x80;
  if (clipDepth != null) f1 |= 0x40;
  if (has(el, 'name')) f1 |= 0x20;
  if (ratioAttr) f1 |= 0x10;
  if (ct) f1 |= 0x08;
  if (matrix) f1 |= 0x04;
  if (hasChar) f1 |= 0x02;
  if (move) f1 |= 0x01;
  w.u8(f1);
  w.u16(num(el, 'depth'));
  if (hasChar) w.u16(cid || 0);
  if (matrix) writeMatrix(w, matrix);
  if (ct) writeCxform(w, ct, true);
  if (ratioAttr) w.u16(num(el, 'ratio'));
  if (clipDepth != null) w.u16(clipDepth);
  if (has(el, 'name')) w.str(nm);
  if (clipActions) writeClipActions(w, clipActions);
}

function clipEventMask(el) {
  if (!el) return 0;
  // CLIPEVENTFLAGS bytes in SWF stream order (little-endian u32):
  //   byte 0: keyUp(7) keyDown(6) mouseUp(5) mouseDown(4) mouseMove(3) unload(2) enterFrame(1) load(0)
  //   byte 1: dragOver(7) rollOut(6) rollOver(5) releaseOutside(4) release(3) press(2) initialize(1) data(0)
  //   byte 2: reserved(7..3) construct(2) keyPress(1) dragOut(0)
  //   byte 3: reserved(7..0)
  const bits = [
    ['clipEventLoad', 0],
    ['clipEventEnterFrame', 1],
    ['clipEventUnload', 2],
    ['clipEventMouseMove', 3],
    ['clipEventMouseDown', 4],
    ['clipEventMouseUp', 5],
    ['clipEventKeyDown', 6],
    ['clipEventKeyUp', 7],
    ['clipEventData', 8],
    ['clipEventInitialize', 9],
    ['clipEventPress', 10],
    ['clipEventRelease', 11],
    ['clipEventReleaseOutside', 12],
    ['clipEventRollOver', 13],
    ['clipEventRollOut', 14],
    ['clipEventDragOver', 15],
    ['clipEventDragOut', 16],
    ['clipEventKeyPress', 17],
    ['clipEventConstruct', 18],
  ];
  let mask = 0;
  for (const [attr, bit] of bits) {
    if (BOOL(el.getAttribute(attr))) mask |= (1 << bit);
  }
  return mask >>> 0;
}

function writeClipActions(w, clipEl) {
  w.u16(num(clipEl, 'reserved'));
  const allEl = childByTag(clipEl, 'allEventFlags');
  w.u32(clipEventMask(allEl));
  const recordsWrap = childByTag(clipEl, 'clipActionRecords');
  const recs = recordsWrap ? [...recordsWrap.children] : [...clipEl.children].filter((c) => c.tagName === 'clipActionRecords' || c.getAttribute('type') === 'CLIPACTIONRECORD');
  const list = recs.length ? recs : childrenByTag(clipEl, 'clipActionRecords');
  for (const rec of list) {
    const flagsEl = childByTag(rec, 'eventFlags') ?? rec;
    const rmask = clipEventMask(flagsEl);
    w.u32(rmask);
    const bytes = Buffer.from(rec.getAttribute('actionBytes') ?? '', 'hex');
    const kp = (rmask & (1 << 17)) !== 0;
    const size = (kp ? 1 : 0) + bytes.length;
    w.u32(size);
    if (kp) w.u8(num(rec, 'keyCode'));
    for (const b of bytes) w.u8(b);
  }
  // terminator: zero flags
  w.u32(0);
}

function writeRemove2(w, el) {
  w.u16(num(el, 'depth'));
}

// ------------------------------------------------------------- text/font ---

function writeTextTag(w, itemEl, is2) {
  const bounds = childByTag(itemEl, 'textBounds');
  writeRect(w, bounds);
  writeMatrix(w, childByTag(itemEl, 'textMatrix'));
  const recWrap = childByTag(itemEl, 'textRecords');
  const recs = recWrap ? [...recWrap.children] : [];
  // derive glyphBits / advanceBits (not exported in the XML)
  let glyphBits = 0, advanceBits = 1;
  for (const r of recs) {
    const glyphsWrap = childByTag(r, 'glyphEntries');
    const glyphs = glyphsWrap ? [...glyphsWrap.children] : [];
    for (const g of glyphs) {
      const idx = num(g, 'glyphIndex');
      while ((1 << glyphBits) <= idx && glyphBits < 16) glyphBits++;
      const adv = num(g, 'glyphAdvance');
      const abs = adv < 0 ? -adv - 1 : adv;
      let n = 1, x = abs;
      while (x > 0) { x >>= 1; n++; }
      advanceBits = Math.max(advanceBits, Math.min(32, n));
    }
  }
  if (glyphBits < 1) glyphBits = 1;
  if (advanceBits < 1) advanceBits = 1;
  w.u8(glyphBits);
  w.u8(advanceBits);
  for (const r of recs) {
    const hasFont = BOOL(r.getAttribute('styleFlagsHasFont'));
    const hasColor = BOOL(r.getAttribute('styleFlagsHasColor'));
    const hasY = BOOL(r.getAttribute('styleFlagsHasYOffset'));
    const hasX = BOOL(r.getAttribute('styleFlagsHasXOffset'));
    let flags = 0x80; // first=1
    if (hasFont) flags |= 0x08;
    if (hasColor) flags |= 0x04;
    if (hasY) flags |= 0x02;
    if (hasX) flags |= 0x01;
    w.u8(flags);
    if (hasFont) w.u16(num(r, 'fontId'));
    if (hasColor) {
      const color = childByTag(r, 'textColor');
      writeColor(w, color, is2);
    }
    if (hasX) w.s16(num(r, 'xOffset'));
    if (hasY) w.s16(num(r, 'yOffset'));
    if (hasFont) w.u16(num(r, 'textHeight'));
    const glyphsWrap = childByTag(r, 'glyphEntries');
    const glyphs = glyphsWrap ? [...glyphsWrap.children] : [];
    w.u8(glyphs.length);
    for (const g of glyphs) {
      if (glyphBits > 0) w.ub(glyphBits, num(g, 'glyphIndex'));
      if (advanceBits > 0) w.sb(advanceBits, num(g, 'glyphAdvance'));
    }
    w.align();
  }
  w.u8(0); // terminator
}

// DefineEditText. Layout (SWF spec / Ruffle): id, bounds, flags UI16, then
// fontId (HasFont), fontClass (HasFontClass), fontHeight (HasFont|HasFontClass),
// textColor, maxLength, layout, variableName, initialText.
const EDIT_TEXT_BITS = {
  hasFont: 0, hasMaxLength: 1, hasTextColor: 2, readOnly: 3, password: 4,
  multiline: 5, wordWrap: 6, hasText: 7, useOutlines: 8, html: 9,
  wasStatic: 10, border: 11, noSelect: 12, hasLayout: 13, autoSize: 14, hasFontClass: 15,
};
function writeEditText(w, el) {
  let flags = 0;
  for (const [name, bit] of Object.entries(EDIT_TEXT_BITS)) if (BOOL(el.getAttribute(name))) flags |= 1 << bit;
  writeRect(w, childByTag(el, 'bounds'));
  w.u16(flags);
  if (flags & 0x0001) w.u16(num(el, 'fontId'));
  if (flags & 0x8000) w.str(el.getAttribute('fontClass') ?? '');
  if (flags & 0x8001) w.u16(num(el, 'fontHeight'));
  if (flags & 0x0004) writeColor(w, childByTag(el, 'textColor'), true);
  if (flags & 0x0002) w.u16(num(el, 'maxLength'));
  if (flags & 0x2000) {
    w.u8(num(el, 'align'));
    w.u16(num(el, 'leftMargin'));
    w.u16(num(el, 'rightMargin'));
    w.s16(num(el, 'indent'));
    w.s16(num(el, 'leading'));
  }
  w.str(el.getAttribute('variableName') ?? '');
  if (flags & 0x0080) w.str(el.getAttribute('initialText') ?? '');
}

function writeFont23(w, itemEl, wideOffsetsFromAttr) {
  const wideOffsets = BOOL(itemEl.getAttribute('fontFlagsWideOffsets'));
  const wideCodes = BOOL(itemEl.getAttribute('fontFlagsWideCodes'));
  const hasLayout = BOOL(itemEl.getAttribute('fontFlagsHasLayout'));
  if (hasLayout) throw new Error('fontFlagsHasLayout=true not supported by the writer yet');
  w.u16(num(itemEl, 'fontID'));
  let f = 0;
  if (hasLayout) f |= 0x80;
  if (BOOL(itemEl.getAttribute('fontFlagsShiftJIS'))) f |= 0x40;
  if (BOOL(itemEl.getAttribute('fontFlagsSmallText'))) f |= 0x20;
  if (BOOL(itemEl.getAttribute('fontFlagsANSI'))) f |= 0x10;
  if (wideOffsets) f |= 0x08;
  if (wideCodes) f |= 0x04;
  if (BOOL(itemEl.getAttribute('fontFlagsItalic'))) f |= 0x02;
  if (BOOL(itemEl.getAttribute('fontFlagsBold'))) f |= 0x01;
  w.u8(f);
  w.u8(num(itemEl, 'languageCode'));
  // DefineFont2/3 names are length-prefixed strings. FFDec's fontName
  // attribute carries the terminator as a trailing NUL — strip it.
  const nameBytes = Buffer.from(stripEscapes(itemEl.getAttribute('fontName') ?? ''), 'utf8');
  w.u8(nameBytes.length);
  for (const b of nameBytes) w.u8(b);

  // glyphs: <glyphShapeTable><item type="SHAPE">…
  const gst = childByTag(itemEl, 'glyphShapeTable');
  const glyphs = gst ? [...gst.children] : [];
  const codeTableWrap = childByTag(itemEl, 'codeTable');
  const codes = codeTableWrap
    ? [...codeTableWrap.children].map((c) => num(c, 'value', Number(c.textContent)))
    : [];
  const n = codes.length;
  w.u16(n);

  // encode glyph shapes
  const glyphEnc = new BitWriter();
  const offsets = [];
  for (const g of glyphs) {
    offsets.push(glyphEnc.bitsOut());
    // A glyph shape carries its numFillBits/numLineBits nibbles once, and
    // writeShapeRecords emits them — writing them here as well shifted every
    // glyph by a byte (which desynchronised the whole font tag).
    writeShapeRecords(glyphEnc, childByTag(g, 'shapeRecords'), 1,
      num(g, 'numFillBits', 1), num(g, 'numLineBits', 1));
  }
  const shapesBytes = glyphEnc.bytes;
  const headerSize = 0; // offsets are relative to the position after numGlyphs…
  // layout: [offsets (n)] [codeTableOffset] shapes… codes…
  // FFDec: pos = position after reading numGlyphs; offsets relative to pos.
  const offSize = wideOffsets ? 4 : 2;
  const base = n * offSize + offSize; // bytes from pos to start of shapes
  void headerSize;
  for (let i = 0; i < n; i++) {
    // offsets[] holds bit offsets into the glyph stream; the table is in bytes
    // (writeShapeRecords byte-aligns, so every glyph starts on a byte).
    const off = base + offsets[i] / 8;
    if (wideOffsets) w.u32(off); else w.u16(off);
  }
  const codeTableOff = base + shapesBytes.length;
  if (wideOffsets) w.u32(codeTableOff); else w.u16(codeTableOff);
  for (const b of shapesBytes) w.u8(b);
  for (const c of codes) {
    if (wideCodes) w.u16(c); else w.u8(c & 0xff);
  }
  void wideOffsetsFromAttr;
}

function writeFontAlignZones(w, itemEl) {
  w.u16(num(itemEl, 'fontID'));
  w.ub(2, num(itemEl, 'CSMTableHint'));
  w.ub(6, num(itemEl, 'reserved'));
  const zoneTable = childByTag(itemEl, 'zoneTable');
  const recs = zoneTable ? [...zoneTable.children] : [];
  for (const rec of recs) {
    const dataWrap = childByTag(rec, 'zonedata');
    const items = dataWrap ? [...dataWrap.children] : [];
    w.u8(items.length);
    for (const zd of items) {
      w.u16(num(zd, 'alignmentCoordinate'));
      w.u16(num(zd, 'range'));
    }
    w.ub(6, 0);
    w.ub(1, BOOL(rec.getAttribute('zoneMaskY')) ? 1 : 0);
    w.ub(1, BOOL(rec.getAttribute('zoneMaskX')) ? 1 : 0);
  }
  w.align();
}

// ----------------------------------------------------------------- tags ----

function writeTag(w, itemEl) {
  const type = itemEl.getAttribute('type');
  const code = TAG_CODES[type];
  if (code == null) throw new Error(`unsupported tag type ${type}`);
  const payload = tagPayload(itemEl, type);
  if (payload.length < 0x3f) {
    w.u16((code << 6) | payload.length);
  } else {
    w.u16(code << 6 | 0x3f);
    w.u32(payload.length);
  }
  for (const b of payload) w.u8(b);
}

function tagPayload(itemEl, type) {
  const w = new BitWriter();
  switch (type) {
    case 'ShowFrameTag':
      break;
    case 'SetBackgroundColorTag': {
      const c = childByTag(itemEl, 'backgroundColor') ?? itemEl.firstElementChild;
      writeColor(w, c, false);
      break;
    }
    case 'FrameLabelTag': {
      w.str(itemEl.getAttribute('name') ?? itemEl.getAttribute('label') ?? '');
      if (BOOL(itemEl.getAttribute('namedAnchor'))) w.u8(1);
      break;
    }
    case 'DoActionTag':
    case 'DoInitActionTag':
      w.hex(itemEl.getAttribute('actionBytes'));
      break;
    case 'PlaceObject2Tag':
      writePlace2(w, itemEl);
      break;
    case 'RemoveObject2Tag':
      writeRemove2(w, itemEl);
      break;
    case 'DefineShapeTag': case 'DefineShape2Tag': case 'DefineShape3Tag': {
      w.u16(num(itemEl, 'shapeId'));
      writeRect(w, childByTag(itemEl, 'shapeBounds'));
      const shapeNum = type === 'DefineShapeTag' ? 1 : type === 'DefineShape2Tag' ? 2 : 3;
      writeShapeBody(w, itemEl, shapeNum);
      break;
    }
    case 'DefineShape4Tag': {
      w.u16(num(itemEl, 'shapeId'));
      writeRect(w, childByTag(itemEl, 'shapeBounds'));
      w.align();
      writeRect(w, childByTag(itemEl, 'edgeBounds'));
      w.align();
      w.ub(5, num(itemEl, 'reserved'));
      w.ub(1, BOOL(itemEl.getAttribute('usesFillWindingRule')) ? 1 : 0);
      w.ub(1, BOOL(itemEl.getAttribute('usesNonScalingStrokes')) ? 1 : 0);
      w.ub(1, BOOL(itemEl.getAttribute('usesScalingStrokes')) ? 1 : 0);
      writeShapeBody(w, itemEl, 4);
      break;
    }
    case 'DefineSpriteTag': {
      w.u16(num(itemEl, 'spriteId'));
      w.u16(num(itemEl, 'frameCount'));
      const sub = childByTag(itemEl, 'subTags');
      const kids = sub ? [...sub.children] : [];
      for (const k of kids) writeTag(w, k);
      if (BOOL(itemEl.getAttribute('hasEndTag'))) {
        w.u16(0 << 6); // End tag, length 0
      }
      break;
    }
    case 'DefineTextTag':
    case 'DefineText2Tag': {
      w.u16(num(itemEl, 'characterID'));
      writeTextTag(w, itemEl, type === 'DefineText2Tag');
      break;
    }
    case 'DefineEditTextTag':
      w.u16(num(itemEl, 'characterID'));
      writeEditText(w, itemEl);
      break;
    case 'DefineFont2Tag':
    case 'DefineFont3Tag':
      writeFont23(w, itemEl, false);
      break;
    case 'DefineFontAlignZonesTag':
      writeFontAlignZones(w, itemEl);
      break;
    case 'DefineFontNameTag':
      w.u16(num(itemEl, 'fontId'));
      w.str(stripEscapes(itemEl.getAttribute('fontName') ?? ''));
      w.str(stripEscapes(itemEl.getAttribute('fontCopyright') ?? ''));
      break;
    case 'CSMTextSettingsTag': {
      // id, flags (bit6 useFlashType, bits3-4 gridFit, rest reserved),
      // thickness FLOAT, sharpness FLOAT, reserved byte.
      w.u16(num(itemEl, 'textID'));
      const gridFit = num(itemEl, 'gridFit') & 0b11;
      const useFlashType = BOOL(itemEl.getAttribute('useFlashType')) || num(itemEl, 'useFlashType') ? 1 : 0;
      const reserved = num(itemEl, 'reserved') & 0b10010011;
      w.u8((reserved & 0b10010011) | ((gridFit & 0b11) << 3) | (useFlashType << 6));
      w.f32(num(itemEl, 'thickness'));
      w.f32(num(itemEl, 'sharpness'));
      w.u8(num(itemEl, 'reserved2'));
      break;
    }
    case 'DefineButton2Tag': {
      w.u16(num(itemEl, 'buttonId'));
      w.ub(7, num(itemEl, 'reserved'));
      w.ub(1, BOOL(itemEl.getAttribute('trackAsMenu')) ? 1 : 0);
      const recs = deepAll(itemEl, 'BUTTONRECORD');
      const conds = deepAll(itemEl, 'BUTTONCONDACTION');
      const recW = new BitWriter();
      for (const r of recs) {
        let f = 0;
        if (BOOL(r.getAttribute('buttonHasBlendMode'))) f |= 0x20;
        if (BOOL(r.getAttribute('buttonHasFilterList'))) f |= 0x10;
        if (BOOL(r.getAttribute('buttonStateHitTest'))) f |= 0x08;
        if (BOOL(r.getAttribute('buttonStateDown'))) f |= 0x04;
        if (BOOL(r.getAttribute('buttonStateOver'))) f |= 0x02;
        if (BOOL(r.getAttribute('buttonStateUp'))) f |= 0x01;
        recW.u8(f);
        recW.u16(num(r, 'characterId'));
        recW.u16(num(r, 'placeDepth'));
        writeMatrix(recW, childByTag(r, 'placeMatrix'));
        const ct = firstData(r, (c) => /^CXFORM/.test(c.getAttribute('type') ?? ''));
        if (ct) writeCxform(recW, ct, true);
        else writeIdentityCxform(recW);
        if (BOOL(r.getAttribute('buttonHasFilterList'))) throw new Error('button filter lists unsupported');
        if (BOOL(r.getAttribute('buttonHasBlendMode'))) recW.u8(num(r, 'blendMode'));
      }
      recW.u8(0); // terminator
      const recBytes = recW.bytes;
      if (conds.length) {
        w.u16(2 + recBytes.length);
      } else {
        w.u16(0);
      }
      for (const b of recBytes) w.u8(b);
      if (conds.length) {
        for (let i = 0; i < conds.length; i++) {
          const c = conds[i];
          const bytes = Buffer.from(c.getAttribute('actionBytes') ?? '', 'hex');
          const isLast = i === conds.length - 1;
          if (isLast) w.u16(0); else w.u16(4 + bytes.length);
          let b1 = 0;
          if (BOOL(c.getAttribute('condIdleToOverDown'))) b1 |= 0x80;
          if (BOOL(c.getAttribute('condOutDownToIdle'))) b1 |= 0x40;
          if (BOOL(c.getAttribute('condOutDownToOverDown'))) b1 |= 0x20;
          if (BOOL(c.getAttribute('condOverDownToOutDown'))) b1 |= 0x10;
          if (BOOL(c.getAttribute('condOverDownToOverUp'))) b1 |= 0x08;
          if (BOOL(c.getAttribute('condOverUpToOverDown'))) b1 |= 0x04;
          if (BOOL(c.getAttribute('condOverUpToIddle'))) b1 |= 0x02;
          if (BOOL(c.getAttribute('condIdleToOverUp'))) b1 |= 0x01;
          const key = num(c, 'condKeyPress');
          const b2 = ((key & 0x7f) << 1) | (BOOL(c.getAttribute('condOverDownToIdle')) ? 1 : 0);
          w.u8(b1); w.u8(b2);
          for (const b of bytes) w.u8(b);
        }
      }
      break;
    }
    case 'ExportAssetsTag':
    case 'SymbolClassTag': {
      const tagsWrap = childByTag(itemEl, 'tags') ?? childByTag(itemEl, 'characterIds') ?? childByTag(itemEl, 'ids');
      const namesWrap = childByTag(itemEl, 'names') ?? childByTag(itemEl, 'classNames');
      const ids = tagsWrap ? [...tagsWrap.children].map((c) => num(c, 'value', Number(c.textContent))) : [];
      const names = namesWrap ? [...namesWrap.children].map((c) => (c.getAttribute('value') ?? c.textContent ?? '').trim()) : [];
      w.u16(ids.length);
      for (const id of ids) w.u16(id);
      for (const n of names) w.str(n);
      break;
    }
    case 'FileAttributesTag': {
      w.ub(1, BOOL(itemEl.getAttribute('reservedA')) ? 1 : 0);
      w.ub(1, 0);
      w.ub(1, BOOL(itemEl.getAttribute('useDirectBlit')) ? 1 : 0);
      w.ub(1, BOOL(itemEl.getAttribute('useGPU')) ? 1 : 0);
      w.ub(1, BOOL(itemEl.getAttribute('hasMetadata')) ? 1 : 0);
      w.ub(1, BOOL(itemEl.getAttribute('actionScript3')) ? 1 : 0);
      w.ub(1, BOOL(itemEl.getAttribute('noCrossDomainCache')) ? 1 : 0);
      w.ub(1, BOOL(itemEl.getAttribute('swfRelativeUrls')) ? 1 : 0);
      w.ub(1, BOOL(itemEl.getAttribute('useNetwork')) ? 1 : 0);
      w.ub(24, num(itemEl, 'reservedB'));
      break;
    }
    case 'ProtectTag': {
      w.u16(num(itemEl, 'reserved'));
      w.str(itemEl.getAttribute('passwordHash') ?? '');
      break;
    }
    case 'JPEGTablesTag':
      w.hex(itemEl.getAttribute('jpegData'));
      break;
    case 'DefineBitsTag':
      w.u16(num(itemEl, 'characterID'));
      // FFDec names the payload jpegData for DefineBits/JPEGTables,
      // imageData for the DefineBitsJPEG2/3 variants.
      w.hex(itemEl.getAttribute('jpegData') ?? itemEl.getAttribute('imageData'));
      break;
    case 'DefineBitsJPEG2Tag':
      w.u16(num(itemEl, 'characterID'));
      w.hex(itemEl.getAttribute('imageData'));
      break;
    case 'DefineBitsJPEG3Tag': {
      w.u16(num(itemEl, 'characterID'));
      const jpeg = Buffer.from(itemEl.getAttribute('imageData') ?? '', 'hex');
      const alpha = Buffer.from(itemEl.getAttribute('bitmapAlphaData') ?? '', 'hex');
      w.u32(jpeg.length);
      for (const b of jpeg) w.u8(b);
      // FFDec exports the alpha channel already zlib-compressed (78xx header).
      for (const b of alpha) w.u8(b);
      break;
    }
    case 'DefineBitsLosslessTag':
    case 'DefineBitsLossless2Tag': {
      w.u16(num(itemEl, 'characterID'));
      w.u8(num(itemEl, 'bitmapFormat'));
      w.u16(num(itemEl, 'bitmapWidth'));
      w.u16(num(itemEl, 'bitmapHeight'));
      if (num(itemEl, 'bitmapFormat') === 3) w.u8(num(itemEl, 'bitmapColorTableSize'));
      w.hex(itemEl.getAttribute('zlibBitmapData'));
      break;
    }
    case 'StartSoundTag': {
      w.u16(num(itemEl, 'soundId'));
      const si = firstData(itemEl, (c) => (c.getAttribute('type') ?? '') === 'SOUNDINFO' || c.tagName === 'soundInfo');
      let f = 0;
      if (si) {
        if (BOOL(si.getAttribute('syncStop'))) f |= 0x20;
        if (BOOL(si.getAttribute('syncNoMultiple'))) f |= 0x10;
        if (BOOL(si.getAttribute('hasEnvelope'))) f |= 0x08;
        if (BOOL(si.getAttribute('hasLoops'))) f |= 0x04;
        if (BOOL(si.getAttribute('hasOutPoint'))) f |= 0x02;
        if (BOOL(si.getAttribute('hasInPoint'))) f |= 0x01;
      }
      w.u8(f);
      if (si && BOOL(si.getAttribute('hasInPoint'))) w.u32(num(si, 'inPoint'));
      if (si && BOOL(si.getAttribute('hasOutPoint'))) w.u32(num(si, 'outPoint'));
      if (si && BOOL(si.getAttribute('hasLoops'))) w.u16(num(si, 'loopCount'));
      if (si && BOOL(si.getAttribute('hasEnvelope'))) {
        const envs = childrenByTag(si, 'envelopes');
        const items = envs.length ? [...envs[0].children] : [];
        w.u16(items.length);
        for (const e of items) {
          w.u32(num(e, 'position44k'));
          w.u16(num(e, 'left44k'));
          w.u16(num(e, 'right44k'));
        }
      }
      break;
    }
    default:
      throw new Error(`tag writer not implemented: ${type}`);
  }
  w.align();
  return Buffer.from(w.bytes);
}

// ------------------------------------------------------------------ main ---

export function xmlToSwf(xmlText) {
  const dom = new JSDOM(xmlText, { contentType: 'application/xml' });
  const doc = dom.window.document;
  const root = doc.documentElement;
  if (root.tagName !== 'swf') throw new Error(`expected <swf> root, got <${root.tagName}>`);

  const out = new BitWriter();
  const version = num(root, 'version', 7);
  const frameRate = Number(root.getAttribute('frameRate')) || 24;
  const frameCount = num(root, 'frameCount');

  // header: signature + length patched later; RECT/frame fields first
  const stageEl = [...root.children].find((c) => /displayRect|frameSize|rect/i.test(c.tagName) && !TAG_CODES[c.tagName] && c.tagName !== 'item');
  const stageEl2 = stageEl ?? [...root.children].find((c) => (c.getAttribute('type') ?? '') === 'RECT');
  out.raw(0x46, 0x57, 0x53, version); // FWS
  out.u32(0); // length placeholder
  if (stageEl2) writeRect(out, stageEl2);
  else {
    // default stage 550×400
    out.ub(5, 16); out.sb(16, 0); out.sb(16, 550 * 20); out.sb(16, 0); out.sb(16, 400 * 20);
    out.align();
  }
  out.u16(Math.round(frameRate * 256));
  out.u16(frameCount);

  // root tag stream: FFDec wraps items in a <tags> container
  const items = [];
  for (const c of root.children) {
    if (c.tagName === 'item') { items.push(c); continue; }
    if (c.tagName === 'tags' || c.tagName === 'subTags') {
      for (const g of c.children) if (g.tagName === 'item') items.push(g);
      continue;
    }
    if (c.tagName === 'frame') {
      for (const g of c.children) {
        if (g.tagName === 'item') items.push(g);
        else if (g.tagName === 'tags') for (const h of g.children) if (h.tagName === 'item') items.push(h);
      }
    }
  }
  for (const it of items) writeTag(out, it);
  out.raw(0x00, 0x00); // End tag

  const bytes = Buffer.from(out.bytes);
  bytes.writeUInt32LE(bytes.length, 4);
  return bytes;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [, , input, output] = process.argv;
  if (!input || !output) {
    console.error('usage: node xml2swf.mjs <input.xml> <output.swf>');
    process.exit(2);
  }
  try {
    const xml = readFileSync(input, 'utf8');
    const swf = xmlToSwf(xml);
    writeFileSync(output, swf);
    console.error(`wrote ${output} (${swf.length} bytes)`);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}
