// A pinball table written the way the framework wants a game written: actors
// with bodies, looks and behaviours, talking through signals, driven by systems.
//
// This is the target the Flash-to-framework transcription aims at. Compare it
// with the lifted 1:1 class it replaces:
//
//   class KickBumper extends MovieClip {                  class Bumper extends Actor
//     addEventListener('enterFrame', this.init)             (the systems start it)
//     kickbase_mc.init(..., this.bumperHit)                 signal('hit:bumper').on(...)
//     PinballCore.__Root.playSound(__SndEffect)             signals.define(cue).emit()
//     PinballCore.__Root.__HitQueue.push(this.__SID)        scored.emit({ id, points })
//     this.gotoAndPlay('kick')                              this.play('kick')
//   }
//
// Nothing in this file knows about Flash, MovieClips, timelines or a canvas.

import { Actor } from '../core/Actor';
import { Material, type MaterialFrame, type MaterialLibrary } from '../core/Material';
import type { Signal, Signals } from '../core/Signal';
import { Script } from '../core/Script';
import { World } from '../World';
import type { Renderer } from '../systems/RenderSystem';

export interface ScoreEvent { id: string; points: number; at: { x: number; y: number } }
export interface HitEvent { actor: Actor; other: Actor }

/** A board built from a strip of art, the way a timeline's frames were. */
function strip(name: string, art: string[], options: { frameTime?: number; loop?: 'loop' | 'once' | 'hold' } = {}): Material {
  const frames: MaterialFrame[] = art.map((image, index) => ({ name: `${name}${index + 1}`, art: image }));
  return new Material(name, frames, { frameTime: options.frameTime ?? 1 / 12, loop: options.loop ?? 'loop' });
}

export class Bumper extends Actor {
  readonly points: number;
  readonly cue: string;

  constructor(id: string, x: number, y: number, signals: Signals, materials: MaterialLibrary, points: number, cue: string) {
    super({ id, x, y, depth: 5, body: { width: 34, height: 34, gravity: 0 }, animations: { idle: 'bumper' } }, 'Bumper', signals, materials);
    this.points = points;
    this.cue = cue;
    this.play('bumper');
    // A bumper does not watch the world: it listens to the one thing it cares
    // about, and everything it does when it is hit is its own business.
    signals.define<HitEvent>('hit:bumper').on((hit) => {
      if (hit.actor !== this || hit.other.kind !== 'Ball') return;
      this.kick(hit.other);
    });
  }

  private kick(ball: Actor): void {
    const dx = ball.x - this.x;
    const dy = ball.y - this.y;
    const length = Math.hypot(dx, dy) || 1;
    // Send the ball away from the bumper's middle, the way the movie's kick did.
    ball.vx = (dx / length) * 320 + ball.vx * 0.2;
    ball.vy = (dy / length) * 320 + ball.vy * 0.2 - 60;
    this.play('bumper.kick');
    // The kick is a one-shot: when it ends the bumper goes back to its rest look.
    this.material!.onComplete = () => this.play('bumper');
    this.signal<void>(this.cue).emit();
    this.signal<ScoreEvent>('scored').emit({ id: this.id, points: this.points, at: { x: this.x, y: this.y } });
    this.signal<HitEvent>('bumped').emit({ actor: this, other: ball });
  }
}

export class Flipper extends Actor {
  readonly power: number;
  world?: World;
  private raised = false;

  constructor(id: string, x: number, y: number, signals: Signals, materials: MaterialLibrary, power: number) {
    super({
      id, x, y, depth: 6,
      body: { width: 60, height: 14, gravity: 0 },
      animations: { idle: 'flipper.down' },
    }, 'Flipper', signals, materials);
    this.power = power;
    this.play('flipper.down');
    // The flipper reads input, never the keyboard, and only through its actor.
    this.script = new Script('Flipper').behaviour('enterFrame', (actor) => {
      if (actor.input.action) (actor as Flipper).up(); else (actor as Flipper).down();
    });
  }

  /** Swing: everything the flipper is touching goes up. */
  up(): void {
    if (this.raised) return;
    this.raised = true;
    this.play('flipper.up');
    for (const ball of this.world?.collision.touching(this) ?? []) {
      if (ball.kind !== 'Ball') continue;
      ball.vy = -this.power;
      ball.vx += (ball.x - this.x) * 2;
      this.signal<{ flipper: Actor; ball: Actor; power: number }>('flipped').emit({ flipper: this, ball, power: this.power });
    }
  }

  down(): void {
    if (!this.raised) return;
    this.raised = false;
    this.play('flipper.down');
  }
}

export class Plunger extends Actor {
  constructor(x: number, y: number, signals: Signals, materials: MaterialLibrary) {
    super({ id: 'plunger', x, y, depth: 4, body: { width: 16, height: 40, gravity: 0 }, material: 'plunger' }, 'Plunger', signals, materials);
  }
}

/** A score display: its frames are the digits, and it shows `score % 10`. */
export class Scoreboard extends Actor {
  score = 0;

  constructor(x: number, y: number, signals: Signals, materials: MaterialLibrary, scored: Signal<ScoreEvent>) {
    super({ id: 'scoreboard', x, y, depth: 20, body: { width: 60, height: 20, gravity: 0 }, material: 'scoreboard' }, 'Scoreboard', signals, materials);
    scored.on((event) => this.show(event.points));
  }

  show(points: number): void {
    this.score += points;
    // The frames are the digits, so showing a score is choosing a frame.
    this.gotoFrame('scoreboard', Math.min(9, Math.floor(this.score / 100)) + 1);
  }
}

