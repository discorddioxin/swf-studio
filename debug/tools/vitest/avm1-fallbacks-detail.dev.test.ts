// Deep dump of the failing AVM1 blocks: full action outline with Push payloads,
// function headers, and the bytes around the failure point.
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';
import { decodeAVM1Actions } from '@/../transpiler/as2/avm1';
import { SAMPLE_MAIN, sampleSwfPath } from '@/adapters/gaiaFishing/sample';

const OP: Record<number, string> = {
  0x04: 'NextFrame', 0x05: 'PrevFrame', 0x06: 'Play', 0x07: 'Stop', 0x09: 'StopSounds', 0x0a: 'Add', 0x0b: 'Subtract',
  0x0c: 'Multiply', 0x0d: 'Divide', 0x0e: 'Equals', 0x0f: 'Less', 0x10: 'And', 0x11: 'Or', 0x12: 'Not', 0x13: 'StringEquals',
  0x14: 'StringLength', 0x15: 'StringExtract', 0x17: 'Pop', 0x18: 'ToInteger', 0x1c: 'GetVariable', 0x1d: 'SetVariable',
  0x20: 'SetTarget2', 0x21: 'StringAdd', 0x22: 'GetProperty', 0x23: 'SetProperty', 0x24: 'CloneSprite', 0x25: 'RemoveSprite',
  0x26: 'Trace', 0x27: 'StartDrag', 0x28: 'EndDrag', 0x29: 'StringLess', 0x2a: 'Throw', 0x30: 'RandomNumber',
  0x31: 'MBStringLength', 0x34: 'GetTime', 0x35: 'MBStringExtract', 0x36: 'MBCharToAscii', 0x37: 'MBAsciiToChar',
  0x3a: 'Delete', 0x3b: 'Delete2', 0x3c: 'DefineLocal', 0x3d: 'CallFunction', 0x3e: 'Return', 0x3f: 'Modulo',
  0x40: 'NewObject', 0x41: 'DefineLocal2', 0x42: 'InitArray', 0x43: 'InitObject', 0x44: 'TypeOf', 0x45: 'TargetPath',
  0x46: 'Enumerate', 0x47: 'Add2', 0x48: 'Less2', 0x49: 'Equals2', 0x4a: 'ToNumber', 0x4b: 'ToString', 0x4c: 'Duplicate',
  0x4d: 'Swap', 0x4e: 'GetMember', 0x4f: 'SetMember', 0x50: 'Increment', 0x51: 'Decrement', 0x52: 'CallMethod',
  0x53: 'NewMethod', 0x54: 'InstanceOf', 0x55: 'Enumerate2', 0x60: 'BitAnd', 0x61: 'BitOr', 0x62: 'BitXor',
  0x63: 'BitLShift', 0x64: 'BitRShift', 0x65: 'BitURShift', 0x66: 'StrictEquals', 0x67: 'Greater', 0x68: 'StringGreater',
  0x69: 'Extends', 0x81: 'GotoFrame', 0x83: 'GetURL', 0x87: 'StoreRegister', 0x88: 'ConstantPool', 0x8a: 'WaitForFrame',
  0x8b: 'SetTarget', 0x8c: 'GoToLabel', 0x8d: 'WaitForFrame2', 0x8e: 'DefineFunction2', 0x94: 'With', 0x96: 'Push',
  0x99: 'Jump', 0x9a: 'GetURL2', 0x9b: 'DefineFunction', 0x9d: 'If', 0x9e: 'Call', 0x9f: 'GotoFrame2',
};
const bin = (name: string, v: number) => `${name} ${v} (0x${v.toString(16)})`;

/** Render a Push payload as text. */
function pushPayload(data: Uint8Array, pool: string[]): string {
  const parts: string[] = [];
  let at = 0;
  while (at < data.length) {
    const kind = data[at++];
    if (kind === 0) { let end = at; while (end < data.length && data[end] !== 0) end++; parts.push(JSON.stringify(new TextDecoder().decode(data.subarray(at, end)))); at = end + 1; }
    else if (kind === 1) { parts.push(String(new DataView(data.buffer, data.byteOffset + at, 4).getFloat32(0, true))); at += 4; }
    else if (kind === 2) parts.push('null');
    else if (kind === 3) parts.push('undefined');
    else if (kind === 4) parts.push(`reg${data[at++]}`);
    else if (kind === 5) parts.push(data[at++] !== 0 ? 'true' : 'false');
    else if (kind === 6) { const b = data.slice(at, at + 8); b.reverse(); parts.push(String(new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, true))); at += 8; }
    else if (kind === 7) { parts.push(String(new DataView(data.buffer, data.byteOffset + at, 4).getInt32(0, true))); at += 4; }
    else if (kind === 8) parts.push(`pool[${data[at++]}]${pool[data[at - 1]] !== undefined ? `=${JSON.stringify(pool[data[at - 1]])}` : ''}`);
    else if (kind === 9) { const i = data[at] | (data[at + 1] << 8); at += 2; parts.push(`pool[${i}]=${JSON.stringify(pool[i])}`); }
    else { parts.push(`?kind${kind}`); break; }
  }
  return parts.join(' ');
}

interface Rec { offset: number; op: number; size: number; data: Uint8Array; end: number; fn?: { name: string; flags: number; registers: number; params: { name: string; register: number }[]; body: Rec[] } }

