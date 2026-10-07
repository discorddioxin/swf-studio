import type { TimelineNameIndex, TimelineNameMetadata } from '../../../transpiler/as2/project';
import type { Project, SwfCharacter, SwfDocument } from '../../types';

function workbenchCharacterName(character: SwfCharacter | undefined, id: number, project?: Project): string {
  return project?.characters[id]?.name
    || character?.className
    || character?.exportName
    || `${character?.kind ?? 'sprite'} ${id}`;
}

/**
 * Translate the names visible in Workbench into transpiler metadata.
 * Project annotations (including Sprite Tree renames) win over names embedded
 * in the SWF; frame labels are kept at the transpiler's 1-based frame numbers.
 */
export function buildWorkbenchTimelineMetadata(doc: SwfDocument, project?: Project): TimelineNameIndex {
  const metadata = new Map<number, TimelineNameMetadata>();
  for (const timeline of doc.timelines.values()) {
    const id = timeline.kind === 'root' ? 0 : timeline.characterId;
    if (id == null) continue;
    const character = id === 0 ? undefined : doc.characters.get(id);
    const labels = Object.fromEntries(
      timeline.frames
        .filter((frame) => typeof frame.label === 'string' && !!frame.label.trim())
        .map((frame) => [frame.index + 1, frame.label!.trim()]),
    ) as Record<number, string>;
    const name = id === 0
      ? timeline.name || 'Main Timeline'
      : workbenchCharacterName(character, id, project);
    metadata.set(id, { name, frameLabels: labels });
  }
  return metadata;
}
