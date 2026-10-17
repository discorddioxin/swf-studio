// The sample module's contract with its files.
//
// `sample.ts` is the one place in the repo where this sample's names are
// spelled out; the corpus `fishing-swfs` folder is what actually exists. This
// keeps the two in sync and pins every file's SHA-256: tests that name sprite
// ids, depths or init order were written against exactly these bytes (the
// sample once shipped in `game-files/`; these hashes are those files').
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusSet, describeCorpus } from '@/testing/corpus';
import { gaiaFishingAdapter } from '..';
import {
  hasSample, SAMPLE_ADAPTER, SAMPLE_CHAT, SAMPLE_CORPUS_SET, SAMPLE_LIBRARY_NAMES, SAMPLE_MAIN, SAMPLE_OVERVIEW, SAMPLE_PIER,
  SAMPLE_SCENE, SAMPLE_SERVICE, SAMPLE_SWF_NAMES, SAMPLE_TRACKING, sampleGameSet, sampleSwfPath,
} from '../sample';

const SHA256: Record<(typeof SAMPLE_SWF_NAMES)[number], string> = {
  'bassken_game4.21': 'ed3935f6b2dc15eaa9c395287556263df5ee3a256a04259b0cb45aa4b8ee2382',
  bassken_overview: 'dc71ce4b8adc94de8c0b90f29842370be1fe46c4dfdbbd9ed2e48fc054bb6620',
  bassken_pier: '85b81f8532635613be1d23e456ae0c57a27ffc0961cea5a8dbec5255686d4f88',
  'bassken_fish4.20': '1ddf698bc4e41999d6842f92e470d58887e9db3983b2f5ea907bea61596fc070',
  bassken_scene: '9b692e6a7e43e2377f8ef5296bbf2415520cd1e7dd2e3c5f8896e8393eee65d2',
  game_chat: '506995f9dcaf9f80a0a7dd27aa805424d90fbe517ff8a2ce6e282104c26ec9cc',
  'gsecs2.9': '01e6789c2de43314f832c00b3eca33b17a550752ac313710ad8ea615fad35eff',
  OmnitureActionSource: '0e78b0e70171920f84cf5429be122cb5447dd2c6f354e676a805d36982cbc195',
};

describe('sample facts', () => {
  it('name the main movie first and every named role inside the set', () => {
    expect(SAMPLE_SWF_NAMES[0]).toBe(SAMPLE_MAIN);
    expect(new Set(SAMPLE_SWF_NAMES).size).toBe(SAMPLE_SWF_NAMES.length);
    expect(SAMPLE_SWF_NAMES).toEqual(expect.arrayContaining([SAMPLE_SERVICE, SAMPLE_CHAT, SAMPLE_TRACKING, SAMPLE_SCENE, SAMPLE_PIER, SAMPLE_OVERVIEW, ...SAMPLE_LIBRARY_NAMES]));
    expect(Object.keys(SHA256).sort()).toEqual([...SAMPLE_SWF_NAMES].sort());
  });

  it('describe a game set the bundled loader reads: names and paths only, run by this adapter', () => {
    const set = sampleGameSet();
    expect(set.adapter).toBe(SAMPLE_ADAPTER);
    expect(gaiaFishingAdapter.id).toBe(SAMPLE_ADAPTER);
    expect(set.main).toBe(SAMPLE_MAIN);
    for (const entry of set.swfs) {
      expect(Object.keys(entry).sort(), entry.name).toEqual(['name', 'path']);
      expect(entry.path.endsWith(`/${SAMPLE_CORPUS_SET}/${entry.name}.swf`)).toBe(true);
    }
  });
});

describeCorpus('the sample files', () => {
  it('are exactly the SWFs of the corpus set', () => {
    const files = corpusSet(SAMPLE_CORPUS_SET).map((path) => path.slice(path.lastIndexOf('/') + 1));
    expect(files.sort()).toEqual(SAMPLE_SWF_NAMES.map((name) => `${name}.swf`).sort());
    expect(hasSample()).toBe(true);
  });

  it('are the bytes the tests were written against (SHA-256)', () => {
    for (const name of SAMPLE_SWF_NAMES) {
      expect(createHash('sha256').update(readFileSync(sampleSwfPath(name))).digest('hex'), name).toBe(SHA256[name]);
    }
  });
}, hasSample);
