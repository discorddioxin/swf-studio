// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { SAMPLE_MAIN, sampleSwfPath } from '@/adapters/gaiaFishing/sample';

const TAG: Record<number, string> = { 0: 'End', 9: 'SetBackgroundColor', 56: 'ExportAssets', 57: 'ImportAssets', 71: 'ImportAssets2', 76: 'SymbolClass', 59: 'DoInitAction', 12: 'DoAction', 34: 'DefineButton2', 43: 'FrameLabel', 26: 'PlaceObject2', 70: 'PlaceObject3', 24: 'Protect', 69: 'FileAttributes', 65: 'ScriptLimits', 39: 'DefineSprite', 21: 'DefineBitsJPEG2', 20: 'DefineBitsLossless', 36: 'DefineBitsLossless2', 35: 'DefineBitsJPEG3', 46: 'DefineMorphShape', 37: 'DefineEditText', 33: 'DefineText', 10: 'DefineFont', 48: 'DefineFont2', 75: 'DefineFont3', 73: 'DefineFontAlignZones', 74: 'CSMTextSettings', 77: 'Metadata', 78: 'DefineScalingGrid', 82: 'DoABC', 83: 'DefineShape4', 32: 'DefineShape3', 2: 'DefineShape', 4: 'PlaceObject', 1: 'ShowFrame', 5: 'RemoveObject', 28: 'RemoveObject2', 22: 'DefineShape2', 60: 'DefineVideoStream', 61: 'VideoFrame', 45: 'SoundStreamHead2', 18: 'SoundStreamBlock', 19: 'SoundStreamHead' };

it('lists tags', async () => {
  const name = process.env.SWF ?? SAMPLE_MAIN;
  const buf = readFileSync(sampleSwfPath(name));
  let body: Uint8Array;
  if (String.fromCharCode(buf[0], buf[1], buf[2]) === 'CWS') {
    const { inflateSync } = await import('node:zlib');
    body = new Uint8Array(8 + inflateSync(buf.subarray(8)).length);
    body.set(buf.subarray(0, 8), 0);
    body.set(inflateSync(buf.subarray(8)), 8);
  } else body = new Uint8Array(buf);
  // skip header: rect bits + frameRate + frameCount
  let at = 8;
  const nbits = body[at] >> 3;
  at += Math.ceil((5 + nbits * 4) / 8) + 4;
  const counts = new Map<number, number>();
  const strings = (b: Uint8Array, o: number): [string, number] => { let e = o; while (e < b.length && b[e] !== 0) e++; return [new TextDecoder('latin1').decode(b.subarray(o, e)), e + 1]; };
  while (at < body.length - 1) {
    const word = body[at] | (body[at + 1] << 8); at += 2;
    const code = word >> 6;
    let len = word & 0x3f;
    if (word & 0x40) { len = body[at] | (body[at + 1] << 8) | (body[at + 2] << 16) | (body[at + 3] << 24); at += 4; }
    const data = body.subarray(at, at + len); at += len;
    counts.set(code, (counts.get(code) ?? 0) + 1);
    if (code === 57 || code === 71) {
      let [url, o] = strings(data, 0);
      if (code === 71) o += 1;
      const count = data[o] | (data[o + 1] << 8); o += 2;
      const names: string[] = [];
      for (let i = 0; i < count; i++) { const [n, o2] = strings(data, o); names.push(n); o = o2; }
      console.error(`IMPORT(${TAG[code]}) url=${JSON.stringify(url)} names=[${names.join(', ')}]`);
    }
    if (code === 56) {
      const count = data[0] | (data[1] << 8); let o = 2;
      const names: string[] = [];
      for (let i = 0; i < count; i++) { const id = data[o] | (data[o + 1] << 8); o += 2; const [n, o2] = strings(data, o); names.push(`${id}:${n}`); o = o2; }
      console.error(`EXPORT ${names.length}: ${names.slice(0, 20).join(', ')}${names.length > 20 ? ' …' : ''}`);
    }
    if (code === 0) break;
  }
  console.error(`== ${name}: ${[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([c, n]) => `${TAG[c] ?? c}(${n})`).join(' ')}`);
}, 120000);
