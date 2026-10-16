// @vitest-environment jsdom
// P-04: the Workbench preview (src/lib/render.ts), the AS2 player and the AS3
// player draw the same frame with the same filters and blend modes — all three
// go through src/lib/compositor.ts. Real canvases (@napi-rs/canvas); the shapes'
// images come from a stand-in asset source (solid squares the size of the shape
// bounds), so what differs between the renderers is only how they walk the
// display list and hand subtrees to the compositor.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { parseSwfXml } from './parser';
import { drawTimeline } from './render';
import { setCanvasFactory } from './compositor';
import type { AssetCache, LoadedAsset } from './assets';
import type { Rect } from '@/types';
import { AS2Player } from '@/engine/as2/player';
import { buildAS2Program } from '@/engine/as2/program';
import { FlashPlayer } from '@/engine/flash/player';
import { compileSources, linkProgram } from '@/engine/flash/loader';
import { runtime } from '@/engine/flash/context';

const W = 200, H = 150;
const M = (tx: number, ty: number) => `<matrix type="MATRIX" hasScale="false" hasRotate="false" translateX="${tx * 20}" translateY="${ty * 20}"/>`;
const RGBA = (field: string, r: number, g: number, b: number, a: number) => `<${field} type="RGBA" red="${r}" green="${g}" blue="${b}" alpha="${a}"/>`;
const SHADOW = `<item type="DROPSHADOWFILTER" angle="0.7853981633974483" blurX="0.0" blurY="0.0" compositeSource="true" distance="4.0" innerShadow="false" knockout="false" passes="1" strength="1.0">${RGBA('dropShadowColor', 0, 0, 0, 255)}</item>`;
const GLOW = `<item type="GLOWFILTER" blurX="6.0" blurY="6.0" compositeSource="true" innerGlow="false" knockout="false" passes="1" strength="1.0">${RGBA('glowColor', 0, 255, 0, 255)}</item>`;
const P3 = (depth: number, id: number, x: number, y: number, extra: string, inner = '') =>
  `<item type="PlaceObject3Tag" placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagMove="false" depth="${depth}" characterId="${id}" ${extra}>${M(x, y)}${inner}</item>`;

// shape 1: 40×40 red, shape 2: 40×40 blue; sprite 10 holds shape 1
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="10" frameRate="12" frameCount="1">
  <displayRect type="RECT" Xmin="0" Ymin="0" Xmax="${W * 20}" Ymax="${H * 20}"/>
  <tags>
    <item type="SetBackgroundColorTag"><backgroundColor type="RGB" red="255" green="255" blue="255"/></item>
    <item type="DefineShapeTag" shapeId="1"><shapeBounds type="RECT" Xmin="0" Ymin="0" Xmax="800" Ymax="800"/></item>
    <item type="DefineShapeTag" shapeId="2"><shapeBounds type="RECT" Xmin="0" Ymin="0" Xmax="800" Ymax="800"/></item>
    <item type="DefineSpriteTag" spriteId="10" frameCount="1"><subTags>
      <item type="PlaceObject2Tag" depth="1" characterId="1" placeFlagHasCharacter="true" placeFlagHasMatrix="true">${M(0, 0)}</item>
      <item type="ShowFrameTag"/>
    </subTags></item>
    ${P3(1, 2, 20, 20, '')}
    ${P3(2, 1, 30, 30, 'placeFlagHasFilterList="true"', `<surfaceFilterList>${SHADOW}</surfaceFilterList>`)}
    ${P3(3, 2, 110, 20, '')}
    ${P3(4, 1, 120, 30, 'placeFlagHasBlendMode="true" blendMode="3"')}
    ${P3(5, 10, 20, 90, 'placeFlagHasFilterList="true" name="glowing"', `<surfaceFilterList>${GLOW}</surfaceFilterList>`)}
    <item type="ShowFrameTag"/>
  </tags>
