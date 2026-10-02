// Generate an SVG for a SWF shape from its parsed style/record structures.
// The SVG uses PIXEL units (twips ÷ 20) exactly like JPEXS's own exports, so
// AssetCache's bounds calibration behaves identically for bundled and
// user-exported shapes.

import type { Rect } from '../../types';

export interface SvgFillStyle {
  /** 0 = solid, 16 = linear gradient, 18 = radial gradient, 64..67 = bitmap */
  type: number;
  /** solid colour "#rrggbb" or "#rrggbbaa" */
  color?: string;
  matrix?: SvgMatrix;
  spreadMode?: number;
  interpolationMode?: number;
  records?: { ratio: number; color: string; alpha?: number }[];
  bitmapId?: number;
}

export interface SvgLineStyle {
  width: number;          // twips
  color: string;
  /** LINESTYLE2 */
  pixelHinting?: boolean;
  noHScale?: boolean;
  noVScale?: boolean;
  startCap?: number;
  endCap?: number;
  join?: number;
  noClose?: boolean;
  miterLimit?: number;
}

export interface SvgMatrix { a: number; b: number; c: number; d: number; tx: number; ty: number }

export type SvgShapeRecord =
  | {
      kind: 'style';
      fill0: number; fill1: number; line: number;
      move?: { x: number; y: number };
      fillStyle?: SvgFillStyle[];   // stateNewStyles
      lineStyle?: SvgLineStyle[];
      fillBits: number; lineBits: number;
    }
  | { kind: 'straight'; dx: number; dy: number }
  | { kind: 'curved'; cx: number; cy: number; ax: number; ay: number };

const PX = 1 / 20;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function matrixStr(m: SvgMatrix): string {
  const r = (n: number) => {
    const v = Math.round(n * 1e6) / 1e6;
    return String(v);
  };
  return `matrix(${r(m.a)}, ${r(m.b)}, ${r(m.c)}, ${r(m.d)}, ${r(m.tx)}, ${r(m.ty)})`;
}

/** all matrix components live in twips; the SVG works in pixels */
function matrixPx(m: SvgMatrix, ox = 0, oy = 0): SvgMatrix {
  return { a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx * PX + ox, ty: m.ty * PX + oy };
}

function colorOpacity(color: string): { hex: string; opacity?: string } {
  if (color.length === 9) {
    const a = parseInt(color.slice(7, 9), 16) / 255;
    return { hex: color.slice(0, 7), opacity: a >= 1 ? undefined : String(Math.round(a * 1e6) / 1e6) };
  }
  return { hex: color };
}

interface Poly {
  start: [number, number];
  segs: string[];   // path segments after the initial M
  end: [number, number];
}

/**
 * Walk the shape records and produce one path per fill style plus one per
 * line style. Consecutive edges assigned to the same style extend a single
 * polyline; when the assignment breaks the polyline is closed (fills) or
 * flushed open (strokes).
 */
