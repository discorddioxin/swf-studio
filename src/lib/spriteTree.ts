import type { SwfDocument, SwfCharacter } from '../types';

export type SpriteTreeScope = 'local' | 'global';

export interface SpriteTreeNode {
  /** Path-based key: shared sprites can appear beneath each global parent. */
  key: string;
  characterId: number;
  parentTimelineIds: string[];
  children: SpriteTreeNode[];
}

export interface SpriteUsageGraph {
  sprites: Map<number, SwfCharacter>;
  parentTimelineIds: Map<number, string[]>;
  childSpriteIds: Map<string, number[]>;
}

/**
 * Build a distinct-parent graph for multi-frame DefineSprite assets. Multiple
 * placements of one sprite in the same timeline count as one parent; using the
 * same sprite from two different timelines makes it global/shared.
 */
export function analyzeSpriteUsage(doc: SwfDocument): SpriteUsageGraph {
  const sprites = new Map<number, SwfCharacter>();
  for (const character of doc.characters.values()) {
    if (character.kind !== 'sprite') continue;
    const timelineFrames = character.timelineId ? doc.timelines.get(character.timelineId)?.frameCount ?? 0 : 0;
    if (Math.max(character.frameCount ?? 0, timelineFrames) <= 1) continue;
    sprites.set(character.id, character);
  }

  const parents = new Map<number, Set<string>>([...sprites.keys()].map((id) => [id, new Set<string>()]));
  const childSpriteIds = new Map<string, number[]>();
  for (const timeline of doc.timelines.values()) {
    const children = new Set<number>();
    for (const frame of timeline.frames) {
      for (const item of frame.display) {
        if (sprites.has(item.characterId)) children.add(item.characterId);
      }
    }
    if (!children.size) continue;
    childSpriteIds.set(timeline.id, [...children].sort((a, b) => a - b));
    for (const id of children) parents.get(id)?.add(timeline.id);
  }

  return {
    sprites,
    parentTimelineIds: new Map([...parents].map(([id, ids]) => [id, [...ids].sort((a, b) => {
      if (a === 'root') return -1;
      if (b === 'root') return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    })])),
    childSpriteIds,
  };
}

/**
 * Produce a forest containing only the requested scope. Local sprites have at
 * most one distinct parent timeline; global sprites have two or more. A shared
 * child is deliberately repeated under each visible global parent so the tree
 * shows where it is reused.
 */
export function buildSpriteTree(doc: SwfDocument, graph: SpriteUsageGraph, scope: SpriteTreeScope): SpriteTreeNode[] {
  const ids = [...graph.sprites.keys()].filter((id) => {
    const count = graph.parentTimelineIds.get(id)?.length ?? 0;
    return scope === 'local' ? count <= 1 : count > 1;
  });
  const included = new Set(ids);
  const parentSpriteIds = (id: number) => (graph.parentTimelineIds.get(id) ?? [])
    .map((timelineId) => doc.timelines.get(timelineId))
    .filter((timeline) => timeline?.kind === 'sprite' && timeline.characterId != null)
    .map((timeline) => timeline!.characterId!)
    .filter((parentId) => included.has(parentId));

  const roots = ids.filter((id) => parentSpriteIds(id).length === 0);
  const covered = new Set<number>();
  const build = (id: number, path: string, ancestors: Set<number>): SpriteTreeNode => {
    covered.add(id);
    const nextAncestors = new Set(ancestors).add(id);
    const timelineId = graph.sprites.get(id)?.timelineId ?? `sprite:${id}`;
    const children = (graph.childSpriteIds.get(timelineId) ?? [])
      .filter((childId) => included.has(childId) && !nextAncestors.has(childId))
      .map((childId) => build(childId, `${path}/${childId}`, nextAncestors));
    return {
      key: path,
      characterId: id,
      parentTimelineIds: graph.parentTimelineIds.get(id) ?? [],
      children,
    };
  };

  const forest = roots.map((id) => build(id, String(id), new Set<number>()));
  // A malformed or cyclic SWF graph may have a component with no natural root.
  // Surface it rather than silently omitting those sprites, and stop recursion
  // at the first repeated id in that path.
  for (const id of ids) {
    if (!covered.has(id)) forest.push(build(id, String(id), new Set<number>()));
  }
  return forest;
}
