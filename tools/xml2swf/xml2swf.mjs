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
  } else if (type === 16 || type === 18) {
    writeMatrix(w, childByTag(fs, 'gradientMatrix'));
    const grad = childByTag(fs, 'gradient');
    w.u8(num(grad, 'spreadMode'));
    w.u8(num(grad, 'interpolationMode'));
    const items = gradientItems(grad);
    w.u8(items.length);
    for (const r of items) {
      w.u8(num(r, 'ratio'));
      const color = childByTag(r, 'color');
      writeColor(w, color, shapeNum >= 3);
    }
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
  if (num(ls, 'joinStyle') === 2) w.u8(Math.round(num(ls, 'miterLimitFactor') * 256));
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

function clipEventBits(allEl, recEl) {
  // CLIPEVENTFLAGS: 16 named low bits + (SWF6+) 5 reserved, construct, keyPress, dragOut, reserved2
  const names = [
    'clipEventKeyUp', 'clipEventKeyDown', 'clipEventMouseUp', 'clipEventMouseDown',
    'clipEventMouseMove', 'clipEventUnload', 'clipEventEnterFrame', 'clipEventLoad',
    'clipEventDragOver', 'clipEventRollOut', 'clipEventRollOver', 'clipEventReleaseOutside',
    'clipEventRelease', 'clipEventPress', 'clipEventInitialize', 'clipEventData',
  ];
  let lo = 0;
  names.forEach((n, i) => { if (BOOL(recEl?.getAttribute(n)) || (recEl == null && BOOL(allEl?.getAttribute(n)))) lo |= (1 << (15 - i)); });
  let hi = 0; // 16 bits: reserved(5) construct keyPress dragOut reserved2(8)
  const put = (bit, on) => { if (on) hi |= 1 << bit; };
  // bit positions counted from MSB of the 16-bit field
  if (BOOL(recEl?.getAttribute('clipEventConstruct')) || (recEl == null && BOOL(allEl?.getAttribute('clipEventConstruct')))) hi |= 1 << 10;
  if (BOOL(recEl?.getAttribute('clipEventKeyPress')) || (recEl == null && BOOL(allEl?.getAttribute('clipEventKeyPress')))) hi |= 1 << 9;
  if (BOOL(recEl?.getAttribute('clipEventDragOut')) || (recEl == null && BOOL(allEl?.getAttribute('clipEventDragOut')))) hi |= 1 << 8;
  void put;
  return [lo >>> 0, hi >>> 0];
}

function writeClipActions(w, clipEl) {
  w.u16(num(clipEl, 'reserved'));
  const allEl = childByTag(clipEl, 'allEventFlags');
  const [lo, hi] = clipEventBits(allEl, null);
  w.u16(lo); w.u16(hi);
  const recordsWrap = childByTag(clipEl, 'clipActionRecords');
  const recs = recordsWrap ? [...recordsWrap.children] : [...clipEl.children].filter((c) => c.tagName === 'clipActionRecords' || c.getAttribute('type') === 'CLIPACTIONRECORD');
  const list = recs.length ? recs : childrenByTag(clipEl, 'clipActionRecords');
  for (const rec of list) {
    const [rlo, rhi] = clipEventBits(allEl, rec);
    w.u16(rlo); w.u16(rhi);
    const bytes = Buffer.from(rec.getAttribute('actionBytes') ?? '', 'hex');
    const keyPress = BOOL(rec.getAttribute('eventFlags')?.includes?.('keyPress') ?? false);
    const flagsEl = childByTag(rec, 'eventFlags');
    const kp = flagsEl ? BOOL(flagsEl.getAttribute('clipEventKeyPress')) : false;
    const size = 4 + (kp ? 1 : 0) + bytes.length;
    w.u32(size);
    if (kp) w.u8(num(rec, 'keyCode'));
    for (const b of bytes) w.u8(b);
    void keyPress;
  }
  // terminator: zero flags
  w.u16(0); w.u16(0);
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

function writeEditText(w, el) {
  const bounds = childByTag(el, 'bounds');
  const hasFont = BOOL(el.getAttribute('hasFont'));
  const hasMaxLength = BOOL(el.getAttribute('hasMaxLength'));
  const hasTextColor = BOOL(el.getAttribute('hasTextColor'));
  const readOnly = BOOL(el.getAttribute('readOnly'));
  const password = BOOL(el.getAttribute('password'));
  const hasFontClass = BOOL(el.getAttribute('hasFontClass'));
  const autoSize = BOOL(el.getAttribute('autoSize'));
  const hasLayout = BOOL(el.getAttribute('hasLayout'));
  const noSelect = BOOL(el.getAttribute('noSelect'));
  const wordWrap = BOOL(el.getAttribute('wordWrap'));
  const hasText = BOOL(el.getAttribute('hasText'));
  let f1 = 0;
  if (hasFont) f1 |= 0x80;
  if (hasMaxLength) f1 |= 0x40;
  if (hasTextColor) f1 |= 0x20;
  if (readOnly) f1 |= 0x10;
  if (password) f1 |= 0x08;
  if (hasFontClass) f1 |= 0x04;
  if (autoSize) f1 |= 0x02;
  let f2 = 0;
  if (hasLayout) f2 |= 0x80;
  if (noSelect) f2 |= 0x40;
  if (wordWrap) f2 |= 0x20;
  if (hasText) f2 |= 0x01;
  w.u8(f1); w.u8(f2);
  writeRect(w, bounds);
  if (hasFont) { w.u16(num(el, 'fontId')); w.u16(num(el, 'fontHeight')); }
  if (hasTextColor) {
    const c = childByTag(el, 'textColor');
    writeColor(w, c, true);
  }
  if (hasLayout) {
    w.u8(num(el, 'align'));
    w.u16(num(el, 'leftMargin'));
    w.u16(num(el, 'rightMargin'));
    w.s16(num(el, 'indent'));
    w.s16(num(el, 'leading'));
  }
  if (hasFontClass) w.str(el.getAttribute('fontClass') ?? '');
  w.str(el.getAttribute('variableName') ?? '');
  if (hasText) w.str(el.getAttribute('initialText') ?? '');
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
  const name = itemEl.getAttribute('fontName') ?? '';
  w.u8(Buffer.byteLength(name, 'utf8'));
  for (const b of Buffer.from(name, 'utf8')) w.u8(b);

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
    const shapes = g; // item type=SHAPE holds numFillBits/numLineBits + records
    glyphEnc.ub(4, num(shapes, 'numFillBits', 1));
    glyphEnc.ub(4, num(shapes, 'numLineBits', 1));
    writeShapeRecords(glyphEnc, childByTag(shapes, 'shapeRecords'), 1,
      num(shapes, 'numFillBits', 1), num(shapes, 'numLineBits', 1));
  }
  const shapesBytes = glyphEnc.bytes;
  const headerSize = 0; // offsets are relative to the position after numGlyphs…
  // layout: [offsets (n)] [codeTableOffset] shapes… codes…
  // FFDec: pos = position after reading numGlyphs; offsets relative to pos.
  const offSize = wideOffsets ? 4 : 2;
  const base = n * offSize + offSize; // bytes from pos to start of shapes
  void headerSize;
  for (let i = 0; i < n; i++) {
    const off = base + offsets[i];
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
      w.str(itemEl.getAttribute('fontName') ?? '');
      w.str(itemEl.getAttribute('fontCopyright') ?? '');
      break;
    case 'CSMTextSettingsTag': {
      w.u16(num(itemEl, 'textID'));
      w.ub(3, num(itemEl, 'reserved'));
      w.ub(3, num(itemEl, 'gridFit'));
      w.ub(2, num(itemEl, 'useFlashType'));
      w.u8(Math.round(num(itemEl, 'sharpness') * 256));
      w.u8(Math.round(num(itemEl, 'thickness') * 256));
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
      w.hex(itemEl.getAttribute('imageData'));
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
      if (alpha.length) {
        const z = zlib.deflateSync(alpha);
        for (const b of z) w.u8(b);
      }
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
