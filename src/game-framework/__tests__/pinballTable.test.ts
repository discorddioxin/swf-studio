/**
 * The framework's own game, run headless: a pinball table with a ball, two
 * bumpers, two flippers, a scoreboard, a camera and a renderer — no MovieClip,
 * no timeline, no canvas needed. Every assertion below is about actors doing
 * their own job and talking through signals.
 */

import { describe, expect, it } from 'vitest';
import { PinballTable } from '../examples/pinballTable';
import { Actor } from '../core/Actor';
import { Material } from '../core/Material';
import { Script } from '../core/Script';
import { Signal } from '../core/Signal';
import type { CameraSystem } from '../systems/CameraSystem';
import type { Renderer } from '../systems/RenderSystem';

const STEP = 1 / 60;

class RecordingRenderer implements Renderer {
  drawn: Array<{ id: string; art: unknown; x: number; y: number }> = [];
  begin(_camera: CameraSystem): void { this.drawn = []; }
  draw(actor: Actor, art: unknown, screen: { x: number; y: number }): void {
    this.drawn.push({ id: actor.id, art, x: screen.x, y: screen.y });
  }
  end(): void {}
}

function run(table: PinballTable, frames: number, each?: (frame: number) => void): void {
  for (let frame = 0; frame < frames; frame += 1) {
    each?.(frame);
    table.step(STEP);
  }
}

describe('a pinball table built from actors and systems', () => {
  it('flies a launched ball up the table, into a bumper, and scores through the signal', () => {
    const table = new PinballTable();
    const hits: Array<{ id: string; material: string; points: number }> = [];
    table.world.signals.define<{ actor: Actor; other: Actor }>('hit:bumper').on((hit) => {
      if (hit.other.kind === 'Ball') hits.push({ id: hit.actor.id, material: hit.actor.material!.name, points: (hit.actor as unknown as { points: number }).points });
    });

    const ball = table.launch();
    const startY = ball.y;
    run(table, 4);
    expect(ball.y).toBeLessThan(startY);           // up the table, the plunger's way

    run(table, 236);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].material).toBe('bumper.kick');  // the bumper animates the moment it is hit
    expect(table.history).toHaveLength(hits.length);
    expect(table.scoreboard.score).toBe(hits.reduce((sum, hit) => sum + hit.points, 0));
    expect(table.scoreboard.material!.frame?.art).toBe(String(Math.floor(table.scoreboard.score / 100)));
  });

  it('returns the bumper to its rest material when the kick animation ends', () => {
    const table = new PinballTable();
    const ball = table.launch();
    run(table, 240, () => { expect(ball).toBeTruthy(); });
    // The ball has come and gone; neither bumper is still playing its kick.
    for (const bumper of table.bumpers) expect(bumper.material!.name).toBe('bumper');
  });

  it('kicks a ball with a flipper, and only while the flipper is asked to', () => {
    const table = new PinballTable();
    const flipped: string[] = [];
    table.flipped.on((event) => flipped.push(event.ball.id));
    const flipper = table.flippers[0];

    const ball = table.world.create('Ball', { x: flipper.x, y: flipper.y - 4 }, 'ball');
    run(table, 3);
    expect(flipper.material!.name).toBe('flipper.down');   // nobody asked for anything yet
    expect(ball.vy).toBeGreaterThan(0);                    // gravity has it

    table.world.input.press('action');
    table.step(STEP);
    expect(flipper.material!.name).toBe('flipper.up');
    expect(ball.vy).toBeLessThan(-400);                    // the flipper's power, upward
    expect(flipped).toEqual([ball.id]);

    table.world.input.release('action');
    table.step(STEP);
    expect(flipper.material!.name).toBe('flipper.down');
  });

  it('drains a ball at the bottom and tells the table', () => {
    const table = new PinballTable();
    const ball = table.launch();
    const drained: Actor[] = [];
    table.drained.on((lost) => drained.push(lost));

    // Put it straight on the drain line, as if it had run out of table.
    ball.y = 470;
    ball.vy = 0;
    table.step(STEP);

    expect(drained).toEqual([ball]);
    expect(table.balls).toHaveLength(0);
    expect(table.world.actors.has(ball)).toBe(false);
    expect(table.world.physics.bodies.has(ball)).toBe(false);
    expect(table.world.collision.actors.has(ball)).toBe(false);
    expect(table.plunger.material!.frameIndex).toBe(0);    // the plunger is at rest again
  });

  it('keeps multiball honest: two balls are simulated and resolved separately', () => {
    const table = new PinballTable();
    const first = table.launch();
    const second = table.launch(500);
    run(table, 30);

    expect(table.balls).toEqual([first, second]);
    expect(table.world.physics.bodies.has(first)).toBe(true);
    expect(table.world.physics.bodies.has(second)).toBe(true);
    first.y = 470;                       // straight onto the drain line
    first.vy = 0;
    table.step(STEP);
    expect(table.balls).toEqual([second]);
    expect(table.world.collision.actors.has(second)).toBe(true);
  });

  it('advances every material on the system clock, not on the actors', () => {
    const table = new PinballTable();
    const ball = table.launch();
    const before = ball.material!.frameIndex;
    run(table, 15);                                        // a quarter second of ball spin
    expect(ball.material!.frameIndex).not.toBe(before);
    expect(ball.material!.playing).toBe(true);
  });

  it('follows the ball with the camera and reports screen positions', () => {
    const renderer = new RecordingRenderer();
    const table = new PinballTable({ renderer });
    const ball = table.launch();
    run(table, 60);

    expect(Math.abs(table.world.camera.x - ball.x)).toBeLessThan(Math.abs(ball.x));
    table.step(STEP);
    const drawn = renderer.drawn.map((draw) => draw.id);
    expect(drawn).toContain(ball.id);
    expect(drawn).toContain('table');
    // Depth decides the order: the table, then the furniture, then the ball.
    expect(drawn[0]).toBe('table');
    expect(drawn.indexOf(ball.id)).toBeGreaterThan(drawn.indexOf('bumper.casino'));
    const ballDraw = renderer.drawn.find((draw) => draw.id === ball.id)!;
    expect(ballDraw.art).not.toBeUndefined();              // the material's current frame
  });

  it('runs only the behaviours whose signals fired, until they are disposed', () => {
    const game = new PinballTable();
    const actor = game.world.create('Ball', { x: 10, y: 10 });
    const script = new Script('TestActor');
    let runs = 0;
    script.behaviour('twitch', () => { runs += 1; }, { on: ['bounce'] });
    script.attach(actor);
    actor.signal<void>('bounce').emit();
    actor.signal<void>('bounce').emit();
    expect(runs).toBe(2);
    expect(script.current?.name).toBe('twitch');
    script.dispose();
    actor.signal<void>('bounce').emit();
    expect(runs).toBe(2);
  });
});

