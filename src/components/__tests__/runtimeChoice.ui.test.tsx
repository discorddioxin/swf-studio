// @vitest-environment jsdom
// P-13 end to end: an uploaded SWF runs on the VM it declares, and the Execute
// console says which rule chose it.
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tag, writeSwf } from '@/testing/swfWriter';
import { installAppEnvironment, openApp, runFrames } from './appHarness';

beforeAll(installAppEnvironment);
afterEach(cleanup);

async function executeConsole(swf: Uint8Array, name: string) {
  await openApp(swf, name);
  fireEvent.click(screen.getByText('Execute'));
}

/** The player starts after asynchronous set-up and its log is drained by animation
 *  frames, so keep the clock running until the console shows the line. */
async function consoleLine(text: string) {
  for (let i = 0; i < 40; i++) {
    await runFrames(200);
    const hit = screen.queryByText(text);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`the console never showed: ${text}`);
}

describe('Execute runs the VM the movie declares', () => {
  it('a script-less AVM1 movie runs on the AS2 player', async () => {
    await executeConsole(writeSwf({ version: 6, tags: [tag.showFrame(), tag.end()] }), 'plain.swf');
    expect(await consoleLine('runtime: AVM1 (ActionScript 1/2) — no FileAttributes tag: an AVM1 movie')).toBeTruthy();
    expect(screen.queryByText(/runtime: AVM2/)).toBeNull();
  });

  it('an AS3 movie with no SymbolClass runs on the AS3 engine', async () => {
    await executeConsole(writeSwf({ version: 10, tags: [tag.fileAttributes({ as3: true }), tag.showFrame(), tag.end()] }), 'as3.swf');
    expect(await consoleLine('runtime: AVM2 (ActionScript 3) — FileAttributes: ActionScript3 = 1')).toBeTruthy();
    expect(screen.queryByText(/runtime: AVM1/)).toBeNull();
  });
});
