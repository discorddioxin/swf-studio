// Flash ADPCM decoder. FFDec exports non-MP3 event sounds (SWF sound format 1,
// ADPCM) as .flv files, which browsers can't play. This turns them into WAV.

const STEP = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
  130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060,
  1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
  7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];
const INDEX: Record<number, number[]> = {
  2: [-1, 2],
  3: [-1, -1, 2, 4],
  4: [-1, -1, -1, -1, 2, 4, 6, 8],
  5: [-1, -1, -1, -1, -1, -1, -1, -1, 1, 2, 4, 6, 8, 10, 13, 16],
};

class Bits {
  private pos = 0;
  constructor(private readonly data: Uint8Array) {}
  get left() { return this.data.length * 8 - this.pos; }
  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.data[this.pos >> 3];
      v = (v << 1) | ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
  signed(n: number): number { const v = this.read(n); return v & (1 << (n - 1)) ? v - (1 << n) : v; }
}

/** Decode one SWF ADPCM stream → interleaved int16 samples. */
export function decodeAdpcm(data: Uint8Array, channels: 1 | 2): Int16Array {
  const bits = new Bits(data);
  if (bits.left < 2) return new Int16Array(0);
  const nbits = bits.read(2) + 2;
  const table = INDEX[nbits];
  const out: number[] = [];
  const signMask = 1 << (nbits - 1);
  const sample = [0, 0];
  const index = [0, 0];
  while (bits.left >= channels * 22) {
    for (let c = 0; c < channels; c++) {
      sample[c] = bits.signed(16);
      index[c] = bits.read(6);
      out.push(sample[c]);
    }
    for (let i = 1; i < 4096 && bits.left >= channels * nbits; i++) {
      for (let c = 0; c < channels; c++) {
        const code = bits.read(nbits);
        let step = STEP[index[c]];
        let diff = step >> (nbits - 1);
        for (let mask = 1 << (nbits - 2); mask; mask >>= 1, step >>= 1) if (code & mask) diff += step;
        sample[c] = Math.max(-32768, Math.min(32767, code & signMask ? sample[c] - diff : sample[c] + diff));
        index[c] = Math.max(0, Math.min(88, index[c] + table[code & (signMask - 1)]));
        out.push(sample[c]);
      }
    }
  }
  return Int16Array.from(out);
}

export interface Pcm { samples: Int16Array; rate: number; channels: 1 | 2 }

/** Extract and decode the audio of an FLV file (ADPCM or raw PCM tags). Returns null for other codecs. */
export function decodeFlvAudio(buf: ArrayBuffer): Pcm | null {
  const d = new Uint8Array(buf);
  if (d[0] !== 0x46 || d[1] !== 0x4c || d[2] !== 0x56) return null; // "FLV"
  let p = ((d[5] << 24) | (d[6] << 16) | (d[7] << 8) | d[8]) + 4;
  const parts: Int16Array[] = [];
  let rate = 22050;
  let channels: 1 | 2 = 1;
  while (p + 11 <= d.length) {
    const type = d[p];
    const size = (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3];
    const body = d.subarray(p + 11, p + 11 + size);
    p += 11 + size + 4;
    if (type !== 8 || !body.length) continue;
    const flags = body[0];
    const format = flags >> 4;
    rate = [5512, 11025, 22050, 44100][(flags >> 2) & 3];
    channels = flags & 1 ? 2 : 1;
    const payload = body.subarray(1);
    if (format === 1) parts.push(decodeAdpcm(payload, channels));
    else if (format === 0 || format === 3) {
      if ((flags >> 1) & 1) parts.push(new Int16Array(payload.buffer.slice(payload.byteOffset, payload.byteOffset + (payload.length & ~1))));
      else parts.push(Int16Array.from(payload, (b) => (b - 128) << 8));
    } else return null;
  }
  if (!parts.length) return null;
  const total = parts.reduce((s, a) => s + a.length, 0);
  const samples = new Int16Array(total);
  let o = 0;
  for (const a of parts) { samples.set(a, o); o += a.length; }
  return { samples, rate, channels };
}

export function encodeWav({ samples, rate, channels }: Pcm): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i], true);
  return buf;
}
