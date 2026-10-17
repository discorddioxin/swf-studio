// @vitest-environment jsdom
// Lossless bitmap decode vs FFDec's PNG exports (the oracle): same pixels for
// palette (fmt3), 15-bit (fmt4) and 24/32-bit (fmt5) bitmaps, with Lossless2
// premultiplication matching FFDec's PNG output. Runs with an FFDec export
// folder (SWF_FFDEC, see src/testing/corpusPaths.ts) and skips without one; the
// spec-level checks that always run are in lossless.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSwfXml } from '../parser';
import { parseSwfBinary } from './binary';
import { decodePng } from '@/testing/png';
import { xmlToSwf } from '../../../tools/xml2swf/xml2swf.mjs';
import { FFDEC_EXPORT_HOWTO, ffdecExportNames, ffdecExports } from '@/testing/corpus';

const EXTERNAL = ffdecExports() ?? '';

/** FFDec appends export names: `1_ic_warning_icon.png` → id 1. */
function oraclePng(dir: string, id: number): Buffer | null {
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => new RegExp(`^${id}(_|\\.)`).test(f) && f.endsWith('.png'));
  return hit ? readFileSync(resolve(dir, hit)) : null;
}

describe.skipIf(!EXTERNAL)(EXTERNAL ? 'lossless images vs FFDec oracle' : `lossless images vs FFDec oracle (skipped: no exports — ${FFDEC_EXPORT_HOWTO})`, () => {
  /** movies that actually carry lossless bitmaps (asserted below) */
  const verified: string[] = [];
  for (const name of ffdecExportNames()) {
    it(`${name}: decoded PNGs match the committed exports pixel-for-pixel`, async () => {
      const xml = readFileSync(resolve(EXTERNAL, name, `${name}.xml`), 'utf8');
      const xmlDoc = parseSwfXml(xml, { fileName: `${name}.xml` });
      const losslessIds = [...xmlDoc.characters.values()]
        .filter((c: any) => /DefineBitsLossless2?Tag/.test(c.tagType ?? ''))
        .map((c: any) => c.id);
      if (!losslessIds.length) return; // this movie has no lossless bitmaps
      verified.push(name);

      const bytes = Uint8Array.from(xmlToSwf(xml));
      const { files } = await parseSwfBinary(bytes.slice().buffer as ArrayBuffer, `${name}.xml`);
      const imageFiles = new Map(files.filter((f) => f.category === 'images').map((f) => [Number(f.name), f]));

      for (const id of losslessIds) {
        const oracleBuf = oraclePng(resolve(EXTERNAL, name, 'images'), id);
        if (!oracleBuf) continue; // FFDec may not export unused ids
        const mine = imageFiles.get(id);
        expect(mine, `image ${id} present in binary output`).toBeTruthy();
        const oracle = decodePng(oracleBuf);
        const decoded = decodePng(Buffer.from(mine!.bytes));
        expect(decoded.w, `id ${id} width`).toBe(oracle.w);
        expect(decoded.h, `id ${id} height`).toBe(oracle.h);
        let mismatch = -1;
        for (let i = 0; i < oracle.rgba.length; i++) {
          if (oracle.rgba[i] !== decoded.rgba[i]) { mismatch = i; break; }
        }
        if (mismatch >= 0) {
          const px = Math.floor(mismatch / 4) % oracle.w;
          const py = Math.floor(mismatch / 4 / oracle.w);
          const at = (arr: Uint8Array) => Array.from(arr.slice((py * oracle.w + px) * 4, (py * oracle.w + px) * 4 + 4));
          expect.fail(`id ${id} pixel (${px},${py}): oracle rgba=${at(oracle.rgba)} mine rgba=${at(decoded.rgba)}`);
        }
      }
    }, 30000);
  }

  it('checked at least one movie with lossless bitmaps', () => {
    expect(verified.length).toBeGreaterThan(0);
  });
});
