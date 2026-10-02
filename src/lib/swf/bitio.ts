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
