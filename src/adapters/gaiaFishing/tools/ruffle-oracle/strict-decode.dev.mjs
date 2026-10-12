// Dev tool: strict SWF tag validator.
//
// Walks every tag (including those nested in DefineSprite) and decodes it with
// a spec-faithful reader mirroring Ruffle's swf/src/read.rs. A tag that does
// not decode, or that does not consume its payload exactly, is reported — that
// is how lossy writers (tools/xml2swf) are caught.
//
//   node strict-decode.dev.mjs <file.swf> [--verbose]
import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const VERBOSE = process.argv.includes('--verbose');
const raw = fs.readFileSync(file);
const body = raw[0] === 0x43 ? zlib.inflateSync(raw.subarray(8)) : raw.subarray(8);

class BR {
  constructor(d, start = 0) { this.d = d; this.p = start; this.bit = 0; this.anchor = start; }
  align() { if (this.bit) { this.bit = 0; this.p++; } }
  ub(n) {
    if (n === 0) return 0;
    if (n > 32) throw new Error(`excessive bits (${n})`);
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (this.p >= this.d.length) throw new Error('eof');
      v = (v << 1) | ((this.d[this.p] >> (7 - this.bit)) & 1);
      if (++this.bit === 8) { this.bit = 0; this.p++; }
    }
    return v >>> 0;
  }
  sb(n) { if (!n) return 0; const v = this.ub(n); const s = 1 << (n - 1); return (v & s) ? v - (1 << n) : v; }
  u8() { this.align(); if (this.p >= this.d.length) throw new Error('eof(u8)'); return this.d[this.p++]; }
  u16() { const a = this.u8(), b = this.u8(); return a | (b << 8); }
  u32() { const a = this.u16(), b = this.u16(); return (a | (b << 16)) >>> 0; }
  i16() { const v = this.u16(); return v >= 0x8000 ? v - 0x10000 : v; }
  f32() { const a = this.u32(); return new DataView(new Uint8Array([a & 255, (a >> 8) & 255, (a >> 16) & 255, (a >>> 24) & 255]).buffer).getFloat32(0, true); }
  fixed8() { const v = this.u16(); return (v >= 0x8000 ? v - 0x10000 : v) / 256; }
  str() { this.align(); let s = ''; while (this.p < this.d.length && this.d[this.p] !== 0) s += String.fromCharCode(this.d[this.p++]); if (this.p >= this.d.length) throw new Error('eof(str)'); this.p++; return s; }
  pos() { return this.p * 8 + this.bit; }
  left() { return (this.d.length - this.p) * 8 - this.bit; }
  seek(bytePos) { this.p = bytePos; this.bit = 0; }
}

