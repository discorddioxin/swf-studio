// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ActorProposals } from '../inspector/ActorProposals';
import { useProject } from '../../lib/project';
import type { Frame, SwfDocument, Timeline } from '../../types';

afterEach(() => { cleanup(); localStorage.clear(); });

function fixture(): SwfDocument {
  const act = (i: number): Frame => ({
    index: i, ops: [], events: [{ kind: 'action', tagType: 'DoAction', detail: 'trace(1)' }], special: true, kinds: ['action'], display: []
  });
  const mkSprite = (id: number): Timeline => ({
    id: `sprite:${id}`, kind: 'sprite', characterId: id, name: `Sprite ${id}`, frameCount: 2, frames: [act(0), act(1)]
  });
  const root: Timeline = { id: 'root', kind: 'root', name: 'Main', frameCount: 1, frames: [{ index: 0, ops: [], events: [], special: false, kinds: [], display: [] }] };
  const s9 = mkSprite(9);
  const s18 = mkSprite(18);
  return {
    header: { frameRate: 24, frameCount: 1, stage: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }, fileName: 'actor-proposal.swf' },
    characters: new Map([
      [9, { id: 9, kind: 'sprite', tagType: 'DefineSpriteTag', frameCount: 2, timelineId: 'sprite:9', uses: [], attrs: {} }],
      [18, { id: 18, kind: 'sprite', tagType: 'DefineSpriteTag', frameCount: 2, timelineId: 'sprite:18', uses: [], attrs: {} }],
    ]),
    timelines: new Map([['root', root], ['sprite:9', s9], ['sprite:18', s18]]),
    root,
    symbolClasses: new Map([[9, 'Fish'], [18, 'Fish']]),
    warnings: [], stats: { tags: 0, unknownTags: {} },
  };
}

function Harness({ onPreview }: { onPreview?: (...a:any[])=>void }) {
  const doc = fixture();
  const api = useProject('actor-proposal-ui');
  const preview = onPreview ?? (()=>{});
  return (
    <>
      <ActorProposals doc={doc} api={api} onOpenTimeline={preview} setFrame={()=>{}} setLoopRange={()=>{}} />
      <output data-testid="project">{JSON.stringify(api.project)}</output>
    </>
  );
}

it('renders proposal and Accept creates actor with clips', async () => {
  render(<Harness />);
  expect(await screen.findByText(/Proposed Actors/)).toBeTruthy();
  const accept = await screen.findByText('Accept');
  fireEvent.click(accept);
  await waitFor(() => {
    const proj = JSON.parse(screen.getByTestId('project').textContent ?? '{}');
    expect(proj.actors.length).toBe(1);
    expect(proj.actors[0].clipIds.length).toBe(2);
  });
});

it('dismiss hides proposal and Preview opens timeline', async () => {
  const spy = vi.fn();
  render(<Harness onPreview={spy} />);
  const preview = await screen.findByText('Preview');
  fireEvent.click(preview);
  expect(spy).toHaveBeenCalled();
  const dismiss = screen.getByText('Dismiss');
  fireEvent.click(dismiss);
  await waitFor(() => expect(screen.queryByText('Accept')).toBeNull());
});
