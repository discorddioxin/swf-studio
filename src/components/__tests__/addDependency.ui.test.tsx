// @vitest-environment jsdom
// "Add Dependency" end to end: an AS2 game asks for a file the upload lacks, the
// Execute tab lists it, the user adds the file through the notice's button, and
// the game restarts and gets it. The session is wired as App wires it
// (useSessionDependencies → ExecuteTab's dependencyFiles / dependencyAdder).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { AssetCache, ingestFiles, type SwfPackage } from '../../lib/assets';
import { parseSwfXml } from '../../lib/parser';
import type { AssetBundle, SwfDocument } from '../../types';
import { ExecuteTab } from '../ExecuteTab';
import { useSessionDependencies } from '../useSessionDependencies';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="7" frameRate="12" frameCount="1">
  <displayRect type="RECT" Xmin="0" Ymin="0" Xmax="8000" Ymax="6000"/>
  <tags><item type="DoActionTag"/><item type="ShowFrameTag"/><item type="EndTag"/></tags>
</swf>`;
const SCRIPT = `var lv = new LoadVars();
lv.onLoad = function (ok) { trace("LOADED " + ok + " " + lv.answer); };
lv.load("data/config.txt");
stop();`;

const rafQueue: FrameRequestCallback[] = [];
let now = 0;
beforeAll(() => {
  for (const [name, read] of [['text', 'readAsText'], ['arrayBuffer', 'readAsArrayBuffer']] as const) {
    if ((Blob.prototype as unknown as Record<string, unknown>)[name]) continue;
    Object.defineProperty(Blob.prototype, name, {
      configurable: true,
      value(this: Blob) { return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r[read](this); }); },
    });
  }
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  performance.now = () => now;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
afterEach(cleanup);

async function runFrames(ms: number) {
  await act(async () => {
    for (let t = 0; t < ms; t += 1000 / 60) { now += 1000 / 60; rafQueue.splice(0).forEach((cb) => cb(now)); }
  });
}

function file(path: string, text: string) {
  const f = new File([text], path.split('/').pop()!);
  Object.defineProperty(f, 'webkitRelativePath', { value: `mygame/${path}` });
  return f;
}

/** The session as App holds it: the upload's files (none here) plus what is added. */
function Session({ doc, bundle }: { doc: SwfDocument; bundle: AssetBundle }) {
  const generation = useRef(0);
  const [externals, setExternals] = useState<SwfPackage[]>([]);
  const cache = useMemo(() => new AssetCache(bundle, () => {}), [bundle]);
  const { files, adder } = useSessionDependencies({
    generation: () => generation.current,
    onPackages: (added) => setExternals((current) => [...current, ...added]),
  });
  return <ExecuteTab doc={doc} cache={cache} assets={bundle} externals={externals} dependencyFiles={files} dependencyAdder={adder} />;
}

/** Frames until `pattern` is in the console (the tab drains its log inside animation frames). */
async function untilConsole(pattern: RegExp) {
  for (let i = 0; i < 40 && !screen.queryAllByText(pattern).length; i++) await runFrames(150);
  expect(screen.queryAllByText(pattern).length).toBeGreaterThan(0);
}

it('lists the missing file, adds it to the session, and the restarted game gets it', async () => {
  const bundle = ingestFiles([file('game.xml', XML), file('scripts/frame_1/DoAction.as', SCRIPT)]);
  const doc = parseSwfXml(await bundle.xmlFile!.text(), { fileName: 'game.xml' });
  render(<Session doc={doc} bundle={bundle} />);
  await waitFor(() => expect(screen.getByText(/AS2 engine/)).toBeTruthy());

  // the first run: the request fails and the file is listed as missing
  await untilConsole(/LOADED false undefined/);
  const banner = await screen.findByRole('status', { name: 'Missing Dependencies' });
  expect(banner.textContent).toContain('config.txt');

  // the user picks their copy (any name: matched to the request by name here)
  fireEvent.change(within(banner).getByLabelText('Add Dependency file'), { target: { files: [new File(['answer=42'], 'config.txt')] } });

  // the game restarts with it: the request is answered, nothing is missing
  await untilConsole(/LOADED true 42/);
  // (the notice follows the new run's tracker on its next poll)
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Missing Dependencies' })).toBeNull());
  fireEvent.click(screen.getByText(/^Program/));
  expect(within(screen.getByLabelText('Added dependencies')).getByText('data/config.txt')).toBeTruthy();
}, 30_000);
