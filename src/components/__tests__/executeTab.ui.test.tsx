// @vitest-environment jsdom
// The Execute tab end to end: a loaded folder (JPEXS XML + transpiled .ts)
// → ingestFiles → parse → <ExecuteTab> compiles and runs the game, input goes
// through the canvas DOM events, and trace()/linkage show up in the UI.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AssetCache, ingestFiles, type SwfPackage } from '../../lib/assets';
import { parseSwfXml } from '../../lib/parser';
import { ExecuteTab } from '../ExecuteTab';
import { GAME_XML, SOURCES } from '../../engine/flash/__tests__/gameFixture';

const rafQueue: FrameRequestCallback[] = [];
let now = 0;

beforeAll(() => {
  if (!Blob.prototype.text) {
    Blob.prototype.text = function text(this: Blob) {
      return new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(this); });
    };
  }
  // jsdom has no PointerEvent: without it fireEvent.pointer* drops clientX/Y.
  globalThis.PointerEvent ??= class PointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  } as unknown as typeof PointerEvent;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  // Deterministic animation frames driven by the test.
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  performance.now = () => now;
  // jsdom does no layout: give the stage panel a real size (800x500).
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 500 });
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500, x: 0, y: 0, toJSON() {} });
});
afterEach(cleanup);

function file(path: string, text: string) {
  const f = new File([text], path.split('/').pop()!);
  Object.defineProperty(f, 'webkitRelativePath', { value: `mygame/${path}` });
  return f;
}

async function mount(withCode = true) {
  const files = [file('game.xml', GAME_XML), ...(withCode ? SOURCES.map((s) => file(s.path, s.text)) : [])];
  const bundle = ingestFiles(files);
  const doc = parseSwfXml(await bundle.xmlFile!.text(), { fileName: 'game.xml' });
  const cache = new AssetCache(bundle, () => {});
  render(<ExecuteTab doc={doc} cache={cache} assets={bundle} />);
}

/** A second loaded SWF with its own code: `paths` select which of the fixture's
 *  classes live in it, so the main movie's imports only resolve through it. */
async function dependencyPackage(name: string, paths: string[]): Promise<SwfPackage> {
  const sources = SOURCES.filter((s) => paths.some((p) => s.path.endsWith(p)));
  const bundle = ingestFiles([file(`${name}.xml`, GAME_XML), ...sources.map((s) => file(`external/${name}/${s.path}`, s.text))]);
  const doc = parseSwfXml(await bundle.xmlFile!.text(), { fileName: `${name}.xml` });
  return { doc, bundle, cache: new AssetCache(bundle, () => {}) };
}

/** The main movie without the code that lives in the dependency SWF. */
async function mountWithDependency(dependencyPaths: string[]) {
  const missing = SOURCES.filter((s) => dependencyPaths.some((p) => s.path.endsWith(p)));
  const files = [file('game.xml', GAME_XML), ...SOURCES.filter((s) => !missing.includes(s)).map((s) => file(s.path, s.text))];
  const bundle = ingestFiles(files);
  const doc = parseSwfXml(await bundle.xmlFile!.text(), { fileName: 'game.xml' });
  const cache = new AssetCache(bundle, () => {});
  const dependency = await dependencyPackage('library', dependencyPaths);
  render(<ExecuteTab doc={doc} cache={cache} assets={bundle} externals={[dependency]} />);
}

/** Run animation frames: advances player time by `ms` in 1/60 s steps. */
async function runFrames(ms: number) {
  await act(async () => {
    for (let t = 0; t < ms; t += 1000 / 60) {
      now += 1000 / 60;
      const batch = rafQueue.splice(0);
      batch.forEach((cb) => cb(now));
    }
  });
}

