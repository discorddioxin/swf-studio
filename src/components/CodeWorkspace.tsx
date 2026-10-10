import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDebugger, useDebuggerState } from '../debug/store';
import { DebugPanel } from '../debug/DebugPanel';
import { usePopout } from '../debug/Popout';
import type { AssetBundle, Project, SwfDocument } from '../types';
import { useAS2Project } from '../engine/as2/useAS2Build';
import { buildWorkbenchTimelineMetadata } from '../engine/as2/workbenchMetadata';
import { triggerDownload } from '../lib/exporter';
import { createTypeScriptArchive } from '../lib/typescriptExport';
import { disassembleAVM1Source } from '../lib/avm1Disassembly';
import { cn } from '../utils/cn';

type ProjectMode = 'typescript' | 'actionscript';
type TypeScriptArea = 'engine' | 'application';
type CodeFile = {
  path: string;
  text: string;
  language: 'typescript' | 'actionscript';
  area: TypeScriptArea | 'actionscript';
};
type TreeRow = { kind: 'folder' | 'file'; path: string; name: string; depth: number };

const engineModules = {
  ...import.meta.glob<string>('../engine/as2/**/*.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../runtime/as2/**/*.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../../transpiler/as2/**/*.ts', { eager: true, query: '?raw', import: 'default' }),
};

function engineProjectFiles(): CodeFile[] {
  return Object.entries(engineModules)
    .filter(([path]) => !path.includes('/__tests__/') && !/\.(?:test|dev\.test)\.ts$/.test(path))
    .map(([key, text]) => {
      const relative = key.replace(/^(?:\.\.\/)+/, '');
      const path = relative.startsWith('engine/as2/') || relative.startsWith('runtime/as2/')
        ? `src/${relative}`
        : relative;
      return { path, text: String(text), language: 'typescript' as const, area: 'engine' as const };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

const ENGINE_FILES = engineProjectFiles();
const KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'do',
  'else', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements',
  'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'of', 'private', 'protected', 'public',
  'readonly', 'return', 'set', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof',
  'undefined', 'var', 'void', 'while', 'with', 'yield', 'number', 'string', 'boolean',
]);
const TOKEN = /(\/\/.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b)/g;

function highlight(line: string) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(line))) {
    if (match.index > cursor) parts.push(<span key={index++}>{line.slice(cursor, match.index)}</span>);
    const token = match[0];
    const className = token.startsWith('//') || token.startsWith('/*')
      ? 'text-zinc-500 italic'
      : /^["'`]/.test(token)
        ? 'text-emerald-300'
        : /^\d/.test(token)
          ? 'text-orange-300'
          : KEYWORDS.has(token)
            ? 'text-violet-300'
            : undefined;
    parts.push(className ? <span key={index++} className={className}>{token}</span> : <span key={index++}>{token}</span>);
    cursor = TOKEN.lastIndex;
  }
  if (cursor < line.length) parts.push(<span key={index}>{line.slice(cursor)}</span>);
  return parts.length ? parts : ' ';
}

function makeTreeRows(files: CodeFile[]): TreeRow[] {
  const rows: TreeRow[] = [];
  const folders = new Set<string>();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = file.path.split('/').filter(Boolean);
    for (let depth = 0; depth < parts.length - 1; depth++) {
      const path = parts.slice(0, depth + 1).join('/');
      if (folders.has(path)) continue;
      folders.add(path);
      rows.push({ kind: 'folder', path, name: parts[depth], depth });
    }
    rows.push({ kind: 'file', path: file.path, name: parts[parts.length - 1] ?? file.path, depth: parts.length - 1 });
  }
  return rows;
}

function ProjectButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium transition',
        active ? 'bg-violet-500/15 text-violet-100 ring-1 ring-violet-400/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100',
      )}
    >{children}</button>
  );
}

