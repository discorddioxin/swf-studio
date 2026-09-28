import { useMemo, useState } from 'react';
import type { CodeAnalysis, CodeMethod } from '../lib/codeInspector';
import { cn } from '../utils/cn';
import { inputCls } from './ui';

type View = 'overview' | 'methods' | 'members' | 'relationships' | 'source';

const KIND_BADGE: Record<CodeMethod['kind'], string> = {
  function: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  method: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  handler: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
};

export function CodeInspector({ analysis, onSelectAsset }: {
  analysis: CodeAnalysis;
  onSelectAsset?: (assetId?: number, assetName?: string) => void;
}) {
  const [view, setView] = useState<View>('overview');
  const [search, setSearch] = useState('');
  const [expandedMethod, setExpandedMethod] = useState<string | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  // Index into analysis.sources (labels are not guaranteed to be unique). The
  // selection is tied to the list it was made in: switching timeline/character
  // yields a different list and clears it, while re-analysis of the same list
  // (e.g. an external script finishing loading) keeps it.
  const sourcesKey = analysis.sources.map((s) => s.label).join('\n');
  const [selection, setSelection] = useState<{ key: string; idx: number } | null>(null);
  const activeSourceIdx = selection?.key === sourcesKey ? selection.idx : null;
  const setActiveSourceIdx = (idx: number) => setSelection({ key: sourcesKey, idx });
  const activeSource = activeSourceIdx != null ? analysis.sources[activeSourceIdx] : undefined;

  const q = search.trim().toLowerCase();
  const filteredMethods = useMemo(
    () => (q ? analysis.methods.filter((m) => m.name.toLowerCase().includes(q) || m.assetRefs.some((r) => r.toLowerCase().includes(q))) : analysis.methods),
    [analysis.methods, q],
  );
  const filteredMembers = useMemo(
    () => (q ? analysis.members.filter((m) => m.name.toLowerCase().includes(q) || m.assetRefs.some((r) => r.toLowerCase().includes(q))) : analysis.members),
    [analysis.members, q],
  );
  const filteredRels = useMemo(() => {
    if (!q) return analysis.relationships;
    return analysis.relationships.filter((r) => r.codeName.toLowerCase().includes(q) || r.assetName.toLowerCase().includes(q));
  }, [analysis.relationships, q]);

  // Chips only know the asset *name*; resolve its id so selecting works.
  const selectAssetByName = (_id?: number, name?: string) => {
    if (!name) return;
    onSelectAsset?.(analysis.assetIndex[name]?.assetId, name);
  };

  const assetGroups = useMemo(() => Object.entries(analysis.assetIndex)
    .map(([name, usage]) => ({ name, usage }))
    .sort((a, b) => b.usage.usedBy.length - a.usage.usedBy.length), [analysis.assetIndex]);

  const tabs: { id: View; label: string; count: number }[] = [
    { id: 'overview', label: 'Overview', count: 0 },
    { id: 'methods', label: 'Methods', count: analysis.counts.methods },
    { id: 'members', label: 'Members', count: analysis.counts.members },
    { id: 'relationships', label: 'Code ↔ Assets', count: analysis.counts.relationships },
    { id: 'source', label: 'Source', count: analysis.counts.sources },
  ];

  if (!analysis.counts.sources) {
    return <p className="rounded border border-dashed border-zinc-800 p-4 text-center text-[11px] text-zinc-600">No ActionScript attached to this timeline or character yet.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex overflow-x-auto border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={cn('whitespace-nowrap border-b-2 px-2 py-1.5 text-[11px] font-medium', view === t.id ? 'border-amber-500 text-amber-200' : 'border-transparent text-zinc-500 hover:text-zinc-300')}
          >
            {t.label}{t.count > 0 ? <span className="ml-1 text-zinc-600">{t.count}</span> : null}
          </button>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-zinc-600">
        Static index of {analysis.counts.sources} source blob(s): {analysis.counts.methods} methods, {analysis.counts.members} members, {analysis.counts.relationships} code→asset references. Names are matched against known assets — a heuristic index, not a compiler.
      </p>

      {(view === 'methods' || view === 'members' || view === 'relationships') && (
        <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by code name or asset name…" />
      )}

      {view === 'overview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {[
              ['Sources', analysis.counts.sources],
              ['Methods', analysis.counts.methods],
              ['Members', analysis.counts.members],
              ['Refs', analysis.counts.relationships],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded border border-zinc-800 bg-zinc-900/50 p-2 text-center">
                <div className="text-lg font-semibold text-zinc-100">{value as number}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label as string}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Assets referenced by code ({assetGroups.length})</div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {assetGroups.map(({ name, usage }) => (
                <button
                  key={name}
                  onClick={() => onSelectAsset?.(usage.assetId, name)}
                  className="flex w-full items-center justify-between rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1 text-left text-[11px] hover:border-amber-500/40"
                >
                  <span className="truncate text-zinc-200">{name}{usage.assetKind ? <span className="ml-1 text-zinc-600">· {usage.assetKind}</span> : null}</span>
                  <span className="ml-2 shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">{usage.usedBy.length} ref</span>
                </button>
              ))}
              {!assetGroups.length && <p className="text-[11px] text-zinc-600">No asset references detected.</p>}
            </div>
          </div>
        </div>
      )}

      {view === 'methods' && (
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {filteredMethods.map((m) => (
            <div key={m.id} className="rounded border border-zinc-800 bg-zinc-900/40">
              <button
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                onClick={() => setExpandedMethod(expandedMethod === m.id ? null : m.id)}
              >
                <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium', KIND_BADGE[m.kind])}>{m.kind}</span>
                <span className="truncate font-mono text-[11px] text-zinc-100">{m.name}({m.params.join(', ')})</span>
                <span className="ml-auto shrink-0 text-[10px] text-zinc-600">L{m.startLine}–{m.endLine}</span>
              </button>
              {expandedMethod === m.id && (
                <div className="space-y-2 border-t border-zinc-800 px-2 py-2">
                  <RefChips refs={m.refs} onSelect={selectAssetByName} />
                  <div className="text-[10px] text-zinc-600">Source: {m.sourceLabel}</div>
                  {m.calls.length > 0 && (
                    <div className="text-[10px] text-zinc-500">Calls: <span className="font-mono text-zinc-400">{m.calls.join(', ')}</span></div>
                  )}
                  <pre className="max-h-48 overflow-auto rounded border border-zinc-800 bg-zinc-950/60 p-2 font-mono text-[10px] leading-relaxed text-zinc-300">{m.body}</pre>
                </div>
              )}
            </div>
          ))}
          {!filteredMethods.length && <p className="text-[11px] text-zinc-600">No methods match.</p>}
        </div>
      )}

      {view === 'members' && (
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {filteredMembers.map((m) => (
            <div key={m.id} className="rounded border border-zinc-800 bg-zinc-900/40">
              <button className="flex w-full items-center gap-2 px-2 py-1.5 text-left" onClick={() => setExpandedMember(expandedMember === m.id ? null : m.id)}>
                <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">{m.kind}</span>
                <span className="truncate font-mono text-[11px] text-zinc-100">{m.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-zinc-600">L{m.startLine}</span>
              </button>
              {expandedMember === m.id && (
                <div className="space-y-2 border-t border-zinc-800 px-2 py-2">
                  <div className="truncate font-mono text-[10px] text-zinc-400">= {m.value}</div>
                  <RefChips refs={m.refs} onSelect={selectAssetByName} />
                  <div className="text-[10px] text-zinc-600">Source: {m.sourceLabel}</div>
                </div>
              )}
            </div>
          ))}
          {!filteredMembers.length && <p className="text-[11px] text-zinc-600">No members match.</p>}
        </div>
      )}

      {view === 'relationships' && (
        <Relationships analysis={analysis} filtered={filteredRels} filtering={!!q} onSelectAsset={onSelectAsset} />
      )}

      {view === 'source' && (
        <div className="space-y-2">
          <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
            {analysis.sources.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveSourceIdx(i)}
                className={cn('flex items-center justify-between rounded border px-2 py-1 text-left text-[11px]', activeSourceIdx === i ? 'border-amber-500/40 bg-amber-500/5 text-amber-200' : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700')}
              >
                <span className="truncate">{s.label}</span>
                <span className="ml-2 shrink-0 text-[10px] text-zinc-600">{s.methodCount}m · {s.memberCount}v</span>
              </button>
            ))}
          </div>
          {activeSource && (
            <pre className="max-h-64 overflow-auto rounded border border-zinc-800 bg-zinc-950/60 p-2 font-mono text-[10px] leading-relaxed text-amber-100/80 whitespace-pre">
              {activeSource.source}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function RefChips({ refs, onSelect }: {
  refs: { name: string; via: string }[];
  onSelect?: (id?: number, name?: string) => void;
}) {
  if (!refs.length) return <div className="text-[10px] text-zinc-600">No asset references.</div>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-zinc-500">References:</span>
      {refs.map((r) => (
        <button key={r.name + r.via} onClick={() => onSelect?.(undefined, r.name)} title={r.via} className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-200 hover:border-amber-400">
          {r.name}
        </button>
      ))}
    </div>
  );
}

function Relationships({ analysis, filtered, filtering, onSelectAsset }: {
  analysis: CodeAnalysis; filtered: CodeAnalysis['relationships']; filtering: boolean; onSelectAsset?: (id?: number, name?: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { assetName: string; assetId?: number; assetKind?: string; rows: CodeAnalysis['relationships'] }>();
    for (const rel of filtered) {
      const g = map.get(rel.assetName) ?? { assetName: rel.assetName, assetId: rel.assetId, assetKind: rel.assetKind, rows: [] };
      g.rows.push(rel);
      map.set(rel.assetName, g);
    }
    return [...map.values()].sort((a, b) => b.rows.length - a.rows.length);
  }, [filtered]);

  if (!groups.length) return <p className="text-[11px] text-zinc-600">No code→asset relationships{filtering ? ' match' : ''}.</p>;
  return (
    <div className="max-h-80 space-y-2 overflow-y-auto">
      {groups.map((g) => (
        <div key={g.assetName} className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
          <button onClick={() => onSelectAsset?.(g.assetId, g.assetName)} className="mb-1 flex w-full items-center justify-between text-left">
            <span className="truncate font-mono text-[11px] text-amber-200 hover:underline">{g.assetName}{g.assetKind ? <span className="ml-1 text-zinc-600">· {g.assetKind}</span> : null}</span>
            <span className="ml-2 shrink-0 text-[10px] text-zinc-500">{g.rows.length} ref</span>
          </button>
          <div className="space-y-0.5">
            {g.rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded bg-zinc-950/40 px-1.5 py-0.5 text-[10px]">
                <span className="shrink-0 rounded border border-violet-500/30 bg-violet-500/10 px-1 text-[9px] text-violet-300">{r.codeType}</span>
                <span className="truncate font-mono text-zinc-200">{r.codeName}</span>
                <span className="ml-auto shrink-0 text-zinc-600" title={`Lines ${r.lines.join(', ')}`}>{r.via} · {r.sourceLabel} {formatLines(r.lines)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="text-[9px] text-zinc-700">{analysis.counts.relationships} total relationships indexed.</div>
    </div>
  );
}

/** `L3`, `L3, 9, 12`, or `L3, 9, 12 +4` for long lists. */
export function formatLines(lines: number[], max = 3): string {
  if (!lines.length) return '';
  const shown = lines.slice(0, max).join(', ');
  return `L${shown}${lines.length > max ? ` +${lines.length - max}` : ''}`;
}
