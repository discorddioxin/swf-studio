import { AssetCache } from './assets';
import {
  type ColorTransform, type DisplayItem, type Matrix, type Rect, type RunActor, type SwfDocument,
  type FlattenedFrame, type FlattenedSprite, type Timeline, IDENTITY, mul, mulColor, TWIPS,
} from '../types';

export interface Viewport { zoom: number; panX: number; panY: number }

export interface RenderOpts {
  doc: SwfDocument;
  cache: AssetCache;
  timeline: Timeline;
  frame: number;
  view: Viewport;
  showOutlines: boolean;
  showMasks: boolean;
  background: string;
  selectedPath?: string;
  onlyDepth?: number | null;
}

export interface FlatItem {
  path: string;              // "0.3.1" — index path through the display tree
  depthPath: number[];
  item: DisplayItem;
  world: Matrix;             // twips
  bounds?: Rect;             // local twips
  timelineId: string;
  localFrame: number;
  level: number;
}

const MAX_LEVEL = 12;

export function localFrameOf(item: DisplayItem, parentFrame: number, count: number) {
  if (count <= 1) return 0;
  const n = ((parentFrame - item.startFrame) % count + count) % count;
  return n;
}

function timelineFor(doc: SwfDocument, characterId: number): Timeline | undefined {
  const ch = doc.characters.get(characterId);
  if (!ch?.timelineId) return undefined;
  return doc.timelines.get(ch.timelineId);
}

/** Walk the display tree of a frame; used for picking, outlines and inspection. */
export function flatten(doc: SwfDocument, tl: Timeline, frame: number): FlatItem[] {
  const out: FlatItem[] = [];
  const visit = (timeline: Timeline, f: number, parent: Matrix, prefix: string, level: number) => {
    const fr = timeline.frames[Math.min(Math.max(f, 0), timeline.frames.length - 1)];
    if (!fr) return;
    fr.display.forEach((item, i) => {
      const world = mul(parent, item.matrix);
      const ch = doc.characters.get(item.characterId);
      const path = prefix ? `${prefix}.${i}` : String(i);
      out.push({
        path, depthPath: [], item, world, bounds: ch?.bounds,
        timelineId: timeline.id, localFrame: f, level,
      });
      const child = timelineFor(doc, item.characterId);
      if (child && level < MAX_LEVEL) {
        const lf = child.kind === 'button' ? 0 : localFrameOf(item, f, child.frameCount);
        visit(child, lf, world, path, level + 1);
      }
    });
  };
  visit(tl, frame, IDENTITY, '', 0);
  return out;
}

function frameBounds(flat: FlatItem[]): Rect {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const item of flat) {
    if (!item.bounds) continue;
    const rect = transformRect(item.world, item.bounds);
    xMin = Math.min(xMin, rect.xMin); yMin = Math.min(yMin, rect.yMin);
    xMax = Math.max(xMax, rect.xMax); yMax = Math.max(yMax, rect.yMax);
  }
  if (!Number.isFinite(xMin)) return { xMin: -400, yMin: -400, xMax: 400, yMax: 400 };
  return { xMin, yMin, xMax, yMax };
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode flattened PNG')), 'image/png');
  });
}

/** Render every frame of a sprite into an independent transparent PNG. The
 * display list is still traversed by depth, and nested sprite transforms remain
 * in TWIPS until the final canvas draw. */
export async function flattenSpriteToPng(
  doc: SwfDocument, cache: AssetCache, timeline: Timeline,
): Promise<FlattenedSprite> {
  const frames: FlattenedFrame[] = [];
  for (let frame = 0; frame < timeline.frameCount; frame++) {
    const flat = flatten(doc, timeline, frame);
    const leaves = flat.filter((item) => {
      const ch = doc.characters.get(item.item.characterId);
      return !!item.bounds && !!ch && ch.kind !== 'sprite' && ch.kind !== 'button' && ch.kind !== 'sound' && ch.kind !== 'font' && ch.kind !== 'binary';
    });
    await Promise.all(leaves.map((item) => {
      const ch = doc.characters.get(item.item.characterId)!;
      return cache.waitFor(ch.id, ch.kind, ch.bounds);
    }));

    const bounds = frameBounds(flat);
    const padding = 2 * TWIPS;
    const width = Math.max(1, Math.ceil((bounds.xMax - bounds.xMin + padding * 2) / TWIPS));
    const height = Math.max(1, Math.ceil((bounds.yMax - bounds.yMin + padding * 2) / TWIPS));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D rendering is unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(1 / TWIPS, 1 / TWIPS);
    ctx.translate(-bounds.xMin + padding, -bounds.yMin + padding);
    drawTimeline(ctx, {
      doc, cache, timeline, frame,
      view: { zoom: 1, panX: 0, panY: 0 },
      showOutlines: false, showMasks: true, background: 'transparent',
    }, timeline, frame, undefined, 0);
    const blob = await canvasBlob(canvas);
    const path = `flattened/${timeline.id.replace(/[^A-Za-z0-9:_-]/g, '_')}/frame_${String(frame + 1).padStart(4, '0')}.png`;
    frames.push({ id: `${timeline.id}:flattened:${frame}`, frame, width, height, path, blob, url: URL.createObjectURL(blob) });
  }
  return {
    id: `flattened:${timeline.id}`,
    characterId: timeline.characterId ?? -1,
    timelineId: timeline.id,
    name: timeline.name,
    frameCount: timeline.frameCount,
    frames,
  };
}