describe('ExecuteTab', () => {
  it('compiles the transpiled code from the folder, links the document class, and plays it with input', async () => {
    await mount();
    await waitFor(() => expect(screen.getByText(/AS3 engine · com\.game\.Main/)).toBeTruthy());
    await runFrames(200);
    expect(screen.getByText(/frame 1\/3 “menu”/)).toBeTruthy();

    // Click the start button (stage 250,10 → canvas via the letterbox transform).
    const canvas = screen.getByLabelText('Game stage');
    // Stage 400x300 in an 800x500 panel → scale 5/3, x offset 66.67.
    const toCanvas = (x: number, y: number) => ({ clientX: 66.666 + x * (5 / 3), clientY: y * (5 / 3) });
    fireEvent.pointerMove(canvas, toCanvas(270, 30));
    fireEvent.pointerDown(canvas, toCanvas(270, 30));
    fireEvent.pointerUp(canvas, toCanvas(270, 30));
    await runFrames(200);
    expect(screen.getByText(/frame 2\/3 “game”/)).toBeTruthy();

    // Keyboard input reaches the game through the focused canvas.
    fireEvent.keyDown(canvas, { key: ' ', keyCode: 32 });
    // Let the enemy reach the hero → game over, which trace()s.
    await runFrames(2000);
    expect(screen.getByText(/frame 3\/3 “gameover”/)).toBeTruthy();
    expect(screen.getByText(/GAME OVER \d+/)).toBeTruthy();
    expect(screen.queryByText(/⚠/)).toBeNull();

    fireEvent.click(screen.getByText(/^Program/));
    expect(screen.getByText('4 file(s) compiled, 4 class(es) exported.')).toBeTruthy();
    expect(screen.getAllByText('✓ linked')).toHaveLength(3);
  });

  it('Restart starts the game again from frame 1 with fresh state', async () => {
    await mount();
    await waitFor(() => expect(screen.getByText(/AS3 engine/)).toBeTruthy());
    await runFrames(100);
    fireEvent.click(screen.getByText('Restart'));
    await runFrames(100);
    expect(screen.getByText(/frame 1\/3 “menu”/)).toBeTruthy();
  });

  it('links the code of a dependency SWF when the main movie alone cannot', async () => {
    // Enemy + GameConfig live in the dependency SWF only; Main imports both.
    await mountWithDependency(['com/game/Enemy.ts', 'util/GameConfig.ts']);
    await waitFor(() => expect(screen.getByText(/AS3 engine · com\.game\.Main/)).toBeTruthy());
    await runFrames(200);
    expect(screen.getByText(/frame 1\/3 “menu”/)).toBeTruthy();
    // The console says where the extra classes came from.
    expect(screen.getByText(/linked code from dependency SWF.*: library\.xml/)).toBeTruthy();

    // The game runs: the start button leads into the level, then game over.
    const canvas = screen.getByLabelText('Game stage');
    const toCanvas = (x: number, y: number) => ({ clientX: 66.666 + x * (5 / 3), clientY: y * (5 / 3) });
    fireEvent.pointerMove(canvas, toCanvas(270, 30));
    fireEvent.pointerDown(canvas, toCanvas(270, 30));
    fireEvent.pointerUp(canvas, toCanvas(270, 30));
    await runFrames(200);
    expect(screen.queryByText(/frame 1\/3 “menu”/)).toBeNull(); // the button left the menu
    await runFrames(2000);
    expect(screen.getByText(/GAME OVER \d+/)).toBeTruthy();

    // …and the Program panel shows every SymbolClass entry linked, the main
    // movie's two files plus the dependency's two.
    fireEvent.click(screen.getByText(/^Program/));
    expect(screen.getByText(/4 file\(s\) compiled/)).toBeTruthy();
    expect(screen.getByText(/Includes the code of dependency SWF: library\.xml/)).toBeTruthy();
    expect(screen.getAllByText('✓ linked')).toHaveLength(3);
  });

  it('without transpiled code it says so and plays the SWF timeline', async () => {
    await mount(false);
    await waitFor(() => expect(screen.getByText(/No transpiled code/)).toBeTruthy());
    await runFrames(50);
    expect(screen.getByText(/Timeline only · frame \d\/3/)).toBeTruthy();
    expect(screen.getByText(/Document class com\.game\.Main was not found/)).toBeTruthy();
  });
});