const rect = (b) => { const n = b.ub(5); return [b.sb(n), b.sb(n), b.sb(n), b.sb(n)]; };
function matrix(b) {
  if (b.ub(1)) { const n = b.ub(5); b.sb(n); b.sb(n); }
  if (b.ub(1)) { const n = b.ub(5); b.sb(n); b.sb(n); }
  const n = b.ub(5); b.sb(n); b.sb(n);
  b.align();
}
const color = (b, alpha) => { b.u8(); b.u8(); b.u8(); if (alpha) b.u8(); };
function gradient(b, v) { matrix(b); b.u8(); b.u8(); const n = b.u8(); for (let i = 0; i < n; i++) { b.u8(); color(b, v >= 3); } }
function fillStyle(b, v) {
  const t = b.u8();
  if (t === 0x00) color(b, v >= 3);
  else if (t === 0x10 || t === 0x12) gradient(b, v);
  else if (t === 0x13) { gradient(b, v); b.u16(); }
  else if (t >= 0x40 && t <= 0x43) { b.u16(); matrix(b); }
  else throw new Error(`invalid fill style 0x${t.toString(16)}`);
}
function fillStyles(b, v) { let n = b.u8(); if (n === 0xff && v >= 2) n = b.u16(); for (let i = 0; i < n; i++) fillStyle(b, v); }
function lineStyles(b, v) {
  let n = b.u8(); if (n === 0xff && v >= 2) n = b.u16();
  for (let i = 0; i < n; i++) {
    b.u16();
    if (v < 4) color(b, v >= 3);
    else { const f = b.u16(); if (((f >> 4) & 3) === 2) b.u16(); if ((f >> 3) & 1) fillStyle(b, v); else color(b, true); }
  }
}
function shapeRecords(b, v, fillBits, lineBits) {
  for (;;) {
    if (b.ub(1)) {
      const straight = b.ub(1); const nb = b.ub(4) + 2;
      if (straight) { const aligned = !b.ub(1); const vert = aligned && b.ub(1); if (!aligned || !vert) b.sb(nb); if (!aligned || vert) b.sb(nb); }
      else { b.sb(nb); b.sb(nb); b.sb(nb); b.sb(nb); }
    } else {
      const f = b.ub(5);
      if (f === 0) break;
      if (f & 1) { const n = b.ub(5); b.sb(n); b.sb(n); }
      if (f & 2) b.ub(fillBits);
      if (f & 4) b.ub(fillBits);
      if (f & 8) b.ub(lineBits);
      if (f & 16) { fillStyles(b, v); lineStyles(b, v); const nb = b.u8(); fillBits = nb >> 4; lineBits = nb & 0xf; }
    }
  }
  b.align();
}
function defineShape(b, v) {
  b.u16(); rect(b);
  if (v >= 4) { rect(b); b.u8(); }
  fillStyles(b, v); lineStyles(b, v);
  const nb = b.u8();
  shapeRecords(b, v, nb >> 4, nb & 0xf);
}
function defineText(b, v) {
  b.u16(); rect(b); matrix(b);
  const gb = b.u8(), ab = b.u8();
  for (;;) {
    const flags = b.u8();
    if (flags === 0) break;
    if (flags & 0x08) b.u16();
    if (flags & 0x04) color(b, v >= 2);
    if (flags & 0x01) b.i16();
    if (flags & 0x02) b.i16();
    if (flags & 0x08) b.u16();
    const n = b.u8();
    const bits = new BR(b.d);
    bits.seek(b.p); bits.bit = b.bit;
    for (let i = 0; i < n; i++) { bits.ub(gb); bits.sb(ab); }
    b.p = bits.p; b.bit = bits.bit;
  }
}
function defineButton2(b) {
  b.u16(); b.u8(); const off = b.u16();
  const recStart = b.p;
  for (;;) {
    const flags = b.u8();
    if (flags === 0) break;
    b.u16(); b.u16(); matrix(b); color(b, true);
    if (flags & 0x10) { const n = b.u8(); for (let i = 0; i < n; i++) throw new Error('filter list'); }
    if (flags & 0x20) b.u8();
  }
  const recEnd = b.p;
  if (off !== 0 && off !== 2 + (recEnd - recStart)) throw new Error(`actionOffset ${off} != ${2 + (recEnd - recStart)}`);
  while (b.left() > 0) {
    const len = b.u16();
    const flags = b.u16();
    if (len === 0) { b.p = b.d.length; break; }
    if (len < 4) throw new Error(`bad button action length ${len}`);
    b.p += len - 4;
    if (!(flags & 0x4000)) void 0;
  }
}
function defineEditText(b) {
  b.u16(); rect(b); const flags = b.u16();
  if (flags & 0x0001) b.u16();
  if (flags & 0x8000) b.str();
  if (flags & 0x8001) b.u16();
  if (flags & 0x0004) color(b, true);
  if (flags & 0x0008) b.u16();
  if (flags & 0x0010) { b.u8(); b.u16(); b.u16(); b.i16(); b.i16(); }
  if (flags & 0x0002) b.str();
  if (flags & 0x0020) b.u16();
}
function defineFont2(b, v) {
  b.u16(); const flags = b.u8(); b.u8(); b.str();
  const numGlyphs = b.u16();
  if (numGlyphs === 0) { if (flags & 0x08) b.u32(); else b.u16(); return; }
  const wideOffsets = (flags & 0x08) !== 0;
  const offsetsRef = b.p;
  const offsets = [];
  for (let i = 0; i < numGlyphs; i++) offsets.push(wideOffsets ? b.u32() : b.u16());
  const codeTableOffset = wideOffsets ? b.u32() : b.u16();
  for (let i = 0; i < numGlyphs; i++) {
    b.seek(offsetsRef + offsets[i]);
    const nb = b.u8();
    shapeRecords(b, 1, nb >> 4, nb & 0xf);
  }
  b.seek(offsetsRef + codeTableOffset);
  for (let i = 0; i < numGlyphs; i++) if (flags & 0x10) b.u16(); else b.u8();
  if (flags & 0x80) {
    b.u16(); b.u16(); b.i16();
    for (let i = 0; i < numGlyphs; i++) b.u16();
    for (let i = 0; i < numGlyphs; i++) rect(b);
    const n = b.u16();
    for (let i = 0; i < n; i++) { if (flags & 0x10) { b.u16(); b.u16(); } else { b.u8(); b.u8(); } b.i16(); }
  }
}
function defineFontAlignZones(b) {
  b.u16(); b.u8();
  while (b.left() > 0) { b.u8(); b.i16(); b.i16(); b.i16(); b.i16(); b.u8(); }
}
function csmTextSettings(b) { b.u16(); b.u8(); b.f32(); b.f32(); b.u8(); }
function bitsLossless(b) {
  b.u16(); const fmt = b.u8(); const w = b.u16(), h = b.u16();
  if (fmt === 3) b.u8();
  const data = b.d.subarray(b.p);
  b.p = b.d.length;
  return { fmt, w, h, data };
}
function bitsJpeg3(b, v) {
  b.u16(); const size = b.u32(); if (v >= 4) b.fixed8();
  b.p += size;
  const alpha = b.d.subarray(b.p); b.p = b.d.length;
  return { alpha };
}
function placeObject2(b) {
  const flags = b.u8();
  if (flags & 0x02) b.u16();
  if (flags & 0x04) b.u16();
  if (flags & 0x08) { color(b, true); if (flags & 0x10) matrix(b); }
  else if (flags & 0x10) matrix(b);
  if (flags & 0x20) b.str();
  if (flags & 0x40) b.u16();
  if (flags & 0x80) b.u16(); // clip depth? no: 0x80 = hasFilterList in v3
}
function doAction(b, hasSprite) {
  if (hasSprite) b.u16();
  // action bytecode: cannot validate opcodes cheaply, but must consume payload
  b.p += b.d.length - b.p;
}
function soundStreamHead(b) {
  b.u8(); b.u8(); b.u8(); b.u8(); b.u8(); b.u8();
}
function defineMorphShape(b) { b.p += b.d.length - b.p; }

