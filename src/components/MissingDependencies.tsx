// "Missing Dependencies": the files a movie requested while it played that were not
// part of the load — other SWFs, MP3s, XML, CSS, images, video, … — with the API
// that asked and the movie that asked. Service endpoints (server scripts) are listed
// apart: no file can stand in for them, only a live server or a game adapter.
// Shared by the AS1/2 and AS3 Execute views.

import { useEffect, useRef, useState } from 'react';
import { DEPENDENCY_KIND_LABEL, describeDependency, type DependencyTracker, type MissingDependency } from '../engine/flash/dependencies';
import type { LogEntry } from '../engine/flash/player';

/** A snapshot of a player's tracker, refreshed while the game runs. */
export function useMissingDependencies(tracker: () => DependencyTracker | null | undefined, intervalMs = 300): MissingDependency[] {
  const [list, setList] = useState<MissingDependency[]>([]);
  const seen = useRef<{ tracker: DependencyTracker | null; version: number }>({ tracker: null, version: -1 });
  const read = useRef(tracker);
  read.current = tracker;
  useEffect(() => {
    const poll = () => {
      const t = read.current() ?? null;
      if (t === seen.current.tracker && (!t || t.version === seen.current.version)) return;
      seen.current = { tracker: t, version: t?.version ?? -1 };
      if (!t) { setList([]); return; }
      setList(t.list().map((d) => ({ ...d, apis: [...d.apis], requestedBy: [...d.requestedBy] })));
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [tracker, intervalMs]);
  return list;
}

/** Problems-list entries: one per missing file, one per unanswered service endpoint. */
export function dependencyProblems(list: readonly MissingDependency[]): LogEntry[] {
  return list.filter((d) => !d.optional).map((d) => ({
    level: 'warn' as const, kind: 'problem' as const, source: 'engine' as const,
    context: d.service ? 'Service endpoints' : 'Missing Dependencies',
    message: d.service ? `Service endpoint not answered: ${describeDependency(d)}` : `Missing dependency: ${describeDependency(d)}`,
    time: 0,
  }));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One-line notice above the stage while files are missing. */
export function MissingDependenciesBanner({ list }: { list: readonly MissingDependency[] }) {
  const files = list.filter((d) => !d.service && !d.optional);
  if (!files.length) return null;
  const byKind = new Map<string, number>();
  for (const d of files) byKind.set(DEPENDENCY_KIND_LABEL[d.kind], (byKind.get(DEPENDENCY_KIND_LABEL[d.kind]) ?? 0) + 1);
  return (
    <div role="status" aria-label="Missing Dependencies" className="shrink-0 border-b border-amber-900/60 bg-amber-950/40 px-3 py-1.5 text-[11px] text-amber-200">
      <span className="font-semibold">Missing Dependencies:</span> the game requested {plural(files.length, 'file')} that {files.length === 1 ? 'is' : 'are'} not
      in the load ({[...byKind].map(([k, n]) => `${k} ×${n}`).join(', ')}: {files.slice(0, 3).map((d) => d.path.split('/').pop() || d.url).join(', ')}{files.length > 3 ? ', …' : ''}).
      Add {files.length === 1 ? 'it' : 'them'} to the upload to play those parts. See Program for the list.
    </div>
  );
}

/** The full list, for the Program panel. */
export function MissingDependenciesPanel({ list }: { list: readonly MissingDependency[] }) {
  const files = list.filter((d) => !d.service);
  const services = list.filter((d) => d.service);
  return (
    <div aria-label="Missing Dependencies list">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Missing Dependencies</div>
      {files.length === 0 && <div className="text-zinc-500">None requested so far.</div>}
      {files.map((d) => (
        <div key={d.key} className="mb-0.5 font-mono text-[10px]">
          <span className="mr-1 rounded bg-zinc-800 px-1 text-zinc-300">{DEPENDENCY_KIND_LABEL[d.kind]}</span>
          <span className={d.optional ? 'text-zinc-400' : 'text-amber-300'}>{d.path || d.url}</span>
          <span className="text-zinc-500"> — {d.apis.join(', ')}{d.requestedBy.length ? ` by ${d.requestedBy.join(', ')}` : ''}{d.count > 1 ? ` (×${d.count})` : ''}</span>
          {d.optional && <span className="ml-1 text-zinc-500">(optional live asset)</span>}
        </div>
      ))}
      {files.some((d) => !d.optional) && (
        <div className="mt-1 text-[10px] text-zinc-500">
          The movies request these while they play. Upload them together with the SWF (keeping their folder, or just the file) and restart to play those parts.
        </div>
      )}
      {services.length > 0 && (
        <>
          <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Service endpoints</div>
          {services.map((d) => (
            <div key={d.key} className="mb-0.5 font-mono text-[10px]">
              <span className="text-sky-300">{d.url}</span>
              <span className="text-zinc-500"> — {d.apis.join(', ')}{d.requestedBy.length ? ` by ${d.requestedBy.join(', ')}` : ''}{d.count > 1 ? ` (×${d.count})` : ''}</span>
            </div>
          ))}
          <div className="mt-1 text-[10px] text-zinc-500">Server calls, not files: they need the live server or a game adapter that answers them offline.</div>
        </>
      )}
    </div>
  );
}
