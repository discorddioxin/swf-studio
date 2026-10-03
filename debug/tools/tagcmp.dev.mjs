import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { JSDOM } from 'jsdom';

const name = process.argv[2];
const xml = readFileSync(`game-files/fish-full/external/${name}/${name}.xml`, 'utf8');
const dom = new JSDOM(xml, { contentType: 'text/xml' });
const doc = dom.window.document;
const tagsWrap = doc.querySelector('tags');
const rootTags = [...(tagsWrap ? tagsWrap.children : doc.documentElement.children)].filter((c) => c.getAttribute('type'));
const list = (els, depth = 0) => els.flatMap((el) => {
  const t = el.getAttribute('type');
  const id = el.getAttribute('shapeId') ?? el.getAttribute('spriteId') ?? el.getAttribute('characterID') ?? el.getAttribute('characterId');
  const line = `${'  '.repeat(depth)}${t}${id ? '#' + id : ''}${el.getAttribute('name') ? ' "' + el.getAttribute('name') + '"' : ''}`;
  if (t !== 'DefineSpriteTag') return [line];
  const sub = el.querySelector('subTags');
  return [line, ...(sub ? list([...sub.children].filter((c) => c.getAttribute('type')), depth + 1) : [])];
});
console.log(`--- XML (${rootTags.length} top-level tags) ---`);
for (const l of list(rootTags)) console.log(l);

const raw = readFileSync(`game-files/fish-full/swfs/${name}.swf`);
const body = raw[0] === 0x43 ? zlib.inflateSync(raw.subarray(8)) : raw.subarray(8);
const names = { 1: 'ShowFrameTag', 2: 'DefineShapeTag', 9: 'SetBackgroundColorTag', 11: 'DefineTextTag', 12: 'DoActionTag', 22: 'DefineShape2Tag', 24: 'ProtectTag', 26: 'PlaceObject2Tag', 26.5: '', 28: 'RemoveObject2Tag', 32: 'DefineShape3Tag', 33: 'DefineText2Tag', 34: 'DefineButton2Tag', 35: 'DefineBitsJPEG3Tag', 36: 'DefineBitsLossless2Tag', 37: 'DefineEditTextTag', 39: 'DefineSpriteTag', 43: 'FrameLabelTag', 48: 'DefineFont2Tag', 56: 'ExportAssetsTag', 59: 'DoInitActionTag', 69: 'ScriptLimitsTag', 73: 'DefineFontAlignZonesTag', 74: 'CSMTextSettingsTag', 75: 'DefineFont3Tag', 76: 'SymbolClassTag', 83: 'DefineShape4Tag', 88: 'DefineFontNameTag', 20: 'DefineBitsLosslessTag' };
let p = Math.ceil((5 + (body[0] >> 3) * 4) / 8) + 4;
const out = [];
const walk = (d, depth) => {
  let q = 0;
  while (q + 2 <= d.length) {
    const c = d[q] | (d[q + 1] << 8); const t = c >> 6; const long = (c & 0x3f) === 0x3f;
    const len = long ? (d[q + 2] | (d[q + 3] << 8) | (d[q + 4] << 16) | (d[q + 5] << 24)) : (c & 0x3f);
    const o = long ? q + 6 : q + 2;
    if (t === 0) return;
    const pay = d.subarray(o, o + len);
    const id = (t === 2 || t === 22 || t === 32 || t === 83 || t === 39 || t === 11 || t === 33 || t === 34 || t === 37 || t === 36 || t === 20 || t === 48 || t === 75) ? pay[0] | (pay[1] << 8) : null;
    out.push(`${'  '.repeat(depth)}${names[t] ?? 'tag' + t}${id != null ? '#' + id : ''} (${len}B)`);
    if (t === 39) walk(pay.subarray(4), depth + 1);
    q = o + len;
  }
};
walk(body.subarray(p), 0);
console.log(`--- BINARY (${out.length} tags) ---`);
for (const l of out) console.log(l);
