// Surface filters and blend modes, shared by the three renderers (Workbench
// src/lib/render.ts, AS2 src/engine/as2/player.ts, AS3 src/engine/flash/player.ts).
//
// Flash draws a display object that has filters or a non-normal blend mode into
// an offscreen surface first: the object and its children, with its own colour
// transform and alpha; then each filter in order; then the surface onto what is
// below it with the blend mode, under the parent's alpha. `composite` does the
// same with a canvas: the renderer's `paint` draws the subtree into a layer in
// device pixels, the filters run on the layer's pixels, and the layer is drawn
// back with a canvas composite operation.
//
// Filter sizes (blur, distance) are stage pixels: they do not scale with the
// object's own transform, only with the view (`filterScale` = device pixels per
// stage pixel).
import type { BlendMode, FilterPlacement, SwfFilter } from '@/types';

/** ImageData's shape: non-premultiplied RGBA bytes, row-major. */
export interface Pixels { width: number; height: number; data: Uint8ClampedArray }

// ---------------------------------------------------------------------------
// filter pixel operations (pure)
// ---------------------------------------------------------------------------

/** Premultiplied RGBA in 0–1, four floats per pixel. */
type Premul = Float32Array;

function toPremul(px: Pixels): Premul {
  const n = px.width * px.height, d = px.data, out = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i += 4) {
    const a = d[i + 3] / 255;
    out[i] = (d[i] / 255) * a; out[i + 1] = (d[i + 1] / 255) * a; out[i + 2] = (d[i + 2] / 255) * a; out[i + 3] = a;
  }
  return out;
}

function fromPremul(f: Premul, width: number, height: number): Pixels {
  const n = width * height, data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n * 4; i += 4) {
    const a = Math.min(1, Math.max(0, f[i + 3]));
    if (a <= 0) continue;
    data[i] = Math.round((f[i] / a) * 255); data[i + 1] = Math.round((f[i + 1] / a) * 255);
    data[i + 2] = Math.round((f[i + 2] / a) * 255); data[i + 3] = Math.round(a * 255);
  }
  return { width, height, data };
}

function alphaPlane(f: Premul): Float32Array {
  const out = new Float32Array(f.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = f[i * 4 + 3];
  return out;
}

/** One box-blur pass along a row or column: window 2r+1, `fill` outside the buffer. */
function boxPass(src: Float32Array, w: number, h: number, r: number, horizontal: boolean, fill: number): Float32Array {
  const out = new Float32Array(src.length);
  const len = horizontal ? w : h, lines = horizontal ? h : w;
  const step = horizontal ? 1 : w, lineStep = horizontal ? w : 1;
  const win = 2 * r + 1;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    const at = (k: number) => (k < 0 || k >= len ? fill : src[base + k * step]);
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += at(k);
    for (let k = 0; k < len; k++) {
      out[base + k * step] = sum / win;
      sum += at(k + r + 1) - at(k - r);
    }
  }
  return out;
}

/** Box radius for a Flash blur amount (the box is `blur` pixels wide). */
const blurRadius = (blur: number, scale: number) => Math.max(0, Math.floor((blur * scale) / 2));

/** Flash's blur: `quality` box passes, horizontally then vertically. */
function blurPlane(p: Float32Array, w: number, h: number, blurX: number, blurY: number, quality: number, scale: number, fill = 0): Float32Array {
  const rx = blurRadius(blurX, scale), ry = blurRadius(blurY, scale);
  const passes = Math.max(1, Math.min(15, Math.round(quality)));
  let out = p;
  for (let i = 0; i < passes; i++) {
    if (rx > 0) out = boxPass(out, w, h, rx, true, fill);
    if (ry > 0) out = boxPass(out, w, h, ry, false, fill);
  }
  return out;
}

/** out(p) = src(p − (dx, dy)), rounded to whole pixels; `fill` where it comes from outside. */
function shiftPlane(p: Float32Array, w: number, h: number, dx: number, dy: number, fill = 0): Float32Array {
  const ix = Math.round(dx), iy = Math.round(dy);
  if (!ix && !iy) return p;
  const out = new Float32Array(p.length);
  for (let y = 0; y < h; y++) {
    const sy = y - iy;
    for (let x = 0; x < w; x++) {
      const sx = x - ix;
      out[y * w + x] = sx < 0 || sy < 0 || sx >= w || sy >= h ? fill : p[sy * w + sx];
    }
  }
  return out;
}

