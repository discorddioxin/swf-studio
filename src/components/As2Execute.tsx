// Execute for ActionScript 1/2 games (SWF ≤ 8): the FFDec script export in
// the loaded folder is transpiled with as2ts, compiled and run on the AS2
// player (src/engine/as2) against the parsed SWF document.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetCache, SwfPackage } from '../lib/assets';
import type { AssetBundle, SwfDocument } from '../types';
import { cn } from '../utils/cn';
import { Button } from './ui';
import type { LogEntry } from '../engine/flash/player';
import { AS2Player, type Movie } from '../engine/as2/player';
import { createExternalResolver, swfNameOf, type ExternalSwf } from '../engine/as2/externals';
import { buildAS2Program, type AS2Build } from '../engine/as2/program';
import { AS2AudioBackend, embeddedFontFamily, registerFonts, soundFilesOf } from '../engine/as2/audio';
import { gsiStubFetchText } from '../lib/gsiStub';

const MAX_LOG = 500;
const BOOT_KEY = 'swf-studio.as2.boot';

/** Boot scripts run on _root after frame 1 (plain JavaScript; `_root` and `player` are in scope). */
const BOOT_PRESETS: { id: string; label: string; code: string; hint: string }[] = [
  { id: 'none', label: 'None', code: '', hint: 'Start exactly like the SWF does.' },
  {
    id: 'gaia-guest', label: 'Gaia: play as guest', code: '_root.playAsGuest = true;\n_root.startGameSingle();',
    hint: "Uses the game's own guest mode to skip the GSECS login server (gsecs2.9.swf), which cannot be reached offline.",
  },
];

export const isAs2Bundle = (doc: SwfDocument, assets: AssetBundle | null) =>
  !!assets?.files.some((f) => /\.as$/i.test(f.path)) && (Number(doc.header.version ?? 0) <= 8 || !doc.symbolClasses?.size);

type BuildState = { status: 'loading' } | { status: 'ready'; build: AS2Build; sourceCount: number } | { status: 'failed'; error: string };

/** An external SWF export with its key (used for its fonts). */
interface ExternalEntry { pkg: SwfPackage; name: string; key: string }

