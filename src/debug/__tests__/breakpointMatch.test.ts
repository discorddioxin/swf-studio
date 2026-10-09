import { describe, expect, it } from 'vitest';
import { as2LabelMatchesBreakpoint, flashLabelMatchesBreakpoint, normalizePath, pathsEqual } from '../breakpointMatch';
import type { BreakpointLike } from '../breakpointMatch';

function bp(path: string, line = 1): BreakpointLike { return { path, line, enabled: true, id: `bp-${path}:${line}` }; }

describe('normalizePath / pathsEqual — audit P1', () => {
  it('normalizes ./ and case and suffix', () => {
    expect(normalizePath('./timelines/root.ts')).toBe('timelines/root.ts');
    expect(pathsEqual('timelines/root.ts', './timelines/root.ts')).toBe(true);
    expect(pathsEqual('src/timelines/root.ts', 'timelines/root.ts')).toBe(true);
    expect(pathsEqual('TIMELINES/ROOT.TS', 'timelines/root.ts')).toBe(true);
    expect(pathsEqual('timelines/hero_ball.ts', 'timelines/hero_ball.ts')).toBe(true);
    expect(pathsEqual('timelines/hero_ball.ts', 'timelines/other.ts')).toBe(false);
  });
});

describe('as2LabelMatchesBreakpoint — shared matcher', () => {
  it('root timeline', () => {
    expect(as2LabelMatchesBreakpoint('_root frame 1', bp('timelines/root.ts'))).toBe(true);
    expect(as2LabelMatchesBreakpoint('Main Timeline frame 1', bp('timelines/root.ts'))).toBe(true);
    expect(as2LabelMatchesBreakpoint('init action of the main timeline', bp('timelines/root.ts'))).toBe(true);
    expect(as2LabelMatchesBreakpoint('_root frame 1', bp('timelines/sprite_10.ts'))).toBe(false);
  });
  it('sprite numeric', () => {
    expect(as2LabelMatchesBreakpoint('_level0.hero_ball (sprite 10) frame 3', bp('timelines/sprite_10.ts'))).toBe(true);
    expect(as2LabelMatchesBreakpoint('init action of sprite 10', bp('timelines/sprite_10.ts'))).toBe(true);
    expect(as2LabelMatchesBreakpoint('_level0.hero_ball (sprite 10) frame 3', bp('timelines/sprite_11.ts'))).toBe(false);
  });
  it('human-named timeline falls back to any sprite', () => {
    expect(as2LabelMatchesBreakpoint('_level0.fisher (sprite 18) frame 2', bp('timelines/fisher_front.ts'))).toBe(true);
    expect(as2LabelMatchesBreakpoint('_root frame 1', bp('timelines/fisher_front.ts'))).toBe(false);
  });
  it('buttons and init', () => {
    expect(as2LabelMatchesBreakpoint('on(release) of button 40', bp('buttons/button_40.ts'))).toBe(true);
    expect(as2LabelMatchesBreakpoint('_root frame 1', bp('buttons/button_40.ts'))).toBe(false);
    expect(as2LabelMatchesBreakpoint('init action of sprite 10', bp('init/action_1.ts'))).toBe(true);
    expect(as2LabelMatchesBreakpoint('_root frame 1', bp('init/action_1.ts'))).toBe(false);
    expect(as2LabelMatchesBreakpoint('init action "Fisher"', bp('init/Fisher.ts'))).toBe(true);
  });
  it('classes', () => {
    expect(as2LabelMatchesBreakpoint('constructor of com.gaia.Fisher', bp('classes/com/gaia/Fisher.ts'))).toBe(true);
    expect(as2LabelMatchesBreakpoint('_root frame 1', bp('classes/com/gaia/Fisher.ts'))).toBe(false);
  });
  it('no generic .ts+frame fallback', () => {
    expect(as2LabelMatchesBreakpoint('_root frame 1', bp('classes/com/foo/Random.ts'))).toBe(false);
    expect(as2LabelMatchesBreakpoint('_root frame 1', bp('some/random.ts'))).toBe(false);
  });
});

describe('flashLabelMatchesBreakpoint', () => {
  it('matches AS3 timeline/class labels', () => {
    expect(flashLabelMatchesBreakpoint('timeline of Hero', bp('timelines/hero.ts'))).toBe(true);
    expect(flashLabelMatchesBreakpoint('frame 2 script of root', bp('timelines/root.ts'))).toBe(true);
    expect(flashLabelMatchesBreakpoint('constructor of com.foo.Bar', bp('classes/com/foo/Bar.ts'))).toBe(true);
  });
});
