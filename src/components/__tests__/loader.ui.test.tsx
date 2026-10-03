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

const BUNDLED_MANIFEST = {
  swfs: [
    { name: 'bassken_overview', path: 'fish-full/swfs/bassken_overview.swf' },
    { name: 'bassken_pier', path: 'fish-full/swfs/bassken_pier.swf' },
    { name: 'gsecs2.9', path: 'fish-full/swfs/gsecs2.9.swf' },
  ],
};

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

  it('offers the bundled SWFs with a main-SWF drop-down', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(BUNDLED_MANIFEST), { status: 200 })) as unknown as typeof fetch;
    try {
      const onBundled = vi.fn();
      render(<Loader onFiles={vi.fn()} onBundled={onBundled} />);

      const select = await waitFor(() => screen.getByLabelText('Bundled main SWF') as HTMLSelectElement);
      expect([...select.options].map((o) => o.value)).toEqual(['bassken_overview', 'bassken_pier', 'gsecs2.9']);
      expect(select.value).toBe('bassken_overview');
      expect(screen.getByText(/the other 2 load as dependencies/)).toBeTruthy();

      fireEvent.change(select, { target: { value: 'gsecs2.9' } });
      fireEvent.click(screen.getByText('Use bundled SWFs'));
      expect(onBundled).toHaveBeenCalledWith('gsecs2.9');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('says when a selection holds no SWF', async () => {
    render(<Loader onFiles={vi.fn()} />);
    queue([file('game/notes.txt')]);
    await waitFor(() => expect(screen.getByText(/No \.swf or \.xml SWF in this selection/)).toBeTruthy());
    expect(screen.queryByLabelText('Main SWF')).toBeNull();
  });
});