export function transformRect(m: Matrix, r: Rect): Rect {
  const pts = [
    [r.xMin, r.yMin], [r.xMax, r.yMin], [r.xMax, r.yMax], [r.xMin, r.yMax],
  ].map(([x, y]) => [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
}

export function render(ctx: CanvasRenderingContext2D, o: RenderOpts) {
  const { doc, view } = o;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  const stage = doc.header.stage;
  const w = (stage.xMax - stage.xMin) / TWIPS;
  const h = (stage.yMax - stage.yMin) / TWIPS;

  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.zoom, view.zoom);

  // stage backdrop
  ctx.fillStyle = o.background;
  ctx.fillRect(0, 0, w, h);

  // twips space: 20 twips = 1 px, and the stage origin may be non-zero
  ctx.save();
  ctx.scale(1 / TWIPS, 1 / TWIPS);
  if (o.timeline.kind !== 'root') {
    ctx.translate((stage.xMax + stage.xMin) / 2, (stage.yMax + stage.yMin) / 2);
  } else {
    ctx.translate(-stage.xMin, -stage.yMin);
  }
  ctx.imageSmoothingQuality = 'high';

  drawTimeline(ctx, o, o.timeline, o.frame, undefined, 0);
  ctx.restore();

  // stage border
  ctx.lineWidth = 1 / view.zoom;
  ctx.strokeStyle = 'rgba(148,163,184,.55)';
  ctx.strokeRect(0, 0, w, h);

  if (o.showOutlines) {
    const flat = flatten(doc, o.timeline, o.frame);
    ctx.save();
    ctx.scale(1 / TWIPS, 1 / TWIPS);
    if (o.timeline.kind !== 'root') {
      ctx.translate((stage.xMax + stage.xMin) / 2, (stage.yMax + stage.yMin) / 2);
    } else {
      ctx.translate(-stage.xMin, -stage.yMin);
    }
    ctx.lineWidth = TWIPS / view.zoom;
    for (const f of flat) {
      if (!f.bounds) continue;
      const r = transformRect(f.world, f.bounds);
      const selected = o.selectedPath === f.path;
      ctx.strokeStyle = selected ? '#f472b6' : f.level === 0 ? 'rgba(56,189,248,.5)' : 'rgba(148,163,184,.28)';
      ctx.lineWidth = (selected ? 2 : 1) * TWIPS / view.zoom;
      ctx.strokeRect(r.xMin, r.yMin, r.xMax - r.xMin, r.yMax - r.yMin);
    }
    ctx.restore();
  } else if (o.selectedPath) {
    const flat = flatten(doc, o.timeline, o.frame);
    const sel = flat.find((f) => f.path === o.selectedPath);
    if (sel?.bounds) {
      ctx.save();
      ctx.scale(1 / TWIPS, 1 / TWIPS);
      if (o.timeline.kind !== 'root') {
        ctx.translate((stage.xMax + stage.xMin) / 2, (stage.yMax + stage.yMin) / 2);
      } else {
        ctx.translate(-stage.xMin, -stage.yMin);
      }
      const r = transformRect(sel.world, sel.bounds);
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 2 * TWIPS / view.zoom;
      ctx.setLineDash([6 * TWIPS / view.zoom, 4 * TWIPS / view.zoom]);
      ctx.strokeRect(r.xMin, r.yMin, r.xMax - r.xMin, r.yMax - r.yMin);
      ctx.restore();
    }
  }

  ctx.restore();
}

export function drawTimeline(
  ctx: CanvasRenderingContext2D, o: RenderOpts, tl: Timeline, frame: number,
  parentColor: ColorTransform | undefined, level: number,
) {
  if (level > MAX_LEVEL) return;
  const fr = tl.frames[Math.min(Math.max(frame, 0), tl.frames.length - 1)];
  if (!fr) return;
  const clips: { until: number }[] = [];

  for (const item of fr.display) {
    while (clips.length && clips[clips.length - 1].until < item.depth) {
      clips.pop();
      ctx.restore();
    }
    if (level === 0 && o.onlyDepth != null && item.depth !== o.onlyDepth) continue;

    const ch = o.doc.characters.get(item.characterId);
    const color = mulColor(parentColor, item.colorTransform);

    if (item.clipDepth != null && item.clipDepth > item.depth) {
      // approximate mask: clip to the transformed bounding box of the mask shape
      ctx.save();
      if (o.showMasks && ch?.bounds) {
        const m = item.matrix;
        ctx.save();
        ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
        ctx.beginPath();
        ctx.rect(ch.bounds.xMin, ch.bounds.yMin, ch.bounds.xMax - ch.bounds.xMin, ch.bounds.yMax - ch.bounds.yMin);
        ctx.restore();
        ctx.clip();
      }
      clips.push({ until: item.clipDepth });
      continue;
    }

    ctx.save();
    const m = item.matrix;
    ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
    ctx.globalAlpha = Math.max(0, Math.min(1, (color?.am ?? 1) + (color?.aa ?? 0) / 255));

    if (ch?.kind === 'sprite' || ch?.kind === 'button') {
      const child = ch.timelineId ? o.doc.timelines.get(ch.timelineId) : undefined;
      if (child) {
        const lf = child.kind === 'button' ? 0 : localFrameOf(item, frame, child.frameCount);
        drawTimeline(ctx, o, child, lf, color, level + 1);
      } else {
        placeholder(ctx, ch?.bounds, '#a78bfa');
      }
    } else {
      drawCharacter(ctx, o, item, level);
    }
    ctx.restore();
  }
  while (clips.length) { clips.pop(); ctx.restore(); }
}

function drawCharacter(ctx: CanvasRenderingContext2D, o: RenderOpts, item: DisplayItem, _level: number) {
  const ch = o.doc.characters.get(item.characterId);
  if (!ch) { placeholder(ctx, undefined, '#f43f5e', `#${item.characterId}?`); return; }
  if (ch.kind === 'sound' || ch.kind === 'font' || ch.kind === 'binary') return;

  const a = o.cache.get(ch.id, ch.kind, ch.bounds);
  if (a.status === 'ready' && a.img && a.dest) {
    try { ctx.drawImage(a.img, a.dest.x, a.dest.y, a.dest.w, a.dest.h); }
    catch { placeholder(ctx, ch.bounds, '#f59e0b'); }
    return;
  }
  if (a.status === 'ready' && a.text != null && ch.bounds) {
    // texts/*.txt has no glyph geometry — draw the string inside its bounds so
    // layout is still readable while labelling
    const b = ch.bounds;
    ctx.save();
    ctx.fillStyle = 'rgba(56,189,248,.10)';
    ctx.strokeStyle = 'rgba(56,189,248,.5)';
    ctx.lineWidth = TWIPS;
    ctx.fillRect(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin);
    ctx.strokeRect(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin);
    const size = Math.max(8 * TWIPS, Math.min(20 * TWIPS, (b.yMax - b.yMin) * 0.7));
    ctx.fillStyle = '#e0f2fe';
    ctx.font = `${size}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    const line = a.text.replace(/\s+/g, ' ').trim().slice(0, 120);
    ctx.fillText(line, b.xMin + TWIPS * 2, b.yMin + TWIPS * 2, Math.max(TWIPS, b.xMax - b.xMin - 4 * TWIPS));
    ctx.restore();
    return;
  }
  if (a.status === 'loading') { placeholder(ctx, ch.bounds, 'rgba(148,163,184,.35)'); return; }
  placeholder(ctx, ch.bounds, ch.kind === 'text' || ch.kind === 'edittext' ? '#38bdf8' : '#f43f5e',
    `${ch.kind} #${ch.id}`);
}

function placeholder(ctx: CanvasRenderingContext2D, b: Rect | undefined, color: string, text?: string) {
  const r = b ?? { xMin: 0, yMin: 0, xMax: 40 * TWIPS, yMax: 40 * TWIPS };
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color.startsWith('#') ? color + '22' : color;
  ctx.lineWidth = TWIPS;
  ctx.setLineDash([4 * TWIPS, 3 * TWIPS]);
  ctx.fillRect(r.xMin, r.yMin, r.xMax - r.xMin, r.yMax - r.yMin);
  ctx.strokeRect(r.xMin, r.yMin, r.xMax - r.xMin, r.yMax - r.yMin);
  if (text) {
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = `${11 * TWIPS}px ui-sans-serif, system-ui`;
    ctx.fillText(text, r.xMin + 3 * TWIPS, r.yMin + 13 * TWIPS);
  }
  ctx.restore();
}

/** screen px -> stage px -> twips, then hit-test flattened bounds (top-most first) */
export function pick(doc: SwfDocument, tl: Timeline, frame: number, view: Viewport, sx: number, sy: number) {
  const stage = doc.header.stage;
  let x = (sx - view.panX) / view.zoom * TWIPS;
  let y = (sy - view.panY) / view.zoom * TWIPS;
  if (tl.kind !== 'root') {
    x -= (stage.xMax + stage.xMin) / 2;
    y -= (stage.yMax + stage.yMin) / 2;
  } else {
    x += stage.xMin;
    y += stage.yMin;
  }
  const flat = flatten(doc, tl, frame);
  for (let i = flat.length - 1; i >= 0; i--) {
    const f = flat[i];
    if (!f.bounds) continue;
    const r = transformRect(f.world, f.bounds);
    if (x >= r.xMin && x <= r.xMax && y >= r.yMin && y <= r.yMax) return f;
  }
  return null;
}

// --- Code Orchestrator runtime helpers -------------------------------------
// The Code Orchestrator "Run" view is a shell that executes the game the way
// the SWF/Flash runtime would: a master clock advances the timeline at the SWF
// frame rate, each actor (a sprite) plays its clip, and each actor's frame
// events (actions / sounds / labels) are dispatched as the frame executes.
// Actors are placed on the stage and composed front-to-back by y, like the
// Flash display list.

export function actorWorldBox(item: DisplayItem, b: Rect) {
  const ax = (item.matrix.a * b.xMin + item.matrix.c * b.yMin + item.matrix.tx) / TWIPS;
  const ay = (item.matrix.b * b.xMin + item.matrix.d * b.yMin + item.matrix.ty) / TWIPS;
  const bx = (item.matrix.a * b.xMax + item.matrix.c * b.yMax + item.matrix.tx) / TWIPS;
  const by = (item.matrix.b * b.xMax + item.matrix.d * b.yMax + item.matrix.ty) / TWIPS;
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

function timelineForDoc(doc: SwfDocument, characterId: number): Timeline | undefined {
  const ch = doc.characters.get(characterId);
  if (!ch?.timelineId) return undefined;
  return doc.timelines.get(ch.timelineId);
}

export function drawActorFrame(
  ctx: CanvasRenderingContext2D, opts: { doc: SwfDocument; cache: AssetCache; showMasks: boolean },
  actor: RunActor,
) {
  const tl = timelineForDoc(opts.doc, actor.characterId);
  const b = chBounds(opts.doc, actor.characterId);
  if (!tl) { placeholder(ctx, b ?? { xMin: -40 * TWIPS, yMin: -40 * TWIPS, xMax: 40 * TWIPS, yMax: 40 * TWIPS }, '#f43f5e', `#${actor.characterId}`); return; }
  const lf = Math.max(0, (actor.localFrame - tl.frames[0].index) % Math.max(1, tl.frameCount));
  const ro: RenderOpts = {
    doc: opts.doc, cache: opts.cache, timeline: tl, frame: lf,
    view: { zoom: 1, panX: 0, panY: 0 }, showOutlines: false, showMasks: opts.showMasks, background: 'transparent',
  };
  drawTimeline(ctx, ro, tl, lf, undefined, 0);
}

function chBounds(doc: SwfDocument, characterId: number): Rect | undefined {
  return doc.characters.get(characterId)?.bounds;
}

export function runActorTick(
  a: RunActor, timeline: Timeline,
  onEvent: (name: string, frame: number, e: { kind: string; tagType: string; detail: string }) => void,
  onStop: (name: string) => void,
) {
  a.elapsedTicks++;
  let next = a.localFrame + 1;
  if (next > a.clipEnd) next = a.loop ? a.clipStart : a.clipEnd;
  if (next === a.localFrame && !a.loop) { a.playing = false; onStop(a.name); return; }
  a.localFrame = next;
  const frameData = timeline.frames.find((f) => f.index === next);
  if (!frameData) return;
  for (const e of frameData.events) {
    if (e.kind === 'action' || e.kind === 'sound' || e.kind === 'label') {
      onEvent(a.name, next, { kind: e.kind, tagType: e.tagType, detail: e.detail });
    }
  }
}

/** Generate the onFrameUpdate TypeScript "source" for the focused actor's clip,
 *  so the Run view can show the code being executed frame-by-frame. */
export function genActorOnFrame(timeline: Timeline, actor: RunActor, actorName: string): string {
  const lines: string[] = [];
  lines.push(`// Generated by the Code Orchestrator — this code executes at runtime.`);
  lines.push(`// Actor "${actorName}" plays clip frames ${actor.clipStart + 1}-${actor.clipEnd + 1} of "${timeline.name}".`);
  lines.push(`${ident(actorName)}.registerClip({ frames: ${actor.clipEnd - actor.clipStart + 1}, loop: ${actor.loop} });`);
  lines.push('');
  lines.push(`onFrameUpdate(frameIndex: number) {`);
  lines.push(`  switch (frameIndex) {`);
  for (let i = actor.clipStart; i <= actor.clipEnd; i++) {
    const fr = timeline.frames.find((ff) => ff.index === i);
    if (!fr) continue;
    lines.push(`    case ${i}: // frame ${i + 1}${fr.label ? ` (label "${fr.label}")` : ''}`);
    const evs = f_events(fr);
    for (const line of evs) lines.push(`      ${line}`);
    if (!evs.length) lines.push(`      // (no events this frame)`);
    lines.push(`      break;`);
  }
  lines.push('  }');
  lines.push('}');
  return lines.join('\n');
}
function f_events(fr: Timeline['frames'][number]): string[] {
  const evs = fr.events.filter((e) => e.kind === 'action' || e.kind === 'sound' || e.kind === 'label');
  return evs.map((e) => `// ${e.kind}: ${e.tagType}${e.detail ? ' — ' + e.detail.replace(/\n/g, ' ') : ''}`);
}
function ident(s: string): string {
  return s.replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^(\d)/, '_$1') || 'actor';
}

/** Render the orchestrator stage: SWF-stage world in px with placed actors
 *  composed front-to-back by y, like the Flash display list. */
export function renderOrchestratorScene(
  ctx: CanvasRenderingContext2D,
  opts: { doc: SwfDocument; cache: AssetCache; actors: RunActor[]; view: Viewport; showMasks: boolean; showOutline: boolean; selectedId: string | null; background: string },
) {
  const { doc, view } = opts;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  const stage = doc.header.stage;
  const w = (stage.xMax - stage.xMin) / TWIPS;
  const h = (stage.yMax - stage.yMin) / TWIPS;

  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.zoom, view.zoom);

  // stage backdrop
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, w, h);
  // subtle grid
  ctx.strokeStyle = 'rgba(148,163,184,0.07)';
  ctx.lineWidth = 1 / view.zoom;
  for (let gx = 0; gx <= w; gx += 50) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
  for (let gy = 0; gy <= h; gy += 50) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(148,163,184,0.4)';
  ctx.lineWidth = 1 / view.zoom;
  ctx.strokeRect(0, 0, w, h);

  // Actors are placed at their SWF PlaceObject matrix position and composed
  // back-to-front by SWF depth (lower depth behind, higher depth in front).
  const actors = [...opts.actors].sort((a, b) => a.depth - b.depth);
  for (const actor of actors) {
    ctx.save();
    // Apply the actor's SWF PlaceObject matrix (twips) then scale twips→px.
    const m = actor.matrix;
    ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
    ctx.scale(1 / TWIPS, 1 / TWIPS);
    drawActorFrame(ctx, { doc, cache: opts.cache, showMasks: opts.showMasks }, actor);
    if (o_showOutline(opts, actor.id)) {
      const b = chBounds(doc, actor.characterId);
      if (b) {
        ctx.save();
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = 2 * TWIPS;
        ctx.setLineDash([6 * TWIPS, 4 * TWIPS]);
        ctx.strokeRect(b.xMin, b.yMin, r6(b.xMax - b.xMin), r6(b.yMax - b.yMin));
        ctx.restore();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
function o_showOutline(o: { showOutline: boolean; selectedId: string | null }, id: string) {
  return o.showOutline && o.selectedId === id;
}
function r6(n: number) { return Math.round(n * 1000) / 1000; }