export function CodeWorkspace({ assets, doc, project, projectName, onRun }: {
  assets: AssetBundle | null;
  doc: SwfDocument;
  project: Project;
  projectName: string;
  onRun?: () => void;
}) {
  const timelineMetadata = useMemo(() => buildWorkbenchTimelineMetadata(doc, project), [doc, project]);
  const projectState = useAS2Project(assets, timelineMetadata);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [mode, setMode] = useState<ProjectMode>('typescript');
  const [area, setArea] = useState<TypeScriptArea>('application');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [showRawActionBytes, setShowRawActionBytes] = useState(false);
  const [showDebugger, setShowDebugger] = useState(false);
  const searchTextCache = useRef(new WeakMap<CodeFile, string>());
  const dbg = useDebugger();
  const dbgState = useDebuggerState();
  const inspectorPopout = usePopout({ title: 'Code Inspector — SWF Studio', width: 1100, height: 750 });
  const codeScrollRef = useRef<HTMLDivElement>(null);

  const appFiles = useMemo<CodeFile[]>(() => projectState.status === 'ready'
    ? [...projectState.project.files.entries()]
      .filter(([path]) => path.endsWith('.ts'))
      .map(([path, text]) => ({ path, text, language: 'typescript', area: 'application' }))
    : [], [projectState]);
  const actionScriptFiles = useMemo<CodeFile[]>(() => projectState.status === 'ready'
    ? projectState.sources.map((source) => ({
      path: source.path,
      text: source.text,
      language: 'actionscript',
      area: 'actionscript',
    }))
    : [], [projectState]);
  const files = mode === 'actionscript' ? actionScriptFiles : area === 'engine' ? ENGINE_FILES : appFiles;
  const projectKey = mode === 'actionscript' ? 'actionscript' : area;
  const preferredPath = projectKey === 'application'
    ? (files.some((file) => file.path === 'index.ts') ? 'index.ts' : files[0]?.path)
    : projectKey === 'engine'
      ? (files.some((file) => file.path === 'src/engine/as2/player.ts') ? 'src/engine/as2/player.ts' : files[0]?.path)
      : files[0]?.path;
  const activePath = selected[projectKey] ?? preferredPath ?? '';
  const activeFile = files.find((file) => file.path === activePath) ?? files[0] ?? null;
  const activeAVM1 = useMemo(() => mode === 'actionscript' && activeFile?.language === 'actionscript'
    ? disassembleAVM1Source(activeFile.text)
    : null, [mode, activeFile]);
  const editorText = activeAVM1 && !showRawActionBytes ? activeAVM1.text : activeFile?.text ?? '';
  const activeTSHasAVM1 = activeFile?.language === 'typescript' && /\bavm1Actions\s*\(/.test(activeFile.text);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = query ? files.filter((file) => {
      if (file.path.toLowerCase().includes(query)) return true;
      let searchableText = searchTextCache.current.get(file);
      if (searchableText === undefined) {
        // AVM1 blocks are stored as base64 in the executable source. Include
        // their readable pseudo-source as well so string searches can find
        // identical actions without changing the bytes used by Execute.
        const disassembly = /\bavm1Actions\s*\(/.test(file.text)
          ? disassembleAVM1Source(file.text)?.text ?? ''
          : '';
        searchableText = `${file.text}\n${disassembly}`.toLowerCase();
        searchTextCache.current.set(file, searchableText);
      }
      return searchableText.includes(query);
    }) : files;
    return makeTreeRows(visible);
  }, [files, search]);
  const explorerFileCount = search.trim() ? rows.filter((row) => row.kind === 'file').length : files.length;
  const explorerCountLabel = search.trim()
    ? `${explorerFileCount} match${explorerFileCount === 1 ? '' : 'es'}`
    : `${explorerFileCount} files`;
  const lineCount = editorText.split(/\r?\n/).length;
  const generatedFileCount = appFiles.length;
  const sourceCount = projectState.status === 'ready' ? projectState.sources.length : 0;
  const issueCount = projectState.status === 'ready'
    ? projectState.project.report.reduce((count, file) => count + file.diagnostics.length, 0)
    : 0;
  const projectTitle = projectName.replace(/\.(?:xml|swf)$/i, '') || 'Untitled project';

  useEffect(() => {
    if (!dbgState.pausedAt) return;
    const paused = dbgState.pausedAt;
    const alreadyActive = activeFile?.path === paused.path || activeFile?.path.endsWith(paused.path) || paused.path.endsWith(activeFile?.path ?? '');
    if (!alreadyActive) {
      const match = files.find(f => f.path === paused.path || f.path.endsWith(paused.path) || paused.path.endsWith(f.path));
      if (match) {
        setSelected((current) => ({ ...current, [projectKey]: match.path }));
      }
    }
    requestAnimationFrame(() => {
      const el = codeScrollRef.current?.querySelector(`[data-line="${paused.line}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [dbgState.pausedAt, activeFile?.path, files, projectKey]);

  const exportTypeScript = async () => {
    if (projectState.status !== 'ready' || exporting) return;
    setExporting(true); setExportError('');
    try {
      const blob = await createTypeScriptArchive(projectState.project);
      triggerDownload(blob, `${projectName.replace(/[^\w.-]+/g, '_')}-typescript.zip`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally { setExporting(false); }
  };

  const inner = (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0b0d12] text-zinc-200" aria-label="Code Editor">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#252936] bg-[#10131b] px-4 py-2.5">
        <div className="flex min-w-[170px] items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/10 text-sm text-violet-300">⌘</span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">Code workspace</div>
            <div className="truncate text-xs text-zinc-500" title={projectName}>{projectTitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-[#292e3a] bg-[#0b0d12] p-1" role="group" aria-label="Project language">
          <ProjectButton active={mode === 'typescript'} onClick={() => { setMode('typescript'); setShowRawActionBytes(false); }}>Show TypeScript Project</ProjectButton>
          <ProjectButton active={mode === 'actionscript'} onClick={() => { setMode('actionscript'); setShowRawActionBytes(false); }}>Show ActionScript Project</ProjectButton>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {mode === 'typescript' && projectState.status === 'ready' && (
            <span className="hidden text-[10px] text-zinc-500 lg:inline">{generatedFileCount} generated files · {issueCount} transpiler diagnostics</span>
          )}
          <button
            type="button"
            aria-pressed={showDebugger}
            onClick={() => setShowDebugger(v => !v)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ring-1 transition ${showDebugger ? 'bg-amber-500/15 text-amber-200 ring-amber-400/20' : 'bg-zinc-800 text-zinc-400 ring-zinc-700 hover:bg-zinc-700'}`}
          >{showDebugger ? '● Debugger' : '○ Debugger'}</button>
          {inspectorPopout.isPopped ? (
            <button type="button" onClick={inspectorPopout.close} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200">↙ Restore Inspector</button>
          ) : (
            <button type="button" onClick={inspectorPopout.open} title="Pop out Code Inspector to a separate window" className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700">↗ Pop out Inspector</button>
          )}
          <button type="button" disabled={projectState.status !== 'ready' || exporting} onClick={exportTypeScript}
            className="rounded-md bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 ring-1 ring-violet-400/20 disabled:opacity-40">
            {exporting ? 'Exporting…' : 'Export TypeScript'}
          </button>
          {onRun && <button type="button" onClick={onRun} className="rounded-md bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 ring-1 ring-sky-400/20 transition hover:bg-sky-500/25">Run in Execute <span aria-hidden="true">↗</span></button>}
        </div>
      </header>
      {exportError && <div role="alert" className="px-4 py-2 text-xs text-rose-300">TypeScript export failed: {exportError}</div>}

      <div className="flex shrink-0 items-center gap-3 border-b border-[#252936] bg-[#0d1017] px-4 py-2">
        {mode === 'typescript' ? (
          <div className="flex items-center gap-1" role="group" aria-label="TypeScript project view">
            <ProjectButton active={area === 'engine'} onClick={() => setArea('engine')}>Show Engine</ProjectButton>
            <ProjectButton active={area === 'application'} onClick={() => setArea('application')}>Show Application</ProjectButton>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-amber-200">
            <span className="rounded bg-amber-400/10 px-2 py-1 font-mono text-[10px]">AS</span>
            <span>ActionScript source and AVM1 bytecode</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 text-[10px] text-zinc-600">
          <span className={cn('h-1.5 w-1.5 rounded-full', projectState.status === 'failed' ? 'bg-rose-400' : projectState.status === 'loading' ? 'bg-amber-300' : 'bg-emerald-400')} />
          {projectState.status === 'loading' ? 'Building project…' : projectState.status === 'failed' ? 'Project load failed' : `${sourceCount} ActionScript source files`}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-10 shrink-0 flex-col items-center border-r border-[#252936] bg-[#0d1017] py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-500/15 text-sm text-violet-200" title="Project Explorer" aria-label="Project Explorer">▤</div>
          <span className="mt-2 h-5 w-0.5 rounded-full bg-violet-400" />
        </div>

        <aside className="flex w-64 shrink-0 flex-col border-r border-[#252936] bg-[#10131b]" aria-label="Project files">
          <div className="flex h-10 shrink-0 items-center justify-between px-3">
            <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-zinc-400">Explorer</span>
            <span className="text-[10px] text-zinc-600">{explorerCountLabel}</span>
          </div>
          <div className="px-2 pb-2">
            <label className="relative block">
              <span className="sr-only">Search project files and source</span>
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600">⌕</span>
              <input
                aria-label="Search project files and source"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search files or source"
                className="w-full rounded border border-[#2a2f3b] bg-[#0b0d12] py-1.5 pl-7 pr-2 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-500/60"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
            {projectState.status === 'failed' && mode !== 'typescript' && <div className="px-2 py-3 text-[11px] text-rose-300">{projectState.error}</div>}
            {projectState.status === 'loading' && <div className="px-2 py-3 text-[11px] text-zinc-600">Reading project files…</div>}
            {projectState.status === 'ready' && rows.length === 0 && (
              <div className="px-2 py-3 text-[11px] leading-relaxed text-zinc-600">
                {search ? 'No files match this search.' : mode === 'actionscript' ? 'No ActionScript files were found in this export.' : area === 'application' ? 'No TypeScript modules were generated for this export.' : 'No engine sources were found.'}
              </div>
            )}
            {rows.map((row) => {
              if (row.kind === 'folder') {
                return (
                  <div key={`folder:${row.path}`} className="flex h-7 items-center gap-1 text-[11px] text-zinc-500" style={{ paddingLeft: 8 + row.depth * 12 }}>
                    <span className="text-[9px] text-zinc-700">▾</span><span className="text-amber-300/80">▰</span><span className="truncate">{row.name}</span>
                  </div>
                );
              }
              const bps = dbgState.breakpoints.filter(bp => bp.path === row.path || row.path.endsWith(bp.path) || bp.path.endsWith(row.path));
              const hasBp = bps.length > 0;
              const isActive = activeFile?.path === row.path;
              const isPausedFile = dbgState.pausedAt && (dbgState.pausedAt.path === row.path || row.path.endsWith(dbgState.pausedAt.path) || dbgState.pausedAt.path.endsWith(row.path));
              return (
                <button
                  type="button"
                  key={`file:${row.path}`}
                  title={row.path}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setSelected((current) => ({ ...current, [projectKey]: row.path }));
                    setShowRawActionBytes(false);
                  }}
                  className={cn(
                    'flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[11px] transition',
                    isActive ? 'bg-violet-500/15 text-violet-100' : isPausedFile ? 'bg-amber-500/10 text-amber-200' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100',
                  )}
                  style={{ paddingLeft: 8 + row.depth * 12 }}
                >
                  <span className={cn('w-4 shrink-0 rounded-sm text-center font-mono text-[8px] font-bold', row.name.toLowerCase().endsWith('.as') ? 'text-amber-300' : 'text-sky-300')}>
                    {row.name.toLowerCase().endsWith('.as') ? 'AS' : 'TS'}
                  </span>
                  <span className="truncate flex-1">{row.name}</span>
                  {hasBp && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" title={`${bps.length} breakpoint(s)`} />}
                  {isPausedFile && <span className="text-[10px] text-amber-400">●</span>}
                </button>
              );
            })}
          </div>
          <div className="border-t border-[#252936] px-3 py-2 text-[10px] leading-relaxed text-zinc-600">
            {mode === 'typescript' && area === 'application' ? 'Generated from the ActionScript export by the same as2ts build used in Execute.' : mode === 'typescript' ? 'Engine sources: AS2 player, runtime and transpiler.' : 'Source files loaded from the selected SWF export.'}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[#0b0d12]" aria-label="Code editor">
          <div className="flex h-10 shrink-0 items-center border-b border-[#252936] bg-[#10131b]">
            {activeFile ? (
              <div className="flex h-full items-center gap-2 border-r border-[#252936] border-t-2 border-t-violet-400 bg-[#0b0d12] px-4 text-xs">
                <span className={activeFile.language === 'actionscript' ? 'text-amber-300' : 'text-sky-300'}>{activeFile.language === 'actionscript' ? 'AS' : 'TS'}</span>
                <span className="max-w-64 truncate text-zinc-200">{activeFile.path.split('/').slice(-1)[0]}</span>
                <span className="ml-1 text-zinc-700">×</span>
              </div>
            ) : <div className="px-4 text-xs text-zinc-600">No file open</div>}
            {activeFile && <span className="ml-auto truncate px-3 font-mono text-[10px] text-zinc-600">{activeFile.path}</span>}
          </div>
          {mode === 'actionscript' && activeAVM1?.blockCount ? (
            <div role="note" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-400/15 bg-amber-400/[0.04] px-4 py-2 text-[11px] text-amber-100/80">
              <span>Raw SWFs store AVM1 bytecode, not recoverable .as text. This is a best-effort disassembly. The TypeScript project decodes supported blocks into editable logic; unsupported blocks retain the original bytes.</span>
              <button
                type="button"
                aria-pressed={showRawActionBytes}
                onClick={() => setShowRawActionBytes((shown) => !shown)}
                className="shrink-0 rounded border border-amber-300/20 px-2 py-1 text-[10px] font-medium text-amber-100 hover:bg-amber-300/10"
              >{showRawActionBytes ? 'Show disassembly' : 'Show raw bytecode'}</button>
            </div>
          ) : mode === 'typescript' && area === 'application' && activeTSHasAVM1 ? (
            <div role="note" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-sky-400/15 bg-sky-400/[0.04] px-4 py-2 text-[11px] text-sky-100/80">
              <span>This module contains an AVM1 interpreter fallback. See its byte-offset diagnostic for the unsupported construct; the original bytes are retained to avoid a partial translation.</span>
              <button
                type="button"
                onClick={() => { setMode('actionscript'); setShowRawActionBytes(false); }}
                className="shrink-0 rounded border border-sky-300/20 px-2 py-1 text-[10px] font-medium text-sky-100 hover:bg-sky-300/10"
              >Show readable ActionScript view</button>
            </div>
          ) : null}
          {activeFile ? (
            <div ref={codeScrollRef} className="min-h-0 flex-1 overflow-auto py-3 font-mono text-[12px] leading-6" aria-label={`${activeFile.path} source`}>
              <div className="min-w-max pr-8">
                {editorText.split(/\r?\n/).map((line, index) => {
                  const lineNo = index + 1;
                  const hasBp = dbgState.breakpoints.some(b => b.path === activeFile.path && b.line === lineNo);
                  const isPaused = dbgState.pausedAt?.path === activeFile.path && dbgState.pausedAt?.line === lineNo;
                  return (
                  <div key={index} data-line={lineNo} className={`flex min-h-6 whitespace-pre`}>
                    <div
                      onClick={() => dbg.toggleBreakpoint(activeFile.path, lineNo)}
                      title={hasBp ? "Remove breakpoint" : "Add breakpoint"}
                      className={`sticky left-0 flex w-14 shrink-0 select-none items-center justify-end gap-1 border-r bg-[#0b0d12] pr-2 text-[10px] leading-6 ${hasBp ? 'border-violet-500/40 bg-violet-500/10 text-violet-300' : isPaused ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-[#20242e] text-zinc-700 hover:text-zinc-300'}`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${hasBp ? 'bg-red-500 ring-red-500' : isPaused ? 'bg-amber-400 ring-amber-400' : 'bg-transparent ring-zinc-700 ring-1'}`} />
                      <span className="w-7 text-right">{lineNo}</span>
                    </div>
                    <code className={`pl-4 text-zinc-300`}>{highlight(line)}</code>
                  </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
              <div className="max-w-md">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-xl text-zinc-600">⌘</div>
                <div className="mt-4 text-sm font-medium text-zinc-300">{projectState.status === 'loading' ? 'Preparing your project…' : 'No source file selected'}</div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-600">Choose a file from the Explorer to inspect the project source.</p>
                {projectState.status === 'failed' && <p className="mt-3 text-xs text-rose-300">{projectState.error}</p>}
              </div>
            </div>
          )}
          <div className="flex h-6 shrink-0 items-center justify-between border-t border-[#252936] bg-[#151923] px-3 text-[10px] text-zinc-500">
            <div className="flex items-center gap-3"><span>{activeAVM1?.blockCount ? (showRawActionBytes ? 'Raw AVM1 bytecode' : 'AVM1 disassembly') : mode === 'actionscript' ? 'ActionScript' : 'TypeScript'}</span><span>{activeFile?.path ?? 'No file'}</span></div>
            <div className="flex items-center gap-3"><span>Ln {activeFile ? Math.min(lineCount, 1) : 0}, Col 1</span><span>UTF-8</span><span>Read only</span></div>
          </div>
          {showDebugger && (
            <div className="shrink-0 border-t border-[#252936] bg-[#0d1017]" style={{ height: 280 }}>
              <DebugPanel />
            </div>
          )}
        </main>
      </div>
    </section>
  );
  if (inspectorPopout.isPopped) {
    return (
      <>
        <div className="flex h-full items-center justify-center bg-[#0b0d12] p-8 text-center text-zinc-400">
          <div>
            <p className="text-sm text-zinc-300">Code Inspector is popped out in a separate window.</p>
            <p className="mt-1 text-xs text-zinc-500">Use the popped window side by side with Execute.</p>
            <button type="button" onClick={inspectorPopout.close} className="mt-4 rounded bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/20">↙ Restore Inspector</button>
          </div>
        </div>
        {inspectorPopout.portal(inner)}
      </>
    );
  }
  return inner;
}
