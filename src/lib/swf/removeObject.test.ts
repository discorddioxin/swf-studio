// P-09: RemoveObject (tag 5) is `UI16 CharacterId, UI16 Depth`; RemoveObject2
// (tag 28) is `UI16 Depth` (SWF 19, "RemoveObject", "RemoveObject2").
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from './binary';
import { tag, writeSwf, type SwfTag } from '@/testing/swfWriter';

async function frames(tags: SwfTag[]) {
  const swf = writeSwf({ version: 8, tags: [...tags, tag.end()] });
  const { doc } = await parseSwfBinary(swf.buffer as ArrayBuffer, 'remove.swf');
  return doc.root.frames;
}

describe('removing a placed object', () => {
  it('RemoveObject (tag 5) removes the object at its depth, not at its character id', async () => {
    // character 7 at depth 3, and character 3 at depth 7 — the old reading took
    // the character id (7) as the depth and removed the wrong object
    const f = await frames([
      tag.placeObject2(3, 7), tag.placeObject2(7, 3), tag.showFrame(),
      tag.removeObject(7, 3), tag.showFrame(),
    ]);
    expect(f[0].display.map((d) => [d.depth, d.characterId])).toEqual([[3, 7], [7, 3]]);
    expect(f[1].display.map((d) => [d.depth, d.characterId])).toEqual([[7, 3]]);
    expect(f[1].ops).toEqual([expect.objectContaining({ op: 'remove', depth: 3, characterId: 7 })]);
  });

  it('RemoveObject2 (tag 28) removes the object at its depth', async () => {
    const f = await frames([tag.placeObject2(3, 7), tag.showFrame(), tag.removeObject2(3), tag.showFrame()]);
    expect(f[1].display).toEqual([]);
  });
});
