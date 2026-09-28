// ---------------------------------------------------------------------------
// Pure, framework-free ActionScript (SWF p-code) decompiler.
//
// This module has NO dependencies on React or the DOM, so it can be changed and
// unit-tested in isolation. It decodes raw SWF ActionScript bytecode (the hex
// `actionBytes` from a DoAction/DoInitAction tag) into a readable disassembly.
// ---------------------------------------------------------------------------

const OPCODES: Record<number, string> = {
  0x00: 'End', 0x01: 'Add', 0x02: 'Subtract', 0x03: 'Multiply', 0x04: 'Divide',
  0x05: 'Equal', 0x06: 'Less', 0x07: 'Greater', 0x08: 'And', 0x09: 'Or',
  0x0a: 'Add', 0x0b: 'Not', 0x0c: 'Modulo', 0x0d: 'StringEquals',
  0x0e: 'StringLess', 0x0f: 'StringGreater', 0x10: 'StringAdd',
  0x11: 'StringGreaterEqual', 0x12: 'StringLessEqual', 0x13: 'StringAddEC',
  0x14: 'DefineFunction', 0x15: 'Return', 0x16: 'Break', 0x17: 'Pop',
  0x18: 'Duplicate', 0x19: 'ClearStack', 0x1a: 'Reset', 0x1b: 'Swap',
  0x1c: 'GetVariable', 0x1d: 'SetVariable', 0x1e: 'GetMember', 0x1f: 'SetMember',
  0x20: 'GetProperty', 0x21: 'SetProperty', 0x22: 'GetAttribute', 0x23: 'SetAttribute',
  0x24: 'GetProperty2', 0x25: 'SetProperty2', 0x26: 'Trace', 0x27: 'StartDrag',
  0x28: 'DropTarget', 0x29: 'Toplevel', 0x2a: 'SetTarget', 0x2b: 'Wait',
  0x2c: 'End', 0x2d: 'Wait2', 0x2e: 'End', 0x2f: 'NextFrame', 0x30: 'PrevFrame',
  0x31: 'Goto', 0x32: 'With', 0x33: 'Chr', 0x34: 'Random', 0x35: 'Sqrt',
  0x36: 'Abs', 0x37: 'Concatenate', 0x38: 'Sin', 0x39: 'Cos', 0x3a: 'Tan',
  0x3b: 'AttachMovie', 0x3c: 'DetachMovie', 0x3d: 'Add', 0x3e: 'Subtract',
  0x3f: 'Multiply', 0x40: 'Divide', 0x41: 'DefineFunction', 0x42: 'Delete',
  0x43: 'DefineFunction2', 0x44: 'End', 0x45: 'DefineFunction2', 0x46: 'DefineFunction2',
  0x47: 'Add', 0x50: 'NextFrame', 0x51: 'PrevFrame', 0x52: 'CallMethod',
  0x53: 'Return', 0x54: 'CallFrame', 0x55: 'ToggleQuality', 0x56: 'ToggleHighQuality',
  0x57: 'ToggleQualityOld', 0x58: 'WaitForFrame', 0x5a: 'GetProperty', 0x5b: 'SetProperty',
  0x5c: 'CallMethod', 0x5d: 'Return', 0x5e: 'CallFrame', 0x5f: 'End',
  0x60: 'BitAnd', 0x61: 'BitOr', 0x62: 'BitXor', 0x63: 'ShiftLeft', 0x64: 'ShiftRight',
  0x65: 'ShiftRightUnsigned', 0x66: 'DefineLocal2', 0x70: 'DefineLocal',
  0x71: 'DefineLocal2', 0x72: 'DefineLocal2', 0x73: 'DefineLocal', 0x74: 'Delete2',
  0x75: 'DefineLocal2', 0x76: 'DefineLocal2', 0x77: 'DefineLocal2', 0x78: 'DefineLocal2',
  0x79: 'DefineLocal2', 0x7a: 'DefineLocal2', 0x7b: 'DefineLocal2', 0x7c: 'DefineLocal2',
  0x7d: 'DefineLocal2', 0x7e: 'DefineLocal2', 0x80: 'FindDefinition', 0x81: 'Evaluate',
  0x82: 'If', 0x83: 'Goto', 0x84: 'With', 0x85: 'End', 0x86: 'End', 0x87: 'NextFrame',
  0x88: 'PrevFrame', 0x89: 'Goto', 0x8a: 'Wait', 0x8b: 'Wait2', 0x8c: 'DefineFunction',
  0x8d: 'If', 0x8e: 'Goto', 0x8f: 'With', 0x90: 'End', 0x91: 'NextFrame', 0x92: 'PrevFrame',
  0x93: 'ToggleQuality', 0x94: 'ToggleHighQuality', 0x95: 'DefineLocal', 0x96: 'Push',
  0x97: 'NextFrame', 0x98: 'PrevFrame', 0x99: 'BranchIfTrue', 0x9a: 'Goto', 0x9b: 'With',
  0x9c: 'End', 0x9d: 'CallFrame', 0x9e: 'CallFunction', 0x9f: 'CallMethod', 0xa0: 'Return',
  0xa1: 'End', 0xa2: 'NextFrame', 0xa3: 'PrevFrame', 0xa4: 'ToggleQuality',
  0xa5: 'ToggleHighQuality', 0xa6: 'DefineLocal', 0xa7: 'Push', 0xa8: 'DefineFunction',
};

