import { useEffect, useRef, useState } from 'react';
import type { AssetCache } from '../lib/assets';
import { SwfRuntime } from '../engine/runtime';
import { render } from '../lib/render';
import type { RuntimeEvent } from '../engine/types';
import type { SwfDocument } from '../types';
import { cn } from '../utils/cn';
import { Button } from './ui';

export function ExecuteTab({ doc, cache }: { doc: SwfDocument; cache: AssetCache }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SwfRuntime | null>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(true);

  // Create the runtime once per document.
  useEffect(() => {
    if (!doc) return;
    const root = doc.root;
    const canvas = canvasRef.current;
    const runtime = new SwfRuntime({
      frameRate: doc.header.frameRate,
      totalFrames: root.frameCount,
      render: (ctx) => {
        const stage = doc.header.stage;
        const w = (stage.xMax - stage.xMin) / 20;
        const h = (stage.yMax - stage.yMin) / 20;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas?.width ?? 1, canvas?.height ?? 1);
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, canvas?.width ?? 1, canvas?.height ?? 1);
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.translate(40, 40);
        const scale = Math.min((size.w - 80) / w, (size.h - 80) / h, 1);
        ctx.scale(scale, scale);
        ctx.translate(-stage.xMin, -stage.yMin);
        render(ctx, {
          doc,
          cache,
          timeline: root,
          frame: runtime.frame,
          view: { zoom: 1, panX: 0, panY: 0 },
          showOutlines: false,
          showMasks: true,
          background: 'transparent',
        });
        ctx.restore();
      },
    });
    runtimeRef.current = runtime;
    const unsub = runtime.onEvent((event: RuntimeEvent) => {
      setEvents((prev) => [...prev.slice(-199), event]);
      setFrame(runtime.frame);
    });
    return () => {
      unsub();
      runtimeRef.current = null;
    };
  }, [doc, cache, size]);

  // Resize observer.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Animation loop.
  useEffect(() => {
    if (!playing || !runtimeRef.current) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      runtimeRef.current?.tick(t - last);
      last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const runtime = runtimeRef.current;
  const togglePlay = () => {
    if (!runtime) return;
    if (runtime.playing) runtime.pause();
    else runtime.play();
    setPlaying(runtime.playing);
  };

  const stepFrame = () => {
    runtime?.pause();
    runtime?.step();
    setPlaying(false);
    setFrame(runtime?.frame ?? 0);
  };

  const resetRuntime = () => {
    runtime?.reset();
    setPlaying(false);
    setFrame(0);
    setEvents([]);
  };

  const exportRuntimeSource = () => {
    const source = generateRuntimeSource(doc);
    const blob = new Blob([source], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'swf-runtime.ts';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-zinc-100">Execute</div>
          <div className="text-[10px] text-zinc-600">Isolated SWF runtime · frame {frame + 1}/{doc.root.frameCount}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant={playing ? 'primary' : 'default'} onClick={togglePlay}>{playing ? '❚❚ Pause' : '▶ Play'}</Button>
          <Button onClick={stepFrame}>Step</Button>
          <Button onClick={resetRuntime}>Reset</Button>
          <Button variant={consoleOpen ? 'primary' : 'ghost'} onClick={() => setConsoleOpen((v) => !v)}>Console</Button>
          <Button onClick={exportRuntimeSource}>Export TS</Button>
        </div>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-zinc-950">
        <canvas
          ref={canvasRef}
          width={size.w * (window.devicePixelRatio || 1)}
          height={size.h * (window.devicePixelRatio || 1)}
          style={{ width: size.w, height: size.h }}
        />
      </div>
      {consoleOpen && (
        <div className="h-44 shrink-0 border-t border-zinc-800 bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Runtime Console ({events.length})</span>
            <button className="text-[10px] text-zinc-600 hover:text-zinc-300" onClick={() => setEvents([])}>clear</button>
          </div>
          <div className="h-[calc(100%-2rem)] overflow-y-auto px-3 py-2 font-mono text-[10px] leading-relaxed">
            {events.length === 0 && <span className="text-zinc-600">No runtime events yet.</span>}
            {events.map((e, i) => (
              <div key={i} className={cn(e.kind === 'error' ? 'text-rose-300' : e.kind === 'trace' ? 'text-amber-300' : e.kind === 'display' ? 'text-sky-300' : e.kind === 'control' ? 'text-violet-300' : 'text-zinc-400')}>
                f{e.frame + 1} · {e.tagType}{e.detail ? ` — ${e.detail}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function generateRuntimeSource(doc: SwfDocument): string {
  const lines: string[] = [];
  lines.push('// Generated by SWF Forge Execute tab.');
  lines.push('// A pure TypeScript SWF runtime shell generated from the parsed SWF.');
  lines.push('');
  lines.push(`// Frame rate: ${doc.header.frameRate} fps`);
  lines.push(`// Total frames: ${doc.root.frameCount}`);
  lines.push(`// Stage: ${(doc.header.stage.xMax - doc.header.stage.xMin) / 20} x ${(doc.header.stage.yMax - doc.header.stage.yMin) / 20} px`);
  lines.push('');
  lines.push(`const clock = new FrameClock(${doc.header.frameRate}, ${doc.root.frameCount});`);
  lines.push('const scope = createFlashScope(clock.bridge);');
  lines.push('');
  lines.push('function onFrame(frameIndex: number) {');
  lines.push('  switch (frameIndex) {');
  for (const frame of doc.root.frames) {
    const events = frame.events.filter((e) => e.kind === 'action' || e.kind === 'sound' || e.kind === 'label');
    if (events.length) {
      lines.push(`    case ${frame.index}:`);
      for (const e of events) {
        if (e.kind === 'action') {
          lines.push(`      // ActionScript: ${e.detail.replace(/\n/g, '\n      ')}`);
        } else if (e.kind === 'sound') {
          lines.push(`      // Sound: #${e.characterId ?? '?'} (${e.tagType})`);
        } else if (e.kind === 'label') {
          lines.push(`      // Label: ${e.detail}`);
        }
      }
      lines.push('      break;');
    }
  }
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push('export { clock, scope, onFrame };');
  return lines.join('\n');
}
