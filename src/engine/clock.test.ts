import { describe, expect, it } from 'vitest';
import { FrameClock } from './clock';

describe('FrameClock', () => {
  it('starts at frame 0 and playing', () => {
    const clock = new FrameClock(24, 100);
    expect(clock.frame).toBe(0);
    expect(clock.playing).toBe(true);
    expect(clock.stoppedByScript).toBe(false);
  });

  it('advances the frame by one tick at the frame rate', () => {
    const clock = new FrameClock(24, 100);
    const spf = 1000 / 24;
    const advanced = clock.tick(spf);
    expect(advanced).toBe(1);
    expect(clock.frame).toBe(1);
  });

  it('does not advance if not enough time has passed', () => {
    const clock = new FrameClock(24, 100);
    const spf = 1000 / 24;
    const advanced = clock.tick(spf * 0.5);
    expect(advanced).toBe(0);
    expect(clock.frame).toBe(0);
  });

  it('advances multiple frames if enough time has passed (capped at 8)', () => {
    const clock = new FrameClock(24, 100);
    const spf = 1000 / 24;
    const advanced = clock.tick(spf * 3);
    expect(advanced).toBe(3);
    expect(clock.frame).toBe(3);
  });

  it('caps frame advancement at 8 frames per tick (spiral-of-death protection)', () => {
    const clock = new FrameClock(24, 1000);
    const spf = 1000 / 24;
    const advanced = clock.tick(spf * 100);
    expect(advanced).toBe(8);
    expect(clock.frame).toBe(8);
  });

  it('wraps around at totalFrames', () => {
    const clock = new FrameClock(24, 10);
    clock.frame = 9;
    clock.tick(1000 / 24);
    expect(clock.frame).toBe(0);
  });

  it('does not advance when paused', () => {
    const clock = new FrameClock(24, 100);
    clock.pause();
    expect(clock.playing).toBe(false);
    const advanced = clock.tick(1000 / 24);
    expect(advanced).toBe(0);
    expect(clock.frame).toBe(0);
  });

  it('does not advance when stopped by script', () => {
    const clock = new FrameClock(24, 100);
    clock.stop();
    expect(clock.stoppedByScript).toBe(true);
    const advanced = clock.tick(1000 / 24);
    expect(advanced).toBe(0);
    expect(clock.frame).toBe(0);
  });

  it('resets to frame 0 and playing', () => {
    const clock = new FrameClock(24, 100);
    clock.frame = 50;
    clock.stop();
    clock.reset();
    expect(clock.frame).toBe(0);
    expect(clock.playing).toBe(true);
    expect(clock.stoppedByScript).toBe(false);
  });

  it('gotos a specific frame (clamped to bounds)', () => {
    const clock = new FrameClock(24, 100);
    clock.goto(50);
    expect(clock.frame).toBe(50);
    clock.goto(200);
    expect(clock.frame).toBe(99);
    clock.goto(-1);
    expect(clock.frame).toBe(0);
  });

  it('pause then tick does not advance', () => {
    const clock = new FrameClock(24, 100);
    clock.frame = 10;
    clock.pause();
    clock.tick(1000 / 24);
    expect(clock.frame).toBe(10);
    expect(clock.playing).toBe(false);
  });

  it('clamps totalFrames to at least 1', () => {
    const clock = new FrameClock(24, 0);
    expect(clock.totalFrames).toBe(1);
  });

  it('clamps frameRate to at least 1', () => {
    const clock = new FrameClock(0, 100);
    expect(clock.frameRate).toBe(1);
  });
});
