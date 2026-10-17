// @vitest-environment jsdom
// P-05: the Workbench's keys (Space plays, arrows step, Home/End jump) belong to
// the Workbench. Keys pressed in a running game drive the game, not the hidden
// Workbench timeline, and the Workbench does not keep playing in the background.
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tag, writeSwf } from '@/testing/swfWriter';
import { installAppEnvironment, openApp, runFrames } from './appHarness';

beforeAll(installAppEnvironment);
afterEach(cleanup);

/** Upload a 3-frame movie and wait for the Workbench. */
const openMovie = () => openApp(writeSwf({ version: 8, frameRate: 12, tags: [tag.showFrame(), tag.showFrame(), tag.showFrame(), tag.end()] }), 'three.swf');

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
