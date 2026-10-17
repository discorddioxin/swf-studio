// @vitest-environment jsdom
// P-11: tag 17 is DefineButtonSound (SWF 19, "DefineButtonSound"): ButtonId, then
// four (sound id, SOUNDINFO) pairs — OverUpToIdle, IdleToOverUp, OverUpToOverDown,
// OverDownToOverUp; a sound id of 0 means none and has no SOUNDINFO. The records
// belong to the button; the tag defines no character of its own. Tag 23 is
// DefineButtonCxform, a colour transform (not an action).
import { describe, expect, it } from 'vitest';
import { parseSwfBinary, TAG_NAMES } from './binary';
import { classify, parseSwfXml } from '../parser';
import { tag, writeSwf } from '@/testing/swfWriter';
import { xmlToSwf } from '../../../tools/xml2swf/xml2swf.mjs';

const EXPECTED = [
  null,
  { soundId: 10, info: { syncStop: false, syncNoMultiple: false } },
  { soundId: 11, info: { syncStop: false, syncNoMultiple: true, inPoint: 4410, loopCount: 3, envelope: [{ pos44: 0, left: 32768, right: 0 }] } },
  { soundId: 12, info: { syncStop: true, syncNoMultiple: false } },
];

const FFDEC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="8" frameRate="24.0" frameCount="1" compressed="false">
  <displayRect type="RECT" Xmin="0" Xmax="6400" Ymin="0" Ymax="4800" nbits="14"/>
  <tags>
    <item type="DefineShapeTag" shapeId="1"><shapeBounds type="RECT" Xmin="0" Ymin="0" Xmax="400" Ymax="400"/></item>
    <item type="DefineButton2Tag" buttonId="5" trackAsMenu="false">
      <characters>
        <item type="BUTTONRECORD" buttonStateUp="true" buttonStateOver="true" buttonStateDown="true" buttonStateHitTest="true" characterId="1" placeDepth="1">
          <placeMatrix type="MATRIX" hasScale="false" hasRotate="false" translateX="0" translateY="0" nTranslateBits="0"/>
        </item>
      </characters>
      <actions/>
    </item>
    <item type="DefineButtonSoundTag" buttonId="5" buttonSoundChar0="0" buttonSoundChar1="10" buttonSoundChar2="11" buttonSoundChar3="12">
      <buttonSoundInfo1 type="SOUNDINFO" reserved="0" syncStop="false" syncNoMultiple="false" hasEnvelope="false" hasLoops="false" hasOutPoint="false" hasInPoint="false" inPoint="0" outPoint="0" loopCount="0"><envelopeRecords/></buttonSoundInfo1>
      <buttonSoundInfo2 type="SOUNDINFO" reserved="0" syncStop="false" syncNoMultiple="true" hasEnvelope="true" hasLoops="true" hasOutPoint="false" hasInPoint="true" inPoint="4410" outPoint="0" loopCount="3"><envelopeRecords><item type="SOUNDENVELOPE" pos44="0" leftLevel="32768" rightLevel="0"/></envelopeRecords></buttonSoundInfo2>
      <buttonSoundInfo3 type="SOUNDINFO" reserved="0" syncStop="true" syncNoMultiple="false" hasEnvelope="false" hasLoops="false" hasOutPoint="false" hasInPoint="false" inPoint="0" outPoint="0" loopCount="0"><envelopeRecords/></buttonSoundInfo3>
    </item>
    <item type="ShowFrameTag"/>
    <item type="EndTag"/>
  </tags>
</swf>`;

describe('DefineButtonSound', () => {
  it('is named and classified as FFDec / the spec do', () => {
    expect(TAG_NAMES[17]).toBe('DefineButtonSoundTag');
    expect(TAG_NAMES[23]).toBe('DefineButtonCxformTag');
    expect(classify('DefineButtonSoundTag')).toBe('define');
    expect(classify('DefineButtonCxformTag')).toBe('define');
  });

  it('binary: the four records are attached to the button', async () => {
    const swf = writeSwf({ version: 8, tags: [
      tag.defineButton2(5, [{ up: true, over: true, down: true, hit: true, character: 1, depth: 1 }]),
      tag.defineButtonSound(5, [
        null,
        [10, {}],
        [11, { syncNoMultiple: true, inPoint: 4410, loopCount: 3, envelope: [{ pos44: 0, left: 32768, right: 0 }] }],
        [12, { syncStop: true }],
      ]),
      tag.showFrame(), tag.end(),
    ] });
    const { doc } = await parseSwfBinary(swf.buffer as ArrayBuffer, 'button.swf');
    expect(doc.warnings).toEqual([]);
    const button = doc.characters.get(5)!;
    expect(button.kind).toBe('button');
    expect(button.buttonSounds).toEqual(EXPECTED);
  });

  it('FFDec XML: the same records, and the button keeps its own definition', () => {
    const doc = parseSwfXml(FFDEC_XML, { fileName: 'button.xml' });
    const button = doc.characters.get(5)!;
    expect(button.tagType).toBe('DefineButton2Tag');
    expect(button.buttonSounds).toEqual(EXPECTED);
    expect(doc.timelines.get('button:5')!.frames[0].display.map((d) => d.characterId)).toEqual([1]);
  });

  it('xml2swf writes tag 17 from the FFDec form, and the binary parser reads it back', async () => {
    // Without the placeholder shape (xml2swf needs a full SHAPEWITHSTYLE to write one)
    // and the End tag (xml2swf appends it, as FFDec exports have none).
    const xml = FFDEC_XML.replace(/ *<item type="DefineShapeTag".*?<\/item>\n/, '').replace(/ *<item type="EndTag"\/>\n/, '');
    const bytes = Uint8Array.from(xmlToSwf(xml));
    const { doc } = await parseSwfBinary(bytes.buffer, 'roundtrip.swf');
    expect(doc.characters.get(5)!.buttonSounds).toEqual(EXPECTED);
  });
});