export function shapeToSvg(
  bounds: Rect,
  fills: SvgFillStyle[],
  lines: SvgLineStyle[],
  records: SvgShapeRecord[],
  opts: { windingEvenOdd?: boolean } = {},
): string {
  // content is emitted relative to the shape origin (like FFDec exports)
  const ox = -bounds.xMin * PX;
  const oy = -bounds.yMin * PX;
  const toPx = (n: number) => Math.round((n * PX + ox) * 1000) / 1000;
  const toPy = (n: number) => Math.round((n * PX + oy) * 1000) / 1000;
  const fillPolys = new Map<number, Poly[]>();
  const linePolys = new Map<number, Poly[]>();
  let curF0 = 0, curF1 = 0, curL = 0;
  let pen: [number, number] = [0, 0];
  let activeF0: Poly | null = null;
  let activeF1: Poly | null = null;
  let activeL: Poly | null = null;

  const closeFill = (idx: number, poly: Poly | null) => {
    if (poly) (fillPolys.get(idx) ?? fillPolys.set(idx, []).get(idx)!).push(poly);
  };
  const closeLine = (idx: number, poly: Poly | null) => {
    if (poly) (linePolys.get(idx) ?? linePolys.set(idx, []).get(idx)!).push(poly);
  };

  for (const rec of records) {
    if (rec.kind === 'style') {
      if (rec.fillStyle) {
        closeFill(curF0, activeF0); closeFill(curF1, activeF1);
        activeF0 = null; activeF1 = null;
        fills.splice(0, fills.length, ...rec.fillStyle);
      }
      if (rec.lineStyle) {
        closeLine(curL, activeL);
        activeL = null;
        lines.splice(0, lines.length, ...rec.lineStyle);
      }
      if (rec.fill0 !== curF0) { closeFill(curF0, activeF0); activeF0 = null; curF0 = rec.fill0; }
      if (rec.fill1 !== curF1) { closeFill(curF1, activeF1); activeF1 = null; curF1 = rec.fill1; }
      if (rec.line !== curL) { closeLine(curL, activeL); activeL = null; curL = rec.line; }
      if (rec.move) {
        closeFill(curF0, activeF0); closeFill(curF1, activeF1); closeLine(curL, activeL);
        activeF0 = null; activeF1 = null; activeL = null;
        pen = [rec.move.x, rec.move.y];
      }
      continue;
    }
    const to: [number, number] = rec.kind === 'straight'
      ? [pen[0] + rec.dx, pen[1] + rec.dy]
      : [pen[0] + rec.cx + rec.ax, pen[1] + rec.cy + rec.ay];
    const seg = rec.kind === 'straight'
      ? `L${toPx(to[0])} ${toPy(to[1])}`
      : `Q${toPx(pen[0] + rec.cx)} ${toPy(pen[1] + rec.cy)} ${toPx(to[0])} ${toPy(to[1])}`;

    for (const [idx, which] of [[curF0, 0] as const, [curF1, 1] as const]) {
      if (idx <= 0) continue;
      let poly: Poly | null = which === 0 ? activeF0 : activeF1;
      if (!poly) {
        poly = { start: [...pen] as [number, number], segs: [], end: [...pen] as [number, number] };
        poly.segs.push(`M${toPx(poly.start[0])} ${toPy(poly.start[1])}`);
        if (which === 0) activeF0 = poly; else activeF1 = poly;
      }
      poly.segs.push(seg);
      poly.end = to;
    }
    if (curL > 0) {
      let poly: Poly | null = activeL;
      if (!poly) {
        poly = { start: [...pen] as [number, number], segs: [], end: [...pen] as [number, number] };
        poly.segs.push(`M${toPx(poly.start[0])} ${toPy(poly.start[1])}`);
        activeL = poly;
      }
      poly.segs.push(seg);
      poly.end = to;
    }
    pen = to;
  }
  closeFill(curF0, activeF0); closeFill(curF1, activeF1); closeLine(curL, activeL);

  const defs: string[] = [];
  const paths: string[] = [];
  const fillAttr = (idx: number, idPrefix: string): string => {
    const style = fills[idx - 1];
    if (!style) return 'fill="none"';
    if (style.type === 0) {
      const { hex, opacity } = colorOpacity(style.color ?? '#000000');
      return `fill="${esc(hex)}"${opacity ? ` fill-opacity="${opacity}"` : ''}`;
    }
    const id = `${idPrefix}${idx}`;
    if (style.type === 16 || style.type === 18) {
      const stops = (style.records ?? []).map((s) => {
        const { hex, opacity } = colorOpacity(s.color);
        return `<stop offset="${Math.round((s.ratio / 255) * 1e6) / 1e6}" stop-color="${esc(hex)}"${opacity ? ` stop-opacity="${opacity}"` : ''}/>`;
      }).join('');
      const spread = style.spreadMode === 1 ? 'reflect' : style.spreadMode === 2 ? 'repeat' : 'pad';
      const m = matrixPx(style.matrix ?? { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, ox, oy);
      if (style.type === 16) {
        defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="-819.2" x2="819.2" spreadMethod="${spread}" gradientTransform="${matrixStr(m)}">${stops}</linearGradient>`);
      } else {
        defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="819.2" spreadMethod="${spread}" gradientTransform="${matrixStr(m)}">${stops}</radialGradient>`);
      }
      return `fill="url(#${id})"`;
    }
    if (style.type >= 0x40 && style.type <= 0x43 && style.bitmapId != null) {
      // Bitmap fills reference the extracted image by file name; AssetCache
      // rewrites the href to a blob URL when the SVG loads.
      const smoothed = (style.type & 1) === 1;
      const m = matrixPx(style.matrix ?? { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, ox, oy);
      defs.push(
        `<pattern id="${id}" patternUnits="userSpaceOnUse" overflow="visible" patternTransform="${matrixStr(m)}">` +
        `<image data-swf-bitmap="${style.bitmapId}" href="${style.bitmapId}.png" preserveAspectRatio="none"/>` +
        `</pattern>`,
      );
      void smoothed;
      return `fill="url(#${id})"`;
    }
    return 'fill="none"';
  };

  const evenOdd = opts.windingEvenOdd !== false ? 'evenodd' : 'nonzero';
  for (const [idx, polys] of [...fillPolys].sort((a, b) => a[0] - b[0])) {
    const d = polys.map((p) => p.segs.join(' ') + ' Z').join(' ');
    if (!d) continue;
    paths.push(`<path d="${d}" ${fillAttr(idx, 'fill')} fill-rule="${evenOdd}" stroke="none"/>`);
  }
  for (const [idx, polys] of [...linePolys].sort((a, b) => a[0] - b[0])) {
    const style = lines[idx - 1];
    if (!style) continue;
    const d = polys.map((p) => p.segs.join(' ')).join(' ');
    if (!d) continue;
    const { hex, opacity } = colorOpacity(style.color);
    const w = toPx(style.width);
    paths.push(
      `<path d="${d}" fill="none" stroke="${esc(hex)}"${opacity ? ` stroke-opacity="${opacity}"` : ''}` +
      ` stroke-width="${Math.max(w, 0.05)}" stroke-linecap="${style.startCap === 1 ? 'butt' : style.startCap === 3 ? 'square' : 'round'}"` +
      ` stroke-linejoin="${style.join === 1 ? 'miter' : style.join === 2 ? 'bevel' : 'round'}"/>`,
    );
  }

  const w = Math.round((bounds.xMax - bounds.xMin) * PX * 1000) / 1000;
  const h = Math.round((bounds.yMax - bounds.yMin) * PX * 1000) / 1000;
  const body = paths.join('\n  ');
  const defsBlock = defs.length ? `\n  <defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">\n  ${body}${defsBlock}\n</svg>\n`;
}
