// @vitest-environment jsdom
// Bundled game sets: the public index (manifest.json) → one JSON per game →
// the .swf files of that game, each parsed into everything it carries (scripts,
// shapes, bitmaps, fonts, sounds). The shipped data is the fixture and the
// subject: nothing here knows a game's name.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchBundledManifest, fetchBundledSwf, fetchGameIndex } from './bundled';
import { ingestFiles } from './assets';
import { BUNDLED_DIR, bundledSet, bundledSwfNames } from './__tests__/bundledSet';

const ROOT = BUNDLED_DIR;
const realFetch = globalThis.fetch;

/** Serve game-files/** from disk so the bundled loader runs unmodified. */
function fsFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input).replace(/[?#].*$/, '');
  const path = resolve(ROOT, url.replace(/^\//, ''));
  try {
    const bytes = readFileSync(path);
    return Promise.resolve(new Response(bytes, { status: 200 }));
  } catch {
    return Promise.resolve(new Response('not found', { status: 404 }));
  }
}

describe('bundled game sets', () => {
  beforeAll(() => { globalThis.fetch = fsFetch as typeof fetch; });
  afterAll(() => { globalThis.fetch = realFetch; });

  it('resolves the index to the default game set, whose entries are the shipped files', async () => {
    const games = await fetchGameIndex();
    expect(games.length).toBeGreaterThan(0);
    const set = games.find((g) => g.id === bundledSet().id);
    expect(set, 'the default game set is listed').toBeTruthy();
    expect(set!.main).toBe(bundledSet().main);
    expect(set!.swfs.map((e) => e.name)).toEqual(bundledSwfNames());
    // …and every SWF of the set is reachable from the public root
    for (const entry of set!.swfs) expect(entry.path.split('/').pop()).toBe(`${entry.name}.swf`);
  });

  it('parses every SWF of the set into its scripts, fonts and sounds, and ingests it', async () => {
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
