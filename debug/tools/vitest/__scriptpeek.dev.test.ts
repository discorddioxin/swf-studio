// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { SAMPLE_MAIN, sampleSwfPath } from '@/adapters/gaiaFishing/sample';

it('prints synthesized scripts', async () => {
  const name = process.env.SWF ?? SAMPLE_MAIN;
  const buf = readFileSync(sampleSwfPath(name));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { files } = await parseSwfBinary(ab, `${name}.swf`);
  const want = new RegExp(process.env.PAT ?? 'sprite_305|frame_1/');
  for (const f of files.filter((x) => want.test(x.path))) {
    console.error(`---- ${f.path} (${f.bytes.length}B) tagOrder=${(f as any).tagOrder} sprite=${(f as any).targetSpriteId}`);
    console.error(new TextDecoder().decode(f.bytes).slice(0, 1800));
  }
}, 60000);
