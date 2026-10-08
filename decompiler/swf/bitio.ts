// MSB-first bit reader for SWF binary structures (RECT, MATRIX, shape
// records, colour transforms …). Byte-level reads are little-endian, as in
// the SWF format specification.

export class BitReader {
  private bytePos = 0;
  private bit = 0;

  constructor(private data: Uint8Array) {}

  get offsetBytes() { return this.bytePos; }
  get length() { return this.data.length; }
  get remaining() { return this.data.length - this.bytePos; }

  /** byte-aligned read helpers (little-endian) */
  u8(): number { this.align(); return this.data[this.bytePos++] ?? 0; }
  s8(): number { const v = this.u8(); return v > 127 ? v - 256 : v; }
  u16(): number { const a = this.u8(); const b = this.u8(); return a | (b << 8); }
  s16(): number { const v = this.u16(); return v > 0x7fff ? v - 0x10000 : v; }
  u32(): number {
    const a = this.u8(), b = this.u8(), c = this.u8(), d = this.u8();
    return (a | (b << 8) | (c << 16) | (d << 24)) >>> 0;
  }
  s32(): number { return this.u32() | 0; }
  /** unsigned bit read, MSB first */
  ub(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | this.bit1();
    return v >>> 0;
  }
  /** signed bit read, MSB first */
  sb(n: number): number {
    if (n === 0) return 0;
    const v = this.ub(n);
    const sign = 1 << (n - 1);
    return (v & sign) ? v - (1 << n) : v;
  }
  private bit1(): number {
    const b = this.data[this.bytePos] ?? 0;
    const v = (b >> (7 - this.bit)) & 1;
    this.bit++;
    if (this.bit === 8) { this.bit = 0; this.bytePos++; }
    return v;
  }
  align() { if (this.bit) { this.bit = 0; this.bytePos++; } }
  /** absolute byte seek (bit-aligned) */
  seek(pos: number) { this.bit = 0; this.bytePos = pos; }
  skip(n: number) { this.align(); this.bytePos += n; }
  bytes(n: number): Uint8Array { this.align(); const out = this.data.subarray(this.bytePos, this.bytePos + n); this.bytePos += n; return out; }
  /** ASCIIZ string — bytes until NUL (inclusive) */
  str(): string {
    this.align();
    const start = this.bytePos;
    while (this.bytePos < this.data.length && this.data[this.bytePos] !== 0) this.bytePos++;
    const text = latin1(this.data.subarray(start, this.bytePos));
    this.bytePos++; // NUL
    return text;
  }
  /** UTF-8 / latin-1 string of exactly n bytes */
  fixedStr(n: number): string { return latin1(this.bytes(n)); }
}

export function latin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 4096) {
    out += String.fromCharCode(...bytes.subarray(i, i + 4096));
  }
  return out;
}

/** hex string for actionBytes round-tripping through decodeActionBytes */
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** Preserve the exact AVM1 bytes in the source layer. The transpiler decodes
 * supported blocks to TypeScript and retains this wrapper only for fallbacks. */
export function avm1ActionSource(bytes: Uint8Array): string {
  return `avm1Actions(${JSON.stringify(bytesToBase64(bytes))});`;
}

/** "0700" → Uint8Array. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(clean.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

/** base64 of raw bytes, browser and node. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const host = globalThis as { btoa?: (s: string) => string; Buffer?: any };
  if (typeof host.btoa === 'function') return host.btoa(bin);
  return host.Buffer.from(bin, 'binary').toString('base64');
}

/** Opcodes the AVM1 interpreter knows (mirrors runtime/as2/avm1.ts). */
const AVM1_OPCODES = new Set<number>([
  0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15,
  0x17, 0x18, 0x1c, 0x1d, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c,
  0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x41, 0x42, 0x43,
  0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x50, 0x51, 0x52, 0x53, 0x54, 0x55,
  0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x81, 0x83, 0x87, 0x88, 0x8a, 0x8b, 0x8c, 0x8d, 0x8e, 0x8f, 0x94, 0x96, 0x99, 0x9a, 0x9b, 0x9d, 0x9e, 0x9f,
]);

/** True when `data` walks as a complete AVM1 action stream (records, ending in End). */
export function isLikelyActionStream(data: Uint8Array): boolean {
  let pc = 0;
  while (pc < data.length) {
    const op = data[pc++];
    if (op === 0) {
      // End is a one-byte terminator, not permission to silently ignore the
      // remainder of the tag. In particular, a DoInitAction SpriteID may look
      // like an AVM1 opcode followed by 0x00; treating that as an End record
      // makes the parser eat the ID and execute the sprite id as script data.
      // A few exporters pad action records with zeroes, so only accept NUL
      // padding after the terminator.
      for (; pc < data.length; pc++) if (data[pc] !== 0) return false;
      return true;
    }
    if (!AVM1_OPCODES.has(op)) return false;
    if (op >= 0x80) {
      if (pc + 2 > data.length) return false;
      const len = data[pc] | (data[pc + 1] << 8);
      pc += 2 + len;
      if (pc > data.length) return false;
    }
  }
  return false; // ran out of bytes without an End record
}
