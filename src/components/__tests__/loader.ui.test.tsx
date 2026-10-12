// @vitest-environment jsdom
// The Loader's Main SWF drop-down: every SWF in the queued selection is listed
// (also the ones inside a ZIP), the user picks the one that plays the game, and
// the pick is handed to the App next to the files.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import { Loader } from '../Loader';

beforeAll(() => {
  // jsdom's Blob has no arrayBuffer(); the ZIP name table is read through it.
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});
afterEach(cleanup);

function file(path: string, bytes: BlobPart = 'x'): File {
  const f = new File([bytes], path.split('/').pop()!);
  Object.defineProperty(f, 'webkitRelativePath', { value: path, configurable: true });
  return f;
}

/** Queue files through the hidden "Add files / ZIPs" input. */
function queue(files: File[]) {
  const input = document.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

// Two bundled sets, so the drop-downs are shown to keep them apart: a game's
// list contains its own SWFs only.
const GAME_INDEX = { default: 'alpha', games: ['games/alpha.json', 'games/beta.json'] };
const GAME_SETS: Record<string, unknown> = {
  'games/alpha.json': {
    id: 'alpha', label: 'Alpha Game', main: 'alpha_main',
    swfs: [
      { name: 'alpha_main', path: 'alpha/swfs/alpha_main.swf' },
      { name: 'alpha_ext', path: 'alpha/swfs/alpha_ext.swf' },
    ],
  },
  'games/beta.json': {
    id: 'beta', label: 'Beta Game', main: 'beta_main',
    swfs: [{ name: 'beta_main', path: 'beta/swfs/beta_main.swf' }],
  },
};

function serveGameIndex() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input).replace(/[?#].*$/, '');
    const body = url === 'manifest.json' ? GAME_INDEX : GAME_SETS[url];
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return () => { globalThis.fetch = realFetch; };
}

describe('Loader', () => {
  it('lists the SWFs in the queued upload and loads the picked main one first', async () => {
    const onFiles = vi.fn();
    render(<Loader onFiles={onFiles} />);
    const files = [file('game/main.swf'), file('game/external/scene/scene.swf'), file('game/notes.txt')];
    queue(files);

    const select = await waitFor(() => screen.getByLabelText('Main SWF') as HTMLSelectElement);
    await waitFor(() => expect(select.options).toHaveLength(2));
    expect([...select.options].map((o) => o.value)).toEqual([
      'game/main.swf',
      'game/external/scene/scene.swf',
    ]);
    expect(screen.getByText(/Loaded as dependencies/).textContent).toContain('scene');

    fireEvent.change(select, { target: { value: 'game/external/scene/scene.swf' } });
    fireEvent.click(screen.getByText(/^Load 3 files/));

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['main.swf', 'scene.swf', 'notes.txt']);
    expect(onFiles.mock.calls[0][1]).toBe('game/external/scene/scene.swf');
  });

  it('finds the SWFs inside a queued ZIP', async () => {
    render(<Loader onFiles={vi.fn()} />);
    const zip = new JSZip();
    zip.file('game/main.swf', 'x');
    zip.file('game/external/chat.swf', 'x');
    queue([new File([await zip.generateAsync({ type: 'blob' })], 'game.zip')]);

    const select = await waitFor(() => screen.getByLabelText('Main SWF') as HTMLSelectElement);
    await waitFor(() => expect([...select.options].map((o) => o.value)).toEqual(['game/main.swf', 'game/external/chat.swf']));
  });

  it('offers each bundled game with its own main-SWF drop-down', async () => {
    const restore = serveGameIndex();
    try {
      const onBundled = vi.fn();
      render(<Loader onFiles={vi.fn()} onBundled={onBundled} />);

      const gameSelect = await waitFor(() => screen.getByLabelText('Bundled game') as HTMLSelectElement);
      expect([...gameSelect.options].map((o) => o.value)).toEqual(['alpha', 'beta']);

      // Alpha's list holds Alpha's SWFs only — the other set never leaks in.
      const select = screen.getByLabelText('Bundled main SWF') as HTMLSelectElement;
      expect([...select.options].map((o) => o.value)).toEqual(['alpha_main', 'alpha_ext']);
      expect(select.value).toBe('alpha_main');
      expect(screen.getByText(/Alpha Game: the selected SWF plays the game; the other 1 load as dependencies/)).toBeTruthy();

      // Switching the game swaps the SWF list (and its default main movie).
      fireEvent.change(gameSelect, { target: { value: 'beta' } });
      await waitFor(() => expect([...(screen.getByLabelText('Bundled main SWF') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['beta_main']));

      fireEvent.change(screen.getByLabelText('Bundled main SWF'), { target: { value: 'beta_main' } });
      fireEvent.click(screen.getByText('Use bundled SWFs'));
      expect(onBundled).toHaveBeenCalledWith('beta', 'beta_main');
    } finally {
      restore();
    }
  });

  it('falls back to a legacy flat manifest as one anonymous set', async () => {
    const restore = serveGameIndex();
    const legacy = { swfs: [{ name: 'alpha_main', path: 'alpha/swfs/alpha_main.swf' }] };
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(legacy), { status: 200 })) as unknown as typeof fetch;
    try {
      render(<Loader onFiles={vi.fn()} onBundled={vi.fn()} />);
      const select = await waitFor(() => screen.getByLabelText('Bundled main SWF') as HTMLSelectElement);
      expect([...select.options].map((o) => o.value)).toEqual(['alpha_main']);
      // a single set means no game picker
      expect(screen.queryByLabelText('Bundled game')).toBeNull();
    } finally {
      restore();
    }
  });

  it('says when a selection holds no SWF', async () => {
    render(<Loader onFiles={vi.fn()} />);
    queue([file('game/notes.txt')]);
    await waitFor(() => expect(screen.getByText(/No \.swf or \.xml SWF in this selection/)).toBeTruthy());
    expect(screen.queryByLabelText('Main SWF')).toBeNull();
  });
});
