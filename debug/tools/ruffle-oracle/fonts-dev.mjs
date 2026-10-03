// Dev tool: decode DefineFont2/3 tags from the generated SWF and compare the
// glyph/code tables with the FFDec XML they were built from.
//   node fonts-dev.mjs gsecs2.9 5
import fs from 'node:fs';
import zlib from 'node:zlib';
import { JSDOM } from 'jsdom';

const [name, idArg] = process.argv.slice(2);
const fontId = Number(idArg);

const dom = new JSDOM(fs.readFileSync(`game-files/fish-full/external/${name}/${name}.xml`, 'utf8'), { contentType: 'text/xml' });
const doc = dom.window.document;
const xmlFont = [...doc.querySelectorAll('item[type="DefineFont2Tag"],item[type="DefineFont3Tag"]')].find((el) => el.getAttribute('fontID') === String(fontId));
const shapes = xmlFont.querySelector('glyphShapeTable') ? [...xmlFont.querySelector('glyphShapeTable').children] : [];
const codes = xmlFont.querySelector('codeTable') ? [...xmlFont.querySelector('codeTable').children] : [];
console.log(`XML fontID=${fontId} glyphs=${shapes.length} codes=${codes.length} wideOffsets=${xmlFont.getAttribute('fontFlagsWideOffsets')} wideCodes=${xmlFont.getAttribute('fontFlagsWideCodes')} name=${JSON.stringify(xmlFont.getAttribute('fontName'))}`);

const raw = fs.readFileSync(`game-files/fish-full/swfs/${name}.swf`);
const body = raw[0] === 0x43 ? zlib.inflateSync(raw.subarray(8)) : raw.subarray(8);
let p = Math.ceil((5 + (body[0] >> 3) * 4) / 8) + 4;
const tags = [];
const walk = (d) => {
  let q = 0;
  while (q + 2 <= d.length) {
    const c = d[q] | (d[q + 1] << 8); const t = c >> 6; const long = (c & 0x3f) === 0x3f;
    const len = long ? (d[q + 2] | (d[q + 3] << 8) | (d[q + 4] << 16) | (d[q + 5] << 24)) : (c & 0x3f);
    const o = long ? q + 6 : q + 2;
    if (t === 0) return;
    tags.push({ t, d: d.subarray(o, o + len) });
    if (t === 39) walk(d.subarray(o + 4, o + len));
    q = o + len;
  }
};
walk(body.subarray(p));
const tag = tags.find((x) => (x.t === 48 || x.t === 75) && (x.d[0] | (x.d[1] << 8)) === fontId);
if (!tag) { console.log('font tag not found'); process.exit(1); }
const d = tag.d;
let i = 2;
const flags = d[i++]; const lang = d[i++];
const nameLen = d[i++]; const fontName = d.slice(i, i + nameLen).toString('latin1'); i += nameLen;
const numGlyphs = d[i] | (d[i + 1] << 8); i += 2;
console.log(`BIN flags=0x${flags.toString(16)} lang=${lang} nameLen=${nameLen} name=${JSON.stringify(fontName)} numGlyphs=${numGlyphs} payload=${d.length}B`);
const wideOffsets = (flags & 0x08) !== 0;
const wideCodes = (flags & 0x10) !== 0;
const offRef = i;
const offsets = [];
for (let g = 0; g < numGlyphs; g++) { offsets.push(wideOffsets ? d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24) : d[i] | (d[i + 1] << 8)); i += wideOffsets ? 4 : 2; }
const codeTableOffset = wideOffsets ? d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24) : d[i] | (d[i + 1] << 8);
i += wideOffsets ? 4 : 2;
console.log(`offsets[0..4]=${offsets.slice(0, 5)} codeTableOffset=${codeTableOffset} regionLen=${d.length - offRef}`);
for (let g = 0; g < numGlyphs; g++) {
  const at = offRef + offsets[g];
  if (at >= d.length) { console.log(`  glyph#${g} offset ${offsets[g]} past end`); continue; }
  const nb = d[at];
  if (g < 4 || g === numGlyphs - 1) console.log(`  glyph#${g} @${offsets[g]} nibbles=${nb >> 4}/${nb & 0xf} first bytes=${[...d.slice(at, at + 6)].map((b) => b.toString(16)).join(' ')}`);
}
