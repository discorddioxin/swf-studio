// Dev tool: isolate failing shapes. Builds one probe SWF per DefineShape tag
// found in an FFDec XML export and asks Ruffle whether that single shape loads.
//
//   node probe-shapes.dev.mjs bassken_scene
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { launch } from './browser.dev.mjs';
import { xmlToSwf } from '../xml2swf/xml2swf.mjs';

const name = process.argv[2];
const xmlPath = `game-files/fish-full/external/${name}/${name}.xml`;
globalThis.DOMParser = new JSDOM('').window.DOMParser;
const dom = new JSDOM(readFileSync(xmlPath, 'utf8'), { contentType: 'text/xml' });
const doc = dom.window.document;
const swfAttrs = [...doc.documentElement.attributes].map((a) => `${a.name}="${a.value}"`).join(' ');
const displayRect = doc.querySelector('displayRect')?.outerHTML ?? '';

const TYPES = new Set((process.argv[3] ?? 'DefineShapeTag,DefineShape2Tag,DefineShape3Tag,DefineShape4Tag').split(','));
const shapes = [...doc.querySelectorAll('item[type]')].filter((el) => TYPES.has(el.getAttribute('type')));
console.log(`${shapes.length} tags of ${[...TYPES].join('/')} in ${name}`);

for (const [i, el] of shapes.entries()) {
  const id = el.getAttribute('shapeId') ?? el.getAttribute('characterID') ?? el.getAttribute('fontID');
  const probe = `<?xml version="1.0" encoding="UTF-8"?><swf ${swfAttrs}>${displayRect}<tags>${el.outerHTML}<item type="ShowFrameTag"/></tags></swf>`;
  const file = `game-files/fish-full/swfs/probe_${i}.swf`;
  try {
    writeFileSync(file, xmlToSwf(probe));
  } catch (e) {
    console.log(`#${i} id=${id} WRITER FAILED: ${e.message}`);
    continue;
  }
  const page = await browser.newPage();
  const msgs = [];
  page.on('console', (m) => msgs.push(m.text()));
  await page.goto(`http://127.0.0.1:8123/oracle.html?swf=/swfs/probe_${i}.swf&w=64&h=64`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1800));
  const errs = msgs.filter((m) => /Error running definition tag/.test(m)).map((m) => m.replace(/^%cERROR%c[^%]*%c /, '').replace(/ color:.*$/, ''));
  console.log(`#${i} id=${id} ${el.getAttribute('type')}${errs.length ? ' FAIL: ' + errs.join(' | ') : ' ok'}`);
  await page.close();
  unlinkSync(file);
}
browser.disconnect();
