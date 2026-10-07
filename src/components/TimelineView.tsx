import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectApi } from '../lib/project';
import type { EventKind, SwfDocument, Timeline } from '../types';
import { cn } from '../utils/cn';
import { Button, EVENT_COLOR, inputCls } from './ui';
import { buildFramesForContainer } from '../lib/exporter';

const PRIORITY: EventKind[] = ['action', 'sound', 'label', 'other'];

const CELL_BG: Record<string, string> = {
  action: 'bg-rose-500/70 hover:bg-rose-400',
  sound: 'bg-cyan-500/70 hover:bg-cyan-400',
  label: 'bg-amber-500/70 hover:bg-amber-400',
  other: 'bg-violet-500/70 hover:bg-violet-400',
  plain: 'bg-zinc-700/60 hover:bg-zinc-600',
  empty: 'bg-zinc-800/60 hover:bg-zinc-700',
};

export function TimelineView({
  doc, timeline, frame, setFrame, playing, setPlaying, api, loopRange, setLoopRange, fps, setFps,
  startFrame, setStartFrame,
}: {
  doc: SwfDocument;
  timeline: Timeline;
  frame: number;
  setFrame: (n: number) => void;
  playing: boolean;
  setPlaying: (b: boolean) => void;
  api: ProjectApi;
  loopRange: [number, number] | null;
  setLoopRange: (r: [number, number] | null) => void;
  fps: number;
  setFps: (n: number) => void;
  startFrame: number;
  setStartFrame: (n: number) => void;
}) {
  const [cw, setCw] = useState(16);
  const scroller = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [vw, setVw] = useState(900);
  const [stripHeight, setStripHeight] = useState(58);

  // States for drag-selection and right-click context menu
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; frameIndex: number } | null>(null);

  // States for inline non-invasive clip naming
  const [isNamingClip, setIsNamingClip] = useState(false);
  const [newClipName, setNewClipName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Close context menu on global clicks
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const count = timeline.frameCount;
  const frameCellHeight = Math.max(34, stripHeight - 24);
  const frameTop = Math.max(20, Math.round((stripHeight - frameCellHeight) / 2));
  const frameBarHeight = Math.max(16, Math.min(96, Math.round(frameCellHeight * 0.56)));
  const clips = useMemo(() => api.project.clips.filter((c) => c.timelineId === timeline.id), [api.project.clips, timeline.id]);
  const markers = useMemo(() => api.project.markers.filter((m) => m.timelineId === timeline.id), [api.project.markers, timeline.id]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      setVw(el.clientWidth);
      setStripHeight(Math.max(58, el.clientHeight));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Compute the 0-based frame offset from startFrame (which is 1-based)
  const startFrameOffset = Math.max(0, Math.min(count - 1, startFrame - 1));

  // Find where the current playhead frame resides in the shifted frame list
  const playheadIdx = (frame - startFrameOffset + count) % count;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const x = playheadIdx * cw;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 60) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
    }
  }, [playheadIdx, cw]);

  // Generate ordered list of frame indices
  const orderedIndices = useMemo(() => {
    const arr = [];
    for (let idx = 0; idx < count; idx++) {
      arr.push((idx + startFrameOffset) % count);
    }
    return arr;
  }, [count, startFrameOffset]);

  const start = Math.max(0, Math.floor(scroll / cw) - 4);
  const end = Math.min(count, Math.ceil((scroll + vw) / cw) + 4);
  const visibleIndices = useMemo(() => {
    return orderedIndices.slice(start, end);
  }, [orderedIndices, start, end]);

  const step = (d: number) => { setPlaying(false); setFrame(Math.max(0, Math.min(count - 1, frame + d))); };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col border-t border-zinc-800 bg-zinc-950"
      onMouseUp={() => setIsDragging(false)}
    >
      {/* transport */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={() => { setPlaying(false); setFrame(0); }} title="First frame">⏮</Button>
          <Button variant="ghost" onClick={() => step(-1)} title="Previous frame">◀</Button>
          <Button variant="primary" onClick={() => setPlaying(!playing)} className="w-10">{playing ? '❚❚' : '▶'}</Button>
          <Button variant="ghost" onClick={() => step(1)} title="Next frame">▶</Button>
          <Button variant="ghost" onClick={() => { setPlaying(false); setFrame(count - 1); }} title="Last frame">⏭</Button>
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          <input
            type="number"
            className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100"
            value={frame + 1}
            min={1}
            max={count}
            onChange={(e) => setFrame(Math.max(0, Math.min(count - 1, Number(e.target.value) - 1)))}
          />
          <span className="text-zinc-600">/ {count}</span>
        </div>
        <Button variant={showAdvanced ? 'default' : 'ghost'} className="px-2 py-1 text-[10px]" onClick={() => setShowAdvanced((value) => !value)}>
          Options {showAdvanced ? '−' : '+'}
        </Button>
        <label className="flex shrink-0 items-center gap-1.5 border-l border-zinc-800 pl-2 text-[10px] text-zinc-500" title="Change the width of each frame node">
          <span>zoom</span>
          <input
            type="range" min={6} max={34} value={cw}
            onChange={(e) => setCw(Number(e.target.value))}
            className="w-20 accent-violet-500"
            aria-label="Timeline frame zoom"
          />
          <span className="w-7 text-right tabular-nums text-zinc-400">{cw}px</span>
        </label>
        {showAdvanced && <>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          fps
          <input
            type="number" value={fps} min={1} max={120}
            onChange={(e) => setFps(Math.max(1, Number(e.target.value) || 1))}
            className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100"
          />
          <button className="text-[10px] text-violet-400 hover:underline" onClick={() => setFps(doc.header.frameRate)}>
            swf {doc.header.frameRate}
          </button>
        </label>

        <label className="flex items-center gap-1 text-xs text-zinc-500 border-l border-zinc-800 pl-2">
          start frame
          <input
            type="number" value={startFrame} min={1} max={count}
            onChange={(e) => setStartFrame(Math.max(1, Math.min(count, Number(e.target.value) || 1)))}
            className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 font-semibold text-violet-400"
          />
        </label>

        <div className="flex items-center gap-1">
          <Button
            variant={loopRange ? 'primary' : 'default'}
            onClick={() => setLoopRange(loopRange ? null : [frame, Math.min(count - 1, frame + 9)])}
            title="Loop a sub-range of frames"
          >
            {loopRange ? `loop ${loopRange[0] + 1}–${loopRange[1] + 1}` : 'set loop'}
          </Button>
          {!loopRange && (
            <Button
              variant="primary"
              onClick={() => {
                setLoopRange([frame, frame]);
                setNewClipName(`clip_${frame + 1}`);
                setIsNamingClip(true);
              }}
              title="Create a clip from the selected frame or highlighted range"
            >＋ clip from range</Button>
          )}
          {loopRange && (
            <>
              <Button onClick={() => setLoopRange([frame, Math.max(frame, loopRange[1])])} title="Set in point to playhead">in</Button>
              <Button onClick={() => setLoopRange([Math.min(frame, loopRange[0]), frame])} title="Set out point to playhead">out</Button>
              {isNamingClip ? (
                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 p-0.5 rounded pl-1.5" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[10px] text-zinc-500 font-medium">Clip name:</span>
                  <input
                    className={cn(inputCls, 'w-32 py-0.5 px-1 text-xs border-none bg-transparent outline-none focus:ring-0')}
                    value={newClipName}
                    autoFocus
                    placeholder="clip_name"
                    onChange={(e) => setNewClipName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newClipName.trim()) {
                        api.addClip({ timelineId: timeline.id, name: newClipName.trim(), start: loopRange[0], end: loopRange[1], loop: true, tags: [], fps, frames: buildFramesForContainer(timeline, loopRange[0], loopRange[1]) });
                        setIsNamingClip(false);
                      }
                      if (e.key === 'Escape') {
                        setIsNamingClip(false);
                      }
                    }}
                  />
                  <Button
                    variant="primary"
                    className="py-0.5 px-1.5 text-[10px]"
                    onClick={() => {
                      if (newClipName.trim()) {
                        api.addClip({ timelineId: timeline.id, name: newClipName.trim(), start: loopRange[0], end: loopRange[1], loop: true, tags: [], fps, frames: buildFramesForContainer(timeline, loopRange[0], loopRange[1]) });
                        setIsNamingClip(false);
                      }
                    }}
                  >Save</Button>
                  <Button
                    variant="ghost"
                    className="py-0.5 px-1.5 text-[10px] text-zinc-400 hover:text-zinc-200"
                    onClick={() => setIsNamingClip(false)}
                  >✕</Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    setNewClipName(`clip_${loopRange[0] + 1}_${loopRange[1] + 1}`);
                    setIsNamingClip(true);
                  }}
                >＋ clip from range</Button>
              )}
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
          {PRIORITY.map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={cn('h-2 w-2 rounded-sm', EVENT_COLOR[k].dot)} />{EVENT_COLOR[k].label}
            </span>
          ))}
        </div>
        </>}
      </div>

      {/* frame strip */}
      <div
        ref={scroller}
        data-timeline-frame-strip="true"
        onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
        className="relative min-h-[58px] flex-1 overflow-x-auto overflow-y-hidden border-t border-zinc-900 bg-zinc-950 pb-1"
      >
        <div className="relative" style={{ width: count * cw, height: stripHeight }}>
          {/* clip bands (possibly wrapped) */}
          {clips.map((c, i) => {
            const sIdx = (c.start - startFrameOffset + count) % count;
            const eIdx = (c.end - startFrameOffset + count) % count;
            const segments = [];
            if (sIdx <= eIdx) {
              segments.push({ left: sIdx * cw, width: (eIdx - sIdx + 1) * cw });
            } else {
              segments.push({ left: sIdx * cw, width: (count - sIdx) * cw });
              segments.push({ left: 0, width: (eIdx + 1) * cw });
            }
            return segments.map((seg, segIdx) => (
              <div
                key={`${c.id}-${segIdx}`}
                className="absolute rounded-sm border border-emerald-500/40 bg-emerald-500/15 cursor-pointer hover:bg-emerald-500/25"
                style={{ left: seg.left, width: Math.max(cw, seg.width), top: 0 + (i % 2) * 9, height: 8 }}
                title={`${c.name} (${c.start + 1}–${c.end + 1})`}
                onClick={() => { setFrame(c.start); setLoopRange([c.start, c.end]); }}
              >
                {segIdx === 0 && (
                  <span className="pointer-events-none absolute left-1 -top-0.5 whitespace-nowrap text-[8px] leading-none text-emerald-300">
                    {c.name}
                  </span>
                )}
              </div>
            ));
          })}
          {/* loop range (possibly wrapped) */}
          {loopRange && (() => {
            const sIdx = (loopRange[0] - startFrameOffset + count) % count;
            const eIdx = (loopRange[1] - startFrameOffset + count) % count;
            if (sIdx <= eIdx) {
              return (
                <div
                  className="pointer-events-none absolute border-x-2 border-violet-500/70 bg-violet-500/10"
                  style={{ left: sIdx * cw, width: (eIdx - sIdx + 1) * cw, top: frameTop - 2, height: frameCellHeight + 4 }}
                />
              );
            } else {
              return (
                <>
                  <div
                    className="pointer-events-none absolute border-l-2 border-violet-500/70 bg-violet-500/10"
                    style={{ left: sIdx * cw, width: (count - sIdx) * cw, top: frameTop - 2, height: frameCellHeight + 4 }}
                  />
                  <div
                    className="pointer-events-none absolute border-r-2 border-violet-500/70 bg-violet-500/10"
                    style={{ left: 0, width: (eIdx + 1) * cw, top: frameTop - 2, height: frameCellHeight + 4 }}
                  />
                </>
              );
            }
          })()}
          {/* frame cells in visible indices order */}
          {visibleIndices.map((i) => {
            const idx = (i - startFrameOffset + count) % count;
            const f = timeline.frames[i];
            const kinds = new Set(f?.kinds ?? []);
            const top = PRIORITY.find((k) => kinds.has(k));
            const has = f && (f.ops.length || f.events.length);
            const bg = top ? CELL_BG[top] : has ? CELL_BG.plain : CELL_BG.empty;
            const isHighlighted = loopRange && i >= loopRange[0] && i <= loopRange[1];
            return (
              <div
                key={i}
                data-frame-index={i}
                onMouseDown={(e) => {
                  if (e.button === 0) { // left click starts drag
                    setDragStart(i);
                    setIsDragging(true);
                    setPlaying(false);
                    setFrame(i);
                    if (!e.shiftKey) {
                      setLoopRange([i, i]);
                    } else if (loopRange) {
                      setLoopRange([Math.min(loopRange[0], i), Math.max(loopRange[0], i)]);
                    }
                  }
                }}
                onMouseEnter={() => {
                  if (isDragging && dragStart !== null) {
                    setLoopRange([Math.min(dragStart, i), Math.max(dragStart, i)]);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // If clicked outside current highlighted range, select just this frame
                  if (!loopRange || i < loopRange[0] || i > loopRange[1]) {
                    setLoopRange([i, i]);
                  }
                  setMenu({ x: e.clientX, y: e.clientY, frameIndex: i });
                }}
                onClick={(e) => {
                  if (e.shiftKey && loopRange) {
                    setLoopRange([Math.min(loopRange[0], i), Math.max(loopRange[0], i)]);
                  }
                }}
                className={cn(
                  "absolute cursor-pointer select-none rounded transition-all",
                  isHighlighted ? "bg-violet-500/10 ring-1 ring-violet-500/30" : ""
                )}
                style={{ left: idx * cw, top: frameTop, width: cw - 1, height: frameCellHeight }}
                title={frameTooltip(timeline, i)}
              >
                <div
                  className={cn('w-full rounded-sm transition-colors', bg, frame === i && 'ring-2 ring-white', isHighlighted && 'brightness-125')}
                  style={{ height: frameBarHeight }}
                />
                <div className="mt-0.5 flex h-2 items-start justify-center gap-[1px]">
                  {PRIORITY.filter((k) => kinds.has(k) && k !== top).map((k) => (
                    <span key={k} className={cn('h-1 w-1 rounded-full', EVENT_COLOR[k].dot)} />
                  ))}
                  {markers.some((m) => m.frame === i) && <span className="h-1 w-1 rotate-45 bg-white" />}
                </div>
                {(idx % 5 === 0 || cw > 22) && (
                  <div className="flex flex-col items-center justify-center leading-none mt-0.5">
                    <div className={cn('text-[9px] font-bold', frame === i ? 'text-white' : isHighlighted ? 'text-violet-200' : 'text-violet-300')} title={`Relative frame ${idx + 1}`}>
                      {idx + 1}
                    </div>
                    {startFrameOffset > 0 && (
                      <div className="text-[7px] text-zinc-500 mt-0.5" title={`Original absolute frame ${i + 1}`}>
                        ({i + 1})
                      </div>
                    )}
                  </div>
                )}
                {f?.label && cw >= 12 && (
                  <div className="pointer-events-none absolute -top-[16px] left-0 max-w-32 truncate whitespace-nowrap text-[8px] font-medium text-amber-300">
                    ▸{f.label}
                  </div>
                )}
              </div>
            );
          })}
          {/* playhead */}
          <div className="pointer-events-none absolute w-[2px] bg-white/80" style={{ left: playheadIdx * cw + (cw - 1) / 2, top: frameTop - 4, height: frameCellHeight + 8 }} />
        </div>
      </div>

      {/* markers quick add */}
      <div className="flex items-center gap-2 border-t border-zinc-900 px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">frame {frame + 1}</span>
        <MarkerAdder api={api} timelineId={timeline.id} frame={frame} />
        <div className="flex flex-1 flex-wrap gap-1 overflow-hidden">
          {markers.filter((m) => m.frame === frame).map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300">
              <b className="text-violet-300">{m.type}</b> {m.name}
              <button className="text-zinc-500 hover:text-rose-400" onClick={() => api.removeMarker(m.id)}>×</button>
            </span>
          ))}
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-50 rounded-lg border border-zinc-700 bg-zinc-950 p-1.5 shadow-xl text-xs space-y-1 min-w-[200px]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-850 mb-1">
            Frame Range Actions
          </div>
          {loopRange && (
            <button
              className="w-full text-left px-2 py-1.5 rounded text-zinc-200 hover:bg-violet-600 hover:text-white transition flex items-center justify-between"
              onClick={() => {
                const name = prompt(
                  `Enter name for the contained animation [frames ${loopRange[0] + 1}–${loopRange[1] + 1}]:`,
                  `anim_${loopRange[0] + 1}_${loopRange[1] + 1}`
                );
                if (name && name.trim()) {
                  const framesMeta = buildFramesForContainer(timeline, loopRange[0], loopRange[1]);
                  api.addContainer({
                    timelineId: timeline.id,
                    name: name.trim(),
                    startFrame: loopRange[0],
                    endFrame: loopRange[1],
                    frameCount: loopRange[1] - loopRange[0] + 1,
                    frames: framesMeta,
                    tags: [],
                  });
                }
                setMenu(null);
              }}
            >
              <span>📦 Contain selection</span>
              <span className="text-[10px] text-zinc-500 font-normal bg-zinc-900 px-1 rounded">{loopRange[1] - loopRange[0] + 1}f</span>
            </button>
          )}
          <button
            className="w-full text-left px-2 py-1.5 rounded text-zinc-300 hover:bg-zinc-850 transition"
            onClick={() => {
              setLoopRange(null);
              setMenu(null);
            }}
          >
            Clear selection
          </button>
          <div className="border-t border-zinc-800 my-1" />
          <div className="px-2 py-0.5 text-[10px] text-zinc-500">
            Quick Add Marker:
          </div>
          {['marker', 'sound', 'action', 'hitbox', 'spawn'].map((t) => (
            <button
              key={t}
              className="w-full text-left px-2 py-1 rounded text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition text-[11px]"
              onClick={() => {
                api.addMarker({
                  timelineId: timeline.id,
                  frame: menu.frameIndex,
                  type: t as any,
                  name: `${t}_frame_${menu.frameIndex + 1}`,
                  tags: [],
                });
                setMenu(null);
              }}
            >
              ＋ Add {t} here
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MarkerAdder({ api, timelineId, frame }: { api: ProjectApi; timelineId: string; frame: number }) {
  const [type, setType] = useState<'sound' | 'action' | 'hitbox' | 'spawn' | 'marker' | 'custom'>('marker');
  const [name, setName] = useState('');
  return (
    <div className="flex items-center gap-1">
      <select value={type} onChange={(e) => setType(e.target.value as typeof type)}
        className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-200">
        {['marker', 'sound', 'action', 'hitbox', 'spawn', 'custom'].map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input
        className={cn(inputCls, 'w-40 py-0.5 text-[11px]')}
        placeholder="marker name + Enter"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) {
            api.addMarker({ timelineId, frame, type, name: name.trim(), tags: [] });
            setName('');
          }
        }}
      />
    </div>
  );
}

function frameTooltip(tl: Timeline, i: number) {
  const f = tl.frames[i];
  if (!f) return `frame ${i + 1}`;
  const parts = [`frame ${i + 1}`];
  if (f.label) parts.push(`label: ${f.label}`);
  for (const e of f.events.slice(0, 8)) if (e.kind !== 'place' && e.kind !== 'remove') parts.push(`${e.tagType} ${e.detail}`);
  const places = f.ops.length;
  if (places) parts.push(`${places} placement op(s)`);
  return parts.join('\n');
}
