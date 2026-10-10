import { describe, expect, it } from 'vitest';
import { routeAsset } from './assetRouter';

describe('assetRouter', () => {
  it('routes isolated shape to actor', () => {
    const fanIn = new Map<number, Set<number>>([[12, new Set([9])]]);
    const actorForTimeline = new Map([[9, 'fish']]);
    expect(routeAsset(12, fanIn, actorForTimeline)).toEqual({ actor: 'fish' });
  });
  it('keeps shared shape in shared/', () => {
    const fanIn = new Map<number, Set<number>>([[6, new Set([0,28,18])]]);
    const actorForTimeline = new Map([[28, 'themap']]);
    expect(routeAsset(6, fanIn, actorForTimeline)).toBe('shared');
  });
});
