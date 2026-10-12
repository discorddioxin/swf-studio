// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';
import { SAMPLE_MAIN, sampleSwfPath } from '@/adapters/gaiaFishing/sample';

it('prints decoded modules', async () => {
  const name = process.env.SWF ?? SAMPLE_MAIN;
  const buf = readFileSync(sampleSwfPath(name));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { files } = await parseSwfBinary(ab, `${name}.swf`);
  const srcs: SourceInput[] = files.filter((f) => f.path.endsWith('.as'))
    .map((f) => ({ path: f.path, text: new TextDecoder().decode(f.bytes), tagOrder: (f as any).tagOrder, targetSpriteId: (f as any).targetSpriteId }));
  const build = buildAS2Program(srcs);
  const want = new RegExp(process.env.PAT ?? 'loadMovieNum|loadMovie\\(|_level');
  for (const [path, code] of build.files) {
    const lines = code.split('\n');
    const hits = lines.map((l, i) => [i, l] as const).filter(([, l]) => want.test(l));
    if (!hits.length) continue;
    console.error(`---- ${path} (${lines.length} lines, ${hits.length} hits)`);
    for (const [i, l] of hits.slice(0, 30)) console.error(`${i + 1}: ${l.trim().slice(0, 200)}`);
  }
}, 300000);
