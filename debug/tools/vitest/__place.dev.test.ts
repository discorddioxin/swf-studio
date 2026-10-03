// Scratch: which timeline/frame places a named instance (engine's own view).
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';

it('placements', async () => {
  const name = process.env.NAME ?? 'serverListing_lt';
  const bytes = readFileSync(process.env.SWF ?? 'game-files/fish-full/swfs/gsecs2.9.swf');
  const { doc } = await parseSwfBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'gsecs2.9.swf');
  console.log('characters', doc.characters.size, 'timelines', doc.timelines.size);
  const visit = (label: string, tl: any) => {
    if (!tl) return;
    (tl.frames ?? []).forEach((f: any, i: number) => {
      const hits: any[] = (f.display ?? []).filter((d: any) => d.name === name);
      const ops: any[] = (f.ops ?? []).filter((o: any) => o.name === name);
      if (hits.length || ops.length) {
        const h = hits[0] ?? ops[0];
        console.log(`timeline ${label} frame ${i + 1} char=${h.characterId} depth=${h.depth} ops=${(f.ops ?? []).length}`);
      }
    });
  };
  visit('root', doc.root);
  for (const [id, tl] of doc.timelines) visit(`timeline#${id}`, tl);
  const exports: string[] = [];
  for (const [id, c] of doc.characters) if ((c as any).exportName) exports.push(`${id}=${(c as any).exportName}`);
  console.log('exports with List:', exports.filter((e) => /List|UIObject/.test(e)).join(' '));
});
