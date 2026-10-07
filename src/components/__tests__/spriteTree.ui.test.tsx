// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SpriteTreeView } from '../SpriteTreeView';
import { useProject } from '../../lib/project';
import type { Frame, SwfDocument, Timeline } from '../../types';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function fixture(): SwfDocument {
  const display = [{
    depth: 1,
    characterId: 1,
    matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    ratio: 0,
    startFrame: 0,
  }];
  const frame: Frame = { index: 0, ops: [], events: [], special: false, kinds: [], display };
  const root: Timeline = { id: 'root', kind: 'root', name: 'Main Timeline', frameCount: 1, frames: [frame] };
  const spriteFrame: Frame = { ...frame, display: [] };
  const sprite: Timeline = { id: 'sprite:1', kind: 'sprite', characterId: 1, name: 'Fish', frameCount: 4, frames: [spriteFrame] };
  return {
    header: { frameRate: 24, frameCount: 1, stage: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }, fileName: 'sprite-tree.swf' },
    characters: new Map([[1, {
      id: 1, kind: 'sprite', tagType: 'DefineSpriteTag', className: 'Fish', frameCount: 4,
      timelineId: 'sprite:1', uses: [], attrs: {},
    }]]),
    timelines: new Map([['root', root], ['sprite:1', sprite]]),
    root,
    warnings: [],
    stats: { tags: 0, unknownTags: {} },
  };
}

function Harness() {
  const doc = fixture();
  const api = useProject('sprite-tree-ui');
  return (
    <>
      <SpriteTreeView
        doc={doc}
        project={api.project}
        selectedId={null}
        activeTimeline="root"
        onSelect={() => {}}
        onOpenTimeline={() => {}}
        onSetLabel={api.setLabel}
      />
      <output data-testid="project">{JSON.stringify(api.project)}</output>
    </>
  );
}

it('renames a sprite by clicking its name, adds a tag, and persists both in its project', async () => {
  render(<Harness />);

  fireEvent.click(screen.getByRole('button', { name: 'Rename Fish' }));
  const nameInput = screen.getByRole('textbox', { name: 'Rename Fish' });
  fireEvent.change(nameInput, { target: { value: 'Blue Fish' } });
  fireEvent.keyDown(nameInput, { key: 'Enter' });

  fireEvent.click(screen.getByRole('button', { name: 'Add tag to Blue Fish' }));
  const tagInput = screen.getByRole('textbox', { name: 'New tag for Blue Fish' });
  fireEvent.change(tagInput, { target: { value: 'Favorite Sprite' } });
  fireEvent.keyDown(tagInput, { key: 'Enter' });

  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem('swfforge:project:sprite-tree-ui') ?? '{}');
    expect(saved.characters?.['1']).toEqual({ name: 'Blue Fish', tags: ['favorite-sprite'] });
    expect(saved.vocab).toContain('favorite-sprite');
  });
  expect(screen.getByText('favorite-sprite')).toBeTruthy();
  expect(JSON.parse(screen.getByTestId('project').textContent ?? '{}').characters['1']).toEqual({
    name: 'Blue Fish', tags: ['favorite-sprite'],
  });
});
