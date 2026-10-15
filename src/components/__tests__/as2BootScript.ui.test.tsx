// @vitest-environment jsdom
// P-26: an AS2 boot script belongs to the game it was written for. Saved while
// game A is loaded, it must not run (or even show) when game B is loaded.
// P-38: the game starts once — registering its embedded fonts does not restart it.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetCache, ingestFiles } from '../../lib/assets';
import { parseSwfXml } from '../../lib/parser';
import { ExecuteTab } from '../ExecuteTab';
import { bootKey, LEGACY_BOOT_KEY, migrateLegacyBoot } from '../bootScripts';

// Font registration (FontFace.load) finishes whenever the browser is done. With
// `fontsHeld` set, it waits until the test lets it go, after the game started.
const fonts = vi.hoisted(() => ({ held: false, release: [] as (() => void)[] }));
vi.mock('../../engine/as2/audio', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../engine/as2/audio')>();
  return {
    ...real,
    registerFonts: async (...args: Parameters<typeof real.registerFonts>) => {
      if (fonts.held) await new Promise<void>((resolve) => fonts.release.push(resolve));
      return real.registerFonts(...args);
    },
  };
});

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="7" frameRate="12" frameCount="1">
  <displayRect type="RECT" Xmin="0" Ymin="0" Xmax="8000" Ymax="6000"/>
  <tags><item type="DoActionTag"/><item type="ShowFrameTag"/><item type="EndTag"/></tags>