function pushPayload(parts: number[]): string {
  if (!parts.length) return '';
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const kind = parts[i];
    i++;
    if (kind === 0) {
      let s = '';
      while (i < parts.length && parts[i] !== 0) {
        s += String.fromCharCode(parts[i]);
        i++;
      }
      i++;
      out.push(JSON.stringify(s));
    } else if (kind === 1) {
      const v = (parts[i] ?? 0) | ((parts[i + 1] ?? 0) << 8) | ((parts[i + 2] ?? 0) << 16) | ((parts[i + 3] ?? 0) << 24);
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, v, true);
      out.push(String(new DataView(buf).getFloat32(0, true)));
      i += 4;
    } else if (kind === 2) {
      out.push('null');
    } else if (kind === 3) {
      out.push('undefined');
    } else if (kind === 4) {
      out.push(`register(${parts[i] ?? 0})`);
      i++;
    } else if (kind === 5) {
      out.push(parts[i] ? 'true' : 'false');
      i++;
    } else if (kind === 6) {
      const v = (parts[i] ?? 0) | ((parts[i + 1] ?? 0) << 8) | ((parts[i + 2] ?? 0) << 16) | ((parts[i + 3] ?? 0) << 24);
      const buf = new ArrayBuffer(8);
      new DataView(buf).setUint32(0, v, true);
      out.push(String(new DataView(buf).getFloat64(0, true)));
      i += 8;
    } else if (kind === 7) {
      const v = (parts[i] ?? 0) | ((parts[i + 1] ?? 0) << 8) | ((parts[i + 2] ?? 0) << 16) | ((parts[i + 3] ?? 0) << 24);
      out.push(String(v | 0));
      i += 4;
    } else {
      out.push(`pushType(${kind})`);
    }
  }
  return out.join(', ');
}

/** Decode a hex ActionScript bytecode string into a readable p-code listing. */
export function decompileActionScriptBytecode(hex: string): string {
  const bytes: number[] = [];
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  for (let i = 0; i + 1 < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));

  const lines: string[] = [];
  let pc = 0;
  while (pc < bytes.length) {
    const op = bytes[pc];
    const name = OPCODES[op] ?? `Unknown(0x${op.toString(16).padStart(2, '0')})`;
    let operand = '';
    if (op === 0x96 || op === 0xa7) {
      const len = (bytes[pc + 1] ?? 0) | ((bytes[pc + 2] ?? 0) << 8);
      const payload = bytes.slice(pc + 3, pc + 3 + len);
      operand = ` ${pushPayload(payload)}`;
      pc += 3 + len;
    } else if (op === 0x99 || op === 0x82 || op === 0x8d) {
      const off = (bytes[pc + 1] ?? 0) | ((bytes[pc + 2] ?? 0) << 8);
      const signed = off & 0x8000 ? off - 0x10000 : off;
      operand = ` -> ${pc + 3 + signed}`;
      pc += 3;
    } else if (op === 0x9a || op === 0x89 || op === 0x83 || op === 0x9d) {
      const off = (bytes[pc + 1] ?? 0) | ((bytes[pc + 2] ?? 0) << 8);
      operand = ` -> ${pc + 3 + off}`;
      pc += 3;
    } else if (op === 0x52 || op === 0x5c || op === 0x9f) {
      const n = (bytes[pc + 1] ?? 0) | ((bytes[pc + 2] ?? 0) << 8);
      operand = ` (${n} args)`;
      pc += 3;
    } else if (op >= 0x75 && op <= 0x7e) {
      operand = ` (${op - 0x75 + 1} locals)`;
      pc += 1;
    } else if (op === 0x43 || op === 0x45 || op === 0x46 || op === 0x8c || op === 0xa8) {
      pc += 1;
      if (pc < bytes.length) {
        const paramCount = bytes[pc];
        pc += 1 + paramCount;
        const bodyLen = (bytes[pc] ?? 0) | ((bytes[pc + 1] ?? 0) << 8);
        pc += 2 + bodyLen;
      }
      operand = ' {...}';
    } else if (op === 0x9e) {
      operand = ' { try/catch }';
      pc += 1 + 6;
    } else {
      pc += 1;
    }
    lines.push(`${name}${operand}`);
  }
  return lines.join('\n');
}
