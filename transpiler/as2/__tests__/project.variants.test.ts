import { describe, expect, it } from 'vitest';
import { transpileProject } from '../project';

function mkSprite(id: number, frames: number[]) {
  return frames.map(f => ({ path: `scripts/DefineSprite_${id}/frame_${f}/DoAction.as`, content: 'stop();' }));
}

describe('project variants', () => {
  it('merges directional fish variants with --merge-variants', () => {
    const files = [
      { path: 'scripts/frame_1/DoAction.as', content: 'stop();' },
      ...mkSprite(9, [1,5]),
      ...mkSprite(18, [1,5]),
      ...mkSprite(19, [1,5]),
      ...mkSprite(24, [1,5]),
    ];
    const base = transpileProject(files);
    expect([...base.files.keys()].sort()).toContain('actors/_proposal.json');
    // without merge, should have 4 individual actors
    expect([...base.files.keys()].filter(k=>k.startsWith('actors/')).length).toBeGreaterThanOrEqual(4);

    const merged = transpileProject(files, { mergeVariants: true });
    const keys = [...merged.files.keys()].sort();
    expect(keys).toContain('actors/fish/FishActor.ts');
    expect(keys).toContain('actors/fish/animation/FrontLeft.ts');
    expect(keys).toContain('actors/fish/animation/FrontRight.ts');
    expect(keys).toContain('actors/fish/animation/BackLeft.ts');
    expect(keys).toContain('actors/fish/animation/BackRight.ts');
    // shims for original timelines
    expect(keys).toContain('timelines/sprite_9.ts');
    expect(merged.files.get('timelines/sprite_9.ts')).toContain('export * from');
    // individual fish actors should be suppressed
    expect(keys.filter(k=>k==='actors/sprite_9.ts' || k==='actors/sprite_18.ts').length).toBe(0);
    expect(merged.summary).toContain('FishActor');
  });
});
