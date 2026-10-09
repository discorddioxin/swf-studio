// Shared AS2 engine constants — extracted to break the player ↔ builtins circular.
// Both `player.ts` (DisplayNode lifecycle) and `builtins.ts` (attachMovie/duplicateMovieClip) need the same depth offset, twip scale and NODE symbol.
// Keeping them here makes the dependency one-way (both import from constants, neither imports the other for values).

export const TWIPS = 20;
/** AS depth = SWF depth − DEPTH_OFFSET (timeline objects have negative AS depths) */
export const DEPTH_OFFSET = 16384;
export const NODE = Symbol.for('swf-studio.as2.node');

/** Retrieve the DisplayNode attached to an AS2 object (via NODE symbol). Safe for any value. */
export const nodeOf = (o: unknown): any =>
  o && (typeof o === 'object' || typeof o === 'function') ? ((o as any)[NODE] as any) ?? null : null;
