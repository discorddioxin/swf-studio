// Scratch: list the export (linkage) names of a bundled SWF.
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';

it('lists exports', async () => {
  const name = process.env.SWF ?? 'gsecs2.9';
  const buf = readFileSync(`game-files/fish-full/swfs/${name}.swf`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { doc } = await parseSwfBinary(ab, `${name}.swf`);
  const ex = [...doc.characters.values()].filter((c) => c.exportName);
  console.log(`${name}: ${ex.length} exported characters`);
  const pat = new RegExp(process.env.PAT ?? 'list|ui|focus|scroll|button', 'i');
  const hits = ex.filter((c) => pat.test(c.exportName!));
  console.log('matches:', hits.map((c) => `${c.id}:${c.exportName}(${c.tagType})`).join(', '));
  console.log('first 25:', ex.slice(0, 25).map((c) => c.exportName).join(', '));
}, 60000);
