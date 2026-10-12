// UI troubleshooter panel for the Execute tab.
//
// Left: the live display list (searchable, click to select / highlight).
// Right: findings from `scanStage`, the selected node's values, or the report
// for a probed canvas point. Everything is read-only; the only side effects are
// the inspector highlight and the findings sent to the Execution console.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui';
import { cn } from '../../utils/cn';
import {
  analyzePoint, canvasToStage, countBySeverity, reportToText, scanStage,
  type Finding, type InspectablePlayer, type NodeSnapshot, type PointReport, type ScanResult, type Severity,
} from './scan';

export interface UiTroubleshooterProps {
  /** live player accessor — the Execute tab replaces it on restart */
  getPlayer: () => InspectablePlayer | null;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  /** embedded font ids registered for the main movie */
  fontIds?: Set<number>;
  /** bumped by Execute's Restart so the panel re-scans the new session */
  epoch?: number;
  onSendToConsole?: (findings: Finding[]) => void;
  onFocus?: (ids: Set<number> | null) => void;
  onClose?: () => void;
}

type RightTab = 'findings' | 'node' | 'point';

const SEVERITY_STYLE: Record<Severity, { badge: string; dot: string; label: string }> = {
  error: { badge: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30', dot: 'bg-rose-400', label: 'error' },
  warn: { badge: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30', dot: 'bg-amber-400', label: 'warn' },
  info: { badge: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30', dot: 'bg-sky-400', label: 'info' },
  pass: { badge: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30', dot: 'bg-emerald-400', label: 'ok' },
};

export function UiTroubleshooter({ getPlayer, canvasRef, fontIds, epoch, onSendToConsole, onFocus, onClose }: UiTroubleshooterProps) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [watch, setWatch] = useState(false);
  const [pick, setPick] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [search, setSearch] = useState('');
  const [showPassed, setShowPassed] = useState(false);
  const [seedOnly, setSeedOnly] = useState(false);
  const [tab, setTab] = useState<RightTab>('findings');
  const [point, setPoint] = useState<PointReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scanningRef = useRef(false);

  const run = useCallback(() => {
    const player = getPlayer();
    if (!player) { setError('No player yet — load a game (Execute) first.'); setResult(null); return; }
    scanningRef.current = true;
    setScanning(true);
    try {
      const next = scanStage(player, { fontIds });
      setResult(next);
      setError(null);
      // keep a useful default selection: the component under investigation, else the root
      setSelectedId((current) => (current != null && next.nodes.some((n) => n.id === current) ? current : next.stats.primaryComponent?.nodeId ?? next.root?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [getPlayer, fontIds]);

  // first scan once a player exists, and again after every Restart
  useEffect(() => {
    run();
  }, [run, epoch]);

  useEffect(() => {
    if (!watch) return;
    const id = window.setInterval(() => { if (!scanningRef.current) run(); }, 1200);
    return () => window.clearInterval(id);
  }, [watch, run]);

  // pick-a-point mode: swallow the gesture so the game does not see the click
  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas || !pick) return;
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';
    const swallow = (event: Event) => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); };
    const onPointerDown = (event: PointerEvent) => swallow(event);
    const onClick = (event: MouseEvent) => {
      swallow(event);
      const player = getPlayer();
      if (player) {
        const stagePoint = canvasToStage(canvas, player, event.clientX, event.clientY);
        if (stagePoint) {
          const report = analyzePoint(player, stagePoint.x, stagePoint.y, { fontIds, maxProbes: 2 });
          setPoint(report);
          setTab('point');
          if (report.node) setSelectedId(report.node.id);
        }
      }
      setPick(false);
    };
    canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
    canvas.addEventListener('pointerup', onPointerDown, { capture: true });
    canvas.addEventListener('click', onClick, { capture: true });
    return () => {
      canvas.style.cursor = previousCursor;
      canvas.removeEventListener('pointerdown', onPointerDown, { capture: true } as EventListenerOptions);
      canvas.removeEventListener('pointerup', onPointerDown, { capture: true } as EventListenerOptions);
      canvas.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
    };
  }, [pick, canvasRef, getPlayer, fontIds]);

  const nodesById = useMemo(() => new Map((result?.nodes ?? []).map((n) => [n.id, n])), [result]);
  const selected = selectedId != null ? nodesById.get(selectedId) ?? null : null;
  const counts = useMemo(() => countBySeverity(result?.findings ?? []), [result]);
  const findings = useMemo(() => {
    const list = (result?.findings ?? []).filter((f) => showPassed || f.severity !== 'pass');
    const scoped = seedOnly && selected ? list.filter((f) => f.nodeId === selected.id || selected.children.some((c) => c.id === f.nodeId)) : list;
    return scoped;
  }, [result, showPassed, seedOnly, selected]);

  const focusNode = useCallback((id: number | null) => {
    setSelectedId(id);
    onFocus?.(id != null ? new Set([id]) : null);
  }, [onFocus]);

  const copyReport = useCallback(async () => {
    if (!result) return;
    const text = reportToText(result);
    try { await navigator.clipboard.writeText(text); setError(null); }
    catch { setError('Clipboard unavailable — open Raw and copy manually.'); }
  }, [result]);

  const downloadReport = useCallback(() => {
    if (!result) return;
    const blob = new Blob([reportToText(result)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ui-troubleshooter-${new Date(result.scannedAt).toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <section aria-label="UI troubleshooter" className="flex h-full min-h-0 flex-col bg-zinc-950">
      <header className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-xs font-semibold text-violet-200">UI Troubleshooter</span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-400">
          {result ? `${result.stats.nodes} nodes · ${result.stats.probed} probes · ${result.stats.durationMs} ms` : 'no scan yet'}
        </span>
        {(['error', 'warn', 'info', 'pass'] as const).map((severity) => (
          <span key={severity} className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', SEVERITY_STYLE[severity].badge)} title={severity === 'pass' ? 'checks that passed' : severity}>
            {counts[severity]} {SEVERITY_STYLE[severity].label}
          </span>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-1">
          <Button variant={pick ? 'primary' : 'default'} onClick={() => setPick((v) => !v)} title="Click the stage to inspect exactly what is there">
            {pick ? '● Click the stage…' : '⌖ Pick point'}
          </Button>
          <Button variant={watch ? 'primary' : 'default'} onClick={() => setWatch((v) => !v)} title="Re-scan once per second while the game runs">
            {watch ? '● Watching' : '○ Watch'}
          </Button>
          <Button variant="primary" onClick={run} disabled={scanning} title="Run every check again">{scanning ? 'Scanning…' : 'Run checks'}</Button>
          <Button onClick={copyReport} disabled={!result} title="Copy the whole report">Copy</Button>
          <Button onClick={downloadReport} disabled={!result} title="Download the report as text">Save</Button>
          <Button
            onClick={() => onSendToConsole?.((result?.findings ?? []).filter((f) => f.severity === 'error' || f.severity === 'warn'))}
            disabled={!result}
            title="Send errors and warnings to the Execution console"
          >
            → Console
          </Button>
          {onClose && <Button variant="ghost" onClick={onClose} title="Close the troubleshooter">✕</Button>}
        </span>
      </header>

      {error && <div className="shrink-0 border-b border-amber-900/60 bg-amber-950/40 px-2 py-1 text-[11px] text-amber-200">{error}</div>}
      {pick && (
        <div className="shrink-0 border-b border-violet-900/60 bg-violet-950/30 px-2 py-1 text-[11px] text-violet-200">
          Click the stage: the troubleshooter reports the node under the cursor, what the player hit-tests there, and what the pixels look like.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800">
          <div className="flex items-center gap-1 border-b border-zinc-800 px-2 py-1">
            <input
              aria-label="Filter display list"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200 placeholder:text-zinc-600"
              placeholder="filter nodes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="shrink-0 rounded px-1 text-[10px] text-zinc-500 hover:text-zinc-200"
              onClick={() => setExpanded(expanded.size ? new Set() : new Set(result?.nodes.map((n) => n.id) ?? []))}
              title="Expand / collapse everything"
            >
              {expanded.size ? '−' : '+'}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-1 font-mono text-[10px]">
            {!result?.root && <p className="px-2 text-zinc-600">Nothing loaded.</p>}
            {result?.root && (
              <NodeRow
                node={result.root}
                depth={0}
                selectedId={selectedId}
                expanded={expanded}
                filter={search.trim().toLowerCase()}
                onToggle={(id) => setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
                onSelect={focusNode}
              />
            )}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div role="tablist" aria-label="Troubleshooter views" className="flex h-7 shrink-0 items-stretch gap-1 border-b border-zinc-800 px-2">
            {([['findings', `Findings${findings.length ? ` (${findings.length})` : ''}`], ['node', 'Node'], ['point', 'Point']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  'border-b-2 px-2 text-[10px] font-semibold transition-colors',
                  tab === id ? 'border-violet-400 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300',
                )}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-3 pr-1 text-[10px] text-zinc-500">
              {tab === 'findings' && (
                <>
                  <button type="button" className={cn('hover:text-zinc-300', showPassed ? 'text-emerald-300' : '')} onClick={() => setShowPassed((v) => !v)}>
                    {showPassed ? 'hide passed' : 'show passed'}
                  </button>
                  <button type="button" className={cn('hover:text-zinc-300', seedOnly ? 'text-violet-300' : '')} onClick={() => setSeedOnly((v) => !v)} title="Only findings about the selected node and its children">
                    selected only
                  </button>
                </>
              )}
              {tab === 'node' && selected && (
                <button type="button" className="hover:text-zinc-300" onClick={() => onFocus?.(null)}>clear highlight</button>
              )}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 py-1.5 text-[11px]">
            {tab === 'findings' && (
              <FindingsList
                findings={findings}
                onFocus={focusNode}
                onPick={(path) => { const node = (result?.nodes ?? []).find((n) => n.path === path); if (node) focusNode(node.id); }}
              />
            )}
            {tab === 'node' && (selected
              ? <NodeDetail node={selected} player={getPlayer()} onFocus={focusNode} />
              : <p className="text-zinc-600">Select a node in the tree (or use Pick point) to see its values.</p>)}
            {tab === 'point' && (point
              ? <PointDetail report={point} onFocus={focusNode} />
              : <p className="text-zinc-600">Use “Pick point”, then click the stage — e.g. on the white rectangle where the servers should be.</p>)}
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ tree

function subtreeMatches(node: NodeSnapshot, filter: string): boolean {
  if (!filter) return true;
  if (node.name.toLowerCase().includes(filter) || node.path.toLowerCase().includes(filter)) return true;
  return node.children.some((child) => subtreeMatches(child, filter));
}

function NodeRow({
  node, depth, selectedId, expanded, filter, onToggle, onSelect,
}: {
  node: NodeSnapshot;
  depth: number;
  selectedId: number | null;
  expanded: Set<number>;
  filter: string;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  if (!subtreeMatches(node, filter)) return null;
  const open = expanded.has(node.id) || (filter.length > 0 && !node.name.toLowerCase().includes(filter));

  return (
    <div>
      <div
        className={cn(
          'flex cursor-pointer items-center gap-1 rounded px-1 leading-5 hover:bg-zinc-800/60',
          selectedId === node.id && 'bg-violet-500/20 text-violet-100',
        )}
        style={{ paddingLeft: 4 + depth * 10 }}
        onClick={() => onSelect(node.id)}
        title={node.path}
      >
        <button
          type="button"
          className={cn('w-3 shrink-0 text-center text-zinc-500', node.childCount ? '' : 'opacity-0')}
          onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
        >
          {open ? '▾' : '▸'}
        </button>
        <span className={cn('truncate', node.visible ? 'text-zinc-300' : 'text-zinc-600 line-through')}>{node.name}</span>
        {node.component && <span className="shrink-0 rounded bg-sky-500/15 px-1 text-[9px] text-sky-300">{node.component.className}</span>}
        {node.text && <span className="shrink-0 rounded bg-blue-500/15 px-1 text-[9px] text-blue-300">T{node.text.chars}</span>}
        {!node.visible && (
          <span
            className="shrink-0 text-[9px] text-amber-400"
            title={node.hiddenReason === 'mask'
              ? 'a setMask() mask — never painted as content'
              : node.hiddenReason === 'script'
                ? "the movie's own ActionScript set _visible = false (deliberate state)"
                : 'hidden without any script write — the engine hid this clip'}
          >
            {node.hiddenReason === 'mask' ? 'mask' : node.hiddenReason === 'script' ? 'hidden · game state' : 'hidden · engine'}
          </span>
        )}
        {node.hiddenBy && node.visible && <span className="shrink-0 text-[9px] text-amber-400" title={`hidden by ${node.hiddenBy}`}>ancestor hidden</span>}
        {node.childCount > 0 && <span className="ml-auto shrink-0 pr-1 text-[9px] text-zinc-600">{node.childCount}</span>}
      </div>
      {open && node.children.map((child) => (
        <NodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expanded={expanded}
          filter={filter}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// -------------------------------------------------------------- findings

function FindingsList({ findings, onFocus, onPick }: { findings: Finding[]; onFocus: (id: number) => void; onPick?: (path: string) => void }) {
  if (!findings.length) {
    return <p className="text-zinc-500">No findings in this view. “Show passed” lists the checks that came back clean.</p>;
  }
  return (
    <ul className="space-y-1">
      {findings.map((f) => (
        <li key={f.id} className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5">
          <div className="flex items-start gap-2">
            <span className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', SEVERITY_STYLE[f.severity].dot)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-zinc-100">{f.title}</span>
                <span className="rounded bg-zinc-800 px-1 text-[9px] uppercase text-zinc-400">{f.area}</span>
              </div>
              <div className="whitespace-pre-wrap text-zinc-400">{f.detail}</div>
              {f.hint && <div className="mt-0.5 text-zinc-300">→ {f.hint}</div>}
              {f.path && (
                <button
                  type="button"
                  className="mt-0.5 block max-w-full truncate font-mono text-[10px] text-sky-300 hover:underline"
                  onClick={() => (f.nodeId != null ? onFocus(f.nodeId) : onPick?.(f.path!))}
                >
                  {f.path}
                </button>
              )}
              {f.evidence && (
                <details className="text-zinc-500">
                  <summary className="cursor-pointer select-none text-[10px]">evidence</summary>
                  <pre className="mt-0.5 overflow-auto whitespace-pre-wrap rounded bg-zinc-950 p-1.5 text-[10px] text-zinc-400">{JSON.stringify(f.evidence, null, 1)}</pre>
                </details>
              )}
            </div>
            {f.nodeId != null && (
              <button type="button" className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700" onClick={() => onFocus(f.nodeId!)} title="Highlight this clip on the stage">
                focus
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- details

const fmt = (v: unknown): string => {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : String(Math.round(v * 100) / 100);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
};

function Row({ label, value, tone }: { label: string; value: unknown; tone?: 'bad' | 'good' }) {
  return (
    <div className="flex gap-2">
      <span className="w-32 shrink-0 text-zinc-500">{label}</span>
      <span className={cn('min-w-0 flex-1 break-all', tone === 'bad' ? 'text-rose-300' : tone === 'good' ? 'text-emerald-300' : 'text-zinc-200')}>{fmt(value)}</span>
    </div>
  );
}

function NodeDetail({ node, player, onFocus }: { node: NodeSnapshot; player: InspectablePlayer | null; onFocus: (id: number) => void }) {
  const c = node.component;
  const metricsBad = c ? c.brokenMetrics.length > 0 : false;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-0.5 font-mono">
        <div className="mb-1 flex items-center gap-2 font-sans">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Node</span>
          <Button variant="ghost" onClick={() => onFocus(node.id)} className="px-1.5 py-0.5 text-[10px]">highlight</Button>
        </div>
        <Row label="path" value={node.path} />
        <Row label="kind" value={`${node.kind} #${node.characterId}${node.exportName ? ` “${node.exportName}”` : ''}`} />
        <Row label="depth" value={node.depth} />
        <Row label="frame" value={`${node.frame}/${node.totalFrames}`} />
        <Row label="visible" value={node.visible} tone={node.visible ? undefined : 'bad'} />
        <Row label="alpha" value={node.alpha} tone={node.alpha <= 0.02 ? 'bad' : undefined} />
        <Row label="rect (stage px)" value={node.rect ? `x ${Math.round(node.rect.x)} y ${Math.round(node.rect.y)}  ${Math.round(node.rect.w)}×${Math.round(node.rect.h)}` : 'no bounds'} tone={node.rect ? undefined : 'bad'} />
        <Row label="children" value={node.childCount} />
        <Row label="masked" value={node.masked} />
        <Row label="used as mask" value={node.usedAsMask} />
        <Row label="visibility source" value={node.visibleSource === 'script' ? 'movie script' : 'default (never written)'} />
        <Row label="draw commands" value={node.drawingCommands} />
        {node.hiddenBy && <Row label="hidden by" value={node.hiddenBy} tone="bad" />}
        {node.text && (
          <>
            <Row label="text chars" value={node.text.chars} tone={node.text.chars ? 'good' : 'bad'} />
            <Row label="text preview" value={JSON.stringify(node.text.preview)} />
            <Row label="font" value={`${node.text.font} ${node.text.size}px ${node.text.color}`} />
            <Row label="embedFonts" value={node.text.fontId != null ? `${node.text.embedFonts} (id ${node.text.fontId})` : node.text.embedFonts} />
          </>
        )}
        <Row label="stage" value={player ? `${player.width}×${player.height} bg ${player.background}` : 'n/a'} />
      </div>

      {c && (
        <div className="space-y-0.5 font-mono">
          <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Component · {c.className}</div>
          <Row label="items (getLength)" value={c.itemCount} tone={c.itemCount ? 'good' : undefined} />
          <Row label="dataProvider.length" value={c.dataProvider} />
          <Row label="rowHeight" value={c.rowHeight} tone={c.rowHeight == null || Number.isNaN(c.rowHeight) ? 'bad' : undefined} />
          <Row label="__rowCount" value={c.rowCount} tone={Number.isNaN(c.rowCount as number) ? 'bad' : c.rowCount ? 'good' : undefined} />
          <Row label="rows (live array)" value={c.rows} tone={c.rowCount && !c.rows ? 'bad' : c.rows ? 'good' : undefined} />
          <Row label="viewMetrics" value={c.viewMetrics ? JSON.stringify(c.viewMetrics) : 'n/a'} tone={metricsBad ? 'bad' : undefined} />
          <Row label="border_mc class" value={c.border ? (c.border.className ?? '(not class-bound)') : 'none'} tone={c.border && !c.border.className ? 'bad' : undefined} />
          <Row label="borderMetrics" value={c.border ? (c.border.metrics ? 'present' : 'undefined') : 'n/a'} tone={c.border && !c.border.metrics ? 'bad' : undefined} />
          <Row label="vScroller" value={c.scroll ? `${c.scroll.className ?? '(no class)'} pos ${fmt(c.scroll.position)} max ${fmt(c.scroll.maxPos)}` : 'none'} />
          <Row label="dirty" value={[
            c.dirty.invalidateFlag ? 'invalidateFlag' : '', c.dirty.invLayoutContent ? 'invLayoutContent' : '',
            c.dirty.invUpdateControl ? 'invUpdateControl' : '', c.dirty.invScrollProps ? 'invScrollProps' : '',
          ].filter(Boolean).join(' ') || 'clean'} />
          {c.brokenMetrics.length > 0 && (
            <div className="mt-1 rounded border border-rose-900/60 bg-rose-950/30 p-1.5 font-sans text-[10px] text-rose-200">
              Broken metrics: {c.brokenMetrics.join(' · ')}
              <div className="mt-0.5 text-rose-300/80">
                An undefined metric means a skin/subelement clip lost its class (the SWF’s Object.registerClass for that symbol did not run).
              </div>
            </div>
          )}
          {c.rowDetail.length > 0 && (
            <div className="mt-1">
              <div className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Rows</div>
              <table className="w-full text-[10px]">
                <thead className="text-zinc-500">
                  <tr><th className="text-left">#</th><th className="text-left">name</th><th className="text-left">label</th><th className="text-right">y</th><th className="text-right">h</th></tr>
                </thead>
                <tbody>
                  {c.rowDetail.slice(0, 12).map((r) => (
                    <tr key={r.index} className={r.label.trim() ? 'text-zinc-300' : 'text-amber-300'}>
                      <td>{r.index}</td>
                      <td className="truncate">{r.name}</td>
                      <td className="truncate">{r.label || '—'}</td>
                      <td className="text-right tabular-nums">{Math.round(r.y)}</td>
                      <td className="text-right tabular-nums">{Math.round(r.height)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PointDetail({ report, onFocus }: { report: PointReport; onFocus: (id: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-zinc-400">
        <span className="font-mono">stage point {Math.round(report.point.x)}, {Math.round(report.point.y)}</span>
        {report.node && <span>· topmost drawn: <button type="button" className="font-mono text-sky-300 hover:underline" onClick={() => onFocus(report.node!.id)}>{report.node.path}</button></span>}
        {report.hit && <span>· mouse hits: <button type="button" className="font-mono text-sky-300 hover:underline" onClick={() => onFocus(report.hit!.id)}>{report.hit.path}</button></span>}
        {!report.hit && <span>· mouse hits: nothing (not clickable)</span>}
      </div>
      {report.pixel && (
        <div className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1 font-mono text-[10px] text-zinc-400">
          pixels {report.pixel.width}×{report.pixel.height}: {report.pixel.colors} colour(s), dominant {report.pixel.dominant},
          {' '}{report.pixel.inkRatio < 0.01 ? 'flat — nothing but a fill is drawn' : `${(report.pixel.inkRatio * 100).toFixed(1)}% non-background`}
        </div>
      )}
      <FindingsList findings={report.findings} onFocus={onFocus} />
    </div>
  );
}
