// An actor is what a MovieClip becomes when the timeline is gone: a world object
// with a body (physics), a look (a material), and behaviours. An actor never
// animates itself, never reads input itself and never touches another actor: it
// exposes what it can do, and the systems drive it.
//
// The behaviours of a generated actor are lifted from the movie's own code, so
// the names below are the names a MovieClip-based project used: `play`, `stop`,
// `goto`, `x`/`y` (the timeline's position) and `signals`.

import { Material, MaterialLibrary } from './Material';
import { Signals, Signal } from './Signal';
import type { Action, Script } from './Script';
import type { Body } from '../systems/PhysicsSystem';

export interface ActorOptions {
  id: string;
  x?: number;
  y?: number;
  /** Layer within its parent's display list; higher draws later. */
  depth?: number;
  material?: string;
  script?: Script;
  body?: Partial<Body>;
  animations?: { idle: string; walk?: string; jump?: string; fall?: string; [name: string]: string | undefined };
  speed?: number;
  jump?: number;
}

/** What a behaviour can ask of its actor, and how the systems ask back. */
export class Actor {
  readonly id: string;
  readonly kind: string;
  x: number;
  y: number;
  /** Velocity in world units per second; the physics system integrates it. */
  vx = 0;
  vy = 0;
  depth: number;
  visible = true;
  /** Facing: 1 looks right, -1 looks left — what a flipped MovieClip meant. */
  facing: 1 | -1 = 1;
  scale = 1;

  body: Body;
  material?: Material;
  /** Which material each state shows (`idle`/`walk`/`jump`/`fall` by default). */
  animations: { [name: string]: string | undefined };
  speed: number;
  jump: number;

  /** The recorded behaviours of this actor (`Script`), if it has any. */
  script?: Script;
  /** Per-actor channels, for a behaviour that wants to be listened to. */
  own = new Signals();
  /** The world's channels; set when the actor is added to a world. */
  signals!: Signals;
  private materials: MaterialLibrary;

  /** Set by the systems each step, so behaviours never have to read input. */
  input = { left: false, right: false, up: false, action: false };
  onGround = false;

  constructor(options: ActorOptions, kind: string, signals: Signals, materials: MaterialLibrary) {
    this.id = options.id;
    this.kind = kind;
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.depth = options.depth ?? 0;
    this.animations = options.animations ?? { idle: options.material ?? 'idle' };
    this.speed = options.speed ?? 150;
    this.jump = options.jump ?? 320;
    this.script = options.script;
    this.materials = materials;
    this.signals = signals;
    this.body = { width: 12, height: 16, gravity: 0, ...options.body };
    if (options.material) this.material = materials.get(options.material);
  }

  // -- behaviour-facing API -------------------------------------------------

  /** The material this actor shows right now. */
  get current(): Material | undefined { return this.material; }

  /** Play a material (a state name or a material name), like `MovieClip.play`. */
  play(name: string, onComplete?: () => void): void {
    const next = this.materials.get(this.animations[name] ?? name) ?? this.materials.get(name);
    if (!next) return;
    if (this.material !== next) this.material = next;
    if (onComplete) next.onComplete = () => onComplete();
    next.goto(1, true);
  }

  /** Stop on the current frame. */
  stop(): void { this.material?.stop(); }

  /** Show one frame by material and frame number (1-based, like `gotoAndStop`). */
  gotoFrame(name: string, frame: number, play = false): void {
    const material = this.materials.get(this.animations[name] ?? name);
    if (material) this.material = material;
    this.material?.goto(frame, play);
  }

  /** Put the actor somewhere, in the world's coordinates. */
  setPosition(x: number, y: number): void { this.x = x; this.y = y; }

  /** The channel an actor listens to or emits. */
  signal<T = void>(name: string): Signal<T> { return this.signals.define<T>(name); }

  /** Run a recorded behaviour of this actor by name (a script's action). */
  run(name: string): boolean {
    if (!this.script) return false;
    const action = this.script.get(name);
    if (!action) return false;
    this.script.play(action);
    return true;
  }

  /** Move at a speed, the way a MovieClip's `_x += vx * dt` did. */
  move(dx: number, dy: number): void { this.x += dx; this.y += dy; }

  /** How long until this actor is standing on the ground below it. */
  timeToGround(ground = 0): number {
    if (this.vy >= 0) return 0;
    const g = this.body.gravity || 1;
    const t = (-this.vy + Math.sqrt(Math.max(0, this.vy * this.vy + 2 * g * (this.y - ground)))) / g;
    return Number.isFinite(t) ? t : 0;
  }

  // -- system-facing API ----------------------------------------------------

  /** One step of the actor's own clocks. Systems call this; actors do not. */
  update(dt: number): void {
    this.material?.advance(dt);
  }

  /** Choose the material for the state the systems just put the actor in. */
  selectAnimation(): void {
    const state = !this.onGround ? (this.vy < 0 ? 'jump' : 'fall') : Math.abs(this.vx) > 1 ? 'walk' : 'idle';
    const wanted = this.animations[state] ?? this.animations.idle;
    if (wanted && this.material?.name !== wanted) this.play(state);
  }
}

/** A behaviour: the code an actor runs, calling only its own actor and its signals. */
export interface Behaviour<T extends Actor = Actor> {
  (actor: T): void;
}

/** An action that needs the world (spawning, cameras, scoring). */
export interface GameAction {
  (actor: Actor): void;
}

export type { Action };