export function As2Execute({ doc, cache, assets, externals = [] }: { doc: SwfDocument; cache: AssetCache; assets: AssetBundle | null; externals?: SwfPackage[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<AS2Player | null>(null);
  const audioRef = useRef<AS2AudioBackend | null>(null);
  const extAudioRef = useRef<AS2AudioBackend[]>([]);
  const playingRef = useRef(true);
  const [build, setBuild] = useState<BuildState>({ status: 'loading' });
  const [session, setSession] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [panel, setPanel] = useState<'console' | 'program' | null>('console');
  const [hud, setHud] = useState({ frame: 1, total: 1, label: null as string | null, time: 0 });
  const [tree, setTree] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [boot, setBoot] = useState<string>(() => { try { return localStorage.getItem(BOOT_KEY) ?? ''; } catch { return ''; } });
  const [fontIds, setFontIds] = useState<Set<number>>(new Set());
  /** registered embedded fonts of the external SWFs, per key */
  const [extFontIds, setExtFontIds] = useState<Map<string, Set<number>>>(new Map());
  const [loadedExternals, setLoadedExternals] = useState<{ name: string; ms: number; errors: number }[]>([]);
  const extEntries = useMemo<ExternalEntry[]>(() => externals.map((pkg, i) => {
    const name = swfNameOf(pkg.bundle.xmlName || pkg.doc.header.fileName || `external${i}`);
    return { pkg, name, key: `x${i}-${name.replace(/[^a-z0-9]+/gi, '_')}` };
  }), [externals]);
  const [viewFile, setViewFile] = useState<string | null>(null);
  const pendingLogs = useRef<LogEntry[]>([]);

  useEffect(() => { try { localStorage.setItem(BOOT_KEY, boot); } catch { /* storage unavailable */ } }, [boot]);

  // ---- transpile + compile the .as export (once per bundle)
  useEffect(() => {
    let cancelled = false;
    setBuild({ status: 'loading' });
    const files = (assets?.files ?? []).filter((f) => /\.as$/i.test(f.path));
    Promise.all(files.map(async (f) => ({ path: f.path, text: await readText(f.file) })))
      .then((sources) => {
        if (cancelled) return;
        // class bodies register on _global while linking; the player re-registers them after its reset
        setBuild({ status: 'ready', build: buildAS2Program(sources), sourceCount: sources.length });
      })
      .catch((e) => { if (!cancelled) setBuild({ status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    const fontsController = new AbortController();
    registerFonts(assets?.files ?? [], undefined, fontsController.signal).then((ids) => { if (!cancelled) setFontIds(ids); });
    return () => { cancelled = true; fontsController.abort(); };
  }, [assets]);

  useEffect(() => {
    let cancelled = false;
    const fontsController = new AbortController();
    Promise.all(extEntries.map(async (e) => [e.key, await registerFonts(e.pkg.bundle.files, e.key, fontsController.signal)] as const))
      .then((pairs) => { if (!cancelled) setExtFontIds(new Map(pairs)); });
    return () => { cancelled = true; fontsController.abort(); };
  }, [extEntries]);

  // Embedded fonts: by character id in the movie that uses it; by name in the calling movie,
  // then the main movie, then any loaded SWF (text formats only carry the font name).
  const fontFamily = useCallback((f: number | string, movie?: Movie) => {
    const libs: { doc: SwfDocument; key?: string; ids: Set<number> }[] = [
      { doc, ids: fontIds },
      ...extEntries.map((e) => ({ doc: e.pkg.doc, key: e.key, ids: extFontIds.get(e.key) ?? new Set<number>() })),
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

  // ---- a player per (document, build, restart)
  useEffect(() => {
    if (build.status !== 'ready') return;
    pendingLogs.current = [];
    setLogs([]);
    const audio = new AS2AudioBackend(cache, soundFilesOf(assets?.files ?? []));
    audio.muted = muted;
    audioRef.current = audio;
    // SWFs the game loads at run time: each export in the folder besides the main movie
    const extAudio = extEntries.map((e) => { const a = new AS2AudioBackend(e.pkg.cache, soundFilesOf(e.pkg.bundle.files)); a.muted = muted; return a; });
    extAudioRef.current = extAudio;
    setLoadedExternals([]);
    const swfs: ExternalSwf[] = extEntries.map((e, i) => ({
      name: e.name, key: e.key, doc: e.pkg.doc, assets: e.pkg.cache, audio: extAudio[i],
      sources: () => Promise.all(e.pkg.bundle.files.filter((f) => /\.as$/i.test(f.path)).map(async (f) => ({ path: f.path, text: await readText(f.file) }))),
    }));
    let playerForLog: AS2Player | null = null;
    const resolveExternal = createExternalResolver(swfs, {
      onBuild: (swf, b, ms) => {
        setLoadedExternals((l) => [...l, { name: swf.name, ms, errors: b.errors.length }]);
        playerForLog?.log('info', `loaded external SWF ${swf.name}: ${b.files.size} modules transpiled in ${ms} ms`);
        for (const e of b.errors) playerForLog?.log('error', `as2ts (${swf.name}): ${e.file}: ${e.message}`);
      },
      onError: (swf, e) => playerForLog?.log('error', `external SWF ${swf.name}: ${e.message}`),
    });
    const bootCode = boot.trim();
    const player = new AS2Player({
      doc,
      program: build.build.program,
      assets: cache,
      audio,
      fontFamily,
      resolveExternal,
      missingExternal: 'empty',
      onLog: (entry) => {
        pendingLogs.current.push(entry);
        if (entry.level === 'error') console.error('[game]', entry.message, entry.detail ?? '');
      },
      // Offline GSI stub: the game's inventory/room/score requests against
      // gaiaonline.com are answered locally (25× every bait, all rods).
      fetchText: (url, method, body) =>
        gsiStubFetchText(url, method, body, (level, message, detail) => player.log(level, message, detail ?? '')),
      afterStart: bootCode ? (root, p) => {
        p.log('info', 'running boot script');
        new Function('_root', 'player', bootCode)(root, p);
      } : undefined,
    });
    for (const e of build.build.errors) player.log('error', `as2ts: ${e.file}: ${e.message}`);
    playerForLog = player;
    if (swfs.length) player.log('info', `external SWFs available: ${swfs.map((s) => s.name).join(', ')}`);
    playerRef.current = player;
    player.start();
    canvasRef.current?.focus({ preventScroll: true });
    return () => {
      player.dispose(); audio.dispose(); extAudio.forEach((a) => a.dispose());
      if (playerRef.current === player) playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, cache, build, session, fontFamily, extEntries]);

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
  }, [panel]);

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
      if (player) {
        if (playingRef.current) player.advanceBy(dt);
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
        if (now - lastHud > 200) {
          lastHud = now;
          const root = player.root;
          setHud({ frame: root.frame + 1, total: root.totalFrames, label: root.timeline?.frames[root.frame]?.label ?? null, time: player.time() });
          if (panelRef.current === 'program') setTree(player.tree());
          setMissing((m) => (m.length === player.missingExternals.size ? m : [...player.missingExternals]));
          if (pendingLogs.current.length) {
            const batch = pendingLogs.current;
            pendingLogs.current = [];
            setLogs((prev) => [...prev, ...batch].slice(-MAX_LOG));
          }
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
    if (down) playerRef.current?.keyDown(e.keyCode, e.key); else playerRef.current?.keyUp(e.keyCode);
  };

  const togglePlay = () => { playingRef.current = !playingRef.current; setPlaying(playingRef.current); canvasRef.current?.focus(); };
  const step = () => { playingRef.current = false; setPlaying(false); const p = playerRef.current; if (p) { p.tick(); } };
  const restart = () => { setSession((s) => s + 1); canvasRef.current?.focus(); };

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const shownLogs = errorsOnly ? logs.filter((l) => l.level === 'error') : logs;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const b = build.status === 'ready' ? build.build : null;
  const preset = BOOT_PRESETS.find((p) => p.code === boot.trim()) ?? null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-zinc-950">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100">Execute</div>
          <div className="truncate text-[10px] text-zinc-500">
            {build.status === 'loading' ? 'Transpiling ActionScript…' : build.status === 'failed' ? 'Could not read the scripts'
              : `AS2 engine · ${build.sourceCount} script(s) · frame ${hud.frame}/${hud.total}${hud.label ? ` “${hud.label}”` : ''} · ${(hud.time / 1000).toFixed(1)}s`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <label className="flex items-center gap-1 text-[10px] text-zinc-400" title={preset?.hint ?? 'Custom boot script'}>
            Start
            <select
              aria-label="Start mode"
              className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-200"
              value={preset?.id ?? 'custom'}
              onChange={(e) => { const p = BOOT_PRESETS.find((x) => x.id === e.target.value); if (p) { setBoot(p.code); setSession((s) => s + 1); } }}
            >
              {BOOT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              {!preset && <option value="custom">Custom script</option>}
            </select>
          </label>
          <Button variant={playing ? 'primary' : 'default'} onClick={togglePlay} title="Play / pause the game">{playing ? '❚❚ Pause' : '▶ Play'}</Button>
          <Button onClick={step} title="Pause and advance exactly one frame">Step</Button>
          <Button onClick={restart} title="Start again from frame 1">Restart</Button>
          <Button variant={muted ? 'default' : 'ghost'} onClick={() => setMuted((m) => !m)} title="Mute new sounds">{muted ? 'Muted' : 'Sound'}</Button>
          <Button variant={panel === 'program' ? 'primary' : 'ghost'} onClick={() => setPanel((p) => (p === 'program' ? null : 'program'))}>
            Program{missing.length || b?.errors.length ? ' ⚠' : ''}
          </Button>
          <Button variant={panel === 'console' ? 'primary' : 'ghost'} onClick={() => setPanel((p) => (p === 'console' ? null : 'console'))}>
            Console{errorCount ? ` (${errorCount} ⚠)` : ''}
          </Button>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="shrink-0 border-b border-amber-900/60 bg-amber-950/40 px-3 py-1.5 text-[11px] text-amber-200">
          The game loads {missing.length} external SWF{missing.length > 1 ? 's' : ''} that {missing.length > 1 ? 'are' : 'is'} not in the loaded folder
          ({missing.slice(0, 4).map((m) => m.split('/').pop()).join(', ')}{missing.length > 4 ? ', …' : ''}). Those parts stay empty. See Program for details.
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
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {panel === 'console' && (
        <div className="h-44 shrink-0 border-t border-zinc-800">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Console · trace() and errors ({logs.length})</span>
            <div className="flex gap-3">
              <button className={cn('text-[10px] hover:text-zinc-300', errorsOnly ? 'text-rose-300' : 'text-zinc-600')} onClick={() => setErrorsOnly((v) => !v)}>errors only</button>
              <button className="text-[10px] text-zinc-600 hover:text-zinc-300" onClick={() => setLogs([])}>clear</button>
            </div>
          </div>
          <div className="h-[calc(100%-1.75rem)] overflow-y-auto px-3 py-1.5 font-mono text-[10px] leading-relaxed">
            {shownLogs.length === 0 && <span className="text-zinc-600">No output yet. trace() calls and runtime errors from the game appear here.</span>}
            {shownLogs.map((l, i) => (
              <div key={i} title={l.detail} className={cn('whitespace-pre-wrap', l.level === 'error' ? 'text-rose-300' : l.level === 'warn' ? 'text-amber-300' : l.level === 'trace' ? 'text-zinc-200' : 'text-sky-300')}>
                <span className="text-zinc-600">{(l.time / 1000).toFixed(2)}s </span>{l.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {panel === 'program' && (
        <div className="h-72 shrink-0 overflow-y-auto border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-300">
          {build.status === 'loading' && <div className="text-zinc-500">Transpiling…</div>}
          {build.status === 'failed' && <div className="text-rose-300">{build.error}</div>}
          {b && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Program</div>
                <div>{build.status === 'ready' ? build.sourceCount : 0} .as file(s) → {b.files.size} TypeScript module(s)</div>
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
                {extEntries.length === 0 && <div className="mb-2 text-zinc-500">Only the main movie is loaded. Put the FFDec export of every SWF the game loads in the same folder (one sub-folder each).</div>}
                {extEntries.map((e) => {
                  const l = loadedExternals.find((x) => x.name === e.name);
                  return (
                    <div key={e.key} className="font-mono text-[10px]">
                      <span className={l ? (l.errors ? 'text-amber-300' : 'text-emerald-300') : 'text-zinc-400'}>{l ? '●' : '○'} {e.name}.swf</span>
                      <span className="text-zinc-500"> {l ? `loaded, ${l.ms} ms${l.errors ? `, ${l.errors} error(s)` : ''}` : 'not requested yet'}</span>
                    </div>
                  );
                })}
                <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Missing external SWFs</div>
                {missing.length === 0 && <div className="text-zinc-500">None requested so far.</div>}
                {missing.map((m) => <div key={m} className="font-mono text-[10px] text-amber-300">{m}</div>)}
                {missing.length > 0 && (
                  <div className="mt-1 text-[10px] text-zinc-500">
                    These are loaded at runtime by loadMovie / MovieClipLoader. Export each with FFDec and add it to play those parts.
                  </div>
                )}
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
