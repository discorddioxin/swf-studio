import { useEffect, useRef, useState } from 'react';
import { normalizeAssetPath } from '../lib/assets';
import type { AssetFile } from '../types';

export interface ScriptTexts {
  /** Loaded text keyed by `normalizeAssetPath(file.path)`. */
  texts: Record<string, string>;
  /** Load failures keyed the same way (value = error message). */
  failed: Record<string, string>;
}

interface ScopedState extends ScriptTexts { scope: unknown }

const EMPTY: ScriptTexts = { texts: {}, failed: {} };

export const scriptKey = (file: AssetFile) => normalizeAssetPath(file.path);

/**
 * Loads the text of external ActionScript files (JPEXS `scripts/…/*.as`).
 *
 * - Results are tied to `scope` (the asset bundle). When the scope changes the
 *   previous texts are dropped *synchronously* and late results from the old
 *   scope are discarded, so a new folder containing a script at the same
 *   relative path can never show stale source.
 * - All files requested by one render are read together and committed in a
 *   single state update, so consumers re-analyse once instead of once per file.
 * - Read failures are reported instead of leaving the file "loading" forever.
 */
export function useScriptTexts(files: readonly (AssetFile | undefined)[], scope: unknown): ScriptTexts {
  const [state, setState] = useState<ScopedState>(() => ({ scope, ...EMPTY }));
  const requested = useRef<{ scope: unknown; keys: Set<string> }>({ scope, keys: new Set() });

  useEffect(() => {
    if (requested.current.scope !== scope) requested.current = { scope, keys: new Set() };
    const batch = new Map<string, AssetFile>();
    for (const file of files) {
      if (!file) continue;
      const key = scriptKey(file);
      if (requested.current.keys.has(key) || batch.has(key)) continue;
      batch.set(key, file);
    }
    if (!batch.size) return;
    for (const key of batch.keys()) requested.current.keys.add(key);

    const entries = [...batch.entries()];
    Promise.allSettled(entries.map(([, file]) => file.file.text())).then((results) => {
      if (requested.current.scope !== scope) return; // project changed while reading
      setState((prev) => {
        const base: ScopedState = prev.scope === scope ? prev : { scope, ...EMPTY };
        const texts = { ...base.texts };
        const failed = { ...base.failed };
        results.forEach((result, i) => {
          const key = entries[i][0];
          if (result.status === 'fulfilled') texts[key] = result.value;
          else failed[key] = result.reason instanceof Error ? result.reason.message : String(result.reason);
        });
        return { scope, texts, failed };
      });
    });
  }, [files, scope]);

  return state.scope === scope ? state : EMPTY;
}
