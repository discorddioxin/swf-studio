// Execute for ActionScript 1/2 games (SWF ≤ 8): the FFDec script export in
// the loaded folder is transpiled with as2ts, compiled and run on the AS2
// player (src/engine/as2) against the parsed SWF document.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetCache, SwfPackage } from '../lib/assets';
import type { AssetBundle, Project, SwfDocument } from '../types';
import { Button } from './ui';
import { ExecutionConsole } from './ExecutionConsole';
import { UiTroubleshooter } from './uiTroubleshooter/UiTroubleshooter';
import { scanStage, type Finding } from './uiTroubleshooter/scan';
import { RunningTimelinesSidebar } from './RunningTimelinesSidebar';
import { useExecutionDiagnostics } from './useExecutionDiagnostics';
import type { LogEntry } from '../engine/flash/player';
import { AS2Player, type ActiveDisplaySnapshot, type Movie, type RunningTimelineSnapshot } from '../engine/as2/player';
import { createExternalResolver, swfNameOf, type ExternalSwf } from '../engine/as2/externals';
import { readAS2Text, useAS2Build } from '../engine/as2/useAS2Build';
import { buildWorkbenchTimelineMetadata } from '../engine/as2/workbenchMetadata';
import { _global as as2Global } from '../runtime/as2';
import { MissingDependenciesBanner, MissingDependenciesPanel, dependencyProblems, useMissingDependencies } from './MissingDependencies';
import type { DependencyFiles } from '../engine/flash/dependencies';
import { AS2AudioBackend, embeddedFontFamily, registerFonts, soundFilesOf } from '../engine/as2/audio';
import { GAME_ADAPTERS, resolveAdapter, type AdapterSwf, type GameAdapter, type GameContext } from '../adapters';
import { useDebugger, useDebuggerState } from '../debug/store';
import { DebugPanel } from '../debug/DebugPanel';
import { usePopout } from '../debug/Popout';
import { assignLegacyBoot, bootKey, discardLegacyBoot, migrateLegacyBoot, readBoot, writeBoot } from './bootScripts';

const MAX_LOG = 500;

function flattenDisplayIds(root: ActiveDisplaySnapshot | null): number[] {
  if (!root) return [];
  const ids: number[] = [];
  const visit = (n: ActiveDisplaySnapshot) => { ids.push(n.id); for (const c of n.children) visit(c); };
  visit(root);
  return ids;
}

function sameRunningTimelines(a: readonly RunningTimelineSnapshot[], b: readonly RunningTimelineSnapshot[]): boolean {
  return a.length === b.length && a.every((timeline, index) => {
    const next = b[index];
    return timeline.id === next.id
      && timeline.frame === next.frame
      && timeline.totalFrames === next.totalFrames
      && timeline.frameLabel === next.frameLabel
      && timeline.name === next.name
      && timeline.path === next.path
      && timeline.movieName === next.movieName
      && timeline.mainMovie === next.mainMovie;
  });
}

/**
 * Boot scripts run on _root after frame 1 (plain JavaScript; `_root`, `player`
 * and `_global` are in scope). The list is the adapter's: SWF Studio itself
 * only offers "None" (start exactly like the SWF does).
 */
const NO_BOOT = { id: 'none', label: 'None', code: '', hint: 'Start exactly like the SWF does.' } as const;

export const isAs2Bundle = (doc: SwfDocument, assets: AssetBundle | null) =>
  !!assets?.files.some((f) => /\.as$/i.test(f.path)) && (Number(doc.header.version ?? 0) <= 8 || !doc.symbolClasses?.size);

/** The default for `externals`: one shared array, because the player effect depends
 *  on it — a fresh `[]` per render would recreate the player on every render. */
const NO_EXTERNALS: SwfPackage[] = [];
const NO_FONTS = new Set<number>(); // shared and never written to

/** An external SWF export with its key (used for its fonts). */
interface ExternalEntry { pkg: SwfPackage; name: string; key: string }

