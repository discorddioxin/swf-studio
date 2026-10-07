// Execute: plays the loaded game. AS1/AS2 games (FFDec .as export) are
// delegated to As2Execute. For AS3: the SWF dump supplies the symbols,
// timelines and SymbolClass linkage; the game's AS3 code (transpiled to
// TypeScript and included in the loaded folder) is compiled in the browser
// and run on the flash.* engine in src/engine/flash.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetCache, SwfPackage } from '../lib/assets';
import type { AssetBundle, Project, SwfDocument } from '../types';
import { Button } from './ui';
import { ExecutionConsole } from './ExecutionConsole';
import { useExecutionDiagnostics } from './useExecutionDiagnostics';
import { compileSources, expectedClasses, isCodeFile, linkProgram, mergeSources, type CompiledSources, type LinkedProgram } from '../engine/flash/loader';
import { FlashPlayer, HtmlAudioBackend, type LogEntry } from '../engine/flash/player';
import type { AudioBackend } from '../engine/flash/media';
import { DisplayObject, MovieClip } from '../engine/flash/display';
import { As2Execute, isAs2Bundle } from './As2Execute';

type CodeState =
  | { status: 'loading' }
  | { status: 'failed'; error: string }
  | {
    status: 'ready'; compiled: CompiledSources; classes: LinkedProgram['classes'];
    displayClasses: string[];
    /** Module evaluation and import-resolution failures from the linker. */
    linkErrors: LinkedProgram['errors'];
    /** dependency SWFs whose code was folded in because the main movie alone could not link */
    dependencies: string[];
  };

const MAX_LOG = 500;

export function ExecuteTab({ externals, project, ...props }: { doc: SwfDocument; cache: AssetCache; assets: AssetBundle | null; project?: Project; externals?: SwfPackage[] }) {
  // ActionScript 1/2 exports (SWF ≤ 8, .as scripts) run on the AS2 player, which
  // loads a dependency SWF when the game asks for it by URL; AS3 code runs on
  // the flash.* engine, where the dependencies contribute their classes.
  return isAs2Bundle(props.doc, props.assets)
    ? <As2Execute {...props} project={project} externals={externals} />
    : <As3Execute {...props} externals={externals} />;
}

