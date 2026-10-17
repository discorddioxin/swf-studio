// The surface-filter model (no imports: the AS2 runtime ships this file with
// exported projects). Both SWF readers produce it from FILTERLIST, the runtimes
// from flash.filters objects, and src/lib/compositor.ts draws it.

/**
 * Surface filters (SWF 19, FILTERLIST), in the units of the ActionScript filter
 * classes (flash.filters.*): blur and distance in pixels, angle in degrees,
 * colour 0xRRGGBB with alpha 0–1, quality = the number of blur passes.
 */
export type SwfFilter =
  | DropShadowFilterData | BlurFilterData | GlowFilterData | BevelFilterData
  | GradientFilterData | ConvolutionFilterData | ColorMatrixFilterData;

/** Where a bevel / gradient filter is drawn (`type` in ActionScript). */
export type FilterPlacement = 'inner' | 'outer' | 'full';

export interface DropShadowFilterData {
  kind: 'dropShadow'; color: number; alpha: number; blurX: number; blurY: number;
  angle: number; distance: number; strength: number; quality: number;
  inner: boolean; knockout: boolean; hideObject: boolean;
}
export interface BlurFilterData { kind: 'blur'; blurX: number; blurY: number; quality: number }
export interface GlowFilterData {
  kind: 'glow'; color: number; alpha: number; blurX: number; blurY: number;
  strength: number; quality: number; inner: boolean; knockout: boolean;
}
export interface BevelFilterData {
  kind: 'bevel'; highlightColor: number; highlightAlpha: number; shadowColor: number; shadowAlpha: number;
  blurX: number; blurY: number; angle: number; distance: number; strength: number; quality: number;
  knockout: boolean; type: FilterPlacement;
}
export interface GradientFilterData {
  kind: 'gradientGlow' | 'gradientBevel';
  /** gradient stops: colour, alpha 0–1, ratio 0–255 */
  colors: number[]; alphas: number[]; ratios: number[];
  blurX: number; blurY: number; angle: number; distance: number; strength: number; quality: number;
  knockout: boolean; type: FilterPlacement;
}
export interface ConvolutionFilterData {
  kind: 'convolution'; matrixX: number; matrixY: number; matrix: number[];
  divisor: number; bias: number; preserveAlpha: boolean; clamp: boolean; color: number; alpha: number;
}
/** 4×5 row-major: R' = m0·R + m1·G + m2·B + m3·A + m4 (offsets in 0–255), then G', B', A'. */
export interface ColorMatrixFilterData { kind: 'colorMatrix'; matrix: number[] }
