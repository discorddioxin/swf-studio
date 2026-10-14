// Where actors come from. A movie's `attachMovie`/`new Foo()` is a spawn: the
// factory knows how to build each kind, and anyone holding the system can ask
// for one without knowing how it is built.

import type { Actor, ActorOptions } from '../core/Actor';
import { Signals } from '../core/Signal';

export type ActorFactory = (options: ActorOptions) => Actor;

export class SpawnSystem {
  /** The channels this system raises (`spawned:<kind>`, `despawned:<kind>`). */
  readonly signals: Signals;
  readonly actors = new Set<Actor>();
  private factories = new Map<string, ActorFactory>();
  private ids = new Map<string, number>();

  constructor(signals: Signals = new Signals()) { this.signals = signals; }

  /** Teach the system one kind of actor. */
  register(kind: string, factory: ActorFactory): this {
    this.factories.set(kind, factory);
    return this;
  }

  has(kind: string): boolean { return this.factories.has(kind); }

  /** Build one. `options.id` is optional: the kind's own counter names it. */
  spawn(kind: string, options: Omit<ActorOptions, 'id'> & { id?: string } = {}): Actor {
    const factory = this.factories.get(kind);
    if (!factory) throw new Error(`no factory registered for ${kind}`);
    const count = (this.ids.get(kind) ?? 0) + 1;
    this.ids.set(kind, count);
    const actor = factory({ ...options, id: options.id ?? `${kind}${count}` });
    this.actors.add(actor);
    this.signals.define<Actor>(`spawned:${kind}`).emit(actor);
    return actor;
  }

  /** Remove an actor and forget it. */
  despawn(actor: Actor): void {
    this.actors.delete(actor);
    this.signals.define<Actor>(`despawned:${actor.kind}`).emit(actor);
  }

  get count(): number { return this.actors.size; }

  kinds(): string[] { return [...this.factories.keys()].sort(); }
}
