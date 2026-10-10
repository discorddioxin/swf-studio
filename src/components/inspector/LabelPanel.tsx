// Inspector "Label" tab: character details, uses / used-by.
// Extracted verbatim from Inspector.tsx (DECOMPOSITION_SPEC phases 3–10).

import { useMemo } from 'react';
import { Empty, fmt } from './shared';
import type { AssetCache } from '../../lib/assets';
import { triggerDownload } from '../../lib/exporter';
import type { ProjectApi } from '../../lib/project';
import { type FlattenedSprite, type Project, type SwfDocument } from '../../types';
import { TWIPS } from '../../types';
import { cn } from '../../utils/cn';
import { charName } from '../Sidebar';
import { Button, Chip, Field, KIND_COLOR, TagInput, inputCls } from '../ui';

// ---------------------------------------------------------------- label ----

export function LabelPanel({ doc, cache, api, selectedId, onSelect, onOpenTimeline, flattenedSprites, flatteningId, onFlattenSprite }: {
  doc: SwfDocument; cache: AssetCache; api: ProjectApi; selectedId: number | null;
  onSelect: (id: number) => void; onOpenTimeline: (id: string) => void;
  flattenedSprites: FlattenedSprite[]; flatteningId: number | null; onFlattenSprite: (characterId: number) => void;
}) {
  if (selectedId == null) return <Empty>Select a character in the library or click something on stage.</Empty>;
  const ch = doc.characters.get(selectedId);
  if (!ch) return <Empty>Character #{selectedId} is referenced but never defined in this XML.</Empty>;
  const lbl = api.project.characters[ch.id] ?? { tags: [] };
  const prev = cache.preview(ch.id, ch.kind);
  const asset = cache.get(ch.id, ch.kind, ch.bounds);
  const usedBy = useMemo(() => [...doc.characters.values()].filter((c) => c.uses.includes(ch.id)), [doc, ch.id]);
  const flattened = flattenedSprites.find((sprite) => sprite.characterId === ch.id);

  return (
    <div className="space-y-4 p-3">
      <div className="flex gap-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-zinc-800 bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)] bg-[length:12px_12px]">
          {prev && /svg|png|jpg|jpeg|gif/.test(prev.ext)
            ? <img src={prev.url} alt="" className="max-h-24 max-w-24 object-contain" />
            : <span className="text-[10px] text-zinc-600">{ch.kind}</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <Chip className={KIND_COLOR[ch.kind]}>{ch.kind}</Chip>
            <Chip>#{ch.id}</Chip>
            {!!ch.frameCount && <Chip>{ch.frameCount} frames</Chip>}
            {!!(ch.specialFrames ?? 0) && <Chip className="border-rose-500/40 bg-rose-500/10 text-rose-300">{ch.specialFrames}★ special</Chip>}
          </div>
          <div className="truncate text-zinc-500" title={ch.tagType}>{ch.tagType}</div>
          {ch.className && <div className="truncate text-emerald-400">class: {ch.className}</div>}
          {ch.exportName && <div className="truncate text-emerald-400">export: {ch.exportName}</div>}
          <div className="text-zinc-600">
            {ch.bounds
              ? `bounds ${fmt(ch.bounds.xMin / TWIPS)}, ${fmt(ch.bounds.yMin / TWIPS)} → ${fmt((ch.bounds.xMax - ch.bounds.xMin) / TWIPS)}×${fmt((ch.bounds.yMax - ch.bounds.yMin) / TWIPS)} px`
              : 'no bounds in XML'}
          </div>
          <div className={cn('truncate', prev ? 'text-zinc-500' : 'text-rose-400')} title={prev?.path}>
            {prev ? prev.path : 'no matching asset file'}
          </div>
        </div>
      </div>

      {ch.timelineId && (
        <Button variant="primary" className="w-full" onClick={() => onOpenTimeline(ch.timelineId!)}>
          ▶ Open timeline on stage
        </Button>
      )}

      {ch.kind === 'sprite' && ch.timelineId && (
        <div className="space-y-2 rounded-lg border border-fuchsia-900/40 bg-fuchsia-950/10 p-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-300">Flattened PNG frames</div>
              <div className="text-[10px] text-zinc-500">Merges nested shapes/images by SWF depth order.</div>
            </div>
            <Button
              variant="primary"
              disabled={flatteningId === ch.id}
              onClick={() => onFlattenSprite(ch.id)}
            >{flatteningId === ch.id ? 'rendering…' : flattened ? 'rebuild' : 'flatten sprite'}</Button>
          </div>
          {flattened && (
            <>
              <div className="text-[10px] text-zinc-500">{flattened.frames.length} transparent PNGs · {flattened.frames[0]?.width}×{flattened.frames[0]?.height}px first frame</div>
              <div className="grid max-h-48 grid-cols-4 gap-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/70 p-1">
                {flattened.frames.map((asset) => (
                  <button
                    key={asset.id}
                    className="group relative aspect-square overflow-hidden rounded border border-zinc-800 bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)] bg-[length:8px_8px] hover:border-fuchsia-500"
                    title={`Frame ${asset.frame + 1} · ${asset.width}×${asset.height}px`}
                    onClick={() => triggerDownload(asset.blob, asset.path.split('/').pop() ?? `frame_${asset.frame + 1}.png`)}
                  >
                    <img src={asset.url} alt={`Flattened frame ${asset.frame + 1}`} className="h-full w-full object-contain" />
                    <span className="absolute inset-x-0 bottom-0 bg-zinc-950/80 text-[9px] text-zinc-300">f{asset.frame + 1}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {ch.kind === 'sound' && prev && <audio controls src={prev.url} className="w-full" />}
      {(ch.kind === 'text' || ch.kind === 'edittext') && asset.text && (
        <pre className="max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-900 p-2 text-[11px] text-zinc-300">{asset.text}</pre>
      )}

      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <Field label="Export name" hint="becomes the key in characters.json">
          <input
            className={inputCls}
            value={lbl.name ?? ''}
            placeholder={ch.className || ch.exportName || `${ch.kind}_${ch.id}`}
            onChange={(e) => api.setLabel(ch.id, { name: e.target.value })}
          />
        </Field>
        <Field label="Category">
          <input
            className={inputCls}
            list="category-suggestions"
            value={lbl.category ?? ''}
            placeholder="character / prop / ui / fx / background…"
            onChange={(e) => api.setLabel(ch.id, { category: e.target.value })}
          />
          <datalist id="category-suggestions">
            {api.categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label="Tags">
          <TagInput tags={lbl.tags ?? []} suggestions={api.allTags} onChange={(t) => api.setLabel(ch.id, { tags: t })} />
        </Field>
        <Field label="Notes">
          <textarea
            className={cn(inputCls, 'h-16 resize-none')}
            value={lbl.notes ?? ''}
            onChange={(e) => api.setLabel(ch.id, { notes: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={!!lbl.ignore} onChange={(e) => api.setLabel(ch.id, { ignore: e.target.checked })} />
          exclude from export (dead / editor-only asset)
        </label>
      </div>

      {!!ch.uses.length && (
        <Related title={`Uses ${ch.uses.length}`} ids={ch.uses} doc={doc} project={api.project} onSelect={onSelect} />
      )}
      {!!usedBy.length && (
        <Related title={`Used by ${usedBy.length}`} ids={usedBy.map((c) => c.id)} doc={doc} project={api.project} onSelect={onSelect} />
      )}
    </div>
  );
}

function Related({ title, ids, doc, project, onSelect }: {
  title: string; ids: number[]; doc: SwfDocument; project: Project; onSelect: (id: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</div>
      <div className="flex flex-wrap gap-1">
        {ids.slice(0, 60).map((id) => {
          const c = doc.characters.get(id);
          return (
            <Chip key={id} onClick={() => onSelect(id)} className={c ? KIND_COLOR[c.kind] : 'border-rose-500/40 text-rose-300'}>
              {c ? charName(c, project) : `#${id} missing`}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