const rgb01 = (c: number) => [((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255] as const;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The offset a filter's angle and distance give, in device pixels. */
function offsetOf(angle: number, distance: number, scale: number): [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [Math.cos(rad) * distance * scale, Math.sin(rad) * distance * scale];
}

/**
 * DropShadow, Glow and GradientGlow share this: a blurred, offset copy of the
 * alpha (of its inverse for inner), scaled by strength, coloured — by one colour
 * or a gradient lookup — and put under, onto or instead of the object.
 */
function shadowLike(
  src: Premul, w: number, h: number, scale: number,
  o: { blurX: number; blurY: number; quality: number; strength: number; angle: number; distance: number;
    placement: FilterPlacement; knockout: boolean; hideObject: boolean;
    color: (v: number) => readonly [number, number, number, number] },
): Premul {
  const a = alphaPlane(src);
  const inner = o.placement === 'inner';
  const fill = inner ? 1 : 0;
  let base = a;
  if (inner) { base = new Float32Array(a.length); for (let i = 0; i < a.length; i++) base[i] = 1 - a[i]; }
  const [dx, dy] = offsetOf(o.angle, o.distance, scale);
  const shifted = shiftPlane(base, w, h, dx, dy, fill);
  const blurred = blurPlane(shifted, w, h, o.blurX, o.blurY, o.quality, scale, fill);
  const out = new Float32Array(src.length);
  for (let i = 0, j = 0; j < a.length; i += 4, j++) {
    const [r, g, b, ca] = o.color(clamp01(blurred[j] * o.strength));
    const sa = ca; // shadow alpha (premultiplied colour = rgb * sa)
    const da = a[j];
    if (o.placement === 'full') {
      // shadow drawn over the object everywhere (gradient filters' "full")
      const keep = o.knockout ? 0 : 1 - sa;
      out[i] = r * sa + src[i] * keep; out[i + 1] = g * sa + src[i + 1] * keep; out[i + 2] = b * sa + src[i + 2] * keep;
      out[i + 3] = sa + (o.knockout ? 0 : da * (1 - sa));
    } else if (inner) {
      const m = sa * da; // inside the object only
      if (o.knockout || o.hideObject) { out[i] = r * m; out[i + 1] = g * m; out[i + 2] = b * m; out[i + 3] = m; }
      else { // shadow atop the object
        out[i] = r * m + src[i] * (1 - sa); out[i + 1] = g * m + src[i + 1] * (1 - sa); out[i + 2] = b * m + src[i + 2] * (1 - sa);
        out[i + 3] = da;
      }
    } else if (o.knockout) { // outer, object removed: the shadow outside it
      const m = sa * (1 - da);
      out[i] = r * m; out[i + 1] = g * m; out[i + 2] = b * m; out[i + 3] = m;
    } else if (o.hideObject) {
      out[i] = r * sa; out[i + 1] = g * sa; out[i + 2] = b * sa; out[i + 3] = sa;
    } else { // object over its shadow
      const k = 1 - da;
      out[i] = src[i] + r * sa * k; out[i + 1] = src[i + 1] + g * sa * k; out[i + 2] = src[i + 2] + b * sa * k;
      out[i + 3] = da + sa * k;
    }
  }
  return out;
}

/** 256-entry lookup (non-premultiplied rgb 0–1, alpha 0–1) through gradient stops. */
function gradientLut(colors: number[], alphas: number[], ratios: number[]): Float32Array {
  const lut = new Float32Array(256 * 4);
  const stops = colors.map((c, i) => ({ rgb: rgb01(c), a: alphas[i] ?? 1, r: ratios[i] ?? 0 })).sort((x, y) => x.r - y.r);
  for (let i = 0; i < 256; i++) {
    let s0 = stops[0], s1 = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) if (i >= stops[k].r && i <= stops[k + 1].r) { s0 = stops[k]; s1 = stops[k + 1]; break; }
    const t = !s0 ? 0 : i <= s0.r ? 0 : i >= s1.r ? 1 : (i - s0.r) / (s1.r - s0.r);
    const pick = (x: number, y: number) => x + (y - x) * t;
    if (!s0) continue;
    const src = i < s0.r ? s0 : i > s1.r ? s1 : null;
    lut[i * 4] = src ? src.rgb[0] : pick(s0.rgb[0], s1.rgb[0]);
    lut[i * 4 + 1] = src ? src.rgb[1] : pick(s0.rgb[1], s1.rgb[1]);
    lut[i * 4 + 2] = src ? src.rgb[2] : pick(s0.rgb[2], s1.rgb[2]);
    lut[i * 4 + 3] = src ? src.a : pick(s0.a, s1.a);
  }
  return lut;
}

/**
 * Bevel and GradientBevel: the blurred alpha seen from either side of the
 * light. Where the alpha falls off away from the light (A(p − off) > A(p + off))
 * is shadow, the opposite edge highlight; `inner` keeps the part inside the
 * object, `outer` the part outside, `full` both.
 */
function bevelLike(
  src: Premul, w: number, h: number, scale: number,
  o: { blurX: number; blurY: number; quality: number; strength: number; angle: number; distance: number;
    type: FilterPlacement; knockout: boolean;
    /** v in −1 (highlight) … 1 (shadow) → premultiplied-ready rgb + alpha */
    color: (v: number) => readonly [number, number, number, number] },
): Premul {
  const a = alphaPlane(src);
  const blurred = blurPlane(a, w, h, o.blurX, o.blurY, o.quality, scale);
  const [dx, dy] = offsetOf(o.angle, o.distance, scale);
  const lit = shiftPlane(blurred, w, h, dx, dy); // A(p − off)
  const away = shiftPlane(blurred, w, h, -dx, -dy); // A(p + off)
  const out = new Float32Array(src.length);
  for (let i = 0, j = 0; j < a.length; i += 4, j++) {
    const v = Math.max(-1, Math.min(1, (lit[j] - away[j]) * o.strength));
    const [r, g, b, ca] = o.color(v);
    const da = a[j];
    const mask = o.type === 'inner' ? da : o.type === 'outer' ? 1 - da : 1;
    const ba = ca * mask;
    if (o.knockout) { out[i] = r * ba; out[i + 1] = g * ba; out[i + 2] = b * ba; out[i + 3] = ba; continue; }
    if (o.type === 'outer') { // the object over its outer bevel
      const k = 1 - da;
      out[i] = src[i] + r * ba * k; out[i + 1] = src[i + 1] + g * ba * k; out[i + 2] = src[i + 2] + b * ba * k; out[i + 3] = da + ba * k;
    } else { // the bevel over the object
      const k = 1 - ba;
      out[i] = r * ba + src[i] * k; out[i + 1] = g * ba + src[i + 1] * k; out[i + 2] = b * ba + src[i + 2] * k; out[i + 3] = ba + da * k;
    }
  }
  return out;
}

function colorMatrix(px: Pixels, m: number[]): Pixels {
  const d = px.data, out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    for (let c = 0; c < 4; c++) {
      const k = c * 5;
      out[i + c] = (m[k] ?? 0) * r + (m[k + 1] ?? 0) * g + (m[k + 2] ?? 0) * b + (m[k + 3] ?? 0) * a + (m[k + 4] ?? 0);
    }
  }
  return { width: px.width, height: px.height, data: out };
}