function As3Execute({ doc, cache, assets, externals = [] }: { doc: SwfDocument; cache: AssetCache; assets: AssetBundle | null; externals?: SwfPackage[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<FlashPlayer | null>(null);
  const playingRef = useRef(true);
  const mutedRef = useRef(false);
  const [code, setCode] = useState<CodeState>({ status: 'loading' });
  const [session, setSession] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [docClass, setDocClass] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [panel, setPanel] = useState<'console' | 'program' | null>('console');
  const [hud, setHud] = useState({ frame: 1, total: 1, label: '' as string | null, time: 0 });
  const [linkage, setLinkage] = useState<FlashPlayer['linkage']>([]);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const pendingLogs = useRef<LogEntry[]>([]);
  const executionFaultRef = useRef(false);
  const appendGlobalProblem = useCallback((entry: LogEntry) => {
    setLogs((previous) => [...previous, entry].slice(-MAX_LOG));
  }, []);
  useExecutionDiagnostics(appendGlobalProblem);

  /** Dependency SWFs (everything loaded besides the main one) and their code files. */
  const dependencyFiles = useMemo(() => externals
    .map((pkg) => ({
      name: pkg.bundle.xmlName || pkg.doc.header.fileName || 'dependency.swf',
      files: pkg.bundle.files.filter((f) => isCodeFile(f.path)),
    }))
    .filter((dependency) => dependency.files.length > 0), [externals]);
  const dependencyKey = dependencyFiles.map((d) => `${d.name}:${d.files.length}`).join('|');

  // ---- compile the transpiled code in the bundle (once per bundle)
  useEffect(() => {
    let cancelled = false;
    setCode({ status: 'loading' });
    const read = async (f: { path: string; file: File }) => ({ path: f.path, text: await readText(f.file) });
    const files = (assets?.files ?? []).filter((f) => isCodeFile(f.path));
    Promise.all(files.map(read))
      .then(async (mainSources) => {
        if (cancelled) return;
        let compiled = compileSources(mainSources);
        // A throwaway link: it lists classes for the document-class picker and
        // shows whether the main movie's own code is complete.
        let probe = linkProgram(compiled);
        // A SWF the game loads at run time may hold classes the main movie
        // imports (a shared library SWF, or the other half of a split game), so
        // fold its code in when — and only when — the main movie alone falls
        // short: unresolved imports, or a SymbolClass with no class behind it.
        let dependencies: string[] = [];
        const wanted = expectedClasses(doc);
        const unresolved = (linked: LinkedProgram) => wanted.filter((name) => !linked.getDefinition(name)).length;
        if (dependencyFiles.length && (probe.errors.length > 0 || unresolved(probe) > 0)) {
          const readDependencies = await Promise.all(dependencyFiles.map(async (dependency) => ({
            name: dependency.name,
            files: await Promise.all(dependency.files.map(read)),
          })));
          if (cancelled) return;
          const withDependencies = mergeSources(mainSources, readDependencies);
          if (withDependencies.used.length) {
            const retryCompiled = compileSources(withDependencies.sources);
            const retry = linkProgram(retryCompiled);
            // Keep the retry only if it is at least as healthy as the main-only link.
            if (retry.errors.length <= probe.errors.length && unresolved(retry) <= unresolved(probe)) {
              compiled = retryCompiled;
              probe = retry;
              dependencies = withDependencies.used;
            }
          }
        }
        const displayClasses = probe.classes
          .filter((c) => { const d = probe.getDefinition(c.qualifiedName); return typeof d === 'function' && d.prototype instanceof DisplayObject; })
          .map((c) => c.qualifiedName);
        setCode({ status: 'ready', compiled, classes: probe.classes, displayClasses, dependencies, linkErrors: probe.errors });
      })
      .catch((e) => {
        if (!cancelled) setCode({ status: 'failed', error: `Could not read the code files: ${e instanceof Error ? e.message : String(e)}` });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, dependencyKey]);

  useEffect(() => { setDocClass(null); }, [doc]);

  // ---- create a player per (document, code, restart)
  useEffect(() => {
    if (code.status !== 'ready') return;
    executionFaultRef.current = false;
    pendingLogs.current = [];
    setLogs([]);
    const audio = new HtmlAudioBackend(cache);
    const gatedAudio: AudioBackend = { play: (...args) => (mutedRef.current ? null : audio.play(...args)) };
    const player = new FlashPlayer({
      doc,
      assets: cache,
      audio: gatedAudio,
      program: code.compiled.modules.length ? () => linkProgram(code.compiled) : null,
      documentClass: docClass,
      onLog: (entry) => {
        pendingLogs.current.push(entry);
        if (entry.level === 'error') console.error('[game]', entry.message, entry.detail ?? '');
      },
    });
    if (code.dependencies.length) {
      pendingLogs.current.push({
        level: 'info',
        message: `linked code from dependency SWF${code.dependencies.length === 1 ? '' : 's'}: ${code.dependencies.join(', ')}`,
        detail: 'The main SWF alone did not define every class it links to, so the dependency SWFs in the load supplied them.',
        time: 0,
      });
    }
    playerRef.current = player;
    setLinkage([...player.linkage]);
    player.start();
    canvasRef.current?.focus({ preventScroll: true });
    return () => { player.dispose(); if (playerRef.current === player) playerRef.current = null; };
  }, [doc, cache, code, docClass, session]);

  // ---- fit the canvas to the panel
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: Math.max(100, el.clientWidth), h: Math.max(100, el.clientHeight) });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [panel]);

  const view = useMemo(() => {
    const sw = (doc.header.stage.xMax - doc.header.stage.xMin) / 20 || 550;
    const sh = (doc.header.stage.yMax - doc.header.stage.yMin) / 20 || 400;
    const scale = Math.min(size.w / sw, size.h / sh);
    return { scale, x: (size.w - sw * scale) / 2, y: (size.h - sh * scale) / 2 };
  }, [doc, size]);
  const viewRef = useRef(view);
  viewRef.current = view;

  // ---- main loop: advance player time and repaint every animation frame
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
          if (playingRef.current) player.tick(dt);
          const ctx = canvas?.getContext('2d');
          if (ctx && canvas) {
            const dpr = window.devicePixelRatio || 1;
            const v = viewRef.current;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#09090b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            player.render(ctx, v.scale * dpr, v.x * dpr, v.y * dpr);
            canvas.style.cursor = player.cursor;
          }
          if (now - lastHud > 150) {
            lastHud = now;
            const root = player.root;
            const clip = root instanceof MovieClip ? root : null;
            setHud({ frame: clip?.currentFrame ?? 1, total: clip?.totalFrames ?? 1, label: clip?.currentLabel ?? null, time: player.time });
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
          player.reportError(error, 'Execute animation/render loop', 'engine');
          const batch = pendingLogs.current;
          pendingLogs.current = [];
          if (batch.length) setLogs((prev) => [...prev, ...batch].slice(-MAX_LOG));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- input
  const toStage = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [(e.clientX - rect.left - v.x) / v.scale, (e.clientY - rect.top - v.y) / v.scale] as const;
  }, []);
  const onKey = (down: boolean) => (e: React.KeyboardEvent) => {
    if (e.metaKey) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Backspace'].includes(e.key)) e.preventDefault();
    const payload = { keyCode: e.keyCode, key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, location: e.location };
    if (down) playerRef.current?.keyDown(payload); else playerRef.current?.keyUp(payload);
  };

  const togglePlay = () => { playingRef.current = !playingRef.current; setPlaying(playingRef.current); canvasRef.current?.focus(); };
  const step = () => { playingRef.current = false; setPlaying(false); playerRef.current?.step(); };
  const restart = () => { setSession((s) => s + 1); canvasRef.current?.focus(); };
  const toggleMute = () => { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); };

  const hasCode = code.status === 'ready' && code.compiled.modules.length > 0;
  const docLink = linkage.find((l) => l.id === 0);
  const unlinked = linkage.filter((l) => !l.linked);
  const compileErrors = code.status === 'ready' ? code.compiled.modules.filter((m) => m.error) : [];
  const forgeProblems: LogEntry[] = code.status === 'ready' ? [
    ...code.linkErrors.map((issue) => ({
      level: 'error' as const, kind: 'problem' as const, source: 'forge' as const,
      context: issue.path, message: `${issue.path}: ${issue.message}`, time: 0,
    })),
    ...unlinked.filter((item) => item.id !== 0).map((item) => ({
      level: 'warn' as const, kind: 'problem' as const, source: 'forge' as const,
      context: `SymbolClass ${item.id}`, message: `Class ${item.className} is declared by the SWF but is missing from the loaded code.`, time: 0,
    })),
  ] : code.status === 'failed' ? [{
    level: 'error', kind: 'problem', source: 'forge', context: 'reading code files', message: code.error, time: 0,
  }] : [];
  const consoleEntries = [...forgeProblems, ...logs];
  const errorCount = consoleEntries.filter((entry) => entry.level === 'error').length;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-zinc-950">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100">Execute</div>
          <div className="truncate text-[10px] text-zinc-500">
            {code.status === 'loading' ? 'Compiling game code…' : code.status === 'failed' ? 'Could not read game code'
              : hasCode ? `AS3 engine · ${docLink?.linked ? docLink.className : 'timeline root'} · frame ${hud.frame}/${hud.total}${hud.label ? ` “${hud.label}”` : ''} · ${(hud.time / 1000).toFixed(1)}s`
                : `Timeline only · frame ${hud.frame}/${hud.total}${hud.label ? ` “${hud.label}”` : ''}`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant={playing ? 'primary' : 'default'} onClick={togglePlay} title="Play / pause the game">{playing ? '❚❚ Pause' : '▶ Play'}</Button>
          <Button onClick={step} title="Pause and advance exactly one frame">Step</Button>
          <Button onClick={restart} title="Reload the game code and start again from frame 1">Restart</Button>
          <Button variant={muted ? 'default' : 'ghost'} onClick={toggleMute} title="Mute new sounds">{muted ? 'Muted' : 'Sound'}</Button>
          <Button variant={panel === 'program' ? 'primary' : 'ghost'} onClick={() => setPanel((p) => (p === 'program' ? null : 'program'))}>
            Program{unlinked.length || compileErrors.length ? ' ⚠' : ''}
          </Button>
          <Button variant={panel === 'console' ? 'primary' : 'ghost'} onClick={() => setPanel((p) => (p === 'console' ? null : 'console'))}>
            Console{errorCount ? ` (${errorCount} ⚠)` : ''}
          </Button>
        </div>
      </div>

      {code.status === 'ready' && !hasCode && (
        <div className="shrink-0 border-b border-amber-900/60 bg-amber-950/40 px-3 py-1.5 text-[11px] text-amber-200">
          No transpiled code (.ts / .js) was found in the loaded folder, so only the SWF timeline plays: no game logic, input handling or frame scripts.
          Add the game's TypeScript files to the folder and reload to run it.
        </div>
      )}

      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
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
          onPointerLeave={() => playerRef.current?.pointerLeave()}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {panel === 'console' && <ExecutionConsole entries={consoleEntries} onClear={() => setLogs([])} />}

      {panel === 'program' && (
        <div className="h-56 shrink-0 overflow-y-auto border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-300">
          {code.status === 'loading' && <div className="text-zinc-500">Compiling…</div>}
          {code.status === 'failed' && <div className="text-rose-300">{code.error}</div>}
          {code.status === 'ready' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Code</div>
                <div>{code.compiled.modules.length} file(s) compiled, {code.classes.length} class(es) exported.</div>
                {code.dependencies.length > 0 && (
                  <div className="mt-1 text-zinc-500">
                    Includes the code of dependency SWF{code.dependencies.length === 1 ? '' : 's'}: {code.dependencies.join(', ')}
                  </div>
                )}
                {compileErrors.map((m) => <div key={m.path} className="mt-1 font-mono text-[10px] text-rose-300">{m.path}: {m.error}</div>)}
                <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Document class</div>
                <select
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                  value={docClass ?? ''}
                  onChange={(e) => setDocClass(e.target.value || null)}
                >
                  <option value="">{doc.symbolClasses?.get(0) ? `From SWF: ${doc.symbolClasses.get(0)}` : 'None (plain timeline root)'}</option>
                  {code.displayClasses.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">SymbolClass linkage</div>
                {linkage.length === 0 && <div className="text-zinc-500">The SWF declares no SymbolClass entries.</div>}
                <table className="w-full font-mono text-[10px]">
                  <tbody>
                    {linkage.map((l) => (
                      <tr key={l.id} className={l.linked ? 'text-zinc-300' : 'text-amber-300'}>
                        <td className="pr-2 text-zinc-500">{l.id === 0 ? 'doc' : `#${l.id}`}</td>
                        <td className="pr-2">{l.className}</td>
                        <td>{l.linked ? '✓ linked' : '✗ class not found'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
