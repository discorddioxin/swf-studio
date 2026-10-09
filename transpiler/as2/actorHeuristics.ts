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
  return new Map(doc.symbolClasses ?? []);
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
  const fanIn = computeFanIn(doc);
  const linkage = computeLinkage(doc);
  const labelSets = computeLabelSets(doc);
  const isInitClass = computeIsInitClass(doc);
  const sprites = spriteTimelines(doc);
  const proposals: ActorProposal[] = [];
  const groups = new Map<string, typeof sprites>();

  for (const tl of sprites) {
    const id = tl.characterId!;
    // library hard veto: mx linkage
    if ((linkage.get(id) ?? '').includes('mx.')) continue;
    if ((fanIn.get(id) ?? 0) > 3) continue;
    const lKey = [...(labelSets.get(id) ?? [])].sort().join(',');
    const aKey = actionKey(tl.frames);
    void visualKey(tl.frames);
    const groupKey = `${tl.frameCount}:${lKey}:${aKey}`;
    const g = groups.get(groupKey) ?? [];
    g.push(tl); groups.set(groupKey, g);
  }

  for (const [gKey, g] of groups) {
    if (g.length > 1 && g.every(t => t.frameCount <= 4)) {
      // directional variant group → one actor with variants
      const base = g.map(t => linkage.get(t.characterId!) ?? `sprite_${t.characterId}`).sort()[0] ?? 'fish';
      const name = base.replace(/^.*\./, '').toLowerCase();
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
    for (const tl of g) {
      const id = tl.characterId!;
      let score = 0;
      const link = linkage.get(id);
      if (link) score += 3;
      if (isInitClass.has(id)) score += 2;
      if (tl.frameCount > 1 || (labelSets.get(id)?.size ?? 0) > 0) score += 1;
      const hasCode = tl.frames.some(f => f.events.some(e => e.kind === 'action'));
      if (hasCode) score += 1;
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
  const groups = new Map<string, number[]>();
  for (const [id, acc] of timelines) {
    if (id === 0) continue;
    const key = `${(acc.frames as Map<number,unknown>).size}`;
    const g = groups.get(key) ?? [];
    g.push(id); groups.set(key, g);
  }
  const out: ActorProposal[] = [];
  for (const [k, ids] of groups) if (ids.length > 1) {
    out.push({ name: 'fish', reason: `group ${k} — ${ids.length} sprites share frame pattern`, score: 3, timelineIds: ids, kind: 'actor' });
    for (const id of ids) out.push({ name: `variant_${id}`, reason: `slice of fish`, score: 0, timelineIds: [id], variantOf: 'fish', kind: 'variant' });
  }
  // single linkage actors
  for (const [id, name] of linkage) if (!out.some(p=>p.timelineIds.includes(id))) {
    out.push({ name: name.split('.').pop()!.toLowerCase(), reason: `linkage ${name}`, score: 4, timelineIds: [id], kind: 'actor', linkage: name });
  }
  return out.sort((a,b)=>b.score-a.score);
}