function convolution(px: Pixels, f: Extract<SwfFilter, { kind: 'convolution' }>): Pixels {
  const { width: w, height: h, data: d } = px;
  const out = new Uint8ClampedArray(d.length);
  const div = f.divisor || 1;
  const cx = Math.floor(f.matrixX / 2), cy = Math.floor(f.matrixY / 2);
  const def = [...rgb01(f.color).map((v) => v * 255), f.alpha * 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      for (let my = 0; my < f.matrixY; my++) {
        for (let mx = 0; mx < f.matrixX; mx++) {
          const k = f.matrix[my * f.matrixX + mx] ?? 0;
          if (!k) continue;
          let sx = x + mx - cx, sy = y + my - cy;
          let s: ArrayLike<number> | null = null;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
            if (f.clamp) { sx = Math.min(w - 1, Math.max(0, sx)); sy = Math.min(h - 1, Math.max(0, sy)); } else s = def;
          }
          const o = (sy * w + sx) * 4;
          for (let c = 0; c < 4; c++) acc[c] += k * (s ? s[c] : d[o + c]);
        }
      }
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = acc[c] / div + f.bias;
      out[o + 3] = f.preserveAlpha ? d[o + 3] : acc[3] / div + f.bias;
    }
  }
  return { width: w, height: h, data: out };
}