</swf>`;

const rafQueue: FrameRequestCallback[] = [];
let now = 0;
beforeAll(() => {
  if (!Blob.prototype.text) {
    Blob.prototype.text = function text(this: Blob) {
      return new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(this); });
    };
  }
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  performance.now = () => now;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

function file(path: string, text: string, game: string) {
  const f = new File([text], path.split('/').pop()!);
  Object.defineProperty(f, 'webkitRelativePath', { value: `${game}/${path}` });
  return f;
}
const gameBundle = (game: string) => ingestFiles([file(`${game}.xml`, XML, game), file('scripts/frame_1/DoAction.as', 'stop();', game)]);
const gameDoc = async (game: string) => parseSwfXml(await gameBundle(game).xmlFile!.text(), { fileName: `${game}.xml` });
async function mount(game: string) {
  const bundle = gameBundle(game);
  const doc = parseSwfXml(await bundle.xmlFile!.text(), { fileName: `${game}.xml` });
  render(<ExecuteTab doc={doc} cache={new AssetCache(bundle, () => {})} assets={bundle} />);
  await waitFor(() => expect(screen.getByText(/AS2 engine/)).toBeTruthy());
  await runFrames(250);
}
/** Run animation frames (the tab flushes its console at most every 100 ms, so callers run past that). */
async function runFrames(ms: number) {
  await act(async () => {
    for (let t = 0; t < ms; t += 1000 / 60) { now += 1000 / 60; rafQueue.splice(0).forEach((cb) => cb(now)); }
  });
}
const openProgram = () => fireEvent.click(screen.getByText(/^Program/));
const bootField = () => screen.getByLabelText('Boot script') as HTMLTextAreaElement;
// The marker is built when the script runs, so finding it proves it ran (the
// script's own text shows up in the field and in the unassigned-script notice).
const SCRIPT = "player.log('info', 'BOOT' + ' RAN')";
const RAN = /BOOT RAN/;

describe('AS2 boot scripts are per game', () => {
  it('a script saved for game A neither runs nor shows in game B', async () => {
    await mount('gameA');
    openProgram();
    fireEvent.change(bootField(), { target: { value: SCRIPT } });
    fireEvent.click(screen.getByText('Restart with script'));
    await runFrames(250);
    fireEvent.click(screen.getByText(/^Console/));    // the console and the Program panel share the slot
    expect(screen.getAllByText(RAN).length).toBeGreaterThan(0);
    expect(screen.getByText('Custom boot script active')).toBeTruthy();
    expect(screen.getByText(/running the custom boot script saved for this game/)).toBeTruthy();
    cleanup();

    await mount('gameB');
    expect(screen.queryByText(RAN)).toBeNull();
    expect(screen.queryByText(/running .*boot script/)).toBeNull();
    expect(screen.queryByText('Custom boot script active')).toBeNull();
    openProgram();
    expect(bootField().value).toBe('');
    cleanup();

    await mount('gameA');                       // …and game A still has it
    expect(screen.getAllByText(RAN).length).toBeGreaterThan(0);
  });

  it('a script from the old global key stays unassigned (and idle) until the developer picks a game', async () => {
    localStorage.setItem(LEGACY_BOOT_KEY, SCRIPT);
    await mount('gameA');
    expect(screen.queryByText(RAN)).toBeNull();
    expect(screen.getByText(/not tied to any game, so it does not run/)).toBeTruthy();
    fireEvent.click(screen.getByText('Use for this game'));
    expect(localStorage.getItem(LEGACY_BOOT_KEY)).toBeNull();
    expect(screen.queryByText(/not tied to any game/)).toBeNull();
    fireEvent.click(screen.getByText('Restart'));
    await runFrames(250);
    expect(screen.getAllByText(RAN).length).toBeGreaterThan(0);
  });
});

describe('starting a game (P-38)', () => {
  it('runs once: registering the embedded fonts does not restart it', async () => {
    const g = globalThis as { __boots?: number };
    const counting = "globalThis.__boots = (globalThis.__boots || 0) + 1; player.log('info', 'START ' + globalThis.__boots)";
    await mount('gameA');
    openProgram();
    fireEvent.change(bootField(), { target: { value: counting } });
    fireEvent.click(screen.getByText('Restart with script'));
    await runFrames(250);
    cleanup();

    g.__boots = 0;
    fonts.held = true;
    try {
      render(<ExecuteTab doc={await gameDoc('gameA')} cache={new AssetCache(gameBundle('gameA'), () => {})} assets={gameBundle('gameA')} />);
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));   // the program is built meanwhile
      await runFrames(250);
      await act(async () => { fonts.release.splice(0).forEach((go) => go()); await new Promise((resolve) => setTimeout(resolve, 50)); });
      await runFrames(250);
      expect(g.__boots).toBe(1);
      expect(screen.getAllByText(/START 1/).length).toBeGreaterThan(0);  // and its console was not wiped
    } finally {
      fonts.held = false;
      fonts.release.splice(0).forEach((go) => go());
      delete g.__boots;
    }
  });
});

describe('migrateLegacyBoot', () => {
  const key = bootKey('gaia-fishing', 'bassken_game4.21');
  it("moves one of the adapter's presets silently and deletes the old key", () => {
    localStorage.setItem(LEGACY_BOOT_KEY, '  _root.go();\n');
    expect(migrateLegacyBoot(key, ['_root.go();'], ['_root.go();'])).toBeNull();
    expect(localStorage.getItem(key)).toBe('  _root.go();\n');
    expect(localStorage.getItem(LEGACY_BOOT_KEY)).toBeNull();
  });
  it("leaves another adapter's preset for that adapter, and drops an empty script", () => {
    localStorage.setItem(LEGACY_BOOT_KEY, 'other();');
    expect(migrateLegacyBoot(key, [], ['other();'])).toBeNull();
    expect(localStorage.getItem(LEGACY_BOOT_KEY)).toBe('other();');
    expect(localStorage.getItem(key)).toBeNull();
    localStorage.setItem(LEGACY_BOOT_KEY, '  ');
    expect(migrateLegacyBoot(key, [], [])).toBeNull();
    expect(localStorage.getItem(LEGACY_BOOT_KEY)).toBeNull();
  });
  it('keeps anything else as an unassigned script', () => {
    localStorage.setItem(LEGACY_BOOT_KEY, 'mine();');
    expect(migrateLegacyBoot(key, [], [])).toBe('mine();');
    expect(localStorage.getItem(LEGACY_BOOT_KEY)).toBe('mine();');
    expect(localStorage.getItem(key)).toBeNull();
  });
});
