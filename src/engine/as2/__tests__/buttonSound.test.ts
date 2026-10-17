// @vitest-environment jsdom
// P-11: a button plays its DefineButtonSound records on its own state transitions
// (SWF 19, DefineButtonSound): idle→over on roll over, over→down on press,
// down→over on release, over→idle on roll out — and on release outside, which
// ends in the idle state. Drag out / drag over play nothing, a disabled button
// plays nothing, and the button needs no script for any of this.
import { describe, expect, it } from 'vitest';
import { parseSwfXml } from '../../../lib/parser';
import { buildAS2Program } from '../program';
import { AS2Player } from '../player';
import type { AudioBackend } from '../../flash/media';

const info = (extra = '') => `type="SOUNDINFO" reserved="0" syncStop="false" syncNoMultiple="false" hasEnvelope="false" hasLoops="false" hasOutPoint="false" hasInPoint="false" inPoint="0" outPoint="0" loopCount="0"${extra}`;
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="8" frameRate="12" frameCount="1">
  <displayRect type="RECT" Xmin="0" Ymin="0" Xmax="8000" Ymax="6000"/>
  <tags>
    <item type="DefineShapeTag" shapeId="1"><shapeBounds type="RECT" Xmin="0" Ymin="0" Xmax="800" Ymax="800"/></item>
    <item type="DefineButton2Tag" buttonId="5" trackAsMenu="false">
      <characters>
        <item type="BUTTONRECORD" buttonStateUp="true" buttonStateOver="true" buttonStateDown="true" buttonStateHitTest="true" characterId="1" placeDepth="1">
          <placeMatrix type="MATRIX" hasScale="false" hasRotate="false" translateX="0" translateY="0"/>
        </item>
      </characters>
    </item>
    <item type="DefineButtonSoundTag" buttonId="5" buttonSoundChar0="13" buttonSoundChar1="10" buttonSoundChar2="11" buttonSoundChar3="12">
      <buttonSoundInfo0 ${info()}/>
      <buttonSoundInfo1 ${info()}/>
      <buttonSoundInfo2 ${info().replace('hasLoops="false"', 'hasLoops="true"').replace('hasInPoint="false"', 'hasInPoint="true"').replace('inPoint="0"', 'inPoint="4410"').replace('loopCount="0"', 'loopCount="3"')}/>
      <buttonSoundInfo3 ${info()}/>
    </item>
    <item type="PlaceObject2Tag" depth="1" characterId="5" placeFlagHasCharacter="true" placeFlagHasMatrix="true" name="btn">
      <matrix type="MATRIX" hasScale="false" hasRotate="false" translateX="2000" translateY="2000"/>
    </item>
    <item type="ShowFrameTag"/>
    <item type="EndTag"/>
  </tags>
</swf>`;

function boot() {
  const played: { id: number | null; startMs: number; loops: number }[] = [];
  const audio: AudioBackend = {
    play: (id, _url, startMs, loops) => {
      played.push({ id, startMs, loops });
      return { stop() {}, setVolume() {}, position: 0, onended: null };
    },
  };
  const doc = parseSwfXml(XML, { fileName: 'button.xml' });
  const player = new AS2Player({ doc, program: buildAS2Program([]).program, audio });
  player.start();
  return { player, played, ids: () => played.map((p) => p.id) };
}

// The button covers stage px 100..140 on both axes.
describe('button sounds (DefineButtonSound)', () => {
  it('rollOver, press, release and rollOut play their transition sounds', () => {
    const { player, played, ids } = boot();
    player.pointerMove(120, 120);
    expect(ids()).toEqual([10]);
    player.pointerDown(120, 120);
    expect(ids()).toEqual([10, 11]);
    // in point 4410 samples at 44.1 kHz = 100 ms; LoopCount 3 = two repeats
    expect(played[1]).toEqual({ id: 11, startMs: 100, loops: 2 });
    player.pointerUp(120, 120);
    expect(ids()).toEqual([10, 11, 12]);
    player.pointerMove(10, 10);
    expect(ids()).toEqual([10, 11, 12, 13]);
  });

  it('dragOut and dragOver are silent; releaseOutside plays OverUpToIdle', () => {
    const { player, ids } = boot();
    player.pointerMove(120, 120);
    player.pointerDown(120, 120);
    player.pointerMove(10, 10); // dragOut
    player.pointerMove(120, 120); // dragOver
    player.pointerMove(10, 10); // dragOut
    expect(ids()).toEqual([10, 11]);
    player.pointerUp(10, 10);
    expect(ids()).toEqual([10, 11, 13]);
  });

  it('a disabled button plays nothing', () => {
    const { player, ids } = boot();
    (player.root.obj as any).btn.enabled = false;
    player.pointerMove(120, 120);
    player.pointerDown(120, 120);
    player.pointerUp(120, 120);
    player.pointerMove(10, 10);
    expect(ids()).toEqual([]);
  });
});
