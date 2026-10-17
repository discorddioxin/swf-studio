// @vitest-environment jsdom
// P-04: PlaceObject3 / BUTTONRECORD surface filters and blend modes (SWF 19:
// "PlaceObject3", "FILTERLIST", "BUTTONRECORD"). Both readers — the binary one
// and the FFDec XML one — must produce the same filter model (flash.filters units:
// pixels, degrees, 0xRRGGBB + alpha 0–1, quality = passes) and blend mode names.
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from './binary';
import { parseSwfXml } from '../parser';
import { tag, writeSwf, type SwfTag } from '@/testing/swfWriter';
import { toBlendMode, type DisplayItem, type SwfDocument, type SwfFilter } from '@/types';
import { xmlToSwf } from '../../../tools/xml2swf/xml2swf.mjs';

/** Rounds every number (SWF stores 16.16 / 8.8 / byte alpha / single floats). */
function approx<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x)));
}

const ALL: SwfFilter[] = [
  { kind: 'dropShadow', color: 0x112233, alpha: 0.6, blurX: 4, blurY: 6, angle: 45, distance: 4, strength: 1.5, quality: 1, inner: false, knockout: false, hideObject: false },
  { kind: 'blur', blurX: 8, blurY: 2.5, quality: 3 },
  { kind: 'glow', color: 0xff0000, alpha: 1, blurX: 6, blurY: 6, strength: 2, quality: 2, inner: true, knockout: true },
  { kind: 'bevel', highlightColor: 0xffffff, highlightAlpha: 1, shadowColor: 0x000000, shadowAlpha: 0.8, blurX: 4, blurY: 4, angle: 135, distance: 2, strength: 1, quality: 1, knockout: false, type: 'inner' },
  { kind: 'gradientGlow', colors: [0xffffff, 0x00ff00], alphas: [0, 1], ratios: [0, 255], blurX: 10, blurY: 10, angle: 0, distance: 0, strength: 1, quality: 1, knockout: false, type: 'outer' },
  { kind: 'convolution', matrixX: 3, matrixY: 3, matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0], divisor: 1, bias: 0, preserveAlpha: true, clamp: true, color: 0, alpha: 0 },
  { kind: 'colorMatrix', matrix: [0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0, 0, 0, 1, 0] },
  { kind: 'gradientBevel', colors: [0xffffff, 0x808080, 0x000000], alphas: [1, 0, 1], ratios: [0, 128, 255], blurX: 3, blurY: 3, angle: 90, distance: 3, strength: 1, quality: 1, knockout: true, type: 'full' },
];

async function binaryDoc(tags: SwfTag[]): Promise<SwfDocument> {
  const swf = writeSwf({ version: 10, tags: [...tags, tag.end()] });
  const { doc } = await parseSwfBinary(swf.buffer as ArrayBuffer, 'filters.swf');
  return doc;
}
const rootDisplay = (doc: SwfDocument, frame: number): DisplayItem[] => doc.timelines.get('root')!.frames[frame].display;

describe('toBlendMode', () => {
  it('maps the SWF byte and names in any case', () => {
    expect([0, 1, 2, 3, 8, 9, 14].map((n) => toBlendMode(n))).toEqual(['normal', 'normal', 'layer', 'multiply', 'add', 'subtract', 'hardlight']);
    expect(toBlendMode('3')).toBe('multiply');
    expect(toBlendMode('Add')).toBe('add');
    expect(toBlendMode('HARDLIGHT')).toBe('hardlight');
    expect(toBlendMode(15)).toBeUndefined();
    expect(toBlendMode('')).toBeUndefined();
  });
});

