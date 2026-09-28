// Inspector "Clips" tab (+ NumBox helper).
// Extracted verbatim from Inspector.tsx (DECOMPOSITION_SPEC phases 3–10).

import { useState } from 'react';
import { Head } from './shared';
import { buildFramesForContainer } from '../../lib/exporter';
import type { ProjectApi } from '../../lib/project';
import { type Timeline } from '../../types';
import { cn } from '../../utils/cn';
import { Button, TagInput, inputCls } from '../ui';

// ---------------------------------------------------------------- clips ----

export function ClipsPanel({ api, timeline, frame, setAll, onOpenTimeline, setFrame, setLoopRange }: {
  api: ProjectApi; timeline: Timeline; frame: number; setAll?: boolean;
  onOpenTimeline: (id: string) => void; setFrame: (f: number) => void;
  setLoopRange: (r: [number, number] | null) => void;
}) {
  const [showAll, setShowAll] = useState(!!setAll);
  const [expandedContainer, setExpandedContainer] = useState<string | null>(null);

  const clips = api.project.clips.filter((c) => showAll || c.timelineId === timeline.id);
  const markers = api.project.markers.filter((m) => showAll || m.timelineId === timeline.id);
  const containers = (api.project.containers ?? []).filter((c) => showAll || c.timelineId === timeline.id);

  return (
    <div className="space-y-4 p-3 text-xs">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <Head>Contained Animations ({containers.length})</Head>
        <label className="flex items-center gap-1 text-[10px] text-zinc-500">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> all timelines
        </label>
      </div>

      <p className="text-[10px] text-zinc-500 italic">
        💡 Drag-select frame cells on the timeline and right-click to "Contain" a range into a clip range. The TypeScript tab turns clips into playClip() ranges on the AS3 engine.
      </p>

      {containers.map((c) => {
        const isExp = expandedContainer === c.id;
        return (
          <div
            key={c.id}
            className="space-y-2 rounded-lg border border-violet-900/30 bg-violet-950/10 p-2.5 cursor-pointer hover:bg-violet-950/15"
            onClick={() => {
              onOpenTimeline(c.timelineId);
              setFrame(c.startFrame);
              setLoopRange([c.startFrame, c.endFrame]);
            }}
          >
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                className={cn(inputCls, 'flex-1 font-semibold text-violet-300')}
                value={c.name}
                placeholder="Animation Name"
                onChange={(e) => api.updateContainer(c.id, { name: e.target.value })}
              />
              <Button variant="ghost" onClick={() => setExpandedContainer(isExp ? null : c.id)} title="Toggle frames detail">
                {isExp ? '▲' : '▼'}
              </Button>
              <Button variant="danger" onClick={() => api.removeContainer(c.id)}>×</Button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-400 px-1">
              <span>Frames: <b>{c.startFrame + 1} – {c.endFrame + 1}</b> ({c.frameCount} frames)</span>
              {showAll && <span className="text-zinc-600 truncate max-w-[120px]">{c.timelineId}</span>}
            </div>

            {isExp && (
              <div className="mt-2 space-y-1.5 border-t border-zinc-850 pt-2 max-h-48 overflow-y-auto pr-1">
                {c.frames.map((fr) => (
                  <div key={fr.index} className="rounded border border-zinc-800 bg-zinc-900/50 p-1.5 space-y-1 text-[11px]">
                    <div className="flex justify-between font-medium text-zinc-300">
                      <span>Frame {fr.index + 1} <span className="text-[9px] text-zinc-500">(abs {fr.absoluteFrame + 1})</span></span>
                      {fr.label && <span className="text-amber-300 bg-amber-500/10 px-1 rounded text-[9px] font-semibold">▸{fr.label}</span>}
                    </div>
                    {fr.events.length > 0 && (
                      <div className="space-y-0.5">
                        {fr.events.map((ev, evIdx) => (
                          <div key={evIdx} className="text-[10px] text-rose-300/90 bg-rose-500/5 border border-rose-500/10 px-1 rounded truncate">
                            ⚡ {ev.tagType.replace('Tag', '')}: {ev.detail}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-500 flex flex-wrap gap-1 leading-none mt-1">
                      {fr.instances.map((inst, instIdx) => (
                        <span key={instIdx} className="bg-zinc-800 border border-zinc-700/60 px-1 py-0.5 rounded">
                          d{inst.depth}: #{inst.characterId}{inst.name ? ` "${inst.name}"` : ''}
                        </span>
                      ))}
                      {fr.instances.length === 0 && <span className="italic">no active instances</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <TagInput tags={c.tags} suggestions={api.allTags} onChange={(t) => api.updateContainer(c.id, { tags: t })} />
          </div>
        );
      })}

      {containers.length === 0 && (
        <p className="text-center p-3 text-zinc-600 border border-dashed border-zinc-800 rounded bg-zinc-900/10">
          No contained animations yet.
        </p>
      )}

      <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
        <Head>Clips ({clips.length})</Head>
      </div>
      <Button
        className="w-full"
        variant="primary"
        onClick={() => api.addClip({
          timelineId: timeline.id, name: `clip_${clips.length + 1}`,
          start: frame, end: Math.min(timeline.frameCount - 1, frame + 9), loop: true, tags: [],
          frames: buildFramesForContainer(timeline, frame, Math.min(timeline.frameCount - 1, frame + 9)),
        })}
      >＋ new clip at playhead</Button>

      {clips.map((c) => (
        <div
          key={c.id}
          className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 cursor-pointer hover:bg-zinc-900"
          onClick={() => {
            onOpenTimeline(c.timelineId);
            setFrame(c.start);
            setLoopRange([c.start, c.end]);
          }}
        >
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              className={cn(inputCls, 'flex-1')}
              value={c.name}
              onChange={(e) => api.updateClip(c.id, { name: e.target.value })}
            />
            <Button variant="danger" onClick={() => api.removeClip(c.id)}>×</Button>
          </div>
          <div className="flex items-center gap-1">
            <NumBox label="from" value={c.start + 1} onChange={(v) => api.updateClip(c.id, { start: Math.max(0, v - 1) })} />
            <NumBox label="to" value={c.end + 1} onChange={(v) => api.updateClip(c.id, { end: Math.max(0, v - 1) })} />
            <label className="flex items-center gap-1 text-[10px] text-zinc-400">
              <input type="checkbox" checked={c.loop} onChange={(e) => api.updateClip(c.id, { loop: e.target.checked })} /> loop
            </label>
            <span className="ml-auto text-[10px] text-zinc-600">{c.end - c.start + 1}f</span>
          </div>
          {showAll && <div className="text-[10px] text-zinc-600">{c.timelineId}</div>}
          <TagInput tags={c.tags} suggestions={api.allTags} onChange={(t) => api.updateClip(c.id, { tags: t })} />
        </div>
      ))}

      <Head>Markers ({markers.length})</Head>
      <div className="space-y-1 border-t border-zinc-900 pt-2">
        {markers.sort((a, b) => a.frame - b.frame).map((m) => (
          <div key={m.id} className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1">
            <span className="w-10 shrink-0 text-[10px] text-zinc-500">f{m.frame + 1}</span>
            <span className="w-12 shrink-0 text-[10px] uppercase text-violet-300">{m.type}</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-zinc-200 outline-none"
              value={m.name}
              onChange={(e) => api.updateMarker(m.id, { name: e.target.value })}
            />
            <button className="text-zinc-600 hover:text-rose-400" onClick={() => api.removeMarker(m.id)}>×</button>
          </div>
        ))}
        {!markers.length && <p className="text-zinc-600">No markers yet — add them from the strip below the stage.</p>}
      </div>
    </div>
  );
}

function NumBox({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-zinc-500">
      {label}
      <input
        type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-100"
      />
    </label>
  );
}
