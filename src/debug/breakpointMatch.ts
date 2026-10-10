/** Shared breakpoint ↔ label matching for Inspector ↔ Executor synergy.
 * Both CodeWorkspace and the two players must agree on what "timelines/root.ts:5"
 * means when the player pauses with label "_root frame 1" or "timeline of Hero".
 * This module is the single source of truth — no drift between AS2 and Flash guards.
 */

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
}

/** Strict equality after normalization or suffix match (handles "src/timelines/root.ts" vs "timelines/root.ts"). */
export function pathsEqual(a: string, b: string): boolean {
  const na = normalizePath(a);
  const nb = normalizePath(b);
  return na === nb || na.endsWith('/' + nb) || nb.endsWith('/' + na);
}

export interface BreakpointLike {
  path: string;
  line: number;
  enabled: boolean;
  id: string;
}

/** AS2 labels are synthetic: "_root frame 1", "init action of sprite 10", "Sprite 10 frame 3 (Hero Ball)", "on(release) of button 40", etc. */
export function as2LabelMatchesBreakpoint(label: string, bp: BreakpointLike): boolean {
  const p = normalizePath(bp.path);
  const l = label.toLowerCase();

  // timelines/root.ts ↔ _root / main timeline
  if (p.endsWith('/timelines/root.ts') || p === 'timelines/root.ts') {
    return l.includes('_root') || l.includes('main timeline');
  }
  // timelines/* — sprite or human-named timeline (handle both "timelines/..." and "a/timelines/...")
  if (p.includes('timelines/')) {
    const mNum = p.match(/sprite[_-]?(\d+)/);
    if (mNum && l.includes(mNum[1]) && l.includes('sprite')) return true;
    if (!mNum) {
      const base = p.split('/').pop()?.replace(/\.ts$/, '') ?? '';
      if (base && base !== 'root') {
        const slug = base.replace(/_/g, ' ');
        const baseLower = base.toLowerCase();
        const slugLower = slug.toLowerCase();
        if ((l.includes(baseLower) || l.includes(slugLower)) && (l.includes('frame') || l.includes('sprite') || l.includes('init'))) {
          return true;
        }
        // fallback: human-named timelines still represent a sprite; break on any sprite frame
        if (l.includes('sprite') && (l.includes('frame') || l.includes('init'))) return true;
      }
    }
    return false;
  }
  // buttons/button_40.ts ↔ on(release) / button 40
  if (p.includes('buttons/')) {
    const m = p.match(/button[_-]?(\d+)/);
    if (m && l.includes(m[1]) && (l.includes('button') || l.includes('on(') || l.includes('onclip'))) return true;
    return false;
  }
  // init/action_1.ts or init/<linkage>.ts ↔ init action of sprite X / "name"
  if (p.includes('init/')) {
    if (!l.startsWith('init action')) return false;
    const base = p.split('/').pop()?.replace(/\.ts$/, '') ?? '';
    if (base.startsWith('action_')) return true;
    if (base && l.includes(base.toLowerCase())) return true;
    if (p.includes('init/action_')) return true;
    return false;
  }
  // classes/com/foo/Bar.ts ↔ constructor of Bar / linkage
  if (p.includes('classes/')) {
    const base = p.split('/').pop()?.replace(/\.ts$/, '') ?? '';
    return !!base && l.includes(base.toLowerCase());
  }
  return false;
}

/** Flash (AS3) where labels are "timeline of Hero", "frame 2 script of root", "constructor of com.foo.Bar", "drawing Hero" */
export function flashLabelMatchesBreakpoint(where: string, bp: BreakpointLike): boolean {
  const p = normalizePath(bp.path);
  const w = where.toLowerCase();
  if (p.endsWith('/timelines/root.ts') || p === 'timelines/root.ts') {
    return w.includes('root') || w.includes('timeline of');
  }
  const base = p.split('/').pop()?.replace(/\.ts$/, '') ?? '';
  const baseLower = base.toLowerCase();
  if ((p.includes('timelines/') || p.includes('classes/') || p.includes('buttons/')) && base) {
    return w.includes(baseLower) && (w.includes('timeline') || w.includes('frame') || w.includes('constructor') || w.includes('drawing'));
  }
  return false;
}

/** Find first enabled breakpoint matching label, honouring skip callback. */
export function findMatchingBreakpoint(
  label: string,
  breakpoints: readonly BreakpointLike[],
  shouldSkip: (bp: BreakpointLike) => boolean,
  match: (label: string, bp: BreakpointLike) => boolean,
): BreakpointLike | null {
  for (const bp of breakpoints) {
    if (!bp.enabled) continue;
    if (shouldSkip(bp)) continue;
    if (match(label, bp)) return bp;
  }
  return null;
}
