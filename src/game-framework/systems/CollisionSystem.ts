// Overlaps between actors, and the events they become. A hit is not code that
// runs inside either actor: it is a signal both of them can listen to.

import type { Actor } from '../core/Actor';
import { Signals } from '../core/Signal';

export interface Hit {
  actor: Actor;
  other: Actor;
}

export interface HitTest {
  (a: Actor, b: Actor): boolean;
}

export class CollisionSystem {
  /** The channels this system raises (`hit`, `hit:<label>`). */
  readonly signals: Signals;
  readonly actors = new Set<Actor>();
  /** What counts as overlapping: the framework's box test unless overridden. */
  test: HitTest = (a, b) => overlap(a, b);
  /** The labels an actor answers to (a MovieClip's instance name, a class name). */
  labels = new Map<Actor, string[]>();

  /** `signals` is the world's hub, so a listener can subscribe before anything runs. */
  constructor(signals: Signals = new Signals()) { this.signals = signals; }

  add<T extends Actor>(actor: T, ...labels: string[]): T {
    this.actors.add(actor);
    if (labels.length) this.labels.set(actor, labels);
    return actor;
  }

  remove(actor: Actor): void { this.actors.delete(actor); this.labels.delete(actor); }

  /** Everything `actor` touches right now. */
  touching(actor: Actor): Actor[] {
    const hits: Actor[] = [];
    for (const other of this.actors) if (other !== actor && this.test(actor, other)) hits.push(other);
    return hits;
  }

  /** One pass over every pair; emits `hit` per collision, with the labels of both. */
  step(): void {
    const actors = [...this.actors];
    for (let i = 0; i < actors.length; i += 1) {
      for (let j = i + 1; j < actors.length; j += 1) {
        // Two pieces of furniture cannot hit each other: a bumper overlapping the
        // table's own box is not a collision, it is a layout.
        if (!actors[i].body.gravity && !actors[j].body.gravity) continue;
        if (!this.test(actors[i], actors[j])) continue;
        const hit: Hit = { actor: actors[i], other: actors[j] };
        this.signals.define<Hit>('hit').emit(hit);
        for (const label of this.labels.get(actors[i]) ?? []) this.signals.define<Hit>(`hit:${label}`).emit(hit);
        for (const label of this.labels.get(actors[j]) ?? []) this.signals.define<Hit>(`hit:${label}`).emit({ actor: actors[j], other: actors[i] });
      }
    }
  }
}

/** Axis-aligned box overlap, the framework's default hit test. */
export function overlap(a: Actor, b: Actor): boolean {
  return Math.abs(a.x - b.x) < (a.body.width + b.body.width) / 2
    && Math.abs(a.y - b.y) < (a.body.height + b.body.height) / 2;
}
