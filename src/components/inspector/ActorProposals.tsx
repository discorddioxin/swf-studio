import { useMemo, useState } from 'react';
import { proposeActors } from '../../../transpiler/as2/actorHeuristics';
import type { ProjectApi } from '../../lib/project';
import { buildFramesForContainer } from '../../lib/exporter';
import type { SwfDocument } from '../../types';
import { Button } from '../ui';

export function ActorProposals({ doc, api, onOpenTimeline, setFrame, setLoopRange }: {
  doc: SwfDocument; api: ProjectApi;
  onOpenTimeline: (id: string)=>void; setFrame: (f:number)=>void; setLoopRange: (r:[number,number]|null)=>void;
}) {
  const proposals = useMemo(() => proposeActors(doc), [doc]);
  const [dismissed, setDismissed] = useState<Set<string>>(()=> {
    try { return new Set(JSON.parse(localStorage.getItem(`swf-studio:dismissed:${doc.header.fileName}`) ?? '[]')); } catch { return new Set(); }
  });
  const visible = proposals.filter(p => p.kind==='actor' && !dismissed.has(p.name));
  if (!visible.length) return <div className="p-3 text-[11px] text-zinc-600">No actor proposals — this SWF has no grouped sprites.</div>;

  const dismiss = (name:string) => {
    const next = new Set(dismissed); next.add(name); setDismissed(next);
    try { localStorage.setItem(`swf-studio:dismissed:${doc.header.fileName}`, JSON.stringify([...next])); } catch {}
  };

  const accept = (p: typeof visible[number]) => {
    // ensure clips exist for each timelineId (characterId)
    const clipIds: string[] = [];
    for (const charId of p.timelineIds) {
      const tid = `sprite:${charId}`;
      const timeline = doc.timelines.get(tid);
      let clip = api.project.clips.find(c=>c.timelineId===tid);
      if (!clip && timeline) {
        clip = api.addClip({
          timelineId: tid, name: timeline.name || `clip_${charId}`,
          start: 0, end: timeline.frameCount-1, loop: true, tags: [],
          frames: buildFramesForContainer(timeline, 0, timeline.frameCount-1),
        });
      } else if (!clip) {
        // fallback: create empty clip entry
        clip = api.addClip({ timelineId: tid, name: `sprite_${charId}`, start:0,end:0,loop:true,tags:[] });
      }
      clipIds.push(clip.id);
    }
    const capabilities: Record<string,unknown> = {};
    if (p.timelineIds.length>1) {
      const slots = ['front-left','front-right','back-left','back-right'] as const;
      const idle: Record<string,string> = {};
      const movement: Record<string,string> = {};
      clipIds.forEach((cid,i)=>{
        if (i<slots.length) idle[slots[i]] = cid;
        const mSlots = ['idle','moveLeft','moveRight','moveUp'] as const;
        if (i<mSlots.length) movement[mSlots[i]] = cid;
      });
      Object.assign(capabilities, { idleAnimations: idle, movementClips: movement, canMove: true });
    }
    api.addActor({
      name: p.name, clipIds, tags: [], notes: p.reason,
      capabilities: { combat:'none', canMove: p.timelineIds.length>1, canWalk:false, useFlippedAnimations:false, mirrorSide:'none', movementClips: (capabilities as any).movementClips ?? {}, idleAnimations: (capabilities as any).idleAnimations ?? {}, walkingClips:{}, attackClipIds:[] } as any,
    });
  };

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-violet-300">Proposed Actors</span>
        <Button variant="ghost" onClick={()=>{ setDismissed(new Set()); try{localStorage.removeItem(`swf-studio:dismissed:${doc.header.fileName}`);}catch{}}}>Reset</Button>
      </div>
      {visible.map(p=>(
        <div key={p.name} className="rounded border border-violet-900/40 bg-violet-950/10 p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-violet-200">{p.name}</span>
            <span className="text-[10px] text-zinc-500">score {p.score}</span>
          </div>
          <div className="text-[11px] text-zinc-400">{p.reason} · timelines {p.timelineIds.join(', ')}</div>
          <div className="mt-1 flex gap-1">
            <Button variant="primary" onClick={()=>accept(p)}>Accept</Button>
            <Button variant="ghost" onClick={()=>{
              const first = doc.timelines.get(`sprite:${p.timelineIds[0]}`);
              if (first) { onOpenTimeline(first.id); setFrame(0); setLoopRange([0, first.frameCount-1]); }
            }}>Preview</Button>
            <Button variant="ghost" onClick={()=>dismiss(p.name)}>Dismiss</Button>
          </div>
        </div>
      ))}
      {visible.length>1 && <Button className="w-full" onClick={()=>visible.forEach(accept)}>Accept all</Button>}
    </div>
  );
}