describe('the pieces a game is made of', () => {
  it('plays a material as frames with holds, and reports when it is done', () => {
    const frames = [1, 2, 3].map((image) => ({ name: `f${image}`, art: `art${image}` }));
    const material = new Material('once', frames, { loop: 'once', frameTime: 0.1 });
    let done = 0;
    material.onComplete = () => { done += 1; };
    for (let i = 0; i < 5; i += 1) material.advance(0.1);
    expect(material.frameIndex).toBe(2);
    expect(done).toBe(1);
    expect(material.playing).toBe(false);
    // `gotoAndStop` is `goto`, and playing again restarts a finished one-shot.
    material.goto(1);
    expect(material.frame?.art).toBe('art1');
    material.play();
    expect(material.playing).toBe(true);
  });

  it('delivers a signal to every listener, and keeps one broken listener from stopping the rest', () => {
    const signal = new Signal<number>('score');
    const seen: number[] = [];
    signal.on(() => { throw new Error('this listener is broken'); });
    signal.on((value) => seen.push(value));
    signal.emit(7);
    expect(seen).toEqual([7]);
    expect(signal.size).toBe(2);
  });

  it('lets input be fed by anything, not just a keyboard', () => {
    const table = new PinballTable();
    table.world.input.bind('action', 'z');
    table.world.input.press('action');
    table.world.input.beginStep();
    table.world.input.press('action');
    expect(table.world.input.isDown('action')).toBe(true);
    expect(table.world.input.wasPressed('action')).toBe(false);   // already down: not a new press
    table.world.input.release('action');
    expect(table.world.input.isDown('action')).toBe(false);
  });
});
