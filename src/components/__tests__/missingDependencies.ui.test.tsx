// @vitest-environment jsdom
// The Missing Dependencies notice and list: every file type a movie asked for,
// service endpoints apart, optional live assets marked and kept out of the notice.
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import { DependencyTracker } from '../../engine/flash/dependencies';
import { MissingDependenciesBanner, MissingDependenciesPanel, useMissingDependencies } from '../MissingDependencies';

afterEach(cleanup);

function tracker() {
  const t = new DependencyTracker();
  t.record({ url: 'games/pinball/gameConfig.xml', api: 'URLLoader.load', requestedBy: 'gameShell.swf' });
  t.record({ url: 'scene.swf', api: 'loadMovie', requestedBy: 'game.swf' });
  t.record({ url: 'sfx/splash.mp3', api: 'Sound.loadSound', requestedBy: 'game.swf' });
  t.record({ url: 'navPages/phone.css', api: 'URLLoader.load', requestedBy: 'towns2.swf' });
  t.record({ url: 'http://a.example.com/avatar/1.png', api: 'loadMovie', requestedBy: 'game.swf', optional: true });
  t.record({ url: 'http://www.example.com/chat/gsi/gateway.php', api: 'LoadVars.sendAndLoad', method: 'POST', requestedBy: 'gsecs.swf' });
  return t;
}

it('the notice counts the missing files by type and leaves out services and optional assets', () => {
  render(<MissingDependenciesBanner list={tracker().list()} />);
  const banner = screen.getByRole('status', { name: 'Missing Dependencies' });
  expect(banner.textContent).toContain('requested 4 files');
  for (const label of ['SWF ×1', 'XML ×1', 'Audio ×1', 'CSS ×1']) expect(banner.textContent).toContain(label);
  expect(banner.textContent).not.toContain('gateway');
  expect(banner.textContent).not.toContain('1.png');
});

it('no notice when nothing required is missing', () => {
  const t = new DependencyTracker();
  t.record({ url: 'http://a.example.com/avatar/1.png', api: 'loadMovie', optional: true });
  const { container } = render(<MissingDependenciesBanner list={t.list()} />);
  expect(container.textContent).toBe('');
});

it('the list names each file with its type, API and requester, then the service endpoints', () => {
  render(<MissingDependenciesPanel list={tracker().list()} />);
  const panel = screen.getByLabelText('Missing Dependencies list');
  expect(within(panel).getByText('games/pinball/gameConfig.xml').parentElement!.textContent).toBe('XMLgames/pinball/gameConfig.xml — URLLoader.load by gameShell.swf');
  expect(within(panel).getByText('sfx/splash.mp3').parentElement!.textContent).toContain('Sound.loadSound by game.swf');
  expect(within(panel).getByText('avatar/1.png').parentElement!.textContent).toContain('optional live asset');
  expect(within(panel).getByText('Service endpoints')).toBeTruthy();
  expect(within(panel).getByText('http://www.example.com/chat/gsi/gateway.php')).toBeTruthy();
});

it('the hook follows the tracker as requests come in', async () => {
  const t = new DependencyTracker();
  const { result } = renderHook(() => useMissingDependencies(() => t, 10));
  expect(result.current).toEqual([]);
  t.record({ url: 'xml/scores.xml', api: 'URLLoader.load', requestedBy: 'game.swf' });
  await act(() => new Promise((r) => setTimeout(r, 40)));
  expect(result.current.map((d) => d.path)).toEqual(['xml/scores.xml']);
});
