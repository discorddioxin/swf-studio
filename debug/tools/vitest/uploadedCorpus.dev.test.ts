// Corpus check against the game SWFs the project owner uploaded to the
// `swf-uploads` branch of https://github.com/discorddioxin/swf-forge
// (`games-swfs/`): six game sets, 43 files, v6–v24, 376 filter lists. These are
// *real* files from outside this repo, which is what makes them worth running:
// the bundled fixtures here are `xmlToSwf` output and cannot catch a mistake
// that writer and reader share.
//
//   git clone --depth 1 --branch swf-uploads https://github.com/discorddioxin/swf-forge /tmp/swf-forge
//   npx vitest run debug/tools/vitest/uploadedCorpus.dev.test.ts
//
// The corpus is not vendored here (12 MB, third-party game data). Point at it
// with SWF_CORPUS=/path/to/games-swfs or drop it in one of the default
// locations; the test skips itself when it is absent.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';

const CANDIDATES = [
  process.env.SWF_CORPUS,
  '/tmp/swf-forge/games-swfs',
  resolve(__dirname, '../../../../swf-forge/games-swfs'),
  join(homedir(), 'swf-forge/games-swfs'),
].filter((p): p is string => !!p);

const CORPUS = CANDIDATES.find((dir) => existsSync(dir));

/** Structural mistakes the parser reports instead of staying silent. */
const STRUCTURAL = /left after the last field|records end at byte|unknown filter/;

describe.skipIf(!CORPUS)('uploaded game corpus', () => {
  const sets = CORPUS ? readdirSync(CORPUS).sort() : [];

  it('parses every SWF without throwing', async () => {
    const failures: string[] = [];
    let files = 0;
    for (const set of sets) {
      const dir = join(CORPUS!, set);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir).filter((f) => f.endsWith('.swf')).sort()) {
        files++;
        const b = readFileSync(join(dir, name));
        try {
          await parseSwfBinary(
            b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, name,
          );
        } catch (e) {
          failures.push(`${set}/${name}: ${(e as Error).message}`);
        }
      }
    }
    expect(files).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 600000);

  it('reports no structural problem in any of them', async () => {
    const reports: string[] = [];
    for (const set of sets) {
      const dir = join(CORPUS!, set);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir).filter((f) => f.endsWith('.swf')).sort()) {
        const b = readFileSync(join(dir, name));
        const { doc } = await parseSwfBinary(
          b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, name,
        );
        for (const w of doc.warnings) if (STRUCTURAL.test(w)) reports.push(`${set}/${name}: ${w}`);
      }
    }
    expect(reports).toEqual([]);
  }, 600000);
});
