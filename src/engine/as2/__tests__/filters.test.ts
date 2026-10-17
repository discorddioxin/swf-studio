// @vitest-environment jsdom
// P-04 (AVM1): Flash 8 `flash.filters` and MovieClip `filters` / `blendMode`.
// Frame scripts build filters (imported and fully qualified names), read them
// back as copies, read the timeline's PlaceObject3 filters as filter objects,
// and the player draws what they set.
import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { parseSwfXml } from '../../../lib/parser';
import { setCanvasFactory } from '../../../lib/compositor';
import type { LoadedAsset } from '../../../lib/assets';
import type { Rect } from '../../../types';
import { _global } from '@/runtime/as2';
import { buildAS2Program } from '../program';
import { AS2Player } from '../player';

const M = (tx: number, ty: number) => `<matrix type="MATRIX" hasScale="false" hasRotate="false" translateX="${tx * 20}" translateY="${ty * 20}"/>`;
const GLOW = `<item type="GLOWFILTER" blurX="6.0" blurY="6.0" compositeSource="true" innerGlow="false" knockout="false" passes="1" strength="2.0"><glowColor type="RGBA" red="0" green="255" blue="0" alpha="255"/></item>`;
// sprite 10 = a 40×40 red square; "box" at (30, 30) plain, "lit" at (120, 30) with a timeline Glow
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="8" frameRate="12" frameCount="1">
  <displayRect type="RECT" Xmin="0" Ymin="0" Xmax="4000" Ymax="2000"/>
  <tags>
    <item type="DefineShapeTag" shapeId="1"><shapeBounds type="RECT" Xmin="0" Ymin="0" Xmax="800" Ymax="800"/></item>
    <item type="DefineSpriteTag" spriteId="10" frameCount="1"><subTags>
      <item type="PlaceObject2Tag" depth="1" characterId="1" placeFlagHasCharacter="true" placeFlagHasMatrix="true">${M(0, 0)}</item>
      <item type="ShowFrameTag"/>
    </subTags></item>
    <item type="PlaceObject2Tag" depth="1" characterId="10" placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagHasName="true" name="box">${M(30, 30)}</item>
    <item type="PlaceObject3Tag" depth="2" characterId="10" placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagHasName="true" name="lit" placeFlagHasFilterList="true">${M(120, 30)}<surfaceFilterList>${GLOW}</surfaceFilterList></item>
    <item type="DoActionTag"/>
    <item type="ShowFrameTag"/>
  </tags>
</swf>`;

const SCRIPT = `
import flash.filters.DropShadowFilter;
var shadow = new DropShadowFilter(4, 45, 0x000000, 1, 0, 0);
box.filters = [shadow];
shadow.distance = 50;               // the clip keeps its own copy
var copy = box.filters;
copy[0].distance = 99;              // so does every read
_root.readBack = box.filters[0].distance;
_root.isShadow = box.filters[0] instanceof DropShadowFilter;
_root.qualified = new flash.filters.BlurFilter(2, 3).blurY;
var lit0 = lit.filters[0];
_root.timelineKind = lit0 instanceof flash.filters.GlowFilter;
_root.timelineBlur = lit0.blurX + "," + lit0.strength;
lit.blendMode = "bogus";            // ignored
_root.blendBefore = lit.blendMode;
lit.blendMode = 3;                  // BlendMode by number: multiply
_root.blendAfter = lit.blendMode;
`;

const images = new Map<number, Canvas>();
const assets = {
  get(id: number, _kind: string, bounds?: Rect): LoadedAsset {
    if (!bounds) return { status: 'error' };
    let img = images.get(id);
    if (!img) {
      img = createCanvas((bounds.xMax - bounds.xMin) / 20, (bounds.yMax - bounds.yMin) / 20);
      const c = img.getContext('2d'); c.fillStyle = '#ff0000'; c.fillRect(0, 0, img.width, img.height);
      images.set(id, img);
    }
    return { status: 'ready', img: img as unknown as HTMLImageElement, dest: { x: bounds.xMin, y: bounds.yMin, w: bounds.xMax - bounds.xMin, h: bounds.yMax - bounds.yMin } };
  },
  preview: () => undefined,
};

function boot() {
  const doc = parseSwfXml(XML, { fileName: 'filters.xml' });
  const build = buildAS2Program([{ path: 'scripts/frame_1/DoAction.as', text: SCRIPT }]);
  expect(build.errors).toEqual([]);
  const logs: string[] = [];
  const player = new AS2Player({ doc, program: build.program, assets, onLog: (e) => logs.push(`${e.level}: ${e.message}`) });
  player.start();
  return { player, root: player.root.obj as Record<string, unknown>, logs };
}

describe('AS2 flash.filters and MovieClip.filters / blendMode', () => {
  beforeAll(() => setCanvasFactory((w, h) => createCanvas(w, h) as never));

  it('_global.flash.filters holds the Flash 8 classes', () => {
    boot();
    const f = (_global as Record<string, any>).flash.filters;
    for (const name of ['BitmapFilter', 'DropShadowFilter', 'GlowFilter', 'BlurFilter', 'BevelFilter', 'GradientGlowFilter',
      'GradientBevelFilter', 'ConvolutionFilter', 'ColorMatrixFilter', 'DisplacementMapFilter']) expect(typeof f[name]).toBe('function');
  });

  it('scripts build, assign and read filters; reads are copies; timeline filters read as objects', () => {
    const { root, logs } = boot();
    expect(logs.filter((l) => l.startsWith('error'))).toEqual([]);
    expect(root.readBack).toBe(4);
    expect(root.isShadow).toBe(true);
    expect(root.qualified).toBe(3);
    expect(root.timelineKind).toBe(true);
    expect(root.timelineBlur).toBe('6,2');
    expect(root.blendBefore).toBe('normal');
    expect(root.blendAfter).toBe('multiply');
  });

  it('the player draws them: the script shadow and the timeline glow', () => {
    const { player } = boot();
    const c = createCanvas(200, 100);
    const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D;
    player.renderTo(ctx, 1, 0, 0);
    const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    expect(px(40, 40)).toEqual([255, 0, 0, 255]);
    expect(px(71, 60)).toEqual([0, 0, 0, 255]); // box's shadow, 3 px right / down of 30..70
    expect(px(71, 31)).toEqual([255, 255, 255, 255]);
    const halo = px(117, 50); // lit's glow, left of 120..160 (multiplied over white: unchanged)
    expect(halo[1]).toBe(255);
    expect(halo[0]).toBeLessThan(255);
  });
});
