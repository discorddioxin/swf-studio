import { useEffect, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { CodePanel } from './inspector/CodePanel';
import type { AssetCache } from '../lib/assets';
import type { ProjectApi } from '../lib/project';
import { type AssetBundle, type FlattenedSprite, type SwfDocument, type Timeline } from '../types';
import { cn } from '../utils/cn';
import { ActorPanel } from './inspector/ActorPanel';
import { ClipsPanel } from './inspector/ClipsPanel';
import { ExportPanel } from './inspector/ExportPanel';
import { FramePanel } from './inspector/FramePanel';
import { LabelPanel } from './inspector/LabelPanel';

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
        <ErrorBoundary label={`${tabs.find(([t]) => t === tab)?.[1] ?? 'Inspector'} panel`} resetKeys={[tab, props.doc, props.timeline, props.selectedId]}>
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
        </ErrorBoundary>
      </div>
    </div>
  );
}