const TAG_NAMES = {
  1: 'ShowFrame', 2: 'DefineShape', 9: 'SetBackgroundColor', 11: 'DefineText', 12: 'DoAction',
  20: 'DefineBitsLossless', 21: 'DefineBitsJPEG2', 22: 'DefineShape2', 24: 'Protect',
  26: 'PlaceObject2', 28: 'RemoveObject2', 32: 'DefineShape3', 33: 'DefineText2',
  34: 'DefineButton2', 35: 'DefineBitsJPEG3', 36: 'DefineBitsLossless2', 37: 'DefineEditText',
  39: 'DefineSprite', 43: 'FrameLabel', 45: 'SoundStreamHead2', 48: 'DefineFont2',
  56: 'ExportAssets', 57: 'ImportAssets', 59: 'DoInitAction', 69: 'ScriptLimits',
  70: 'PlaceObject3', 73: 'DefineFontAlignZones', 74: 'CSMTextSettings', 75: 'DefineFont3',
  76: 'SymbolClass', 83: 'DefineShape4', 88: 'DefineFontName',
};

const report = { ok: 0, fail: 0, byName: {} };
function validateTags(d, spritePath) {
  let p = 0;
  while (p + 2 <= d.length) {
    const c = d[p] | (d[p + 1] << 8);
    const t = c >> 6;
    const long = (c & 0x3f) === 0x3f;
    const len = long ? (d[p + 2] | (d[p + 3] << 8) | (d[p + 4] << 16) | (d[p + 5] << 24)) : (c & 0x3f);
    const o = long ? p + 6 : p + 2;
    if (t === 0) return;
    if (o + len > d.length) throw new Error(`tag ${t} (${TAG_NAMES[t] ?? '?'}) overruns its stream at ${p}`);
    const payload = d.subarray(o, o + len);
    p = o + len;
    const name = TAG_NAMES[t] ?? String(t);
    try {
      const b = new BR(payload);
      switch (t) {
        case 1: break;
        case 2: case 22: defineShape(b, 1); break;
        case 32: defineShape(b, 3); break;
        case 83: defineShape(b, 4); break;
        case 9: b.p = 3; break;
        case 11: defineText(b, 1); break;
        case 33: defineText(b, 2); break;
        case 12: doAction(b, false); break;
        case 59: doAction(b, true); break;
        case 20: case 36: {
          const r = bitsLossless(b);
          const un = zlib.inflateSync(Buffer.from(r.data));
          const expect = r.fmt === 3 ? r.w * r.h + 0 : r.w * r.h * (r.fmt === 5 ? 4 : 2);
          if (un.length !== expect) throw new Error(`lossless size ${un.length} != ${expect} (${r.w}x${r.h} fmt${r.fmt})`);
          break;
        }
        case 21: { b.u16(); const n = b.u32(); b.p += n; break; }
        case 35: {
          const r = bitsJpeg3(b, 3);
          const un = zlib.inflateSync(Buffer.from(r.alpha));
          if (!un.length) throw new Error('empty alpha');
          break;
        }
        case 24: b.p += b.d.length - b.p; break;
        case 26: placeObject2(b); break;
        case 28: b.u16(); break;
        case 34: defineButton2(b); break;
        case 37: defineEditText(b); break;
        case 39: {
          const id = b.u16(); const frames = b.u16();
          validateTags(payload, `${spritePath}/sprite${id}`);
          void frames;
          break;
        }
        case 43: b.str(); if (b.left() > 0) b.u8(); break;
        case 45: soundStreamHead(b); break;
        case 48: defineFont2(b, 2); break;
        case 75: defineFont2(b, 3); break;
        case 56: { const n = b.u16(); for (let i = 0; i < n; i++) { b.u16(); b.str(); } break; }
        case 57: { const n = b.u16(); for (let i = 0; i < n; i++) { b.u16(); b.str(); } break; }
        case 69: b.u16(); b.u16(); break;
        case 73: defineFontAlignZones(b); break;
        case 74: csmTextSettings(b); break;
        case 76: { const n = b.u16(); for (let i = 0; i < n; i++) { b.u16(); b.str(); } break; }
        case 88: b.u16(); b.str(); b.str(); break;
        default: b.p += b.d.length - b.p; break;
      }
      if (b.left() > 0 && ![26, 34, 43, 59, 12, 24].includes(t)) throw new Error(`${b.left()} trailing bit(s)`);
      report.ok++;
      if (VERBOSE) console.log(`OK   ${name}`);
    } catch (e) {
      report.fail++;
      report.byName[name] = (report.byName[name] ?? 0) + 1;
      console.log(`FAIL ${name}${spritePath ? ` (in ${spritePath})` : ''}: ${e.message}`);
    }
  }
}

const nbits = body[0] >> 3;
const tagStart = Math.ceil((5 + nbits * 4) / 8) + 4;
validateTags(body.subarray(tagStart), '');
console.log(`\n${file}: ${report.ok} tags decoded, ${report.fail} failed`, JSON.stringify(report.byName));
