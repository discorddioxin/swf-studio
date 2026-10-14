// How far does a real AS3 game get in the engine? No fixtures: the pinball
// movie's own folder, read and run the way the app does it.
//
//   SWF bytes → parseSwfBinary → doc + its asset files → ingestFiles (the same
//   bundle the app builds) → abcSources → linkProgram → FlashPlayer, stepping
//   frames. The test only requires what the AVM2 path promises: the movie's
//   document class is constructed and the stage comes up. Everything the engine
//   cannot do yet is printed, so this doubles as the honest "how far does it
//   run" report.
//
//   git clone --depth 1 --branch swf-uploads \
//     https://github.com/discorddioxin/swf-forge.git /tmp/swf-forge2
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AssetCache, ingestFiles } from '@/../src/lib/assets';
import { swfFilesToFiles } from '@/../src/lib/bundled';
import { parseSwfBinary } from '@/../decompiler/swf/binary';
import { abcSources } from '@/../src/engine/flash/abc';
import { compileSources, linkProgram } from '@/../src/engine/flash/loader';
import { FlashPlayer, type LogEntry } from '@/../src/engine/flash/player';

const CORPUS = process.env.SWF_CORPUS ?? '/tmp/swf-forge2/games-swfs';
const available = existsSync(`${CORPUS}/pinball-swfs/game.swf`);

/** A movie's bytes as the app reads them: the raw file, straight into the reader. */
async function read(file: string, name: string) {
  const raw = readFileSync(file);
  return parseSwfBinary(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, name);
}

const MOVIES = [
  { label: 'pinball', file: 'pinball-swfs/game.swf' },
  { label: 'tiles', file: 'tiles-swfs/assets.swf' },
  // towns2 links completely (762 classes, no errors) but its document class builds
  // a UI whose `flash.*` support this engine does not have yet, so it is not
  // expected to reach the stage: the assertions below are the linking ones.
  { label: 'towns2', file: 'towns2-swfs/towns2.swf', boots: false },
];

describe.skipIf(!available)('real AS3 games in the engine', () => {
  for (const movie of MOVIES) {
    it(`boots ${movie.label} and reports what it hits`, async () => {
      const { doc, files } = await read(`${CORPUS}/${movie.file}`, movie.file.split('/').pop());
      const lifted = abcSources(doc.abc ?? []);
      const program = linkProgram(compileSources(lifted.sources));
      for (const e of program.errors.slice(0, 6)) console.log(`  link: ${e.path}: ${e.message.slice(0, 140)}`);
      expect(program.errors).toEqual([]);

      const bundle = ingestFiles(swfFilesToFiles(files, movie.label));
      const cache = new AssetCache(bundle, () => {});
      const logs: LogEntry[] = [];
      const player = new FlashPlayer({ doc, program, assets: cache, onLog: (entry) => logs.push(entry) });
      player.start();
      for (let i = 0; i < 120; i++) player.step();
      const root = player.root as { constructor?: { name?: string } } | null;
      const documentClass = doc.symbolClasses?.get(0);
      console.log(`${movie.label}: ${lifted.sources.length} files, ${lifted.classes.length} classes, ${lifted.refusals.length} refusals`);
      if (lifted.unsupported.length) console.log(`  engine APIs missing: ${lifted.unsupported.slice(0, 6).join(', ')}`);
      console.log(`  document class ${documentClass ?? '(none)'} → root ${root?.constructor?.name ?? '(none)'} · stage ${player.stage.stageWidth}x${player.stage.stageHeight} @ ${player.stage.frameRate}fps`);
      console.log(`  symbol classes linked: ${player.linkage.filter((l) => l.linked).length}/${player.linkage.length}`);
      for (const entry of logs.slice(0, 10)) console.log(`  [${entry.level}] ${entry.message.slice(0, 150)}`);
      if (logs.length > 10) console.log(`  … ${logs.length - 10} more`);
      player.dispose();

      // The movie's own document class must be there to be booted at all.
      if (documentClass) expect(program.getDefinition(documentClass)).toBeTruthy();
      if (movie.boots === false) return;
      // The movie comes up: its document class, or the plain timeline root.
      expect(root).toBeTruthy();
      if (documentClass) expect(root?.constructor?.name).toBe(documentClass.split('.').pop());
    }, 300_000);
  }
});
