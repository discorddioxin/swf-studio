import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetCache } from '../lib/assets';
import { flatten, pick, render, transformRect, type Viewport } from '../lib/render';
import type { SwfDocument, Timeline } from '../types';
import { TWIPS } from '../types';
import { Button } from './ui';
import { cn } from '../utils/cn';

export function Stage({
  doc, cache, timeline, frame, tick, selectedPath, onPick,
}: {
  doc: SwfDocument;
  cache: AssetCache;
  timeline: Timeline;
  frame: number;
  tick: number;
  selectedPath?: string;
  onPick: (path: string | undefined, characterId?: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<Viewport>({ zoom: 1, panX: 20, panY: 20 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [outlines, setOutlines] = useState(false);
  const [masks, setMasks] = useState(true);
  const [bg, setBg] = useState('#1a1a1f');
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);

  const fit = useCallback(() => {
    const w = (doc.header.stage.xMax - doc.header.stage.xMin) / TWIPS;
    const h = (doc.header.stage.yMax - doc.header.stage.yMin) / TWIPS;
    const el = wrapRef.current;
    if (!el || !w || !h) return;
    const z = Math.min((el.clientWidth - 48) / w, (el.clientHeight - 48) / h);
    const zoom = Math.max(0.05, Math.min(4, z));
    setView({ zoom, panX: (el.clientWidth - w * zoom) / 2, panY: (el.clientHeight - h * zoom) / 2 });
  }, [doc]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitContent = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const flat = flatten(doc, timeline, frame);
    const stage = doc.header.stage;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of flat) {
      if (!f.bounds) continue;
      const r = transformRect(f.world, f.bounds);
      x0 = Math.min(x0, r.xMin); y0 = Math.min(y0, r.yMin);
      x1 = Math.max(x1, r.xMax); y1 = Math.max(y1, r.yMax);
    }
    if (!Number.isFinite(x0) || x1 - x0 <= 0 || y1 - y0 <= 0) { fit(); return; }
    // Root timelines use the stage's top-left origin. Isolated sprites and
    // virtual previews are rendered with local (0,0) at stage center, so the
    // fit calculation must use that exact same coordinate conversion.
    const bx = timeline.kind === 'root'
      ? (x0 - stage.xMin) / TWIPS
      : (stage.xMax + stage.xMin) / (2 * TWIPS) + x0 / TWIPS;
    const by = timeline.kind === 'root'
      ? (y0 - stage.yMin) / TWIPS
      : (stage.yMax + stage.yMin) / (2 * TWIPS) + y0 / TWIPS;
    const bw = (x1 - x0) / TWIPS, bh = (y1 - y0) / TWIPS;
    const zoom = Math.max(0.05, Math.min(8, Math.min((el.clientWidth - 80) / bw, (el.clientHeight - 80) / bh)));
    setView({
      zoom,
      panX: el.clientWidth / 2 - (bx + bw / 2) * zoom,
      panY: el.clientHeight / 2 - (by + bh / 2) * zoom,
    });
  }, [doc, timeline, frame, fit]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => {
      if (timeline.kind === 'root') {
        fit();
      } else {
        fitContent();
      }
    }, 50); // small delay to let parent container dimensions settle
    return () => clearTimeout(timer);
  }, [timeline.id, doc, tick, size.w, size.h]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.floor(size.w * dpr));
    c.height = Math.max(1, Math.floor(size.h * dpr));
    c.style.width = size.w + 'px';
    c.style.height = size.h + 'px';
    const ctx = c.getContext('2d');
    if (!ctx) return;
    render(ctx, {
      doc, cache, timeline, frame, view,
      showOutlines: outlines, showMasks: masks, background: bg, selectedPath,
    });
  }, [doc, cache, timeline, frame, view, size, outlines, masks, bg, selectedPath, tick]);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-900/60"
      style={{ backgroundImage: 'linear-gradient(45deg,#18181b 25%,transparent 25%),linear-gradient(-45deg,#18181b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#18181b 75%),linear-gradient(-45deg,transparent 75%,#18181b 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0' }}
      ref={wrapRef}
    >
      <canvas
        ref={canvasRef}
        className={cn('absolute inset-0', drag.current ? 'cursor-grabbing' : 'cursor-grab')}
        onWheel={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          const factor = Math.exp(-e.deltaY * 0.0015);
          setView((v) => {
            const zoom = Math.max(0.02, Math.min(16, v.zoom * factor));
            const k = zoom / v.zoom;
            return { zoom, panX: mx - (mx - v.panX) * k, panY: my - (my - v.panY) * k };
          });
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
          setView((v) => ({ ...v, panX: d.panX + dx, panY: d.panY + dy }));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const rect = e.currentTarget.getBoundingClientRect();
            const hit = pick(doc, timeline, frame, view, e.clientX - rect.left, e.clientY - rect.top);
            onPick(hit?.path, hit?.item.characterId);
          }
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/90 p-1 backdrop-blur">
          <Button variant="ghost" onClick={fit} title="Fit the SWF stage rectangle">⤢ stage</Button>
          <Button variant="ghost" onClick={fitContent} title="Fit the visible content of this frame">⌖ content</Button>
          <Button variant="ghost" onClick={() => setView((v) => ({ ...v, zoom: v.zoom * 1.25 }))}>+</Button>
          <span className="w-12 text-center text-[11px] text-zinc-500">{Math.round(view.zoom * 100)}%</span>
          <Button variant="ghost" onClick={() => setView((v) => ({ ...v, zoom: v.zoom / 1.25 }))}>−</Button>
        </div>
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/90 p-1 backdrop-blur">
          <Button variant={outlines ? 'primary' : 'ghost'} onClick={() => setOutlines(!outlines)} title="Show instance bounds">bounds</Button>
          <Button variant={masks ? 'primary' : 'ghost'} onClick={() => setMasks(!masks)} title="Approximate clipDepth masks with bounding boxes">masks</Button>
          <input
            type="color" value={bg} onChange={(e) => setBg(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent" title="Stage colour"
          />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 rounded border border-zinc-800 bg-zinc-950/85 px-2 py-1 text-[10px] text-zinc-500 backdrop-blur">
        {timeline.name} · frame {frame + 1}/{timeline.frameCount} · stage{' '}
        {Math.round((doc.header.stage.xMax - doc.header.stage.xMin) / TWIPS)}×
        {Math.round((doc.header.stage.yMax - doc.header.stage.yMin) / TWIPS)} px @ {doc.header.frameRate}fps
      </div>
    </div>
  );
}
