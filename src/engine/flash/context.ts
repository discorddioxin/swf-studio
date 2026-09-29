// The link between the flash.* classes and the running player.
//
// AS3 classes are constructed with plain `new Foo()` from transpiled code, so
// they cannot receive the player as a constructor argument. The player that
// is currently running registers itself here; the display classes read their
// symbol data, time, input and error reporting through it. Only one player is
// active at a time (the Execute tab), and tests create/dispose their own.

import type { EventDispatcher } from './events';

/** What the flash.* classes need from the player. Implemented by FlashPlayer. */
export interface PlayerContext {
  /** Milliseconds of player time since start (pauses with the player). */
  readonly time: number;
  listenerAdded(target: EventDispatcher, type: string): void;
  listenerRemoved(target: EventDispatcher, type: string): void;
  reportError(error: unknown, where: string): void;
  trace(message: string): void;
}

interface Runtime {
  player: (PlayerContext & Record<string, unknown>) | null;
  /** Run a callback from game code, reporting (not propagating) errors. */
  guard<T>(fn: () => T, where: string): T | undefined;
}

export const runtime: Runtime = {
  player: null,
  guard(fn, where) {
    try {
      return fn();
    } catch (error) {
      if (error instanceof ScriptAbort) throw error;
      if (runtime.player) runtime.player.reportError(error, where);
      else throw error;
      return undefined;
    }
  },
};

/** Thrown to unwind game code (e.g. script timeout); never swallowed by guard. */
export class ScriptAbort extends Error {}
