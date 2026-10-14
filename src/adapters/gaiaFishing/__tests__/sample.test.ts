// The sample module's contract with the data it ships.
//
// `sample.ts` is the one place in the repo where this sample's names are
// spelled out; `game-files/manifest.json` → `games/<id>.json` is the one place
// that says what actually ships. This test keeps the two in sync and proves the
// files it names exist, so the adapter can never drift from its own data.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SAMPLE_CHAT, SAMPLE_EXPORTED_NAMES, SAMPLE_GAME_SET_ID, SAMPLE_MAIN, SAMPLE_PIER, SAMPLE_SCENE,
  SAMPLE_EXTERNAL_DIR, SAMPLE_SERVICE, SAMPLE_SWF_NAMES, SAMPLE_TRACKING, sampleExportDir, sampleSwfPath,
} from '../sample';

// `sample.ts` paths are repo-relative (`game-files/…`); the manifest's own
// paths are public-root-relative (`fish-full/…`).
const ROOT = resolve(__dirname, '../../../..');
const DATA = resolve(ROOT, 'game-files');

interface SetEntry {
  name: string;
  path: string;
}
interface GameSet {
  id: string;
  label?: string;
  adapter?: string;
  main?: string;
  swfs: SetEntry[];
}

const read = <T,>(relative: string): T => JSON.parse(readFileSync(resolve(DATA, relative), 'utf8')) as T;

describe('sample facts vs the shipped data', () => {
  const manifest = read<{ default?: string; games?: (string | GameSet)[] }>('manifest.json');
  const set = read<GameSet>(`games/${SAMPLE_GAME_SET_ID}.json`);

  it('is the index default and the index lists it by path', () => {
    expect(manifest.default).toBe(SAMPLE_GAME_SET_ID);
    expect(manifest.games).toContain(`games/${SAMPLE_GAME_SET_ID}.json`);
  });

  it('names agree with the game set', () => {
    expect(set.id).toBe(SAMPLE_GAME_SET_ID);
    expect(set.main).toBe(SAMPLE_MAIN);
    expect(set.adapter).toBe('gaia-fishing');
    expect(set.swfs.map((entry) => entry.name)).toEqual([...SAMPLE_SWF_NAMES]);
    expect(SAMPLE_SWF_NAMES[0]).toBe(SAMPLE_MAIN);
    expect(SAMPLE_SWF_NAMES).toEqual(expect.arrayContaining([SAMPLE_SERVICE, SAMPLE_CHAT, SAMPLE_TRACKING, SAMPLE_SCENE, SAMPLE_PIER]));
  });

  it('every SWF is on disk', () => {
    for (const name of SAMPLE_SWF_NAMES) {
      expect(existsSync(resolve(ROOT, sampleSwfPath(name))), name).toBe(true);
    }
  });

  it('exported names are exactly the SWFs with a committed FFDec XML export', () => {
    for (const name of SAMPLE_SWF_NAMES) {
      const exported = (SAMPLE_EXPORTED_NAMES as readonly string[]).includes(name);
      expect(existsSync(resolve(ROOT, sampleExportDir(name), `${name}.xml`)), `${name} export`).toBe(exported);
    }
  });

  it('the set names SWFs and nothing else: every other file comes out of the SWFs', () => {
    for (const entry of set.swfs) expect(Object.keys(entry).sort(), entry.name).toEqual(['name', 'path']);
  });

  it('FFDec exports are test oracles outside the served root, never part of the app', () => {
    expect(SAMPLE_EXTERNAL_DIR.startsWith('game-files/')).toBe(false);
    expect(existsSync(resolve(ROOT, sampleExportDir(SAMPLE_SERVICE), `${SAMPLE_SERVICE}.xml`))).toBe(true);
    expect(existsSync(resolve(DATA, 'fish-full/external'))).toBe(false);
  });
});
