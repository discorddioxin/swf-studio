// P-04: the shared filter / blend compositor. Pixel tests on raw RGBA buffers
// (the filter maths), then on real canvases (@napi-rs/canvas) for the layer
// glue and the blend modes.
import { beforeAll, describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { applyFilter, applyFilters, composite, compositeStats, filterPadding, invalidateLayers, needsComposite, setCanvasFactory, type Pixels } from './compositor';
import type { SwfFilter } from '@/types';

type Rgba = [number, number, number, number];

/** w×h transparent, with an opaque square of `color` at [x0, x0+size) × [y0, y0+size). */
function square(w: number, h: number, x0: number, y0: number, size: number, color: Rgba = [255, 0, 0, 255]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) data.set(color, (y * w + x) * 4);
  return { width: w, height: h, data };
}
const at = (p: Pixels, x: number, y: number): Rgba => Array.from(p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)) as Rgba;

const shadow = (o: Partial<Extract<SwfFilter, { kind: 'dropShadow' }>> = {}): SwfFilter => ({
  kind: 'dropShadow', color: 0x000000, alpha: 1, blurX: 0, blurY: 0, angle: 45, distance: 4, strength: 1, quality: 1,
  inner: false, knockout: false, hideObject: false, ...o,
});

const RED: Rgba = [255, 0, 0, 255], BLACK: Rgba = [0, 0, 0, 255], NONE: Rgba = [0, 0, 0, 0];

