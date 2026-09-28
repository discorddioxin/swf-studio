import { describe, expect, it } from 'vitest';
import { resolveActionScriptFile, resolveAssetFile } from './assets';
import type { AssetBundle, AssetFile } from '../types';

const file = (path: string): AssetFile => {
  const base = path.split('/').pop()!;
  const dot = base.lastIndexOf('.');
  return { path, name: base.slice(0, dot), ext: base.slice(dot + 1), category: 'other' as AssetFile['category'], file: new File([''], base) };
};
const bundle = (...paths: string[]): AssetBundle =>
  ({ rootName: 'dump', xmlName: 'x.xml', files: paths.map(file), byId: new Map(), byPath: new Map() });

describe('ActionScript file resolution', () => {
  const b = bundle('scripts/DefineSprite_10/frame_13/DoAction.as', 'scripts/HeroBall.as');

  it('resolves a frame script by owner and frame', () => {
    expect(resolveActionScriptFile(b, { characterId: 10, kind: 'sprite' }, 12, 'DoActionTag')?.path)
      .toBe('scripts/DefineSprite_10/frame_13/DoAction.as');
  });

  it("does not attach another timeline's DoAction.as by basename (CI-15)", () => {
    const candidates = ['scripts/frame_25/DoAction.as', 'scripts/MainTimeline/frame_25/DoAction.as'];
    expect(resolveActionScriptFile(b, { characterId: undefined, kind: 'root' } as never, 24, 'DoActionTag', candidates)).toBeUndefined();
    expect(resolveAssetFile(b, 'somewhere/else/DoInitAction.as')).toBeUndefined();
  });

  it('still falls back to a unique, specifically named script', () => {
    expect(resolveAssetFile(b, 'other/root/HeroBall.as')?.path).toBe('scripts/HeroBall.as');
  });
});
