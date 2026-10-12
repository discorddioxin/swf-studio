// @vitest-environment jsdom
// Bundled game sets: the public index (manifest.json) → one JSON per game →
// the .swf files of that game, each parsed and completed with its committed
// fonts / readable script overrides. The shipped data is the fixture and the
// subject: nothing here knows a game's name.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundledFilePath, fetchBundledManifest, fetchBundledSwf, fetchGameIndex } from './bundled';
import { ingestFiles } from './assets';
import { readAS2Text } from '../engine/as2/useAS2Build';
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

  it('normalises extra-file paths from the manifest (fileBase or /<name>/)', () => {
    expect(bundledFilePath({ name: 'chat', path: 'x/chat.swf', fileBase: 'x/ext/chat' }, 'x/ext/chat/fonts/f.ttf')).toBe('fonts/f.ttf');
    expect(bundledFilePath({ name: 'chat', path: 'x/chat.swf' }, 'x/external/chat/fonts/f.ttf')).toBe('fonts/f.ttf');
    expect(bundledFilePath({ name: 'chat', path: 'x/chat.swf' }, 'elsewhere/f.ttf')).toBe('f.ttf');
  });

  it('parses every SWF of the set, ingests it, and completes fonts + script overrides', async () => {
    const entries = await fetchBundledManifest();
    expect(entries.length).toBe(bundledSwfNames().length);

    for (const entry of entries) {
      const { doc, files } = await fetchBundledSwf(entry);
      expect(doc.header.fileName, `${entry.name} fileName`).toBe(`${entry.name}.swf`);
      expect(doc.timelines.size, `${entry.name} timelines`).toBeGreaterThan(0);

      // committed ttf fonts land in the package under the path the manifest implies
      for (const fontPath of entry.fonts ?? []) {
        const relative = `${entry.name}/${bundledFilePath(entry, fontPath)}`;
        expect(files.some((f) => f.webkitRelativePath === relative), `${entry.name}: ${relative}`).toBe(true);
      }
      // readable script overrides replace the synthetic bytecode source verbatim
      for (const override of entry.scriptOverrides ?? []) {
        const target = override.target.replace(/\\/g, '/');
        const file = files.find((f) => f.webkitRelativePath === `${entry.name}/${target}`);
        expect(file, `${entry.name} carries ${target}`).toBeTruthy();
        expect(await readAS2Text(file!), `${entry.name} ${target} content`).toBe(readFileSync(resolve(ROOT, override.path), 'utf8'));
      }

      const bundle = ingestFiles(files);
      // asset categories survive the synthetic-File bridge
      const cats = new Set(bundle.files.map((f) => f.category));
      expect(cats.has('other'), `${entry.name} categories: ${[...cats]}`).toBe(false);
      expect(bundle.files.some((f) => /\.as$/i.test(f.path)), `${entry.name} has scripts`).toBe(true);
    }
  }, 60000);
});
