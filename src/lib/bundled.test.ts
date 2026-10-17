// @vitest-environment jsdom
// Bundled game sets: an optional public index (manifest.json) → one JSON per
// game → the .swf files of that game, each parsed into everything it carries.
// The repo ships none, so the index here is served by a stub `fetch`: every
// answer a root can give (none, an index, a broken index), then the sample set
// served through it end to end when the corpus is checked out.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fetchBundledManifest, fetchBundledSwf, fetchGameIndex, loadGameIndex } from './bundled';
import { ingestFiles } from './assets';
import { bundledSet, bundledSwfNames, describeSample } from './__tests__/bundledSet';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

type Answer = Response | (() => Response) | Error;
/** Serve `routes` (path → answer); anything else is a 404. */
function serve(routes: Record<string, Answer>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const answer = routes[String(input).replace(/[?#].*$/, '').replace(/^\//, '')];
    if (answer instanceof Error) throw answer;
    if (!answer) return new Response('not found', { status: 404 });
    return typeof answer === 'function' ? answer() : answer.clone();
  }) as typeof fetch;
}
const json = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('the bundled index', () => {
  it('is "none" when the root has no manifest.json (404)', async () => {
    serve({});
    expect(await loadGameIndex()).toEqual({ status: 'none' });
    await expect(fetchGameIndex()).rejects.toThrow('No bundled game sets are available.');
  });

  it('is "none" when the server answers with its HTML page (SPA fallback)', async () => {
    serve({ 'manifest.json': () => new Response('<!doctype html><html><body>app</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }) });
    expect(await loadGameIndex()).toEqual({ status: 'none' });
  });

  it('is "broken", saying why, for anything else that is not a usable index', async () => {
    const cases: [Answer, RegExp][] = [
      [() => new Response('{ "games": [', { status: 200 }), /manifest\.json is not JSON/],
      [() => new Response('oops', { status: 500 }), /manifest\.json: HTTP 500/],
      [new TypeError('Failed to fetch'), /manifest\.json: Failed to fetch/],
      [json({ games: ['games/missing.json'] }), /lists no readable game sets/],
      [json({ swfs: [] }), /lists no swfs/],
      [json({ hello: 1 }), /neither "games" nor "swfs"/],
    ];
    for (const [answer, why] of cases) {
      serve({ 'manifest.json': answer });
      const state = await loadGameIndex();
      expect(state.status).toBe('broken');
      expect(state.status === 'broken' && state.error).toMatch(why);
    }
  });

  it('reads an index of game sets, skipping a set that cannot be read', async () => {
    serve({
      'manifest.json': json({ default: 'alpha', games: ['games/alpha.json', 'games/gone.json'] }),
      'games/alpha.json': json({ id: 'alpha', label: 'Alpha', adapter: 'alpha-adapter', main: 'b', swfs: ['alpha/a.swf', { name: 'b', path: 'alpha/b.swf' }] }),
    });
    expect(await loadGameIndex()).toEqual({
      status: 'ready',
      games: [{ id: 'alpha', label: 'Alpha', adapter: 'alpha-adapter', main: 'b', swfs: [{ name: 'a', path: 'alpha/a.swf' }, { name: 'b', path: 'alpha/b.swf' }] }],
    });
  });

  it('reads a legacy flat list as one anonymous set', async () => {
    serve({ 'manifest.json': json({ swfs: ['x/one.swf'] }) });
    expect(await fetchGameIndex()).toEqual([{ id: 'bundled', label: 'Bundled SWFs', swfs: [{ name: 'one', path: 'x/one.swf' }] }]);
  });
});

describeSample('a bundled game set (the sample, served from the corpus)', () => {
  /** A root shipping the sample: index → set JSON → `swfs/<name>.swf`, read from the corpus. */
  function serveSample() {
    const set = bundledSet();
    const routes: Record<string, Answer> = {
      'manifest.json': json({ default: set.id, games: [`games/${set.id}.json`] }),
      [`games/${set.id}.json`]: json({ ...set, swfs: set.swfs.map((e) => ({ name: e.name, path: `swfs/${e.name}.swf` })) }),
    };
    for (const e of set.swfs) routes[`swfs/${e.name}.swf`] = () => new Response(readFileSync(e.path), { status: 200 });
    serve(routes);
  }

  it('resolves the index to the default game set, whose entries are its files', async () => {
    serveSample();
    const games = await fetchGameIndex();
    const set = games.find((g) => g.id === bundledSet().id);
    expect(set, 'the default game set is listed').toBeTruthy();
    expect(set!.main).toBe(bundledSet().main);
    expect(set!.swfs.map((e) => e.name)).toEqual(bundledSwfNames());
    for (const entry of set!.swfs) expect(entry.path.split('/').pop()).toBe(`${entry.name}.swf`);
  });

  it('parses every SWF of the set into its scripts, fonts and sounds, and ingests it', async () => {
    serveSample();
    const entries = await fetchBundledManifest();
    expect(entries.length).toBe(bundledSwfNames().length);

    for (const entry of entries) {
      const { doc, files } = await fetchBundledSwf(entry);
      expect(doc.header.fileName, `${entry.name} fileName`).toBe(`${entry.name}.swf`);
      expect(doc.timelines.size, `${entry.name} timelines`).toBeGreaterThan(0);

      // every embedded font and sound comes out of the SWF itself
      const fonts = [...doc.characters.values()].filter((c) => c.kind === 'font' && c.font);
      for (const c of fonts) expect(files.some((f) => f.webkitRelativePath === `${entry.name}/fonts/${c.id}.ttf`), `${entry.name} font ${c.id}`).toBe(true);
      const sounds = [...doc.characters.values()].filter((c) => c.kind === 'sound');
      for (const c of sounds) expect(files.some((f) => new RegExp(`^${entry.name.replace(/\./g, '\\.')}/sounds/${c.id}\\.(mp3|wav)$`).test(f.webkitRelativePath)), `${entry.name} sound ${c.id}`).toBe(true);

      const bundle = ingestFiles(files);
      // asset categories survive the synthetic-File bridge
      const cats = new Set(bundle.files.map((f) => f.category));
      expect(cats.has('other'), `${entry.name} categories: ${[...cats]}`).toBe(false);
      expect(bundle.files.some((f) => /\.as$/i.test(f.path)), `${entry.name} has scripts`).toBe(true);
    }
  }, 60000);
});
