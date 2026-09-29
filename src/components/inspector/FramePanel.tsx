// Inspector "Frame" tab: display list and events of the current frame.
// Extracted verbatim from Inspector.tsx (DECOMPOSITION_SPEC phases 3–10).

import { useMemo } from 'react';
import { Empty, fmt, Head } from './shared';
import type { ProjectApi } from '../../lib/project';
import { flatten } from '../../lib/render';
import { type SwfDocument, type Timeline } from '../../types';
import { TWIPS } from '../../types';
import { cn } from '../../utils/cn';
import { charName } from '../Sidebar';
import { Button, Chip, EVENT_COLOR } from '../ui';

// ---------------------------------------------------------------- frame ----

export function FramePanel({ doc, timeline, frame, api, onSelect, selectedPath, onPickPath }: {
  doc: SwfDocument; timeline: Timeline; frame: number; api: ProjectApi;
  onSelect: (id: number) => void; selectedPath?: string; onPickPath: (p: string | undefined) => void;
}) {
  const f = timeline.frames[frame];
  const flat = useMemo(() => flatten(doc, timeline, frame), [doc, timeline, frame]);
  if (!f) return <Empty>Empty timeline.</Empty>;
  const notable = f.events.filter((e) => e.kind !== 'place' && e.kind !== 'remove');

  return (
    <div className="space-y-4 p-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-medium text-zinc-200">{timeline.name} · frame {frame + 1}</div>
        {f.special
          ? <Chip className="border-rose-500/40 bg-rose-500/10 text-rose-300">non‑placement content</Chip>
          : <Chip className="border-zinc-700 text-zinc-500">placement only</Chip>}
      </div>
      {f.label && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-200">
          frame label: <b>{f.label}</b>
        </div>
      )}

      <div>
        <Head>Tags on this frame</Head>
        {notable.length === 0 && <p className="text-zinc-600">Only PlaceObject2 / RemoveObject2 — safe to convert mechanically.</p>}
        <div className="space-y-1">
          {notable.map((e, i) => (
            <div key={i} className={cn('flex items-start gap-2 rounded border px-2 py-1',
              e.kind === 'action' ? 'border-rose-500/30 bg-rose-500/5'
                : e.kind === 'sound' ? 'border-cyan-500/30 bg-cyan-500/5'
                : e.kind === 'label' ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-violet-500/30 bg-violet-500/5')}>
              <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-sm', EVENT_COLOR[e.kind].dot)} />
              <div className="min-w-0">
                <div className={cn('font-medium', EVENT_COLOR[e.kind].text)}>{e.tagType}</div>
                <div className="break-words text-zinc-400">{e.detail}</div>
                {e.characterId != null && (
                  <button className="text-violet-400 hover:underline" onClick={() => onSelect(e.characterId!)}>
                    → character #{e.characterId}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {notable.length > 0 && (
          <Button
            className="mt-2 w-full"
            onClick={() => {
              for (const e of notable) {
                api.addMarker({
                  timelineId: timeline.id, frame,
                  type: e.kind === 'action' ? 'action' : e.kind === 'sound' ? 'sound' : 'marker',
                  name: e.kind === 'label' ? e.detail : `${e.tagType}`,
                  payload: e.detail, tags: [e.kind],
                });
              }
            }}
          >＋ turn these into markers</Button>
        )}
      </div>

      <div>
        <Head>Keyframe ops ({f.ops.length})</Head>
        <div className="space-y-0.5">
          {f.ops.map((o, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-zinc-900/70 px-2 py-1">
              <span className={cn('w-12 shrink-0 text-[10px] uppercase',
                o.op === 'place' ? 'text-emerald-400' : o.op === 'remove' ? 'text-zinc-500' : 'text-sky-400')}>{o.op}</span>
              <span className="w-10 shrink-0 text-zinc-600">d{o.depth}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-300">
                {o.characterId != null ? `#${o.characterId}` : '—'} {o.name ? `“${o.name}”` : ''}
                {o.matrix ? ` · ${fmt(o.matrix.tx / TWIPS)},${fmt(o.matrix.ty / TWIPS)}px` : ''}
                {o.clipDepth ? ` · mask→${o.clipDepth}` : ''}
                {o.blendMode && o.blendMode !== 'Normal' ? ` · ${o.blendMode}` : ''}
                {o.hasFilters ? ' · filters' : ''}
              </span>
              {o.tagType !== 'PlaceObject2Tag' && o.tagType !== 'RemoveObject2Tag' && (
                <Chip className="border-violet-500/40 text-violet-300">{o.tagType.replace('Tag', '')}</Chip>
              )}
            </div>
          ))}
          {!f.ops.length && <p className="text-zinc-600">No placement changes on this frame.</p>}
        </div>
      </div>

      <div>
        <Head>Display list ({flat.filter((x) => x.level === 0).length} top‑level / {flat.length} total)</Head>
        <div className="space-y-0.5">
          {flat.map((x) => {
            const ch = doc.characters.get(x.item.characterId);
            return (
              <div
                key={x.path}
                onClick={() => { onPickPath(x.path); if (ch) onSelect(ch.id); }}
                className={cn('flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-800',
                  selectedPath === x.path && 'bg-violet-600/25')}
                style={{ paddingLeft: 4 + x.level * 10 }}
              >
                <span className="w-8 shrink-0 text-[10px] text-zinc-600">d{x.item.depth}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-300">
                  {ch ? charName(ch, api.project) : `#${x.item.characterId} missing`}
                  {x.item.name && <span className="text-zinc-500"> “{x.item.name}”</span>}
                </span>
                <span className="shrink-0 text-[10px] text-zinc-600">
                  {fmt(x.world.tx / TWIPS)},{fmt(x.world.ty / TWIPS)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
