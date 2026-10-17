// The files a loaded session's movies may request at run time, and "Add
// Dependency": the Execute tab's way to put a missing file into the session for
// testing, under the path the movie asked for.
//
// A SWF becomes one more loaded movie (loadMovie and Loader find loaded SWFs by
// name); anything else joins the uploaded files (XML, MP3, CSS, …). Either way
// the Execute tab's player is rebuilt with them, so the game restarts and its
// requests find the files from the first frame. A result that arrives after the
// session changed (New folder, another load) is dropped.
import { useCallback, useMemo, useRef, useState } from 'react';
import type { DependencyAddition, DependencyFiles } from '../engine/flash/dependencies';
import type { SwfPackage } from '../lib/assets';
import { addSessionDependencies } from '../lib/swfLoading';
import type { DependencyAdder } from './MissingDependencies';

export function useSessionDependencies(options: {
  /** the session's generation: it changes whenever another session starts */
  generation: () => number;
  /** added SWFs, to join the session's loaded movies */
  onPackages: (packages: SwfPackage[]) => void;
  /** an added SWF's cache has new content (thumbnails, …) */
  onChange?: () => void;
}) {
  const [files, setFiles] = useState<DependencyFiles | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const filesRef = useRef(files);
  const opts = useRef(options);
  opts.current = options;

  /** A new session: its uploaded files, nothing added yet. */
  const reset = useCallback((next: DependencyFiles | null) => {
    filesRef.current = next;
    setFiles(next);
    setAdded([]);
  }, []);

  const add = useCallback(async (additions: DependencyAddition[]) => {
    if (!additions.length) return;
    const generation = opts.current.generation();
    const current = () => opts.current.generation() === generation;
    const result = await addSessionDependencies(additions, filesRef.current, () => { if (current()) opts.current.onChange?.(); });
    if (!current()) {
      result.packages.forEach((p) => p.cache.dispose());
      return;
    }
    if (result.packages.length) opts.current.onPackages(result.packages);
    filesRef.current = result.dependencyFiles;
    setFiles(result.dependencyFiles);
    setAdded((paths) => [...paths.filter((p) => !result.added.includes(p)), ...result.added]);
  }, []);

  const adder = useMemo<DependencyAdder>(() => ({ add, added }), [add, added]);
  return { files, adder, reset };
}
