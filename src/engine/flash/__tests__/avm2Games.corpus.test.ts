// @vitest-environment jsdom
// The AVM2 path on real AS3 games (the uploaded corpus), read and run the way
// the app does it:
//
//   SWF bytes → parseSwfBinary → doc.abc → abcSources (lift to TypeScript)
//             → compileSources + linkProgram → FlashPlayer, stepping frames
//
// Skips when the corpus is not checked out (see src/testing/corpus.ts). The
// hand-assembled fixture in avm2Fixture.test.ts covers the same path without it.
//
// A refusal is a method body that throws a named "not lifted yet" error where it
// is called: the counts below may fall, never rise.
import { expect, it } from 'vitest';
import { AssetCache, ingestFiles } from '@/lib/assets';
import { swfFilesToFiles } from '@/lib/bundled';
import { parseSwfBinary } from '@/lib/swf/binary';
import { corpusFile, corpusSwfs, describeCorpus, readArrayBuffer } from '@/testing/corpus';
import { abcSources } from '../abc';
import { analyzeCompiled } from '../analyze';
import { DisplayObject } from '../display';
import { compileSources, expectedClasses, linkProgram } from '../loader';
import { FlashPlayer, type LogEntry } from '../player';
import { runtime } from '../context';

const read = (path: string) => parseSwfBinary(readArrayBuffer(path), path.slice(path.lastIndexOf('/') + 1));

describeCorpus('AVM2 games: lift, link and boot', () => {
  const MOVIES = [
    { name: 'pinball', set: 'pinball-swfs', file: 'game.swf', refusals: 0, classes: 435, boots: true },
    { name: 'tiles', set: 'tiles-swfs', file: 'assets.swf', refusals: 0, classes: 35, boots: true },
    // towns2 links completely, but its document class builds a UI whose `flash.*`
    // support this engine does not have yet: only the linking is asserted.
    { name: 'towns2', set: 'towns2-swfs', file: 'towns2.swf', refusals: 8, classes: 762, boots: false },
  ];

  for (const movie of MOVIES) {
    it(`lifts ${movie.name} out of its DoABC tags, links it and boots it`, async () => {
      const { doc, files } = await read(corpusFile(movie.set, movie.file)!);
      expect(doc.abc?.length, 'the reader kept the DoABC payloads').toBeGreaterThan(0);
      const lifted = abcSources(doc.abc ?? []);
      expect(lifted.unreadable).toEqual([]);
      expect(lifted.classes.length).toBe(movie.classes);
      expect(lifted.refusals.length).toBeLessThanOrEqual(movie.refusals);

      // `kill` releases a register and must not print as an assignment
      // (`Equations.easeOutBounce`: `11 get_local 5; 13 kill 5`).
      const equations = lifted.sources.find((f) => f.path.endsWith('com/pixel/motion/Equations.ts'));
      expect(equations?.text ?? '').not.toMatch(/local5 = undefined/);

      const program = linkProgram(compileSources(lifted.sources));
      expect(program.errors).toEqual([]);
      // An interface has no runtime value: every class the movie constructs links.
      const interfaces = new Set(lifted.sources.filter((f) => /^export interface \w+/m.test(f.text)).map((f) => f.path));
      const constructed = lifted.classes.filter((c) => !interfaces.has(`${c.split('.').join('/')}.ts`));
      expect(constructed.filter((c) => !program.getDefinition(c))).toEqual([]);

      const documentClass = doc.symbolClasses?.get(0);
      if (documentClass) expect(program.getDefinition(documentClass)).toBeTruthy();
      if (!movie.boots) return;

      const logs: LogEntry[] = [];
      const player = new FlashPlayer({ doc, program, assets: new AssetCache(ingestFiles(swfFilesToFiles(files, movie.name)), () => {}), onLog: (e) => logs.push(e) });
      try {
        player.start();
        for (let i = 0; i < 120; i++) player.step();
        const root = player.root as { constructor?: { name?: string } } | null;
        expect(root).toBeTruthy();
        if (documentClass) expect(root?.constructor?.name).toBe(documentClass.split('.').pop());
      } finally {
        player.dispose();
        runtime.player = null;
      }
    }, 300_000);
  }

  it("makes the pinball movie's own entry points constructible", async () => {
    const { doc } = await read(corpusFile('pinball-swfs', 'game.swf')!);
    const program = linkProgram(compileSources(abcSources(doc.abc ?? []).sources));
    for (const name of ['com.gaiaonline.games.gPinball.Pinball', 'com.pixel.motion.Tweener', 'com.custom.KeyCheck']) {
      expect(program.getDefinition(name), name).toBeTruthy();
    }
    // a timeline symbol class — what SymbolClass linkage and `addFrameScript` need
    const Symbol = program.getDefinition('game_fla.mcRampBank_Gate_113') as (new () => Record<string, unknown>) | undefined;
    expect(typeof Symbol).toBe('function');
    expect(() => new Symbol!()).not.toThrow();
  }, 120_000);
});

// P-06: the Execute tab's static AS3 summary must say what linking would say,
// for every AVM2 movie of the corpus.
describeCorpus('static AS3 analysis agrees with linking', () => {
  const movies = corpusSwfs();
  // (without the corpus the suite is skipped; one named test keeps it visible)
  if (!movies.length) it('every corpus SWF', () => {});
  else it.each(movies.map((m) => [`${m.set}/${m.name}`, m.path]))('%s', async (_label, path) => {
    const { doc } = await read(path);
    if (!doc.abc?.length) return;
    const compiled = compileSources(abcSources(doc.abc).sources);
    const wanted = expectedClasses(doc);
    const analysis = analyzeCompiled(compiled, wanted);
    const linked = linkProgram(compiled);

    const byName = (a: { qualifiedName: string }, b: { qualifiedName: string }) => a.qualifiedName.localeCompare(b.qualifiedName);
    expect([...analysis.classes].sort(byName)).toEqual([...linked.classes].sort(byName));
    const display = linked.classes
      .filter((c) => { const d = linked.getDefinition(c.qualifiedName); return typeof d === 'function' && d.prototype instanceof DisplayObject; })
      .map((c) => c.qualifiedName);
    expect([...analysis.displayClasses].sort()).toEqual(display.sort());
    expect(analysis.unresolved).toEqual(wanted.filter((name) => !linked.getDefinition(name)));
    const linkMessages = linked.errors.map((e) => e.message);
    for (const e of analysis.errors) expect(linkMessages.some((m) => m.includes(e.message.split('. Make sure')[0]))).toBe(true);
  }, 120_000);
});
