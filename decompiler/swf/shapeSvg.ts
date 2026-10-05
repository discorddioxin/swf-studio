// Generate an SVG for a SWF shape from its parsed style/record structures.
// The SVG uses PIXEL units (twips ÷ 20) exactly like JPEXS's own exports, so
// AssetCache's bounds calibration behaves identically for bundled and
// user-exported shapes.

import type { Rect } from '../../src/types';

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
      fill0?: number; fill1?: number; line?: number;
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

/** all gradient matrix components live in twips; the SVG gradient space is already in pixels */
function matrixPx(m: SvgMatrix, ox = 0, oy = 0): SvgMatrix {
  return { a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx * PX + ox, ty: m.ty * PX + oy };
}

/** bitmap fill matrices map bitmap pixels (1px = 20 twips at scale 20) to twips; scale a..d by PX for SVG pixel space */
function bitmapMatrixPx(m: SvgMatrix, ox = 0, oy = 0): SvgMatrix {
  return { a: m.a * PX, b: m.b * PX, c: m.c * PX, d: m.d * PX, tx: m.tx * PX + ox, ty: m.ty * PX + oy };
}

export interface SvgBitmapInfo {
  width: number;
  height: number;
  dataUrl?: string;
}

function colorOpacity(color: string): { hex: string; opacity?: string } {
  if (color.length === 9) {
    const a = parseInt(color.slice(7, 9), 16) / 255;
    return { hex: color.slice(0, 7), opacity: a >= 1 ? undefined : String(Math.round(a * 1e6) / 1e6) };
  }
  return { hex: color };
}

interface DirectedEdge {
  from: [number, number];
  to: [number, number];
  ctrl?: [number, number];
}

/**
 * Walk the shape records and produce one path per fill style plus one per
 * line style per style group. Directed fill edges (`fill1` forward, `fill0`
 * reversed) are stitched endpoint-to-startpoint in integer twips so multi-edge
 * contours sharing boundaries with other fills form complete closed loops.
 */
