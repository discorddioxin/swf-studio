// Pure helpers for the Actors tab (DECOMPOSITION_SPEC phase 6).
// Extracted verbatim from Inspector.tsx.

import type { AssetCache } from '../../lib/assets';
import { type CharacterKind, type Project, type SwfDocument } from '../../types';
import { charName } from '../Sidebar';

export function normalizeActorKey(value: string) {
  const key = value.trim().toLowerCase();
  return key === ' ' || key === 'spacebar' ? 'space' : key;
}

export interface ActorImageDependency {
  id: number;
  name: string;
  kind: CharacterKind;
  path?: string;
  url?: string;
  frames: number;
  missing: boolean;
}

export function collectActorImageDependencies(doc: SwfDocument, project: Project, cache: AssetCache, ids: number[]): ActorImageDependency[] {
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
