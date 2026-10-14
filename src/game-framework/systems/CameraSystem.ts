// What the player sees: theMovieClip's `scrollRect` becomes a camera that follows
// an actor and can shake. Rendering reads it; nothing else changes the view.

import type { Actor } from '../core/Actor';

export class CameraSystem {
  x = 0;
  y = 0;
  width: number;
  height: number;
  /** How much of the distance to the target is covered per second (1 = snap). */
  smoothing = 1;
  private target?: Actor;
  private shake = 0;
  private shakeDecay = 6;
  private offsetX = 0;
  private offsetY = 0;
  private bounds?: { left: number; top: number; right: number; bottom: number };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  follow(target: Actor): void { this.target = target; }

  /** Keep the camera inside the level. */
  clamp(left: number, top: number, right: number, bottom: number): void {
    this.bounds = { left, top, right, bottom };
  }

  /** Ask for a knock — a pinball table's bumper, an explosion. */
  kick(strength: number): void { this.shake = Math.max(this.shake, strength); }

  /** Where an actor is on screen (what `localToGlobal` used to compute). */
  toScreen(actor: { x: number; y: number }, width = this.width, height = this.height): { x: number; y: number } {
    return {
      x: actor.x - this.x + this.offsetX + width / 2,
      y: actor.y - this.y + this.offsetY + height / 2,
    };
  }

  step(dt: number): void {
    if (this.target) {
      const t = this.smoothing >= 1 ? 1 : 1 - Math.exp(-this.smoothing * dt * 8);
      this.x += (this.target.x - this.x) * t;
      this.y += (this.target.y - this.y) * t;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - this.shakeDecay * dt);
      this.offsetX = (Math.random() * 2 - 1) * this.shake;
      this.offsetY = (Math.random() * 2 - 1) * this.shake;
    } else {
      this.offsetX = 0;
      this.offsetY = 0;
    }
    if (this.bounds) {
      const halfW = this.width / 2;
      const halfH = this.height / 2;
      this.x = Math.max(this.bounds.left + halfW, Math.min(this.bounds.right - halfW, this.x));
      this.y = Math.max(this.bounds.top + halfH, Math.min(this.bounds.bottom - halfH, this.y));
    }
  }
}
