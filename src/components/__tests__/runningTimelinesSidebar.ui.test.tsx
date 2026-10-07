// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunningTimelineSnapshot } from '../../engine/as2/player';
import type { Frame, SwfDocument, Timeline } from '../../types';
import { RunningTimelinesSidebar } from '../RunningTimelinesSidebar';

afterEach(cleanup);

function frame(index: number, kind?: 'action' | 'sound' | 'label', label?: string): Frame {
  const events = kind ? [{ kind, tagType: kind === 'action' ? 'DoActionTag' : `${kind}Tag`, detail: kind }] : [];
  return {
    index, label, ops: [], events, special: events.length > 0, kinds: kind ? [kind] : [], display: [],
  };
}

const spriteTimeline: Timeline = {
  id: 'sprite:7', kind: 'sprite', characterId: 7, name: 'Sprite 7', frameCount: 4,
  frames: [frame(0, 'action'), frame(1, 'label', 'idle'), frame(2), frame(3, 'sound')],
};
const rootTimeline: Timeline = { id: 'root', kind: 'root', name: 'Main Timeline', frameCount: 1, frames: [frame(0)] };
const doc = {
  root: rootTimeline,
  timelines: new Map([['root', rootTimeline], ['sprite:7', spriteTimeline]]),
} as unknown as SwfDocument;

const timelines: RunningTimelineSnapshot[] = [{
  id: 42,
  characterId: 7,
  name: 'Sprite 7',
  path: '_level0.hero (sprite 7)',
  frame: 3,
  totalFrames: 4,
  frameLabel: 'run',
  mainMovie: true,
}];


describe('RunningTimelinesSidebar', () => {
  it('renders Workbench-style frame cells and positions the playhead at the current frame', () => {
    render(<RunningTimelinesSidebar doc={doc} timelines={timelines} timelineNames={new Map([[7, { name: 'Hero' }]])} playing />);

    expect(screen.getByRole('complementary', { name: 'Running timelines' })).toBeTruthy();
    const row = screen.getByRole('listitem', { name: 'Hero, frame 3 of 4' });
    expect(row.getAttribute('data-timeline-path')).toContain('_level0.hero');
    expect(screen.getByText('“run”')).toBeTruthy();

    const playhead = screen.getByRole('img', { name: 'Current frame 3 of 4' });
    expect((playhead as HTMLElement).style.left).toBe('62.5%');
    expect(row.querySelector('[data-frame-cell="1"]')?.classList.contains('bg-rose-500/65')).toBe(true);
    expect(row.querySelector('[data-frame-cell="2"]')?.classList.contains('bg-amber-500/65')).toBe(true);
    expect(row.querySelector('[data-frame-cell="3"]')?.getAttribute('data-current')).toBe('true');
    expect(screen.getByText('LIVE')).toBeTruthy();
  });

  it('shows an empty state and global paused status when no clip timeline is advancing', () => {
    render(<RunningTimelinesSidebar doc={doc} timelines={[]} timelineNames={new Map()} playing={false} />);
    expect(screen.getByText('No running timelines')).toBeTruthy();
    expect(screen.getByText('PAUSED')).toBeTruthy();
  });
});