describe('binary FILTERLIST', () => {
  it('reads a DropShadow laid out byte by byte as the spec gives it', async () => {
    const body = [
      0x00, 0x01, // PlaceObject3 flags: Character; FilterList
      0x01, 0x00, 0x05, 0x00, // depth 1, character 5
      0x01, 0x00, // one filter, id 0 (DropShadow)
      0x00, 0x00, 0x00, 0x80, // RGBA
      0x00, 0x00, 0x04, 0x00, // BlurX 4.0 (FIXED)
      0x00, 0x80, 0x02, 0x00, // BlurY 2.5
      0x10, 0xc9, 0x00, 0x00, // Angle 0.7854 rad (FIXED) = 45°
      0x00, 0x00, 0x04, 0x00, // Distance 4.0
      0x80, 0x01, // Strength 1.5 (FIXED8)
      0x22, // InnerShadow 0, Knockout 0, CompositeSource 1, Passes 2
    ];
    body[0] = 0x02;
    const doc = await binaryDoc([{ code: 70, body: Uint8Array.from(body) }, tag.showFrame()]);
    expect(doc.warnings).toEqual([]);
    const [item] = rootDisplay(doc, 0);
    expect(approx(item.filters)).toEqual(approx([{
      kind: 'dropShadow', color: 0, alpha: 128 / 255, blurX: 4, blurY: 2.5, angle: 0.7854 * 180 / Math.PI, distance: 4,
      strength: 1.5, quality: 2, inner: false, knockout: false, hideObject: false,
    }]));
  });

  it('reads every filter kind and the blend mode on a PlaceObject3', async () => {
    const doc = await binaryDoc([tag.placeObject3({ depth: 1, character: 5, filters: ALL, blendMode: 3 }), tag.showFrame()]);
    expect(doc.warnings).toEqual([]);
    const [item] = rootDisplay(doc, 0);
    expect(approx(item.filters)).toEqual(approx(ALL));
    expect(item.blendMode).toBe('multiply');
    expect(item.hasFilters).toBe(true);
  });

  it('a move with a filter list or blend mode replaces them; one without keeps them', async () => {
    const doc = await binaryDoc([
      tag.placeObject3({ depth: 1, character: 5, filters: [ALL[1]], blendMode: 4 }), tag.showFrame(),
      tag.placeObject3({ depth: 1, move: true, matrix: { tx: 200 } }), tag.showFrame(),
      tag.placeObject3({ depth: 1, move: true, filters: [ALL[6]], blendMode: 0 }), tag.showFrame(),
      tag.placeObject3({ depth: 1, move: true, filters: [] }), tag.showFrame(),
    ]);
    const at = (f: number) => rootDisplay(doc, f)[0];
    expect([at(0).filters?.[0].kind, at(0).blendMode]).toEqual(['blur', 'screen']);
    expect([at(1).filters?.[0].kind, at(1).blendMode, at(1).matrix.tx]).toEqual(['blur', 'screen', 200]);
    expect([at(2).filters?.[0].kind, at(2).blendMode]).toEqual(['colorMatrix', undefined]);
    expect(at(3).filters).toBeUndefined();
  });

  it('reads DefineButton2 record filters and blend modes', async () => {
    const doc = await binaryDoc([
      tag.defineButton2(7, [{ up: true, over: true, down: true, hit: true, character: 1, depth: 1, filters: [ALL[2]], blendMode: 8 }]),
      tag.showFrame(),
    ]);
    expect(doc.warnings).toEqual([]);
    const [rec] = doc.timelines.get('button:7')!.frames[0].display;
    expect(approx(rec.filters)).toEqual(approx([ALL[2]]));
    expect(rec.blendMode).toBe('add');
  });
});

// The same filters as FFDec 22 exports them (SwfXmlExporter: nested objects are
// elements named after the field with type = the class, lists hold <item>s).
const RGBA = (field: string, r: number, g: number, b: number, a: number) =>
  `<${field} type="RGBA" red="${r}" green="${g}" blue="${b}" alpha="${a}"/>`;
const list = (field: string, values: number[]) => `<${field}>${values.map((v) => `<item>${v}</item>`).join('')}</${field}>`;
const FILTER_ITEMS = [
  `<item type="DROPSHADOWFILTER" angle="0.7853981633974483" blurX="4.0" blurY="6.0" compositeSource="true" distance="4.0" innerShadow="false" knockout="false" passes="1" strength="1.5">${RGBA('dropShadowColor', 0x11, 0x22, 0x33, 153)}</item>`,
  `<item type="BLURFILTER" blurX="8.0" blurY="2.5" passes="3" reserved="0"/>`,
  `<item type="GLOWFILTER" blurX="6.0" blurY="6.0" compositeSource="true" innerGlow="true" knockout="true" passes="2" strength="2.0">${RGBA('glowColor', 255, 0, 0, 255)}</item>`,
  `<item type="BEVELFILTER" angle="2.356194490192345" blurX="4.0" blurY="4.0" compositeSource="true" distance="2.0" innerShadow="true" knockout="false" onTop="false" passes="1" strength="1.0">${RGBA('highlightColor', 255, 255, 255, 255)}${RGBA('shadowColor', 0, 0, 0, 204)}</item>`,
  `<item type="GRADIENTGLOWFILTER" angle="0.0" blurX="10.0" blurY="10.0" compositeSource="true" distance="0.0" innerShadow="false" knockout="false" onTop="false" passes="1" strength="1.0"><gradientColors><item type="RGBA" red="255" green="255" blue="255" alpha="0"/><item type="RGBA" red="0" green="255" blue="0" alpha="255"/></gradientColors>${list('gradientRatio', [0, 255])}</item>`,
  `<item type="CONVOLUTIONFILTER" bias="0.0" clamp="true" divisor="1.0" matrixX="3" matrixY="3" preserveAlpha="true" reserved="0">${list('matrix', [0, -1, 0, -1, 5, -1, 0, -1, 0])}${RGBA('defaultColor', 0, 0, 0, 0)}</item>`,
  `<item type="COLORMATRIXFILTER">${list('matrix', [0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0, 0, 0, 1, 0])}</item>`,
  `<item type="GRADIENTBEVELFILTER" angle="1.5707963267948966" blurX="3.0" blurY="3.0" compositeSource="true" distance="3.0" innerShadow="false" knockout="true" onTop="true" passes="1" strength="1.0"><gradientColors><item type="RGBA" red="255" green="255" blue="255" alpha="255"/><item type="RGBA" red="128" green="128" blue="128" alpha="0"/><item type="RGBA" red="0" green="0" blue="0" alpha="255"/></gradientColors>${list('gradientRatio', [0, 128, 255])}</item>`,
];
const FILTERS_XML = FILTER_ITEMS.join('');