function records(bytes: Uint8Array, base = 0): Rec[] {
  const out: Rec[] = [];
  let at = 0;
  const pool: string[] = [];
  while (at < bytes.length) {
    const offset = base + at;
    const op = bytes[at++];
    let size = 0;
    if (op >= 0x80) { size = bytes[at] | (bytes[at + 1] << 8); at += 2; }
    const data = bytes.subarray(at, at + size);
    at += size;
    const rec: Rec = { offset, op, size, data, end: base + at };
    if (op === 0x88) {
      pool.length = 0;
      let p = 0; const count = data[p] | (data[p + 1] << 8); p += 2;
      for (let i = 0; i < count; i++) { let e = p; while (data[e] !== 0) e++; pool.push(new TextDecoder().decode(data.subarray(p, e))); p = e + 1; }
    }
    if (op === 0x96) rec.data = data.slice(); // keep for payload rendering
    (rec as unknown as { pool: string[] }).pool = [...pool];
    if (op === 0x8e || op === 0x9b) {
      let p = 0;
      let e = p; while (data[e] !== 0) e++;
      const name = new TextDecoder().decode(data.subarray(p, e)); p = e + 1;
      const count = data[p] | (data[p + 1] << 8); p += 2;
      const registers = op === 0x8e ? data[p++] : 4;
      const flags = op === 0x8e ? (data[p] | (data[p + 1] << 8)) : 0; if (op === 0x8e) p += 2;
      const params: { name: string; register: number }[] = [];
      for (let i = 0; i < count; i++) {
        const register = op === 0x8e ? data[p++] : 0;
        let s = p; while (data[s] !== 0) s++;
        params.push({ register, name: new TextDecoder().decode(data.subarray(p, s)) }); p = s + 1;
      }
      const length = data[p] | (data[p + 1] << 8); p += 2;
      rec.fn = { name, flags, registers, params, body: records(data.subarray(p, p + length), offset + 3 + p) };
    }
    out.push(rec);
    if (op === 0) break;
  }
  return out;
}

function outline(recs: Rec[], indent = ''): string[] {
  return recs.flatMap((r) => {
    const pool = (r as unknown as { pool?: string[] }).pool ?? [];
    const detail = r.op === 0x96 ? ` ${pushPayload(r.data, pool)}`
      : r.op === 0x8e || r.op === 0x9b ? ` name=${JSON.stringify(r.fn!.name)} flags=${bin('', r.fn!.flags)} regs=${r.fn!.registers} params=[${r.fn!.params.map((p) => `${p.name}@${p.register}`).join(', ')}]`
        : r.op === 0x81 ? ` frame=${r.data[0] | (r.data[1] << 8)}`
          : r.op === 0x87 ? ` reg=${r.data[0]}`
            : r.op === 0x99 || r.op === 0x9d ? ` target=${r.end + ((r.data[0] | (r.data[1] << 8)) & 0x8000 ? (r.data[0] | (r.data[1] << 8)) - 0x10000 : (r.data[0] | (r.data[1] << 8)))}`
              : '';
    const head = [`${indent}${r.offset}: ${OP[r.op] ?? `0x${r.op.toString(16)}`}${detail}`];
    if (r.fn) head.push(...outline(r.fn.body, `${indent}    `));
    return head;
  });
}

it('dumps failing blocks', async () => {
  (globalThis as any).__AVM1_DBG = process.env.AVM1_DBG ? true : false;
  const swf = process.env.SWF ?? SAMPLE_MAIN;
  const wantOffset = process.env.AT ? Number(process.env.AT) : null;
  const buf = readFileSync(sampleSwfPath(swf));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { files } = await parseSwfBinary(ab, `${swf}.swf`);
  const srcs: SourceInput[] = files.filter((f) => f.path.endsWith('.as'))
    .map((f) => ({ path: f.path, text: new TextDecoder().decode(f.bytes), tagOrder: (f as any).tagOrder, targetSpriteId: (f as any).targetSpriteId }));
  const build = buildAS2Program(srcs);
  const seen = new Set<string>();
  for (const [path, code] of build.files) {
    for (const m of code.matchAll(/\$rt\.avm1Actions\(([^,]+),\s*"([A-Za-z0-9+/=_-]+)"\)/g)) {
      const b64 = m[2];
      const decoded = decodeAVM1Actions(b64);
      if (decoded.code !== null && !process.env.NEEDLE) continue;
      if (process.env.MOD && !path.includes(process.env.MOD)) continue;
      const key = `${path}#${b64.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const needle = process.env.NEEDLE;
      if (needle) {
        const bytes0 = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
        if (!new TextDecoder('latin1').decode(bytes0).includes(needle)) continue;
      }
      const bytes = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      const recs = records(bytes);
      const at = process.env.NEEDLE ? -1 : (decoded.diagnostics[0]?.offset ?? 0);
      if (wantOffset != null && at !== wantOffset) continue;
      if (process.env.MSG && !(decoded.diagnostics[0]?.message.includes(process.env.MSG))) continue;
      console.error(`\n===== ${path} — ${decoded.code !== null ? 'decoded' : decoded.diagnostics.map((d) => `byte ${d.offset}: ${d.message}`).join('; ')} (${bytes.length} bytes)`);
      const lines = outline(recs);
      const hitLine = process.env.NEEDLE ? lines.findIndex((l) => l.includes(process.env.NEEDLE!)) : -1;
      const anchor = process.env.NEEDLE ? hitLine : lines.findIndex((l) => Number(l.trim().match(/^(\d+):/)?.[1]) === at);
      const before = Number(process.env.BEFORE ?? 12), after = Number(process.env.AFTER ?? 60);
      const near = lines.slice(Math.max(0, anchor - before), anchor + after);
      console.error(near.join('\n'));
    }
  }
}, 300000);
