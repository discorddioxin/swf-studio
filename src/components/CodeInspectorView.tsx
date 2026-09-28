import { memo, useCallback, useMemo, useState } from 'react';
import { resolveActionScriptFile } from '../lib/assets';
import { analyzeCodebase, buildAssetDescriptors, type CodebaseAnalysis, type RefEdge } from '../lib/codeInspector';
import type { AssetBundle, AssetFile, Project, SwfDocument } from '../types';
import { cn } from '../utils/cn';
import { formatLines } from './CodeInspector';
import { inputCls } from './ui';
import { scriptKey, useScriptTexts } from './useScriptTexts';

type SourceSummary = CodebaseAnalysis['sources'][number];

interface SourceRef {
  id: string;
  label: string;
  timelineId: string;
  file?: AssetFile;
  detail: string;
}

function shortLabel(label: string): string {
  return label.length > 42 ? `${label.slice(0, 42)}…` : label;
}

export function CodeInspectorView({ doc, assets, project, onSelectCharacter }: {
  doc: SwfDocument;
  assets: AssetBundle | null;
  project: Project;
  onSelectCharacter?: (id: number) => void;
}) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [timelineFilter, setTimelineFilter] = useState('');
  const [leftTab, setLeftTab] = useState<'sources' | 'symbols' | 'references'>('sources');

  const sourceRefs = useMemo<SourceRef[]>(() => {
    const list: SourceRef[] = [];
    doc.timelines.forEach((tl) => {
      tl.frames.forEach((f) => {
        f.events.forEach((e) => {
          if (e.kind !== 'action') return;
          let file: AssetFile | undefined;
          if (assets) {
            const refs = [e.externalActions, ...(e.externalActionCandidates ?? [])].filter(Boolean) as string[];
            file = resolveActionScriptFile(assets, tl, f.index, e.tagType, refs);
          }
          list.push({
            id: `${tl.id}:f${f.index}:${list.length}`,
            label: file ? `${tl.name} · f${f.index + 1} · ${file.path.split('/').pop()}` : `${tl.name} · frame ${f.index + 1}`,
            timelineId: tl.id,
            file,
            detail: e.detail,
          });
        });
      });
    });
    return list;
  }, [doc, assets]);

  // Scoped to the asset bundle: a newly opened folder never shows stale text,
  // and all files are committed in one batch (one re-analysis, not N).
  const scriptFiles = useMemo(() => sourceRefs.map((s) => s.file), [sourceRefs]);
  const { texts: externalTexts } = useScriptTexts(scriptFiles, assets);

  const sources = useMemo(() => sourceRefs.map((s) => ({
    id: s.id, label: s.label, timelineId: s.timelineId,
    source: (s.file ? externalTexts[scriptKey(s.file)] : undefined) ?? s.detail,
  })), [sourceRefs, externalTexts]);

  const assetDescriptors = useMemo(() => buildAssetDescriptors(doc, project), [doc, project]);

  const analysis = useMemo<CodebaseAnalysis>(() => analyzeCodebase(sources, assetDescriptors), [sources, assetDescriptors]);
  const sourceById = useMemo(() => new Map(analysis.sources.map((s) => [s.id, s])), [analysis.sources]);
  const timelineName = useCallback(
    (id: string) => doc.timelines.get(id)?.name ?? (id === 'root' ? 'Main Timeline' : id),
    [doc],
  );

  const timelines = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    analysis.sources.forEach((s) => {
      const existing = map.get(s.timelineId);
      if (existing) existing.count++;
      else {
        map.set(s.timelineId, { name: timelineName(s.timelineId), count: 1 });
      }
    });
    return [...map.entries()];
  }, [analysis, timelineName]);

  const q = search.trim().toLowerCase();
  const filteredSymbols = useMemo(() => {
    if (!q && !timelineFilter) return analysis.symbols;
    return analysis.symbols.filter((s) => {
      if (timelineFilter && s.timelineId !== timelineFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.sourceLabel.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [analysis.symbols, q, timelineFilter]);

  const filteredRefs = useMemo(() => {
    if (!q && !timelineFilter) return analysis.references;
    return analysis.references.filter((r) => {
      if (q && !r.fromName.toLowerCase().includes(q) && !r.toName.toLowerCase().includes(q)) return false;
      if (timelineFilter) {
        const fromSrc = sourceById.get(r.fromSourceId);
        if (fromSrc && fromSrc.timelineId !== timelineFilter) return false;
      }
      return true;
    });
  }, [analysis.references, sourceById, q, timelineFilter]);

  const filteredSources = useMemo(
    () => (timelineFilter ? analysis.sources.filter((s) => s.timelineId === timelineFilter) : analysis.sources),
    [analysis.sources, timelineFilter],
  );

  const activeSource = (activeSourceId != null ? sourceById.get(activeSourceId) : undefined)
    ?? analysis.sources.reduce<SourceSummary | null>((best, s) => (s.methodCount + s.memberCount) > (best ? best.methodCount + best.memberCount : -1) ? s : best, null);
  const activeId = activeSource?.id ?? null;

  /** Jump to a symbol's definition, preferring `preferSourceId`, then the
   * source currently on screen, then the first definition anywhere. */
  const selectSymbol = useCallback((name: string, preferSourceId?: string) => {
    const defs = analysis.symbols.filter((s) => s.name === name);
    if (!defs.length) return;
    const def = defs.find((s) => s.sourceId === preferSourceId)
      ?? defs.find((s) => s.sourceId === activeId)
      ?? defs[0];
    setSelectedSymbol(name);
    setActiveSourceId(def.sourceId);
  }, [analysis.symbols, activeId]);
  const selectAsset = useCallback((name: string) => {
    const assetId = analysis.assetIndex[name]?.assetId;
    if (assetId != null) onSelectCharacter?.(assetId);
  }, [analysis.assetIndex, onSelectCharacter]);

  const refCount = (name: string) => (analysis.byName[name]?.references.length ?? 0);

  if (!analysis.sources.length) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div className="max-w-md space-y-2 text-sm text-zinc-500">
          <div className="text-lg text-zinc-400">No ActionScript found</div>
          <p>Load a dump whose frames contain ActionScript, or drop a <code className="text-violet-300">scripts/</code> export.
            The Code Inspector indexes every method, member, and code↔code / code↔asset relationship across all timelines.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950">
      {/* header */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
        <span className="text-sm font-semibold text-zinc-100">Code Inspector</span>
        <div className="flex items-center gap-1 rounded-md bg-zinc-900 px-2 py-1 text-[10px] text-zinc-500">
          <Stat n={analysis.counts.sources} l="sources" />
          <Stat n={analysis.counts.methods} l="methods" />
          <Stat n={analysis.counts.members} l="members" />
          <Stat n={analysis.counts.references} l="refs" />
          <Stat n={analysis.counts.assets} l="assets" />
        </div>
        <input className={cn(inputCls, 'ml-auto w-64')} placeholder="Search code, symbol, or relationship…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={cn(inputCls, 'w-48')} value={timelineFilter} onChange={(e) => setTimelineFilter(e.target.value)}>
          <option value="">All timelines</option>
          {timelines.map(([id, t]) => <option key={id} value={id}>{t.name} ({t.count})</option>)}
        </select>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left: navigation */}
        <div className="flex w-72 shrink-0 flex-col border-r border-zinc-800">
          <div className="flex border-b border-zinc-800">
            {(['sources', 'symbols', 'references'] as const).map((t) => (
              <button key={t} onClick={() => setLeftTab(t)} className={cn('flex-1 border-b-2 py-1.5 text-[11px] font-medium capitalize', leftTab === t ? 'border-violet-500 text-violet-200' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>{t}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {leftTab === 'sources' && <SourcesList sources={filteredSources} activeSourceId={activeId} timelineName={timelineName} onSelectSource={setActiveSourceId} />}
            {leftTab === 'symbols' && <SymbolsList symbols={filteredSymbols} selected={selectedSymbol} refCount={refCount} onSelect={selectSymbol} />}
            {leftTab === 'references' && <ReferencesList refs={filteredRefs} sourceById={sourceById} onSelectSymbol={selectSymbol} onSelectAsset={selectAsset} />}
          </div>
        </div>

        {/* center: code viewer */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-zinc-800">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[11px]">
            <span className="truncate text-zinc-400">{activeSource ? shortLabel(activeSource.label) : 'no source'}</span>
            {selectedSymbol && <span className="shrink-0 text-violet-300">def: {selectedSymbol}</span>}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1 font-mono text-[11px] leading-5">
            {activeSource && <CodeViewer source={activeSource.source} analysis={analysis} selectedSymbol={selectedSymbol} activeSourceId={activeSource.id} onSelectSymbol={selectSymbol} onSelectAsset={selectAsset} />}
          </div>
        </div>

        {/* right: references */}
        <div className="flex w-80 shrink-0 flex-col">
          <ReferencesPanel analysis={analysis} selectedSymbol={selectedSymbol} onSelectSymbol={selectSymbol} onSelectAsset={selectAsset} />
        </div>
      </div>
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return <span className="flex items-center gap-1"><b className="text-zinc-200">{n}</b>{l}</span>;
}

// ---------------------------------------------------------------- left lists ----

function SourcesList({ sources: all, activeSourceId, timelineName, onSelectSource }: {
  sources: SourceSummary[]; activeSourceId?: string | null; timelineName: (id: string) => string; onSelectSource: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, SourceSummary[]>();
    for (const s of all) {
      const arr = map.get(s.timelineId) ?? [];
      arr.push(s); map.set(s.timelineId, arr);
    }
    return [...map.entries()];
  }, [all]);

  if (!groups.length) return <p className="p-2 text-[11px] text-zinc-600">No sources on this timeline.</p>;

  return (
    <div className="space-y-3">
      {groups.map(([timelineId, sources]) => (
        <div key={timelineId}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{timelineName(timelineId)}</div>
          <div className="space-y-1">
            {sources.map((s) => (
              <button key={s.id} onClick={() => onSelectSource(s.id)} className={cn('w-full rounded px-2 py-1 text-left text-[11px]', s.id === activeSourceId ? 'bg-violet-600/20 text-violet-200' : 'text-zinc-400 hover:bg-zinc-900')}>
                <div className="truncate">{shortLabel(s.label)}</div>
                <div className="text-[9px] text-zinc-600">{s.methodCount} methods · {s.memberCount} members</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SymbolsList({ symbols, selected, refCount, onSelect }: {
  symbols: ReturnType<typeof analyzeCodebase>['symbols']; selected: string | null; refCount: (name: string) => number; onSelect: (name: string) => void;
}) {
  if (!symbols.length) return <p className="p-2 text-[11px] text-zinc-600">No symbols match.</p>;
  return (
    <div className="space-y-0.5">
      {symbols.map((s) => (
        <button key={s.id} onClick={() => onSelect(s.name)} className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px]', s.name === selected ? 'bg-violet-600/20 text-violet-200' : 'text-zinc-300 hover:bg-zinc-900')}>
          <span className={cn('w-4 shrink-0 text-center font-mono text-[9px]', s.isCode ? 'text-violet-300' : 'text-emerald-300')}>{s.isCode ? 'ƒ' : '·'}</span>
          <span className="truncate font-mono">{s.name}</span>
          <span className="ml-auto shrink-0 text-[9px] text-zinc-600">{refCount(s.name)} refs</span>
        </button>
      ))}
    </div>
  );
}

function ReferencesList({ refs, sourceById, onSelectSymbol, onSelectAsset }: {
  refs: RefEdge[]; sourceById: Map<string, SourceSummary>; onSelectSymbol: (name: string, preferSourceId?: string) => void; onSelectAsset: (name: string) => void;
}) {
  if (!refs.length) return <p className="p-2 text-[11px] text-zinc-600">No relationships match.</p>;
  return (
    <div className="space-y-0.5">
      {refs.map((r) => {
        const fromSrc = sourceById.get(r.fromSourceId);
        return (
          <div key={r.id} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] hover:bg-zinc-900">
            <button className="shrink-0 font-mono text-violet-300 hover:underline" onClick={() => onSelectSymbol(r.fromName, r.fromSourceId)}>{r.fromName}</button>
            <span className="shrink-0 text-zinc-600">—{r.via}→</span>
            {r.via === 'asset'
              ? <button className="shrink-0 font-mono text-amber-300 hover:underline" onClick={() => onSelectAsset(r.toName)}>{r.toName}</button>
              : <button className="shrink-0 truncate font-mono text-emerald-300 hover:underline" onClick={() => onSelectSymbol(r.toName, r.fromSourceId)}>{r.toName}</button>}
            <span className="ml-auto shrink-0 text-[9px] text-zinc-700">{fromSrc ? shortLabel(fromSrc.label).split('·')[0].trim() : ''}:{r.lines.length > 1 ? `${r.fromLine} (×${r.lines.length})` : r.fromLine}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- code viewer ----

// Memoised: typing in the search box must not re-tokenise the whole file.
const CodeViewer = memo(function CodeViewer({ source, analysis, selectedSymbol, activeSourceId, onSelectSymbol, onSelectAsset }: {
  source: string; analysis: CodebaseAnalysis; selectedSymbol: string | null; activeSourceId: string;
  onSelectSymbol: (name: string) => void; onSelectAsset: (name: string) => void;
}) {
  const defLines = useMemo(() => {
    const set = new Set<number>();
    if (selectedSymbol) {
      for (const s of analysis.symbols) if (s.sourceId === activeSourceId && s.name === selectedSymbol) for (let l = s.line; l <= s.endLine; l++) set.add(l);
    }
    return set;
  }, [analysis, selectedSymbol, activeSourceId]);

  const lines = useMemo(() => source.split('\n'), [source]);
  return (
    <div className="min-w-fit">
      {lines.map((line, i) => (
        <TokenLine key={i} line={line} lineNo={i + 1} isDef={defLines.has(i + 1)} analysis={analysis} onSelectSymbol={onSelectSymbol} onSelectAsset={onSelectAsset} />
      ))}
    </div>
  );
});

function TokenLine({ line, lineNo, isDef, analysis, onSelectSymbol, onSelectAsset }: {
  line: string; lineNo: number; isDef: boolean; analysis: CodebaseAnalysis;
  onSelectSymbol: (name: string) => void; onSelectAsset: (name: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  const re = /([A-Za-z_$][\w$]*)/g;
  let last = 0; let m: RegExpExecArray | null; let key = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) parts.push(<span key={key++}>{line.slice(last, m.index)}</span>);
    const name = m[1];
    if (analysis.symbolNames.has(name)) {
      const kind = analysis.symbolKindByName.get(name);
      parts.push(
        <span key={key++} className={cn('cursor-pointer rounded-sm px-px', kind === 'code' ? 'text-violet-300 hover:bg-violet-500/25' : 'text-emerald-300 hover:bg-emerald-500/25')}
          onClick={() => onSelectSymbol(name)} title={`${kind === 'code' ? 'code' : 'member'}: ${name}`}>
          {name}
        </span>,
      );
    } else if (analysis.assetNames.has(name)) {
      parts.push(
        <span key={key++} className="cursor-pointer rounded-sm px-px text-amber-300 hover:bg-amber-500/25" onClick={() => onSelectAsset(name)} title={`asset: ${name}`}>
          {name}
        </span>,
      );
    } else {
      parts.push(<span key={key++}>{name}</span>);
    }
    last = re.lastIndex;
  }
  if (last < line.length) parts.push(<span key={key++}>{line.slice(last)}</span>);

  return (
    <div className={cn('flex', isDef && 'bg-violet-500/10')}>
      <span className="w-10 shrink-0 select-none pr-2 text-right text-zinc-700">{lineNo}</span>
      <code className="whitespace-pre text-zinc-300">{parts}</code>
    </div>
  );
}

// ---------------------------------------------------------------- references panel ----

function ReferencesPanel({ analysis, selectedSymbol, onSelectSymbol, onSelectAsset }: {
  analysis: CodebaseAnalysis; selectedSymbol: string | null;
  onSelectSymbol: (name: string, preferSourceId?: string) => void; onSelectAsset: (name: string) => void;
}) {
  const related = useMemo(
    () => (selectedSymbol ? analysis.references.filter((r) => r.fromName === selectedSymbol || r.toName === selectedSymbol) : []),
    [analysis.references, selectedSymbol],
  );
  if (!selectedSymbol) {
    return (
      <div className="p-3 text-[11px] text-zinc-500">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">References</div>
        Select a symbol in the code or the symbol list to see its references and relationships — calls, callers, member reads/writes, and asset references.
      </div>
    );
  }
  const refs = related;
  const sections: { title: string; via: RefEdge['via']; dir: 'out' | 'in'; asset?: boolean }[] = [
    { title: 'Calls', via: 'call', dir: 'out' },
    { title: 'Called by', via: 'call', dir: 'in' },
    { title: 'Members read', via: 'read', dir: 'out' },
    { title: 'Members written', via: 'write', dir: 'out' },
    { title: 'Read by', via: 'read', dir: 'in' },
    { title: 'Written by', via: 'write', dir: 'in' },
    { title: 'Assets referenced', via: 'asset', dir: 'out', asset: true },
  ];
  const defLines = analysis.symbols.filter((s) => s.name === selectedSymbol);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">References</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-sm text-violet-200">{selectedSymbol}</span>
          {defLines.map((d) => <span key={d.id} className="text-[9px] text-zinc-600">L{d.line}</span>)}
          <span className="text-[10px] text-zinc-500">{defLines[0]?.isCode ? 'code' : 'member'}</span>
        </div>
        {defLines[0] && defLines[0].isCode && defLines[0].params.length > 0 && (
          <div className="mt-1 font-mono text-[10px] text-zinc-500">({defLines[0].params.join(', ')})</div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sections.map((s) => {
          const rows = refs.filter((r) => r.via === s.via && (s.dir === 'out' ? r.fromName === selectedSymbol : r.toName === selectedSymbol));
          const unique: RefEdge[] = [];
          const seen = new Set<string>();
          for (const r of rows) {
            const key = s.dir === 'out' ? r.toName : r.fromName;
            if (seen.has(key)) continue;
            seen.add(key); unique.push(r);
          }
          if (!unique.length) return null;
          return (
            <div key={s.title} className="mb-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{s.title} ({unique.length})</div>
              <div className="space-y-0.5">
                {unique.map((r) => {
                  const target = s.dir === 'out' ? r.toName : r.fromName;
                  return (
                    <button key={r.id} onClick={() => (s.asset ? onSelectAsset(target) : onSelectSymbol(target, s.dir === 'in' ? r.fromSourceId : undefined))} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] hover:bg-zinc-900">
                      <span className={cn('shrink-0 font-mono', s.asset ? 'text-amber-300' : 'text-emerald-300')}>{target}</span>
                      <span className="ml-auto shrink-0 text-[9px] text-zinc-600" title={`Lines ${r.lines.join(', ')}`}>{formatLines(r.lines)}{s.dir === 'in' ? ` → ${selectedSymbol}` : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
