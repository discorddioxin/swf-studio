// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { parseSwfXml } from '../../../lib/parser';
import type { LoadedAsset } from '../../../lib/assets';
import { compileSources, linkProgram } from '../loader';
import { FlashPlayer, type LogEntry } from '../player';
import { runtime } from '../context';
import { DisplayObject, MovieClip, SimpleButton, Sprite } from '../display';
import { Event, EventDispatcher, MouseEvent } from '../events';
import { TextField } from '../text';
import { Timer, getTimer } from '../utils';
import { GAME_XML, SOURCES } from './gameFixture';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function boot(opts: { withCode?: boolean } = {}) {
  const doc = parseSwfXml(GAME_XML, { fileName: 'game.swf' });
  const compiled = compileSources(opts.withCode === false ? [] : SOURCES);
  const program = linkProgram(compiled);
  const logs: LogEntry[] = [];
  const assets = { get: (): LoadedAsset => ({ status: 'error' }), preview: () => undefined };
  const player = new FlashPlayer({ doc, program, assets, onLog: (e) => logs.push(e) });
  player.start();
  return { doc, program, player, logs, root: player.root as unknown as Any };
}
const frames = (p: FlashPlayer, n: number) => { for (let i = 0; i < n; i++) p.step(); };
const center = (o: DisplayObject) => { const b = o.getBounds(null); return [b.x + b.width / 2, b.y + b.height / 2] as const; };

let current: FlashPlayer | null = null;
afterEach(() => { current?.dispose(); current = null; runtime.player = null; });

describe('loader', () => {
  it('compiles transpiled TS, resolves flash/relative/package imports, and ignores .d.ts', () => {
    const program = linkProgram(compileSources(SOURCES));
    expect(program.errors).toEqual([]);
    expect(program.classes.map((c) => c.qualifiedName).sort()).toEqual(['com.game.Enemy', 'com.game.Hero', 'com.game.Main', 'util.GameConfig']);
    expect(typeof program.getDefinition('com.game.Main')).toBe('function');
    expect(program.getDefinition('com.game::Hero')).toBe(program.getDefinition('Hero'));
    expect(program.getDefinition('flash.display.MovieClip')).toBe(MovieClip);
  });

  it('reports unresolvable imports and compile errors per file instead of failing the whole program', () => {
    const program = linkProgram(compileSources([
      { path: 'a/Broken.ts', text: 'import { Nope } from "./Missing"; export class Broken extends Nope {}' },
      { path: 'a/Syntax.ts', text: 'export class Syntax { oops( }' },
      { path: 'a/Fine.ts', text: 'export class Fine {}' },
    ]));
    expect(program.errors.map((e) => e.path).sort()).toEqual(['a/Broken.ts', 'a/Syntax.ts']);
    expect(program.errors.find((e) => e.path === 'a/Broken.ts')!.message).toMatch(/Cannot resolve import "\.\/Missing"/);
    expect(typeof program.getDefinition('Fine')).toBe('function');
  });
});

