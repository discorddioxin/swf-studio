import fs from 'node:fs';
import zlib from 'node:zlib';
const [name, wantId] = process.argv.slice(2);
const raw = fs.readFileSync(`game-files/fish-full/swfs/${name}.swf`);
const body = raw[0] === 0x43 ? zlib.inflateSync(raw.subarray(8)) : raw.subarray(8);
let p = Math.ceil((5 + (body[0] >> 3) * 4) / 8) + 4;
const tags = [];
const walk = (d) => {
  let q = 0;
  while (q + 2 <= d.length) {
    const c = d[q] | (d[q + 1] << 8); const t = c >> 6; const long = (c & 0x3f) === 0x3f;
    const len = long ? (d[q + 2] | (d[q + 3] << 8) | (d[q + 4] << 16) | (d[q + 5] << 24)) : (c & 0x3f);
    const o = long ? q + 6 : q + 2;
    if (t === 0) return;
    tags.push({ t, d: d.subarray(o, o + len) });
    if (t === 39) walk(d.subarray(o + 4, o + len));
    q = o + len;
  }
};
walk(body.subarray(p));
class BR {
  constructor(d) { this.d = d; this.p = 0; this.bit = 0; }
  align() { if (this.bit) { this.bit = 0; this.p++; } }
  ub(n) { let v = 0; for (let i = 0; i < n; i++) { if (this.p >= this.d.length) throw new Error('eof'); v = (v << 1) | ((this.d[this.p] >> (7 - this.bit)) & 1); if (++this.bit === 8) { this.bit = 0; this.p++; } } return v; }
  sb(n) { if (!n) return 0; const v = this.ub(n); const s = 1 << (n - 1); return (v & s) ? v - (1 << n) : v; }
  u8() { this.align(); if (this.p >= this.d.length) throw new Error('eof(u8)'); return this.d[this.p++]; }
  u16() { const a = this.u8(), b = this.u8(); return a | (b << 8); }
  i16() { const v = this.u16(); return v >= 0x8000 ? v - 0x10000 : v; }
  left() { return (this.d.length - this.p) * 8 - this.bit; }
}
for (const tag of tags.filter((x) => x.t === 11 || x.t === 33)) {
  const id = tag.d[0] | (tag.d[1] << 8);
  if (wantId && String(id) !== wantId) continue;
  const b = new BR(tag.d);
  try {
    b.u16();
    const n = b.ub(5); for (let i = 0; i < 4; i++) b.sb(n); b.align();
    if (b.ub(1)) { const m = b.ub(5); b.sb(m); b.sb(m); }
    if (b.ub(1)) { const m = b.ub(5); b.sb(m); b.sb(m); }
    const tn = b.ub(5); b.sb(tn); b.sb(tn); b.align();
    const gb = b.u8(), ab = b.u8();
    const recs = [];
    for (;;) {
      const flags = b.u8();
      if (flags === 0) break;
      const r = { flags: '0x' + flags.toString(16) };
      if (flags & 8) r.fontId = b.u16();
      if (flags & 4) { r.rgb = [b.u8(), b.u8(), b.u8()]; if (tag.t === 33) r.a = b.u8(); }
      if (flags & 1) r.x = b.i16();
      if (flags & 2) r.y = b.i16();
      if (flags & 8) r.height = b.u16();
      const cnt = b.u8();
      r.glyphs = cnt;
      for (let i = 0; i < cnt; i++) { b.ub(gb); b.sb(ab); }
      recs.push(r);
    }
    console.log(`tag${tag.t} id=${id} payload=${tag.d.length}B glyphBits=${gb} advanceBits=${ab} recs=${recs.length} left=${b.left()} ${JSON.stringify(recs.slice(0, 2))}`);
  } catch (e) {
    console.log(`tag${tag.t} id=${id} payload=${tag.d.length}B DECODE FAIL: ${e.message}`);
  }
}