const P3 = (attrs: string, inner = '') =>
  `<item type="PlaceObject3Tag" placeFlagHasClipActions="false" placeFlagHasClipDepth="false" placeFlagHasName="false" placeFlagHasRatio="false" placeFlagHasColorTransform="false" placeFlagHasImage="false" placeFlagHasClassName="false" placeFlagHasCacheAsBitmap="false" placeFlagHasVisible="false" placeFlagOpaqueBackground="false" reserved="false" ${attrs}>${inner}</item>`;

const FFDEC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="10" frameRate="24.0" frameCount="3" compressed="false">
  <displayRect type="RECT" Xmin="0" Xmax="6400" Ymin="0" Ymax="4800" nbits="14"/>
  <tags>
    <item type="DefineButton2Tag" buttonId="7" trackAsMenu="false" reserved="0">
      <characters>
        <item type="BUTTONRECORD" buttonHasBlendMode="true" buttonHasFilterList="true" buttonStateUp="true" buttonStateOver="true" buttonStateDown="true" buttonStateHitTest="true" characterId="1" placeDepth="1" blendMode="8">
          <placeMatrix type="MATRIX" hasScale="false" hasRotate="false" translateX="0" translateY="0" nTranslateBits="0"/>
          <filterList>${FILTER_ITEMS[2]}</filterList>
        </item>
        <item type="BUTTONRECORD" buttonHasBlendMode="false" buttonHasFilterList="false" buttonStateUp="true" buttonStateOver="false" buttonStateDown="false" buttonStateHitTest="false" characterId="2" placeDepth="2" blendMode="0">
          <placeMatrix type="MATRIX" hasScale="false" hasRotate="false" translateX="0" translateY="0" nTranslateBits="0"/>
        </item>
      </characters>
      <actions/>
    </item>
    ${P3('placeFlagHasBlendMode="true" placeFlagHasFilterList="true" placeFlagHasMatrix="true" placeFlagHasCharacter="true" placeFlagMove="false" depth="1" characterId="5" blendMode="3" bitmapCache="0"',
      `<matrix type="MATRIX" hasScale="false" hasRotate="false" translateX="400" translateY="600" nTranslateBits="12"/><surfaceFilterList>${FILTERS_XML}</surfaceFilterList>`)}
    <item type="ShowFrameTag"/>
    ${P3('placeFlagHasBlendMode="false" placeFlagHasFilterList="true" placeFlagHasMatrix="false" placeFlagHasCharacter="false" placeFlagMove="true" depth="1" characterId="0" blendMode="0" bitmapCache="0"',
      `<surfaceFilterList>${FILTER_ITEMS[6]}</surfaceFilterList>`)}
    <item type="ShowFrameTag"/>
    ${P3('placeFlagHasBlendMode="true" placeFlagHasFilterList="false" placeFlagHasMatrix="false" placeFlagHasCharacter="false" placeFlagMove="true" depth="1" characterId="0" blendMode="0" bitmapCache="0"')}
    <item type="ShowFrameTag"/>
  </tags>
</swf>`;

function expectFfdecModel(doc: SwfDocument) {
  const at = (f: number) => rootDisplay(doc, f)[0];
  expect(approx(at(0).filters)).toEqual(approx(ALL));
  expect(at(0).blendMode).toBe('multiply');
  expect([at(0).matrix.tx, at(0).matrix.ty]).toEqual([400, 600]);
  // a move with a ColorMatrix filter and no MATRIX keeps the position (its `matrix` list is no placement)
  expect(approx(at(1).filters)).toEqual(approx([ALL[6]]));
  expect([at(1).matrix.a, at(1).matrix.tx, at(1).matrix.ty]).toEqual([1, 400, 600]);
  expect(at(1).blendMode).toBe('multiply');
  // blend mode 0 on a move resets to normal; the filter list stays
  expect(at(2).blendMode).toBeUndefined();
  expect(at(2).filters?.[0].kind).toBe('colorMatrix');
  const recs = doc.timelines.get('button:7')!.frames[0].display;
  expect(approx(recs[0].filters)).toEqual(approx([ALL[2]]));
  expect(recs[0].blendMode).toBe('add');
  // the second record has blendMode="0" with its flag off: no blend mode, no filters
  expect([recs[1].blendMode, recs[1].filters]).toEqual([undefined, undefined]);
}

describe('FFDec XML filters', () => {
  it('the XML reader builds the filter model from the FFDec fields', () => {
    const doc = parseSwfXml(FFDEC_XML, { fileName: 'filters.xml' });
    expectFfdecModel(doc);
  });

  it('xml2swf writes them and the binary reader reads back the same model', async () => {
    const bytes = Uint8Array.from(xmlToSwf(FFDEC_XML));
    const { doc } = await parseSwfBinary(bytes.buffer, 'filters-roundtrip.swf');
    expect(doc.warnings).toEqual([]);
    expectFfdecModel(doc);
  });
});
