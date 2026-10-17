// Shared set-up for UI tests that drive the whole App: jsdom gaps filled in, a
// controllable animation clock, no bundled games, and an upload helper.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from '../../App';

const rafQueue: FrameRequestCallback[] = [];
let now = 0;

/** Call from `beforeAll`. */
export function installAppEnvironment() {
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
}

/** Run animation frames for `ms` of page time. */
export async function runFrames(ms: number) {
  await act(async () => {
    for (let t = 0; t < ms; t += 1000 / 60) { now += 1000 / 60; rafQueue.splice(0).forEach((cb) => cb(now)); }
  });
}

/** Queue `swf` as `name` in the Loader, load it, and wait for the Workbench. */
export async function uploadSwf(swf: Uint8Array, name: string) {
  const input = await waitFor(() => {
    const inputs = document.querySelectorAll('input[type="file"]');
    if (inputs.length < 2) throw new Error('the Loader is not shown');
    return inputs[1] as HTMLInputElement;
  });
  Object.defineProperty(input, 'files', { value: [new File([swf.buffer as ArrayBuffer], name)], configurable: true });
  fireEvent.change(input);
  fireEvent.click(await screen.findByText(/^Load 1 files$/));
  await screen.findByText('Workbench', undefined, { timeout: 5000 });
}

/** Render the App and upload one SWF. */
export async function openApp(swf: Uint8Array, name: string) {
  render(<App />);
  await uploadSwf(swf, name);
}
