// Regression test for library resolution across loaded movies.
//
// Flash resolves `attachMovie`/`Sound.attachSound` in the library of the movie
// that owns the target clip; there is no cross-movie fallback (Ruffle
// `avm1/globals/movie_clip.rs` `attach_movie` looks only in `movie_clip.movie()`).
// A movie loaded into a clip (`loadMovie` with a target and no `_lockroot`)
// therefore keeps `_root === _level0`, which is what the bundled service movies
// rely on: gsecs2.9 attaches the *shell's* shared panels with
// `_root.attachMovie("errorPanelOk", …)`, and the shell exports exactly those
// symbols.
//
// The MX component libraries ask the same `_root` for "FocusManager" — a symbol
// only they export — so Flash returns `undefined` there too and the focus
// manager is never created. The engine stays faithful: it resolves what the
// shell library has, reports the miss naming the libraries that *do* export the
// symbol, and never searches another movie's library.
//
//   npx vitest run src/adapters/gaiaFishing/__tests__/symbolLibraries.dev.test.ts
//
// Sample-scenario harness: the movies under test come from the bundled set and
// are wired through their adapter (this folder).
//
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';
import { AS2Player } from '@/engine/as2/player';
import { createExternalResolver, type ExternalSwf } from '@/engine/as2/externals';
import { createFishingSession, gaiaFishingAdapter } from '..';
import { SAMPLE_GAME_SET_ID, SAMPLE_MAIN, SAMPLE_SWF_NAMES, sampleSwfPath } from '../sample';

async function load(name: string) {
  const buf = readFileSync(sampleSwfPath(name));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { doc, files } = await parseSwfBinary(ab, `${name}.swf`);
  const sources: SourceInput[] = files
    .filter((f) => /\.as$/i.test(f.path))
    .map((f) => ({ path: f.path, text: new TextDecoder().decode(f.bytes) }));
  return { doc, files, sources };
}

const exportsOf = (doc: any, name: string) =>
  [...doc.characters.values()].filter((c: any) => c.exportName === name);

it('resolves library symbols in the movie Flash would search, and reports the rest', async () => {
  const main = await load(SAMPLE_SWF_NAMES[0]);
  const ext = await Promise.all(SAMPLE_SWF_NAMES.slice(1).map(async (n) => ({ n, ...(await load(n)) })));
  const build = buildAS2Program(main.sources);
  const externals: ExternalSwf[] = ext.map((e) => ({ name: e.n, doc: e.doc, assets: null, sources: () => e.sources }));
  const session = createFishingSession();
  const player = new AS2Player({
    doc: main.doc,
    program: build.program,
    assets: null,
    audio: null,
    resolveExternal: createExternalResolver(externals, {}),
    missingExternal: 'empty',
    ...session.playerOptions(),
    afterStart: (root) => gaiaFishingAdapter.onStart?.(root, player, {
      main: { name: SAMPLE_MAIN, doc: main.doc, paths: [] },
      externals: [],
      bundled: true,
      declaredId: SAMPLE_GAME_SET_ID,
    }, session.network),
  });

  const warns: string[] = [];
  const log: (...args: any[]) => void = player.log.bind(player);
  (player as any).log = (level: string, message: string, ...rest: unknown[]) => {
    if (level === 'warn') warns.push(message);
    return log(level, message, ...rest);
  };

  player.start();
  for (let i = 0; i < 120; i++) { player.tick(); player.runQueue(); await new Promise((r) => setTimeout(r, 2)); }

  const root: any = player.root.obj;

  // The MX focus manager ships in the component libraries, not in the game shell.
  const managers = ext.filter((e) => exportsOf(e.doc, 'FocusManager').length);
  expect(managers.map((e) => e.n).sort()).toEqual(['game_chat', 'gsecs2.9']);
  expect(exportsOf(main.doc, 'FocusManager')).toHaveLength(0);

  // Positive control — the shell library is the one `_root` reaches, and it
  // exports the shared panels gsecs2.9 attaches through `_root.attachMovie(…)`.
  expect(exportsOf(main.doc, 'errorPanelOk').length).toBeGreaterThan(0);
  const panel = root.attachMovie('errorPanelOk', 'probePanel', 430, {});
  expect(panel, 'a shell-library symbol attaches on _root').toBeTruthy();
  expect(root.probePanel).toBe(panel);

  // The components ask the same library for a symbol it does not export: Flash
  // returns undefined here, so the engine must not resolve it elsewhere either.
  const before = warns.length;
  expect(root.attachMovie('FocusManager', 'probeFocus', 431, {})).toBeUndefined();
  const miss = warns.slice(before).find((w) => /no symbol exported as "FocusManager"/.test(w));
  expect(miss, 'the miss names the target movie and the libraries that export it')
    .toMatch(/in bassken.*\.swf \(exported by .*gsecs2\.9/);
  expect(warns.filter((w) => /no sound exported/.test(w))).toEqual([]);
  expect(root.probeFocus).toBeUndefined();

  // gsecs2.9's init actions ran against its own sprites (the MX `#initclip`
  // pattern), so its component classes are bound in that movie's own library.
  const serviceDoc = ext.find((e) => e.n === 'gsecs2.9')!.doc;
  const findMovie = (node: any): any =>
    node.movie?.doc === serviceDoc ? node.movie : [...node.children].map(findMovie).find(Boolean);
  const serviceMovie = findMovie(player.root);
  expect(serviceMovie, 'gsecs2.9 is loaded into the display list').toBeTruthy();
  const program: any = serviceMovie.program;
  const spriteIds = new Set<number>();
  for (const action of program?.initActions ?? []) {
    if (action.targetSpriteId != null) spriteIds.add(action.targetSpriteId);
  }
  for (const [id, mod] of Object.entries(program?.timelines ?? {})) {
    if (Number(id) !== 0 && (mod as any).init) spriteIds.add(Number(id));
  }
  expect(spriteIds.size).toBeGreaterThan(0);
  for (const id of spriteIds) {
    const scope = player.spriteScope(serviceMovie, id);
    expect(scope.movie, `sprite ${id} scope belongs to gsecs2.9`).toBe(serviceMovie);
  }
  player.dispose();
}, 120000);
