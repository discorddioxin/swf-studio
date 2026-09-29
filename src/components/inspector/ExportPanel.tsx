// Inspector "Export" tab.
// Extracted verbatim from Inspector.tsx (DECOMPOSITION_SPEC phases 3–10).

import { useMemo, useState } from 'react';
import { Head } from './shared';
import { buildBundle, bundleToText, DEFAULT_EXPORT, downloadBundle, downloadJson, displayName, type ExportOptions } from '../../lib/exporter';
import type { ProjectApi } from '../../lib/project';
import { type AssetBundle, type FlattenedSprite, type Project, type SwfDocument } from '../../types';
import { Button } from '../ui';

// --------------------------------------------------------------- export ----

export function ExportPanel({ doc, api, assets, flattenedSprites }: { doc: SwfDocument; api: ProjectApi; assets: AssetBundle | null; flattenedSprites: FlattenedSprite[] }) {
  const [opts, setOpts] = useState<ExportOptions>(DEFAULT_EXPORT);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const bundle = useMemo(() => buildBundle(doc, api.project, assets, opts, flattenedSprites), [doc, api.project, assets, opts, flattenedSprites]);
  const sizes = useMemo(() => {
    const texts = bundleToText(bundle, opts.pretty);
    return Object.entries(texts).map(([k, v]) => [k, v.length] as const);
  }, [bundle, opts.pretty]);
  const base = (doc.header.fileName || 'swf').replace(/\.xml$/i, '');

  return (
    <div className="space-y-4 p-3 text-xs">
      <Head>Bundle options</Head>
      <div className="space-y-1.5">
        {([
          ['resolvedDisplayLists', 'Resolved display list per frame (recommended)'],
          ['includeKeyframes', 'Raw keyframe ops (place / move / remove)'],
          ['pretty', 'Pretty-print JSON'],
          ['skipIgnored', 'Skip characters marked “exclude”'],
        ] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-zinc-400">
            <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
            {l}
          </label>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
        {sizes.map(([k, n]) => (
          <div key={k} className="flex items-center justify-between py-0.5">
            <button className="text-violet-300 hover:underline" onClick={() => setPreview(k)}>{k}</button>
            <span className="text-zinc-600">{(n / 1024).toFixed(1)} kB</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-zinc-800 pt-1 text-zinc-400">
          <span>total</span>
          <span>{(sizes.reduce((a, [, n]) => a + n, 0) / 1024).toFixed(1)} kB</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => { setBusy(true); await downloadBundle(bundle, opts, base, flattenedSprites); setBusy(false); }}
        >⬇ Download .zip</Button>
        <Button onClick={() => downloadJson(api.project, `${base}-labels.json`)}>⬇ labels only</Button>
        <label className="col-span-2">
          <span className="sr-only">import</span>
          <input
            type="file" accept="application/json" className="hidden"
            id="import-labels"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { api.importProject(JSON.parse(await f.text())); } catch { alert('Not a valid labels file'); }
            }}
          />
          <Button className="w-full" onClick={() => document.getElementById('import-labels')?.click()}>⬆ import labels JSON</Button>
        </label>
      </div>

      {preview && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Head>{preview}</Head>
            <button className="text-zinc-500 hover:text-zinc-200" onClick={() => setPreview(null)}>close</button>
          </div>
          <pre className="max-h-72 overflow-auto rounded border border-zinc-800 bg-zinc-900 p-2 text-[10px] leading-relaxed text-zinc-300">
            {JSON.stringify(bundle[preview], null, 2).slice(0, 20000)}
          </pre>
        </div>
      )}

      <Head>Parse report</Head>
      <div className="space-y-1 text-zinc-500">
        <div>{doc.stats.tags} tags · {doc.characters.size} characters · {doc.timelines.size} timelines</div>
        <div>frame rate {doc.header.frameRate} · main timeline {doc.root.frameCount} frames</div>
        {doc.warnings.map((w, i) => (
          <div key={i} className="rounded border border-amber-600/40 bg-amber-500/10 p-2 text-amber-200">{w}</div>
        ))}
        {assets && !!assets.files.length && (
          <div>{assets.files.length} asset files in “{assets.rootName}”</div>
        )}
      </div>
      <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2 text-[11px] leading-relaxed text-zinc-500">
        <b className="text-zinc-300">Naming:</b> every character exports as{' '}
        <code className="text-violet-300">{selectedName(doc, api.project)}</code>-style keys — label things first,
        then export; the same names are reused in timelines, clips, markers and the tag index.
      </div>
    </div>
  );
}

function selectedName(doc: SwfDocument, project: Project) {
  const first = [...doc.characters.values()][0];
  return first ? displayName(doc, project, first.id) : 'character_key';
}
