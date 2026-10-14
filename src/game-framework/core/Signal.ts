// The one way anything in a generated game talks to anything else: a signal.
//
// No actor reaches into another actor. A system owns the signals of the thing it
// simulates (the ground decides when a jump starts and ends, the input source
// decides when an action is requested), actors subscribe to the signals they care
// about, and the wiring happens once, in the game's setup — the same shape as the
// `signal` / `dispatch` declarations of the source project.

export type SignalListener<T> = (value: T) => void;

/** A typed one-to-many channel: `emit` is only called by its owner. */
export class Signal<T = void> {
  private listeners = new Set<SignalListener<T>>();

  constructor(readonly name: string) {}

  /** Subscribe. The returned function unsubscribes. */
  on(listener: SignalListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  once(listener: SignalListener<T>): () => void {
    const off = this.on((value) => { off(); listener(value); });
    return off;
  }

  off(listener: SignalListener<T>): void { this.listeners.delete(listener); }

  emit(value: T): void {
    // A listener that throws must not stop the others: a broken behaviour is one
    // actor's problem, not the frame's.
    for (const listener of [...this.listeners]) {
      try { listener(value); } catch (error) { report(error, this.name); }
    }
  }

  get size(): number { return this.listeners.size; }

  clear(): void { this.listeners.clear(); }
}

function report(error: unknown, signal: string): void {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`signal ${signal}: listener threw: ${message}`);
}

/** A hub of named signals: one per event in a game's vocabulary. */
export class Signals {
  private channels = new Map<string, Signal<never>>();

  /** Create (or fetch) a channel. Idempotent: two systems can declare the same one. */
  define<T = void>(name: string): Signal<T> {
    let channel = this.channels.get(name);
    if (!channel) { channel = new Signal<never>(name); this.channels.set(name, channel); }
    return channel as unknown as Signal<T>;
  }

  get(name: string): Signal<never> | undefined { return this.channels.get(name); }

  names(): string[] { return [...this.channels.keys()].sort(); }

  clear(): void { for (const channel of this.channels.values()) channel.clear(); }
}
