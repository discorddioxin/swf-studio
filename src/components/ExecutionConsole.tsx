import { useState } from 'react';
import type { LogEntry, LogSource } from '../engine/flash/player';
import { cn } from '../utils/cn';

export type ConsoleView = 'logs' | 'network' | 'problems';

export function ExecutionConsole({ entries, onClear }: { entries: readonly LogEntry[]; onClear: () => void }) {
  const [view, setView] = useState<ConsoleView>('logs');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const logs = entries.filter((entry) => entry.kind !== 'request' && entry.kind !== 'response');
  const network = entries.filter((entry) => entry.kind === 'request' || entry.kind === 'response');
  const problems = entries.filter((entry) => {
    const source = entry.source ?? 'engine';
    return source !== 'network' && (entry.kind === 'problem' || entry.level === 'error' || entry.level === 'warn');
  });
  const shownLogs = errorsOnly ? logs.filter((entry) => entry.level === 'error') : logs;
  const counts = { logs: logs.length, network: network.length, problems: problems.length };

  return (
    <section aria-label="Execution console" className="h-44 shrink-0 border-t border-zinc-800">
      <div className="flex min-h-8 items-center justify-between gap-2 border-b border-zinc-800 px-2">
        <div role="tablist" aria-label="Console tabs" className="flex h-8 items-stretch gap-1">
          {([
            ['logs', 'Logs'],
            ['network', 'Req/Res'],
            ['problems', 'Problems'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              title={id === 'network' ? 'Requests and responses' : id === 'problems' ? 'App, engine, and Forge issues' : 'Game and runtime logs'}
              role="tab"
              aria-selected={view === id}
              aria-controls="execution-console-panel"
              onClick={() => setView(id)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-2 text-[10px] font-semibold transition-colors',
                view === id ? 'border-violet-400 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300',
              )}
            >
              {label}
              <span className={cn('rounded px-1 text-[9px] tabular-nums', view === id ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-600')}>
                {counts[id]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pr-1">
          {view === 'logs' && (
            <button
              type="button"
              aria-pressed={errorsOnly}
              className={cn('text-[10px] hover:text-zinc-300', errorsOnly ? 'text-rose-300' : 'text-zinc-600')}
              onClick={() => setErrorsOnly((value) => !value)}
            >
              errors only
            </button>
          )}
          <button type="button" className="text-[10px] text-zinc-600 hover:text-zinc-300" onClick={onClear}>clear</button>
        </div>
      </div>

      <div id="execution-console-panel" role="tabpanel" className="h-[calc(100%-2rem)] overflow-y-auto px-3 py-1.5 font-mono text-[10px] leading-relaxed">
        {view === 'logs' && (
          <>
            {!shownLogs.length && <p className="text-zinc-600">No logs yet. trace() output and runtime messages appear here.</p>}
            {shownLogs.map((entry, index) => <LogRow key={`${entry.time}-${index}`} entry={entry} />)}
          </>
        )}
        {view === 'network' && (
          <>
            {!network.length && <p className="text-zinc-600">No requests or responses yet. Mock HTTP, URLLoader, and XMLSocket traffic appears here.</p>}
            {network.map((entry, index) => <NetworkRow key={`${entry.requestId ?? entry.time}-${index}`} entry={entry} />)}
          </>
        )}
        {view === 'problems' && (
          <>
            {!problems.length && <p className="text-zinc-600">No problems reported. App, engine, and Forge errors or warnings appear here.</p>}
            {problems.map((entry, index) => <ProblemRow key={`${entry.time}-${index}`} entry={entry} />)}
          </>
        )}
      </div>
    </section>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const color = entry.level === 'error' ? 'text-rose-300' : entry.level === 'warn' ? 'text-amber-300' : entry.level === 'trace' ? 'text-zinc-200' : 'text-sky-300';
  return (
    <div className={cn('whitespace-pre-wrap', color)} title={entry.context}>
      <span className="text-zinc-600">{(entry.time / 1000).toFixed(2)}s </span>{entry.message}
      {entry.detail && <details className="ml-8 text-zinc-500"><summary className="cursor-pointer select-none">details / stack</summary><pre className="whitespace-pre-wrap text-[9px] text-zinc-400">{entry.detail}</pre></details>}
    </div>
  );
}

function NetworkRow({ entry }: { entry: LogEntry }) {
  const request = entry.kind === 'request';
  const direction = request ? '→' : '←';
  const label = request ? 'REQUEST' : 'RESPONSE';
  const color = entry.status === 'error' || entry.status === 'blocked offline' ? 'text-amber-300' : request ? 'text-cyan-300' : 'text-emerald-300';
  const payload = entry.payload ?? entry.detail;
  return (
    <article className="mb-1 border-l border-zinc-700 pl-2" title={entry.requestId}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-zinc-600">{(entry.time / 1000).toFixed(2)}s</span>
        <span className={cn('font-bold', color)}>{direction} {label}</span>
        <span className="text-violet-300">{entry.transport ?? 'network'}</span>
        <span className="text-zinc-200">{entry.method}</span>
        {entry.url && <span className="break-all text-sky-200">{entry.url}</span>}
        {entry.status && <span className="text-zinc-500">{entry.status}</span>}
      </div>
      {entry.message && <div className="whitespace-pre-wrap text-zinc-400">{entry.message}</div>}
      {payload != null && <details className="text-zinc-500"><summary className="cursor-pointer select-none">payload ({payload.length} chars)</summary><pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-900/70 p-1.5 text-[9px] text-zinc-300">{readablePayload(payload)}</pre></details>}
    </article>
  );
}

function readablePayload(payload: string) {
  return payload
    .replace(/\u0001/g, '␁')
    .replace(/\u0002/g, '␂')
    .replace(/\u0003/g, '␃')
    .replace(/\u0004/g, '␄')
    .replace(/\u0000/g, '␀');
}

function ProblemRow({ entry }: { entry: LogEntry }) {
  const source: LogSource = entry.source ?? 'engine';
  const badge = source === 'app' ? 'App' : source === 'forge' ? 'Forge' : 'Engine';
  const color = entry.level === 'error' ? 'text-rose-300' : 'text-amber-300';
  return (
    <article className="mb-1 border-l border-rose-900/60 pl-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-zinc-600">{(entry.time / 1000).toFixed(2)}s</span>
        <span className="rounded bg-zinc-800 px-1 text-[9px] text-violet-300">{badge}</span>
        <span className={cn('font-semibold uppercase', color)}>{entry.level}</span>
        {entry.context && <span className="text-zinc-500">{entry.context}</span>}
      </div>
      <div className="whitespace-pre-wrap text-zinc-200">{entry.message}</div>
      {entry.detail && <details className="text-zinc-500"><summary className="cursor-pointer select-none">stack / details</summary><pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all text-[9px] text-zinc-400">{entry.detail}</pre></details>}
    </article>
  );
}
