import { useEffect, useState } from 'react';
import { useDebugger, useDebuggerState } from './store';
import { cn } from '../utils/cn';

export function DebugPanel({ compact }: { compact?: boolean }) {
  const dbg = useDebugger();
  const state = useDebuggerState();
  const [watchDraft, setWatchDraft] = useState('');
  const [newBpCondition, setNewBpCondition] = useState<Record<string, string>>({});

  // re-evaluate watches when paused or watches changed
  useEffect(() => {
    if (state.paused) {
      dbg.evaluateAllWatches();
    }
  }, [state.paused, state.selectedFrameId, dbg]);

  const selectedFrame = state.stack.find(f => f.id === state.selectedFrameId) ?? state.stack[0] ?? null;

  return (
    <div className={cn('flex h-full flex-col bg-[#0b0d12] text-zinc-200', compact ? 'text-xs' : 'text-sm')} aria-label="Debugger">
      {/* Controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[#252936] bg-[#10131b] px-2 py-2">
        <div className="flex items-center gap-1">
          <button
            aria-label={state.paused ? 'Continue' : 'Pause'}
            onClick={() => state.paused ? dbg.continue() : dbg.requestPause()}
            className={cn('rounded-md px-2.5 py-1.5 text-xs font-semibold transition', state.paused ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700')}
          >
            {state.paused ? '▶ Continue' : '⏸ Pause'}
          </button>
          <button
            aria-label="Step over"
            disabled={!state.paused}
            onClick={() => dbg.stepOver()}
            title="Step over (run to next pause point)"
            className="rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
          >
            Step Over
          </button>
          <button
            aria-label="Step into"
            disabled={!state.paused}
            onClick={() => dbg.stepInto()}
            title="Step into"
            className="rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
          >
            Step Into
          </button>
          <button
            aria-label="Step out"
            disabled={!state.paused || state.stack.length <= 1}
            onClick={() => dbg.stepOut()}
            title="Step out"
            className="rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
          >
            Step Out
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px]">
          <span className={cn('h-2 w-2 rounded-full', state.paused ? 'bg-amber-400' : 'bg-emerald-400')} />
          <span className={state.paused ? 'text-amber-300' : 'text-zinc-500'}>{state.paused ? `Paused${state.pauseReason ? ` · ${state.pauseReason}` : ''}` : 'Running'}</span>
        </div>
      </div>

      {state.paused && state.exception && (
        <div className="shrink-0 border-b border-rose-900/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
          <div className="font-semibold">Exception: {state.exception.message}</div>
          {state.exception.stack && <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap text-[10px] text-rose-300/80">{state.exception.stack.slice(0, 800)}</pre>}
        </div>
      )}

      {state.paused && state.pausedAt && (
        <div className="shrink-0 border-b border-amber-900/30 bg-amber-950/20 px-3 py-1.5 text-[11px] text-amber-200">
          Paused at <span className="font-mono">{state.pausedAt.path}:{state.pausedAt.line}</span>
          {state.pauseReason === 'breakpoint' && <span className="ml-2 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">breakpoint</span>}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left column: breakpoints & exception settings */}
        <div className="flex min-h-0 flex-1 flex-col border-r border-[#252936]">
          {/* Breakpoints */}
          <section aria-label="Breakpoints" className="flex min-h-0 flex-col">
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#252936] bg-[#0d1017] px-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Breakpoints</h3>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{state.breakpoints.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {state.breakpoints.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] leading-relaxed text-zinc-600">
                  Click the gutter in the editor to add a breakpoint.<br />
                  <span className="text-zinc-500">Execution will pause before that line.</span>
                </p>
              ) : (
                <ul className="divide-y divide-zinc-800/50">
                  {state.breakpoints.map(bp => (
                    <li key={bp.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/[0.04]">
                      <input
                        type="checkbox"
                        aria-label={`Enable breakpoint ${bp.path}:${bp.line}`}
                        checked={bp.enabled}
                        onChange={() => dbg.updateBreakpoint(bp.id, { enabled: !bp.enabled })}
                        className="h-3 w-3 rounded border-zinc-700 bg-zinc-900 text-violet-600 focus:ring-0"
                      />
                      <span className={cn('h-3 w-3 shrink-0 rounded-full border', bp.enabled ? 'bg-rose-500 border-rose-400 shadow-[0_0_6px_rgba(244,63,94,.5)]' : 'bg-zinc-800 border-zinc-700')} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[11px] text-zinc-300" title={`${bp.path}:${bp.line}`}>{bp.path.split('/').pop()}:{bp.line}</div>
                        <div className="truncate text-[10px] text-zinc-600">{bp.path}</div>
                        {bp.condition ? <div className="truncate font-mono text-[10px] text-amber-300/80">if ({bp.condition})</div> : null}
                      </div>
                      <input
                        placeholder="condition"
                        value={newBpCondition[bp.id] ?? bp.condition ?? ''}
                        onChange={e => setNewBpCondition(prev => ({ ...prev, [bp.id]: e.target.value }))}
                        onBlur={e => {
                          const v = e.target.value.trim();
                          dbg.updateBreakpoint(bp.id, { condition: v || undefined });
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="hidden w-24 rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 text-[10px] text-zinc-300 placeholder:text-zinc-600 lg:block"
                        aria-label="Breakpoint condition"
                        title="Break only when expression is truthy. Evaluated in paused scope."
                      />
                      <button
                        aria-label={`Remove breakpoint ${bp.path}:${bp.line}`}
                        onClick={() => dbg.removeBreakpoint(bp.id)}
                        className="shrink-0 rounded px-1 py-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {state.breakpoints.length > 0 && (
              <div className="flex shrink-0 items-center justify-between border-t border-[#252936] px-2 py-1">
                <button onClick={() => dbg.clearBreakpoints()} className="text-[10px] text-zinc-500 hover:text-zinc-300">Clear all</button>
                <span className="text-[10px] text-zinc-600">{state.breakpoints.filter(b => b.enabled).length} enabled</span>
              </div>
            )}
            {/* Break on exceptions */}
            <div className="shrink-0 border-t border-[#252936] bg-[#10131b] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Break on exceptions</div>
              <label className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-300">
                <input
                  type="checkbox"
                  checked={state.breakOnExceptions}
                  onChange={e => dbg.setBreakOnExceptions(e.target.checked)}
                  className="h-3 w-3 rounded border-zinc-700 bg-zinc-900"
                />
                Break on exceptions
              </label>
              <label className="flex items-center gap-2 text-[11px] text-zinc-300">
                <input
                  type="checkbox"
                  checked={state.breakOnUncaught}
                  onChange={e => dbg.setBreakOnUncaught(e.target.checked)}
                  className="h-3 w-3 rounded border-zinc-700 bg-zinc-900"
                />
                Break on uncaught exceptions
              </label>
            </div>
          </section>
        </div>

        {/* Right column: watches + call stack */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Watches */}
          <section aria-label="Watch expressions" className="flex min-h-0 flex-col border-b border-[#252936]">
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#252936] bg-[#0d1017] px-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Watch</h3>
              <span className="text-[10px] text-zinc-600">{state.watches.length} expressions</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 border-b border-[#252936] bg-[#0b0d12] px-2 py-1.5">
              <input
                aria-label="Add watch expression"
                placeholder="Expression to watch (e.g. this._x, score, _root.hero)"
                value={watchDraft}
                onChange={e => setWatchDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && watchDraft.trim()) {
                    dbg.addWatch(watchDraft.trim());
                    setWatchDraft('');
                  }
                }}
                className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
              />
              <button
                disabled={!watchDraft.trim()}
                onClick={() => { if (watchDraft.trim()) { dbg.addWatch(watchDraft.trim()); setWatchDraft(''); } }}
                className="shrink-0 rounded bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40"
              >
                Add
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {state.watches.length === 0 ? (
                <p className="px-3 py-6 text-center text-[11px] text-zinc-600">No watch expressions. Add one to evaluate in the paused scope.</p>
              ) : (
                <ul className="divide-y divide-zinc-800/50">
                  {state.watches.map(w => (
                    <li key={w.id} className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`Watch ${w.expression}`}
                          value={w.expression}
                          onChange={e => dbg.updateWatch(w.id, e.target.value)}
                          onBlur={() => state.paused && dbg.evaluateAllWatches()}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 font-mono text-[11px] text-violet-300"
                        />
                        <button
                          aria-label={`Remove watch ${w.expression}`}
                          onClick={() => dbg.removeWatch(w.id)}
                          className="shrink-0 rounded px-1 text-zinc-600 hover:text-zinc-300"
                        >
                          ×
                        </button>
                      </div>
                      <div className={cn('mt-1 truncate font-mono text-[11px]', w.error ? 'text-rose-300' : 'text-emerald-300')}>
                        {w.error ? `Error: ${w.error}` : w.value ?? (state.paused ? '(not evaluated)' : '— paused to evaluate')}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selectedFrame && (
              <div className="shrink-0 border-t border-[#252936] bg-[#10131b] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Scope · {selectedFrame.name}</div>
                <div className="mt-1 max-h-28 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-1.5 font-mono text-[10px] leading-relaxed">
                  {selectedFrame.scope ? Object.entries(selectedFrame.scope).slice(0, 32).map(([k,v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="shrink-0 text-violet-300">{k}:</span>
                      <span className="truncate text-zinc-300">{formatScopeValue(v)}</span>
                    </div>
                  )) : <span className="text-zinc-600">No scope captured.</span>}
                  {selectedFrame.scope && Object.keys(selectedFrame.scope).length > 32 && <div className="text-zinc-600">…and {Object.keys(selectedFrame.scope).length - 32} more</div>}
                </div>
              </div>
            )}
          </section>

          {/* Call stack */}
          <section aria-label="Call stack" className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#252936] bg-[#0d1017] px-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Call Stack</h3>
              <span className="text-[10px] text-zinc-600">{state.stack.length} frames</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {state.stack.length === 0 ? (
                <p className="px-3 py-6 text-center text-[11px] text-zinc-600">
                  {state.paused ? 'No stack frames. Hit a breakpoint or throw to populate the trace.' : 'Run with breakpoints. The stack will appear when paused.'}
                </p>
              ) : (
                <ol className="divide-y divide-zinc-800/50">
                  {state.stack.map((frame, idx) => (
                    <li key={frame.id}>
                      <button
                        onClick={() => dbg.selectFrame(frame.id)}
                        aria-selected={state.selectedFrameId === frame.id}
                        className={cn('flex w-full items-start gap-2 px-2 py-1.5 text-left hover:bg-white/[0.04]', state.selectedFrameId === frame.id ? 'bg-violet-500/10' : '')}
                      >
                        <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-mono', idx === 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-500')}>
                          {idx}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className={cn('truncate font-mono text-[11px]', state.selectedFrameId === frame.id ? 'text-violet-200' : 'text-zinc-300')}>{frame.name}</div>
                          <div className="truncate text-[10px] text-zinc-500">{frame.source}:{frame.line}</div>
                        </div>
                        {idx === 0 && <span className="shrink-0 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-300">top</span>}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function formatScopeValue(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'function') return `function ${v.name || '(anonymous)'}`;
  if (typeof v === 'object') {
    try {
      const s = JSON.stringify(v);
      if (s && s.length < 80) return s;
      if (Array.isArray(v)) return `Array(${v.length})`;
      return `{${Object.keys(v as object).slice(0,3).join(', ')}}`;
    } catch { return String(v); }
  }
  return String(v);
}
