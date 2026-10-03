import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';
import { cn } from '../utils/cn';
import { fetchBundledManifest, type BundledSwf } from '../lib/bundled';
import { collectSwfSources, type SwfSource } from '../lib/swfSources';

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

const selectCls =
  'max-w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-violet-500';

export function Loader({ onFiles, onBundled, busy, error }: {
  /** `mainKey` is the SwfSource.key the user picked as the main movie (null = the default) */
  onFiles: (files: File[], mainKey: string | null) => void;
  /** `mainName` is the manifest `name` of the bundled SWF that plays the game */
  onBundled?: (mainName: string | null) => void;
  busy?: string | null; error?: string | null;
}) {
  const dirRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [sources, setSources] = useState<SwfSource[]>([]);
  const [scanning, setScanning] = useState(false);
  const [mainKey, setMainKey] = useState<string | null>(null);
  const [bundled, setBundled] = useState<BundledSwf[]>([]);
  const [bundledMain, setBundledMain] = useState<string | null>(null);

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

  // Every SWF the queue holds — also the ones inside ZIPs, whose name table is
  // read without unpacking anything. The user picks which one plays the game.
  useEffect(() => {
    let cancelled = false;
    if (!queuedFiles.length) { setSources([]); setMainKey(null); setScanning(false); return; }
    setScanning(true);
    collectSwfSources(queuedFiles)
      .then((list) => {
        if (cancelled) return;
        setSources(list);
        setMainKey((current) => (current && list.some((s) => s.key === current) ? current : list[0]?.key ?? null));
      })
      .finally(() => { if (!cancelled) setScanning(false); });
    return () => { cancelled = true; };
  }, [queuedFiles]);

  // The bundled set is fixed, so its drop-down is filled as soon as the Loader
  // shows. A manifest that cannot be fetched is reported by the button itself.
  useEffect(() => {
    if (!onBundled) return;
    let cancelled = false;
    fetchBundledManifest()
      .then((entries) => {
        if (cancelled) return;
        setBundled(entries);
        setBundledMain((current) => current ?? entries[0]?.name ?? null);
      })
      .catch(() => { /* the button reports the failure */ });
    return () => { cancelled = true; };
  }, [onBundled]);

  const chosen = sources.find((s) => s.key === mainKey);
  const dependencies = sources.filter((s) => s !== chosen);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-950 p-8 text-zinc-200">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-2xl shadow-lg shadow-violet-900/40">
            ⚒
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">SWF Forge</h1>
          <p className="text-sm text-zinc-400">
            Inspect, play back, label and tag a SWF or a JPEXS XML dump — then export a clean JSON bundle
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
              <p className="text-sm text-zinc-400">Add SWFs, FFDec export folders or ZIPs</p>
              <p className="mt-1 text-xs text-zinc-600">
                [name].swf · [name].xml · shapes/ · morphshapes/ · images/ · buttons/ · sounds/ · texts/ · fonts/
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Button variant={queuedFiles.length ? 'default' : 'primary'} onClick={() => dirRef.current?.click()}>＋ Add folder</Button>
                <Button onClick={() => filesRef.current?.click()}>＋ Add files / ZIPs</Button>
                <Button variant={queuedFiles.length ? 'primary' : 'ghost'} disabled={!queuedFiles.length} onClick={() => onFiles(queuedFiles, mainKey)}>Load {queuedFiles.length ? `${queuedFiles.length} files` : 'selection'}</Button>
              </div>
              {onBundled && (
                <div className="mt-5 border-t border-zinc-800 pt-4">
                  <p className="text-xs text-zinc-500">…or play the game files bundled with this repo</p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    {bundled.length > 0 && (
                      <select
                        aria-label="Bundled main SWF"
                        className={selectCls}
                        value={bundledMain ?? ''}
                        onChange={(event) => setBundledMain(event.target.value)}
                      >
                        {bundled.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
                      </select>
                    )}
                    <Button variant="ghost" onClick={() => onBundled(bundledMain)} title="Parse the raw .swf binaries shipped with this repo — no upload needed">Use bundled SWFs</Button>
                  </div>
                  {bundled.length > 0 && (
                    <p className="mt-1 text-[11px] text-zinc-600">
                      The selected SWF plays the game; the other {bundled.length - 1} load as dependencies.
                    </p>
                  )}
                </div>
              )}
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
            accept=".zip,.swf,application/zip,application/x-zip-compressed,application/x-shockwave-flash"
            className="hidden"
            onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) addToQueue(f); e.currentTarget.value = ''; }}
          />
        </div>

        {!!queuedFiles.length && (
          <div className="space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-violet-200">{queuedFiles.length} file{queuedFiles.length === 1 ? '' : 's'} queued from one or more sources</span>
              <button className="text-zinc-500 hover:text-rose-300" onClick={() => { setQueuedFiles([]); setMainKey(null); }}>clear</button>
            </div>
            {scanning ? (
              <p className="text-xs text-zinc-500">Looking for SWFs in the selection…</p>
            ) : sources.length ? (
              <div className="space-y-1">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Main SWF · plays the game</span>
                  <select
                    aria-label="Main SWF"
                    className={cn(selectCls, 'w-full py-1.5')}
                    value={mainKey ?? ''}
                    onChange={(event) => setMainKey(event.target.value)}
                  >
                    {sources.map((source) => (
                      <option key={source.key} value={source.key}>
                        {source.label}{source.kind === 'binary' ? ' (.swf)' : ' (.xml)'}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-[11px] text-zinc-500">
                  {dependencies.length
                    ? <>Loaded as dependencies: <span className="text-zinc-400">{dependencies.map((s) => s.stem).join(', ')}</span></>
                    : 'The only SWF in this selection.'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-amber-300/90">
                No .swf or .xml SWF in this selection yet — add a SWF binary or the folder of a JPEXS export.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">{error}</div>
        )}

        <div className="grid grid-cols-3 gap-3 text-xs text-zinc-500">
          {[
            ['Main SWF + dependencies', 'Pick which SWF plays the game; the other SWFs in the upload are loaded as its externals.'],
            ['Twip‑exact playback', 'Matrices are read as 16.16 fixed point, translations stay in twips until the final draw.'],
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
