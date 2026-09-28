import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';
import { cn } from '../utils/cn';

interface FSEntry {
  isFile: boolean; isDirectory: boolean; name: string; fullPath: string;
  file(cb: (f: File) => void, err?: (e: unknown) => void): void;
  createReader(): { readEntries(cb: (e: FSEntry[]) => void, err?: (e: unknown) => void): void };
}

async function readEntry(entry: FSEntry, prefix: string, out: File[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => entry.file(res, rej));
    Object.defineProperty(file, 'webkitRelativePath', { value: prefix + entry.name, configurable: true });
    out.push(file);
    return;
  }
  const reader = entry.createReader();
  let batch: FSEntry[] = [];
  do {
    batch = await new Promise<FSEntry[]>((res, rej) => reader.readEntries(res, rej));
    for (const e of batch) await readEntry(e, prefix + entry.name + '/', out);
  } while (batch.length);
}

export function Loader({ onFiles, busy, error, onDemo }: {
  onFiles: (files: File[]) => void; busy?: string | null; error?: string | null; onDemo?: () => void;
}) {
  const dirRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);

  const addToQueue = (files: File[]) => {
    setQueuedFiles((current) => {
      const seen = new Set(current.map((file) => `${(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}:${file.size}:${file.lastModified}`));
      return [...current, ...files.filter((file) => {
        const key = `${(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })];
    });
  };

  useEffect(() => {
    dirRef.current?.setAttribute('webkitdirectory', '');
    dirRef.current?.setAttribute('directory', '');
  }, []);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-950 p-8 text-zinc-200">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-2xl shadow-lg shadow-violet-900/40">
            ⚒
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">SWF Forge</h1>
          <p className="text-sm text-zinc-400">
            Inspect, play back, label and tag a JPEXS XML dump — then export a clean JSON bundle
            for a modern engine, free of the SWF main‑timeline model.
          </p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={async (e) => {
            e.preventDefault(); setDrag(false);
            const items = Array.from(e.dataTransfer.items);
            const entries = items
              .map((i) => (i as DataTransferItem & { webkitGetAsEntry(): FSEntry | null }).webkitGetAsEntry())
              .filter(Boolean) as unknown as FSEntry[];
            const out: File[] = [];
            if (entries.length) { for (const en of entries) await readEntry(en, '', out); }
            else out.push(...Array.from(e.dataTransfer.files));
            if (out.length) addToQueue(out);
          }}
          className={cn(
            'rounded-xl border-2 border-dashed p-10 text-center transition',
            drag ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-800 bg-zinc-900/40',
          )}
        >
          {busy ? (
            <div className="space-y-2">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-400" />
              <p className="text-sm text-zinc-400">{busy}</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-400">Add one or more assets folders or ZIPs</p>
              <p className="mt-1 text-xs text-zinc-600">
                [name].xml · shapes/ · morphshapes/ · images/ · buttons/ · sounds/ · texts/ · fonts/
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="primary" onClick={() => dirRef.current?.click()}>＋ Add folder</Button>
                <Button onClick={() => filesRef.current?.click()}>＋ Add ZIPs</Button>
                <Button variant="ghost" disabled={!queuedFiles.length} onClick={() => onFiles(queuedFiles)}>Load {queuedFiles.length ? `${queuedFiles.length} files` : 'selection'}</Button>
                {onDemo && <Button onClick={onDemo}>Load demo dump</Button>}
              </div>
            </>
          )}
          <input
            ref={dirRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) addToQueue(f); e.currentTarget.value = ''; }}
          />
          <input
            ref={filesRef}
            type="file"
            multiple
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) addToQueue(f); e.currentTarget.value = ''; }}
          />
        </div>

        {!!queuedFiles.length && (
          <div className="flex items-center justify-between rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs">
            <span className="text-violet-200">{queuedFiles.length} files queued from one or more sources</span>
            <button className="text-zinc-500 hover:text-rose-300" onClick={() => setQueuedFiles([])}>clear</button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">{error}</div>
        )}

        <div className="grid grid-cols-3 gap-3 text-xs text-zinc-500">
          {[
            ['Twip‑exact playback', 'Matrices are read as 16.16 fixed point, translations stay in twips until the final draw.'],
            ['Frame X‑ray', 'Any frame holding more than PlaceObject2 / RemoveObject2 is colour‑coded by what it holds.'],
            ['Engine‑ready JSON', 'Characters, timelines, clips, events, markers and tags in one cohesive bundle.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-1 font-medium text-zinc-300">{t}</div>
              <div className="leading-relaxed">{d}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-[11px] text-zinc-600">
          Everything runs locally in your browser — no upload, no server.
        </p>
      </div>
    </div>
  );
}
