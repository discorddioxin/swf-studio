// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchBundledManifest, fetchBundledSwf } from './bundled';
import { ingestFiles } from './assets';

const ROOT = resolve(__dirname, '../../game-files');
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

describe('bundled SWFs', () => {
  beforeAll(() => { globalThis.fetch = fsFetch as typeof fetch; });
  afterAll(() => { globalThis.fetch = realFetch; });

  it('manifest lists every bundled .swf and they all parse + ingest', async () => {
    const entries = await fetchBundledManifest();
    expect(entries.length).toBeGreaterThanOrEqual(6);
    const names = entries.map((e) => e.name);
    expect(names).toContain('bassken_overview');
    expect(names).toContain('gsecs2.9');

    for (const entry of entries) {
      const { doc, files } = await fetchBundledSwf(entry);
      expect(doc.header.fileName, `${entry.name} fileName`).toBe(`${entry.name}.swf`);
      expect(doc.timelines.size, `${entry.name} timelines`).toBeGreaterThan(0);
      const bundle = ingestFiles(files);
      // asset categories survive the synthetic-File bridge
      const cats = new Set(bundle.files.map((f) => f.category));
      expect(cats.has('other'), `${entry.name} categories: ${[...cats]}`).toBe(false);
      expect(bundle.files.some((f) => /\.as$/i.test(f.path)), `${entry.name} has scripts`).toBe(true);
    }
  }, 60000);
});