</swf>`;

const COLORS: Record<number, string> = { 1: '#ff0000', 2: '#0000ff' };
const images = new Map<number, Canvas>();
const assets = {
  get(id: number, _kind: string, bounds?: Rect): LoadedAsset {
    if (!bounds || !COLORS[id]) return { status: 'error' };
    let img = images.get(id);
    if (!img) {
      img = createCanvas((bounds.xMax - bounds.xMin) / 20, (bounds.yMax - bounds.yMin) / 20);
      const c = img.getContext('2d'); c.fillStyle = COLORS[id]; c.fillRect(0, 0, img.width, img.height);
      images.set(id, img);
    }
    return { status: 'ready', img: img as unknown as HTMLImageElement,
      dest: { x: bounds.xMin, y: bounds.yMin, w: bounds.xMax - bounds.xMin, h: bounds.yMax - bounds.yMin } };
  },
  preview: () => undefined,
};

const target = () => {
  const c = createCanvas(W, H);
  return { c, ctx: c.getContext('2d') as unknown as CanvasRenderingContext2D };
};
const px = (ctx: CanvasRenderingContext2D, x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);

function workbench() {
  const doc = parseSwfXml(XML, { fileName: 'effects.xml' });
  const { ctx } = target();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.scale(1 / 20, 1 / 20);
  drawTimeline(ctx, {
    doc, cache: assets as unknown as AssetCache, timeline: doc.timelines.get('root')!, frame: 0,
    view: { zoom: 1, panX: 0, panY: 0 }, showOutlines: false, showMasks: false, background: '#ffffff', filterScale: 1,
  }, doc.timelines.get('root')!, 0, undefined, 0);
  return ctx;
}

function as2() {
  const doc = parseSwfXml(XML, { fileName: 'effects.xml' });
  const player = new AS2Player({ doc, program: buildAS2Program([]).program, assets });
  player.start();
  const { ctx } = target();
  player.renderTo(ctx, 1, 0, 0);
  return ctx;
}

let flash: FlashPlayer | null = null;
afterEach(() => { flash?.dispose(); flash = null; runtime.player = null; });
function as3() {
  const doc = parseSwfXml(XML, { fileName: 'effects.xml' });
  flash = new FlashPlayer({ doc, program: linkProgram(compileSources([])), assets });
  flash.start();
  const { ctx } = target();
  flash.render(ctx, 1, 0, 0);
  return ctx;
}

describe('filters and blend modes in all three renderers', () => {
  beforeAll(() => setCanvasFactory((w, h) => createCanvas(w, h) as never));

  const RED = [255, 0, 0, 255], BLUE = [0, 0, 255, 255], BLACK = [0, 0, 0, 255], WHITE = [255, 255, 255, 255];
  const expectations: [string, number, number, number[]][] = [
    // DropShadow on the red square at 30..70: the shadow is 3 px right and down (33..73)
    ['red square', 40, 40, RED],
    ['shadow beside it, over white', 71, 50, BLACK],
    ['shadow corner', 72, 72, BLACK],
    ['no shadow above the offset', 71, 31, WHITE],
    // multiply: red (120..160, 30..70) over blue (110..150, 20..60) and over white
    ['red × blue', 130, 40, BLACK],
    ['red × white', 155, 65, RED],
    ['blue alone', 115, 25, BLUE],
    // Glow on sprite 10 (its red square at 20..60, 90..130): green halo outside
    ['glowing sprite', 40, 110, RED],
    ['beyond the glow', 10, 110, WHITE],
  ];

  for (const [name, render] of [['Workbench', workbench], ['AS2', as2], ['AS3', as3]] as const) {
    it(`${name}: shadow offset, multiply, glow on a sprite`, () => {
      const ctx = render();
      for (const [what, x, y, rgba] of expectations) expect([what, px(ctx, x, y)]).toEqual([what, rgba]);
      const halo = px(ctx, 18, 110);
      expect(halo[1]).toBeGreaterThan(200); // green, blended over white
      expect(halo[0]).toBeLessThan(255);
    });
  }

  it('the three agree pixel for pixel', () => {
    const a = workbench().getImageData(0, 0, W, H).data;
    const b = as2().getImageData(0, 0, W, H).data;
    const c = as3().getImageData(0, 0, W, H).data;
    const diff = (x: Uint8ClampedArray, y: Uint8ClampedArray) => { let n = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 1) n++; return n; };
    expect(diff(a, b)).toBe(0);
    expect(diff(a, c)).toBe(0);
  });
});
