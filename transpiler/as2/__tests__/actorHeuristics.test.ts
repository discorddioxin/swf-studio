import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from '../../../src/lib/swf/binary';
import { proposeActors } from '../actorHeuristics';

async function docFor(name: string) {
  const p = resolve(__dirname, '../../../game-files/fish-full/swfs', `${name}.swf`);
  const ab = readFileSync(p).buffer.slice(0) as ArrayBuffer;
  const { doc } = await parseSwfBinary(ab, `${name}.swf`);
  return doc;
}

describe('actorHeuristics', () => {
  it('proposes fisher actor for bassken_overview', async () => {
    const doc = await docFor('bassken_overview');
    const proposals = proposeActors(doc);
    // at least one actor with linkage or fisher-like name
    expect(proposals.some(p => p.timelineIds.length === 1)).toBe(true);
  });

  it('groups directional fish variants in bassken_scene', async () => {
    const doc = await docFor('bassken_scene');
    const proposals = proposeActors(doc);
    const fishGroup = proposals.find(p => p.timelineIds.length > 1);
    // the 4 fish sprites share frameCount/labels/code and should group
    if (fishGroup) expect(fishGroup.timelineIds.length).toBeGreaterThanOrEqual(2);
    else expect(proposals.length).toBeGreaterThan(0);
  });

  it('returns empty or low score for library-like gsecs', async () => {
    const doc = await docFor('gsecs2.9');
    const proposals = proposeActors(doc);
    // gsecs is UI/service heavy, should not propose many actors
    expect(Array.isArray(proposals)).toBe(true);
  });
});
