// Everything that moves without being asked to. Nothing else in the framework
// touches an actor's `x`/`y` during a step, so the motion of a frame is decided
// in exactly one place.
//
// A MovieClip game wrote `_x += vx` per frame; here `vx` is in units per second
// (the frame rate is factored out) and a jump is a velocity, not a tween.

import type { Actor } from '../core/Actor';
import { Signals, type Signal } from '../core/Signal';

export interface Body {
  width: number;
  height: number;
  /** Downward acceleration. 0 = 'does not fall' (a UI actor, a pointer). */
  gravity: number;
  /** Fraction of horizontal speed kept per second (0.02 ≈ stops quickly). */
  drag?: number;
  /** Bounce kept from an impact (1 = perfectly elastic). */
  restitution?: number;
  /** Fastest the body may fall. */
  maxFall?: number;
}

export interface WorldBounds { top: number; bottom: number; left: number; right: number }

export class PhysicsSystem {
  /** Ground level in world units (y grows downward). */
  ground: number;
  /** The bodies the system integrates: every actor with gravity to apply. */
  readonly bodies = new Set<Actor>();
  /** Emitted on every channel the framework itself raises. */
  readonly signals: Signals;

  constructor(options: { ground?: number; signals?: Signals } = {}) {
    this.ground = options.ground ?? 0;
    this.signals = options.signals ?? new Signals();
  }

  /** A channel of this system (`landed`/`jumped`/`walked` are emitted here). */
  on<T = void>(name: string): Signal<T> { return this.signals.define<T>(name); }

  add<T extends Actor>(actor: T): T { this.bodies.add(actor); return actor; }
  remove(actor: Actor): void { this.bodies.delete(actor); }

  /** One step: integrate velocity, apply gravity, and meet the ground. */
  step(dt: number, bounds?: WorldBounds): void {
    for (const actor of this.bodies) {
      const body = actor.body;
      if (!body.gravity) continue;

      actor.vy = Math.min(actor.vy + body.gravity * dt, body.maxFall ?? Infinity);
      if (body.drag && body.drag < 1) actor.vx *= Math.pow(body.drag, dt);

      actor.x += actor.vx * dt;
      actor.y += actor.vy * dt;

      if (actor.y >= this.ground) {
        const impact = actor.vy;
        actor.y = this.ground;
        if (impact > 0) {
          actor.vy = body.restitution ? -impact * body.restitution : 0;
          if (!actor.onGround) {
            actor.onGround = true;
            this.signals.define<Actor>('landed').emit(actor);
          }
        }
      } else if (actor.onGround && actor.vy < 0) {
        actor.onGround = false;
        this.signals.define<Actor>('airborne').emit(actor);
      }

      if (bounds) {
        if (actor.x - body.width / 2 < bounds.left) { actor.x = bounds.left + body.width / 2; actor.vx = Math.abs(actor.vx); }
        if (actor.x + body.width / 2 > bounds.right) { actor.x = bounds.right - body.width / 2; actor.vx = -Math.abs(actor.vx); }
      }
    }
  }
}
