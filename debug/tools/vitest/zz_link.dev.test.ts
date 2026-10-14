import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { describe, it } from 'vitest';
import { parseSwfBinary } from '@/../decompiler/swf/binary';
import { abcSources } from '@/../src/engine/flash/abc';
import { compileSources, linkProgram } from '@/../src/engine/flash/loader';

/** SWF_FILE=<path> prints the symbol linkage table the program builds. */
const CORPUS_OK = existsSync(process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf');

describe.skipIf(!CORPUS_OK)('corpus harness', () => {
  it('shows which symbol classes fail to resolve', async () => {
  const file = process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/tiles-swfs/assets.swf';
  const bytes = readFileSync(file);
  const { doc } = await parseSwfBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'x.swf');
  const lifted = abcSources(doc.abc ?? []);
  const program = linkProgram(compileSources(lifted.sources));
  console.log(`symbol classes: ${[...(doc.symbolClasses ?? new Map())].map(([id, n]) => `${id}=${n}`).join(', ')}`);
  console.log(`direct lookups:`);
  for (const [, name] of doc.symbolClasses ?? new Map()) {
    if (!program.getDefinition(name)) console.log(`  MISSING ${name}`);
  }
  const m = program.modules?.find?.((x: { path: string }) => x.path === 'starBurst.ts');
  console.log('module for starBurst:', m ? `${m.path} exports=${Object.keys(m.exports ?? {}).join(',')}` : '(none)');
  }, 600_000);
});