describe('FlashPlayer running a transpiled AS3 game', () => {
  it('links SymbolClass (incl. the document class, id 0) and reads the stage setup', () => {
    const { player, root, doc } = boot();
    current = player;
    expect(doc.symbolClasses?.get(0)).toBe('com.game.Main');
    expect(player.linkage.every((l) => l.linked)).toBe(true);
    expect(player.stage.stageWidth).toBe(400);
    expect(player.stage.stageHeight).toBe(300);
    expect(player.stage.frameRate).toBe(30);
    expect(player.stage.color).toBe(0x102030);
    expect(root.constructor.name).toBe('Main');
    expect(root.parent).toBe(player.stage);
  });

  it('constructs like Flash: stage instances, parent and stage exist inside constructors', () => {
    const { player, root } = boot();
    current = player;
    expect(root.log[0]).toBe('ctor hero=true stage=true frame=1');
    const hero = root.hero as Any;
    expect(hero.constructor.name).toBe('Hero');
    expect(hero.ctorInfo).toBe('parent=root1 name=hero x=100 body=true');
    expect(hero.addedToStage).toBe(true);
    expect(root.scoreText).toBeInstanceOf(TextField);
    expect(root.startButton).toBeInstanceOf(SimpleButton);
  });

  it('runs frame 1 scripts (addFrameScript) and stays stopped', () => {
    const { player, root } = boot();
    current = player;
    expect(root.log).toContain('frame1');
    expect(root.scoreText.text).toBe('Score: 0');
    frames(player, 5);
    expect(root.currentFrame).toBe(1);
    expect(root.currentLabel).toBe('menu');
  });

  it('button click → gotoAndStop(label) runs the destination frame script immediately', () => {
    const { player, root } = boot();
    current = player;
    const [x, y] = center(root.startButton);
    player.pointerMove(x, y);
    expect((root.startButton as SimpleButton)._state).toBe('over');
    player.pointerDown(x, y);
    expect((root.startButton as SimpleButton)._state).toBe('down');
    player.pointerUp(x, y);
    expect(root.log).toEqual(expect.arrayContaining(['click startButton', 'frame2 enemies=0', 'after goto frame=2']));
    expect(root.log.indexOf('frame2 enemies=0')).toBeLessThan(root.log.indexOf('after goto frame=2'));
    expect(root.currentLabel).toBe('game');
    expect(root.enemies).toHaveLength(1);
    const enemy = root.enemies[0] as Sprite;
    expect(enemy.numChildren).toBe(1); // linked symbol 11's timeline content
    expect(enemy.parent).toBe(root);
  });

  it('keyboard input changes a nested clip state (gotoAndStop on the hero timeline)', () => {
    const { player, root } = boot();
    current = player;
    root.gotoAndStop('game');
    const hero = root.hero as MovieClip & Any;
    const bodyBefore = hero.body;
    player.keyDown({ keyCode: 39, key: 'ArrowRight' });
    expect(hero.x).toBe(110);
    expect(hero.currentLabel).toBe('run');
    expect(hero.body).toBe(bodyBefore); // same placement → same instance
    player.keyDown({ keyCode: 32, key: ' ' });
    expect(hero.currentLabel).toBe('jump');
    expect(hero.jumps).toBe(1);
    expect(hero.body).not.toBe(bodyBefore); // replaced on frame 3
    expect(hero.numChildren).toBe(1);
    hero.gotoAndStop('idle');
    expect(hero.body).not.toBe(bodyBefore); // re-created, the original placement ended
    expect(hero.numChildren).toBe(1);
  });

  it('ENTER_FRAME game loop, timers on player time, collision → gameover removes timeline instances', () => {
    const { player, root, logs } = boot();
    current = player;
    root.gotoAndStop('game');
    const hero = root.hero;
    frames(player, 1);
    expect(root.score).toBe(1);
    expect(root.log).not.toContain('bonus');
    frames(player, 15); // 30 fps → 500 ms timer has fired
    expect(root.log).toContain('bonus');
    for (let i = 0; i < 20 && root.currentLabel !== 'gameover'; i++) player.step();
    expect(root.currentLabel).toBe('gameover');
    expect(root.log).toContain('frame3 hero=null');
    expect(hero.parent).toBeNull();
    expect(root.hero).toBeNull();
    expect(root.enemies).toHaveLength(0);
    expect(logs.some((l) => l.level === 'trace' && /^GAME OVER \d+$/.test(l.message))).toBe(true);
    expect(logs.filter((l) => l.level === 'error')).toEqual([]);
  });

  it('restart gives fresh module state (static fields) and a fresh stage', () => {
    const a = boot();
    const Config = a.program.getDefinition('util.GameConfig') as Any;
    expect(Config.starts).toBe(1);
    a.player.dispose();
    const b = boot();
    current = b.player;
    expect((b.program.getDefinition('util.GameConfig') as Any).starts).toBe(1);
    expect(b.root).not.toBe(a.root);
  });

  it('without transpiled code the SWF timeline still plays', () => {
    const { player, root, logs } = boot({ withCode: false });
    current = player;
    expect(root).toBeInstanceOf(MovieClip);
    expect(logs.some((l) => /Document class com\.game\.Main was not found/.test(l.message))).toBe(true);
    expect(root.currentFrame).toBe(1);
    player.step();
    expect(root.currentFrame).toBe(2);
    player.step();
    expect(root.currentFrame).toBe(3);
    expect(root.getChildByName('hero')).toBeNull();
    player.step();
    expect(root.currentFrame).toBe(1); // loops
    expect((root.getChildByName('hero') as MovieClip).currentFrame).toBe(1);
  });

  it('errors in game code are reported and do not stop the player', () => {
    const { player, root, logs } = boot();
    current = player;
    root.addEventListener(Event.ENTER_FRAME, () => { throw new TypeError('Cannot read properties of null'); });
    frames(player, 3);
    expect(logs.filter((l) => l.level === 'error')).toHaveLength(3);
    expect(logs[logs.length - 1].message).toMatch(/TypeError: Cannot read properties of null {2}\(in enterFrame listener\)/);
  });

  it('renders the display list through a canvas context', () => {
    const { player, root } = boot();
    current = player;
    root.gotoAndStop('game');
    const calls: string[] = [];
    const ctx = new Proxy({}, {
      get: (_t, k) => (k === 'getTransform' ? undefined : typeof k === 'string' && /^[a-z]/.test(k)
        ? (...args: unknown[]) => { calls.push(`${k}(${args.length})`); } : undefined),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    player.render(ctx, 2, 0, 0);
    expect(calls[0]).toBe('save(0)');
    expect(calls).toContain('fillText(3)'); // score text field
    expect(calls.filter((c) => c === 'transform(6)').length).toBeGreaterThanOrEqual(4);
  });
});

describe('AS3 event model and utilities', () => {
  it('capture → target → bubble with stopPropagation', () => {
    const player = new FlashPlayer({ doc: parseSwfXml(GAME_XML, { fileName: 'g.swf' }) });
    current = player;
    player.start();
    runtime.player = player as never;
    const outer = new Sprite(); const inner = new Sprite();
    outer.name = 'outer'; inner.name = 'inner';
    outer.addChild(inner);
    const order: string[] = [];
    outer.addEventListener('ping', (e) => order.push(`capture:${(e.currentTarget as Sprite).name}`), true);
    outer.addEventListener('ping', (e) => order.push(`bubble:${(e.currentTarget as Sprite).name}:${e.eventPhase}`));
    inner.addEventListener('ping', (e) => order.push(`target:${e.eventPhase}`));
    inner.dispatchEvent(new Event('ping', true));
    expect(order).toEqual(['capture:outer', 'target:2', 'bubble:outer:3']);
    order.length = 0;
    inner.addEventListener('ping', (e) => e.stopPropagation(), false, 10);
    inner.dispatchEvent(new Event('ping', true));
    expect(order).toEqual(['capture:outer', 'target:2']);
    expect(new MouseEvent(MouseEvent.CLICK).bubbles).toBe(true);
    expect(new EventDispatcher().hasEventListener('x')).toBe(false);
  });

  it('Timer and getTimer follow player time', () => {
    const player = new FlashPlayer({ doc: parseSwfXml(GAME_XML, { fileName: 'g.swf' }) });
    current = player;
    player.start();
    runtime.player = player as never;
    const t = new Timer(100, 3);
    let ticks = 0, done = false;
    t.addEventListener('timer', () => ticks++);
    t.addEventListener('timerComplete', () => { done = true; });
    t.start();
    for (let i = 0; i < 12; i++) player.step(); // 400 ms at 30 fps
    expect(ticks).toBe(3);
    expect(done).toBe(true);
    runtime.player = player as never;
    expect(getTimer()).toBe(400);
  });
});
