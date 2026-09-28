import { useEffect, useMemo, useRef, useState } from 'react';
import { Empty, fmt, Head } from './inspector/shared';
import { normalizeAssetPath, resolveActionScriptFile, type AssetCache } from '../lib/assets';
import { analyzeCode, type AssetDescriptor } from '../lib/codeInspector';
import { buildBundle, buildFramesForContainer, bundleToText, DEFAULT_EXPORT, downloadBundle, downloadJson, displayName, triggerDownload, type ExportOptions } from '../lib/exporter';
import type { ProjectApi } from '../lib/project';
import { flatten } from '../lib/render';
import { CodeInspector } from './CodeInspector';
import { defaultActorCapabilities, type ActorAction, type ActorClassification, type ActorCombatMode, type ActorFacing, type ActorLayer, type ActorMirrorSide, type ActorMovementSlot, type ActorSequence, type AssetBundle, type CharacterKind, type FlattenedSprite, type Project, type SwfDocument, type Timeline } from '../types';
import { TWIPS } from '../types';
import { cn } from '../utils/cn';
import { charName } from './Sidebar';
import { Button, Chip, EVENT_COLOR, Field, KIND_COLOR, TagInput, inputCls } from './ui';

// ---------------------------------------------------------------- code panel ----

function CodePanel({
  doc, timeline, selectedId, api, assets, onSelectAsset
}: {
  doc: SwfDocument; timeline: Timeline; selectedId: number | null; api: ProjectApi; assets: AssetBundle | null;
  onSelectAsset?: (assetId?: number, assetName?: string) => void;
}) {
  const [subTab, setSubTab] = useState<'inspector' | 'as' | 'ts'>('inspector');
  const [externalTexts, setExternalTexts] = useState<Record<string, string>>({});
  const loadingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // A new folder can contain a script with the same relative path as the
    // previous folder. Never display stale source from the old project.
    setExternalTexts({});
    loadingRef.current.clear();
  }, [assets]);

  const scriptFileForEvent = (event: typeof timeline.frames[number]['events'][number], frameIndex: number) => {
    if (!assets || event.kind !== 'action') return undefined;
    const refs = [event.externalActions, ...(event.externalActionCandidates ?? [])].filter(Boolean) as string[];
    return resolveActionScriptFile(assets, timeline, frameIndex, event.tagType, refs);
  };

  useEffect(() => {
    if (!assets) return;
    timeline.frames.forEach((f) => {
      f.events.forEach((e) => {
        if (e.kind !== 'action') return;
        const hit = scriptFileForEvent(e, f.index);
        if (!hit) return;
        const key = normalizeAssetPath(hit.path);
        if (externalTexts[key] || loadingRef.current.has(key)) return;
        loadingRef.current.add(key);
        hit.file.text().then((text) => {
          setExternalTexts((prev) => ({ ...prev, [key]: text }));
        });
      });
    });
  }, [assets, timeline.id]);

  const sourceForEvent = (event: typeof timeline.frames[number]['events'][number], frameIndex: number) => {
    const file = scriptFileForEvent(event, frameIndex);
    if (!file) return undefined;
    const text = externalTexts[normalizeAssetPath(file.path)];
    return text != null ? { file, text } : undefined;
  };

  const timelineActions = useMemo(() => {
    const lines: string[] = [];
    timeline.frames.forEach((f) => {
      f.events.forEach((e) => {
        if (e.kind === 'action') {
          lines.push(`// Frame ${f.index + 1} (${e.tagType})`);
          const source = sourceForEvent(e, f.index);
          if (source) {
            lines.push(`// Source: ${source.file.path}`);
            lines.push(source.text.trim());
          } else if (scriptFileForEvent(e, f.index)) {
            lines.push(`// Loading ActionScript source: ${scriptFileForEvent(e, f.index)!.path}`);
          } else {
            lines.push(e.detail);
          }
          lines.push('');
        }
      });
    });
    return lines.join('\n').trim();
  }, [timeline, externalTexts, assets]);

  const charActions = useMemo(() => {
    if (selectedId == null) return '';
    const ch = doc.characters.get(selectedId);
    if (!ch) return '';
    const lines: string[] = [];
    Object.entries(ch.attrs).forEach(([k, v]) => {
      if (k.toLowerCase().includes('action') || k.toLowerCase().includes('bytes')) {
        lines.push(`// Asset Attribute: ${k}`);
        lines.push(v);
        lines.push('');
      }
    });
    return lines.join('\n').trim();
  }, [doc, selectedId]);

  const allASCode = useMemo(() => {
    const parts = [];
    if (charActions) parts.push(charActions);
    if (timelineActions) {
      parts.push(`// Timeline: ${timeline.name}`);
      parts.push(timelineActions);
    }
    return parts.join('\n\n') || '// No ActionScript code or bytecode attached to this character or timeline.';
  }, [charActions, timelineActions, timeline]);

  // Collect every ActionScript source blob for the static inspector: one per
  // frame action on this timeline, plus the selected character's own actions.
  const codeSources = useMemo(() => {
    const sources: { label: string; source: string }[] = [];
    timeline.frames.forEach((f) => {
      f.events.forEach((e) => {
        if (e.kind !== 'action') return;
        const source = sourceForEvent(e, f.index);
        const fileLabel = source?.file.path.split('/').pop() ?? e.tagType.replace('Tag', '');
        sources.push({ label: `Frame ${f.index + 1} · ${fileLabel}`, source: source?.text ?? e.detail });
      });
    });
    if (charActions) sources.unshift({ label: `Character actions · ${selectedId != null ? `#${selectedId}` : timeline.name}`, source: charActions });
    return sources;
  }, [timeline, externalTexts, assets, charActions, selectedId]);

  const assetDescriptors = useMemo<AssetDescriptor[]>(() => {
    const out: AssetDescriptor[] = [];
    doc.characters.forEach((ch) => {
      const names = new Set<string>();
      if (ch.className) names.add(ch.className);
      if (ch.exportName) names.add(ch.exportName);
      const label = api.project.characters[ch.id]?.name;
      if (label) names.add(label);
      names.add(`${ch.kind}_${ch.id}`);
      names.forEach((name) => out.push({ name, assetId: ch.id, assetKind: ch.kind }));
    });
    api.project.clips.forEach((c) => out.push({ name: c.name, assetKind: 'clip' }));
    return out;
  }, [doc, api.project]);

  const codeAnalysis = useMemo(() => analyzeCode(codeSources, assetDescriptors), [codeSources, assetDescriptors]);

  const generatedTS = useMemo(() => {
    const className = selectedId != null ? (doc.characters.get(selectedId)?.className || `Character_${selectedId}`) : 'MyCharacter';
    const cleanClassName = className.replace(/[^A-Za-z0-9_]+/g, '_');
    const clips = api.project.clips.filter((c) => c.timelineId === timeline.id);
    const containers = (api.project.containers ?? []).filter((c) => c.timelineId === timeline.id);

    const clipLines = clips.length
      ? clips.map(c => `this.registerClip("${c.name}", ${c.start}, ${c.end}, ${c.loop});`).join('\n    ')
      : `// No clips defined yet. Create clips on the timeline to generate registrations.\n    // Example: this.registerClip("run", 0, 15, true);`;

    const containerLines = containers.length
      ? containers.map(c => `this.registerAnimation("${c.name}", ${c.startFrame}, ${c.endFrame});`).join('\n    ')
      : `// No contained ranges defined yet. Highlight timeline cells & right-click to "Contain" animations.\n    // Example: this.registerAnimation("jump", 16, 24);`;

    const sourceActions = timeline.frames.flatMap((f) => f.events
      .filter((e) => e.kind === 'action')
        .map((e) => ({ frame: f.index, source: sourceForEvent(e, f.index) })))
      .filter((entry) => !!entry.source);
    const sourceMap = sourceActions.length
      ? sourceActions.map((entry) => `  ${entry.frame}: ${JSON.stringify(entry.source!.text)}`).join(',\n')
      : '  // External .as files are loaded when available for this timeline.';

    const activeCases = timeline.frames.map(f => {
      const hasLabel = f.label ? `// Label: ${f.label}` : '';
      const acts = f.events.filter(e => e.kind === 'action' || e.kind === 'sound');
      if (!acts.length && !f.label) return null;
      const triggers = acts.map(a => {
        const source = sourceForEvent(a, f.index);
        if (a.kind === 'sound') {
          return `this.playSound(${a.characterId == null ? 'undefined' : a.characterId});`;
        }
        const fallback = source?.text ?? a.detail;
        return `this.emit('action', { frame: ${f.index}, tag: ${JSON.stringify(a.tagType)}, source: this.originalActionScript[${f.index}] ?? ${JSON.stringify(fallback)} });`;
      }).join('\n        ');
      const labelCode = f.label ? `this.emit('label', ${JSON.stringify(f.label)});` : '';
      return `case ${f.index}: ${hasLabel}\n        ${labelCode}${labelCode && triggers ? '\n        ' : ''}${triggers || '// Trigger animations or state changes'}\n        break;`;
    }).filter(Boolean);

    const switchBody = activeCases.length
      ? `switch (frameIndex) {\n      ${activeCases.join('\n      ')}\n    }`
      : `// No frame actions or labels found in this timeline.\n    // (Add frame markers or labels in the timeline bar below the stage to generate triggers.)\n    /*\n    switch (frameIndex) {\n      case 0:\n        // Play frame specific audio or execute scripts\n        break;\n    }\n    */`;

    return `import { Sprite, Animation } from 'game-engine';

/**
 * Modern Type-safe wrapper for ${className}
 * Extracted from SWF: isolated from Flash timeline engine.
 */
export class ${cleanClassName} extends Sprite {
  constructor() {
    super();
    this.totalFrames = ${timeline.frameCount};
    this.frameRate = ${doc.header.frameRate};
    
    // Register animations
    ${clipLines}
    ${containerLines}
  }

  /** Original JPEXS ActionScript, preserved while the TypeScript port is authored. */
  private readonly originalActionScript: Record<number, string> = {
${sourceMap}
  };

  getOriginalActionScript(frameIndex: number): string {
    return this.originalActionScript[frameIndex] ?? '';
  }

  // Frame event trigger callback
  onFrameUpdate(frameIndex: number) {
    ${switchBody}
  }
}
`;
  }, [doc, timeline, selectedId, api, assets, externalTexts]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex border-b border-zinc-850">
        {([
          ['inspector', 'Code Inspector'],
          ['as', 'ActionScript'],
          ['ts', 'TypeScript'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={cn(
              'flex-1 py-1.5 border-b-2 text-center text-[11px] font-medium transition',
              subTab === id
                ? id === 'inspector' ? 'border-violet-500 text-violet-200' : id === 'as' ? 'border-amber-500 text-amber-200' : 'border-sky-500 text-sky-200'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'inspector' ? (
        <CodeInspector analysis={codeAnalysis} onSelectAsset={onSelectAsset} />
      ) : subTab === 'as' ? (
        <div className="space-y-2">
          <div className="text-[10px] text-zinc-500 leading-relaxed uppercase tracking-wider font-semibold">
            Extracted decompiled AS1/2/3 actions
          </div>
          <pre className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900 overflow-auto max-h-[450px] font-mono text-[10px] leading-relaxed text-amber-200/90 whitespace-pre-wrap select-text">
            {allASCode}
          </pre>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] text-zinc-500 leading-relaxed uppercase tracking-wider font-semibold">
            Auto-generated TS Game Component
          </div>
          <pre className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900 overflow-auto max-h-[450px] font-mono text-[10px] leading-relaxed text-sky-200/90 whitespace-pre select-text">
            {generatedTS}
          </pre>
        </div>
      )}
    </div>
  );
}

export function Inspector(props: {
  doc: SwfDocument;
  cache: AssetCache;
  assets: AssetBundle | null;
  api: ProjectApi;
  selectedId: number | null;
  onSelect: (id: number) => void;
  timeline: Timeline;
  frame: number;
  selectedPath?: string;
  onPickPath: (p: string | undefined) => void;
  onOpenTimeline: (id: string) => void;
  setFrame: (f: number) => void;
  setLoopRange: (r: [number, number] | null) => void;
  selectedActorId: string | null;
  flattenedSprites: FlattenedSprite[];
  flatteningId: number | null;
  onFlattenSprite: (characterId: number) => void;
}) {
  const [tab, setTab] = useState<'label' | 'frame' | 'clips' | 'actors' | 'code' | 'export'>('label');
  useEffect(() => {
    if (props.selectedActorId) setTab('actors');
  }, [props.selectedActorId]);
  const tabs: [typeof tab, string][] = [
    ['label', 'Label'],
    ['frame', 'Frame'],
    ['clips', 'Clips'],
    ['actors', 'Actors'],
    ['code', 'Code'],
    ['export', 'Export'],
  ];
  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex border-b border-zinc-800">
        {tabs.map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 border-b-2 px-1 py-2 text-[11px] font-medium',
              tab === t ? 'border-violet-500 text-violet-200' : 'border-transparent text-zinc-500 hover:text-zinc-300',
            )}
          >{l}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'label' && <LabelPanel {...props} />}
        {tab === 'frame' && <FramePanel {...props} />}
        {tab === 'clips' && <ClipsPanel {...props} />}
        {tab === 'actors' && <ActorPanel {...props} />}
        {tab === 'code' && (
          <CodePanel
            {...props}
            onSelectAsset={(assetId) => {
              if (assetId != null) {
                props.onSelect(assetId);
                setTab('label');
              }
            }}
          />
        )}
        {tab === 'export' && <ExportPanel {...props} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- label ----

function LabelPanel({ doc, cache, api, selectedId, onSelect, onOpenTimeline, flattenedSprites, flatteningId, onFlattenSprite }: {
  doc: SwfDocument; cache: AssetCache; api: ProjectApi; selectedId: number | null;
  onSelect: (id: number) => void; onOpenTimeline: (id: string) => void;
  flattenedSprites: FlattenedSprite[]; flatteningId: number | null; onFlattenSprite: (characterId: number) => void;
}) {
  if (selectedId == null) return <Empty>Select a character in the library or click something on stage.</Empty>;
  const ch = doc.characters.get(selectedId);
  if (!ch) return <Empty>Character #{selectedId} is referenced but never defined in this XML.</Empty>;
  const lbl = api.project.characters[ch.id] ?? { tags: [] };
  const prev = cache.preview(ch.id, ch.kind);
  const asset = cache.get(ch.id, ch.kind, ch.bounds);
  const usedBy = [...doc.characters.values()].filter((c) => c.uses.includes(ch.id));
  const flattened = flattenedSprites.find((sprite) => sprite.characterId === ch.id);

  return (
    <div className="space-y-4 p-3">
      <div className="flex gap-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-zinc-800 bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)] bg-[length:12px_12px]">
          {prev && /svg|png|jpg|jpeg|gif/.test(prev.ext)
            ? <img src={prev.url} alt="" className="max-h-24 max-w-24 object-contain" />
            : <span className="text-[10px] text-zinc-600">{ch.kind}</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <Chip className={KIND_COLOR[ch.kind]}>{ch.kind}</Chip>
            <Chip>#{ch.id}</Chip>
            {!!ch.frameCount && <Chip>{ch.frameCount} frames</Chip>}
            {!!(ch.specialFrames ?? 0) && <Chip className="border-rose-500/40 bg-rose-500/10 text-rose-300">{ch.specialFrames}★ special</Chip>}
          </div>
          <div className="truncate text-zinc-500" title={ch.tagType}>{ch.tagType}</div>
          {ch.className && <div className="truncate text-emerald-400">class: {ch.className}</div>}
          {ch.exportName && <div className="truncate text-emerald-400">export: {ch.exportName}</div>}
          <div className="text-zinc-600">
            {ch.bounds
              ? `bounds ${fmt(ch.bounds.xMin / TWIPS)}, ${fmt(ch.bounds.yMin / TWIPS)} → ${fmt((ch.bounds.xMax - ch.bounds.xMin) / TWIPS)}×${fmt((ch.bounds.yMax - ch.bounds.yMin) / TWIPS)} px`
              : 'no bounds in XML'}
          </div>
          <div className={cn('truncate', prev ? 'text-zinc-500' : 'text-rose-400')} title={prev?.path}>
            {prev ? prev.path : 'no matching asset file'}
          </div>
        </div>
      </div>

      {ch.timelineId && (
        <Button variant="primary" className="w-full" onClick={() => onOpenTimeline(ch.timelineId!)}>
          ▶ Open timeline on stage
        </Button>
      )}

      {ch.kind === 'sprite' && ch.timelineId && (
        <div className="space-y-2 rounded-lg border border-fuchsia-900/40 bg-fuchsia-950/10 p-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-300">Flattened PNG frames</div>
              <div className="text-[10px] text-zinc-500">Merges nested shapes/images by SWF depth order.</div>
            </div>
            <Button
              variant="primary"
              disabled={flatteningId === ch.id}
              onClick={() => onFlattenSprite(ch.id)}
            >{flatteningId === ch.id ? 'rendering…' : flattened ? 'rebuild' : 'flatten sprite'}</Button>
          </div>
          {flattened && (
            <>
              <div className="text-[10px] text-zinc-500">{flattened.frames.length} transparent PNGs · {flattened.frames[0]?.width}×{flattened.frames[0]?.height}px first frame</div>
              <div className="grid max-h-48 grid-cols-4 gap-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/70 p-1">
                {flattened.frames.map((asset) => (
                  <button
                    key={asset.id}
                    className="group relative aspect-square overflow-hidden rounded border border-zinc-800 bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)] bg-[length:8px_8px] hover:border-fuchsia-500"
                    title={`Frame ${asset.frame + 1} · ${asset.width}×${asset.height}px`}
                    onClick={() => triggerDownload(asset.blob, asset.path.split('/').pop() ?? `frame_${asset.frame + 1}.png`)}
                  >
                    <img src={asset.url} alt={`Flattened frame ${asset.frame + 1}`} className="h-full w-full object-contain" />
                    <span className="absolute inset-x-0 bottom-0 bg-zinc-950/80 text-[9px] text-zinc-300">f{asset.frame + 1}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {ch.kind === 'sound' && prev && <audio controls src={prev.url} className="w-full" />}
      {(ch.kind === 'text' || ch.kind === 'edittext') && asset.text && (
        <pre className="max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-900 p-2 text-[11px] text-zinc-300">{asset.text}</pre>
      )}

      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <Field label="Export name" hint="becomes the key in characters.json">
          <input
            className={inputCls}
            value={lbl.name ?? ''}
            placeholder={ch.className || ch.exportName || `${ch.kind}_${ch.id}`}
            onChange={(e) => api.setLabel(ch.id, { name: e.target.value })}
          />
        </Field>
        <Field label="Category">
          <input
            className={inputCls}
            list="category-suggestions"
            value={lbl.category ?? ''}
            placeholder="character / prop / ui / fx / background…"
            onChange={(e) => api.setLabel(ch.id, { category: e.target.value })}
          />
          <datalist id="category-suggestions">
            {api.categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label="Tags">
          <TagInput tags={lbl.tags ?? []} suggestions={api.allTags} onChange={(t) => api.setLabel(ch.id, { tags: t })} />
        </Field>
        <Field label="Notes">
          <textarea
            className={cn(inputCls, 'h-16 resize-none')}
            value={lbl.notes ?? ''}
            onChange={(e) => api.setLabel(ch.id, { notes: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={!!lbl.ignore} onChange={(e) => api.setLabel(ch.id, { ignore: e.target.checked })} />
          exclude from export (dead / editor-only asset)
        </label>
      </div>

      {!!ch.uses.length && (
        <Related title={`Uses ${ch.uses.length}`} ids={ch.uses} doc={doc} project={api.project} onSelect={onSelect} />
      )}
      {!!usedBy.length && (
        <Related title={`Used by ${usedBy.length}`} ids={usedBy.map((c) => c.id)} doc={doc} project={api.project} onSelect={onSelect} />
      )}
    </div>
  );
}

function Related({ title, ids, doc, project, onSelect }: {
  title: string; ids: number[]; doc: SwfDocument; project: Project; onSelect: (id: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</div>
      <div className="flex flex-wrap gap-1">
        {ids.slice(0, 60).map((id) => {
          const c = doc.characters.get(id);
          return (
            <Chip key={id} onClick={() => onSelect(id)} className={c ? KIND_COLOR[c.kind] : 'border-rose-500/40 text-rose-300'}>
              {c ? charName(c, project) : `#${id} missing`}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- frame ----

function FramePanel({ doc, timeline, frame, api, onSelect, selectedPath, onPickPath }: {
  doc: SwfDocument; timeline: Timeline; frame: number; api: ProjectApi;
  onSelect: (id: number) => void; selectedPath?: string; onPickPath: (p: string | undefined) => void;
}) {
  const f = timeline.frames[frame];
  const flat = useMemo(() => flatten(doc, timeline, frame), [doc, timeline, frame]);
  if (!f) return <Empty>Empty timeline.</Empty>;
  const notable = f.events.filter((e) => e.kind !== 'place' && e.kind !== 'remove');

  return (
    <div className="space-y-4 p-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-medium text-zinc-200">{timeline.name} · frame {frame + 1}</div>
        {f.special
          ? <Chip className="border-rose-500/40 bg-rose-500/10 text-rose-300">non‑placement content</Chip>
          : <Chip className="border-zinc-700 text-zinc-500">placement only</Chip>}
      </div>
      {f.label && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-200">
          frame label: <b>{f.label}</b>
        </div>
      )}

      <div>
        <Head>Tags on this frame</Head>
        {notable.length === 0 && <p className="text-zinc-600">Only PlaceObject2 / RemoveObject2 — safe to convert mechanically.</p>}
        <div className="space-y-1">
          {notable.map((e, i) => (
            <div key={i} className={cn('flex items-start gap-2 rounded border px-2 py-1',
              e.kind === 'action' ? 'border-rose-500/30 bg-rose-500/5'
                : e.kind === 'sound' ? 'border-cyan-500/30 bg-cyan-500/5'
                : e.kind === 'label' ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-violet-500/30 bg-violet-500/5')}>
              <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-sm', EVENT_COLOR[e.kind].dot)} />
              <div className="min-w-0">
                <div className={cn('font-medium', EVENT_COLOR[e.kind].text)}>{e.tagType}</div>
                <div className="break-words text-zinc-400">{e.detail}</div>
                {e.characterId != null && (
                  <button className="text-violet-400 hover:underline" onClick={() => onSelect(e.characterId!)}>
                    → character #{e.characterId}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {notable.length > 0 && (
          <Button
            className="mt-2 w-full"
            onClick={() => {
              for (const e of notable) {
                api.addMarker({
                  timelineId: timeline.id, frame,
                  type: e.kind === 'action' ? 'action' : e.kind === 'sound' ? 'sound' : 'marker',
                  name: e.kind === 'label' ? e.detail : `${e.tagType}`,
                  payload: e.detail, tags: [e.kind],
                });
              }
            }}
          >＋ turn these into markers</Button>
        )}
      </div>

      <div>
        <Head>Keyframe ops ({f.ops.length})</Head>
        <div className="space-y-0.5">
          {f.ops.map((o, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-zinc-900/70 px-2 py-1">
              <span className={cn('w-12 shrink-0 text-[10px] uppercase',
                o.op === 'place' ? 'text-emerald-400' : o.op === 'remove' ? 'text-zinc-500' : 'text-sky-400')}>{o.op}</span>
              <span className="w-10 shrink-0 text-zinc-600">d{o.depth}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-300">
                {o.characterId != null ? `#${o.characterId}` : '—'} {o.name ? `“${o.name}”` : ''}
                {o.matrix ? ` · ${fmt(o.matrix.tx / TWIPS)},${fmt(o.matrix.ty / TWIPS)}px` : ''}
                {o.clipDepth ? ` · mask→${o.clipDepth}` : ''}
                {o.blendMode && o.blendMode !== 'Normal' ? ` · ${o.blendMode}` : ''}
                {o.hasFilters ? ' · filters' : ''}
              </span>
              {o.tagType !== 'PlaceObject2Tag' && o.tagType !== 'RemoveObject2Tag' && (
                <Chip className="border-violet-500/40 text-violet-300">{o.tagType.replace('Tag', '')}</Chip>
              )}
            </div>
          ))}
          {!f.ops.length && <p className="text-zinc-600">No placement changes on this frame.</p>}
        </div>
      </div>

      <div>
        <Head>Display list ({flat.filter((x) => x.level === 0).length} top‑level / {flat.length} total)</Head>
        <div className="space-y-0.5">
          {flat.map((x) => {
            const ch = doc.characters.get(x.item.characterId);
            return (
              <div
                key={x.path}
                onClick={() => { onPickPath(x.path); if (ch) onSelect(ch.id); }}
                className={cn('flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-800',
                  selectedPath === x.path && 'bg-violet-600/25')}
                style={{ paddingLeft: 4 + x.level * 10 }}
              >
                <span className="w-8 shrink-0 text-[10px] text-zinc-600">d{x.item.depth}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-300">
                  {ch ? charName(ch, api.project) : `#${x.item.characterId} missing`}
                  {x.item.name && <span className="text-zinc-500"> “{x.item.name}”</span>}
                </span>
                <span className="shrink-0 text-[10px] text-zinc-600">
                  {fmt(x.world.tx / TWIPS)},{fmt(x.world.ty / TWIPS)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- actors ----

type ActorDependencyTab = 'code' | 'images' | 'sounds';

const ACTOR_MOVEMENT_SLOTS: { key: ActorMovementSlot; label: string }[] = [
  { key: 'idle', label: 'Idle' },
  { key: 'moveLeft', label: 'Move left' },
  { key: 'moveRight', label: 'Move right' },
  { key: 'moveUp', label: 'Move up' },
  { key: 'moveDown', label: 'Move down' },
  { key: 'moveLeftUp', label: 'Move left + up' },
  { key: 'moveRightUp', label: 'Move right + up' },
  { key: 'moveLeftDown', label: 'Move left + down' },
  { key: 'moveRightDown', label: 'Move right + down' },
];

const ACTOR_FACING_SLOTS: { key: ActorFacing; label: string }[] = [
  { key: 'front-left', label: 'Front-left' },
  { key: 'front-right', label: 'Front-right' },
  { key: 'back-left', label: 'Back-left' },
  { key: 'back-right', label: 'Back-right' },
];

const ACTOR_WALK_SLOTS: { key: 'left' | 'right' | 'up' | 'down'; label: string }[] = [
  { key: 'left', label: 'Walk left' },
  { key: 'right', label: 'Walk right' },
  { key: 'up', label: 'Walk up' },
  { key: 'down', label: 'Walk down' },
];

const ACTOR_COMBAT_OPTIONS: { value: ActorCombatMode; label: string }[] = [
  { value: 'none', label: 'No Combat' },
  { value: 'combat', label: 'Combat' },
  { value: 'canAttack', label: 'Can Attack' },
  { value: 'canBeAttacked', label: 'Can Be Attacked' },
];

const ACTOR_CLASSIFICATIONS: ActorClassification[] = ['Monster', 'Item', 'Item Scene', 'Item Inventory', 'Scenery', 'NPC', 'Player', 'Prop', 'Effect', 'Other'];
const ACTOR_LAYERS: ActorLayer[] = ['Background', 'World', 'Foreground', 'HUD'];

function normalizeActorKey(value: string) {
  const key = value.trim().toLowerCase();
  return key === ' ' || key === 'spacebar' ? 'space' : key;
}

function ActorPanel({ doc, cache, api, selectedActorId, onOpenTimeline, setFrame, setLoopRange }: {
  doc: SwfDocument;
  cache: AssetCache;
  api: ProjectApi;
  selectedActorId: string | null;
  onOpenTimeline: (id: string) => void;
  setFrame: (f: number) => void;
  setLoopRange: (r: [number, number] | null) => void;
}) {
  const [dependencyTab, setDependencyTab] = useState<ActorDependencyTab>('code');
  const [newActionName, setNewActionName] = useState('');
  const [newActionTarget, setNewActionTarget] = useState('');
  const [newBindingKey, setNewBindingKey] = useState('');
  const [newBindingAction, setNewBindingAction] = useState('');
  const [newSequenceName, setNewSequenceName] = useState('');
  const actor = (api.project.actors ?? []).find((a) => a.id === selectedActorId);
  if (!actor) return <Empty>Select or create an actor from the Actors list.</Empty>;

  const clips = api.project.clips;
  const assigned = new Set(actor.clipIds);
  const capabilities = actor.capabilities ?? defaultActorCapabilities();
  const assignedClips = clips.filter((clip) => assigned.has(clip.id));
  const canAttack = capabilities.combat === 'combat' || capabilities.combat === 'canAttack';
  const canBeAttacked = capabilities.combat === 'combat' || capabilities.combat === 'canBeAttacked';
  const updateCapabilities = (patch: Partial<typeof capabilities>) => {
    api.updateActor(actor.id, { capabilities: { ...capabilities, ...patch } });
  };
  const actions: ActorAction[] = actor.actions ?? [];
  const sequences: ActorSequence[] = actor.sequences ?? [];
  const keyBindings = actor.keyBindings ?? {};
  const actionId = () => Math.random().toString(36).slice(2, 10);
  const targetOptions = [
    ...assignedClips.map((clip) => ({ value: `clip:${clip.id}`, label: `Clip · ${clip.name}` })),
    ...sequences.map((sequence) => ({ value: `sequence:${sequence.id}`, label: `Sequence · ${sequence.name}` })),
  ];
  const clipFrames = assignedClips.flatMap((clip) => {
    const timeline = doc.timelines.get(clip.timelineId);
    return (clip.frames ?? (timeline ? buildFramesForContainer(timeline, clip.start, clip.end) : [])).map((frameData) => ({
      ...frameData,
      clipName: clip.name,
      clipId: clip.id,
    }));
  });

  const codeEvents = clipFrames.flatMap((frameData) => frameData.events
    .filter((event) => event.kind === 'action')
    .map((event) => ({ ...event, clipName: frameData.clipName, frame: frameData.index })));
  const soundEvents = clipFrames.flatMap((frameData) => frameData.events
    .filter((event) => event.kind === 'sound')
    .map((event) => ({ ...event, clipName: frameData.clipName, frame: frameData.index })));

  const imageDependencies = collectActorImageDependencies(doc, api.project, cache, clipFrames.map((frameData) => frameData.instances.map((instance) => instance.characterId)).flat());
  const soundDependencies = new Map<string, { id?: number; name: string; preview?: ReturnType<AssetCache['preview']>; frames: string[] }>();
  soundEvents.forEach((event) => {
    const id = event.characterId;
    const key = id == null ? 'stream' : `sound:${id}`;
    const current = soundDependencies.get(key) ?? {
      id,
      name: id == null ? 'Streaming audio' : doc.characters.get(id) ? charName(doc.characters.get(id)!, api.project) : `Sound #${id}`,
      preview: id == null ? undefined : cache.preview(id, 'sound'),
      frames: [],
    };
    current.frames.push(`${event.clipName} · f${event.frame + 1}`);
    soundDependencies.set(key, current);
  });

  return (
    <div className="space-y-4 p-3 text-xs">
      <div className="space-y-2 rounded-lg border border-emerald-900/40 bg-emerald-950/10 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xl text-emerald-300">♙</span>
          <input
            className={cn(inputCls, 'flex-1 font-semibold text-emerald-200')}
            value={actor.name}
            onChange={(e) => api.updateActor(actor.id, { name: e.target.value })}
          />
          <Button variant="danger" onClick={() => api.removeActor(actor.id)}>×</Button>
        </div>
        <Field label="Notes">
          <textarea
            className={cn(inputCls, 'h-16 resize-none')}
            value={actor.notes ?? ''}
            onChange={(e) => api.updateActor(actor.id, { notes: e.target.value })}
            placeholder="Role, state machine notes, gameplay ownership…"
          />
        </Field>
        <Field label="Tags">
          <TagInput tags={actor.tags} suggestions={api.allTags} onChange={(tags) => api.updateActor(actor.id, { tags })} />
        </Field>
        <Field label="Classifications" hint="Use these as gameplay/content categories in the engine export.">
          <div className="grid grid-cols-2 gap-1">
            {ACTOR_CLASSIFICATIONS.map((classification) => {
              const selected = (actor.classifications ?? []).includes(classification);
              return (
                <label key={classification} className={cn('flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11px]', selected ? 'border-emerald-600/50 bg-emerald-500/10 text-emerald-200' : 'border-zinc-800 text-zinc-500')}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      const next = new Set(actor.classifications ?? []);
                      event.target.checked ? next.add(classification) : next.delete(classification);
                      api.updateActor(actor.id, { classifications: [...next] });
                    }}
                    className="accent-emerald-500"
                  />
                  {classification}
                </label>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Runtime layer" hint="HUD always renders above World.">
            <select className={inputCls} value={actor.layer ?? 'World'} onChange={(e) => api.updateActor(actor.id, { layer: e.target.value as ActorLayer })}>
              {ACTOR_LAYERS.map((layer) => <option key={layer} value={layer}>{layer} Layer</option>)}
            </select>
          </Field>
          <Field label="Depth" hint="Higher draws later within the layer.">
            <input type="number" className={inputCls} value={actor.depth ?? 0} onChange={(e) => api.updateActor(actor.id, { depth: Number(e.target.value) || 0 })} />
          </Field>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-amber-900/40 bg-amber-950/10 p-3">
        <div className="flex items-center justify-between">
          <Head>Gameplay capabilities</Head>
          <span className="text-[10px] text-zinc-600">drives generated actor data</span>
        </div>
        <Field label="Combat mode" hint="Combat enables both attack and defense capability sets.">
          <select
            className={inputCls}
            value={capabilities.combat}
            onChange={(e) => updateCapabilities({ combat: e.target.value as ActorCombatMode })}
          >
            {ACTOR_COMBAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>

        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={capabilities.canMove}
            onChange={(e) => updateCapabilities({ canMove: e.target.checked })}
            className="accent-amber-500"
          />
          Can Move
        </label>

        {capabilities.canMove && (
          <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Movement animations</div>
            {!assignedClips.length && <div className="text-[10px] text-zinc-600">Assign clips above to populate these selectors.</div>}
            <div className="grid grid-cols-2 gap-2">
              {ACTOR_MOVEMENT_SLOTS.map((slot) => (
                <label key={slot.key} className="block">
                  <span className="mb-1 block text-[10px] text-zinc-500">{slot.label}</span>
                  <select
                    className={cn(inputCls, 'py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-35')}
                    value={capabilities.movementClips[slot.key] ?? ''}
                    onChange={(e) => updateCapabilities({ movementClips: { ...capabilities.movementClips, [slot.key]: e.target.value || undefined } })}
                  >
                    <option value="">Not assigned</option>
                    {assignedClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={!!capabilities.canWalk}
            onChange={(e) => updateCapabilities({ canWalk: e.target.checked })}
            className="accent-amber-500"
          />
          Can Walk
        </label>

        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Invert one facing side</div>
          <div className="flex rounded border border-zinc-800 bg-zinc-950/50 p-0.5">
            {([
              ['none', 'None'],
              ['left', 'Invert left'],
              ['right', 'Invert right'],
            ] as [ActorMirrorSide, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => updateCapabilities({ mirrorSide: value, useFlippedAnimations: value !== 'none' })}
                className={cn(
                  'flex-1 rounded px-1.5 py-1 text-[10px] font-medium',
                  (capabilities.mirrorSide ?? (capabilities.useFlippedAnimations ? 'right' : 'none')) === value
                    ? 'bg-amber-500/20 text-amber-200'
                    : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300',
                )}
              >{label}</button>
            ))}
          </div>
          <div className="text-[10px] text-zinc-600">The selected side is generated from the opposite side and its selectors are disabled.</div>
        </div>

        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Optional idle facing animations</div>
          <div className="grid grid-cols-2 gap-2">
            {ACTOR_FACING_SLOTS.map((slot) => (
              <label key={slot.key} className="block">
                <span className="mb-1 block text-[10px] text-zinc-500">{slot.label}</span>
                <select
                    className={cn(inputCls, 'py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-35')}
                    disabled={(capabilities.mirrorSide ?? (capabilities.useFlippedAnimations ? 'right' : 'none')) === (slot.key.includes('left') ? 'left' : 'right')}
                  value={capabilities.idleAnimations?.[slot.key] ?? ''}
                  onChange={(e) => updateCapabilities({ idleAnimations: { ...capabilities.idleAnimations, [slot.key]: e.target.value || undefined } })}
                >
                  <option value="">Not assigned</option>
                  {assignedClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>

        {capabilities.canWalk && (
          <div className="space-y-2 rounded border border-amber-500/20 bg-amber-500/5 p-2">
            <div className="text-[10px] uppercase tracking-wider text-amber-300">Walking animations</div>
            <div className="text-[10px] text-zinc-500">Held WASD moves the actor through the runtime world and selects these clips.</div>
            <div className="grid grid-cols-2 gap-2">
              {ACTOR_WALK_SLOTS.map((slot) => (
                <label key={slot.key} className="block">
                  <span className="mb-1 block text-[10px] text-zinc-500">{slot.label}</span>
                  <select
                    className={cn(inputCls, 'py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-35')}
                    disabled={(capabilities.mirrorSide ?? (capabilities.useFlippedAnimations ? 'right' : 'none')) === ((slot.key === 'left') ? 'left' : (slot.key === 'right') ? 'right' : 'none')}
                    value={capabilities.walkingClips?.[slot.key] ?? ''}
                    onChange={(e) => updateCapabilities({ walkingClips: { ...capabilities.walkingClips, [slot.key]: e.target.value || undefined } })}
                  >
                    <option value="">Not assigned</option>
                    {assignedClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        {canAttack && (
          <div className="space-y-2 rounded border border-rose-900/40 bg-rose-950/10 p-2">
            <div className="text-[10px] uppercase tracking-wider text-rose-300">Attack animations</div>
            {!assignedClips.length && <div className="text-[10px] text-zinc-600">Assign clips above to select attack animations.</div>}
            <div className="grid grid-cols-2 gap-1">
              {assignedClips.map((clip) => (
                <label key={clip.id} className="flex items-center gap-1.5 rounded px-1 py-1 text-[11px] text-zinc-300 hover:bg-zinc-900">
                  <input
                    type="checkbox"
                    checked={capabilities.attackClipIds.includes(clip.id)}
                    onChange={(e) => {
                      const next = new Set(capabilities.attackClipIds);
                      e.target.checked ? next.add(clip.id) : next.delete(clip.id);
                      updateCapabilities({ attackClipIds: [...next] });
                    }}
                    className="accent-rose-500"
                  />
                  <span className="truncate">{clip.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {canBeAttacked && (
          <Field label="Defense animation" hint="Used when this actor receives damage or is targeted by an attack.">
            <select
              className={inputCls}
              value={capabilities.defenseClipId ?? ''}
              onChange={(e) => updateCapabilities({ defenseClipId: e.target.value || undefined })}
            >
              <option value="">Not assigned</option>
              {assignedClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
            </select>
          </Field>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-sky-900/40 bg-sky-950/10 p-3">
        <div className="flex items-center justify-between">
          <Head>Keyboard actions & sequences</Head>
          <span className="text-[10px] text-zinc-600">used by Game Engine</span>
        </div>

        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Create action</div>
          <div className="flex gap-1">
            <input className={cn(inputCls, 'flex-1 py-1 text-[11px]')} value={newActionName} onChange={(e) => setNewActionName(e.target.value)} placeholder="action name, e.g. throw" />
            <select className={cn(inputCls, 'w-40 py-1 text-[11px]')} value={newActionTarget} onChange={(e) => setNewActionTarget(e.target.value)}>
              <option value="">target…</option>
              {targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <Button
              className="py-1 text-[11px]"
              disabled={!newActionName.trim() || !newActionTarget}
              onClick={() => {
                const [kind, id] = newActionTarget.split(':');
                const action: ActorAction = { id: actionId(), name: newActionName.trim(), ...(kind === 'clip' ? { clipId: id } : { sequenceId: id }) };
                api.updateActor(actor.id, { actions: [...actions, action] });
                setNewActionName(''); setNewActionTarget('');
              }}
            >＋</Button>
          </div>
          <div className="space-y-1">
            {actions.map((action) => {
              const target = action.clipId ? assignedClips.find((clip) => clip.id === action.clipId)?.name : sequences.find((sequence) => sequence.id === action.sequenceId)?.name;
              return (
                <div key={action.id} className="flex items-center gap-2 rounded bg-zinc-900 px-2 py-1 text-[11px]">
                  <span className="flex-1 text-zinc-200">{action.name}</span>
                  <span className="truncate text-zinc-500">{target ?? 'missing target'}</span>
                  <button className="text-zinc-600 hover:text-rose-400" onClick={() => {
                    api.updateActor(actor.id, { actions: actions.filter((item) => item.id !== action.id), keyBindings: Object.fromEntries(Object.entries(keyBindings).filter(([, id]) => id !== action.id)) });
                  }}>×</button>
                </div>
              );
            })}
            {!actions.length && <div className="text-[10px] text-zinc-600">Create an action, then bind it to a keyboard key below.</div>}
          </div>
        </div>

        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Keyboard bindings</div>
          <div className="flex gap-1">
            <input className={cn(inputCls, 'w-28 py-1 text-[11px]')} value={newBindingKey} onChange={(e) => setNewBindingKey(e.target.value)} placeholder="key, e.g. Space" />
            <select className={cn(inputCls, 'flex-1 py-1 text-[11px]')} value={newBindingAction} onChange={(e) => setNewBindingAction(e.target.value)}>
              <option value="">action…</option>
              {actions.map((action) => <option key={action.id} value={action.id}>{action.name}</option>)}
            </select>
            <Button
              className="py-1 text-[11px]"
              disabled={!newBindingKey.trim() || !newBindingAction}
              onClick={() => {
                const key = normalizeActorKey(newBindingKey);
                api.updateActor(actor.id, { keyBindings: { ...keyBindings, [key]: newBindingAction } });
                setNewBindingKey(''); setNewBindingAction('');
              }}
            >＋</Button>
          </div>
          {Object.entries(keyBindings).map(([key, actionIdValue]) => (
            <div key={key} className="flex items-center gap-2 rounded bg-zinc-900 px-2 py-1 text-[11px]">
              <span className="min-w-16 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-center text-sky-200">{key}</span>
              <span className="flex-1 text-zinc-300">{actions.find((action) => action.id === actionIdValue)?.name ?? 'missing action'}</span>
              <button className="text-zinc-600 hover:text-rose-400" onClick={() => {
                const next = { ...keyBindings }; delete next[key]; api.updateActor(actor.id, { keyBindings: next });
              }}>×</button>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Animation sequences</div>
          <div className="flex gap-1">
            <input className={cn(inputCls, 'flex-1 py-1 text-[11px]')} value={newSequenceName} onChange={(e) => setNewSequenceName(e.target.value)} placeholder="sequence name, e.g. throw" />
            <Button
              className="py-1 text-[11px]"
              disabled={!newSequenceName.trim()}
              onClick={() => {
                const sequence: ActorSequence = { id: actionId(), name: newSequenceName.trim(), steps: [], loop: false };
                api.updateActor(actor.id, { sequences: [...sequences, sequence] });
                setNewSequenceName('');
              }}
            >＋ sequence</Button>
          </div>
          {sequences.map((sequence) => (
            <div key={sequence.id} className="space-y-2 rounded border border-zinc-800 bg-zinc-900 p-2">
              <div className="flex items-center gap-1">
                <input className={cn(inputCls, 'flex-1 py-1 text-[11px]')} value={sequence.name} onChange={(e) => api.updateActor(actor.id, { sequences: sequences.map((item) => item.id === sequence.id ? { ...item, name: e.target.value } : item) })} />
                <label className="flex items-center gap-1 text-[10px] text-zinc-500"><input type="checkbox" checked={!!sequence.loop} onChange={(e) => api.updateActor(actor.id, { sequences: sequences.map((item) => item.id === sequence.id ? { ...item, loop: e.target.checked } : item) })} /> loop</label>
                <button className="text-zinc-600 hover:text-rose-400" onClick={() => api.updateActor(actor.id, { sequences: sequences.filter((item) => item.id !== sequence.id), actions: actions.filter((action) => action.sequenceId !== sequence.id) })}>×</button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {sequence.steps.map((step, index) => (
                  <span key={`${step.clipId}-${index}`} className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200">
                    {assignedClips.find((clip) => clip.id === step.clipId)?.name ?? 'missing clip'}
                    <button className="text-violet-400 hover:text-rose-300" onClick={() => api.updateActor(actor.id, { sequences: sequences.map((item) => item.id === sequence.id ? { ...item, steps: item.steps.filter((_, stepIndex) => stepIndex !== index) } : item) })}>×</button>
                  </span>
                ))}
                {!sequence.steps.length && <span className="text-[10px] text-zinc-600">No steps yet.</span>}
              </div>
              <select
                className={cn(inputCls, 'py-1 text-[11px]')}
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  api.updateActor(actor.id, { sequences: sequences.map((item) => item.id === sequence.id ? { ...item, steps: [...item.steps, { clipId: e.target.value }] } : item) });
                }}
              >
                <option value="">＋ add clip step…</option>
                {assignedClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
              </select>
            </div>
          ))}
          {!sequences.length && <div className="text-[10px] text-zinc-600">Build ordered sequences such as throw → release → reset, then bind them to a key.</div>}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Head>Assigned Clips ({actor.clipIds.length})</Head>
        <span className="text-[10px] text-zinc-600">clip frames are snapshotted</span>
      </div>

      <div className="space-y-1.5">
        {clips.map((clip) => {
          const checked = assigned.has(clip.id);
          const frameInfo = clip.frames ?? [];
          const eventCount = frameInfo.reduce((n, f) => n + f.events.length, 0);
          const soundCount = frameInfo.reduce((n, f) => n + f.events.filter((e) => e.kind === 'sound').length, 0);
          const codeCount = frameInfo.reduce((n, f) => n + f.events.filter((e) => e.kind === 'action').length, 0);
          return (
            <div
              key={clip.id}
              className={cn('rounded border p-2 transition', checked ? 'border-emerald-700/60 bg-emerald-950/15' : 'border-zinc-800 bg-zinc-900/50')}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => api.assignClip(actor.id, clip.id, e.target.checked)}
                  className="mt-1 accent-emerald-500"
                  title="Assign clip to actor"
                />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => { onOpenTimeline(clip.timelineId); setFrame(clip.start); setLoopRange([clip.start, clip.end]); }}
                >
                  <div className="truncate font-medium text-zinc-200">{clip.name}</div>
                  <div className="text-[10px] text-zinc-500">
                    {clip.end - clip.start + 1} frames · {frameInfo.length || 'legacy'} frame data
                  </div>
                </button>
                <span className="text-[10px] text-zinc-600">{clip.loop ? 'loop' : 'once'}</span>
              </div>
              <div className="mt-1 pl-6 text-[10px] text-zinc-500">
                {eventCount} events · <span className="text-rose-300/80">{codeCount} code</span> · <span className="text-cyan-300/80">{soundCount} sounds</span>
              </div>
            </div>
          );
        })}
        {!clips.length && <p className="rounded border border-dashed border-zinc-800 p-3 text-center text-zinc-600">Create a clip from a highlighted timeline range first.</p>}
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <div className="mb-2 flex border-b border-zinc-800">
          {([
            ['code', 'Code', codeEvents.length],
            ['images', 'Images', imageDependencies.length],
            ['sounds', 'Sounds', soundDependencies.size],
          ] as const).map(([tab, label, count]) => (
            <button
              key={tab}
              onClick={() => setDependencyTab(tab)}
              className={cn(
                'flex-1 border-b-2 px-2 py-1.5 text-[11px] font-medium',
                dependencyTab === tab ? 'border-emerald-500 text-emerald-200' : 'border-transparent text-zinc-500 hover:text-zinc-300',
              )}
            >{label} <span className="text-[10px] text-zinc-600">{count}</span></button>
          ))}
        </div>

        {dependencyTab === 'code' && (
          <ActorCodeDependencies events={codeEvents} />
        )}
        {dependencyTab === 'images' && (
          <ActorImageDependencies dependencies={imageDependencies} />
        )}
        {dependencyTab === 'sounds' && (
          <ActorSoundDependencies dependencies={[...soundDependencies.values()]} />
        )}
      </div>
    </div>
  );
}

interface ActorImageDependency {
  id: number;
  name: string;
  kind: CharacterKind;
  path?: string;
  url?: string;
  frames: number;
  missing: boolean;
}

function collectActorImageDependencies(doc: SwfDocument, project: Project, cache: AssetCache, ids: number[]): ActorImageDependency[] {
  const imageKinds = new Set<CharacterKind>(['shape', 'morphshape', 'bitmap', 'text', 'edittext']);
  const seen = new Set<number>();
  const output = new Map<number, ActorImageDependency>();
  const visit = (id: number, frameCount: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const character = doc.characters.get(id);
    if (!character) return;
    const childTimeline = character.timelineId ? doc.timelines.get(character.timelineId) : undefined;
    if (childTimeline) {
      childTimeline.frames.forEach((frame) => frame.display.forEach((display) => visit(display.characterId, frameCount + 1)));
    }
    if (!imageKinds.has(character.kind)) return;
    const preview = cache.preview(id, character.kind);
    output.set(id, {
      id,
      name: charName(character, project),
      kind: character.kind,
      path: preview?.path,
      url: preview?.url,
      frames: frameCount,
      missing: !preview,
    });
  };
  ids.forEach((id) => visit(id, 1));
  return [...output.values()].sort((a, b) => a.id - b.id);
}

function ActorCodeDependencies({ events }: { events: { detail: string; tagType: string; clipName: string; frame: number; externalActions?: string }[] }) {
  if (!events.length) return <Empty>No ActionScript events in the assigned clips.</Empty>;
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-zinc-500">ActionScript required by assigned clips, grouped by source frame.</div>
      {events.map((event, index) => (
        <div key={`${event.clipName}-${event.frame}-${index}`} className="rounded border border-rose-500/20 bg-rose-500/5 p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-rose-300">
            <span>{event.clipName} · frame {event.frame + 1}</span>
            <span className="text-zinc-600">{event.externalActions ?? event.tagType}</span>
          </div>
          <pre className="max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-zinc-300">{event.detail}</pre>
        </div>
      ))}
    </div>
  );
}

function ActorImageDependencies({ dependencies }: { dependencies: ActorImageDependency[] }) {
  if (!dependencies.length) return <Empty>No image or shape dependencies in the assigned clips.</Empty>;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-zinc-500">Leaf image dependencies discovered from each clip display list, including nested sprites.</div>
      {dependencies.map((dependency) => (
        <div key={dependency.id} className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/50 p-1.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-zinc-800 bg-zinc-950">
            {dependency.url ? <img src={dependency.url} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-[9px] text-rose-400">missing</span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-zinc-200">{dependency.name}</div>
            <div className="truncate text-[10px] text-zinc-500">{dependency.kind} #{dependency.id} · used {dependency.frames}×</div>
            <div className={cn('truncate text-[10px]', dependency.missing ? 'text-rose-400' : 'text-zinc-600')}>{dependency.path ?? 'no matching asset file'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActorSoundDependencies({ dependencies }: { dependencies: { id?: number; name: string; preview?: ReturnType<AssetCache['preview']>; frames: string[] }[] }) {
  if (!dependencies.length) return <Empty>No sound dependencies in the assigned clips.</Empty>;
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-zinc-500">Sound assets triggered by assigned clip frames.</div>
      {dependencies.map((dependency) => (
        <div key={`${dependency.id ?? 'stream'}-${dependency.name}`} className="rounded border border-cyan-500/20 bg-cyan-500/5 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-cyan-200">{dependency.name} {dependency.id != null && <span className="text-[10px] text-zinc-500">#{dependency.id}</span>}</span>
            {dependency.preview && <audio controls preload="none" src={dependency.preview.url} className="h-7 max-w-40" />}
          </div>
          <div className="mt-1 text-[10px] text-zinc-500">{dependency.frames.join(' · ')}</div>
          {!dependency.preview && <div className="mt-1 text-[10px] text-rose-400">No exported sound file matched this SWF sound ID.</div>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- clips ----

function ClipsPanel({ api, timeline, frame, setAll, onOpenTimeline, setFrame, setLoopRange }: {
  api: ProjectApi; timeline: Timeline; frame: number; setAll?: boolean;
  onOpenTimeline: (id: string) => void; setFrame: (f: number) => void;
  setLoopRange: (r: [number, number] | null) => void;
}) {
  const [showAll, setShowAll] = useState(!!setAll);
  const [expandedContainer, setExpandedContainer] = useState<string | null>(null);

  const clips = api.project.clips.filter((c) => showAll || c.timelineId === timeline.id);
  const markers = api.project.markers.filter((m) => showAll || m.timelineId === timeline.id);
  const containers = (api.project.containers ?? []).filter((c) => showAll || c.timelineId === timeline.id);

  return (
    <div className="space-y-4 p-3 text-xs">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <Head>Contained Animations ({containers.length})</Head>
        <label className="flex items-center gap-1 text-[10px] text-zinc-500">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> all timelines
        </label>
      </div>

      <p className="text-[10px] text-zinc-500 italic">
        💡 Drag-select frame cells on the timeline and right-click to "Contain" a range into a game-engine-ready animation structure!
      </p>

      {containers.map((c) => {
        const isExp = expandedContainer === c.id;
        return (
          <div
            key={c.id}
            className="space-y-2 rounded-lg border border-violet-900/30 bg-violet-950/10 p-2.5 cursor-pointer hover:bg-violet-950/15"
            onClick={() => {
              onOpenTimeline(c.timelineId);
              setFrame(c.startFrame);
              setLoopRange([c.startFrame, c.endFrame]);
            }}
          >
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                className={cn(inputCls, 'flex-1 font-semibold text-violet-300')}
                value={c.name}
                placeholder="Animation Name"
                onChange={(e) => api.updateContainer(c.id, { name: e.target.value })}
              />
              <Button variant="ghost" onClick={() => setExpandedContainer(isExp ? null : c.id)} title="Toggle frames detail">
                {isExp ? '▲' : '▼'}
              </Button>
              <Button variant="danger" onClick={() => api.removeContainer(c.id)}>×</Button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-400 px-1">
              <span>Frames: <b>{c.startFrame + 1} – {c.endFrame + 1}</b> ({c.frameCount} frames)</span>
              {showAll && <span className="text-zinc-600 truncate max-w-[120px]">{c.timelineId}</span>}
            </div>

            {isExp && (
              <div className="mt-2 space-y-1.5 border-t border-zinc-850 pt-2 max-h-48 overflow-y-auto pr-1">
                {c.frames.map((fr) => (
                  <div key={fr.index} className="rounded border border-zinc-800 bg-zinc-900/50 p-1.5 space-y-1 text-[11px]">
                    <div className="flex justify-between font-medium text-zinc-300">
                      <span>Frame {fr.index + 1} <span className="text-[9px] text-zinc-500">(abs {fr.absoluteFrame + 1})</span></span>
                      {fr.label && <span className="text-amber-300 bg-amber-500/10 px-1 rounded text-[9px] font-semibold">▸{fr.label}</span>}
                    </div>
                    {fr.events.length > 0 && (
                      <div className="space-y-0.5">
                        {fr.events.map((ev, evIdx) => (
                          <div key={evIdx} className="text-[10px] text-rose-300/90 bg-rose-500/5 border border-rose-500/10 px-1 rounded truncate">
                            ⚡ {ev.tagType.replace('Tag', '')}: {ev.detail}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-500 flex flex-wrap gap-1 leading-none mt-1">
                      {fr.instances.map((inst, instIdx) => (
                        <span key={instIdx} className="bg-zinc-800 border border-zinc-700/60 px-1 py-0.5 rounded">
                          d{inst.depth}: #{inst.characterId}{inst.name ? ` "${inst.name}"` : ''}
                        </span>
                      ))}
                      {fr.instances.length === 0 && <span className="italic">no active instances</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <TagInput tags={c.tags} suggestions={api.allTags} onChange={(t) => api.updateContainer(c.id, { tags: t })} />
          </div>
        );
      })}

      {containers.length === 0 && (
        <p className="text-center p-3 text-zinc-600 border border-dashed border-zinc-800 rounded bg-zinc-900/10">
          No contained animations yet.
        </p>
      )}

      <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
        <Head>Clips ({clips.length})</Head>
      </div>
      <Button
        className="w-full"
        variant="primary"
        onClick={() => api.addClip({
          timelineId: timeline.id, name: `clip_${clips.length + 1}`,
          start: frame, end: Math.min(timeline.frameCount - 1, frame + 9), loop: true, tags: [],
          frames: buildFramesForContainer(timeline, frame, Math.min(timeline.frameCount - 1, frame + 9)),
        })}
      >＋ new clip at playhead</Button>

      {clips.map((c) => (
        <div
          key={c.id}
          className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 cursor-pointer hover:bg-zinc-900"
          onClick={() => {
            onOpenTimeline(c.timelineId);
            setFrame(c.start);
            setLoopRange([c.start, c.end]);
          }}
        >
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              className={cn(inputCls, 'flex-1')}
              value={c.name}
              onChange={(e) => api.updateClip(c.id, { name: e.target.value })}
            />
            <Button variant="danger" onClick={() => api.removeClip(c.id)}>×</Button>
          </div>
          <div className="flex items-center gap-1">
            <NumBox label="from" value={c.start + 1} onChange={(v) => api.updateClip(c.id, { start: Math.max(0, v - 1) })} />
            <NumBox label="to" value={c.end + 1} onChange={(v) => api.updateClip(c.id, { end: Math.max(0, v - 1) })} />
            <label className="flex items-center gap-1 text-[10px] text-zinc-400">
              <input type="checkbox" checked={c.loop} onChange={(e) => api.updateClip(c.id, { loop: e.target.checked })} /> loop
            </label>
            <span className="ml-auto text-[10px] text-zinc-600">{c.end - c.start + 1}f</span>
          </div>
          {showAll && <div className="text-[10px] text-zinc-600">{c.timelineId}</div>}
          <TagInput tags={c.tags} suggestions={api.allTags} onChange={(t) => api.updateClip(c.id, { tags: t })} />
        </div>
      ))}

      <Head>Markers ({markers.length})</Head>
      <div className="space-y-1 border-t border-zinc-900 pt-2">
        {markers.sort((a, b) => a.frame - b.frame).map((m) => (
          <div key={m.id} className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1">
            <span className="w-10 shrink-0 text-[10px] text-zinc-500">f{m.frame + 1}</span>
            <span className="w-12 shrink-0 text-[10px] uppercase text-violet-300">{m.type}</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-zinc-200 outline-none"
              value={m.name}
              onChange={(e) => api.updateMarker(m.id, { name: e.target.value })}
            />
            <button className="text-zinc-600 hover:text-rose-400" onClick={() => api.removeMarker(m.id)}>×</button>
          </div>
        ))}
        {!markers.length && <p className="text-zinc-600">No markers yet — add them from the strip below the stage.</p>}
      </div>
    </div>
  );
}

function NumBox({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-zinc-500">
      {label}
      <input
        type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-100"
      />
    </label>
  );
}

// --------------------------------------------------------------- export ----

function ExportPanel({ doc, api, assets, flattenedSprites }: { doc: SwfDocument; api: ProjectApi; assets: AssetBundle | null; flattenedSprites: FlattenedSprite[] }) {
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

// ---------------------------------------------------------------- utils ----
// Head, Empty, fmt are now in ./inspector/shared (imported at the top of this file).