/** One filter on a layer's pixels (same size out; the layer carries the padding). */
export function applyFilter(px: Pixels, f: SwfFilter, scale = 1): Pixels {
  const { width: w, height: h } = px;
  switch (f.kind) {
    case 'colorMatrix': return colorMatrix(px, f.matrix);
    case 'convolution': return convolution(px, f);
    case 'blur': {
      const s = toPremul(px), n = w * h;
      const out = new Float32Array(s.length);
      for (let c = 0; c < 4; c++) {
        const plane = new Float32Array(n);
        for (let i = 0; i < n; i++) plane[i] = s[i * 4 + c];
        const b = blurPlane(plane, w, h, f.blurX, f.blurY, f.quality, scale);
        for (let i = 0; i < n; i++) out[i * 4 + c] = b[i];
      }
      return fromPremul(out, w, h);
    }
    case 'dropShadow': case 'glow': {
      const [r, g, b] = rgb01(f.color);
      const shadow = shadowLike(toPremul(px), w, h, scale, {
        ...f, angle: f.kind === 'dropShadow' ? f.angle : 0, distance: f.kind === 'dropShadow' ? f.distance : 0,
        placement: f.inner ? 'inner' : 'outer', hideObject: f.kind === 'dropShadow' && f.hideObject,
        color: (v) => [r, g, b, v * f.alpha],
      });
      return fromPremul(shadow, w, h);
    }
    case 'gradientGlow': {
      const lut = gradientLut(f.colors, f.alphas, f.ratios);
      const out = shadowLike(toPremul(px), w, h, scale, {
        ...f, placement: f.type, hideObject: false,
        color: (v) => { const k = Math.round(v * 255) * 4; return [lut[k], lut[k + 1], lut[k + 2], lut[k + 3]]; },
      });
      return fromPremul(out, w, h);
    }
    case 'bevel': {
      const hi = rgb01(f.highlightColor), sh = rgb01(f.shadowColor);
      const out = bevelLike(toPremul(px), w, h, scale, {
        ...f, color: (v) => (v >= 0 ? [sh[0], sh[1], sh[2], v * f.shadowAlpha] : [hi[0], hi[1], hi[2], -v * f.highlightAlpha]),
      });
      return fromPremul(out, w, h);
    }
    case 'gradientBevel': {
      const lut = gradientLut(f.colors, f.alphas, f.ratios);
      // ratio 0 is the highlight end, 255 the shadow end, 128 flat
      const out = bevelLike(toPremul(px), w, h, scale, {
        ...f, color: (v) => { const k = Math.round(128 + v * 127) * 4; return [lut[k], lut[k + 1], lut[k + 2], lut[k + 3]]; },
      });
      return fromPremul(out, w, h);
    }
  }
}

export function applyFilters(px: Pixels, filters: readonly SwfFilter[], scale = 1): Pixels {
  let out = px;
  for (const f of filters) out = applyFilter(out, f, scale);
  return out;
}

/** How far the filters can draw outside the object, in device pixels, per side. */
export function filterPadding(filters: readonly SwfFilter[] | undefined, scale: number): number {
  let pad = 0;
  for (const f of filters ?? []) {
    if (f.kind === 'colorMatrix') continue;
    if (f.kind === 'convolution') { pad += Math.ceil(Math.max(f.matrixX, f.matrixY) / 2); continue; }
    const q = Math.max(1, Math.min(15, Math.round(f.quality)));
    pad += Math.max(blurRadius(f.blurX, scale), blurRadius(f.blurY, scale)) * q;
    if ('distance' in f) pad += Math.ceil(Math.abs(f.distance) * scale);
  }
  return pad ? pad + 1 : 0;
}

// ---------------------------------------------------------------------------
// canvas glue
// ---------------------------------------------------------------------------

type Ctx2D = CanvasRenderingContext2D;
interface LayerCanvas { width: number; height: number; getContext(type: '2d'): Ctx2D | null }

let makeCanvas: (w: number, h: number) => LayerCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c as unknown as LayerCanvas;
};

/** Where layers come from (tests outside a browser give a node canvas). */
export function setCanvasFactory(factory: (w: number, h: number) => LayerCanvas): void { makeCanvas = factory; }

/** Contexts of layers being painted: `alpha` / `erase` act on the nearest one. */
const layerContexts = new WeakSet<object>();

/** Whether a subtree has to go through `composite`. */
export function needsComposite(filters: readonly SwfFilter[] | undefined, blendMode: BlendMode | string | undefined): boolean {
  return !!filters?.length || (!!blendMode && blendMode !== 'normal');
}

