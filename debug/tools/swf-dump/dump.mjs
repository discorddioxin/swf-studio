// AVM1 disassembler for the AVM1 bytecode embedded in a SWF's action tags.
//
//   node debug/tools/swf-dump/dump.mjs <file.swf> [tagFilter] [--grep text] [--tagtype 12|59]
//
// tagFilter matches the tag payload length (e.g. "13000") or "all".
// --grep keeps only tags whose payload contains the text.
//
// This exists because the FFDec exports in game-files/**/external are not
// available for every SWF (bassken_game4.21 has none), so the only way to read
// a game's logic is to disassemble its action tags directly.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const NAMES = {
  0x04: 'NextFrame', 0x05: 'PrevFrame', 0x06: 'Play', 0x07: 'Stop', 0x08: 'ToggleQuality', 0x09: 'StopSounds',
  0x0a: 'Add', 0x0b: 'Subtract', 0x0c: 'Multiply', 0x0d: 'Divide', 0x0e: 'Equals', 0x0f: 'Less', 0x10: 'And',
  0x11: 'Or', 0x12: 'Not', 0x13: 'StringEquals', 0x14: 'StringLength', 0x15: 'StringExtract', 0x17: 'Pop',
  0x18: 'ToInteger', 0x19: 'GetTime', 0x1c: 'GetVariable', 0x1d: 'SetVariable', 0x1e: 'SetTarget2', 0x1f: 'StringAdd',
  0x20: 'GetProperty', 0x21: 'SetProperty', 0x22: 'CloneSprite', 0x23: 'RemoveSprite', 0x24: 'Trace', 0x25: 'StartDrag',
  0x26: 'EndDrag', 0x27: 'StringLess', 0x28: 'Throw', 0x29: 'CastOp', 0x2a: 'ImplementsOp', 0x30: 'RandomNumber',
  0x31: 'MBStringLength', 0x32: 'CharToAscii', 0x33: 'AsciiToChar', 0x34: 'GetTime2', 0x35: 'MBStringExtract',
  0x36: 'MBCharToAscii', 0x37: 'MBAsciiToChar', 0x3a: 'Delete', 0x3b: 'Delete2', 0x3c: 'DefineLocal',
  0x3d: 'CallFunction', 0x3e: 'Return', 0x3f: 'Modulo', 0x40: 'NewObject', 0x41: 'DefineLocal2', 0x42: 'InitArray',
  0x43: 'InitObject', 0x44: 'TypeOf', 0x45: 'TargetPath', 0x46: 'Enumerate', 0x47: 'Add2', 0x48: 'Less2',
  0x49: 'Equals2', 0x4a: 'ToNumber', 0x4b: 'ToString', 0x4c: 'PushDuplicate', 0x4d: 'StackSwap',
  0x4e: 'GetMember', 0x4f: 'SetMember', 0x50: 'Increment', 0x51: 'Decrement', 0x52: 'CallMethod',
  0x53: 'NewMethod', 0x54: 'InstanceOf', 0x55: 'Enumerate2', 0x60: 'BitAnd', 0x61: 'BitOr', 0x62: 'BitXor',
  0x63: 'BitLShift', 0x64: 'BitRShift', 0x65: 'BitURShift', 0x66: 'StrictEquals', 0x67: 'Greater',
  0x68: 'StringGreater', 0x69: 'Extends', 0x81: 'GotoFrame', 0x83: 'GetUrl', 0x87: 'StoreRegister',
  0x88: 'ConstantPool', 0x8a: 'WaitForFrame', 0x8b: 'SetTarget', 0x8c: 'GotoLabel', 0x8d: 'WaitForFrame2',
  0x8e: 'DefineFunction2', 0x8f: 'Try', 0x94: 'With', 0x96: 'Push', 0x99: 'Jump', 0x9a: 'GetUrl2',
  0x9b: 'DefineFunction', 0x9d: 'If', 0x9e: 'Call', 0x9f: 'GotoFrame2',
};

const file = process.argv[2];
const filter = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'all';
const grep = process.argv.includes('--grep') ? process.argv[process.argv.indexOf('--grep') + 1] : null;
const wantType = process.argv.includes('--tagtype') ? Number(process.argv[process.argv.indexOf('--tagtype') + 1]) : null;

const raw = readFileSync(file);
const body = raw[0] === 0x43 ? inflateSync(raw.subarray(8)) : raw.subarray(8);
const tagStart = Math.ceil((5 + 4 * (body[0] >> 3)) / 8) + 4;

const tagList = (d, base) => {
  const out = [];
  let p = 0;
  while (p + 2 <= d.length) {
    const c = d[p] | (d[p + 1] << 8);
    const t = c >> 6;
    const long = (c & 0x3f) === 0x3f;
    const len = long ? (d[p + 2] | (d[p + 3] << 8) | (d[p + 4] << 16) | (d[p + 5] << 24)) : (c & 0x3f);
    const o = long ? p + 6 : p + 2;
    if (t === 0) break;
    out.push({ t, d: d.subarray(o, o + len), off: base + o });
    p = o + len;
  }
  return out;
};

