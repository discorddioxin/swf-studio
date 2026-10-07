import type { SwfDocument, Timeline } from '../types';
import type { TimelineNameIndex, TimelineNameMetadata } from '../../transpiler/as2/project';
import type { RunningTimelineSnapshot } from '../engine/as2/player';

const MAX_FRAME_CELLS = 36;

type FrameTone = 'action' | 'sound' | 'label' | 'other' | 'plain';

const FRAME_TONE_CLASS: Record<FrameTone, string> = {
  action: 'bg-rose-500/65',
  sound: 'bg-cyan-500/65',
  label: 'bg-amber-500/65',
  other: 'bg-violet-500/55',
  plain: 'bg-zinc-700/70',
};

export function RunningTimelinesSidebar({
  doc,
  timelines,
  timelineNames,
  playing,
}: {
  doc: SwfDocument;
  timelines: readonly RunningTimelineSnapshot[];
  timelineNames: TimelineNameIndex;
  playing: boolean;
}) {
  return (
    <aside
      aria-label="Running timelines"
      data-running-timelines-sidebar="true"
      className="flex w-[min(18rem,32vw)] min-w-[220px] max-w-72 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950"
    >
      <header className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-3">
        <div className="min-w-0">
          <h2 className="truncate text-[10px] font-semibold uppercase tracking-wider text-zinc-300">Running timelines</h2>
          <div className="text-[9px] text-zinc-600">Live MovieClip playheads</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-300" aria-label={`${timelines.length} running timelines`}>
            {timelines.length}
          </span>
          <span className={playing ? 'text-[8px] font-bold tracking-wider text-emerald-400' : 'text-[8px] font-bold tracking-wider text-amber-400'}>
            {playing ? 'LIVE' : 'PAUSED'}
          </span>
        </div>
      </header>

      <div role="list" aria-label="Active MovieClip timelines" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {timelines.map((timeline) => (
          <RunningTimelineRow
            key={timeline.id}
            doc={doc}
            timeline={timeline}
            title={timelineTitle(timeline, timelineNames)}
          />
        ))}
        {timelines.length === 0 && (
          <div className="flex h-full min-h-32 flex-col items-center justify-center px-4 text-center">
            <span aria-hidden="true" className="mb-2 text-xl text-zinc-700">▤</span>
            <p className="text-[11px] font-medium text-zinc-400">No running timelines</p>
            <p className="mt-1 max-w-56 text-[10px] leading-relaxed text-zinc-600">
              Playing multi-frame MovieClips will appear here with their current frame highlighted.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function RunningTimelineRow({ doc, timeline, title }: {
  doc: SwfDocument;
  timeline: RunningTimelineSnapshot;
  title: string;
}) {
  const sourceTimeline = getSourceTimeline(doc, timeline);
  const cellCount = Math.min(timeline.totalFrames, MAX_FRAME_CELLS);
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const firstFrame = Math.floor(index * timeline.totalFrames / cellCount);
    const lastFrame = Math.max(firstFrame, Math.ceil((index + 1) * timeline.totalFrames / cellCount) - 1);
    return {
      firstFrame,
      lastFrame,
      tone: toneForRange(sourceTimeline, firstFrame, lastFrame),
    };
  });
  const playhead = ((timeline.frame - 0.5) / timeline.totalFrames) * 100;
  const currentFrameLabel = `Current frame ${timeline.frame} of ${timeline.totalFrames}`;
  const frameLabel = timeline.frameLabel;

  return (
    <article
      role="listitem"
      aria-label={`${title}, frame ${timeline.frame} of ${timeline.totalFrames}`}
      data-runtime-timeline={timeline.id}
      data-timeline-path={timeline.path}
      data-current-frame={timeline.frame}
      className="rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-2 shadow-sm"
      title={`${title} · ${timeline.path}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]" />
          <span className="truncate text-[11px] font-medium text-zinc-200">{title}</span>
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-300">
          {timeline.frame}<span className="text-zinc-600"> / </span>{timeline.totalFrames}
        </span>
      </div>

      <div
        aria-label={`Frame strip for ${title}`}
        className="relative mt-1.5 h-[18px] rounded-sm bg-black/30 p-[2px]"
        data-frame-strip="true"
      >
        <div className="grid h-full gap-px" style={{ gridTemplateColumns: `repeat(${cellCount}, minmax(0, 1fr))` }}>
          {cells.map((cell, index) => {
            const containsPlayhead = timeline.frame - 1 >= cell.firstFrame && timeline.frame - 1 <= cell.lastFrame;
            const title = cell.firstFrame === cell.lastFrame
              ? `Frame ${cell.firstFrame + 1}`
              : `Frames ${cell.firstFrame + 1}–${cell.lastFrame + 1}`;
            return (
              <span
                key={index}
                aria-hidden="true"
                data-frame-cell={cell.firstFrame + 1}
                data-frame-end={cell.lastFrame + 1}
                data-current={containsPlayhead ? 'true' : undefined}
                title={title}
                className={`min-w-0 rounded-[1px] ${FRAME_TONE_CLASS[cell.tone]} ${containsPlayhead ? 'ring-1 ring-inset ring-fuchsia-100/80' : ''}`}
              />
            );
          })}
        </div>
        <span
          role="img"
          aria-label={currentFrameLabel}
          data-playhead="true"
          className="absolute inset-y-[-2px] z-10 w-[2px] -translate-x-1/2 bg-fuchsia-100 shadow-[0_0_5px_rgba(232,121,249,0.9)]"
          style={{ left: `${playhead}%` }}
        >
          <span aria-hidden="true" className="absolute -left-[3px] -top-1 h-2 w-2 rotate-45 border border-fuchsia-100 bg-fuchsia-400" />
        </span>
      </div>

      <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[9px] leading-tight">
        <span className="min-w-0 truncate font-mono text-zinc-600" title={timeline.path}>{timeline.path}</span>
        {frameLabel && <span className="shrink-0 truncate text-amber-300/80" title={frameLabel}>“{frameLabel}”</span>}
      </div>
      {timeline.movieName && <div className="mt-1 truncate text-[9px] text-zinc-700">{timeline.movieName}</div>}
    </article>
  );
}

function timelineTitle(timeline: RunningTimelineSnapshot, names: TimelineNameIndex): string {
  if (timeline.mainMovie) return metadataAt(names, timeline.characterId)?.name || timeline.name;
  return timeline.name;
}

function metadataAt(names: TimelineNameIndex, id: number): TimelineNameMetadata | undefined {
  const map = names as ReadonlyMap<number, TimelineNameMetadata>;
  if (typeof map.get === 'function') return map.get(id);
  return (names as Readonly<Record<number, TimelineNameMetadata>>)[id];
}

function getSourceTimeline(doc: SwfDocument, snapshot: RunningTimelineSnapshot): Timeline | undefined {
  if (!snapshot.mainMovie) return undefined;
  return snapshot.characterId === 0 ? doc.root : doc.timelines.get(`sprite:${snapshot.characterId}`);
}

function toneForRange(timeline: Timeline | undefined, first: number, last: number): FrameTone {
  if (!timeline) return 'plain';
  const frames = timeline.frames.slice(first, last + 1);
  const kinds = new Set(frames.flatMap((frame) => frame.events.map((event) => event.kind)));
  if (kinds.has('action')) return 'action';
  if (kinds.has('sound')) return 'sound';
  if (kinds.has('label')) return 'label';
  if (frames.some((frame) => frame.special)) return 'other';
  return 'plain';
}
