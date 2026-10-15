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
  ub(n) { let v = 0; for (let i = 0; i < n; i++) { v = (v << 1) | ((this.d[this.p] >> (7 - this.bit)) & 1); if (++this.bit === 8) { this.bit = 0; this.p++; } } return v; }
  sb(n) { const v = this.ub(n); const s = 1 << (n - 1); return (v & s) ? v - (1 << n) : v; }
  u8() { this.align(); return this.d[this.p++]; }
  u16() { return this.u8() | (this.u8() << 8); }
  str() { this.align(); let s = ''; while (this.d[this.p] !== 0) s += String.fromCharCode(this.d[this.p++]); this.p++; return s; }
}
for (const tag of tags.filter((x) => x.t === 37)) {
  const id = tag.d[0] | (tag.d[1] << 8);
  if (wantId && String(id) !== wantId) continue;
  const b = new BR(tag.d);
  const cid = b.u16();
  const n = b.ub(5); for (let i = 0; i < 4; i++) b.sb(n); b.align();
  const flags = b.u16();
  const hasFont = flags & 1;
  let fontId = null;
  if (hasFont) fontId = b.u16();
  console.log(`tag37 len=${tag.d.length} characterID=${cid} flags=0x${flags.toString(16)} hasFont=${!!hasFont} fontId=${fontId} bitAfter=${b.p}`);
}
