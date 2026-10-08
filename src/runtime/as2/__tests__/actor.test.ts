import { describe, expect, it, vi } from 'vitest';
import { Actor, TimelineActor, flashActorPorts } from '../actor';

describe('actor migration ports', () => {
  it('normalizes sprite transforms and exposes named animations without a second clock', () => {
    const clip = {
      _x: 10, _y: 20, _xscale: 100, _yscale: 50, _rotation: 90, _alpha: 75, _visible: true, _currentframe: 1,
      play: vi.fn(), stop: vi.fn(), gotoAndPlay: vi.fn(), gotoAndStop: vi.fn(),
    };
    const actor = new Actor('Hero', flashActorPorts(clip, { 1: 'idle', 5: 'run' }));
    expect(actor.sprite.scaleY).toBe(0.5); expect(actor.sprite.opacity).toBe(0.75);
    actor.moveTo(30, 40); actor.sprite.scaleX = 2; actor.sprite.opacity = 0.5;
    actor.sprite.visible = false; actor.sprite.rotation = 45;
    expect([clip._x, clip._y, clip._xscale, clip._alpha, clip._visible, clip._rotation]).toEqual([30, 40, 200, 50, false, 45]);
    actor.animation.play('run'); actor.animation.pause(); actor.animation.seek('idle');
    expect(clip.gotoAndPlay).toHaveBeenCalledWith(5); expect(clip.stop).toHaveBeenCalledOnce();
    expect(clip.gotoAndStop).toHaveBeenCalledWith(1);
    expect(actor.animation.frame).toBe(1);
    actor.update(1 / 60);
    expect(clip.gotoAndPlay).toHaveBeenCalledTimes(1);
  });
  it('adapts graphics opacity and does not fabricate unsupported drawing capabilities', () => {
    const clip = { clear: vi.fn(), beginFill: vi.fn(), lineStyle: vi.fn(), endFill: vi.fn() };
    const graphics = flashActorPorts(clip).graphics!;
    graphics.beginFill(0xff00ff, 0.5); graphics.lineStyle(2, 0xffffff); graphics.clear();
    expect(clip.beginFill).toHaveBeenCalledWith(0xff00ff, 50);
    expect(clip.lineStyle).toHaveBeenCalledWith(2, 0xffffff, 100);
    expect(clip.clear).toHaveBeenCalledOnce();
    expect(flashActorPorts({}).graphics).toBeUndefined();
  });
  it('keeps legacy behavior explicit and binds it to its original sprite', () => {
    const clip = { count: 0 };
    const actor = new TimelineActor('Hero', clip, { frames: { 1: function () { this.count++; } } });
    expect(clip.count).toBe(0);
    actor.update(1); expect(clip.count).toBe(0);
    actor.runFrameAction(1); expect(clip.count).toBe(1);
    actor.runFrameAction(5); expect(clip.count).toBe(1);
  });
});