export function As2Execute({ doc, cache, assets, project, externals = NO_EXTERNALS, adapterId = null, gameSetId = null, onAdapterChange, dependencyFiles = null }: {
  doc: SwfDocument; cache: AssetCache; assets: AssetBundle | null; project?: Project; externals?: SwfPackage[];
  /** non-SWF files uploaded with the movies, which they may request at run time */
  dependencyFiles?: DependencyFiles | null;
  /** adapter id picked by the user ("auto"/null = detect from the loaded SWFs) */
  adapterId?: string | null;
  /** bundled game set this load came from, if any (supplies the adapter hint) */
  gameSetId?: string | null;
  onAdapterChange?: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<AS2Player | null>(null);
  const audioRef = useRef<AS2AudioBackend | null>(null);
  const extAudioRef = useRef<AS2AudioBackend[]>([]);
  const playingRef = useRef(true);
  const timelineMetadata = useMemo(() => buildWorkbenchTimelineMetadata(doc, project), [doc, project]);
  const build = useAS2Build(assets, timelineMetadata);
  const [session, setSession] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [runtimeTimelines, setRuntimeTimelines] = useState<RunningTimelineSnapshot[]>([]);
  const [displayTree, setDisplayTree] = useState<ActiveDisplaySnapshot | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<number> | null>(null);
  const [panel, setPanel] = useState<'console' | 'program' | 'troubleshooter' | null>('console');
  const [playerEpoch, setPlayerEpoch] = useState(0);
  const [uiHint, setUiHint] = useState<{ errors: number; warns: number; top: string } | null>(null);
  const [showDebugger, setShowDebugger] = useState(false);
  const [hud, setHud] = useState({ frame: 1, total: 1, label: null as string | null, time: 0 });
  const [tree, setTree] = useState<string[]>([]);
  const dependencies = useMissingDependencies(useCallback(() => playerRef.current?.dependencies, []));
  const missingFiles = dependencies.filter((d) => !d.service && !d.optional);
  const [size, setSize] = useState({ w: 800, h: 500 });
  // Embedded fonts registered for the current movie / external SWFs, tagged with
  // what they were registered for (a stale result is not ready).
  const [ownFonts, setOwnFonts] = useState<{ of: unknown; ids: Set<number> } | null>(null);
  const [extFonts, setExtFonts] = useState<{ of: unknown; ids: Map<string, Set<number>> } | null>(null);
  const [loadedExternals, setLoadedExternals] = useState<{ name: string; ms: number; errors: number }[]>([]);
  const extEntries = useMemo<ExternalEntry[]>(() => externals.map((pkg, i) => {
    const name = swfNameOf(pkg.bundle.xmlName || pkg.doc.header.fileName || `external${i}`);
    return { pkg, name, key: `x${i}-${name.replace(/[^a-z0-9]+/gi, '_')}` };
  }), [externals]);
  const [viewFile, setViewFile] = useState<string | null>(null);
  // ---- game adapter: the only place this tab is allowed to know the game
  const adapterCtx = useMemo<GameContext>(() => {
    const pathsOf = (pkg: SwfPackage) => pkg.bundle.files.map((f) => f.path);
    return {
      main: { name: swfNameOf(assets?.xmlName || doc.header.fileName || 'main'), doc, paths: pathsOf({ bundle: assets } as SwfPackage) },
      externals: externals.map<AdapterSwf>((pkg, i) => ({
        name: swfNameOf(pkg.bundle.xmlName || pkg.doc.header.fileName || `external${i}`),
        doc: pkg.doc,
        paths: pathsOf(pkg),
      })),
      bundled: !!gameSetId,
      declaredId: gameSetId,
    };
  }, [assets, doc, externals, gameSetId]);
  const adapter: GameAdapter = useMemo(() => resolveAdapter(adapterCtx, adapterId), [adapterCtx, adapterId]);
  /** adapter log sink; the player's own logger takes over once it exists */
  const adapterLog = useRef<(level: 'info' | 'warn' | 'error', message: string) => void>((level, message) => console[level === 'info' ? 'log' : level](message));
  const network = useMemo(
    () => adapter.createNetwork?.(adapterCtx, { log: (level, message) => adapterLog.current(level, message) }),
    [adapter, adapterCtx],
  );
  const sessionInfo = network?.sessionInfo?.();
  const bootPresets = useMemo<{ id: string; label: string; code: string; hint: string }[]>(
    () => [NO_BOOT, ...(adapter.bootPresets ?? [])],
    [adapter],
  );
  // ---- boot script: one per game (adapter + main SWF), see bootScripts.ts. It is
  // derived while rendering so a player created for a new game never sees the
  // previous game's script.
  const bootStorageKey = bootKey(adapter.id, adapterCtx.main.name);
  const loadBootState = (key: string) => ({
    key,
    unassigned: migrateLegacyBoot(key, bootPresets.map((p) => p.code.trim()).filter(Boolean),
      GAME_ADAPTERS.flatMap((a) => (a.bootPresets ?? []).map((p) => p.code.trim())).filter(Boolean)),
    code: readBoot(key),
  });
  const [bootState, setBootState] = useState(() => loadBootState(bootStorageKey));
  let bootNow = bootState;
  if (bootState.key !== bootStorageKey) { bootNow = loadBootState(bootStorageKey); setBootState(bootNow); }
  const boot = bootNow.code;
  const setBoot = (code: string) => { writeBoot(bootStorageKey, code); setBootState({ ...bootNow, code }); };
  const adoptLegacyBoot = () => setBootState({ ...bootNow, code: assignLegacyBoot(bootStorageKey), unassigned: null });
  const dropLegacyBoot = () => { discardLegacyBoot(); setBootState({ ...bootNow, unassigned: null }); };
  const pendingLogs = useRef<LogEntry[]>([]);
  const runtimeTimelinesRef = useRef<RunningTimelineSnapshot[]>([]);
  const displayTreeRef = useRef<ActiveDisplaySnapshot | null>(null);
  // highlight overlay: sync to player and force a frame when paused
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    p.setHighlightedIds(highlightedIds);
    // ensure highlight appears even while paused (render loop skips tick)
    try { p.render(); } catch {}
  }, [highlightedIds]);
  const executionFaultRef = useRef(false);
  const dbg = useDebugger();
  const dbgState = useDebuggerState();
  const executePopout = usePopout({ title: 'Execute Engine — SWF Studio', width: 900, height: 700 });
  const appendGlobalProblem = useCallback((entry: LogEntry) => {
    setLogs((previous) => [...previous, entry].slice(-MAX_LOG));
  }, []);
  useExecutionDiagnostics(appendGlobalProblem);

  /** Send troubleshooter findings to the Execution console (Problems tab), deduped. */
  const appendTroubleshooterFindings = useCallback((findings: Finding[]) => {
    if (!findings.length) return;
    const time = playerRef.current?.time() ?? 0;
    const entries: LogEntry[] = findings.slice(0, 40).map((f) => ({
      level: f.severity === 'error' ? 'error' : 'warn',
      kind: 'problem',
      source: 'app',
      context: `UI troubleshooter · ${f.area}${f.path ? ` · ${f.path}` : ''}`,
      message: `${f.title} — ${f.detail}${f.hint ? ` → ${f.hint}` : ''}`,
      time,
    }));
    setLogs((previous) => {
      const seen = new Set(previous.filter((e) => e.context?.startsWith('UI troubleshooter')).map((e) => e.message));
      const fresh = entries.filter((e) => !seen.has(e.message));
      return fresh.length ? [...previous, ...fresh].slice(-MAX_LOG) : previous;
    });
  }, []);

  // Automatically check the live UI once the game has settled. Only real
  // (non-provisional) errors raise the banner — this is what catches a server
  // list that holds data but never laid out its rows.
  useEffect(() => {
    if (build.status !== 'ready') return;
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const report = scanStage(player, { probe: false });
        const errors = report.findings.filter((f) => f.severity === 'error');
        const warns = report.findings.filter((f) => f.severity === 'warn');
        setUiHint(errors.length ? { errors: errors.length, warns: warns.length, top: errors[0].title } : null);
      } catch {
        // the troubleshooter must never break Execute
      }
    }, 8000);
    return () => window.clearTimeout(timer);
    // one health check per loaded document
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.status, doc]);


  useEffect(() => {
    const unsub = dbg.subscribe(() => {
      const s = dbg.getState();
      if (s.paused) { playingRef.current = false; setPlaying(false); }
    });
    return unsub;
  }, [dbg]);

  useEffect(() => {
    dbg.registerCallbacks('as2', {
      onContinue: () => { playingRef.current = true; setPlaying(true); },
      onStepOver: () => { playingRef.current = false; setPlaying(false); playerRef.current?.tick(); },
      onStepInto: () => { playingRef.current = false; setPlaying(false); playerRef.current?.tick(); },
      onStepOut: () => { playingRef.current = false; setPlaying(false); playerRef.current?.tick(); },
    });
    return () => dbg.unregisterCallbacks('as2');
  }, [dbg]);

  // Embedded fonts are independent of the source project build. A SWF's fonts
  // are there before its first frame runs, so the player starts once they are
  // registered (below) rather than being rebuilt — restarting the game — when
  // they arrive.
  useEffect(() => {
    let cancelled = false;
    const fontsController = new AbortController();
    registerFonts(assets?.files ?? [], undefined, fontsController.signal).then((ids) => { if (!cancelled) setOwnFonts({ of: assets, ids }); });
    return () => { cancelled = true; fontsController.abort(); };
  }, [assets]);

  useEffect(() => {
    let cancelled = false;
    const fontsController = new AbortController();
    Promise.all(extEntries.map(async (e) => [e.key, await registerFonts(e.pkg.bundle.files, e.key, fontsController.signal)] as const))
      .then((pairs) => { if (!cancelled) setExtFonts({ of: extEntries, ids: new Map(pairs) }); });
    return () => { cancelled = true; fontsController.abort(); };
  }, [extEntries]);
  const fontIds = ownFonts?.of === assets ? ownFonts.ids : null;
  const extFontIds = extFonts?.of === extEntries ? extFonts.ids : null;

  const fontFamily = useCallback((f: number | string, movie?: Movie) => {
    const libs: { doc: SwfDocument; key?: string; ids: Set<number> }[] = [
      { doc, ids: fontIds ?? NO_FONTS },
      ...extEntries.map((e) => ({ doc: e.pkg.doc, key: e.key, ids: extFontIds?.get(e.key) ?? NO_FONTS })),
    ];
    const own = movie?.key ? libs.find((l) => l.key === movie.key) : libs[0];
    const fontName = (c: { attrs: Record<string, string> } | undefined) => (c?.attrs.fontName ?? '').replace(/\u0000/g, '');
    let hit: { lib: (typeof libs)[number]; id: number } | null = null;
    let name = typeof f === 'string' ? f : '';
    if (typeof f === 'number') {
      const lib = own ?? libs[0];
      name = fontName(lib.doc.characters.get(f));
      if (lib.ids.has(f)) hit = { lib, id: f };
    }
    if (!hit && name) {
      for (const lib of own ? [own, ...libs.filter((l) => l !== own)] : libs) {
        const c = [...lib.doc.characters.values()].find((x) => x.kind === 'font' && lib.ids.has(x.id) && fontName(x).toLowerCase() === name.toLowerCase());
        if (c) { hit = { lib, id: c.id }; break; }
      }
    }
    const embedded = hit ? `"${embeddedFontFamily(hit.id, hit.lib.key)}", ` : '';
    return `${embedded}${name ? `"${name}", ` : ''}sans-serif`;
  }, [doc, fontIds, extEntries, extFontIds]);

  // ---- a player per (document, build, restart), once the fonts are registered
  useEffect(() => {
    if (build.status !== 'ready' || !fontIds || !extFontIds) return;
    executionFaultRef.current = false;
    pendingLogs.current = [];
    runtimeTimelinesRef.current = [];
    setLogs([]);
    setRuntimeTimelines([]);
    dbg.clearStack();
    (dbg as any).clearSkip?.();
    if (dbg.getState().paused) dbg.resume();
    const audio = new AS2AudioBackend(cache, soundFilesOf(assets?.files ?? []));
    audio.muted = muted;
    audioRef.current = audio;
    const extAudio = extEntries.map((e) => { const a = new AS2AudioBackend(e.pkg.cache, soundFilesOf(e.pkg.bundle.files)); a.muted = muted; return a; });
    extAudioRef.current = extAudio;
    setLoadedExternals([]);
    const swfs: ExternalSwf[] = extEntries.map((e, i) => ({
      name: e.name, key: e.key, doc: e.pkg.doc, assets: e.pkg.cache, audio: extAudio[i],
      sources: () => Promise.all(e.pkg.bundle.files.filter((f) => /\.as$/i.test(f.path)).map(async (f) => ({
        path: f.path, text: await readAS2Text(f.file), tagOrder: f.tagOrder, targetSpriteId: f.targetSpriteId,
      }))),
    }));
    let playerForLog: AS2Player | null = null;
    const resolveExternal = createExternalResolver(swfs, {
      onBuild: (swf, b, ms) => {
        setLoadedExternals((l) => [...l, { name: swf.name, ms, errors: b.errors.length }]);
        playerForLog?.log('info', `loaded external SWF ${swf.name}: ${b.files.size} modules transpiled in ${ms} ms`);
        for (const e of b.errors) playerForLog?.log('error', `as2ts (${swf.name}): ${e.file}: ${e.message}`, undefined, { source: 'forge', kind: 'problem', context: e.file });
      },
      onError: (swf, e) => playerForLog?.log('error', `external SWF ${swf.name}: ${e.message}`, e.stack, { source: 'forge', kind: 'problem', context: `external SWF ${swf.name}` }),
    });
    const bootCode = boot.trim();
    const customBoot = !bootPresets.some((preset) => preset.code.trim() === bootCode);
    const player = new AS2Player({
      doc,
      program: build.build.program,
      assets: cache,
      audio,
      debugger: dbg,
      fontFamily,
      resolveExternal,
      missingExternal: 'empty',
      dependencyFiles,
      onLog: (entry) => {
        pendingLogs.current.push(entry);
        if (entry.level === 'error') console.error('[game]', entry.message, entry.detail ?? '');
      },
      // the adapter owns the offline network: mock gateway + socket stand-in
      fetchText: network?.fetchText
        ? (url, method, body, onNetwork) =>
            network.fetchText!(url, method, body, (level, message, detail) => player.log(level, message, detail, { source: 'network' }), onNetwork)
        : undefined,

      gameServer: network?.gameServer ?? undefined,
      isOptionalExternal: adapter.isOptionalExternal ? (url) => !!adapter.isOptionalExternal?.(url) : undefined,
      onExternalUrl: (url) => {
        if (!adapter.isHelpUrl?.(url)) return false;
        if (!adapter.helpPanel) { player.log('info', `external link ignored offline: ${url}`); return true; }
        player.log('info', `opened the offline guide (${adapter.helpPanel.title})`);
        setInstructionsOpen(true);
        return true;
      },
      afterStart: (root, p) => {
        adapterLog.current = (level, message) => p.log(level, message, undefined, { source: 'network' });
        if (bootCode) {
          p.log('info', customBoot ? 'running the custom boot script saved for this game' : 'running boot script');
          new Function('_root', 'player', '_global', bootCode)(root, p, as2Global);
        }
        adapter.onStart?.(root, p, adapterCtx, network);
      },
    });
    playerForLog = player;
    if (swfs.length) player.log('info', `external SWFs available: ${swfs.map((s) => s.name).join(', ')}`);
    playerRef.current = player;
    (globalThis as any).__as2player = player;
    setPlayerEpoch((e) => e + 1);
    player.start();
    canvasRef.current?.focus({ preventScroll: true });
    return () => {
      player.dispose(); audio.dispose(); extAudio.forEach((a) => a.dispose());
      if (playerRef.current === player) playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, cache, build, session, fontFamily, extEntries, dependencyFiles]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
    extAudioRef.current.forEach((a) => { a.muted = muted; });
  }, [muted]);

  // ---- fit the canvas
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: Math.max(100, el.clientWidth), h: Math.max(100, el.clientHeight) });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [panel, showDebugger]);

  const view = useMemo(() => {
    const sw = (doc.header.stage.xMax - doc.header.stage.xMin) / 20 || 550;
    const sh = (doc.header.stage.yMax - doc.header.stage.yMin) / 20 || 400;
    const scale = Math.min(size.w / sw, size.h / sh);
    return { scale, x: (size.w - sw * scale) / 2, y: (size.h - sh * scale) / 2 };
  }, [doc, size]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const panelRef = useRef(panel);
  panelRef.current = panel;

  // ---- main loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    const loop = (now: number) => {
      const player = playerRef.current;
      const canvas = canvasRef.current;
      const dt = now - last;
      last = now;
      if (player && !executionFaultRef.current) {
        try {
          if (dbg.getState().paused) {
            // paused by debugger — don't advance, still render
          } else if (playingRef.current) player.advanceBy(dt);
          const ctx = canvas?.getContext('2d');
          if (ctx && canvas) {
            const dpr = window.devicePixelRatio || 1;
            const v = viewRef.current;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#09090b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            player.renderTo(ctx, v.scale * dpr, v.x * dpr, v.y * dpr);
            const h = player.hovered;
            canvas.style.cursor = player.cursorHidden ? 'none' : h?.kind === 'text' ? 'text' : h && h.obj?.useHandCursor !== false ? 'pointer' : 'default';
          }
          if (now - lastHud > 100) {
            lastHud = now;
            const root = player.root;
            setHud({ frame: root.frame + 1, total: root.totalFrames, label: root.timeline?.frames[root.frame]?.label ?? null, time: player.time() });
            const nextTimelines = player.runningTimelines();
            if (!sameRunningTimelines(runtimeTimelinesRef.current, nextTimelines)) {
              runtimeTimelinesRef.current = nextTimelines;
              setRuntimeTimelines(nextTimelines);
            }
            // Full display tree including static UI (buttons, single-frame clips) for Assets/Actors tabs
            try {
              const nextTree = player.activeDisplayTree();
              // shallow diff via JSON stringify of ids / structure size to avoid spamming renders
              const nextKey = JSON.stringify(flattenDisplayIds(nextTree));
              const prevKey = displayTreeRef.current ? JSON.stringify(flattenDisplayIds(displayTreeRef.current)) : '';
              if (nextKey !== prevKey) {
                displayTreeRef.current = nextTree;
                setDisplayTree(nextTree);
              }
            } catch {}
            if (panelRef.current === 'program') setTree(player.tree());
            if (pendingLogs.current.length) {
              const batch = pendingLogs.current;
              pendingLogs.current = [];
              setLogs((prev) => [...prev, ...batch].slice(-MAX_LOG));
            }
          }
        } catch (error) {
          executionFaultRef.current = true;
          playingRef.current = false;
          setPlaying(false);
          const err = error instanceof Error ? error : new Error(String(error));
          player.log('error', `Execute animation/render loop: ${err.message}`, err.stack, {
            source: 'engine', kind: 'problem', context: 'Execute animation/render loop',
          });
          const batch = pendingLogs.current;
          pendingLogs.current = [];
          if (batch.length) setLogs((prev) => [...prev, ...batch].slice(-MAX_LOG));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dbg]);

  // ---- input
  const handleHighlight = useCallback((ids: Set<number> | null) => {
    setHighlightedIds(ids && ids.size ? new Set(ids) : null);
  }, []);

  const toStage = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [(e.clientX - rect.left - v.x) / v.scale, (e.clientY - rect.top - v.y) / v.scale] as const;
  }, []);
  const onKey = (down: boolean) => (e: React.KeyboardEvent) => {
    if (e.metaKey) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Backspace'].includes(e.key)) e.preventDefault();
    if (down) playerRef.current?.keyDown(e.keyCode, e.key); else playerRef.current?.keyUp(e.keyCode);
  };

  const togglePlay = () => {
    if (dbgState.paused) { dbg.continue(); return; }
    playingRef.current = !playingRef.current; setPlaying(playingRef.current); canvasRef.current?.focus();
  };
  const step = () => {
    if (dbgState.paused) { dbg.stepOver(); return; }
    playingRef.current = false; setPlaying(false); const p = playerRef.current; if (p) { p.tick(); }
  };
  const restart = () => {
    const previous = playerRef.current;
    playerRef.current = null;
    previous?.dispose();
    network?.reset?.();
    dbg.resume();
    dbg.clearStack();
    playingRef.current = true;
    setPlaying(true);
    setInstructionsOpen(false);
    setSession((s) => s + 1);
    canvasRef.current?.focus();
  };

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const b = build.status === 'ready' ? build.build : null;
  const AVM1_SUMMARY = (warnings: { file: string; message: string }[]): LogEntry[] => {
    const avm1 = warnings.filter((w) => w.message.startsWith('AVM1 interpreter fallback'));
    const rest = warnings.filter((w) => !w.message.startsWith('AVM1 interpreter fallback'));
    const out: LogEntry[] = rest.map((issue) => ({
      level: 'warn' as const, kind: 'problem' as const, source: 'forge' as const,
      context: issue.file, message: `${issue.file}: ${issue.message}`, time: 0,
    }));
    if (!avm1.length) return out;
    const byReason = new Map<string, number>();
    for (const w of avm1) {
      const m = /AVM1 interpreter fallback \(([^)]+)\)/.exec(w.message)?.[1] ?? w.message;
      // normalize dynamic suffixes like "byte 4278: Unsupported ..." -> "Unsupported ..."
      const reason = m.replace(/^byte \d+:\s*/, '').split(';')[0].trim();
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
    if (avm1.length <= 4) {
      for (const w of avm1) out.push({ level: 'warn' as const, kind: 'problem' as const, source: 'forge' as const, context: w.file, message: `${w.file}: ${w.message} — running via AVM1 interpreter`, time: 0 });
    } else {
      const summary = [...byReason.entries()].map(([r,c]) => `${r} ×${c}`).join(' · ');
      out.push({ level: 'warn' as const, kind: 'problem' as const, source: 'forge' as const, context: 'AS2 build', message: `AVM1 interpreter fallback: ${avm1.length} blocks will run via interpreter (not transpiled) — ${summary}`, time: 0 });
      // keep first example per reason for inspection
      const seen = new Set<string>();
      for (const w of avm1) {
        const key = /AVM1 interpreter fallback \(([^)]+)\)/.exec(w.message)?.[1]?.replace(/^byte \d+:\s*/, '').split(';')[0].trim() ?? w.message;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ level: 'warn' as const, kind: 'problem' as const, source: 'forge' as const, context: w.file, message: `${w.file}: ${w.message} — running via AVM1 interpreter`, time: 0 });
        if (seen.size >= 4) break;
      }
    }
    return out;
  };
  const forgeProblems: LogEntry[] = build.status === 'failed' ? [{
    level: 'error', kind: 'problem', source: 'forge', context: 'AS2 build', message: build.error, time: 0,
  }] : build.status === 'ready' ? [
    ...build.build.errors.map((issue) => ({
      level: 'error' as const, kind: 'problem' as const, source: 'forge' as const,
      context: issue.file, message: `${issue.file}: ${issue.message}`, time: 0,
    })),
    ...AVM1_SUMMARY(build.build.warnings),
    ...dependencyProblems(dependencies),
  ] : [];
  const consoleEntries = [...forgeProblems, ...logs];
  const errorCount = consoleEntries.filter((entry) => entry.level === 'error').length;
  const preset = bootPresets.find((p) => p.code === boot.trim()) ?? null;

  const inner = (
    <div className="flex h-full min-h-0 w-full flex-col bg-zinc-950">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-zinc-100">Execute</div>
            {dbgState.paused && <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">⏸ Paused{dbgState.pauseReason ? ` · ${dbgState.pauseReason}` : ''}</span>}
            {boot.trim() && !preset && (
              <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300" title={`Runs on _root after frame 1 of ${adapterCtx.main.name}:\n${boot.trim().slice(0, 300)}`}>
                Custom boot script active
              </span>
            )}
          </div>
          <div className="truncate text-[10px] text-zinc-500">
            {build.status === 'loading' ? 'Transpiling ActionScript…' : build.status === 'failed' ? 'Could not read the scripts'
              : `AS2 engine · ${build.sources.length} script(s) · frame ${hud.frame}/${hud.total}${hud.label ? ` “${hud.label}”` : ''} · ${(hud.time / 1000).toFixed(1)}s`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {onAdapterChange && (
            <label className="flex items-center gap-1 text-[10px] text-zinc-400" title={adapter.description}>
              Game
              <select
                aria-label="Game adapter"
                className="max-w-[11rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-200"
                value={adapterId ?? 'auto'}
                onChange={(e) => onAdapterChange(e.target.value)}
              >
                <option value="auto">Auto — {adapter.label}</option>
                {GAME_ADAPTERS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1 text-[10px] text-zinc-400" title={preset?.hint ?? 'Custom boot script'}>
            Start
            <select
              aria-label="Start mode"
              className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-200"
              value={preset?.id ?? 'custom'}
              onChange={(e) => { const p = bootPresets.find((x) => x.id === e.target.value); if (p) { setBoot(p.code); restart(); } }}
            >
              {bootPresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              {!preset && <option value="custom">Custom script</option>}
            </select>
          </label>
          <Button variant={playing && !dbgState.paused ? 'primary' : 'default'} onClick={togglePlay} title={dbgState.paused ? 'Continue (F5)' : 'Play / pause the game'}>{dbgState.paused ? '▶ Continue' : playing ? '❚❚ Pause' : '▶ Play'}</Button>
          <Button onClick={step} title={dbgState.paused ? 'Step over (F10)' : 'Pause and advance exactly one frame'}>{dbgState.paused ? 'Step Over' : 'Step'}</Button>
          <Button onClick={restart} title="Start again from frame 1">Restart</Button>
          <Button variant={muted ? 'default' : 'ghost'} onClick={() => setMuted((m) => !m)} title="Mute new sounds">{muted ? 'Muted' : 'Sound'}</Button>
          <button
            type="button"
            aria-pressed={showDebugger}
            onClick={() => setShowDebugger(v => !v)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${showDebugger ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
          >
            {showDebugger ? '● Debugger' : '○ Debugger'}
          </button>
          {executePopout.isPopped ? (
            <Button variant="ghost" onClick={executePopout.close}>↙ Restore</Button>
          ) : (
            <Button variant="ghost" onClick={executePopout.open} title="Pop out Execute Engine to a separate window">↗ Pop out Execute</Button>
          )}
          <Button
            variant={panel === 'troubleshooter' ? 'primary' : 'ghost'}
            onClick={() => setPanel((p) => (p === 'troubleshooter' ? null : 'troubleshooter'))}
            title="Inspect the live UI: display list, component layout, hit-testing and pixels"
          >
            🔎 Troubleshoot
          </Button>
          <Button variant={panel === 'program' ? 'primary' : 'ghost'} onClick={() => setPanel((p) => (p === 'program' ? null : 'program'))}>
            Program{missingFiles.length || b?.errors.length ? ' ⚠' : ''}
          </Button>
          <Button variant={panel === 'console' ? 'primary' : 'ghost'} onClick={() => setPanel((p) => (p === 'console' ? null : 'console'))}>
            Console{errorCount ? ` (${errorCount} ⚠)` : ''}
          </Button>
        </div>
      </div>

      {bootNow.unassigned && (
        <div className="flex shrink-0 items-center gap-2 border-b border-sky-900/60 bg-sky-950/40 px-3 py-1.5 text-[11px] text-sky-200">
          <span className="font-semibold">A boot script saved by an earlier version is not tied to any game, so it does not run.</span>
          <span className="min-w-0 flex-1 truncate font-mono text-sky-100/80" title={bootNow.unassigned}>{bootNow.unassigned.trim().split('\n')[0]}</span>
          <Button variant="default" className="px-2 py-0.5 text-[11px]" onClick={adoptLegacyBoot}>Use for this game</Button>
          <Button variant="ghost" className="px-2 py-0.5 text-[11px]" onClick={dropLegacyBoot}>Discard</Button>
        </div>
      )}

      {uiHint && panel !== 'troubleshooter' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-rose-900/60 bg-rose-950/40 px-3 py-1.5 text-[11px] text-rose-200">
          <span className="font-semibold">UI troubleshooter found {uiHint.errors} problem{uiHint.errors === 1 ? '' : 's'}</span>
          {uiHint.warns > 0 && <span className="text-rose-300/80">(+{uiHint.warns} warning{uiHint.warns === 1 ? '' : 's'})</span>}
          <span className="min-w-0 flex-1 truncate text-rose-100/90" title={uiHint.top}>{uiHint.top}</span>
          <Button variant="default" className="px-2 py-0.5 text-[11px]" onClick={() => setPanel('troubleshooter')}>Investigate</Button>
          <button type="button" className="rounded px-1 text-rose-300/70 hover:text-rose-100" onClick={() => setUiHint(null)} title="Dismiss">×</button>
        </div>
      )}

      {dbgState.paused && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-900/40 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200">
          <span className="font-semibold">Paused</span>
          {dbgState.pausedAt && <span className="font-mono text-amber-300">{dbgState.pausedAt.path}:{dbgState.pausedAt.line}</span>}
          {dbgState.pauseReason === 'breakpoint' && <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">breakpoint</span>}
          {dbgState.pauseReason === 'exception' && dbgState.exception && <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">exception: {dbgState.exception.message.slice(0,80)}</span>}
          <span className="ml-auto flex items-center gap-1">
            <Button variant="primary" onClick={() => dbg.continue()} className="px-2 py-1 text-xs">Continue</Button>
            <Button onClick={() => dbg.stepOver()} className="px-2 py-1 text-xs">Over</Button>
            <Button onClick={() => dbg.stepInto()} className="px-2 py-1 text-xs">Into</Button>
            <Button onClick={() => dbg.stepOut()} className="px-2 py-1 text-xs">Out</Button>
          </span>
        </div>
      )}

      <MissingDependenciesBanner list={dependencies} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
      <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="Game stage"
          className="block outline-none"
          width={Math.round(size.w * dpr)}
          height={Math.round(size.h * dpr)}
          style={{ width: size.w, height: size.h }}
          onKeyDown={onKey(true)}
          onKeyUp={onKey(false)}
          onPointerMove={(e) => { const [x, y] = toStage(e); playerRef.current?.pointerMove(x, y); }}
          onPointerDown={(e) => { e.currentTarget.focus(); e.currentTarget.setPointerCapture?.(e.pointerId); const [x, y] = toStage(e); playerRef.current?.pointerDown(x, y); }}
          onPointerUp={(e) => { const [x, y] = toStage(e); playerRef.current?.pointerUp(x, y); }}
          onContextMenu={(e) => e.preventDefault()}
        />
        {dbgState.paused && <div className="pointer-events-none absolute inset-0 border-2 border-amber-500/40 bg-amber-500/5" />}
        {instructionsOpen && adapter.helpPanel && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={adapter.helpPanel.title}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4"
          >
            <section className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 text-zinc-100 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{adapter.helpPanel.title}</h2>
                  {adapter.helpPanel.subtitle && <p className="mt-1 text-xs text-zinc-400">{adapter.helpPanel.subtitle}</p>}
                </div>
                <button
                  type="button"
                  aria-label={`Close ${adapter.helpPanel.title}`}
                  className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  onClick={() => setInstructionsOpen(false)}
                >
                  ×
                </button>
              </div>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-200">
                {adapter.helpPanel.steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
              <div className="mt-5 flex justify-end">
                <Button variant="primary" onClick={() => setInstructionsOpen(false)}>{adapter.helpPanel.dismiss ?? 'Got it'}</Button>
              </div>
            </section>
          </div>
        )}
      </div>
      <RunningTimelinesSidebar doc={doc} timelines={runtimeTimelines} timelineNames={timelineMetadata} playing={playing && !dbgState.paused} project={project} displayTree={displayTree} onHighlight={handleHighlight} assets={assets} />
      </div>

      {showDebugger && (
        <div className="h-64 shrink-0 border-t border-zinc-800 lg:h-72">
          <DebugPanel />
        </div>
      )}

      {panel === 'console' && !showDebugger && <ExecutionConsole entries={consoleEntries} onClear={() => { setLogs([]); pendingLogs.current = []; }} servers={sessionInfo?.servers} rooms={sessionInfo?.rooms} />}

      {panel === 'program' && !showDebugger && (
        <div className="h-72 shrink-0 overflow-y-auto border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-300">
          {build.status === 'loading' && <div className="text-zinc-500">Transpiling…</div>}
          {build.status === 'failed' && <div className="text-rose-300">{build.error}</div>}
          {b && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Program</div>
                <div>{build.status === 'ready' ? build.sources.length : 0} .as file(s) → {b.files.size} TypeScript module(s)</div>
                <div>{Object.keys(b.program?.classes ?? {}).length} class(es), {Object.keys(b.program?.timelines ?? {}).length} timeline(s), {Object.keys(b.program?.buttons ?? {}).length} button(s)</div>
                <div className={b.errors.length ? 'text-rose-300' : 'text-emerald-300'}>{b.errors.length} error(s), {b.warnings.length} warning(s)</div>
                {b.errors.slice(0, 20).map((e, i) => <div key={i} className="mt-1 font-mono text-[10px] text-rose-300">{e.file}: {e.message}</div>)}
                <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Boot script</div>
                <textarea
                  aria-label="Boot script"
                  className="h-16 w-full rounded border border-zinc-700 bg-zinc-900 p-1.5 font-mono text-[10px] text-zinc-200"
                  placeholder="// runs on _root after frame 1, e.g. _root.gotoAndStop('game');"
                  value={boot}
                  onChange={(e) => setBoot(e.target.value)}
                />
                <Button className="mt-1" onClick={restart}>Restart with script</Button>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">External SWFs</div>
                {extEntries.length === 0 && <div className="mb-2 text-zinc-500">Only the main movie is loaded. Upload every SWF the game loads together with it.</div>}
                {extEntries.map((e) => {
                  const l = loadedExternals.find((x) => x.name === e.name);
                  return (
                    <div key={e.key} className="font-mono text-[10px]">
                      <span className={l ? (l.errors ? 'text-amber-300' : 'text-emerald-300') : 'text-zinc-400'}>{l ? '●' : '○'} {e.name}.swf</span>
                      <span className="text-zinc-500"> {l ? `loaded, ${l.ms} ms${l.errors ? `, ${l.errors} error(s)` : ''}` : 'not requested yet'}</span>
                    </div>
                  );
                })}
                <div className="mt-3"><MissingDependenciesPanel list={dependencies} /></div>
                <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Generated TypeScript</div>
                <select
                  aria-label="Generated module"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px]"
                  value={viewFile ?? ''}
                  onChange={(e) => setViewFile(e.target.value || null)}
                >
                  <option value="">Choose a module…</option>
                  {[...b.files.keys()].sort().map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                {viewFile && <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-900 p-2 font-mono text-[10px] leading-snug text-zinc-300">{b.files.get(viewFile)}</pre>}
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Display list</div>
                <pre className="font-mono text-[10px] leading-snug text-zinc-400">{tree.join('\n')}</pre>
              </div>
            </div>
          )}
        </div>
      )}
      {panel === 'console' && showDebugger && (
        <div className="h-40 shrink-0 overflow-hidden border-t border-zinc-800">
          <ExecutionConsole entries={consoleEntries} onClear={() => { setLogs([]); pendingLogs.current = []; }} servers={sessionInfo?.servers} rooms={sessionInfo?.rooms} />
        </div>
      )}
      {panel === 'program' && showDebugger && (
        <div className="h-48 shrink-0 overflow-y-auto border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-300">
          <div className="text-zinc-500">Program panel is hidden while Debugger is open — close Debugger or check Console.</div>
        </div>
      )}
      {panel === 'troubleshooter' && (
        <div className={showDebugger ? 'h-72 shrink-0 border-t border-zinc-800' : 'h-80 shrink-0 border-t border-zinc-800'}>
          <UiTroubleshooter
            getPlayer={() => playerRef.current}
            canvasRef={canvasRef}
            fontIds={fontIds ?? NO_FONTS}
            epoch={playerEpoch}
            onSendToConsole={appendTroubleshooterFindings}
            onFocus={handleHighlight}
            onClose={() => setPanel(null)}
          />
        </div>
      )}
    </div>
  );

  if (executePopout.isPopped) {
    return (
      <>
        <div className="flex h-full min-h-0 w-full flex-col items-center justify-center bg-zinc-950 p-8 text-center">
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-6 py-8">
            <div className="text-sm font-semibold text-sky-200">Execute Engine is popped out</div>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">The stage is now in a separate window so you can place it side by side with the Code Inspector.</p>
            <Button variant="primary" onClick={executePopout.close} className="mt-4">↙ Restore Execute</Button>
          </div>
        </div>
        {executePopout.portal(inner)}
      </>
    );
  }

  return inner;
}
