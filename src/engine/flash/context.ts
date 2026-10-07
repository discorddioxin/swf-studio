// The link between the flash.* classes and the running player.
//
// AS3 classes are constructed with plain `new Foo()` from transpiled code, so
// they cannot receive the player as a constructor argument. The player that
// is currently running registers itself here; the display classes read their
// symbol data, time, input and error reporting through it. Only one player is
// active at a time (the Execute tab), and tests create/dispose their own.

import type { LogSource, NetworkEvent } from './player';
import type { EventDispatcher } from './events';

/** What the flash.* classes need from the player. Implemented by FlashPlayer. */
export interface PlayerContext {
  /** Milliseconds of player time since start (pauses with the player). */
  readonly time: number;
  listenerAdded(target: EventDispatcher, type: string): void;
  listenerRemoved(target: EventDispatcher, type: string): void;
  reportError(error: unknown, where: string, source?: LogSource): void;
  trace(message: string): void;
  recordNetwork?(event: NetworkEvent): void;
}

interface Runtime {
  player: (PlayerContext & Record<string, unknown>) | null;
  /** Run a callback from game code, reporting (not propagating) errors. */
  guard<T>(fn: () => T, where: string, source?: LogSource): T | undefined;
}

export const runtime: Runtime = {
  player: null,
  guard(fn, where, source = 'app') {
    const player = runtime.player;
    try {
      const result = fn();
      if (result && typeof (result as { then?: unknown }).then === 'function') {
        // EventDispatcher intentionally does not await listeners. Attach a
        // rejection handler here so async game handlers reach Problems too,
        // instead of escaping as an unhandled browser rejection.
        return Promise.resolve(result).catch((error: unknown) => {
          if (error instanceof ScriptAbort) return undefined;
          if (player) player.reportError(error, where, source);
          else throw error;
        }) as unknown as typeof result;
      }
      return result;
    } catch (error) {
      if (error instanceof ScriptAbort) throw error;
      if (player) player.reportError(error, where, source);
      else throw error;
      return undefined;
    }
  },
};

/** Thrown to unwind game code (e.g. script timeout); never swallowed by guard. */
export class ScriptAbort extends Error {}