describe('filters on pixels', () => {
  // 20×20 red square at (8, 8); distance 4 at 45° is (2.83, 2.83): the shadow lands 3 px right and down
  const src = square(40, 40, 8, 8, 20);

  it('DropShadow: the shadow sits at the angle/distance offset, under the object', () => {
    const out = applyFilter(src, shadow());
    expect(at(out, 10, 10)).toEqual(RED); // the object
    expect(at(out, 27, 27)).toEqual(RED); // the object covers its shadow
    expect(at(out, 29, 29)).toEqual(BLACK); // shadow only (11..30)
    expect(at(out, 30, 30)).toEqual(BLACK);
    expect(at(out, 31, 31)).toEqual(NONE);
    expect(at(out, 10, 29)).toEqual(NONE); // left of the shadow
    expect(at(out, 29, 9)).toEqual(NONE); // above the shadow
  });

  it('DropShadow: alpha and strength scale the shadow; knockout and hideObject remove the object', () => {
    expect(at(applyFilter(src, shadow({ alpha: 0.5 })), 30, 30)).toEqual([0, 0, 0, 128]);
    expect(at(applyFilter(src, shadow({ alpha: 0.5, strength: 2 })), 30, 30)).toEqual([0, 0, 0, 128]); // alpha clamps before the colour alpha
    const knock = applyFilter(src, shadow({ knockout: true }));
    expect([at(knock, 20, 20), at(knock, 30, 30)]).toEqual([NONE, BLACK]);
    const hide = applyFilter(src, shadow({ hideObject: true }));
    expect([at(hide, 20, 20), at(hide, 9, 9)]).toEqual([BLACK, NONE]);
  });

  it('inner DropShadow: dark along the edges facing the light, inside the object only', () => {
    const out = applyFilter(src, shadow({ inner: true }));
    expect(at(out, 9, 9)).toEqual(BLACK); // top-left inner edge
    expect(at(out, 26, 26)).toEqual(RED); // the far side keeps the object
    expect(at(out, 6, 6)).toEqual(NONE); // nothing outside
  });

  it('Glow: a soft halo outside, fading with the distance; the object unchanged', () => {
    const glow: SwfFilter = { kind: 'glow', color: 0x00ff00, alpha: 1, blurX: 8, blurY: 8, strength: 1, quality: 1, inner: false, knockout: false };
    const out = applyFilter(src, glow);
    expect(at(out, 18, 18)).toEqual(RED);
    const near = at(out, 7, 18), far = at(out, 5, 18);
    expect(near.slice(0, 3)).toEqual([0, 255, 0]);
    expect(near[3]).toBeGreaterThan(far[3]);
    expect(far[3]).toBeGreaterThan(0);
    expect(at(out, 1, 18)).toEqual(NONE);
  });

  it('Blur: spreads the edges, keeps the total coverage', () => {
    const out = applyFilter(src, { kind: 'blur', blurX: 6, blurY: 6, quality: 2 });
    const total = (p: Pixels) => { let s = 0; for (let i = 3; i < p.data.length; i += 4) s += p.data[i]; return s; };
    expect(Math.abs(total(out) - total(src)) / total(src)).toBeLessThan(0.01);
    expect(at(out, 18, 18)).toEqual(RED);
    expect(at(out, 6, 18)[3]).toBeGreaterThan(0);
    expect(at(out, 6, 18).slice(0, 3)).toEqual([255, 0, 0]); // premultiplied blur: no dark fringe
  });

  it('Bevel: highlight on the lit edge, shadow on the far edge (inner), centre unchanged', () => {
    const bevel: SwfFilter = { kind: 'bevel', highlightColor: 0xffffff, highlightAlpha: 1, shadowColor: 0x000000, shadowAlpha: 1,
      blurX: 4, blurY: 4, angle: 45, distance: 2, strength: 1, quality: 1, knockout: false, type: 'inner' };
    const out = applyFilter(src, bevel);
    // box radius 2 (window 5), offset round(1.41) = 1: at the corner A(7,7) = (2/5)², A(9,9) = (4/5)²,
    // so the highlight is 0.64 − 0.16 = 0.48 of white over the red
    const lit = at(out, 8, 8), dark = at(out, 27, 27);
    expect(lit).toEqual([255, 122, 122, 255]);
    expect(dark).toEqual([133, 0, 0, 255]); // the same 0.48 of black
    expect(at(out, 8, 27)).toEqual(RED); // the edges along the light direction cancel
    expect(at(out, 18, 18)).toEqual(RED);
    expect(at(out, 5, 5)).toEqual(NONE); // inner: nothing outside
    const outer = applyFilter(src, { ...bevel, type: 'outer' });
    expect(at(outer, 18, 18)).toEqual(RED);
    expect(at(outer, 29, 29)[3]).toBeGreaterThan(0); // outer shadow side
  });

  it('GradientBevel / GradientGlow look their colour up by the bevel value / the glow strength', () => {
    const gb: SwfFilter = { kind: 'gradientBevel', colors: [0xffffff, 0x000000, 0x000000], alphas: [1, 0, 1], ratios: [0, 128, 255],
      blurX: 4, blurY: 4, angle: 45, distance: 2, strength: 1, quality: 1, knockout: false, type: 'inner' };
    const out = applyFilter(src, gb);
    const lit = at(out, 8, 8), dark = at(out, 27, 27);
    // index 128 − 0.48·127 = 67: halfway from the white (alpha 1) stop to the clear one
    expect(lit[1]).toBeGreaterThan(0); // white mixed into the red
    expect(lit[1]).toBe(lit[2]);
    expect(dark[0]).toBeLessThan(255); // toward the black shadow stop
    expect(dark[1]).toBe(0);
    expect(at(out, 18, 18)).toEqual(RED); // ratio 128 has alpha 0
    const gg: SwfFilter = { kind: 'gradientGlow', colors: [0x00ff00, 0x00ff00], alphas: [0, 1], ratios: [0, 255],
      blurX: 8, blurY: 8, angle: 0, distance: 0, strength: 1, quality: 1, knockout: false, type: 'outer' };
    const glow = applyFilter(src, gg);
    expect(at(glow, 7, 18).slice(0, 3)).toEqual([0, 255, 0]);
    expect(at(glow, 18, 18)).toEqual(RED);
  });

  it('ColorMatrix and Convolution', () => {
    const grey = applyFilter(src, { kind: 'colorMatrix', matrix: [0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0, 0, 0, 1, 0] });
    expect(at(grey, 18, 18)).toEqual([76, 76, 76, 255]); // 76.5 rounds half to even
    const offset = applyFilter(src, { kind: 'colorMatrix', matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 100, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] });
    expect(at(offset, 18, 18)).toEqual([255, 100, 0, 255]);
    const identity: SwfFilter = { kind: 'convolution', matrixX: 3, matrixY: 3, matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0], divisor: 1, bias: 0, preserveAlpha: false, clamp: true, color: 0, alpha: 0 };
    expect(applyFilter(src, identity).data).toEqual(src.data);
    const shiftLeft = applyFilter(src, { ...identity, matrix: [0, 0, 0, 0, 0, 1, 0, 0, 0] });
    expect([at(shiftLeft, 7, 10), at(shiftLeft, 27, 10)]).toEqual([RED, NONE]);
  });

  it('filters chain in order, and the padding covers what they can draw', () => {
    const chain = applyFilters(src, [shadow(), { kind: 'colorMatrix', matrix: [0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0] }]);
    expect(at(chain, 30, 30)).toEqual(RED); // the shadow, recoloured
    expect(filterPadding([shadow()], 1)).toBe(5);
    expect(filterPadding([shadow({ blurX: 8, blurY: 4, quality: 2 })], 2)).toBe(8 * 2 + 8 + 1);
    expect(filterPadding([{ kind: 'colorMatrix', matrix: [] }], 1)).toBe(0);
    expect([needsComposite(undefined, 'normal'), needsComposite([], 'multiply'), needsComposite([shadow()], undefined)]).toEqual([false, true, true]);
  });
});