const extractPlaceObject2ClipActions = (d, ctx) => {
  const out = [];
  if (d.length < 3) return out;
  const f = d[0];
  if (!(f & 0x80)) return out; // hasClipActions
  // Rather than bit-parsing matrix/cxform, find the CLIPACTIONS header (reserved u16=0, allEventFlags u32)
  // or scan from the end of the tag backwards/forwards. Even simpler: bit-skip matrix & cxform!
  let bp = 24; // after flags (8) + depth (16)
  if (f & 0x02) bp += 16; // characterId
  const readUB = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) {
      v = (v << 1) | ((d[bp >> 3] >> (7 - (bp & 7))) & 1);
      bp++;
    }
    return v;
  };
  if (f & 0x04) { // matrix
    if (readUB(1)) { const b = readUB(5); bp += b * 2; }
    if (readUB(1)) { const b = readUB(5); bp += b * 2; }
    const tb = readUB(5); bp += tb * 2;
    if (bp & 7) bp = (bp + 7) & ~7;
  }
  if (f & 0x08) { // cxformWithAlpha
    const hasAdd = readUB(1);
    const hasMult = readUB(1);
    const nbits = readUB(4);
    if (hasMult) bp += nbits * 4;
    if (hasAdd) bp += nbits * 4;
    if (bp & 7) bp = (bp + 7) & ~7;
  }
  let p = bp >> 3;
  if (f & 0x10) p += 2; // ratio
  if (f & 0x40) p += 2; // clipDepth precedes name in SWF PlaceObject2
  let name = '';
  if (f & 0x20) {
    let e = p;
    while (e < d.length && d[e] !== 0) e++;
    name = Buffer.from(d.subarray(p, e)).toString('latin1');
    p = e + 1;
  }
  p += 6; // reserved u16 + allEventFlags u32 (SWF6+)
  while (p + 8 <= d.length) {
    const flags = (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0;
    p += 4;
    if (flags === 0) break;
    const size = (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0;
    p += 4;
    const end = Math.min(d.length, p + size);
    if (flags & 0x20000) p += 1; // keyPress keyCode
    const code = d.subarray(p, end);
    out.push({ t: 26, d: code, ctx: `${ctx}/po2${name ? `[${name}]` : ''}_flags0x${flags.toString(16)}` });
    p = end;
  }
  return out;
};

const extractDefineButton2Actions = (d, ctx) => {
  const out = [];
  if (d.length < 5) return out;
  const bid = d[0] | (d[1] << 8);
  const actionOffset = d[3] | (d[4] << 8);
  if (!actionOffset || 3 + actionOffset >= d.length) return out;
  let p = 3 + actionOffset;
  let idx = 0;
  while (p + 4 <= d.length) {
    const condSize = d[p] | (d[p + 1] << 8);
    const condFlags = d[p + 2] | (d[p + 3] << 8);
    const nextP = condSize === 0 ? d.length : Math.min(d.length, p + condSize);
    const code = d.subarray(p + 4, nextP);
    out.push({ t: 34, d: code, ctx: `${ctx}/btn${bid}_cond${idx}_flags0x${condFlags.toString(16)}` });
    idx++;
    if (condSize === 0) break;
    p = nextP;
  }
  return out;
};

const all = [];
const walk = (start, end, ctx) => {
  for (const tag of tagList(body.subarray(start, end), start)) {
    if (tag.t === 12 || tag.t === 59) all.push({ ...tag, ctx });
    else if (tag.t === 26) all.push(...extractPlaceObject2ClipActions(tag.d, ctx));
    else if (tag.t === 34) all.push(...extractDefineButton2Actions(tag.d, ctx));
    else if (tag.t === 39) walk(tag.off + 4, tag.off + tag.d.length, `${ctx}/sprite${tag.d[0] | (tag.d[1] << 8)}`);
  }
};
walk(tagStart, body.length, 'root');

const wanted = all.filter((t) => (filter === 'all' || String(t.d.length) === filter)
  && (!wantType || t.t === wantType)
  && (!grep || Buffer.from(t.d).toString('latin1').includes(grep)));

const dumpCode = (code, indent = '', pool = []) => {
  let pendingBody = null;
  let pc = 0;
  while (pc < code.length) {
    const start = pc;
    const op = code[pc++];
    let len = 0;
    // `len` is the payload length (it excludes the opcode and the 2 length bytes)
    if (op >= 0x80) { len = code[pc] | (code[pc + 1] << 8); pc += 2; }
    const payload = code.subarray(pc, pc + len);
    pc += len;
    let extra = '';
    if (op === 0x88) {
      const n = payload[0] | (payload[1] << 8);
      pool.length = 0;
      let q = 2; // payload[0] = opcode, payload[1..2] = length, strings start at payload[3]
      for (let i = 0; i < n; i++) { let e = q; while (e < payload.length && payload[e] !== 0) e++; pool.push(Buffer.from(payload.subarray(q, e)).toString('latin1')); q = e + 1; }
      extra = `${n} strings`;
    } else if (op === 0x96) {
      const out = [];
      let q = 0;
      while (q < payload.length) {
        const kind = payload[q++];
        if (kind === 0) { let e = q; while (e < payload.length && payload[e] !== 0) e++; out.push(JSON.stringify(Buffer.from(payload.subarray(q, e)).toString('latin1'))); q = e + 1; }
        else if (kind === 1) { out.push(String(payload.readFloatLE(q))); q += 4; }
        else if (kind === 2) out.push('null');
        else if (kind === 3) out.push('undefined');
        else if (kind === 4) out.push(`reg${payload[q++]}`);
        else if (kind === 5) out.push(payload[q++] ? 'true' : 'false');
        else if (kind === 6) {
          const swapped = Buffer.alloc(8);
          payload.copy(swapped, 0, q + 4, q + 8);
          payload.copy(swapped, 4, q, q + 4);
          out.push(String(swapped.readDoubleLE(0)));
          q += 8;
        }
        else if (kind === 7) { out.push(`#${payload[q] | (payload[q + 1] << 8) | (payload[q + 2] << 16) | (payload[q + 3] << 24)}`); q += 4; }
        else if (kind === 8) { const i = payload[q++]; out.push(pool[i] !== undefined ? JSON.stringify(pool[i]) : 'pool?'); }
        else if (kind === 9) { const i = payload[q] | (payload[q + 1] << 8); out.push(pool[i] !== undefined ? JSON.stringify(pool[i]) : 'pool?'); q += 2; }
        else { out.push(`k${kind}?`); break; }
      }
      extra = out.join(' ');
    } else if (op === 0x99 || op === 0x9d) {
      extra = `-> ${pc + (((payload[0] | (payload[1] << 8)) << 16) >> 16)}`;  // pc is already the end of this instruction
    } else if (op === 0x3d) {
      let e = 0; while (e < payload.length && payload[e] !== 0) e++;
      extra = Buffer.from(payload.subarray(0, e)).toString('latin1');
    } else if (op === 0x8e || op === 0x9b) {
      // ActionDefineFunction2 payload order is: Name, NumParams, RegisterCount,
      // Flags (UI16), ParamList (Register + Name per param), CodeLength, Body.
      // ActionDefineFunction (0x9b) has no RegisterCount/Flags/param registers:
      // Name, NumParams, ParamList (Name only), CodeLength, Body.
      let e = 0; while (e < payload.length && payload[e] !== 0) e++;
      const name = Buffer.from(payload.subarray(0, e)).toString('latin1');
      const argc = payload[e + 1] | (payload[e + 2] << 8);
      let q = e + 3;
      let nRegs = 0; let flags = 0;
      if (op === 0x8e) {
        nRegs = payload[q] ?? 0; q += 1;
        flags = payload[q] | (payload[q + 1] << 8); q += 2;
      }
      const params = [];
      for (let i = 0; i < argc; i++) {
        let reg = 0;
        if (op === 0x8e) { reg = payload[q] ?? 0; q += 1; }
        let z = q; while (z < payload.length && payload[z] !== 0) z++;
        const pname = Buffer.from(payload.subarray(q, z)).toString('latin1');
        q = z + 1;
        params.push(op === 0x8e ? `reg${reg}=${pname}` : pname);
      }
      extra = `${name}(${params.join(', ')}) regs=${nRegs} flags=0x${flags.toString(16)}`;
      const bodyLen = payload[q] | (payload[q + 1] << 8);
      extra += ` body=${bodyLen}B`;
      pendingBody = payload.subarray(q + 2, q + 2 + bodyLen);
    } else if (op === 0x52 || op === 0x40) {
      const argc = payload[0] | (payload[1] << 8);
      extra = `argc=${argc}`;
    } else if (op === 0x87) extra = `reg${payload[0]}`;
    console.log(`${indent}${String(start).padStart(5)} ${(NAMES[op] ?? `op${op.toString(16)}`).padEnd(14)} ${extra}`);
    if (pendingBody && pendingBody.length) { dumpCode(pendingBody, `${indent}    `, pool); pendingBody = null; }
  }
};

for (const tag of wanted) {
  let code = tag.d;
  if (tag.t === 59 && code.length > 4 && NAMES[code[0]] === undefined && NAMES[code[2]] !== undefined) code = code.subarray(2);
  const label = tag.t === 12 ? 'DoAction' : tag.t === 59 ? 'DoInitAction' : 'ClipAction';
  console.log(`===== ${label} ${tag.d.length}B ${tag.ctx}${tag.t === 59 ? ` spriteId=${tag.d[0] | (tag.d[1] << 8)}` : ''}`);
  dumpCode(code);
}
