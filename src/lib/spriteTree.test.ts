import { describe, expect, it } from 'vitest';
import type { Frame, SwfCharacter, SwfDocument, Timeline } from '../types';
import { analyzeSpriteUsage, buildSpriteTree } from './spriteTree';

function fixture(): SwfDocument {
  const characters = new Map<number, SwfCharacter>([
    [1, { id: 1, kind: 'sprite', tagType: 'DefineSpriteTag', frameCount: 3, timelineId: 'sprite:1', uses: [], attrs: {} }],
    [2, { id: 2, kind: 'sprite', tagType: 'DefineSpriteTag', frameCount: 4, timelineId: 'sprite:2', uses: [], attrs: {} }],
    [3, { id: 3, kind: 'sprite', tagType: 'DefineSpriteTag', frameCount: 2, timelineId: 'sprite:3', uses: [], attrs: {} }],
    [4, { id: 4, kind: 'sprite', tagType: 'DefineSpriteTag', frameCount: 1, timelineId: 'sprite:4', uses: [], attrs: {} }],
  ]);
  const frame = (index: number, ids: number[]): Frame => ({
    index,
    ops: [],
    events: [],
    special: false,
    kinds: [],
    display: ids.map((characterId, depth) => ({
      depth,
      characterId,
      matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      ratio: 0,
      startFrame: 0,
    })),
  });
  const root: Timeline = {
    id: 'root', kind: 'root', name: 'Main Timeline', frameCount: 2,
    frames: [frame(0, [1, 2, 2, 4]), frame(1, [2])],
  };
  const timelines = new Map<string, Timeline>([
    ['root', root],
    ['sprite:1', { id: 'sprite:1', kind: 'sprite', characterId: 1, name: 'Parent A', frameCount: 3, frames: [frame(0, [2, 3])] }],
    ['sprite:2', { id: 'sprite:2', kind: 'sprite', characterId: 2, name: 'Parent B', frameCount: 4, frames: [frame(0, [3])] }],
    ['sprite:3', { id: 'sprite:3', kind: 'sprite', characterId: 3, name: 'Nested child', frameCount: 2, frames: [frame(0, [])] }],
    ['sprite:4', { id: 'sprite:4', kind: 'sprite', characterId: 4, name: 'Single frame', frameCount: 1, frames: [frame(0, [])] }],
  ]);
  return {
    header: { frameRate: 24, frameCount: 2, stage: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }, fileName: 'fixture.swf' },
    characters,
    timelines,
    root,
    warnings: [],
    stats: { tags: 0, unknownTags: {} },
  };
}

describe('sprite tree usage graph', () => {
  it('counts distinct parent timelines and ignores one-frame sprites', () => {
    const doc = fixture();
    const graph = analyzeSpriteUsage(doc);

    expect(graph.parentTimelineIds.get(2)).toEqual(['root', 'sprite:1']);
    expect(graph.parentTimelineIds.get(3)).toEqual(['sprite:1', 'sprite:2']);
    expect(graph.sprites.has(4)).toBe(false);
  });

  it('separates local and global sprites while preserving nested shared branches', () => {
    const doc = fixture();
    const graph = analyzeSpriteUsage(doc);
    const local = buildSpriteTree(doc, graph, 'local');
    const global = buildSpriteTree(doc, graph, 'global');

    expect(local.map((node) => node.characterId)).toEqual([1]);
    expect(local[0].children).toEqual([]);
    expect(global.map((node) => node.characterId)).toEqual([2]);
    expect(global[0].children.map((node) => node.characterId)).toEqual([3]);
  });
});
