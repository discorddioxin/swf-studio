// Actors tab: code / image / sound dependency lists.
// Extracted verbatim from Inspector.tsx (DECOMPOSITION_SPEC phases 3–10).

import { Empty } from './shared';
import type { AssetCache } from '../../lib/assets';
import { cn } from '../../utils/cn';
import type { ActorImageDependency } from './actorHelpers';



export function ActorCodeDependencies({ events }: { events: { detail: string; tagType: string; clipName: string; frame: number; externalActions?: string }[] }) {
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

export function ActorImageDependencies({ dependencies }: { dependencies: ActorImageDependency[] }) {
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

export function ActorSoundDependencies({ dependencies }: { dependencies: { id?: number; name: string; preview?: ReturnType<AssetCache['preview']>; frames: string[] }[] }) {
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
