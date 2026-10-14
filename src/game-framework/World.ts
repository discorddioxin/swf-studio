// The world: one clock, one set of systems, one place where actors live. A
// MovieClip timeline used to do four jobs (animation, physics, input, rendering)
// on its own; here each one is a system with a name, and the world only orders
// them.
//
//     const world = new World({ width: 640, height: 480 });
//     world.spawn.register('Ball', (o) => new Ball(o, world.signals, world.materials));
//     world.add(ball);
//     world.start(canvas);
//
// Every step is: read input → let actors act → move → resolve → animate → draw.

import { Actor, type ActorOptions } from './core/Actor';
import { MaterialLibrary } from './core/Material';
import { Signals } from './core/Signal';
import { PhysicsSystem, type WorldBounds } from './systems/PhysicsSystem';
import { InputSystem } from './systems/InputSystem';
import { AnimationSystem } from './systems/AnimationSystem';
import { CollisionSystem } from './systems/CollisionSystem';
import { SpawnSystem } from './systems/SpawnSystem';
import { CameraSystem } from './systems/CameraSystem';
import { AudioSystem } from './systems/AudioSystem';
import { RenderSystem, type Renderer } from './systems/RenderSystem';

export interface WorldOptions {
  width?: number;
  height?: number;
  /** Emitted once per step with the step's seconds. */
  onStep?: (dt: number) => void;
  /** Called with an actor and its screen position after the step. */
  renderer?: Renderer;
  bounds?: WorldBounds;
  /** Where the ground is and how fast things fall by default. */
  physics?: { ground?: number };
}

export class World {
  readonly signals = new Signals();
  readonly materials = new MaterialLibrary();
  readonly input = new InputSystem();
  readonly physics: PhysicsSystem;
  readonly animation: AnimationSystem;
  readonly collision: CollisionSystem;
  readonly spawn: SpawnSystem;
  readonly camera: CameraSystem;
  readonly audio = new AudioSystem();
  readonly render: RenderSystem;
  readonly bounds?: WorldBounds;

  /** Every actor in the world, in the order it was added. */
  readonly actors = new Set<Actor>();
  /** Seconds of simulation time since the world started. */
  elapsed = 0;
  /** Steps per second; `0` runs as fast as the host frames come. */
  frameRate = 60;
  /** Paused worlds still render; they do not simulate. */
  paused = false;
  private accumulator = 0;
  private last = 0;
  private frame?: number;
  private onStep?: (dt: number) => void;

  constructor(options: WorldOptions = {}) {
    const width = options.width ?? 640;
    const height = options.height ?? 480;
    this.bounds = options.bounds;
    this.physics = new PhysicsSystem({ ...options.physics, signals: this.signals });
    this.collision = new CollisionSystem(this.signals);
    this.spawn = new SpawnSystem(this.signals);
    this.animation = new AnimationSystem(this.materials);
    this.camera = new CameraSystem(width, height);
    this.render = new RenderSystem(this.camera, options.renderer);
    this.onStep = options.onStep;
  }

  /** Put an actor in the world and in every system that has to see it. */
  add<T extends Actor>(actor: T, ...labels: string[]): T {
    this.actors.add(actor);
    this.physics.add(actor);
    this.animation.add(actor);
    this.collision.add(actor, ...labels);
    return actor;
  }

  remove(actor: Actor): void {
    this.actors.delete(actor);
    this.physics.remove(actor);
    this.animation.remove(actor);
    this.collision.remove(actor);
    actor.script?.dispose();
  }

  /** Build an actor of a registered kind and add it. */
  create(kind: string, options: Omit<ActorOptions, 'id'> & { id?: string } = {}, ...labels: string[]): Actor {
    return this.add(this.spawn.spawn(kind, options), ...labels);
  }

  /** One simulation step of `dt` seconds. */
  step(dt: number): void {
    if (this.paused) { this.render.collect(this.actors); this.render.step(); return; }
    this.elapsed += dt;
    this.input.beginStep();
    const actions = this.input.actions;
    for (const actor of this.actors) {
      actor.input = {
        left: actions.left === true, right: actions.right === true,
        up: actions.up === true, action: actions.action === true,
      };
      // A behaviour named `enterFrame` runs here, before anything moves — the one
      // timeline callback that has to stay a per-frame hook.
      const frame = actor.script?.get('enterFrame');
      if (frame) actor.script!.play(frame, actor);
    }
    this.physics.step(dt, this.bounds);
    this.collision.step();
    this.animation.step(dt);
    this.render.collect(this.actors);
    this.camera.step(dt);
    this.render.step();
    this.onStep?.(dt);
  }

  /** Run with a clock until `stop()`. `target` receives keyboard input. */
  start(target?: EventTarget): void {
    if (target) this.input.attach(target);
    this.last = now();
    const tick = () => {
      const time = now();
      let dt = (time - this.last) / 1000;
      this.last = time;
      if (dt > 0.25) dt = 0.25;
      if (this.frameRate > 0) {
        this.accumulator += dt;
        const stepTime = 1 / this.frameRate;
        while (this.accumulator >= stepTime) { this.step(stepTime); this.accumulator -= stepTime; }
      } else {
        this.step(dt);
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.frame != null) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.input.detach();
  }

  /** Trace helpers the lifted code calls (a movie's `trace`). */
  log(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`[${this.elapsed.toFixed(3)}] ${message}`);
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