export interface PinballOptions {
  width?: number;
  height?: number;
  renderer?: Renderer;
  /** Where the drain is. A ball that reaches it is lost. */
  drain?: number;
}

/**
 * The table: it owns the world, the geometry and one ball at a time. Everything
 * that happens in a game of pinball is one of the signals below, and the table
 * is where the wiring happens — nowhere else.
 */
export class PinballTable {
  readonly world: World;
  readonly table: Actor;
  readonly bumpers: Bumper[] = [];
  readonly flippers: Flipper[] = [];
  readonly scoreboard: Scoreboard;
  readonly plunger: Plunger;
  readonly balls: Actor[] = [];

  /** The table's vocabulary. */
  readonly hit: Signal<HitEvent>;
  readonly scored: Signal<ScoreEvent>;
  readonly drained: Signal<Actor>;
  readonly launched: Signal<Actor>;
  readonly flipped: Signal<{ flipper: Actor; ball: Actor; power: number }>;
  /** Everything the table heard, for a replay, a scoreboard or a test. */
  readonly history: ScoreEvent[] = [];

  private drain: number;

  constructor(options: PinballOptions = {}) {
    const width = options.width ?? 300;
    const height = options.height ?? 480;
    this.drain = options.drain ?? height - 10;
    this.world = new World({
      width, height, renderer: options.renderer,
      bounds: { top: 0, bottom: height, left: 0, right: width },
      physics: { ground: this.drain },
    });
    this.hit = this.world.signals.define('hit');
    this.scored = this.world.signals.define('scored');
    this.drained = this.world.signals.define('drained');
    this.launched = this.world.signals.define('launched');
    this.flipped = this.world.signals.define('flipped');

    const materials = this.world.materials;
    materials.add(strip('table', ['table']));
    materials.add(strip('bumper', ['bumper.off'], { loop: 'hold' }));
    materials.add(strip('bumper.kick', ['bumper.kick1', 'bumper.kick2', 'bumper.kick3'], { loop: 'once', frameTime: 1 / 20 }));
    materials.add(strip('flipper.up', ['flipper.up']));
    materials.add(strip('flipper.down', ['flipper.down']));
    materials.add(strip('ball.spin', ['ball1', 'ball2', 'ball3', 'ball4'], { frameTime: 1 / 24 }));
    materials.add(strip('plunger', ['plunger.rest', 'plunger.pulled'], { loop: 'hold' }));
    materials.add(strip('scoreboard', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], { loop: 'hold' }));

    this.table = this.world.add(new Actor({ id: 'table', depth: 0, body: { width, height, gravity: 0 }, material: 'table' }, 'Table', this.world.signals, materials));

    const casino = new Bumper('bumper.casino', width * 0.30, height * 0.30, this.world.signals, materials, 100, 'sfx.bumper');
    const guild = new Bumper('bumper.guild', width * 0.70, height * 0.30, this.world.signals, materials, 100, 'sfx.bumper');
    this.bumpers.push(this.world.add(casino, 'bumper'), this.world.add(guild, 'bumper'));

    this.flippers.push(
      this.world.add(new Flipper('flipper.left', width * 0.32, height * 0.86, this.world.signals, materials, 520), 'flipper'),
      this.world.add(new Flipper('flipper.right', width * 0.68, height * 0.86, this.world.signals, materials, 520), 'flipper'),
    );
    for (const flipper of this.flippers) flipper.world = this.world;

    this.scoreboard = this.world.add(new Scoreboard(width * 0.85, height * 0.06, this.world.signals, materials, this.scored), 'scoreboard');
    this.plunger = this.world.add(new Plunger(width * 0.94, this.drain - 40, this.world.signals, materials), 'plunger');

    this.world.spawn.register('Ball', (spawnOptions) => new Actor({
      ...spawnOptions,
      depth: 10,
      material: 'ball.spin',
      animations: { idle: 'ball.spin' },
      body: { width: 12, height: 12, gravity: 1500, restitution: 0.55, drag: 0.55, maxFall: 900 },
    }, 'Ball', this.world.signals, materials));

    this.scored.on((event) => { this.history.push(event); });
  }

  /** Fire a ball out of the plunger, the way the movie's plunger did. */
  launch(power = 900): Actor {
    const ball = this.world.create('Ball', { x: this.plunger.x, y: this.plunger.y - 6 }, 'ball');
    ball.vy = -power;          // straight up the plunger lane…
    ball.vx = -165;            // …and into the table, which is why the shot is a skill
    this.balls.push(ball);
    this.world.camera.follow(ball);
    this.plunger.gotoFrame('plunger', 2, false);
    this.launched.emit(ball);
    return ball;
  }

  /** A ball left the table: tell everyone, then take it out of the world. */
  lose(ball: Actor): void {
    const index = this.balls.indexOf(ball);
    if (index >= 0) this.balls.splice(index, 1);
    this.drained.emit(ball);
    this.world.remove(ball);
    this.world.spawn.despawn(ball);
    const next = this.balls[0];
    if (next) this.world.camera.follow(next);
    if (!this.balls.length) this.plunger.gotoFrame('plunger', 1, false);
  }

  /** One step of the table, in seconds. */
  step(dt: number): void {
    this.world.step(dt);
    for (const ball of [...this.balls]) if (ball.y >= this.drain) this.lose(ball);
  }

  /** Run until the table is stopped; `target` receives the flippers' input. */
  run(target?: EventTarget): void {
    this.world.input.bind('action', ' ', 'ArrowUp', 'z', 'x');
    this.world.start(target);
  }

  stop(): void { this.world.stop(); }
}
