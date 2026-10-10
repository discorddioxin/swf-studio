// P7: Asset inlining policy — per-actor vs shared
// Rule: if asset is used by only one actor candidate (fanIn==1 and owner is actor) → actors/<name>/assets/, else shared/
export type AssetRoute = 'shared' | { actor: string };

export function routeAsset(assetId: number, fanIn: Map<number, Set<number>>, actorForTimeline: Map<number, string>): AssetRoute {
  const owners = fanIn.get(assetId);
  if (!owners || owners.size !== 1) return 'shared';
  const ownerId = [...owners][0];
  const actor = actorForTimeline.get(ownerId);
  return actor ? { actor } : 'shared';
}

export function assetFanIn(doc: { timelines: Map<string, { frames: { display: { characterId: number }[] }[] }> }): Map<number, Set<number>> {
  const m = new Map<number, Set<number>>();
  for (const tl of doc.timelines.values()) {
    const id = (tl as any).characterId ?? 0;
    for (const f of (tl as any).frames) for (const d of f.display) {
      const s = m.get(d.characterId) ?? new Set<number>();
      s.add(id);
      m.set(d.characterId, s);
    }
  }
  return m;
}
