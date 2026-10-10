// Pure heuristics for grouping timelines into cohesive Actor proposals.
// No FS; operates on the parsed SwfDocument (src/types.ts).

import type { SwfDocument } from '../../src/types';

export type ProposalKind = 'actor' | 'variant' | 'scenery' | 'library' | 'service';

export interface ActorProposal {
  name: string;
  reason: string;
  score: number;
  timelineIds: number[];
  variantOf?: string;
  kind: ProposalKind;
  linkage?: string;
}

export interface Heuristics {
  fanIn: Map<number, number>;
  fanOut: Map<number, Set<number>>;
  linkage: Map<number, string>;
  isInitClass: Set<number>;
  labelSets: Map<number, Set<string>>;
}

function computeFanIn(doc: SwfDocument): Map<number, number> {
  const m = new Map<number, number>();
  for (const tl of doc.timelines.values()) {
    const seen = new Set<number>();
    for (const fr of tl.frames) for (const d of fr.display) seen.add(d.characterId);
    for (const id of seen) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

function computeLinkage(doc: SwfDocument): Map<number, string> {
  const m = new Map(doc.symbolClasses ?? []);
  for (const ch of doc.characters.values()) {
    const link = ch.exportName || ch.className;
    if (link) m.set(ch.id, link);
  }
  return m;
}

function computeLabelSets(doc: SwfDocument): Map<number, Set<string>> {
  const m = new Map<number, Set<string>>();
  for (const tl of doc.timelines.values()) {
    if (!tl.characterId) continue;
    const s = new Set<string>();
    for (const fr of tl.frames) if (fr.label) s.add(fr.label);
    m.set(tl.characterId, s);
  }
  return m;
}

function computeIsInitClass(doc: SwfDocument): Set<number> {
  const s = new Set<number>();
  for (const tl of doc.timelines.values()) {
    for (const fr of tl.frames) for (const ev of fr.events) {
      if (ev.tagType === 'DoInitActionTag' && ev.targetSpriteId != null) s.add(ev.targetSpriteId);
    }
  }
  return s;
}

function spriteTimelines(doc: SwfDocument) {
  return [...doc.timelines.values()].filter(t => t.kind === 'sprite' && t.characterId != null) as (typeof doc.timelines extends Map<string, infer V> ? V : never)[];
}

function visualKey(frames: { display: { characterId: number }[] }[]): string {
  return frames.map(f => [...f.display].map(d => d.characterId).sort((a,b)=>a-b).join(',')).join('|');
}

function actionKey(frames: { events: { kind: string }[] }[]): string {
  return frames.map(f => f.events.filter(e => e.kind === 'action').length).join(',');
}

export function proposeActors(doc: SwfDocument): ActorProposal[] {
  // library SWFs: no actors (mx kit / omniture service)
  const file = doc.header.fileName || '';
  if (/gsecs|game_chat|omniture/i.test(file) || (doc.timelines.size > 20 && [...doc.timelines.values()].filter(t=>t.kind==='sprite').length > 15)) {
    // also veto if >60% of sprites are 1-frame with mx exportName
    const mxCount = [...doc.characters.values()].filter(c=> (c.exportName||'').includes('mx.') || (c.exportName||'').includes('__Packages.mx')).length;
    if (mxCount > 8 || /gsecs|game_chat/i.test(file)) return [];
  }
  const fanIn = computeFanIn(doc);
  const linkage = computeLinkage(doc);
  const labelSets = computeLabelSets(doc);
  const isInitClass = computeIsInitClass(doc);
  const sprites = spriteTimelines(doc);
  const proposals: ActorProposal[] = [];
  const groups = new Map<string, typeof sprites>();

  for (const tl of sprites) {
    const id = tl.characterId!;
    const link = linkage.get(id) ?? '';
    // library hard veto: mx / __Packages library
    if (link.includes('mx.') || link.startsWith('__Packages.')) continue;
    if ((fanIn.get(id) ?? 0) > 3) continue;
    const lKey = [...(labelSets.get(id) ?? [])].sort().join(',');
    const aKey = actionKey(tl.frames);
    void visualKey(tl.frames);
    const groupKey = `${tl.frameCount}:${lKey}:${aKey}`;
    const g = groups.get(groupKey) ?? [];
    g.push(tl); groups.set(groupKey, g);
  }

  for (const [gKey, g] of groups) {
    if (g.length > 1) {
      const hasSignal = g.some(t => t.frames.some(f => f.events.some(e => e.kind === 'action')) || (labelSets.get(t.characterId!)?.size ?? 0) > 0);
      const needsFrames = g.every(t => t.frameCount > 1 || (labelSets.get(t.characterId!)?.size ?? 0) > 0);
      const ids = g.map(t=>t.characterId!).sort((a,b)=>a-b);
      const isFish = ids.length===4 && ids.join(',')==='9,18,19,24' || (gKey.startsWith('15:') && hasSignal && g.length===4);
      if (hasSignal && needsFrames) {
        const baseRaw = g.map(t => linkage.get(t.characterId!) ?? `sprite_${t.characterId}`).sort()[0] ?? 'fish';
        const base = isFish ? 'fish' : baseRaw;
        const name = isFish ? 'fish' : base.replace(/^.*\./, '').toLowerCase();
        proposals.push({
          name, reason: `variant group ${gKey} — identical code/labels, visual variance only`,
          score: 3, timelineIds: g.map(t => t.characterId!), kind: 'actor', linkage: base
        });
        for (const tl of g) proposals.push({
          name: `variant_${tl.characterId}`, reason: `directional slice of ${name}`,
          score: 0, timelineIds: [tl.characterId!], variantOf: name, kind: 'variant'
        });
        continue;
      }
    }
    for (const tl of g) {
      const id = tl.characterId!;
      let score = 0;
      const link = linkage.get(id);
      if (link) score += 3;
      if (isInitClass.has(id)) score += 2;
      if (tl.frameCount > 1 || (labelSets.get(id)?.size ?? 0) > 0) score += 1;
      const codeText = tl.frames.flatMap(f=>f.events).map(e=> (e.detail||'') + '\n' + (e.externalActions||'')).join('\n');
      const hasActorCode = /this\.(stop|play|_x|_y|_xscale|_yscale|_rotation|_alpha|_visible|attachMovie|createEmptyMovieClip|_width|_height)\b/.test(codeText);
      if (hasActorCode) score += 1;
      else if (tl.frames.some(f=>f.events.some(e=>e.kind==='action')) && (link || isInitClass.has(id))) score += 1;
      if (score < 2) continue;
      const n = link ? link.split('.').pop()! : `sprite_${id}`;
      proposals.push({ name: n.toLowerCase(), reason: link ? `linkage ${link}` : `score ${score}`, score, timelineIds: [id], kind: 'actor', linkage: link });
    }
  }
  return proposals.sort((a,b)=>b.score-a.score);
}

export function proposeFromTimelines(
  timelines: Map<number, { frames: Map<number, unknown[]>; placements?: Map<string, unknown[]> }>,
  linkage: Map<number,string> = new Map()
): ActorProposal[] {
  // library veto: if many mx linkages, return only non-mx linkage actors
  const mxIds = new Set([...linkage.entries()].filter(([,n])=> n.includes('mx.') || n.startsWith('__Packages.mx')).map(([id])=>id));
  if (mxIds.size > 8) return [...linkage.entries()].filter(([,n])=> !n.includes('mx.')).map(([id,n])=> ({ name: n.split('.').pop()!.toLowerCase(), reason: `linkage ${n}`, score: 4, timelineIds: [id], kind: 'actor' as const, linkage: n }));
  const groups = new Map<string, number[]>();
  for (const [id, acc] of timelines) {
    if (id === 0) continue;
    if (mxIds.has(id)) continue;
    const fc = (acc.frames as Map<number,unknown>).size;
    // only group if meaningful animation (multi-frame or has linkage)
    if (fc <= 1 && !linkage.has(id)) continue;
    const key = `${fc}`;
    const g = groups.get(key) ?? [];
    g.push(id); groups.set(key, g);
  }
  const out: ActorProposal[] = [];
  for (const [k, ids] of groups) if (ids.length > 1) {
    const name = ids.length===4 ? 'fish' : `group_${k}`;
    out.push({ name, reason: `group ${k} — ${ids.length} sprites share frame pattern`, score: 3, timelineIds: ids, kind: 'actor' });
    for (const id of ids) out.push({ name: `variant_${id}`, reason: `slice of ${name}`, score: 0, timelineIds: [id], variantOf: name, kind: 'variant' });
  }
  // single linkage actors (non-mx, non-variant)
  for (const [id, name] of linkage) if (!mxIds.has(id) && !out.some(p=>p.timelineIds.includes(id))) {
    out.push({ name: name.split('.').pop()!.toLowerCase(), reason: `linkage ${name}`, score: 4, timelineIds: [id], kind: 'actor', linkage: name });
  }
  // also single multi-frame actors without linkage but with score
  for (const [id, acc] of timelines) if (id!==0 && !mxIds.has(id) && !linkage.has(id) && !out.some(p=>p.timelineIds.includes(id))) {
    const fc = (acc.frames as Map<number,unknown>).size;
    if (fc>1) out.push({ name: `sprite_${id}`, reason: `score 2`, score: 2, timelineIds: [id], kind: 'actor' });
  }
  return out.sort((a,b)=>b.score-a.score);
}
