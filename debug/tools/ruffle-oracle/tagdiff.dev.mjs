// Dev tool: compare a DefineButton2 / DefineEditText written by xml2swf with
// the FFDec XML it came from, field by field.
//
//   node tagdiff.dev.mjs <name> <button|edittext> <id>
import fs from 'node:fs';
import zlib from 'node:zlib';

const [name, kind, idArg] = process.argv.slice(2);
const id = Number(idArg);
const swf = fs.readFileSync(`game-files/fish-full/swfs/${name}.swf`);
const body = swf[0] === 0x43 ? zlib.inflateSync(swf.subarray(8)) : swf.subarray(8);
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
  i16() { const v = this.u16(); return v >= 0x8000 ? v - 0x10000 : v; }
  left() { return (this.d.length - this.p) * 8 - this.bit; }
}
const readMatrix = (b) => {
  const m = {};
  if (b.ub(1)) { const n = b.ub(5); m.scaleX = b.sb(n); m.scaleY = b.sb(n); }
  if (b.ub(1)) { const n = b.ub(5); m.rot0 = b.sb(n); m.rot1 = b.sb(n); }
  const n = b.ub(5); m.tx = b.sb(n); m.ty = b.sb(n); b.align();
  return m;
};
const readCxform = (b, alpha) => {
  const hasAdd = b.ub(1), hasMult = b.ub(1); const n = b.ub(4);
  const out = { hasAdd, hasMult, n };
  if (hasMult) { out.rm = b.sb(n); out.gm = b.sb(n); out.bm = b.sb(n); if (alpha) out.am = b.sb(n); }
  if (hasAdd) { out.ra = b.sb(n); out.ga = b.sb(n); out.ba = b.sb(n); if (alpha) out.aa = b.sb(n); }
  return out;
};

if (kind === 'button') {
  const tag = tags.find((x) => x.t === 34 && (x.d[0] | (x.d[1] << 8)) === id);
  if (!tag) { console.log('no such button tag'); process.exit(1); }
  const b = new BR(tag.d);
  // Ruffle: id u16, flags u8 (bit0 = trackAsMenu), actionOffset u16.
  const buttonId = b.u16(); const flags = b.u8(); const track = flags & 1;
  const actOff = b.u16();
  console.log(`payload=${tag.d.length} buttonId=${buttonId} reserved=${flags >> 1} trackAsMenu=${track} actionOffset=${actOff}`);
  const recs = [];
  for (;;) {
    const recFlags = b.u8();
    if (recFlags === 0) break;
    const r = { flags: '0x' + recFlags.toString(16) };
    r.charId = b.u16(); r.depth = b.u16();
    r.matrix = readMatrix(b);
    r.cx = readCxform(b, true);
    if (recFlags & 0x10) { const n = b.u8(); r.filters = n; for (let i = 0; i < n; i++) { const ft = b.u8(); r[`filter${i}`] = ft; if (ft === 0 || ft === 2 || ft === 3 || ft === 4 || ft === 7) { for (let k = 0; k < 4; k++) b.u8(); } if (ft === 1) { for (let k = 0; k < 4; k++) b.u8(); b.u8(); } if (ft === 5) { b.u8(); b.u8(); b.u8(); b.u8(); } } }
    if (recFlags & 0x20) r.blend = b.u8();
    recs.push(r);
  }
  console.log('records:', JSON.stringify(recs, null, 1));
  console.log('byte pos after records:', b.p, 'actions start (expected at ' + (2 + actOff) + ')');
  while (b.left() > 0) {
    const len = b.u16(); const cond = b.u16();
    console.log(`  action len=${len} cond=0x${cond.toString(16)} left=${b.left()}`);
    if (len === 0) break;
    if (len < 4) { console.log('  *** length too short, decoding stops'); break; }
    b.p += len - 4;
  }
}

if (kind === 'edittext') {
  const tag = tags.find((x) => x.t === 37 && (x.d[0] | (x.d[1] << 8)) === id);
  if (!tag) { console.log('no such edittext tag'); process.exit(1); }
  const b = new BR(tag.d);
  const charId = b.u16();
  const n = b.ub(5); const rect = [b.sb(n), b.sb(n), b.sb(n), b.sb(n)]; b.align();
  const flags = b.u16();
  console.log(`charId=${charId} rect=${rect} flags=0x${flags.toString(16)} payload=${tag.d.length}`);
  const has = (bit) => (flags >> bit) & 1;
  if (has(0)) console.log('  fontId', b.u16());
  if (has(15)) console.log('  fontClass', JSON.stringify(readStr(b)));
  if (has(0) || has(15)) console.log('  fontHeight', b.u16());
  if (has(2)) console.log('  color', [b.u8(), b.u8(), b.u8(), b.u8()]);
  if (has(1)) console.log('  maxLength', b.u16());
  if (has(13)) console.log('  layout', { align: b.u8(), left: b.u16(), right: b.u16(), indent: b.i16(), leading: b.i16() });
  console.log('  variableName', JSON.stringify(readStr(b)));
  if (has(7)) console.log('  initialText', JSON.stringify(readStr(b)));
  console.log('  left', b.left());
}
function readStr(b) { let s = ''; b.align(); while (b.d[b.p] !== 0) s += String.fromCharCode(b.d[b.p++]); b.p++; return s; }
