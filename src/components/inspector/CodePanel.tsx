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
    // Two actions on one frame (e.g. DoAction + DoInitAction without files)
    // would otherwise share a label; labels are user-facing, so disambiguate.
    const seen = new Map<string, number>();
    return sources.map((s) => {
      const n = (seen.get(s.label) ?? 0) + 1;
      seen.set(s.label, n);
      return n > 1 ? { ...s, label: `${s.label} (${n})` } : s;
    });
  }, [timeline, externalTexts, assets, charActions, selectedId]);

  const assetDescriptors = useMemo(() => buildAssetDescriptors(doc, api.project), [doc, api.project]);

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