export function shapeToSvg(
  bounds: Rect,
  initialFills: SvgFillStyle[],
  initialLines: SvgLineStyle[],
  records: SvgShapeRecord[],
  opts: { windingEvenOdd?: boolean; bitmaps?: ReadonlyMap<number, SvgBitmapInfo> } = {},
): string {
  // content is emitted relative to the shape origin (like FFDec exports)
  const ox = -bounds.xMin * PX;
  const oy = -bounds.yMin * PX;
  const toPx = (n: number) => Math.round((n * PX + ox) * 1000) / 1000;
  const toPy = (n: number) => Math.round((n * PX + oy) * 1000) / 1000;
  const toWidth = (n: number) => Math.round(n * PX * 1000) / 1000;

  const fills = [...initialFills];
  const lines = [...initialLines];
  const fillEdges = new Map<number, DirectedEdge[]>();
  const lineEdges = new Map<number, DirectedEdge[]>();
  let curF0 = 0, curF1 = 0, curL = 0;
  let pen: [number, number] = [0, 0];

  const defs: string[] = [];
  const paths: string[] = [];
  let defSeq = 0;
  const evenOdd = opts.windingEvenOdd !== false ? 'evenodd' : 'nonzero';

  const segStr = (e: DirectedEdge): string =>
    e.ctrl
      ? `Q${toPx(e.ctrl[0])} ${toPy(e.ctrl[1])} ${toPx(e.to[0])} ${toPy(e.to[1])}`
      : `L${toPx(e.to[0])} ${toPy(e.to[1])}`;

  const stitchClosed = (edges: DirectedEdge[]): string => {
    const n = edges.length;
    if (n === 0) return '';
    const used = new Uint8Array(n);
    const byStart = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const k = `${edges[i].from[0]},${edges[i].from[1]}`;
      let list = byStart.get(k);
      if (!list) { list = []; byStart.set(k, list); }
      list.push(i);
    }
    const contours: string[] = [];
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const start = edges[i].from;
      let cur = edges[i].to;
      let lastIdx = i;
      const segs = [`M${toPx(start[0])} ${toPy(start[1])}`, segStr(edges[i])];
      while (cur[0] !== start[0] || cur[1] !== start[1]) {
        const candidates = byStart.get(`${cur[0]},${cur[1]}`);
        if (!candidates) break;
        let pick = -1;
        // Prefer the immediately sequential edge if it starts here, otherwise first unused
        for (const c of candidates) {
          if (!used[c] && c === lastIdx + 1) { pick = c; break; }
        }
        if (pick < 0) {
          for (const c of candidates) {
            if (!used[c]) { pick = c; break; }
          }
        }
        if (pick < 0) break;
        used[pick] = 1;
        segs.push(segStr(edges[pick]));
        cur = edges[pick].to;
        lastIdx = pick;
      }
      segs.push('Z');
      contours.push(segs.join(' '));
    }
    return contours.join(' ');
  };

  const stitchOpen = (edges: DirectedEdge[]): string => {
    if (edges.length === 0) return '';
    const chains: string[] = [];
    let cur: [number, number] | null = null;
    let segs: string[] = [];
    for (const e of edges) {
      if (!cur || cur[0] !== e.from[0] || cur[1] !== e.from[1]) {
        if (segs.length) chains.push(segs.join(' '));
        segs = [`M${toPx(e.from[0])} ${toPy(e.from[1])}`, segStr(e)];
      } else {
        segs.push(segStr(e));
      }
      cur = e.to;
    }
    if (segs.length) chains.push(segs.join(' '));
    return chains.join(' ');
  };

  const fillAttr = (idx: number): string => {
    const style = fills[idx - 1];
    if (!style) return 'fill="none"';
    if (style.type === 0) {
      const { hex, opacity } = colorOpacity(style.color ?? '#000000');
      return `fill="${esc(hex)}"${opacity ? ` fill-opacity="${opacity}"` : ''}`;
    }
    const id = `fill${++defSeq}`;
    if (style.type === 16 || style.type === 18) {
      // Flash builds a 0..255 gradient LUT in ratio order; duplicate trailing stops
      // (e.g. leftover ratio=255 #ece9d8 / #ffffff pointers from Flash MX authoring)
      // have zero span in Flash but would override offset="1" pad color in SVG.
      const filtered: { ratio: number; color: string; alpha?: number }[] = [];
      let lastRatio = -1;
      for (const s of style.records ?? []) {
        if (s.ratio <= lastRatio) continue;
        filtered.push(s);
        lastRatio = s.ratio;
      }
      const stops = filtered.map((s) => {
        const { hex, opacity } = colorOpacity(s.color);
        const opAttr = s.alpha != null && s.alpha < 1
          ? ` stop-opacity="${Math.round(s.alpha * 1e6) / 1e6}"`
          : opacity ? ` stop-opacity="${opacity}"` : '';
        return `<stop offset="${Math.round((s.ratio / 255) * 1e6) / 1e6}" stop-color="${esc(hex)}"${opAttr}/>`;
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
      const smoothed = (style.type & 1) === 1;
      const bm = opts.bitmaps?.get(style.bitmapId);
      const bw = bm?.width ?? Math.max(1, Math.round((bounds.xMax - bounds.xMin) * PX));
      const bh = bm?.height ?? Math.max(1, Math.round((bounds.yMax - bounds.yMin) * PX));
      const href = bm?.dataUrl ?? `${style.bitmapId}.png`;
      const m = bitmapMatrixPx(style.matrix ?? { a: 20, b: 0, c: 0, d: 20, tx: 0, ty: 0 }, ox, oy);
      defs.push(
        `<pattern id="${id}" width="${bw}" height="${bh}" viewBox="0 0 ${bw} ${bh}" patternUnits="userSpaceOnUse" overflow="visible" patternTransform="${matrixStr(m)}">` +
        `<image width="${bw}" height="${bh}" data-swf-bitmap="${style.bitmapId}" href="${href}" preserveAspectRatio="none"/>` +
        `</pattern>`,
      );
      void smoothed;
      return `fill="url(#${id})"`;
    }
    return 'fill="none"';
  };

  const flushGroup = () => {
    for (const [idx, edges] of [...fillEdges].sort((a, b) => a[0] - b[0])) {
      const d = stitchClosed(edges);
      if (!d) continue;
      paths.push(`<path d="${d}" ${fillAttr(idx)} fill-rule="${evenOdd}" stroke="none"/>`);
    }
    for (const [idx, edges] of [...lineEdges].sort((a, b) => a[0] - b[0])) {
      const style = lines[idx - 1];
      if (!style) continue;
      const d = stitchOpen(edges);
      if (!d) continue;
      const { hex, opacity } = colorOpacity(style.color);
      const w = toWidth(style.width);
      paths.push(
        `<path d="${d}" fill="none" stroke="${esc(hex)}"${opacity ? ` stroke-opacity="${opacity}"` : ''}` +
        ` stroke-width="${Math.max(w, 0.05)}" stroke-linecap="${style.startCap === 1 ? 'butt' : style.startCap === 3 ? 'square' : 'round'}"` +
        ` stroke-linejoin="${style.join === 1 ? 'miter' : style.join === 2 ? 'bevel' : 'round'}"/>`,
      );
    }
    fillEdges.clear();
    lineEdges.clear();
  };

  for (const rec of records) {
    if (rec.kind === 'style') {
      if (rec.fillStyle || rec.lineStyle) {
        flushGroup();
        curF0 = 0; curF1 = 0; curL = 0;
        if (rec.fillStyle) fills.splice(0, fills.length, ...rec.fillStyle);
        if (rec.lineStyle) lines.splice(0, lines.length, ...rec.lineStyle);
      }
      if (rec.fill0 !== undefined) curF0 = rec.fill0;
      if (rec.fill1 !== undefined) curF1 = rec.fill1;
      if (rec.line !== undefined) curL = rec.line;
      if (rec.move) pen = [rec.move.x, rec.move.y];
      continue;
    }
    const from: [number, number] = [pen[0], pen[1]];
    const to: [number, number] = rec.kind === 'straight'
      ? [pen[0] + rec.dx, pen[1] + rec.dy]
      : [pen[0] + rec.cx + rec.ax, pen[1] + rec.cy + rec.ay];
    const ctrl: [number, number] | undefined = rec.kind === 'curved'
      ? [pen[0] + rec.cx, pen[1] + rec.cy]
      : undefined;

    if (curF1 > 0) {
      let list = fillEdges.get(curF1);
      if (!list) { list = []; fillEdges.set(curF1, list); }
      list.push({ from, to, ctrl });
    }
    if (curF0 > 0) {
      let list = fillEdges.get(curF0);
      if (!list) { list = []; fillEdges.set(curF0, list); }
      list.push({ from: to, to: from, ctrl });
    }
    if (curL > 0) {
      let list = lineEdges.get(curL);
      if (!list) { list = []; lineEdges.set(curL, list); }
      list.push({ from, to, ctrl });
    }
    pen = to;
  }
  flushGroup();

  const w = Math.round((bounds.xMax - bounds.xMin) * PX * 1000) / 1000;
  const h = Math.round((bounds.yMax - bounds.yMin) * PX * 1000) / 1000;
  const body = paths.join('\n  ');
  const defsBlock = defs.length ? `\n  <defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">\n  ${body}${defsBlock}\n</svg>\n`;
}
