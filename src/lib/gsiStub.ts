// Offline stub for Gaia's GSI service (www.<gsiUrl>.gaiaonline.com).
//
// The bundled Gaia Fishing game asks GSI for the player's inventory (baits,
// rods), the room list and scores. Offline those calls cannot be answered by
// the real server, so As2Execute routes fetchText through here: every request
// is logged to the game console, inventory-shaped requests get a LoadVars
// reply granting 25 of every bait and every rod (guest kit), and anything
// else gets a benign ok envelope.

/** Grade F / D / A Fish Bait — the three baits of the Gaia fishing shops. */
export const GUEST_BAITS = ['gradeF', 'gradeD', 'gradeA'] as const;
/** Basic / Strength / Performance / Distance rods + their PLUS upgrades. */
export const GUEST_RODS = [
  'basic', 'strength', 'performance', 'distance',
  'basic_plus', 'strength_plus', 'performance_plus', 'distance_plus',
] as const;

export function isGsiUrl(url: string): boolean {
  return /gaiaonline\.com\b/i.test(url) || /(^|[/?&.])gsi([/?&.=]|$)/i.test(url);
}

/** LoadVars-style reply: 25 of every bait, every rod unlocked. */
export function gsiInventoryResponse(): string {
  const parts = ['error=0', 'success=1', 'status=ok', 'guest=1'];
  for (const bait of GUEST_BAITS) parts.push(`bait_${bait}=25`, `${bait}_bait=25`);
  for (const rod of GUEST_RODS) parts.push(`rod_${rod}=1`);
  parts.push(`baits=${GUEST_BAITS.join(',')}`, `rods=${GUEST_RODS.join(',')}`);
  return parts.join('&');
}

const INVENTORY_RE = /inventor|item|bait|rod|loadout|bucket|gear|equipped|(^|[^a-z])inv([^a-z]|$)/i;

export interface GsiStubLogger {
  (level: 'info' | 'warn', message: string, detail?: string): void;
}

/**
 * fetchText replacement: answers GSI/inventory requests offline, warns on
 * every other network attempt (nothing is reachable from the sandbox anyway).
 */
export async function gsiStubFetchText(
  url: string,
  method: string,
  body: string | null,
  log?: GsiStubLogger,
): Promise<string | null> {
  const base = typeof location !== 'undefined' && location.href ? location.href : 'http://localhost/';
  const target = (() => { try { return new URL(url, base).href; } catch { return url; } })();
  if (!isGsiUrl(target)) {
    log?.('warn', `network request not available offline: ${method} ${target}`, body ?? undefined);
    return null;
  }
  const probe = `${target} ${body ?? ''}`;
  const inventory = INVENTORY_RE.test(probe);
  log?.('info', `GSI stub ${method} ${target}${inventory ? ' → inventory reply (25× bait, all rods)' : ' → ok reply'}`, body ?? undefined);
  if (inventory) return gsiInventoryResponse();
  return 'error=0&success=1&status=ok';
}
