// @vitest-environment jsdom
// P-10: PlaceObject (tag 4, SWF 1+) is `UI16 CharacterId, UI16 Depth, MATRIX`
// and, if bytes remain, a CXFORM without alpha (SWF 19, "PlaceObject"). The
// FFDec export of the same tag (`PlaceObjectTag`: characterId, depth, matrix,
// optional colorTransform) gives the same display list.
import { describe, expect, it } from 'vitest';
import { parseSwfBinary, TAG_NAMES } from './binary';
import { parseSwfXml } from '../parser';
import { tag, writeSwf, type SwfTag } from '@/testing/swfWriter';

async function rootFrames(tags: SwfTag[]) {
  const swf = writeSwf({ version: 8, tags: [...tags, tag.end()] });
  const { doc } = await parseSwfBinary(swf.buffer as ArrayBuffer, 'place.swf');
  expect(doc.warnings).toEqual([]);
  return doc.root.frames;
}

const FFDEC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="8" frameRate="24.0" frameCount="1" compressed="false">
  <displayRect type="RECT" Xmin="0" Xmax="6400" Ymin="0" Ymax="4800" nbits="14"/>
  <tags>
    <item type="PlaceObjectTag" characterId="7" depth="3">
      <matrix type="MATRIX" hasScale="true" scaleX="131072" scaleY="65536" hasRotate="false" rotateSkew0="0" rotateSkew1="0" translateX="200" translateY="-100" nScaleBits="19" nRotateBits="0" nTranslateBits="9"/>
      <colorTransform type="CXFORM" hasAddTerms="true" hasMultTerms="true" nbits="9" redMultTerm="128" greenMultTerm="256" blueMultTerm="256" redAddTerm="10" greenAddTerm="0" blueAddTerm="-20"/>
    </item>
    <item type="ShowFrameTag"/>
    <item type="EndTag"/>
  </tags>
</swf>`;

describe('PlaceObject (tag 4)', () => {
  it('places the character with its matrix and colour transform', async () => {
    const [f] = await rootFrames([tag.placeObject(7, 3, { scaleX: 2, tx: 200, ty: -100 }, { mult: [0.5, 1, 1], add: [10, 0, -20] }), tag.showFrame()]);
    expect(f.display).toEqual([expect.objectContaining({
      depth: 3, characterId: 7,
      matrix: { a: 2, b: 0, c: 0, d: 1, tx: 200, ty: -100 },
      colorTransform: { rm: 0.5, gm: 1, bm: 1, am: 1, ra: 10, ga: 0, ba: -20, aa: 0 },
    })]);
    expect(f.ops).toEqual([expect.objectContaining({ op: 'place', tagType: 'PlaceObjectTag', depth: 3, characterId: 7 })]);
    expect(f.special).toBe(false);   // a plain place, like PlaceObject2
  });

  it('without a CXFORM there is no colour transform', async () => {
    const [f] = await rootFrames([tag.placeObject(7, 3, { tx: 20, ty: 40 }), tag.showFrame()]);
    expect(f.display).toEqual([expect.objectContaining({ depth: 3, characterId: 7, matrix: { a: 1, b: 0, c: 0, d: 1, tx: 20, ty: 40 } })]);
    expect(f.display[0].colorTransform).toBeUndefined();
  });

  it('RemoveObject is a plain remove too', async () => {
    const f = await rootFrames([tag.placeObject(7, 3), tag.showFrame(), tag.removeObject(7, 3), tag.showFrame()]);
    expect(f[1].display).toEqual([]);
    expect(f[1].special).toBe(false);
  });

  it('the FFDec export of the same tag gives the same display list', async () => {
    const [binary] = await rootFrames([tag.placeObject(7, 3, { scaleX: 2, tx: 200, ty: -100 }, { mult: [0.5, 1, 1], add: [10, 0, -20] }), tag.showFrame()]);
    const xml = parseSwfXml(FFDEC_XML, { fileName: 'place.xml' }).root.frames[0];
    expect(xml.display).toEqual(binary.display);
  });
});

describe('tag names', () => {
  it('match FFDec for the tags it knows', () => {
    expect(TAG_NAMES).toMatchObject({
      4: 'PlaceObjectTag', 5: 'RemoveObjectTag', 13: 'DefineFontInfoTag', 41: 'ProductInfoTag',
      62: 'DefineFontInfo2Tag', 63: 'DebugIDTag', 66: 'SetTabIndexTag', 71: 'ImportAssets2Tag',
      72: 'DoABCTag', 82: 'DoABC2Tag', 91: 'DefineFont4Tag',
    });
  });
});
