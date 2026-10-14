// Whole-game gate for the AVM2 path: a real AS3 movie, read and run the way the
// app does it.
//
//   SWF bytes → parseSwfBinary (the app's reader) → doc.abc (DoABC payloads)
//             → abcSources (lift to TypeScript) → compileSources + linkProgram
//             (the loader the player uses) → a class you can construct
//
// The committed unit tests cover the shape on one class (`src/engine/flash/
// __tests__/abc.test.ts`) and on the deck fixture
// (`transpiler/avm2/transpile.test.ts`). This one is the corpus gate: every body
// of the pinball movie, and the linked result. It skips when the uploaded
// corpus is not checked out.
//
//   git clone --depth 1 --branch swf-uploads \
//     https://github.com/discorddioxin/swf-forge.git /tmp/swf-forge2
//
// The refusal rate is allowed to fall, never to rise: a refusal is a method body
// that throws a named "not lifted yet" error where it is called.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from '@/../decompiler/swf/binary';
import { abcSources } from '@/../src/engine/flash/abc';
import { compileSources, linkProgram } from '@/../src/engine/flash/loader';

const CORPUS = process.env.SWF_CORPUS ?? '/tmp/swf-forge2/games-swfs';
const GAME = `${CORPUS}/pinball-swfs/game.swf`;
const available = existsSync(GAME);

describe.skipIf(!available)('AVM2 movie → running program', () => {
  /**
   * Every AS3 movie in the uploaded corpus, with the numbers this pipeline is
   * allowed to have: refusals may fall, never rise; the linked program must carry
   * the classes and have no errors at all.
   */
  const MOVIES = [
    { name: 'pinball', file: 'pinball-swfs/game.swf', refusals: 194, classes: 435 },
    { name: 'tiles', file: 'tiles-swfs/assets.swf', refusals: 0, classes: 35 },
    { name: 'towns2', file: 'towns2-swfs/towns2.swf', refusals: 180, classes: 762 },
  ];

  for (const movie of MOVIES) {
    it(`lifts ${movie.name} out of its DoABC tags and links it`, async () => {
      const bytes = readFileSync(`${CORPUS}/${movie.file}`);
      const { doc } = await parseSwfBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, movie.file);
      expect(doc.abc?.length, 'the reader kept the DoABC payloads').toBeGreaterThan(0);

      const lifted = abcSources(doc.abc ?? []);
      expect(lifted.payloads).toBeGreaterThan(0);
      console.log(`files ${lifted.sources.length}, classes ${lifted.classes.length}, refusals ${lifted.refusals.length}`);
      const kinds = new Map<string, number>();
      for (const r of lifted.refusals) kinds.set(r.message, (kinds.get(r.message) ?? 0) + 1);
      for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${count}  ${kind}`);
      if (lifted.unsupported.length) console.log(`  engine APIs missing: ${lifted.unsupported.slice(0, 6).join(', ')}`);

      // A refusal is a body that throws instead of running: it must not grow.
      expect(lifted.classes.length).toBe(movie.classes);
      expect(lifted.refusals.length).toBeLessThanOrEqual(movie.refusals);

      // The movies do write `undefined` (`_loc4_ = undefined` is in the export), so
      // the check is the one that used to be wrong: `kill` releases a register and
      // must not print as an assignment. `Equations.easeOutBounce` is the case that
      // used to show it (`11 get_local 5; 13 kill 5`).
      const equations = lifted.sources.find((f) => f.path.endsWith('com/pixel/motion/Equations.ts'));
      expect(equations?.text ?? '').not.toMatch(/local5 = undefined/);
      const written = lifted.sources.reduce((n, f) => n + (f.text.match(/= undefined\b/g)?.length ?? 0), 0);
      console.log(`explicit \`undefined\` writes in the emitted code: ${written}`);

      const program = linkProgram(compileSources(lifted.sources));
      for (const e of program.errors.slice(0, 10)) console.log(`  ${e.path}: ${e.message.slice(0, 160)}`);
      expect(program.errors).toEqual([]);

      // An interface has no runtime value to link: count the classes the movie
      // actually constructs, and require the program to carry them.
      const interfaces = new Set(lifted.sources.filter((f) => /^export interface \w+/m.test(f.text)).map((f) => f.path));
      const runtime = lifted.classes.filter((c) => !interfaces.has(`${c.split('.').join('/')}.ts`));
      const linked = runtime.filter((c) => program.getDefinition(c));
      console.log(`runtime classes ${runtime.length} (${interfaces.size} interfaces), linked ${linked.length}`);
      expect(linked.length).toBe(runtime.length);
    }, 300_000);
  }

  it('makes the pinball movie\'s own entry points constructible', async () => {
    const bytes = readFileSync(GAME);
    const { doc } = await parseSwfBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'game.swf');
    const lifted = abcSources(doc.abc ?? []);
    const program = linkProgram(compileSources(lifted.sources));

    // The classes the movie itself points at must be resolvable, and a timeline
    // symbol class — what SymbolClass linkage and `addFrameScript` need — must be
    // constructible.
    for (const name of ['com.gaiaonline.games.gPinball.Pinball', 'com.pixel.motion.Tweener', 'com.custom.KeyCheck']) {
      expect(program.getDefinition(name), name).toBeTruthy();
    }
    const Symbol = program.getDefinition('game_fla.mcRampBank_Gate_113') as (new () => Record<string, unknown>) | undefined;
    expect(typeof Symbol).toBe('function');
    expect(() => new Symbol!()).not.toThrow();
  }, 120_000);
});
