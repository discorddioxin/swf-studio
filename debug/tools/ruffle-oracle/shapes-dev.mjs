// Dev tool: strict DefineShape/2/3/4 decoder with DefineSprite recursion.
//   node shapes-dev.mjs <file.swf>
import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const raw = fs.readFileSync(file);
const body = raw[0] === 0x43 ? zlib.inflateSync(raw.subarray(8)) : raw.subarray(8);

class BR {
  constructor(d) { this.d = d; this.p = 0; this.bit = 0; }
  align() { if (this.bit) { this.bit = 0; this.p++; } }
  ub(n) {
    if (n === 0) return 0;
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (this.p >= this.d.length) throw new Error('eof');
      v = (v << 1) | ((this.d[this.p] >> (7 - this.bit)) & 1);
      if (++this.bit === 8) { this.bit = 0; this.p++; }
    }
    return v;
  }
  sb(n) { if (!n) return 0; const v = this.ub(n); const s = 1 << (n - 1); return (v & s) ? v - (1 << n) : v; }
  u8() { this.align(); if (this.p >= this.d.length) throw new Error('eof(u8)'); return this.d[this.p++]; }
  u16() { const a = this.u8(), b = this.u8(); return a | (b << 8); }
  pos() { return this.p * 8 + this.bit; }
  left() { return (this.d.length - this.p) * 8 - this.bit; }
}
const rect = (b) => { const n = b.ub(5); return [b.sb(n), b.sb(n), b.sb(n), b.sb(n)]; };
function matrix(b) {
  if (b.ub(1)) { const n = b.ub(5); b.sb(n); b.sb(n); }
  if (b.ub(1)) { const n = b.ub(5); b.sb(n); b.sb(n); }
  const n = b.ub(5); b.sb(n); b.sb(n); b.align();
}
const color = (b, a) => { b.u8(); b.u8(); b.u8(); if (a) b.u8(); };
function gradient(b, v) {
  const m = matrix(b);
  const spread = b.u8(), interp = b.u8();
  const n = b.u8();
  if (n > 15) throw new Error(`gradient record count ${n}`);
  const ratios = [];
  for (let i = 0; i < n; i++) { ratios.push(b.u8()); color(b, v >= 3); }
  return { spread, interp, n, ratios, m };
}
function fillStyle(b, v) {
  const t = b.u8();
  if (t === 0x00) { color(b, v >= 3); return { t }; }
  if (t === 0x10 || t === 0x12) return { t, g: gradient(b, v) };
  if (t === 0x13) { const g = gradient(b, v); b.u16(); return { t, g }; }
  if (t >= 0x40 && t <= 0x43) { const id = b.u16(); matrix(b); return { t, id }; }
  throw new Error(`invalid fill style 0x${t.toString(16)} at bit ${b.pos()}`);
}
function shapes(tag, v, label) {
  const b = new BR(tag);
  const id = b.u16();
  const bounds = rect(b);
  if (v >= 4) { rect(b); b.u8(); }
  const fillCount = b.u8();
  if (fillCount === 0xff) throw new Error('0xff fill count');
  const fills = [];
  for (let i = 0; i < fillCount; i++) fills.push(fillStyle(b, v));
  const lineCount = b.u8();
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    b.u16();
    if (v < 4) color(b, v >= 3);
    else { const f = b.u16(); if (((f >> 4) & 3) === 2) b.u16(); if ((f >> 3) & 1) fillStyle(b, v); else color(b, true); }
  }
  const nb = b.u8();
  let fillBits = nb >> 4, lineBits = nb & 0xf;
  let recs = 0;
  for (;;) {
    if (b.ub(1)) {
      const straight = b.ub(1);
      const numBits = b.ub(4) + 2;
      if (straight) { const aligned = !b.ub(1); const vert = aligned && b.ub(1); if (!aligned || !vert) b.sb(numBits); if (!aligned || vert) b.sb(numBits); }
      else { b.sb(numBits); b.sb(numBits); b.sb(numBits); b.sb(numBits); }
    } else {
      const f = b.ub(5);
      if (f === 0) break;
      if (f & 1) { const n = b.ub(5); b.sb(n); b.sb(n); }
      if (f & 2) b.ub(fillBits);
      if (f & 4) b.ub(fillBits);
      if (f & 8) b.ub(lineBits);
      if (f & 16) {
        const fc = b.u8(); for (let i = 0; i < fc; i++) fillStyle(b, v);
        const lc = b.u8(); for (let i = 0; i < lc; i++) { b.u16(); if (v < 4) color(b, v >= 3); else { const fl = b.u16(); if (((fl >> 4) & 3) === 2) b.u16(); if ((fl >> 3) & 1) fillStyle(b, v); else color(b, true); } }
        const nb2 = b.u8(); fillBits = nb2 >> 4; lineBits = nb2 & 0xf;
      }
    }
    recs++;
    if (b.left() < 0) throw new Error('records past end of tag');
  }
  return { id, v, fills: fills.length, lines: lines.length, recs, used: b.pos(), size: b.d.length * 8 };
}

const VERSIONS = { 2: 1, 22: 2, 32: 3, 83: 4 };
let ok = 0, fail = 0;
function walk(d, path) {
  let q = 0;
  while (q + 2 <= d.length) {
    const c = d[q] | (d[q + 1] << 8); const t = c >> 6; const long = (c & 0x3f) === 0x3f;
    const len = long ? (d[q + 2] | (d[q + 3] << 8) | (d[q + 4] << 16) | (d[q + 5] << 24)) : (c & 0x3f);
    const o = long ? q + 6 : q + 2;
    if (t === 0) return;
    if (o + len > d.length) { console.log(`FAIL tag${t} overruns stream at ${q} (${path})`); fail++; return; }
    const payload = d.subarray(o, o + len);
    if (VERSIONS[t]) {
      try { const r = shapes(payload, VERSIONS[t], path); ok++; process.env.VERBOSE && console.log(`OK tag${t} id=${r.id} v${r.v} fills=${r.fills} recs=${r.recs} ${r.used}/${r.size} ${path}`); }
      catch (e) { fail++; console.log(`FAIL tag${t} v${VERSIONS[t]}${path}: ${e.message}`); }
    } else if (t === 39) {
      const sid = payload[0] | (payload[1] << 8);
      walk(payload.subarray(4), `${path}/sprite${sid}`);
    }
    q = o + len;
  }
}
const nbits = body[0] >> 3;
walk(body.subarray(Math.ceil((5 + nbits * 4) / 8) + 4), '');
console.log(`${file}: ${ok} shapes ok, ${fail} failed`);
