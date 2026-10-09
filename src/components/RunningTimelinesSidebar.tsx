import { useMemo, useState } from 'react';
import type { Project, SwfCharacter, SwfDocument, Timeline } from '../types';
import type { TimelineNameIndex, TimelineNameMetadata } from '../../transpiler/as2/project';
import type { ActiveDisplaySnapshot, RunningTimelineSnapshot } from '../engine/as2/player';
import { cn } from '../utils/cn';
import { KIND_COLOR } from './ui';

const MAX_FRAME_CELLS = 36;

type FrameTone = 'action' | 'sound' | 'label' | 'other' | 'plain';

const FRAME_TONE_CLASS: Record<FrameTone, string> = {
  action: 'bg-rose-500/65',
  sound: 'bg-cyan-500/65',
  label: 'bg-amber-500/65',
  other: 'bg-violet-500/55',
  plain: 'bg-zinc-700/70',
};

type SidebarTab = 'timelines' | 'assets' | 'actors';

export function RunningTimelinesSidebar({
  doc,
  timelines,
  timelineNames,
  playing,
  project,
  displayTree,
}: {
  doc: SwfDocument;
  timelines: readonly RunningTimelineSnapshot[];
  timelineNames: TimelineNameIndex;
  playing: boolean;
  project?: Project | null;
  displayTree?: ActiveDisplaySnapshot | null;
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('timelines');

  // Active assets: prefer live display tree (includes static UI) else fallback to running timelines
  const activeAssets = useMemo(() => {
    if (displayTree) return flattenDisplayTree(displayTree, doc, project);
    return computeActiveAssets(doc, timelines, project);
  }, [doc, timelines, project, displayTree]);

  const activeCharacterIds = useMemo(() => {
    if (displayTree) {
      const ids = new Set<number>();
      const visit = (n: ActiveDisplaySnapshot) => {
        ids.add(n.characterId);
        for (const c of n.children) visit(c);
      };
      visit(displayTree);
      return ids;
    }
    return new Set(timelines.map((t) => t.characterId));
  }, [displayTree, timelines]);

  const actorStates = useMemo(() => computeActorStates(project ?? null, timelines, doc, activeCharacterIds, displayTree), [project, timelines, doc, activeCharacterIds, displayTree]);

  // For header count: assets = total visible nodes (excluding root), timelines = running count, actors = active
  const assetsCount = displayTree ? countDisplayNodes(displayTree) - 1 : activeAssets.length;
  const tabCountLabel = activeTab === 'timelines' ? timelines.length : activeTab === 'assets' ? assetsCount : actorStates.filter(a => a.active).length;

  return (
    <aside
      aria-label="Running timelines"
      data-running-timelines-sidebar="true"
      className="flex w-[min(18rem,32vw)] min-w-[220px] max-w-72 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950"
    >
      <header className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-3">
        <div className="min-w-0">
          <h2 className="truncate text-[10px] font-semibold uppercase tracking-wider text-zinc-300">Execute</h2>
          <div className="text-[9px] text-zinc-600">Timelines · Assets · Actors</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-300" aria-label={`${timelines.length} running timelines`}>
            {tabCountLabel}
          </span>
          <span className={playing ? 'text-[8px] font-bold tracking-wider text-emerald-400' : 'text-[8px] font-bold tracking-wider text-amber-400'}>
            {playing ? 'LIVE' : 'PAUSED'}
          </span>
        </div>
      </header>

      <div role="tablist" aria-label="Execute sidebar tabs" className="flex shrink-0 items-stretch border-b border-zinc-800 bg-zinc-900/40">
        <button
          role="tab"
          aria-selected={activeTab === 'timelines'}
          onClick={() => setActiveTab('timelines')}
          className={cn(
            'flex-1 border-b-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
            activeTab === 'timelines' ? 'border-violet-500 bg-zinc-800 text-violet-200' : 'border-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300',
          )}
          title="Running MovieClip playheads (multi-frame, playing)"
        >
          Timelines{timelines.length ? ` · ${timelines.length}` : ''}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'assets'}
          onClick={() => setActiveTab('assets')}
          className={cn(
            'flex-1 border-b-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
            activeTab === 'assets' ? 'border-violet-500 bg-zinc-800 text-violet-200' : 'border-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300',
          )}
          title="Assets currently on stage (including static UI)"
        >
          Assets{assetsCount ? ` · ${assetsCount}` : ''}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'actors'}
          onClick={() => setActiveTab('actors')}
          className={cn(
            'flex-1 border-b-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
            activeTab === 'actors' ? 'border-violet-500 bg-zinc-800 text-violet-200' : 'border-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300',
          )}
          title="Actors in use"
        >
          Actors{actorStates.length ? ` · ${actorStates.filter(a => a.active).length}/${actorStates.length}` : ''}
        </button>
      </div>

      {activeTab === 'timelines' && (
        <div role="list" aria-label="Active MovieClip timelines" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
          {timelines.map((timeline) => (
            <RunningTimelineRow
              key={timeline.id}
              doc={doc}
              timeline={timeline}
              title={timelineTitle(timeline, timelineNames)}
            />
          ))}
          {timelines.length === 0 && (
            <div className="flex h-full min-h-32 flex-col items-center justify-center px-4 text-center">
              <span aria-hidden="true" className="mb-2 text-xl text-zinc-700">▤</span>
              <p className="text-[11px] font-medium text-zinc-400">No running timelines</p>
              <p className="mt-1 max-w-56 text-[10px] leading-relaxed text-zinc-600">
                Playing multi-frame MovieClips will appear here. Static UI (buttons, single-frame sprites) lives in the <span className="font-medium text-zinc-500">Assets</span> tab.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'assets' && (
        displayTree ? (
          <DisplayTreePanel doc={doc} project={project ?? null} displayTree={displayTree} />
        ) : (
          <ActiveAssetsPanel timelines={timelines} activeAssets={activeAssets} />
        )
      )}

      {activeTab === 'actors' && (
        <ActorsPanel project={project ?? null} actorStates={actorStates} />
      )}
    </aside>
  );
}

function countDisplayNodes(root: ActiveDisplaySnapshot): number {
  let n = 1;
  for (const c of root.children) n += countDisplayNodes(c);
  return n;
}

function flattenDisplayTree(root: ActiveDisplaySnapshot, doc: SwfDocument, project: Project | null | undefined): ActiveAssetEntry[] {
  const entries: ActiveAssetEntry[] = [];
  const visit = (node: ActiveDisplaySnapshot, parent: ActiveDisplaySnapshot | null) => {
    if (node !== root) {
      // For backward compat, create an entry that looks like it belongs to its parent timeline
      // Use parent's id as ownerId where possible, else root id
      const ownerId = parent?.id ?? root.id;
      const ch: SwfCharacter | undefined = doc.characters.get(node.characterId);
      const label = project?.characters[node.characterId]?.name;
      const baseName = label || ch?.exportName || ch?.className || (ch ? `${ch.kind} ${ch.id}` : `character ${node.characterId}`);
      // Find a snapshot-like owner for grouping – we synthesize one from parent if needed
      const snapshot = {
        id: ownerId,
        characterId: parent?.characterId ?? root.characterId,
        name: parent?.name ?? root.name,
        path: parent?.path ?? root.path,
        frame: parent?.frame ?? root.frame,
        totalFrames: parent?.totalFrames ?? root.totalFrames,
      } as RunningTimelineSnapshot;
      entries.push({
        ownerId,
        snapshot,
        characterId: node.characterId,
        depth: node.depth,
        kind: node.kind,
        name: node.name !== baseName ? `${baseName} · ${node.name}` : baseName,
        path: node.path,
        visible: node.visible,
      });
    }
    for (const c of node.children) visit(c, node);
  };
  for (const c of root.children) visit(c, root);
  return entries;
}

function DisplayTreePanel({
  doc,
  project,
  displayTree,
}: {
  doc: SwfDocument;
  project: Project | null;
  displayTree: ActiveDisplaySnapshot;
}) {
  const total = countDisplayNodes(displayTree) - 1;
  if (total === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
        <span aria-hidden="true" className="mb-2 text-xl text-zinc-700">◇</span>
        <p className="text-[11px] font-medium text-zinc-400">No active assets</p>
        <p className="mt-1 max-w-56 text-[10px] leading-relaxed text-zinc-600">Assets appear here when instantiated on stage — including static UI.</p>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="mb-2 rounded bg-zinc-900/60 px-2 py-1.5 text-[10px] leading-relaxed text-zinc-500">
        <span className="font-medium text-zinc-400">{total}</span> asset{total === 1 ? '' : 's'} currently instantiated
        {displayTree.children.length ? ` · ${displayTree.children.length} top-level` : ''}.
      </div>
      <div className="rounded-md border border-zinc-800 bg-zinc-900/40">
        <DisplayTreeNode node={displayTree} doc={doc} project={project} depth={0} isRoot />
      </div>
      <div className="mt-2 px-1 text-[10px] leading-relaxed text-zinc-600">
        Includes <span className="text-zinc-400">buttons, single-frame sprites, shapes, text</span> — not just playing timelines. Hidden instances are dimmed.
      </div>
    </div>
  );
}

function DisplayTreeNode({ node, doc, project, depth, isRoot }: { node: ActiveDisplaySnapshot; doc: SwfDocument; project: Project | null; depth: number; isRoot?: boolean }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const label = project?.characters[node.characterId]?.name;
  const kind: string = node.kind;
  const hasChildren = node.children.length > 0;
  const isHidden = !node.visible;

  if (isRoot) {
    return (
      <div className="divide-y divide-zinc-800/60">
        <div className="flex items-center gap-2 bg-zinc-900 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <span className="truncate">{node.name} — Stage</span>
          <span className="ml-auto font-mono text-zinc-600">{node.frame}/{node.totalFrames}</span>
        </div>
        <div>
          {node.children.map((child) => (
            <DisplayTreeNode key={child.id} node={child} doc={doc} project={project} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('border-l border-transparent', depth > 1 && 'ml-2 border-zinc-800/50')}>
      <div className={cn('flex items-center gap-1.5 px-2 py-1', isHidden && 'opacity-50', hasChildren && 'cursor-pointer hover:bg-zinc-800/50')} onClick={() => hasChildren && setExpanded((v) => !v)}>
        {hasChildren ? (
          <span className="shrink-0 text-[10px] text-zinc-500">{expanded ? '▾' : '▸'}</span>
        ) : (
          <span className="shrink-0 w-3" />
        )}
        <span className={cn('shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider', (KIND_COLOR as Record<string, string>)[kind] ?? 'border-zinc-700 bg-zinc-800 text-zinc-400')}>
          {kind}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300" title={`${node.path} · #${node.characterId} · d${node.depth}`}>
          {label && label !== node.name ? `${label} · ${node.name}` : node.name}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-zinc-600">#{node.characterId}</span>
        <span className="shrink-0 font-mono text-[9px] text-zinc-600">d{node.depth}</span>
        {node.kind === 'clip' && node.totalFrames > 1 && (
          <span className={cn('shrink-0 rounded px-1 py-0.5 text-[9px] font-mono', node.playing ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300')}>
            {node.frame}/{node.totalFrames}{node.playing ? ' ▶' : ''}
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="divide-y divide-zinc-800/30">
          {node.children.map((child) => (
            <DisplayTreeNode key={child.id} node={child} doc={doc} project={project} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActiveAssetsPanel({
  timelines,
  activeAssets,
}: {
  timelines: readonly RunningTimelineSnapshot[];
  activeAssets: ActiveAssetEntry[];
}) {
  const grouped = useMemo(() => {
    const byTimeline = new Map<number, { snapshot: RunningTimelineSnapshot; items: typeof activeAssets }>();
    for (const entry of activeAssets) {
      const list = byTimeline.get(entry.ownerId) ?? { snapshot: entry.snapshot, items: [] as typeof activeAssets };
      list.items.push(entry);
      byTimeline.set(entry.ownerId, list);
    }
    for (const t of timelines) if (!byTimeline.has(t.id)) byTimeline.set(t.id, { snapshot: t, items: [] });
    return Array.from(byTimeline.values());
  }, [activeAssets, timelines]);

  if (timelines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
        <span aria-hidden="true" className="mb-2 text-xl text-zinc-700">◇</span>
        <p className="text-[11px] font-medium text-zinc-400">No active assets</p>
        <p className="mt-1 max-w-56 text-[10px] leading-relaxed text-zinc-600">Assets appear here when a playing timeline displays them on stage.</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="mb-2 rounded bg-zinc-900/60 px-2 py-1.5 text-[10px] leading-relaxed text-zinc-500">
        <span className="font-medium text-zinc-400">{activeAssets.length}</span> asset{activeAssets.length === 1 ? '' : 's'} currently on display across <span className="font-medium text-zinc-400">{timelines.length}</span> timeline{timelines.length === 1 ? '' : 's'}.
      </div>
      <div className="space-y-2">
        {grouped.map((group) => (
          <div key={group.snapshot.id} className="rounded-md border border-zinc-800 bg-zinc-900/60">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900 px-2 py-1.5">
              <span className="truncate text-[11px] font-medium text-zinc-200" title={group.snapshot.path}>{group.snapshot.name}</span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">{group.snapshot.frame}/{group.snapshot.totalFrames}</span>
            </div>
            {group.items.length === 0 ? (
              <div className="px-2 py-2 text-[10px] italic text-zinc-600">No display objects on this frame.</div>
            ) : (
              <ul className="divide-y divide-zinc-800/60" aria-label={`Assets in ${group.snapshot.name}`}>
                {group.items.map((entry) => (
                  <li key={`${group.snapshot.id}-${entry.characterId}-${entry.depth}`} className="flex items-center gap-2 px-2 py-1.5">
                    <span className={cn('shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider', (KIND_COLOR as Record<string, string>)[entry.kind] ?? 'border-zinc-700 bg-zinc-800 text-zinc-400')}>
                      {entry.kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300" title={`${entry.name} · depth ${entry.depth} · #${entry.characterId}`}>
                      {entry.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-zinc-600">#{entry.characterId}</span>
                    <span className="shrink-0 font-mono text-[9px] text-zinc-600">d{entry.depth}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActorsPanel({
  project,
  actorStates,
}: {
  project: Project | null;
  actorStates: ActorState[];
}) {
  if (!project || actorStates.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
        <span aria-hidden="true" className="mb-2 text-xl text-zinc-700">♙</span>
        <p className="text-[11px] font-medium text-zinc-400">No actors</p>
        <p className="mt-1 max-w-56 text-[10px] leading-relaxed text-zinc-600">
          {project ? 'Create an actor in the Library to assign clips. Active actors will light up here while they play.' : 'Load a project to see actors.'}
        </p>
      </div>
    );
  }

  const activeCount = actorStates.filter(a => a.active).length;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="mb-2 rounded bg-zinc-900/60 px-2 py-1.5 text-[10px] leading-relaxed text-zinc-500">
        <span className="font-medium text-emerald-300">{activeCount}</span> of <span className="font-medium text-zinc-400">{actorStates.length}</span> actor{actorStates.length === 1 ? '' : 's'} active.
      </div>
      <div className="space-y-1.5">
        {actorStates.map((state) => (
          <div
            key={state.actor.id}
            className={cn(
              'rounded-md border px-2.5 py-2',
              state.active ? 'border-emerald-900/60 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-900/60',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-medium text-zinc-200">♙ {state.actor.name}</span>
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider', state.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-600')}>
                {state.active ? 'Active' : 'Idle'}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {state.clips.length === 0 ? (
                <span className="text-[10px] italic text-zinc-600">No clips assigned</span>
              ) : (
                state.clips.map((c) => (
                  <span
                    key={c.id}
                    className={cn(
                      'rounded border px-1 py-0.5 font-mono text-[9px]',
                      state.activeClips.has(c.id) ? 'border-emerald-800 bg-emerald-900/30 text-emerald-200' : 'border-zinc-800 bg-zinc-900 text-zinc-500',
                    )}
                    title={`${c.name} · ${c.timelineId} [${c.start + 1}–${c.end + 1}]`}
                  >
                    {c.name}
                  </span>
                ))
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
              <span>{state.actor.clipIds.length} clip{state.actor.clipIds.length === 1 ? '' : 's'}</span>
              {state.actor.tags?.length ? <span className="truncate text-violet-400">· {state.actor.tags.join(' ')}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface ActiveAssetEntry {
  ownerId: number;
  snapshot: RunningTimelineSnapshot;
  characterId: number;
  depth: number;
  kind: string;
  name: string;
  path?: string;
  visible?: boolean;
}

function computeActiveAssets(
  doc: SwfDocument,
  timelines: readonly RunningTimelineSnapshot[],
  project: Project | null | undefined,
): ActiveAssetEntry[] {
  const entries: ActiveAssetEntry[] = [];
  const seen = new Set<string>();
  for (const snap of timelines) {
    const tl = snap.characterId === 0 ? doc.root : doc.timelines.get(`sprite:${snap.characterId}`);
    const frame = tl?.frames[snap.frame - 1];
    const display = frame?.display ?? [];
    for (const item of display) {
      const key = `${snap.id}:${item.characterId}:${item.depth}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ch: SwfCharacter | undefined = doc.characters.get(item.characterId);
      const label = project?.characters[item.characterId]?.name;
      const name = label || ch?.exportName || ch?.className || (ch ? `${ch.kind} ${ch.id}` : `character ${item.characterId}`);
      entries.push({
        ownerId: snap.id,
        snapshot: snap,
        characterId: item.characterId,
        depth: item.depth,
        kind: ch?.kind ?? 'other',
        name: item.name ? `${name} · ${item.name}` : name,
      });
    }
  }
  entries.sort((a, b) => a.ownerId - b.ownerId || a.depth - b.depth);
  return entries;
}

export interface ActorState {
  actor: import('../types').Actor;
  clips: import('../types').Clip[];
  active: boolean;
  activeClips: Set<string>;
}

function computeActorStates(
  project: Project | null,
  timelines: readonly RunningTimelineSnapshot[],
  doc: SwfDocument,
  activeCharacterIds?: Set<number>,
  displayTree?: ActiveDisplaySnapshot | null,
): ActorState[] {
  if (!project?.actors?.length) return [];
  const runningIds = activeCharacterIds ?? new Set(timelines.map((t) => t.characterId));
  const runningTimelineIds = new Set<string>();
  for (const t of timelines) {
    if (t.characterId === 0) runningTimelineIds.add('root');
    else runningTimelineIds.add(`sprite:${t.characterId}`);
  }
  // Also add characterIds from displayTree's timelines (characterId of each clip node)
  if (displayTree) {
    const visit = (n: ActiveDisplaySnapshot) => {
      if (n.kind === 'clip' && n.totalFrames > 0) {
        if (n.characterId === 0) runningTimelineIds.add('root');
        else runningTimelineIds.add(`sprite:${n.characterId}`);
      }
      for (const c of n.children) visit(c);
    };
    visit(displayTree);
  }
  const clipById = new Map<string, import('../types').Clip>();
  for (const c of project.clips ?? []) clipById.set(c.id, c);

  return project.actors.map((actor) => {
    const clips = actor.clipIds.map((id) => clipById.get(id)).filter((c): c is import('../types').Clip => !!c);
    const activeClips = new Set<string>();
    for (const c of clips) {
      if (runningTimelineIds.has(c.timelineId)) { activeClips.add(c.id); continue; }
      const m = /^sprite:(\d+)$/.exec(c.timelineId);
      if (m && runningIds.has(Number(m[1]))) { activeClips.add(c.id); continue; }
      // Fallback: clip's timeline character is instantiated somewhere even if not top-level running
      if (m && displayTree) {
        const wantId = Number(m[1]);
        let found = false;
        const visit = (n: ActiveDisplaySnapshot) => {
          if (n.characterId === wantId) found = true;
          for (const child of n.children) if (!found) visit(child);
        };
        visit(displayTree);
        if (found) activeClips.add(c.id);
      }
    }
    void doc;
    return {
      actor,
      clips,
      active: activeClips.size > 0,
      activeClips,
    };
  });
}

function RunningTimelineRow({ doc, timeline, title }: {
  doc: SwfDocument;
  timeline: RunningTimelineSnapshot;
  title: string;
}) {
  const sourceTimeline = getSourceTimeline(doc, timeline);
  const cellCount = Math.min(timeline.totalFrames, MAX_FRAME_CELLS);
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const firstFrame = Math.floor(index * timeline.totalFrames / cellCount);
    const lastFrame = Math.max(firstFrame, Math.ceil((index + 1) * timeline.totalFrames / cellCount) - 1);
    return {
      firstFrame,
      lastFrame,
      tone: toneForRange(sourceTimeline, firstFrame, lastFrame),
    };
  });
  const playhead = ((timeline.frame - 0.5) / timeline.totalFrames) * 100;
  const currentFrameLabel = `Current frame ${timeline.frame} of ${timeline.totalFrames}`;
  const frameLabel = timeline.frameLabel;

  return (
    <article
      role="listitem"
      aria-label={`${title}, frame ${timeline.frame} of ${timeline.totalFrames}`}
      data-runtime-timeline={timeline.id}
      data-timeline-path={timeline.path}
      data-current-frame={timeline.frame}
      className="rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-2 shadow-sm"
      title={`${title} · ${timeline.path}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]" />
          <span className="truncate text-[11px] font-medium text-zinc-200">{title}</span>
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-300">
          {timeline.frame}<span className="text-zinc-600"> / </span>{timeline.totalFrames}
        </span>
      </div>

      <div
        aria-label={`Frame strip for ${title}`}
        className="relative mt-1.5 h-[18px] rounded-sm bg-black/30 p-[2px]"
        data-frame-strip="true"
      >
        <div className="grid h-full gap-px" style={{ gridTemplateColumns: `repeat(${cellCount}, minmax(0, 1fr))` }}>
          {cells.map((cell, index) => {
            const containsPlayhead = timeline.frame - 1 >= cell.firstFrame && timeline.frame - 1 <= cell.lastFrame;
            const title = cell.firstFrame === cell.lastFrame
              ? `Frame ${cell.firstFrame + 1}`
              : `Frames ${cell.firstFrame + 1}–${cell.lastFrame + 1}`;
            return (
              <span
                key={index}
                aria-hidden="true"
                data-frame-cell={cell.firstFrame + 1}
                data-frame-end={cell.lastFrame + 1}
                data-current={containsPlayhead ? 'true' : undefined}
                title={title}
                className={`min-w-0 rounded-[1px] ${FRAME_TONE_CLASS[cell.tone]} ${containsPlayhead ? 'ring-1 ring-inset ring-fuchsia-100/80' : ''}`}
              />
            );
          })}
        </div>
        <span
          role="img"
          aria-label={currentFrameLabel}
          data-playhead="true"
          className="absolute inset-y-[-2px] z-10 w-[2px] -translate-x-1/2 bg-fuchsia-100 shadow-[0_0_5px_rgba(232,121,249,0.9)]"
          style={{ left: `${playhead}%` }}
        >
          <span aria-hidden="true" className="absolute -left-[3px] -top-1 h-2 w-2 rotate-45 border border-fuchsia-100 bg-fuchsia-400" />
        </span>
      </div>

      <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[9px] leading-tight">
        <span className="min-w-0 truncate font-mono text-zinc-600" title={timeline.path}>{timeline.path}</span>
        {frameLabel && <span className="shrink-0 truncate text-amber-300/80" title={frameLabel}>“{frameLabel}”</span>}
      </div>
      {timeline.movieName && <div className="mt-1 truncate text-[9px] text-zinc-700">{timeline.movieName}</div>}
    </article>
  );
}

function timelineTitle(timeline: RunningTimelineSnapshot, names: TimelineNameIndex): string {
  if (timeline.mainMovie) return metadataAt(names, timeline.characterId)?.name || timeline.name;
  return timeline.name;
}

function metadataAt(names: TimelineNameIndex, id: number): TimelineNameMetadata | undefined {
  const map = names as ReadonlyMap<number, TimelineNameMetadata>;
  if (typeof map.get === 'function') return map.get(id);
  return (names as Readonly<Record<number, TimelineNameMetadata>>)[id];
}

function getSourceTimeline(doc: SwfDocument, snapshot: RunningTimelineSnapshot): Timeline | undefined {
  if (!snapshot.mainMovie) return undefined;
  return snapshot.characterId === 0 ? doc.root : doc.timelines.get(`sprite:${snapshot.characterId}`);
}

function toneForRange(timeline: Timeline | undefined, first: number, last: number): FrameTone {
  if (!timeline) return 'plain';
  const frames = timeline.frames.slice(first, last + 1);
  const kinds = new Set(frames.flatMap((frame) => frame.events.map((event) => event.kind)));
  if (kinds.has('action')) return 'action';
  if (kinds.has('sound')) return 'sound';
  if (kinds.has('label')) return 'label';
  if (frames.some((frame) => frame.special)) return 'other';
  return 'plain';
}
