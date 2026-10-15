// The SWF and ABC readers on the uploaded game corpus: six real game sets,
// 43 files, SWF 6–24, 376 filter lists. These are files from outside this repo,
// which is what makes them worth running: the bundled fixtures are this
// project's own output and cannot catch a mistake writer and reader share.
// Skips without the corpus (see src/testing/corpus.ts).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { abcFrom, abcPayloads } from '@/testing/abcPayloads';
import { corpusScripts, corpusSwfs, describeCorpus, readArrayBuffer } from '@/testing/corpus';
import { abcClassNames, abcSurface } from './abc';
import { parseSwfBinary } from './binary';

/** Structural mistakes the parser reports instead of staying silent. */
const STRUCTURAL = /left after the last field|records end at byte|unknown filter/;

describeCorpus('SWF reader on the uploaded game corpus', () => {
  it('parses every SWF without throwing or reporting a structural problem', async () => {
    const swfs = corpusSwfs();
    expect(swfs.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const { set, name, path } of swfs) {
      try {
        const { doc } = await parseSwfBinary(readArrayBuffer(path), name);
        for (const w of doc.warnings) if (STRUCTURAL.test(w)) failures.push(`${set}/${name}: ${w}`);
      } catch (e) {
        failures.push(`${set}/${name}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  }, 600_000);
});

describeCorpus('ABC reader on the uploaded AS3 games', () => {
  const avm2 = () => corpusSwfs().map((m) => ({ ...m, payloads: abcPayloads(m.path) })).filter((m) => m.payloads.length > 0);

  it('walks every method body of every AS3 movie exactly (the opcode table)', () => {
    const movies = avm2();
    expect(movies.length).toBeGreaterThan(10);
    for (const movie of movies) {
      for (const payload of movie.payloads) {
        const s = abcSurface(abcFrom(payload));
        expect(s.walkErrors, movie.name).toEqual([]);
        expect(s.badTargets, movie.name).toBe(0);
      }
    }
  }, 300_000);

  // The FFDec `.as` export of pinball's game.swf is ground truth for the class
  // list only — the app never reads it.
  it.skipIf(!corpusScripts())('finds the classes of the FFDec export of pinball', () => {
    const scripts = corpusScripts()!;
    const fromAs = new Set<string>();
    const walk = (root: string, prefix: string) => {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(root, entry.name), prefix ? `${prefix}.${entry.name}` : entry.name);
        else if (entry.name.endsWith('.as')) fromAs.add(prefix ? `${prefix}.${entry.name.slice(0, -3)}` : entry.name.slice(0, -3));
      }
    };
    walk(join(scripts, 'gaia-pinball-game-swf-as/scripts'), '');
    const pinball = avm2().find((m) => m.set === 'pinball-swfs' && m.name === 'game.swf')!;
    const fromAbc = pinball.payloads.flatMap((p) => abcClassNames(abcFrom(p)));
    // 435 class files; a reader that mislaid the instance/class split would match none.
    const matched = fromAbc.filter((n) => fromAs.has(n)).length;
    expect(matched).toBeGreaterThan(400);
  }, 120_000);
});
