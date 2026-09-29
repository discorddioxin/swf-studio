import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CodeInspectorView } from './components/CodeInspectorView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExecuteTab } from './components/ExecuteTab';
import { Inspector } from './components/Inspector';
import { Loader } from './components/Loader';
import { defaultFilters, Sidebar, type Filters } from './components/Sidebar';
import { Stage } from './components/Stage';
import { TimelineView } from './components/TimelineView';
import { GameEngine } from './components/GameEngine';
import { Button } from './components/ui';
import { AssetCache, expandUploadFiles, hydrateActionScriptSources, ingestFiles, patchButtonAssetIds, splitPackages, type SwfPackage } from './lib/assets';
import { parseSwfXml } from './lib/parser';
import { useProject } from './lib/project';
import type { AssetBundle, FlattenedSprite, SwfDocument } from './types';
import { flattenSpriteToPng } from './lib/render';
import { cn } from './utils/cn';

type Workspace = 'workbench' | 'engine' | 'code' | 'execute';
const WORKSPACE_LABEL: Record<Workspace, string> = {
  workbench: 'Workbench',
  engine: 'Game Engine',
  code: 'Code Inspector',
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
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [audio, setAudio] = useState(false);
  const [startFrame, setStartFrame] = useState(1);
  const [workspace, setWorkspace] = useState<Workspace>('workbench');
  const [showLibrary, setShowLibrary] = useState(true);
  const [showInspector, setShowInspector] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);

  const api = useProject(doc?.header.fileName ?? '');

  const load = useCallback(async (files: File[]) => {
    setError(null);
    setBusy('Indexing files…');
    try {
      const hasArchives = files.some((file) => /\.zip$/i.test(file.name));
      if (hasArchives) setBusy('Unpacking ZIP archives…');
      const expandedFiles = await expandUploadFiles(files);
      // one package per FFDec export (.xml + its folder); the shallowest one is the main movie,
      // the others are SWFs the game loads at run time (loadMovie / MovieClipLoader)
      const parts = splitPackages(expandedFiles);
      if (!parts.length) throw new Error('No .xml file found in that folder — expected the JPEXS dump at its root.');
      await new Promise((r) => setTimeout(r, 30));
      const loaded: SwfPackage[] = [];
      for (const part of parts) {
        setBusy(`Parsing ${part.xmlFile.name}${parts.length > 1 ? ` (${loaded.length + 1}/${parts.length})` : ''}…`);
        const bundle = ingestFiles(part.files);
        const parsedDoc = parseSwfXml(await part.xmlFile.text(), { fileName: part.xmlFile.name });
        patchButtonAssetIds(bundle, parsedDoc);
        await hydrateActionScriptSources(parsedDoc, bundle);
        const pkgCache = new AssetCache(bundle, () => setTick((t) => t + 1));
        pkgCache.useExternals(parsedDoc.characters.values());
        loaded.push({ doc: parsedDoc, bundle, cache: pkgCache });
      }
      const parsed = loaded[0]?.doc;
      if (!parsed) throw new Error('No readable .xml SWF files found in the selected uploads.');
      setPackages((previous) => { previous.forEach((p) => p.cache.dispose()); return loaded; });
      cacheRef.current = loaded[0].cache;
      setAssets(loaded[0].bundle);
      setLoadedDocs(loaded.map((p) => p.doc));
      setActiveSwfIndex(0);
      setDoc(parsed);
      setFlattenedSprites((previous) => {
        previous.forEach((sprite) => sprite.frames.forEach((frameAsset) => URL.revokeObjectURL(frameAsset.url)));
        return [];
      });
      setFps(parsed.header.frameRate);
      setTimelineId('root');
      setFrame(0);
      setSelectedId(null);
      setSelectedPath(undefined);
      setBusy(null);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

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
    setFlatteningId(characterId);
    try {
      const result = await flattenSpriteToPng(doc, cacheRef.current, timeline);
      setFlattenedSprites((previous) => {
        const old = previous.find((sprite) => sprite.timelineId === result.timelineId);
        old?.frames.forEach((frameAsset) => URL.revokeObjectURL(frameAsset.url));
        return [...previous.filter((sprite) => sprite.timelineId !== result.timelineId), result];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFlatteningId(null);
    }
  }, [doc]);

  if (!doc || !timeline || !cacheRef.current) {
    return <Loader onFiles={load} busy={busy} error={error} />;
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
          >Code</button>
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
            flattenedSprites.forEach((sprite) => sprite.frames.forEach((frameAsset) => URL.revokeObjectURL(frameAsset.url)));
            setFlattenedSprites([]); setLoadedDocs([]); setActiveSwfIndex(0); setDoc(null); setAssets(null);
          }}>
            New folder
          </Button>
        </div>
      </div>

      <ErrorBoundary label={WORKSPACE_LABEL[workspace]} resetKeys={[doc, workspace]} className="flex min-h-0 flex-1 items-center justify-center p-4">
      {workspace === 'execute' ? (
        <ExecuteTab doc={doc} cache={cache} assets={assets} externals={packages.filter((_, i) => i !== activeSwfIndex)} />
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
          <CodeInspectorView
            doc={doc}
            assets={assets}
            project={api.project}
            onSelectCharacter={(id) => { setSelectedId(id); setWorkspace('workbench'); }}
          />
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
          <DockHeader label="Library" hint={`${doc.characters.size} assets`} onClose={() => setShowLibrary(false)} />
          <div className="min-h-0 flex-1"><Sidebar
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
          /></div>
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
          {showTimeline && (
          <div className="forge-dock forge-bottom-dock shrink-0 border-t border-zinc-800/80">
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
          )}
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
          /></div>
        </div>}
      </div>
      )}
      </ErrorBoundary>
    </div>
  );
}
