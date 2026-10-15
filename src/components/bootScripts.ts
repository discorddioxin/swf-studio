// AS2 boot scripts: a few lines of JavaScript the developer runs on `_root`
// after frame 1 (see As2Execute). A script is written for one game, so it is
// stored per game: per adapter and per main SWF. A script saved while playing
// one game must never run in another.
//
// Before P-26 there was one global script (`swf-studio.as2.boot`). It is
// migrated the first time a game is opened:
//   - empty: deleted;
//   - one of this adapter's presets: moved to this game, silently;
//   - another adapter's preset: left for that adapter to pick up;
//   - anything else: kept as an *unassigned* script, which never runs. The tab
//     offers "use for this game" or "discard".

export const LEGACY_BOOT_KEY = 'swf-studio.as2.boot';

/** The storage key of one game's boot script. */
export const bootKey = (adapterId: string, mainSwf: string) => `${LEGACY_BOOT_KEY}:${adapterId}:${mainSwf}`;

const storage = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const get = (key: string): string | null => { try { return storage()?.getItem(key) ?? null; } catch { return null; } };
const set = (key: string, value: string | null) => {
  try { if (value) storage()?.setItem(key, value); else storage()?.removeItem(key); } catch { /* storage unavailable */ }
};

export function readBoot(key: string): string { return get(key) ?? ''; }
/** Save a game's script; an empty script removes the entry. */
export function writeBoot(key: string, code: string): void { set(key, code.trim() ? code : null); }

/**
 * Run the one-time move of the pre-P-26 global script for the game at `key`.
 * `presets` are the current adapter's preset scripts, `allPresets` every
 * adapter's. Returns the legacy script if it stays unassigned.
 */
export function migrateLegacyBoot(key: string, presets: readonly string[], allPresets: readonly string[]): string | null {
  const legacy = get(LEGACY_BOOT_KEY);
  if (legacy === null) return null;
  const code = legacy.trim();
  if (!code) { set(LEGACY_BOOT_KEY, null); return null; }
  if (presets.includes(code)) {
    if (!readBoot(key)) writeBoot(key, legacy);
    set(LEGACY_BOOT_KEY, null);
    return null;
  }
  if (allPresets.includes(code)) return null;
  return legacy;
}

/** Make the unassigned legacy script this game's script. */
export function assignLegacyBoot(key: string): string {
  const legacy = get(LEGACY_BOOT_KEY) ?? '';
  writeBoot(key, legacy);
  set(LEGACY_BOOT_KEY, null);
  return legacy;
}

export function discardLegacyBoot(): void { set(LEGACY_BOOT_KEY, null); }
