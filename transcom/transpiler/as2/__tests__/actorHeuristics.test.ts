import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from '../../../../src/lib/swf/binary';
import { sampleSwfPath, SAMPLE_LIBRARY_NAMES, SAMPLE_OVERVIEW, SAMPLE_SCENE } from '../../../../src/adapters/gaiaFishing/sample';
import { isLibraryMovie, proposeActors } from '../actorHeuristics';

const ROOT = resolve(__dirname, '../../../..');

async function docFor(name: string) {
  const buf = readFileSync(resolve(ROOT, sampleSwfPath(name)));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { doc } = await parseSwfBinary(ab, `${name}.swf`);
  return doc;
}

describe('actorHeuristics', () => {
  it('proposes an actor for the sample overview movie', async () => {
    const doc = await docFor(SAMPLE_OVERVIEW);
    const proposals = proposeActors(doc);
    expect(proposals.some(p => p.timelineIds.includes(10))).toBe(true);
  });

  it('groups the sample scene movie\'s directional variants', async () => {
    const doc = await docFor(SAMPLE_SCENE);
    const proposals = proposeActors(doc);
    const fishGroup = proposals.find(p => p.timelineIds.length === 4);
    expect(fishGroup).toBeDefined();
    expect(new Set(fishGroup!.timelineIds)).toEqual(new Set([9, 18, 19, 24]));
  });

  it('never proposes actors for library/service movies (no file names involved)', async () => {
    for (const name of SAMPLE_LIBRARY_NAMES) {
      const doc = await docFor(name);
      // the detection reads the document (sprites + linked MX symbols), not the file name
      expect(isLibraryMovie(doc), `${name} is a library movie`).toBe(true);
      expect(proposeActors(doc), `${name} proposals`).toEqual([]);
    }
    // …and a game movie of the same set is not mistaken for one
    expect(isLibraryMovie(await docFor(SAMPLE_SCENE))).toBe(false);
    expect(isLibraryMovie(await docFor(SAMPLE_OVERVIEW))).toBe(false);
  });

  it('keeps the library detection independent of the file name', async () => {
    const doc = await docFor(SAMPLE_LIBRARY_NAMES[0]);
    const renamed = { ...doc, header: { ...doc.header, fileName: 'totally-unrelated.swf' } };
    expect(isLibraryMovie(renamed)).toBe(true);
    expect(proposeActors(renamed)).toEqual([]);
  });
});
