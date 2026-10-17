// @vitest-environment jsdom
// P-04 (AVM2): DisplayObject.filters / blendMode (flash.display.DisplayObject).
// Reads give copies; assigning copies the array; timeline PlaceObject3 filters
// read as flash.filters objects; blendMode takes BlendMode names only; what a
// script sets is drawn and the timeline no longer overrides it.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { parseSwfXml } from '../../../lib/parser';
import { setCanvasFactory } from '../../../lib/compositor';
import type { LoadedAsset } from '../../../lib/assets';
import type { Rect } from '../../../types';
import { compileSources, linkProgram } from '../loader';
import { FlashPlayer } from '../player';
import { runtime } from '../context';
import type { DisplayObject, MovieClip } from '../display';
import { BlurFilter, DropShadowFilter, GlowFilter } from '../misc';
import { PACKAGES } from '../packages';

const M = (tx: number, ty: number) => `<matrix type="MATRIX" hasScale="false" hasRotate="false" translateX="${tx * 20}" translateY="${ty * 20}"/>`;
const GLOW = `<item type="GLOWFILTER" blurX="6.0" blurY="6.0" compositeSource="true" innerGlow="false" knockout="false" passes="1" strength="2.0"><glowColor type="RGBA" red="0" green="255" blue="0" alpha="255"/></item>`;
const BLUR = `<item type="BLURFILTER" blurX="2.0" blurY="2.0" passes="1"/>`;
const P3 = (attrs: string, inner = '') => `<item type="PlaceObject3Tag" ${attrs}>${inner}</item>`;
// "box" (30, 30) plain; "lit" (120, 30) with a timeline Glow, which frame 2 replaces with a Blur
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="10" frameRate="12" frameCount="2">
  <displayRect type="RECT" Xmin="0" Ymin="0" Xmax="4000" Ymax="2000"/>
  <tags>
    <item type="DefineShapeTag" shapeId="1"><shapeBounds type="RECT" Xmin="0" Ymin="0" Xmax="800" Ymax="800"/></item>
    <item type="DefineSpriteTag" spriteId="10" frameCount="1"><subTags>
      <item type="PlaceObject2Tag" depth="1" characterId="1" placeFlagHasCharacter="true" placeFlagHasMatrix="true">${M(0, 0)}</item>
      <item type="ShowFrameTag"/>
    </subTags></item>
    <item type="PlaceObject2Tag" depth="1" characterId="10" placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagHasName="true" name="box">${M(30, 30)}</item>
    ${P3('depth="2" characterId="10" placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagHasName="true" name="lit" placeFlagHasFilterList="true"', `${M(120, 30)}<surfaceFilterList>${GLOW}</surfaceFilterList>`)}
    <item type="ShowFrameTag"/>
    ${P3('depth="2" placeFlagMove="true" placeFlagHasFilterList="true"', `<surfaceFilterList>${BLUR}</surfaceFilterList>`)}
    <item type="ShowFrameTag"/>
  </tags>
</swf>`;

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

let current: FlashPlayer | null = null;
afterEach(() => { current?.dispose(); current = null; runtime.player = null; });
function boot() {
  const doc = parseSwfXml(XML, { fileName: 'filters.swf' });
  const player = new FlashPlayer({ doc, program: linkProgram(compileSources([])), assets });
  current = player;
  player.start();
  const root = player.root as MovieClip;
  const child = (name: string) => root.getChildByName(name) as DisplayObject;
  const render = () => {
    const c = createCanvas(200, 100);
    const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D;
    player.render(ctx, 1, 0, 0);
    return (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
  };
  return { player, root, box: child('box'), lit: child('lit'), render };
}

describe('AS3 DisplayObject.filters / blendMode', () => {
  beforeAll(() => setCanvasFactory((w, h) => createCanvas(w, h) as never));

  it('flash.filters exposes the classes; BitmapFilterType / Quality constants', () => {
    const f = PACKAGES['flash.filters'];
    expect(f.GlowFilter).toBe(GlowFilter);
    expect(f.BitmapFilterType).toEqual({ INNER: 'inner', OUTER: 'outer', FULL: 'full' });
    expect(f.BitmapFilterQuality).toEqual({ LOW: 1, MEDIUM: 2, HIGH: 3 });
  });

  it('timeline filters read as filter objects, as copies', () => {
    const { lit } = boot();
    const [glow] = lit.filters as GlowFilter[];
    expect(glow).toBeInstanceOf(GlowFilter);
    expect([glow.blurX, glow.strength, glow.color]).toEqual([6, 2, 0x00ff00]);
    glow.blurX = 50;
    expect((lit.filters[0] as GlowFilter).blurX).toBe(6);
  });

  it('assigned filters are copied, drawn, and outlive timeline moves', () => {
    const { box, lit, render, root } = boot();
    const shadow = new DropShadowFilter(4, 45, 0, 1, 0, 0);
    box.filters = [shadow, 'not a filter'];
    shadow.distance = 60;
    expect(box.filters).toHaveLength(1);
    expect((box.filters[0] as DropShadowFilter).distance).toBe(4);
    const px = render();
    expect(px(71, 60)).toEqual([0, 0, 0, 255]); // shadow 3 px right / down of 30..70
    expect(px(71, 31)).toEqual([255, 255, 255, 255]);
    expect(px(117, 50)[1]).toBe(255); // the timeline glow
    // frame 2's move would replace lit's Glow (next test), but a script set lit's effects
    lit.blendMode = 'normal';
    root.gotoAndStop(2);
    expect(lit.filters[0]).toBeInstanceOf(GlowFilter);
    box.filters = [];
    expect(render()(71, 60)).toEqual([255, 255, 255, 255]);
  });

  it('a timeline move replaces the timeline filters', () => {
    const { lit, root } = boot();
    root.gotoAndStop(2);
    expect(lit.filters[0]).toBeInstanceOf(BlurFilter);
  });

  it('blendMode takes BlendMode names only, and is drawn', () => {
    const { box, render } = boot();
    expect(box.blendMode).toBe('normal');
    box.blendMode = 'MULTIPLY';
    expect(box.blendMode).toBe('normal');
    box.blendMode = 'bogus';
    expect(box.blendMode).toBe('normal');
    box.blendMode = 'invert';
    expect(box.blendMode).toBe('invert');
    expect(render()(40, 40)).toEqual([0, 0, 0, 255]); // white inverted
  });
});
