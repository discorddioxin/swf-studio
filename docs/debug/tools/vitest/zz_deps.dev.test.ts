// Dev harness: boot a corpus movie and print the dependencies it requested.
//   SWF_FILE=/tmp/swf-forge2/games-swfs/pinball-swfs/gameShell.swf SWF_VARS=game=pinball vitest run docs/debug/tools/vitest/zz_deps.dev.test.ts
import { existsSync, readFileSync } from 'node:fs';
import { it } from 'vitest';
import { AssetCache, ingestFiles } from '@/../src/lib/assets';
import { swfFilesToFiles } from '@/../src/lib/bundled';
import { parseSwfBinary } from '@/../transcom/decompiler/swf/binary';
import { abcSources } from '@/../src/engine/flash/abc';
import { compileSources, linkProgram } from '@/../src/engine/flash/loader';
import { FlashPlayer } from '@/../src/engine/flash/player';
import { describeDependency } from '@/../src/engine/flash/dependencies';
import { corpusPath } from '@/testing/corpus';

const FILES = (process.env.SWF_FILE ?? corpusPath('pinball-swfs/gameShell.swf')).split(',');
it.skipIf(!FILES.every((f) => existsSync(f)))('prints requested dependencies', async () => {
  for (const FILE of FILES) {
    const raw = readFileSync(FILE);
    const { doc, files } = await parseSwfBinary(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, FILE.split('/').pop()!);
    const program = linkProgram(compileSources(abcSources(doc.abc ?? []).sources));
    const cache = new AssetCache(ingestFiles(swfFilesToFiles(files, 'x')), () => {});
    const player = new FlashPlayer({ doc, program, assets: cache, onLog: () => {}, parameters: Object.fromEntries(new URLSearchParams(process.env.SWF_VARS ?? '')) });
    player.start();
    for (let i = 0; i < Number(process.env.SWF_FRAMES ?? 120); i++) player.step();
    console.log(`== ${FILE}`);
    for (const d of player.dependencies.list()) console.log(`DEP ${describeDependency(d)}`);
  }
}, 600_000);