describe('composite on a canvas', () => {
  beforeAll(() => setCanvasFactory((w, h) => createCanvas(w, h) as never));

  const target = (bg?: string) => {
    const c = createCanvas(60, 60);
    const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D;
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, 60, 60); }
    return { ctx, px: (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data) };
  };
  const redSquare = (l: CanvasRenderingContext2D) => { l.fillStyle = '#ff0000'; l.fillRect(10, 10, 20, 20); };
  const bounds = { xMin: 10, yMin: 10, xMax: 30, yMax: 30 };

  it('20×20 red square + DropShadow(distance 4, angle 45): shadow pixels at the offset', () => {
    const { ctx, px } = target();
    expect(composite(ctx, { filters: [shadow()], bounds, filterScale: 1, paint: redSquare })).toBe(true);
    expect(px(12, 12)).toEqual(RED);
    expect(px(31, 31)).toEqual(BLACK); // 13..32
    expect(px(32, 32)).toEqual(BLACK);
    expect(px(33, 33)).toEqual(NONE);
    expect(px(31, 12)).toEqual(NONE);
  });

  it('filter sizes follow the view scale, not the object transform', () => {
    const view = target();
    view.ctx.scale(2, 2); // the view: 2 device px per stage px
    composite(view.ctx, { filters: [shadow()], bounds: { xMin: 5, yMin: 5, xMax: 15, yMax: 15 }, filterScale: 2,
      paint: (l) => { l.fillStyle = '#ff0000'; l.fillRect(5, 5, 10, 10); } });
    expect(view.px(35, 35)).toEqual(BLACK); // object 10..30, shadow +6 → 16..36
    expect(view.px(37, 37)).toEqual(NONE);
    const obj = target();
    obj.ctx.scale(2, 2); // the object scaled ×2 at a 1:1 view: the shadow stays 3 px
    composite(obj.ctx, { filters: [shadow()], bounds: { xMin: 5, yMin: 5, xMax: 15, yMax: 15 }, filterScale: 1,
      paint: (l) => { l.fillStyle = '#ff0000'; l.fillRect(5, 5, 10, 10); } });
    expect(obj.px(32, 32)).toEqual(BLACK);
    expect(obj.px(33, 33)).toEqual(NONE);
  });

  it('the parent alpha applies after the filters; the layer starts at alpha 1', () => {
    const { ctx, px } = target();
    ctx.globalAlpha = 0.5;
    let inner = -1;
    composite(ctx, { filters: [shadow()], bounds, filterScale: 1, paint: (l) => { inner = l.globalAlpha; redSquare(l); } });
    expect(inner).toBe(1);
    expect(px(12, 12)).toEqual([255, 0, 0, 128]);
    expect(px(31, 31)).toEqual([0, 0, 0, 128]);
  });

  it('multiply over white is the source; over grey it darkens', () => {
    const white = target('#ffffff');
    composite(white.ctx, { blendMode: 'multiply', bounds, filterScale: 1, paint: redSquare });
    expect(white.px(15, 15)).toEqual(RED);
    expect(white.px(40, 40)).toEqual([255, 255, 255, 255]);
    const grey = target('#808080');
    composite(grey.ctx, { blendMode: 'multiply', bounds, filterScale: 1, paint: redSquare });
    expect(grey.px(15, 15)).toEqual([128, 0, 0, 255]);
  });

  it('screen, add, lighten, darken, difference, overlay, hardlight', () => {
    const run = (mode: string, bg: string, fg: string) => {
      const t = target(bg);
      composite(t.ctx, { blendMode: mode, bounds, filterScale: 1, paint: (l) => { l.fillStyle = fg; l.fillRect(10, 10, 20, 20); } });
      return t.px(15, 15);
    };
    expect(run('screen', '#808080', '#808080')).toEqual([192, 192, 192, 255]);
    expect(run('add', '#404040', '#202020')).toEqual([96, 96, 96, 255]);
    expect(run('lighten', '#204060', '#402010')).toEqual([64, 64, 96, 255]);
    expect(run('darken', '#204060', '#402010')).toEqual([32, 32, 16, 255]);
    expect(run('difference', '#c08040', '#4080c0')).toEqual([128, 0, 128, 255]);
    expect(run('overlay', '#ffffff', '#000000')).toEqual([255, 255, 255, 255]);
    expect(run('hardlight', '#ffffff', '#000000')).toEqual([0, 0, 0, 255]);
    expect(run('layer', '#ffffff', '#ff0000')).toEqual(RED);
  });

  it('invert and subtract (no canvas operation: built from difference and add)', () => {
    const inv = target('#0000ff');
    composite(inv.ctx, { blendMode: 'invert', bounds, filterScale: 1, paint: redSquare });
    expect(inv.px(15, 15)).toEqual([255, 255, 0, 255]);
    expect(inv.px(40, 40)).toEqual([0, 0, 255, 255]);
    const sub = target('#c86432');
    composite(sub.ctx, { blendMode: 'subtract', bounds, filterScale: 1, paint: (l) => { l.fillStyle = '#323232'; l.fillRect(10, 10, 20, 20); } });
    expect(sub.px(15, 15)).toEqual([150, 50, 0, 255]);
    expect(sub.px(40, 40)).toEqual([200, 100, 50, 255]);
  });

  it('alpha / erase cut into the enclosing layer, and draw nothing straight onto the stage', () => {
    const stage = target('#00ff00');
    expect(composite(stage.ctx, { blendMode: 'erase', bounds, filterScale: 1, paint: redSquare })).toBe(false);
    expect(stage.px(15, 15)).toEqual([0, 255, 0, 255]);
    const t = target('#00ff00');
    composite(t.ctx, { blendMode: 'layer', filterScale: 1, paint: (l) => {
      l.fillStyle = '#0000ff'; l.fillRect(0, 0, 60, 60);
      composite(l, { blendMode: 'erase', bounds, filterScale: 1, paint: redSquare });
    } });
    expect(t.px(15, 15)).toEqual([0, 255, 0, 255]); // the hole shows the stage
    expect(t.px(40, 40)).toEqual([0, 0, 255, 255]);
    const a = target('#00ff00');
    composite(a.ctx, { blendMode: 'layer', filterScale: 1, paint: (l) => {
      l.fillStyle = '#0000ff'; l.fillRect(0, 0, 60, 60);
      composite(l, { blendMode: 'alpha', bounds, filterScale: 1, paint: redSquare });
    } });
    expect(a.px(15, 15)).toEqual([0, 0, 255, 255]); // the layer kept where the alpha object is
    expect(a.px(40, 40)).toEqual([0, 255, 0, 255]);
  });

  it('a cached layer is reused while its key, the device transform and the filters stay the same', () => {
    const owner = {};
    let painted = 0;
    const paint = (l: CanvasRenderingContext2D) => { painted++; redSquare(l); };
    const draw = (key: string, ctx = target().ctx, filters = [shadow()]) => {
      composite(ctx, { filters, bounds, filterScale: 1, paint, cache: { owner, key } });
      return ctx;
    };
    const reused = compositeStats.reused;
    const first = draw('a');
    const again = draw('a');
    expect(painted).toBe(1);
    expect(compositeStats.reused).toBe(reused + 1);
    // the reused layer draws the same pixels
    expect(Array.from(again.getImageData(0, 0, 60, 60).data)).toEqual(Array.from(first.getImageData(0, 0, 60, 60).data));
    draw('b'); // the subtree changed
    expect(painted).toBe(2);
    const moved = target().ctx; moved.translate(5, 0);
    draw('b', moved); // the object moved
    expect(painted).toBe(3);
    draw('b', moved, [shadow({ distance: 8 })]); // other filters
    expect(painted).toBe(4);
    draw('b', moved, [shadow({ distance: 8 })]);
    expect(painted).toBe(4);
    invalidateLayers(); // an image or a font arrived
    draw('b', moved, [shadow({ distance: 8 })]);
    expect(painted).toBe(5);
    // one owner drawn twice a frame with different results keeps both
    draw('c'); draw('d'); draw('c'); draw('d');
    expect(painted).toBe(7);
    // no cache entry: always painted
    composite(target().ctx, { filters: [shadow()], bounds, filterScale: 1, paint });
    composite(target().ctx, { filters: [shadow()], bounds, filterScale: 1, paint });
    expect(painted).toBe(9);
  });
});
