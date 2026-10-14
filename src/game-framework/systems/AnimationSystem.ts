// Materials advance here, and only here. An actor's look is chosen from the
// state the other systems put it in — never by the actor itself.

import type { Actor } from '../core/Actor';
import type { MaterialLibrary } from '../core/Material';

export class AnimationSystem {
  /** Every actor that shows a material this step. */
  readonly actors = new Set<Actor>();

  constructor(readonly materials: MaterialLibrary) {}

  add<T extends Actor>(actor: T): T {
    this.actors.add(actor);
    if (actor.script) actor.script.attach(actor);
    return actor;
  }

  remove(actor: Actor): void { this.actors.delete(actor); }

  /** Advance every material; actors that are still pick up their state's look. */
  step(dt: number): void {
    for (const actor of this.actors) {
      actor.update(dt);
      if (actor.material && !actor.material.playing && actor.body.gravity) actor.selectAnimation();
    }
  }
}
