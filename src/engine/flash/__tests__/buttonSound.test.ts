// @vitest-environment jsdom
// P-11 (AVM2): a timeline SimpleButton plays its DefineButtonSound records on the
// same transitions as an AVM1 button — roll over (IdleToOverUp), press
// (OverUpToOverDown), release (OverDownToOverUp), roll out and release outside
// (OverUpToIdle); drag out / over are silent and a disabled button is silent.
import { afterEach, describe, expect, it } from 'vitest';
import { parseSwfXml } from '../../../lib/parser';
import type { LoadedAsset } from '../../../lib/assets';
import { compileSources, linkProgram } from '../loader';
import { FlashPlayer } from '../player';
import { runtime } from '../context';
import { MovieClip, SimpleButton, type DisplayObject } from '../display';
import type { AudioBackend } from '../media';
import { GAME_XML } from './gameFixture';

const plain = { syncStop: false, syncNoMultiple: false };
let current: FlashPlayer | null = null;
afterEach(() => { current?.dispose(); current = null; runtime.player = null; });

function boot() {
  const doc = parseSwfXml(GAME_XML, { fileName: 'game.swf' });
  doc.characters.get(20)!.buttonSounds = [
    { soundId: 13, info: plain }, { soundId: 10, info: plain },
    { soundId: 11, info: { ...plain, inPoint: 4410, loopCount: 3 } }, { soundId: 12, info: plain },
  ];
  const played: { id: number | null; startMs: number; loops: number }[] = [];
  const audio: AudioBackend = {
    play: (id, _url, startMs, loops) => {
      played.push({ id, startMs, loops });
      return { stop() {}, setVolume() {}, position: 0, onended: null };
    },
  };
  const assets = { get: (): LoadedAsset => ({ status: 'error' }), preview: () => undefined };
  const player = new FlashPlayer({ doc, program: linkProgram(compileSources([])), assets, audio });
  current = player;
  player.start();
  const button = (player.root as MovieClip).getChildByName('startButton') as SimpleButton;
  expect(button).toBeInstanceOf(SimpleButton);
  const b = (button as DisplayObject).getBounds(null);
  return { player, button, played, at: [b.x + b.width / 2, b.y + b.height / 2] as const, ids: () => played.map((p) => p.id) };
}

describe('SimpleButton sounds (DefineButtonSound)', () => {
  it('rollOver, press, release and rollOut', () => {
    const { player, played, at: [x, y], ids } = boot();
    player.pointerMove(x, y);
    player.pointerDown(x, y);
    expect(played[1]).toEqual({ id: 11, startMs: 100, loops: 2 });
    player.pointerUp(x, y);
    player.pointerMove(1, 1);
    expect(ids()).toEqual([10, 11, 12, 13]);
  });

  it('dragOut / dragOver are silent; releaseOutside plays OverUpToIdle', () => {
    const { player, at: [x, y], ids } = boot();
    player.pointerMove(x, y);
    player.pointerDown(x, y);
    player.pointerMove(1, 1);
    player.pointerMove(x, y);
    player.pointerMove(1, 1);
    expect(ids()).toEqual([10, 11]);
    player.pointerUp(1, 1);
    expect(ids()).toEqual([10, 11, 13]);
  });

  it('a disabled button is silent', () => {
    const { player, button, at: [x, y], ids } = boot();
    button.enabled = false;
    player.pointerMove(x, y);
    player.pointerDown(x, y);
    player.pointerUp(x, y);
    player.pointerMove(1, 1);
    expect(ids()).toEqual([]);
  });
});