/** Canvas composite operation per blend mode (subtract / invert / alpha / erase are done apart). */
const OPERATION: Partial<Record<BlendMode, GlobalCompositeOperation>> = {
  normal: 'source-over', layer: 'source-over', multiply: 'multiply', screen: 'screen', lighten: 'lighten',
  darken: 'darken', difference: 'difference', add: 'lighter', overlay: 'overlay', hardlight: 'hard-light',
  alpha: 'destination-in', erase: 'destination-out',
};

export interface Bounds { xMin: number; yMin: number; xMax: number; yMax: number }

export interface CompositeOptions {
  filters?: readonly SwfFilter[];
  blendMode?: BlendMode | string;
  /**
   * The subtree's bounds in the coordinates of `ctx`'s current transform (the
   * object's parent space, its own matrix applied); omitted = the whole target.
   */
  bounds?: Bounds | null;
  /** Device pixels per stage pixel (filter sizes are stage pixels). */
  filterScale: number;
  /**
   * Draws the subtree into the layer. The layer context starts with `ctx`'s
   * transform (shifted to the layer), alpha 1 and source-over: draw the object
   * exactly as onto `ctx`, its own alpha and colour transform included.
   */
  paint: (layer: Ctx2D) => void;
}

/**
 * Draws a subtree through a layer: filters on its pixels, then onto `ctx` with
 * the blend mode and `ctx`'s current alpha (the parent's). Returns false when
 * nothing was drawn (empty, off the target, or `alpha` / `erase` without a layer).
 */
export function composite(ctx: Ctx2D, opts: CompositeOptions): boolean {
  const blend = (opts.blendMode ?? 'normal') as BlendMode;
  const filters = opts.filters ?? [];
  const needsLayerParent = blend === 'alpha' || blend === 'erase';
  // alpha / erase change the layer under them; with no layer (the stage itself) Flash
  // shows nothing of the object — the stage is not cut into
  if (needsLayerParent && !layerContexts.has(ctx)) return false;
  const target = ctx.canvas as unknown as { width: number; height: number };
  const m = ctx.getTransform();
  const pad = filterPadding(filters, opts.filterScale);
  let x0 = 0, y0 = 0, x1 = target.width, y1 = target.height;
  if (opts.bounds && !needsLayerParent) {
    const { xMin, yMin, xMax, yMax } = opts.bounds;
    const pts = [[xMin, yMin], [xMax, yMin], [xMin, yMax], [xMax, yMax]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    x0 = Math.max(-pad, Math.floor(Math.min(...pts.map((p) => p[0]))) - pad);
    y0 = Math.max(-pad, Math.floor(Math.min(...pts.map((p) => p[1]))) - pad);
    x1 = Math.min(target.width + pad, Math.ceil(Math.max(...pts.map((p) => p[0]))) + pad);
    y1 = Math.min(target.height + pad, Math.ceil(Math.max(...pts.map((p) => p[1]))) + pad);
  }
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0 || !Number.isFinite(w) || !Number.isFinite(h)) return false;
  const layer = makeCanvas(w, h);
  const lctx = layer.getContext('2d');
  if (!lctx) return false;
  lctx.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
  layerContexts.add(lctx);
  try { opts.paint(lctx); } finally { layerContexts.delete(lctx); }
  if (filters.length) {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    const img = lctx.getImageData(0, 0, w, h);
    const out = applyFilters({ width: w, height: h, data: img.data }, filters, opts.filterScale);
    img.data.set(out.data);
    lctx.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (blend === 'invert' || blend === 'subtract') {
    // canvas has neither: invert = a white silhouette drawn with `difference`
    // (|1 − dst| where the object is); subtract = invert, add, invert
    const sil = silhouette(layer as unknown as CanvasImageSource, w, h);
    if (sil) {
      ctx.globalCompositeOperation = 'difference';
      ctx.drawImage(sil, x0, y0);
      if (blend === 'subtract') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(layer as unknown as CanvasImageSource, x0, y0);
        ctx.globalCompositeOperation = 'difference';
        ctx.drawImage(sil, x0, y0);
      }
    }
  } else {
    ctx.globalCompositeOperation = OPERATION[blend] ?? 'source-over';
    ctx.drawImage(layer as unknown as CanvasImageSource, x0, y0);
  }
  ctx.restore();
  return true;
}

/** White where the layer is opaque, with the layer's alpha. */
function silhouette(layer: CanvasImageSource, w: number, h: number): CanvasImageSource | null {
  const c = makeCanvas(w, h);
  const s = c.getContext('2d');
  if (!s) return null;
  s.drawImage(layer, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = '#ffffff';
  s.fillRect(0, 0, w, h);
  return c as unknown as CanvasImageSource;
}
