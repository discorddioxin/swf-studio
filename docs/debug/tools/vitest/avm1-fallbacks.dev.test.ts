// Diagnose every AVM1 interpreter fallback: which script, which bytes, and
// what the decoder was doing when it gave up. Run with `npx vitest run
// docs/debug/tools/vitest/avm1-fallbacks.dev.test.ts`.
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';
import { decodeAVM1Actions } from '@/../transcom/transpiler/as2/avm1';
import { SAMPLE_SWF_NAMES, sampleSwfPath } from '@/adapters/gaiaFishing/sample';

const OP: Record<number, string> = {
  0x04: 'NextFrame', 0x05: 'PrevFrame', 0x06: 'Play', 0x07: 'Stop', 0x09: 'StopSounds', 0x0a: 'Add', 0x0b: 'Subtract',
  0x0c: 'Multiply', 0x0d: 'Divide', 0x0e: 'Equals', 0x0f: 'Less', 0x10: 'And', 0x11: 'Or', 0x12: 'Not', 0x13: 'StringEquals',
  0x14: 'StringLength', 0x15: 'StringExtract', 0x17: 'Pop', 0x18: 'ToInteger', 0x1c: 'GetVariable', 0x1d: 'SetVariable',
  0x20: 'SetTarget2', 0x21: 'StringAdd', 0x22: 'GetProperty', 0x23: 'SetProperty', 0x24: 'CloneSprite', 0x25: 'RemoveSprite',
  0x26: 'Trace', 0x27: 'StartDrag', 0x28: 'EndDrag', 0x29: 'StringLess', 0x2a: 'Throw', 0x2b: 'CastOp', 0x2c: 'ImplementsOp',
  0x30: 'RandomNumber', 0x31: 'MBStringLength', 0x32: 'CharToAscii', 0x33: 'AsciiToChar', 0x34: 'GetTime', 0x35: 'MBStringExtract',
  0x36: 'MBCharToAscii', 0x37: 'MBAsciiToChar', 0x3a: 'Delete', 0x3b: 'Delete2', 0x3c: 'DefineLocal', 0x3d: 'CallFunction',
  0x3e: 'Return', 0x3f: 'Modulo', 0x40: 'NewObject', 0x41: 'DefineLocal2', 0x42: 'InitArray', 0x43: 'InitObject',
  0x44: 'TypeOf', 0x45: 'TargetPath', 0x46: 'Enumerate', 0x47: 'Add2', 0x48: 'Less2', 0x49: 'Equals2', 0x4a: 'ToNumber',
  0x4b: 'ToString', 0x4c: 'Duplicate', 0x4d: 'Swap', 0x4e: 'GetMember', 0x4f: 'SetMember', 0x50: 'Increment', 0x51: 'Decrement',
  0x52: 'CallMethod', 0x53: 'NewMethod', 0x54: 'InstanceOf', 0x55: 'Enumerate2', 0x60: 'BitAnd', 0x61: 'BitOr', 0x62: 'BitXor',
  0x63: 'BitLShift', 0x64: 'BitRShift', 0x65: 'BitURShift', 0x66: 'StrictEquals', 0x67: 'Greater', 0x68: 'StringGreater',
  0x69: 'Extends', 0x81: 'GotoFrame', 0x83: 'GetURL', 0x87: 'StoreRegister', 0x88: 'ConstantPool', 0x8a: 'WaitForFrame',
  0x8b: 'SetTarget', 0x8c: 'GoToLabel', 0x8d: 'WaitForFrame2', 0x8e: 'DefineFunction2', 0x94: 'With', 0x96: 'Push',
  0x99: 'Jump', 0x9a: 'GetURL2', 0x9b: 'DefineFunction', 0x9d: 'If', 0x9e: 'Call', 0x9f: 'GotoFrame2',
};

/** Decode action records just far enough to name each one (independent of the decoder under test). */
function outline(bytes: Uint8Array) {
  const out: { offset: number; op: number; name: string; size: number }[] = [];
  let at = 0;
  while (at < bytes.length) {
    const offset = at;
    const op = bytes[at++];
    let size = 0;
    if (op >= 0x80) { size = bytes[at] | (bytes[at + 1] << 8); at += 2; }
    at += size;
    out.push({ offset, op, name: OP[op] ?? `0x${op.toString(16).padStart(2, '0')}`, size });
    if (op === 0) break;
  }
  return out;
}

it('lists every AVM1 fallback and its opcode context', async () => {
  const names = SAMPLE_SWF_NAMES.map((n) => `${n}.swf`).filter((f) => f.endsWith('.swf'));
  for (const swf of names) {
    const buf = readFileSync(sampleSwfPath(swf.replace(/\.swf$/i, '')));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { files } = await parseSwfBinary(ab, swf);
    const srcs: SourceInput[] = files.filter((f) => f.path.endsWith('.as'))
      .map((f) => ({
        path: f.path,
        text: new TextDecoder().decode(f.bytes),
        tagOrder: (f as any).tagOrder,
        targetSpriteId: (f as any).targetSpriteId,
      }));
    const build = buildAS2Program(srcs);
    let count = 0;
    let total = 0;
    for (const [, code] of build.files) total += [...code.matchAll(/\$rt\.avm1Actions\(/g)].length;
    if (total) console.error(`${swf}: ${total} avm1Actions call(s) in ${build.files.size} module(s)`);
    for (const [path, code] of build.files) {
      for (const m of code.matchAll(/\$rt\.avm1Actions\(([^,]+),\s*"([A-Za-z0-9+/=_-]+)"\)/g)) {
        const b64 = m[2];
        const decoded = decodeAVM1Actions(b64);
        if (decoded.code !== null) continue;
        count++;
        const bytes = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
        const ops = outline(bytes);
        const at = decoded.diagnostics[0]?.offset ?? 0;
        const around = ops.filter((o) => o.offset <= at && o.offset >= Math.max(0, at - 90));
        console.error(`\n=== ${swf} :: ${path}`);
        console.error(`    ${b64.length} chars / ${bytes.length} bytes · ${decoded.diagnostics.map((d) => `byte ${d.offset}: ${d.message}`).join('; ')}`);
        console.error(`    ops near failure: ${around.map((o) => `${o.offset}:${o.name}(${o.size})`).join(' ')}`);
        const failing = ops.find((o) => o.offset <= at && o.offset + o.size + 1 > at);
        if (failing) console.error(`    first failing action: ${failing.name} at ${failing.offset} size ${failing.size}`);
        const next = ops.filter((o) => o.offset >= at).slice(0, 6);
        console.error(`    from failure: ${next.map((o) => `${o.offset}:${o.name}`).join(' ')}`);
      }
    }
    if (count) console.error(`    (${count} fallback block(s) in ${swf})\n`);
  }
}, 240000);
