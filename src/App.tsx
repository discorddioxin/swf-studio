import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CodeWorkspace } from './components/CodeWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExecuteTab } from './components/ExecuteTab';
import { Inspector } from './components/Inspector';
import { Loader } from './components/Loader';
import { defaultFilters, Sidebar, type Filters } from './components/Sidebar';
import { Stage } from './components/Stage';
import { TimelineView } from './components/TimelineView';
import { SpriteTreeView } from './components/SpriteTreeView';
import { GameEngine } from './components/GameEngine';
import { Button } from './components/ui';
import type { AssetCache, SwfPackage } from './lib/assets';
import { buildPackage as buildPackageIn, loadUploadedPackages } from './lib/swfLoading';
import { fetchBundledManifest, fetchBundledSwf } from './lib/bundled';
import { useProject } from './lib/project';
import type { AssetBundle, FlattenedSprite, SwfDocument } from './types';
import { flattenSpriteToPng } from './lib/render';
import { cn } from './utils/cn';

function disposeFlattenedSprites(sprites: Set<FlattenedSprite>) {
  sprites.forEach((sprite) => sprite.frames.forEach((frame) => URL.revokeObjectURL(frame.url)));
  sprites.clear();
}

type Workspace = 'workbench' | 'engine' | 'code' | 'execute';
const WORKSPACE_LABEL: Record<Workspace, string> = {
  workbench: 'Workbench',
  engine: 'Game Engine',
  code: 'Code Editor',
  execute: 'Execute',
};

function RailButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      data-active={active}
      onClick={onClick}
      className={cn('forge-rail-button flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-semibold', active ? 'bg-violet-500/15 text-violet-200' : 'text-zinc-600 hover:bg-zinc-900 hover:text-zinc-300')}
    >{children}</button>
  );
}

function DockHeader({ label, hint, onClose }: { label: string; hint: string; onClose: () => void }) {
  return (
    <div className="forge-dock-header flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800/80 px-3">
      <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.8)]" />
      <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-700">{hint}</span>
      <button aria-label={`Close ${label}`} onClick={onClose} className="forge-dock-toggle rounded px-1.5 py-0.5 text-zinc-600">×</button>
    </div>
  );
}

