// @vitest-environment jsdom
// P-05: the Workbench's keys (Space plays, arrows step, Home/End jump) belong to
// the Workbench. Keys pressed in a running game drive the game, not the hidden
// Workbench timeline, and the Workbench does not keep playing in the background.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { tag, writeSwf } from '@/testing/swfWriter';

const rafQueue: FrameRequestCallback[] = [];
let now = 0;
beforeAll(() => {
  for (const method of ['arrayBuffer', 'text'] as const) {
    if (Blob.prototype[method]) continue;
    Blob.prototype[method] = function read(this: Blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        if (method === 'text') reader.readAsText(this); else reader.readAsArrayBuffer(this);
      });
    } as never;
  }
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  performance.now = () => now;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  URL.createObjectURL ??= () => 'blob:test';
  URL.revokeObjectURL ??= () => {};
  // no bundled games in this deployment
  globalThis.fetch = vi.fn(async () => new Response('not found', { status: 404 })) as typeof fetch;
});
afterEach(cleanup);

/** Run animation frames for `ms` of page time. */
async function runFrames(ms: number) {
  await act(async () => {
    for (let t = 0; t < ms; t += 1000 / 60) { now += 1000 / 60; rafQueue.splice(0).forEach((cb) => cb(now)); }
  });
}

/** Upload a 3-frame movie and wait for the Workbench. */
async function openMovie() {
  render(<App />);
  const swf = writeSwf({ version: 8, frameRate: 12, tags: [tag.showFrame(), tag.showFrame(), tag.showFrame(), tag.end()] });
  const input = await waitFor(() => {
    const inputs = document.querySelectorAll('input[type="file"]');
    expect(inputs.length).toBeGreaterThan(1);
    return inputs[1] as HTMLInputElement;
  });
  Object.defineProperty(input, 'files', { value: [new File([swf.buffer as ArrayBuffer], 'three.swf')], configurable: true });
  fireEvent.change(input);
  fireEvent.click(await screen.findByText(/^Load 1 files$/));
  await screen.findByText('Workbench', undefined, { timeout: 5000 });
}

/** The Workbench timeline's frame field (1-based; its max is the frame count). */
const workbenchFrame = () => (document.querySelector('input[type="number"][max="3"]') as HTMLInputElement).value;
const isPlaying = () => screen.queryByText('❚❚') !== null;
const keys = (target: Element) => {
  for (const code of ['Space', 'ArrowRight', 'End']) {
    fireEvent.keyDown(target, { code, key: code === 'Space' ? ' ' : code });
  }
};

describe('Workbench keys stay in the Workbench', () => {
  it('keys pressed in Execute leave the Workbench timeline alone', async () => {
    await openMovie();
    expect(workbenchFrame()).toBe('1');

    fireEvent.click(screen.getByText('Execute'));
    await runFrames(100);
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeTruthy();
    keys(canvas!);
    keys(document.body);   // also with focus elsewhere in the Execute workspace
    await runFrames(500);

    fireEvent.click(screen.getByText('Workbench'));
    expect(workbenchFrame()).toBe('1');
    expect(isPlaying()).toBe(false);
  });

  it('leaving the Workbench stops its playback', async () => {
    await openMovie();
    keys(document.body);   // the Workbench's own keys still work: plays, steps, jumps to the end
    expect(workbenchFrame()).toBe('3');
    fireEvent.keyDown(document.body, { code: 'Home', key: 'Home' });
    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    expect(isPlaying()).toBe(true);

    fireEvent.click(screen.getByText('Execute'));
    await runFrames(1000);   // 12 fps: would be 12 frames of background playback
    fireEvent.click(screen.getByText('Workbench'));
    expect(isPlaying()).toBe(false);
    expect(workbenchFrame()).toBe('1');
  });
});
