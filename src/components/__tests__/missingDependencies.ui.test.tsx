// @vitest-environment jsdom
// The Missing Dependencies notice and list: every file type a movie asked for,
// service endpoints apart, optional live assets marked and kept out of the notice.
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { DependencyTracker, type DependencyAddition } from '../../engine/flash/dependencies';
import { MissingDependenciesBanner, MissingDependenciesPanel, useMissingDependencies, type DependencyAdder } from '../MissingDependencies';

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

// "Add Dependency": picked files go to the session under the requested paths.
function adder(fail?: string) {
  const calls: DependencyAddition[][] = [];
  const value: DependencyAdder = {
    added: [],
    add: async (additions) => { calls.push(additions); if (fail) throw new Error(fail); },
  };
  return { value, calls };
}
const pick = (input: HTMLElement, files: File[]) => fireEvent.change(input, { target: { files } });

it('without an adder there is no Add button (the upload is the only way)', () => {
  render(<MissingDependenciesBanner list={tracker().list()} />);
  expect(screen.queryByRole('button', { name: 'Add Dependency' })).toBeNull();
  expect(screen.getByRole('status', { name: 'Missing Dependencies' }).textContent).toContain('Add them to the upload');
});

it('the notice: Add Dependency takes several files and puts each under the path asked for', async () => {
  const { value, calls } = adder();
  render(<MissingDependenciesBanner list={tracker().list()} adder={value} />);
  const banner = screen.getByRole('status', { name: 'Missing Dependencies' });
  expect(within(banner).getByRole('button', { name: 'Add Dependency' })).toBeTruthy();
  expect(banner.textContent).toContain('to this session for testing');
  const input = within(banner).getByLabelText('Add Dependency file') as HTMLInputElement;
  expect(input.multiple).toBe(true);
  pick(input, [new File(['<c/>'], 'gameConfig.xml'), new File(['x'], 'SPLASH.mp3'), new File(['y'], 'notes.txt')]);
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0].map((a) => [a.file.name, a.path])).toEqual([
    ['gameConfig.xml', 'games/pinball/gameConfig.xml'],
    ['SPLASH.mp3', 'sfx/splash.mp3'],
    ['notes.txt', 'notes.txt'],
  ]);
});

it('a row: Add… takes one file of that type and stores it under that path, whatever its name', async () => {
  const { value, calls } = adder();
  render(<MissingDependenciesPanel list={tracker().list()} adder={value} />);
  const row = screen.getByText('navPages/phone.css').parentElement!;
  expect(within(row).getByRole('button', { name: 'Add…' })).toBeTruthy();
  const input = within(row).getByLabelText('Add… file') as HTMLInputElement;
  expect(input.multiple).toBe(false);
  expect(input.accept).toBe('.css');
  pick(input, [new File(['a{}'], 'style-v2.css')]);
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0].map((a) => [a.file.name, a.path])).toEqual([['style-v2.css', 'navPages/phone.css']]);
  // service endpoints are not files: no button there
  const service = screen.getByText('http://www.example.com/chat/gsi/gateway.php').parentElement!;
  expect(within(service).queryByRole('button')).toBeNull();
});

it('a file that cannot be added says why; what was added this session is listed', async () => {
  const { value } = adder('broken.swf: not a SWF');
  render(<MissingDependenciesPanel list={tracker().list()} adder={{ ...value, added: ['xml/scores.xml', 'scene.swf'] }} />);
  const row = screen.getByText('scene.swf', { selector: '.text-amber-300' }).parentElement!;
  pick(within(row).getByLabelText('Add… file'), [new File(['x'], 'broken.swf')]);
  expect((await screen.findByRole('alert')).textContent).toBe('Could not add: broken.swf: not a SWF');
  const added = screen.getByLabelText('Added dependencies');
  expect(within(added).getByText('xml/scores.xml')).toBeTruthy();
  expect(within(added).getByText('scene.swf')).toBeTruthy();
});
