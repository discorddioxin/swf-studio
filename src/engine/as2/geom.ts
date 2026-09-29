// Matrix / rect helpers for the AS2 player. All positions are TWIPS
// (1/20 px) like the SWF itself; the stage transform scales by 1/20.

import type { ColorTransform, Matrix, Rect } from '../../types';

export const identity = (): Matrix => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

/** m1 · m2 (apply m2 first, then m1) */
export function concat(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
    ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty,
  };
}

export function invert(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c;
  if (!det) return { a: 0, b: 0, c: 0, d: 0, tx: -m.tx, ty: -m.ty };
  return {
    a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det,
    tx: (m.c * m.ty - m.d * m.tx) / det,
    ty: (m.b * m.tx - m.a * m.ty) / det,
  };
}

export function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty };
}

export function transformRect(m: Matrix, r: Rect): Rect {
  const pts = [apply(m, r.xMin, r.yMin), apply(m, r.xMax, r.yMin), apply(m, r.xMin, r.yMax), apply(m, r.xMax, r.yMax)];
  return {
    xMin: Math.min(...pts.map((p) => p.x)), xMax: Math.max(...pts.map((p) => p.x)),
    yMin: Math.min(...pts.map((p) => p.y)), yMax: Math.max(...pts.map((p) => p.y)),
  };
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  return { xMin: Math.min(a.xMin, b.xMin), yMin: Math.min(a.yMin, b.yMin), xMax: Math.max(a.xMax, b.xMax), yMax: Math.max(a.yMax, b.yMax) };
}

export const inRect = (r: Rect | null, x: number, y: number) => !!r && x >= r.xMin && x <= r.xMax && y >= r.yMin && y <= r.yMax;

/** Scale / rotation components as the AS2 properties see them. */
export interface Components { xs: number; ys: number; rx: number; ry: number }

export function decompose(m: Matrix): Components {
  return {
    xs: Math.hypot(m.a, m.b),
    ys: Math.hypot(m.c, m.d),
    rx: Math.atan2(m.b, m.a),
    ry: Math.atan2(-m.c, m.d),
  };
}

export function compose(c: Components, tx: number, ty: number): Matrix {
  return {
    a: c.xs * Math.cos(c.rx), b: c.xs * Math.sin(c.rx),
    c: -c.ys * Math.sin(c.ry), d: c.ys * Math.cos(c.ry),
    tx, ty,
  };
}

export const identityCT = (): ColorTransform => ({ rm: 1, gm: 1, bm: 1, am: 1, ra: 0, ga: 0, ba: 0, aa: 0 });

export function concatCT(outer: ColorTransform | undefined, inner: ColorTransform | undefined): ColorTransform | undefined {
  if (!outer) return inner;
  if (!inner) return outer;
  return {
    rm: outer.rm * inner.rm, gm: outer.gm * inner.gm, bm: outer.bm * inner.bm, am: outer.am * inner.am,
    ra: outer.rm * inner.ra + outer.ra, ga: outer.gm * inner.ga + outer.ga,
    ba: outer.bm * inner.ba + outer.ba, aa: outer.am * inner.aa + outer.aa,
  };
}

export const isColorIdentity = (ct: ColorTransform | undefined) =>
  !ct || (ct.rm === 1 && ct.gm === 1 && ct.bm === 1 && !ct.ra && !ct.ga && !ct.ba);
