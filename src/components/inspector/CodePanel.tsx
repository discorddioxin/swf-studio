// ---------------------------------------------------------------- code panel ----
// Inspector "Code" tab: Code Inspector + ActionScript + TypeScript sub-tabs.

import { useMemo, useState } from 'react';
import { resolveActionScriptFile } from '../../lib/assets';
import { analyzeCode, buildAssetDescriptors } from '../../lib/codeInspector';
import type { ProjectApi } from '../../lib/project';
import type { AssetBundle, SwfDocument, Timeline } from '../../types';
import { cn } from '../../utils/cn';
import { CodeInspector } from '../CodeInspector';
import { scriptKey, useScriptTexts } from '../useScriptTexts';

type TimelineEvent = Timeline['frames'][number]['events'][number];

/** `actionBytes`-style attributes, or values that are nothing but hex bytes. */
export function isBytecodeAttr(key: string, value: string): boolean {
  return /bytes/i.test(key) || /^(?:[0-9a-f]{2}[\s,]*){4,}$/i.test(value.trim());
}

export function CodePanel({
  doc, timeline, selectedId, api, assets, onSelectAsset
}: {
  doc: SwfDocument; timeline: Timeline; selectedId: number | null; api: ProjectApi; assets: AssetBundle | null;
  onSelectAsset?: (assetId?: number, assetName?: string) => void;
}) {
  const [subTab, setSubTab] = useState<'inspector' | 'as' | 'ts'>('inspector');

  const scriptFileForEvent = (event: TimelineEvent, frameIndex: number) => {
    if (!assets || event.kind !== 'action') return undefined;
    const refs = [event.externalActions, ...(event.externalActionCandidates ?? [])].filter(Boolean) as string[];
    return resolveActionScriptFile(assets, timeline, frameIndex, event.tagType, refs);
  };

  // Every external script referenced by this timeline. Loading is scoped to the
  // asset bundle, so switching folders can never surface stale source.
  const scriptFiles = useMemo(
    () => timeline.frames.flatMap((f) => f.events.map((e) => scriptFileForEvent(e, f.index))),
    [assets, timeline],
  );
  const { texts: externalTexts, failed: failedScripts } = useScriptTexts(scriptFiles, assets);

  const sourceForEvent = (event: TimelineEvent, frameIndex: number) => {
    const file = scriptFileForEvent(event, frameIndex);
    if (!file) return undefined;
    const text = externalTexts[scriptKey(file)];
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
            const file = scriptFileForEvent(e, f.index)!;
            const error = failedScripts[scriptKey(file)];
            if (error) {
              lines.push(`// Could not read ActionScript source ${file.path}: ${error}`);
              lines.push(e.detail);
            } else {
              lines.push(`// Loading ActionScript source: ${file.path}`);
            }
          } else {
            lines.push(e.detail);
          }
          lines.push('');
        }
      });
    });
    return lines.join('\n').trim();
  }, [timeline, externalTexts, failedScripts, assets]);

  // Character attributes that carry actions. Raw bytecode (`actionBytes`,
  // hex dumps) is shown in the ActionScript view but is not source code, so it
  // is kept away from the static analyzer.
  const charActionAttrs = useMemo(() => {
    if (selectedId == null) return [];
    const ch = doc.characters.get(selectedId);
    if (!ch) return [];
    return Object.entries(ch.attrs)
      .filter(([k]) => k.toLowerCase().includes('action') || k.toLowerCase().includes('bytes'))
      .map(([k, v]) => ({ key: k, value: v, isBytecode: isBytecodeAttr(k, v) }));
  }, [doc, selectedId]);

  const formatAttrs = (attrs: typeof charActionAttrs) =>
    attrs.flatMap(({ key, value }) => [`// Asset Attribute: ${key}`, value, '']).join('\n').trim();
  const charActions = useMemo(() => formatAttrs(charActionAttrs), [charActionAttrs]);
  const charSource = useMemo(() => formatAttrs(charActionAttrs.filter((a) => !a.isBytecode)), [charActionAttrs]);

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
    if (charSource) sources.unshift({ label: `Character actions · ${selectedId != null ? `#${selectedId}` : timeline.name}`, source: charSource });
    // Two actions on one frame (e.g. DoAction + DoInitAction without files)
    // would otherwise share a label; labels are user-facing, so disambiguate.
    const seen = new Map<string, number>();
    return sources.map((s) => {
      const n = (seen.get(s.label) ?? 0) + 1;
      seen.set(s.label, n);
      return n > 1 ? { ...s, label: `${s.label} (${n})` } : s;
    });
  }, [timeline, externalTexts, assets, charSource, selectedId]);

  const assetDescriptors = useMemo(() => buildAssetDescriptors(doc, api.project), [doc, api.project]);

  const codeAnalysis = useMemo(() => analyzeCode(codeSources, assetDescriptors), [codeSources, assetDescriptors]);

  const generatedTS = useMemo(() => {
    const className = selectedId != null ? (doc.characters.get(selectedId)?.className || `Character_${selectedId}`) : 'MyCharacter';
    const cleanClassName = className.replace(/[^A-Za-z0-9_]+/g, '_');
    const clips = api.project.clips.filter((c) => c.timelineId === timeline.id);
    const containers = (api.project.containers ?? []).filter((c) => c.timelineId === timeline.id);

    // Clip ranges defined in SWF Studio (0-based in the project → 1-based AS3 frames).
    const ranges = [
      ...clips.map((c) => ({ name: c.name, first: c.start + 1, last: c.end + 1, loop: c.loop })),
      ...containers.map((c) => ({ name: c.name, first: c.startFrame + 1, last: c.endFrame + 1, loop: false })),
    ];
    const clipTable = ranges.length
      ? ranges.map((r) => `    ${JSON.stringify(r.name)}: [${r.first}, ${r.last}, ${r.loop}],`).join('\n')
      : '    // No clips defined yet: create clips on the timeline, e.g.\n    // "run": [1, 16, true],';
    const labels = timeline.frames.filter((f) => f.label);
    const labelTable = labels.length
      ? labels.map((f) => `    ${JSON.stringify(f.label)}: ${f.index + 1},`).join('\n')
      : '    // This timeline has no frame labels.';

    const scripted = timeline.frames.map((f) => {
      const actions = f.events.filter((e) => e.kind === 'action');
      const sounds = f.events.filter((e) => e.kind === 'sound');
      if (!actions.length) return null;
      const original = actions.map((a) => sourceForEvent(a, f.index)?.text ?? a.detail).join('\n').trim();
      const commented = original
        ? original.replace(/\*\//g, '*\\/').split('\n').map((l) => `   *   ${l}`).join('\n')
        : '   *   (no decompiled source available)';
      const soundNote = sounds.length ? `\n   * Timeline sound(s) on this frame play automatically: ${sounds.map((x) => `#${x.characterId ?? '?'}`).join(', ')}.` : '';
      return {
        index: f.index,
        method: `frame${f.index + 1}`,
        body: `  /**\n   * Frame ${f.index + 1}${f.label ? ` (“${f.label}”)` : ''}. Original ActionScript:\n${commented}${soundNote}\n   */\n  private frame${f.index + 1}(): void {\n    // Port the original ActionScript above.\n  }`,
      };
    }).filter((x): x is { index: number; method: string; body: string } => x != null);

    const frameScripts = scripted.length
      ? `this.addFrameScript(\n      ${scripted.map((x) => `${x.index}, this.${x.method}`).join(',\n      ')},\n    );`
      : '// No frame scripts on this timeline.';

    return `import { MovieClip } from 'flash/display/MovieClip';
import { Event } from 'flash/events/Event';

/**
 * ${className}: class for timeline "${timeline.name}" (${timeline.frameCount} frame(s) at ${doc.header.frameRate} fps).
 *
 * Written against the AS3 API, so it runs on SWF Studio's engine (Execute tab)
 * exactly like the game's own transpiled classes: put this file in the loaded
 * folder and it is linked to the symbol through SymbolClass "${className}".
 */
export class ${cleanClassName} extends MovieClip {
  /** Frame labels on this timeline (1-based frame numbers). */
  static readonly LABELS: Record<string, number> = {
${labelTable}
  };

  /** Clips defined in SWF Studio: [first frame, last frame, loop] (1-based). */
  static readonly CLIPS: Record<string, [number, number, boolean]> = {
${clipTable}
  };

  private activeClip: [number, number, boolean] | null = null;

  constructor() {
    super();
    ${frameScripts}
    this.addEventListener(Event.ENTER_FRAME, this.updateClip);
  }

  /** Play a clip range; it loops or stops on its last frame. */
  playClip(name: string): void {
    const clip = ${cleanClassName}.CLIPS[name];
    if (!clip) return;
    this.activeClip = clip;
    this.gotoAndPlay(clip[0]);
  }

  private readonly updateClip = (): void => {
    const clip = this.activeClip;
    if (!clip || this.currentFrame < clip[1]) return;
    if (clip[2]) this.gotoAndPlay(clip[0]);
    else { this.gotoAndStop(clip[1]); this.activeClip = null; }
  };
${scripted.length ? '\n' + scripted.map((x) => x.body).join('\n\n') + '\n' : ''}}
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
