import { useMemo, useState } from 'react';
import type { AssetCache } from '../lib/assets';
import type { Actor, CharacterKind, Project, SwfCharacter, SwfDocument } from '../types';
import { cn } from '../utils/cn';
import { KIND_COLOR, inputCls } from './ui';

const KINDS: CharacterKind[] = ['sprite', 'shape', 'morphshape', 'button', 'bitmap', 'text', 'edittext', 'sound', 'font', 'video', 'binary'];

export interface Filters {
  q: string;
  kinds: Set<CharacterKind>;
  onlySpecial: boolean;
  onlyUnlabeled: boolean;
  onlyMissing: boolean;
  tag: string;
}

export const defaultFilters = (): Filters => ({
  q: '', kinds: new Set(), onlySpecial: false, onlyUnlabeled: false, onlyMissing: false, tag: '',
});

export function charName(ch: SwfCharacter, project: Project) {
  return project.characters[ch.id]?.name || ch.className || ch.exportName || `${ch.kind} ${ch.id}`;
}

export function InlineRename({ id, initialName, onRename }: { id: number; initialName: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initialName);

  if (editing) {
    return (
      <input
        className="w-full rounded border border-violet-500 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-100 outline-none"
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setEditing(false); onRename(val); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { setEditing(false); onRename(val); }
          if (e.key === 'Escape') { setEditing(false); setVal(initialName); }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div className="group/rename flex items-center gap-1.5 min-w-0 flex-1" data-id={id}>
      <span className="truncate font-medium text-zinc-200">{initialName}</span>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="opacity-0 group-hover/rename:opacity-100 text-[10px] text-zinc-500 hover:text-violet-400 p-0.5 transition-all"
        title="Rename asset"
      >
        ✏️
      </button>
    </div>
  );
}

export function Sidebar({
  doc, project, cache, filters, setFilters, selectedId, onSelect, onOpenTimeline, activeTimeline, allTags, onRenameLabel,
  actors, selectedActorId, onSelectActor, onCreateActor, loadedSwfs, activeSwfIndex, onSelectSwf,
}: {
  doc: SwfDocument;
  project: Project;
  cache: AssetCache | null;
  filters: Filters;
  setFilters: (f: Filters) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onOpenTimeline: (id: string) => void;
  activeTimeline: string;
  allTags: string[];
  onRenameLabel: (id: number, name: string) => void;
  actors: Actor[];
  selectedActorId: string | null;
  onSelectActor: (id: string) => void;
  onCreateActor: () => void;
  loadedSwfs: { name: string; index: number }[];
  activeSwfIndex: number;
  onSelectSwf: (index: number) => void;
}) {
  const [limit, setLimit] = useState(300);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actorsOpen, setActorsOpen] = useState(true);

  const list = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const out: SwfCharacter[] = [];
    for (const ch of doc.characters.values()) {
      if (filters.kinds.size && !filters.kinds.has(ch.kind)) continue;
      const lbl = project.characters[ch.id];
      if (filters.onlySpecial && !(ch.specialFrames ?? 0)) continue;
      if (filters.onlyUnlabeled && (lbl?.name || lbl?.tags?.length)) continue;
      if (filters.onlyMissing && cache && cache.preview(ch.id, ch.kind)) continue;
      if (filters.tag && !(lbl?.tags ?? []).includes(filters.tag)) continue;
      if (q) {
        const hay = `${ch.id} ${ch.kind} ${ch.tagType} ${ch.className ?? ''} ${ch.exportName ?? ''} ${lbl?.name ?? ''} ${(lbl?.tags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(ch);
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  }, [doc, project, filters, cache]);

  const counts = useMemo(() => {
    const m = new Map<CharacterKind, number>();
    for (const c of doc.characters.values()) m.set(c.kind, (m.get(c.kind) ?? 0) + 1);
    return m;
  }, [doc]);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800">
        <button
          onClick={() => setFiltersOpen((value) => !value)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-zinc-900/70"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Library</span>
          <span className="text-[10px] text-zinc-600">{filters.q || filters.tag || filters.kinds.size || filters.onlySpecial || filters.onlyUnlabeled || filters.onlyMissing ? 'filtered' : 'filters'} {filtersOpen ? '−' : '+'}</span>
        </button>
        {filtersOpen && <div className="space-y-2 border-t border-zinc-800 p-3">
        <input
          className={inputCls}
          placeholder="Search id, name, class, tag…"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <div className="space-y-1">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Filter by Character Type</span>
            <select
              className={cn(inputCls, "mt-0.5")}
              value={filters.kinds.size === 1 ? Array.from(filters.kinds)[0] : ""}
              onChange={(e) => {
                const val = e.target.value as CharacterKind;
                setFilters({ ...filters, kinds: val ? new Set([val]) : new Set() });
              }}
            >
              <option value="">All types</option>
              {KINDS.filter((k) => counts.get(k)).map((k) => (
                <option key={k} value={k}>
                  {k} ({counts.get(k)})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Filter by Status</span>
            <select
              className={cn(inputCls, "mt-0.5")}
              value={
                filters.onlySpecial ? "special"
                : filters.onlyUnlabeled ? "unlabeled"
                : filters.onlyMissing ? "missing"
                : "all"
              }
              onChange={(e) => {
                const val = e.target.value;
                setFilters({
                  ...filters,
                  onlySpecial: val === "special",
                  onlyUnlabeled: val === "unlabeled",
                  onlyMissing: val === "missing",
                });
              }}
            >
              <option value="all">All status presets</option>
              <option value="special">Has code/sound frames</option>
              <option value="unlabeled">Unlabeled only</option>
              <option value="missing">No matching asset file</option>
            </select>
          </label>
        </div>
        {allTags.length > 0 && (
          <select
            className={inputCls}
            value={filters.tag}
            onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
          >
            <option value="">— any tag —</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        </div>}
      </div>

      <div className="border-b border-zinc-800 p-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Main SWF · plays the game</span>
          <select
            className={cn(inputCls, 'py-1.5 text-xs')}
            value={activeSwfIndex}
            onChange={(event) => onSelectSwf(Number(event.target.value))}
            title="The SWF the Execute workspace plays; every other loaded SWF is handed to it as a dependency"
          >
            {loadedSwfs.map((swf) => (
              <option key={swf.index} value={swf.index}>
                {swf.name}{swf.index === activeSwfIndex ? '' : ' · dependency'}
              </option>
            ))}
          </select>
          {loadedSwfs.length > 1 && (
            <span className="mt-1 block text-[10px] text-zinc-600">{loadedSwfs.length - 1} other SWF{loadedSwfs.length === 2 ? '' : 's'} available as dependencies.</span>
          )}
        </label>
        <button
          onClick={() => onOpenTimeline('root')}
          className={cn('mt-1.5 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs', activeTimeline === 'root' ? 'bg-violet-600/20 text-violet-200' : 'text-zinc-500 hover:bg-zinc-900')}
        >
          <span className="font-medium">Open main timeline</span>
          <span className="text-zinc-600">{doc.root.frameCount}f</span>
        </button>
      </div>

      <div className="border-b border-zinc-800">
        <div className="flex items-center justify-between px-3 py-2">
          <button onClick={() => setActorsOpen((value) => !value)} className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">Actors <span className="text-zinc-700">{actorsOpen ? '−' : '+'}</span></button>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-600">{actors.length}</span>
            <button
              onClick={onCreateActor}
              className="rounded px-1.5 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/15"
              title="Create actor"
            >＋ new</button>
          </div>
        </div>
        {actorsOpen && <div className="max-h-32 overflow-y-auto pb-1">
          {actors.map((actor) => (
            <button
              key={actor.id}
              onClick={() => onSelectActor(actor.id)}
              className={cn(
                'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-zinc-900',
                selectedActorId === actor.id && 'bg-violet-600/20 text-violet-200',
              )}
            >
              <span className="truncate">♙ {actor.name}</span>
              <span className="text-[10px] text-zinc-600">{actor.clipIds.length} clips</span>
            </button>
          ))}
          {!actors.length && <div className="px-3 pb-2 text-[10px] text-zinc-600">Create an actor to assign clips.</div>}
        </div>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.slice(0, limit).map((ch) => {
          const lbl = project.characters[ch.id];
          const prev = cache?.preview(ch.id, ch.kind);
          const isOpen = activeTimeline === ch.timelineId || activeTimeline === `virtual:${ch.id}`;
          return (
            <div
              key={ch.id}
              onClick={() => {
                onSelect(ch.id);
                // Automatically display this asset on the stage
                if (ch.timelineId) {
                  onOpenTimeline(ch.timelineId);
                } else {
                  onOpenTimeline(`virtual:${ch.id}`);
                }
              }}
              onDoubleClick={() => ch.timelineId && onOpenTimeline(ch.timelineId)}
              className={cn(
                'flex cursor-pointer items-center gap-2 border-b border-zinc-900 px-2 py-1.5 text-xs',
                selectedId === ch.id ? 'bg-zinc-800' : 'hover:bg-zinc-900',
                isOpen && 'border-l-2 border-l-violet-500',
                lbl?.ignore && 'opacity-40',
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-zinc-800 bg-zinc-900">
                {prev && /svg|png|jpg|jpeg|gif/.test(prev.ext)
                  ? <img src={prev.url} alt="" className="max-h-8 max-w-8 object-contain" />
                  : <span className="text-[9px] text-zinc-600">{ch.kind.slice(0, 3)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <InlineRename id={ch.id} initialName={charName(ch, project)} onRename={(n) => onRenameLabel(ch.id, n)} />
                  {!!(ch.specialFrames ?? 0) && (
                    <span className="rounded bg-rose-500/20 px-1 text-[9px] font-semibold text-rose-300" title={`${ch.specialFrames} frames with code/sound/labels`}>
                      {ch.specialFrames}★
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <span className={cn('rounded border px-1', KIND_COLOR[ch.kind])}>{ch.kind}</span>
                  <span>#{ch.id}</span>
                  {ch.frameCount ? <span>· {ch.frameCount}f</span> : null}
                  {lbl?.tags?.length ? <span className="truncate text-violet-400">· {lbl.tags.join(' ')}</span> : null}
                </div>
              </div>
              {ch.timelineId && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenTimeline(ch.timelineId!); }}
                  className="rounded px-1 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
                  title="Open this timeline on stage"
                >▶</button>
              )}
            </div>
          );
        })}
        {list.length > limit && (
          <button className="w-full py-2 text-xs text-violet-400 hover:bg-zinc-900" onClick={() => setLimit(limit + 500)}>
            show more ({list.length - limit} hidden)
          </button>
        )}
        {!list.length && <p className="p-4 text-center text-xs text-zinc-600">Nothing matches those filters.</p>}
      </div>

      <div className="border-t border-zinc-800 px-3 py-2 text-[10px] text-zinc-600">
        {list.length} / {doc.characters.size} characters
      </div>
    </div>
  );
}


