// Dev check: per-SWF timeline/export stats that the actor heuristics key off.
// Discovers every bundled game set (game-files/games/*.json) and reports each
// SWF's shape, so a heuristic change can be compared across the whole set.
//
//   ./node_modules/.bin/vitest run docs/debug/tools/vitest/__actorStats.dev.test.ts
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { proposeActors } from '../../../../transcom/transpiler/as2/actorHeuristics';

const ROOT = 'game-files';

function bundledSwfs(): { set: string; name: string; path: string }[] {
  const dir = resolve(ROOT, 'games');
  if (!existsSync(dir)) return [];
  const out: { set: string; name: string; path: string }[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const set = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as { id: string; swfs: { name: string; path: string }[] };
    for (const swf of set.swfs) out.push({ set: set.id, name: swf.name, path: swf.path });
  }
  return out;
}

it('per-SWF stats behind the actor heuristics', async () => {
  for (const entry of bundledSwfs()) {
    const buf = readFileSync(resolve(ROOT, entry.path));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { doc } = await parseSwfBinary(ab, `${entry.name}.swf`);
    const timelines = [...doc.timelines.values()];
    const sprites = timelines.filter((t) => t.kind === 'sprite');
    const countMx = (link: string) => link.includes('mx.') || link.startsWith('__Packages.');
    const mxExportName = [...doc.characters.values()].filter((c) => countMx(c.exportName ?? '')).length;
    const mx = [...doc.characters.values()].filter((c) => countMx(c.exportName || c.className || '')).length;
    const mxName = [...doc.characters.values()].filter((c) => (c.exportName || '').includes('mx.') || (c.exportName || '').includes('__Packages.mx')).length;
    const outerGuard = doc.timelines.size > 20 && sprites.length > 15;
    const proposals = proposeActors(doc);
    console.log(
      `${entry.set}/${entry.name}: exports=${[...doc.characters.values()].filter((c) => c.exportName).length}`
      + ` mxExports=${mx} mxExportNames=${mxExportName} timelines=${timelines.length} sprites=${sprites.length}`
      + ` [heuristicCount=${mxName} outerGuard=${outerGuard}]`
      + ` proposals=${proposals.length}${proposals.length ? ` top=[${proposals[0].timelineIds.join(',')}] ${proposals[0].kind}:${proposals[0].name}` : ''}`,
    );
  }
  expect(true).toBe(true);
});
