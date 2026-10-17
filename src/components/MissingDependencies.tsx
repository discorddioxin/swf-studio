// "Missing Dependencies": the files a movie requested while it played that were not
// part of the load — other SWFs, MP3s, XML, CSS, images, video, … — with the API
// that asked and the movie that asked. Service endpoints (server scripts) are listed
// apart: no file can stand in for them, only a live server or a game adapter.
// Shared by the AS1/2 and AS3 Execute views.
//
// "Add Dependency" puts files into the current session for testing: each goes
// under the path the movie asked for, and the game restarts with them.

import { useEffect, useRef, useState } from 'react';
import { DEPENDENCY_KIND_LABEL, describeDependency, matchDependencyFiles, type DependencyAddition, type DependencyTracker, type MissingDependency } from '../engine/flash/dependencies';
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

/** Adds files to the session the Execute tab plays (App owns the session). */
export interface DependencyAdder {
  /** Add the files; the game restarts with them. Rejects with a readable message. */
  add(additions: DependencyAddition[]): Promise<void>;
  /** The paths added so far this session. */
  added: readonly string[];
}

/** A file picker button: the picked files go into the session (see matchDependencyFiles). */
export function AddDependencyButton({ adder, missing, target, label, title, className }: {
  adder: DependencyAdder;
  /** the missing files a picked file is matched to by name */
  missing: readonly MissingDependency[];
  /** one entry: a single file, stored under its requested path whatever it is called */
  target?: MissingDependency;
  label: string;
  title?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const ext = target?.path.match(/\.([a-z0-9]+)$/i)?.[1];
  const accept = ext ? `.${ext.toLowerCase()}` : undefined;
  const pick = async (files: File[]) => {
    if (!files.length) return;
    setState({ busy: true, error: null });
    try {
      await adder.add(matchDependencyFiles(files, missing, target));
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        title={title}
        disabled={state.busy}
        onClick={() => input.current?.click()}
        className={className ?? 'rounded border border-amber-700/60 bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-100 hover:bg-amber-800/50 disabled:opacity-60'}
      >
        {state.busy ? 'Adding…' : label}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple={!target}
        accept={accept}
        aria-label={`${label} file`}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void pick(files);
        }}
      />
      {state.error && <span role="alert" className="text-[10px] text-rose-300">Could not add: {state.error}</span>}
    </span>
  );
}

/** One-line notice above the stage while files are missing. */
export function MissingDependenciesBanner({ list, adder }: { list: readonly MissingDependency[]; adder?: DependencyAdder }) {
  const files = list.filter((d) => !d.service && !d.optional);
  if (!files.length) return null;
  const byKind = new Map<string, number>();
  for (const d of files) byKind.set(DEPENDENCY_KIND_LABEL[d.kind], (byKind.get(DEPENDENCY_KIND_LABEL[d.kind]) ?? 0) + 1);
  return (
    <div role="status" aria-label="Missing Dependencies" className="shrink-0 border-b border-amber-900/60 bg-amber-950/40 px-3 py-1.5 text-[11px] text-amber-200">
      <span className="font-semibold">Missing Dependencies:</span> the game requested {plural(files.length, 'file')} that {files.length === 1 ? 'is' : 'are'} not
      in the load ({[...byKind].map(([k, n]) => `${k} ×${n}`).join(', ')}: {files.slice(0, 3).map((d) => d.path.split('/').pop() || d.url).join(', ')}{files.length > 3 ? ', …' : ''}).
      {adder ? (
        <>
          {' '}
          <AddDependencyButton
            adder={adder}
            missing={list}
            label="Add Dependency"
            title="Pick the missing files: each is stored under the path the game asked for, for this session, and the game restarts with them"
          />{' '}
          adds {files.length === 1 ? 'it' : 'them'} to this session for testing (the game restarts). See Program for the list.
        </>
      ) : (
        <>Add {files.length === 1 ? 'it' : 'them'} to the upload to play those parts. See Program for the list.</>
      )}
    </div>
  );
}

/** The full list, for the Program panel. */
export function MissingDependenciesPanel({ list, adder }: { list: readonly MissingDependency[]; adder?: DependencyAdder }) {
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
          {adder && (
            <span className="ml-2">
              <AddDependencyButton
                adder={adder}
                missing={list}
                target={d}
                label="Add…"
                title={`Pick the file to use as ${d.path || d.url} in this session`}
                className="rounded border border-zinc-700 px-1 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
              />
            </span>
          )}
        </div>
      ))}
      {files.some((d) => !d.optional) && (
        <div className="mt-1 text-[10px] text-zinc-500">
          The movies request these while they play. {adder
            ? 'Add a file to this session (Add Dependency, or Add… on a row) and the game restarts with it, or upload it together with the SWF.'
            : 'Upload them together with the SWF (keeping their folder, or just the file) and restart to play those parts.'}
        </div>
      )}
      {adder && adder.added.length > 0 && (
        <div aria-label="Added dependencies" className="mt-2">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Added this session</div>
          {adder.added.map((path) => (
            <div key={path} className="font-mono text-[10px] text-emerald-300">{path}</div>
          ))}
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
