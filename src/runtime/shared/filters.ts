// flash.filters, shared by the AS2 runtime (Flash 8 `flash.filters.*`) and the
// AS3 runtime: the same classes, constructor signatures and defaults in both.
// The renderers draw the compositor's model (SwfFilter, src/types.ts); these
// convert to it (`toFilterData`) and back for timeline filters a script reads
// (`fromFilterData`). DisplacementMapFilter and ShaderFilter have no model:
// they are kept on the object but not drawn.
import type { FilterPlacement, SwfFilter } from './filterModel';

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const quality = (v: unknown) => Math.max(0, Math.min(15, Math.round(num(v, 1))));
const placement = (v: unknown): FilterPlacement => (v === 'outer' || v === 'full' ? v : 'inner');
const numbers = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => num(x, 0)) : []);

export class BitmapFilter {
  clone(): BitmapFilter { return Object.assign(Object.create(Object.getPrototypeOf(this)), this); }
}

export class DropShadowFilter extends BitmapFilter {
  constructor(public distance = 4, public angle = 45, public color = 0, public alpha = 1, public blurX = 4, public blurY = 4,
    public strength = 1, public quality = 1, public inner = false, public knockout = false, public hideObject = false) { super(); }
}
export class GlowFilter extends BitmapFilter {
  constructor(public color = 0xff0000, public alpha = 1, public blurX = 6, public blurY = 6, public strength = 2,
    public quality = 1, public inner = false, public knockout = false) { super(); }
}
export class BlurFilter extends BitmapFilter {
  constructor(public blurX = 4, public blurY = 4, public quality = 1) { super(); }
}
export class BevelFilter extends BitmapFilter {
  constructor(public distance = 4, public angle = 45, public highlightColor = 0xffffff, public highlightAlpha = 1,
    public shadowColor = 0, public shadowAlpha = 1, public blurX = 4, public blurY = 4, public strength = 1,
    public quality = 1, public type = 'inner', public knockout = false) { super(); }
}
export class GradientGlowFilter extends BitmapFilter {
  constructor(public distance = 4, public angle = 45, public colors: number[] | null = null, public alphas: number[] | null = null,
    public ratios: number[] | null = null, public blurX = 4, public blurY = 4, public strength = 1, public quality = 1,
    public type = 'inner', public knockout = false) { super(); }
}
export class GradientBevelFilter extends BitmapFilter {
  constructor(public distance = 4, public angle = 45, public colors: number[] | null = null, public alphas: number[] | null = null,
    public ratios: number[] | null = null, public blurX = 4, public blurY = 4, public strength = 1, public quality = 1,
    public type = 'inner', public knockout = false) { super(); }
}
export class ConvolutionFilter extends BitmapFilter {
  constructor(public matrixX = 0, public matrixY = 0, public matrix: number[] | null = null, public divisor = 1, public bias = 0,
    public preserveAlpha = true, public clamp = true, public color = 0, public alpha = 0) { super(); }
}
export class ColorMatrixFilter extends BitmapFilter {
  matrix: number[];
  constructor(matrix: number[] | null = null) {
    super();
    this.matrix = matrix ? [...matrix] : [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  }
}
export class DisplacementMapFilter extends BitmapFilter {
  constructor(public mapBitmap: unknown = null, public mapPoint: unknown = null, public componentX = 0, public componentY = 0,
    public scaleX = 0, public scaleY = 0, public mode = 'wrap', public color = 0, public alpha = 0) { super(); }
}
export const BitmapFilterQuality = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
export const BitmapFilterType = { INNER: 'inner', OUTER: 'outer', FULL: 'full' } as const;

/** The compositor model of a filter object; null for one it cannot draw. */
export function toFilterData(f: unknown): SwfFilter | null {
  if (f instanceof DropShadowFilter) {
    return { kind: 'dropShadow', color: num(f.color, 0) & 0xffffff, alpha: num(f.alpha, 1), blurX: num(f.blurX, 4), blurY: num(f.blurY, 4),
      angle: num(f.angle, 45), distance: num(f.distance, 4), strength: num(f.strength, 1), quality: quality(f.quality),
      inner: !!f.inner, knockout: !!f.knockout, hideObject: !!f.hideObject };
  }
  if (f instanceof GlowFilter) {
    return { kind: 'glow', color: num(f.color, 0) & 0xffffff, alpha: num(f.alpha, 1), blurX: num(f.blurX, 6), blurY: num(f.blurY, 6),
      strength: num(f.strength, 2), quality: quality(f.quality), inner: !!f.inner, knockout: !!f.knockout };
  }
  if (f instanceof BlurFilter) return { kind: 'blur', blurX: num(f.blurX, 4), blurY: num(f.blurY, 4), quality: quality(f.quality) };
  if (f instanceof BevelFilter) {
    return { kind: 'bevel', highlightColor: num(f.highlightColor, 0xffffff) & 0xffffff, highlightAlpha: num(f.highlightAlpha, 1),
      shadowColor: num(f.shadowColor, 0) & 0xffffff, shadowAlpha: num(f.shadowAlpha, 1), blurX: num(f.blurX, 4), blurY: num(f.blurY, 4),
      angle: num(f.angle, 45), distance: num(f.distance, 4), strength: num(f.strength, 1), quality: quality(f.quality),
      knockout: !!f.knockout, type: placement(f.type) };
  }
  if (f instanceof GradientGlowFilter || f instanceof GradientBevelFilter) {
    const colors = numbers(f.colors);
    const n = colors.length;
    return { kind: f instanceof GradientGlowFilter ? 'gradientGlow' : 'gradientBevel',
      colors: colors.map((c) => c & 0xffffff), alphas: numbers(f.alphas).slice(0, n), ratios: numbers(f.ratios).slice(0, n),
      blurX: num(f.blurX, 4), blurY: num(f.blurY, 4), angle: num(f.angle, 45), distance: num(f.distance, 4),
      strength: num(f.strength, 1), quality: quality(f.quality), knockout: !!f.knockout, type: placement(f.type) };
  }
  if (f instanceof ConvolutionFilter) {
    return { kind: 'convolution', matrixX: num(f.matrixX, 0), matrixY: num(f.matrixY, 0), matrix: numbers(f.matrix),
      divisor: num(f.divisor, 1), bias: num(f.bias, 0), preserveAlpha: !!f.preserveAlpha, clamp: !!f.clamp,
      color: num(f.color, 0) & 0xffffff, alpha: num(f.alpha, 0) };
  }
  if (f instanceof ColorMatrixFilter) {
    const m = numbers(f.matrix);
    return m.length === 20 ? { kind: 'colorMatrix', matrix: m } : null;
  }
  return null;
}

/** A filter object for a model filter (a timeline filter read by a script). */
export function fromFilterData(d: SwfFilter): BitmapFilter {
  switch (d.kind) {
    case 'dropShadow': return new DropShadowFilter(d.distance, d.angle, d.color, d.alpha, d.blurX, d.blurY, d.strength, d.quality, d.inner, d.knockout, d.hideObject);
    case 'glow': return new GlowFilter(d.color, d.alpha, d.blurX, d.blurY, d.strength, d.quality, d.inner, d.knockout);
    case 'blur': return new BlurFilter(d.blurX, d.blurY, d.quality);
    case 'bevel': return new BevelFilter(d.distance, d.angle, d.highlightColor, d.highlightAlpha, d.shadowColor, d.shadowAlpha, d.blurX, d.blurY, d.strength, d.quality, d.type, d.knockout);
    case 'gradientGlow': return new GradientGlowFilter(d.distance, d.angle, [...d.colors], [...d.alphas], [...d.ratios], d.blurX, d.blurY, d.strength, d.quality, d.type, d.knockout);
    case 'gradientBevel': return new GradientBevelFilter(d.distance, d.angle, [...d.colors], [...d.alphas], [...d.ratios], d.blurX, d.blurY, d.strength, d.quality, d.type, d.knockout);
    case 'convolution': return new ConvolutionFilter(d.matrixX, d.matrixY, [...d.matrix], d.divisor, d.bias, d.preserveAlpha, d.clamp, d.color, d.alpha);
    case 'colorMatrix': return new ColorMatrixFilter(d.matrix);
  }
}

/**
 * The `filters` property both runtimes expose. Reading gives copies (changing
 * one does nothing until it is assigned back); assigning copies the array,
 * keeps the filter objects for later reads and the drawable ones for the
 * renderer. `objects` is undefined while the filters come from the timeline.
 */
export interface FilterState { data: SwfFilter[] | undefined; objects: BitmapFilter[] | undefined }

export function readFilters(state: FilterState): BitmapFilter[] {
  return state.objects ? state.objects.map((f) => f.clone()) : (state.data ?? []).map(fromFilterData);
}

export function writeFilters(value: unknown): FilterState {
  const list = Array.isArray(value) ? value.filter((f): f is BitmapFilter => f instanceof BitmapFilter).map((f) => f.clone()) : [];
  const data = list.map(toFilterData).filter((f): f is SwfFilter => f != null);
  return { objects: list, data: data.length ? data : undefined };
}
