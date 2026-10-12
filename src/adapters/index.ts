// Adapter registry: pick the game adapter for a loaded SWF set.
//
// Resolution is by score — an explicit id (`GameContext.declaredId`, from the
// bundled manifest or the user's pick in the Execute tab) wins, then each
// adapter's own detection, then the generic fallback. Unknown games therefore
// always resolve to `generic` and run exactly as authored.

import { genericAdapter } from './generic';
import { gaiaFishingAdapter } from './gaiaFishing';
import type { GameAdapter, GameContext } from './types';

export type { AdapterNetwork, AdapterSwf, BootPreset, GameAdapter, GameContext } from './types';
export { genericAdapter } from './generic';
export { gaiaFishingAdapter } from './gaiaFishing';

/** Every adapter the app can select, in menu order (generic last as fallback). */
export const GAME_ADAPTERS: readonly GameAdapter[] = [gaiaFishingAdapter, genericAdapter];

export const DEFAULT_ADAPTER_ID = genericAdapter.id;

export function adapterById(id: string | null | undefined): GameAdapter | undefined {
  if (!id || id === 'auto') return undefined;
  return GAME_ADAPTERS.find((a) => a.id === id);
}

/** Highest-scoring adapter for this context, or the generic fallback. */
export function resolveAdapter(ctx: GameContext, preferredId?: string | null): GameAdapter {
  const preferred = adapterById(preferredId);
  if (preferred && preferred.id !== 'auto') {
    // An explicit pick only needs to apply; detection is informational then.
    return preferred;
  }
  let best: GameAdapter | null = null;
  let bestScore = 0;
  for (const adapter of GAME_ADAPTERS) {
    let score = 0;
    try { score = adapter.detect(ctx) || 0; } catch { score = 0; }
    if (score > bestScore) { best = adapter; bestScore = score; }
  }
  return best ?? genericAdapter;
}

/** Score table for the UI ("auto → <adapter label> (72)"). */
export function adapterScores(ctx: GameContext): { adapter: GameAdapter; score: number }[] {
  return GAME_ADAPTERS.map((adapter) => {
    let score = 0;
    try { score = adapter.detect(ctx) || 0; } catch { score = 0; }
    return { adapter, score };
  }).sort((a, b) => b.score - a.score);
}
