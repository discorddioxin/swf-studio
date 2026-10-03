// Scratch: list the transpiled module files a bundled SWF produces.
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';

it('lists modules', async () => {
  const name = process.env.SWF ?? 'gsecs2.9';
  const buf = readFileSync(`game-files/fish-full/swfs/${name}.swf`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { files } = await parseSwfBinary(ab, `${name}.swf`);
  const dirs = new Map<string, number>();
  for (const f of files) {
    const top = f.path.split('/').slice(0, 2).join('/');
    dirs.set(top, (dirs.get(top) ?? 0) + 1);
  }
  console.log('dirs:', [...dirs.entries()].map(([k, v]) => `${k}(${v})`).join(' '));
  const want = new RegExp(process.env.PAT ?? 'UIObject|controls/List', 'i');
  const hits = files.filter((f) => want.test(f.path));
  console.log('hits:', hits.map((f) => f.path).slice(0, 12).join(', '));
  for (const h of hits.slice(0, 3)) {
    const text = new TextDecoder().decode(h.bytes);
    console.log(`---- ${h.path} (${h.bytes.length}B)`);
    console.log(text.slice(0, 2200));
  }
}, 60000);