export default function App() {
  const [assets, setAssets] = useState<AssetBundle | null>(null);
  const [doc, setDoc] = useState<SwfDocument | null>(null);
  const [loadedDocs, setLoadedDocs] = useState<SwfDocument[]>([]);
  const [activeSwfIndex, setActiveSwfIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const cacheRef = useRef<AssetCache | null>(null);
  /** every loaded FFDec export (index = loadedDocs index); [0] is the main movie */
  const [packages, setPackages] = useState<SwfPackage[]>([]);
  const externalPackages = useMemo(() => packages.filter((_, i) => i !== activeSwfIndex), [packages, activeSwfIndex]);
  useEffect(() => () => { packages.forEach((p) => p.cache.dispose()); }, [packages]);

  const [timelineId, setTimelineId] = useState('root');
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(24);
  const [loopRange, setLoopRange] = useState<[number, number] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [flattenedSprites, setFlattenedSprites] = useState<FlattenedSprite[]>([]);
  const [flatteningId, setFlatteningId] = useState<number | null>(null);
  const flattenRequestRef = useRef<AbortController | null>(null);
  const flattenedResourcesRef = useRef(new Set<FlattenedSprite>());
  useEffect(() => () => {
    flattenRequestRef.current?.abort();
    disposeFlattenedSprites(flattenedResourcesRef.current);
  }, []);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [audio, setAudio] = useState(false);
  const [startFrame, setStartFrame] = useState(1);
  const [workspace, setWorkspace] = useState<Workspace>('workbench');
  const [showLibrary, setShowLibrary] = useState(true);
  const [leftDockView, setLeftDockView] = useState<'library' | 'sprite-tree'>('library');
  const [showInspector, setShowInspector] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const [timelineDockHeight, setTimelineDockHeight] = useState(240);
  const [resizingTimeline, setResizingTimeline] = useState(false);
  const timelineResizeRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    const clampTimelineHeight = () => {
      const max = Math.max(156, Math.min(window.innerHeight * 0.78, window.innerHeight - 175));
      setTimelineDockHeight((height) => Math.max(156, Math.min(max, height)));
    };
    window.addEventListener('resize', clampTimelineHeight);
    return () => window.removeEventListener('resize', clampTimelineHeight);
  }, []);

  const api = useProject(doc?.header.fileName ?? '');

  /** bundle + cache one parsed document into a SwfPackage (shared by uploads and bundled SWFs) */
  const buildPackage = useCallback(
    (files: File[], parsedDoc: SwfDocument) => buildPackageIn(files, parsedDoc, () => setTick((t) => t + 1)),
    [],
  );

  const installPackages = useCallback((loaded: SwfPackage[]) => {
    const parsed = loaded[0]?.doc;
    if (!parsed) throw new Error('No readable SWF packages to open.');
    setPackages(loaded);
    cacheRef.current = loaded[0].cache;
    setAssets(loaded[0].bundle);
    setLoadedDocs(loaded.map((p) => p.doc));
    setActiveSwfIndex(0);
    setDoc(parsed);
    flattenRequestRef.current?.abort();
    disposeFlattenedSprites(flattenedResourcesRef.current);
    setFlattenedSprites([]);
    setFlatteningId(null);
    setFps(parsed.header.frameRate);
    setTimelineId('root');
    setFrame(0);
    setSelectedId(null);
    setSelectedPath(undefined);
    setBusy(null);
  }, []);

  /** Names already loaded (basename of the document, without .xml/.swf). */
  const packageLabels = useCallback((loaded: SwfPackage[]) => new Set(
    loaded.map((p) => (p.bundle.xmlName || p.doc.header.fileName || '')
      .replace(/\.(xml|swf)$/i, '')
      .toLowerCase()),
  ), []);

  /** Fill in any of the bundled SWFs the current load does not already contain
   *  (the game's externals). Fails soft: no manifest / offline dev server ⇒
   *  the upload alone is used unchanged. */
  const mergeBundledExternals = useCallback(async (loaded: SwfPackage[]): Promise<SwfPackage[]> => {
    const merged = [...loaded];
    try {
      const entries = await fetchBundledManifest();
      const have = packageLabels(loaded);
      for (const entry of entries) {
        if (have.has(entry.name.toLowerCase())) continue;
        const { doc, files } = await fetchBundledSwf(entry);
        merged.push(await buildPackage(files, doc));
      }
      return merged;
    } catch (e) {
      merged.slice(loaded.length).forEach((p) => p.cache.dispose());
      console.warn('bundled externals unavailable:', e);
      return loaded;
    }
  }, [buildPackage, packageLabels]);

  /**
   * Load an upload. Every `.swf` (raw binary) and every `.xml` (FFDec export)
   * in the selection becomes a package; `mainKey` picks the one that plays the
   * game, the rest are its dependencies. Without a pick, the shallowest SWF is
   * the main movie and the ones below it are the external SWFs the game loads
   * at run time (loadMovie / MovieClipLoader).
   */
  const load = useCallback(async (files: File[], mainKey?: string | null) => {
    setError(null);
    setBusy('Indexing files…');
    try {
      const loaded = await loadUploadedPackages(files, mainKey, {
        onProgress: setBusy,
        onChange: () => setTick((t) => t + 1),
      });
      setBusy('Merging bundled externals…');
      installPackages(await mergeBundledExternals(loaded));
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [installPackages, mergeBundledExternals]);

  /** The Loader's "Use bundled SWFs" button: parse the raw .swf binaries that
   *  ship with the repo. `mainName` picks which of them plays the game (the
   *  others become dependencies); the default is the first manifest entry. */
  const loadBundled = useCallback(async (mainName?: string | null) => {
    setError(null);
    setBusy('Fetching bundled SWF manifest…');
    const loaded: SwfPackage[] = [];
    try {
      const entries = await fetchBundledManifest();
      const ordered = mainName
        ? [...entries].sort((a, b) => (a.name === mainName ? -1 : b.name === mainName ? 1 : 0))
        : entries;
      for (let i = 0; i < ordered.length; i++) {
        const entry = ordered[i];
        setBusy(`Loading bundled SWF ${i + 1}/${ordered.length}: ${entry.name}${entry.name === mainName ? ' (main)' : ''}…`);
        const { doc, files } = await fetchBundledSwf(entry);
        loaded.push(await buildPackage(files, doc));
      }
      installPackages(loaded);
    } catch (e) {
      loaded.forEach((p) => p.cache.dispose());
      setBusy(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [buildPackage, installPackages]);

  const timeline = useMemo(() => {
    if (!doc) return null;
    if (timelineId.startsWith('virtual:')) {
      const cid = Number(timelineId.split(':')[1]);
      const ch = doc.characters.get(cid);
      if (ch) {
        return {
          id: timelineId,
          kind: 'sprite' as const,
          characterId: cid,
          name: ch.className || ch.exportName || `${ch.kind} #${ch.id}`,
          frameCount: 1,
          frames: [{
            index: 0,
            ops: [],
            events: [],
            special: false,
            kinds: [],
            display: [{
              depth: 1,
              characterId: cid,
              matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
              ratio: 0,
              startFrame: 0,
            }]
          }]
        };
      }
    }
    return doc.timelines.get(timelineId) ?? doc.root;
  }, [doc, timelineId]);

  const count = timeline?.frameCount ?? 1;

  // ------------------------------------------------------------ playback --
  useEffect(() => {
    if (!playing || !timeline) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (t: number) => {
      acc += t - last;
      last = t;
      const spf = 1000 / Math.max(1, fps);
      if (acc >= spf) {
        const adv = Math.min(8, Math.floor(acc / spf));
        acc -= adv * spf;
        setFrame((f) => {
          const lo = loopRange ? loopRange[0] : 0;
          const hi = loopRange ? loopRange[1] : count - 1;
          let n = f + adv;
          if (n > hi) n = lo + ((n - lo) % Math.max(1, hi - lo + 1));
          if (n < lo) n = lo;
          return n;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, fps, loopRange, count, timeline]);

  // frame audio triggers
  const lastAudioTrigger = useRef<{ frame: number; time: number } | null>(null);

  useEffect(() => {
    if (!audio || !doc || !timeline || !cacheRef.current) return;
    const f = timeline.frames[frame];
    if (!f) return;
    const now = performance.now();
    // throttle/debounce playing the exact same frame within 150ms to prevent duplicate triggers during fast scrubs
    if (lastAudioTrigger.current && lastAudioTrigger.current.frame === frame && now - lastAudioTrigger.current.time < 150) {
      return;
    }
    lastAudioTrigger.current = { frame, time: now };

    for (const e of f.events) {
      if (e.kind !== 'sound' || e.characterId == null) continue;
      const p = cacheRef.current.preview(e.characterId, 'sound');
      if (!p) continue;
      const a = new Audio(p.url);
      a.volume = 0.7;
      void a.play().catch(() => {});
    }
  }, [frame, audio, doc, timeline]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.code === 'ArrowRight') { setPlaying(false); setFrame((f) => Math.min(count - 1, f + (e.shiftKey ? 10 : 1))); }
      if (e.code === 'ArrowLeft') { setPlaying(false); setFrame((f) => Math.max(0, f - (e.shiftKey ? 10 : 1))); }
      if (e.code === 'Home') setFrame(0);
      if (e.code === 'End') setFrame(count - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  const openTimeline = useCallback((id: string) => {
    setTimelineId(id);
    setFrame(0);
    setLoopRange(null);
    setSelectedPath(undefined);
    setStartFrame(1);
    const m = id.match(/:(\d+)$/);
    if (m) setSelectedId(Number(m[1]));
  }, []);

  const selectSwf = useCallback((index: number) => {
    const next = loadedDocs[index];
    if (!next) return;
    const pkg = packages[index];
    if (pkg) { cacheRef.current = pkg.cache; setAssets(pkg.bundle); }
    setActiveSwfIndex(index);
    setDoc(next);
    setTimelineId('root');
    setFrame(0);
    setLoopRange(null);
    setSelectedId(null);
    setSelectedPath(undefined);
    setSelectedActorId(null);
    setStartFrame(1);
  }, [loadedDocs, packages]);

  const flattenSprite = useCallback(async (characterId: number) => {
    if (!doc || !cacheRef.current) return;
    const character = doc.characters.get(characterId);
    const timeline = character?.timelineId ? doc.timelines.get(character.timelineId) : undefined;
    if (!timeline || timeline.kind !== 'sprite') return;
    flattenRequestRef.current?.abort();
    const controller = new AbortController();
    flattenRequestRef.current = controller;
    setFlatteningId(characterId);
    try {
      const result = await flattenSpriteToPng(doc, cacheRef.current, timeline, controller.signal);
      flattenedResourcesRef.current.add(result);
      setFlattenedSprites((previous) => {
        const old = previous.find((sprite) => sprite.timelineId === result.timelineId);
        old?.frames.forEach((frameAsset) => URL.revokeObjectURL(frameAsset.url));
        if (old) flattenedResourcesRef.current.delete(old);
        return [...previous.filter((sprite) => sprite.timelineId !== result.timelineId), result];
      });
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (flattenRequestRef.current === controller) {
        flattenRequestRef.current = null;
        if (!controller.signal.aborted) setFlatteningId(null);
      }
    }
  }, [doc]);

  if (!doc || !timeline || !cacheRef.current) {
    return <Loader onFiles={load} onBundled={loadBundled} busy={busy} error={error} />;
  }

  const cache = cacheRef.current;
  const specialCount = timeline.frames.filter((f) => f.special).length;

  return (
    <div className="forge-shell flex h-screen w-full flex-col overflow-hidden text-zinc-200">
      {/* top bar */}
      <div className="forge-chrome z-20 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800/80 px-3">
        <div className="flex items-center gap-2">
          <span className="forge-brand-mark flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-xs font-bold">SF</span>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold tracking-tight text-zinc-100">SWF Forge</div>
            <div className="text-[10px] uppercase tracking-[.18em] text-zinc-600">asset workbench</div>
          </div>
        </div>
        <div className="mx-1 h-5 w-px bg-zinc-800" />
        <span className="max-w-44 truncate text-xs text-zinc-400" title={doc.header.fileName}>{doc.header.fileName}</span>

        <div className="ml-2 flex items-center rounded-md border border-zinc-800 bg-zinc-900/80 p-0.5">
          <button
            onClick={() => setWorkspace('workbench')}
            className={cn('rounded px-2 py-1 text-[11px] font-medium', workspace === 'workbench' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}
          >Workbench</button>
          <button
            onClick={() => setWorkspace('engine')}
            className={cn('rounded px-2 py-1 text-[11px] font-medium', workspace === 'engine' ? 'bg-emerald-600/80 text-white' : 'text-zinc-500 hover:text-zinc-300')}
          >Sandbox</button>
          <button
            onClick={() => setWorkspace('code')}
            className={cn('rounded px-2 py-1 text-[11px] font-medium', workspace === 'code' ? 'bg-amber-600/80 text-white' : 'text-zinc-500 hover:text-zinc-300')}
          >Code Editor</button>
          <button
            onClick={() => setWorkspace('execute')}
            className={cn('rounded px-2 py-1 text-[11px] font-medium', workspace === 'execute' ? 'bg-sky-600/80 text-white' : 'text-zinc-500 hover:text-zinc-300')}
          >Execute</button>
        </div>

        {workspace === 'workbench' && <div className="ml-1 flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/70 p-1">
          <Button variant={showLibrary ? 'primary' : 'ghost'} className="px-2 py-1 text-[10px]" onClick={() => setShowLibrary((value) => !value)}>Library</Button>
          <Button variant={showTimeline ? 'primary' : 'ghost'} className="px-2 py-1 text-[10px]" onClick={() => setShowTimeline((value) => !value)}>Timeline</Button>
          <Button variant={showInspector ? 'primary' : 'ghost'} className="px-2 py-1 text-[10px]" onClick={() => setShowInspector((value) => !value)}>Inspector</Button>
        </div>}

        {workspace === 'workbench' && <select
          value={timelineId}
          onChange={(e) => openTimeline(e.target.value)}
          className="max-w-56 rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-500"
        >
          {[...doc.timelines.values()].map((t) => {
            const ch = t.characterId != null ? doc.characters.get(t.characterId) : null;
            const name = api.project.characters[t.characterId ?? -1]?.name;
            return (
              <option key={t.id} value={t.id}>
                {t.id === 'root' ? 'Main Timeline' : `${name || ch?.className || t.name}`} · {t.frameCount}f
              </option>
            );
          })}
        </select>}

        {workspace === 'workbench' && specialCount > 0 && (
          <span className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
            {specialCount} frame{specialCount === 1 ? '' : 's'} with code / sound / labels
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {workspace === 'workbench' && <Button variant={audio ? 'primary' : 'ghost'} className="px-2 py-1 text-[10px]" onClick={() => setAudio(!audio)} title="Play StartSound events during playback">
            {audio ? 'Audio on' : 'Audio off'}
          </Button>
          }
          {doc.warnings.length > 0 && (
            <span className="rounded border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300" title={doc.warnings.join('\n')}>
              ⚠ {doc.warnings.length}
            </span>
          )}
          <Button variant="ghost" className="px-2 py-1 text-[10px]" onClick={() => {
            packages.forEach((p) => p.cache.dispose()); setPackages([]); cacheRef.current = null;
            flattenRequestRef.current?.abort(); disposeFlattenedSprites(flattenedResourcesRef.current);
            setFlatteningId(null); setFlattenedSprites([]); setLoadedDocs([]); setActiveSwfIndex(0); setDoc(null); setAssets(null);
          }}>
            New folder
          </Button>
        </div>
      </div>

      <ErrorBoundary label={WORKSPACE_LABEL[workspace]} resetKeys={[doc, workspace]} className="flex min-h-0 flex-1 items-center justify-center p-4">
      {workspace === 'execute' ? (
        <ExecuteTab doc={doc} cache={cache} assets={assets} project={api.project} externals={externalPackages} />
      ) : workspace === 'engine' ? (
        <GameEngine
          doc={doc}
          cache={cache}
          tick={tick}
          actors={api.project.actors ?? []}
          clips={api.project.clips}
        />
      ) : workspace === 'code' ? (
        <div className="min-h-0 flex-1">
          <CodeWorkspace assets={assets} doc={doc} project={api.project} projectName={doc.header.fileName} onRun={() => setWorkspace('execute')} />
        </div>
      ) : (
      <div className="flex min-h-0 flex-1">
        <div className="forge-rail hidden w-12 shrink-0 flex-col items-center gap-2 py-3 lg:flex">
          <RailButton active={showLibrary} label="Library" onClick={() => setShowLibrary((value) => !value)}>L</RailButton>
          <RailButton active={showInspector} label="Inspector" onClick={() => setShowInspector((value) => !value)}>I</RailButton>
          <RailButton active={showTimeline} label="Timeline" onClick={() => setShowTimeline((value) => !value)}>T</RailButton>
          <div className="mt-auto flex flex-col items-center gap-2">
            <div className="h-px w-5 bg-zinc-800" />
            <span className="text-[9px] text-zinc-700">{Math.round(fps)} fps</span>
          </div>
        </div>
        {showLibrary && <div className="forge-dock flex w-72 shrink-0 flex-col border-r border-zinc-800/80">
          <DockHeader
            label={leftDockView === 'library' ? 'Library' : 'Sprite Tree'}
            hint={leftDockView === 'library' ? `${doc.characters.size} assets` : 'multi-frame sprites'}
            onClose={() => setShowLibrary(false)}
          />
          <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800/80 px-2 py-1.5">
            <button
              type="button"
              aria-pressed={leftDockView === 'library'}
              onClick={() => setLeftDockView('library')}
              className={cn('flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors', leftDockView === 'library' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300')}
            >Library</button>
            <button
              type="button"
              aria-pressed={leftDockView === 'sprite-tree'}
              onClick={() => setLeftDockView('sprite-tree')}
              className={cn('flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors', leftDockView === 'sprite-tree' ? 'bg-violet-500/15 text-violet-200' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300')}
            >Sprite Tree</button>
          </div>
          <div className="min-h-0 flex-1">
            {leftDockView === 'library' ? <Sidebar
              doc={doc}
              project={api.project}
              cache={cache}
              filters={filters}
              setFilters={setFilters}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpenTimeline={openTimeline}
              activeTimeline={timelineId}
              allTags={api.allTags}
              onRenameLabel={(id, name) => api.setLabel(id, { name })}
              actors={api.project.actors ?? []}
              selectedActorId={selectedActorId}
              onSelectActor={(id) => { setSelectedActorId(id); setShowInspector(true); }}
              onCreateActor={() => {
                const actor = api.addActor({ name: `Actor ${(api.project.actors ?? []).length + 1}`, clipIds: [], tags: [] });
                setSelectedActorId(actor.id);
              }}
              loadedSwfs={loadedDocs.map((loadedDoc, index) => ({ name: loadedDoc.header.fileName, index }))}
              activeSwfIndex={activeSwfIndex}
              onSelectSwf={selectSwf}
            /> : <SpriteTreeView
              doc={doc}
              project={api.project}
              selectedId={selectedId}
              activeTimeline={timelineId}
              onSelect={setSelectedId}
              onOpenTimeline={openTimeline}
              onSetLabel={(id, patch) => api.setLabel(id, patch)}
            />}
          </div>
        </div>}

        <div className="forge-stage flex min-w-0 flex-1 flex-col">
          <Stage
            doc={doc}
            cache={cache}
            timeline={timeline}
            frame={frame}
            tick={tick}
            selectedPath={selectedPath}
            onPick={(path, cid) => {
              setSelectedPath(path);
              if (cid != null) {
                setSelectedId(cid);
                const ch = doc.characters.get(cid);
                if (ch?.timelineId) {
                  openTimeline(ch.timelineId);
                }
              }
            }}
          />
          {showTimeline && <>
            <div
              role="separator"
              aria-label="Resize Timeline panel"
              aria-orientation="horizontal"
              aria-valuemin={156}
              aria-valuemax={Math.max(156, Math.min(window.innerHeight * 0.78, window.innerHeight - 175))}
              aria-valuenow={Math.round(timelineDockHeight)}
              tabIndex={0}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                timelineResizeRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: timelineDockHeight };
                setResizingTimeline(true);
              }}
              onPointerMove={(event) => {
                const start = timelineResizeRef.current;
                if (!start || start.pointerId !== event.pointerId) return;
                const max = Math.max(156, Math.min(window.innerHeight * 0.78, window.innerHeight - 175));
                setTimelineDockHeight(Math.max(156, Math.min(max, start.startHeight + start.startY - event.clientY)));
              }}
              onPointerUp={(event) => {
                if (timelineResizeRef.current?.pointerId !== event.pointerId) return;
                timelineResizeRef.current = null;
                setResizingTimeline(false);
              }}
              onPointerCancel={() => { timelineResizeRef.current = null; setResizingTimeline(false); }}
              onLostPointerCapture={() => { timelineResizeRef.current = null; setResizingTimeline(false); }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                event.preventDefault();
                const delta = (event.shiftKey ? 48 : 16) * (event.key === 'ArrowUp' ? 1 : -1);
                const max = Math.max(156, Math.min(window.innerHeight * 0.78, window.innerHeight - 175));
                setTimelineDockHeight((height) => Math.max(156, Math.min(max, height + delta)));
              }}
              className={cn('group flex h-2 shrink-0 cursor-row-resize touch-none items-center justify-center border-y border-zinc-800/70 bg-zinc-950 outline-none transition-colors hover:bg-violet-500/10 focus-visible:bg-violet-500/10', resizingTimeline && 'bg-violet-500/15')}
            >
              <span className="pointer-events-none h-0.5 w-10 rounded-full bg-zinc-700 transition-colors group-hover:bg-violet-400 group-focus-visible:bg-violet-400" />
            </div>
            <div
              className="forge-dock forge-bottom-dock flex min-h-0 shrink-0 flex-col border-t border-zinc-800/80"
              style={{ height: timelineDockHeight, transition: resizingTimeline ? 'none' : undefined }}
            >
              <DockHeader label="Timeline" hint={`${timeline.name} · ${timeline.frameCount} frames`} onClose={() => setShowTimeline(false)} />
              <TimelineView
                doc={doc}
                timeline={timeline}
                frame={frame}
                setFrame={setFrame}
                playing={playing}
                setPlaying={setPlaying}
                api={api}
                loopRange={loopRange}
                setLoopRange={setLoopRange}
                fps={fps}
                setFps={setFps}
                startFrame={startFrame}
                setStartFrame={setStartFrame}
              />
            </div>
          </>}
        </div>

        {showInspector && <div className="forge-dock flex w-80 shrink-0 flex-col border-l border-zinc-800/80">
          <DockHeader label="Inspector" hint={selectedActorId ? 'Actor selected' : selectedId != null ? `Character #${selectedId}` : 'Select an item'} onClose={() => setShowInspector(false)} />
          <div className="min-h-0 flex-1"><Inspector
          doc={doc}
          cache={cache}
          assets={assets}
          api={api}
          selectedId={selectedId}
          onSelect={setSelectedId}
          timeline={timeline}
          frame={frame}
          selectedPath={selectedPath}
          onPickPath={setSelectedPath}
          onOpenTimeline={openTimeline}
          setFrame={setFrame}
          setLoopRange={setLoopRange}
          selectedActorId={selectedActorId}
          flattenedSprites={flattenedSprites}
          flatteningId={flatteningId}
          onFlattenSprite={(id) => void flattenSprite(id)}
          onOpenCode={() => setWorkspace('code')}
          /></div>
        </div>}
      </div>
      )}
      </ErrorBoundary>
    </div>
  );
}
