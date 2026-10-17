// @vitest-environment jsdom
// P-35: "New folder" starts a new session. Nothing picked for the previous game
// (here: its game adapter) applies to the next one.
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tag, writeSwf } from '@/testing/swfWriter';
import { installAppEnvironment, openApp, runFrames, uploadSwf } from './appHarness';

beforeAll(installAppEnvironment);
afterEach(cleanup);

/** An AVM1 movie with a script, so Execute runs it on the AS2 player (which has the adapter pick). */
const avm1Movie = (frames: number) => writeSwf({ version: 8, tags: [tag.doAction(), ...Array.from({ length: frames }, () => tag.showFrame()), tag.end()] });
const adapterPick = () => (screen.getByLabelText('Game adapter') as HTMLSelectElement).value;

describe('New folder', () => {
  it("forgets the previous game's adapter pick", async () => {
    await openApp(avm1Movie(1), 'first.swf');
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    await runFrames(100);
    fireEvent.change(screen.getByLabelText('Game adapter'), { target: { value: 'gaia-fishing' } });
    expect(adapterPick()).toBe('gaia-fishing');

    fireEvent.click(screen.getByText('New folder'));
    await uploadSwf(avm1Movie(2), 'unrelated.swf');
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    await runFrames(100);
    expect(adapterPick()).toBe('auto');
  });
});
