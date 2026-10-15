// Scratch: where (which sprite / frame) is a named instance placed?
import { readFileSync } from 'node:fs';

const xml = readFileSync(process.argv[2], 'utf8');
const name = process.argv[3];
let idx = -1;
let found = [];
while ((idx = xml.indexOf(`name="${name}"`, idx + 1)) !== -1) found.push(idx);
for (const at of found) {
  const before = xml.slice(0, at);
  const sprites = [...before.matchAll(/<item type="DefineSpriteTag" spriteId="(\d+)"/g)];
  const sprite = sprites[sprites.length - 1];
  const seg = before.slice(sprite.index + sprite[0].length);
  const frame = seg.split('<item type="ShowFrameTag"/>').length;
  // clip actions on this place tag?
  const tagEnd = xml.indexOf('</item>', at);
  const tag = xml.slice(at, tagEnd);
  const actions = tag.match(/ClipActionRecord|clipAction|event=/g)?.slice(0, 6).join(',') ?? 'none';
  const charId = /characterId="(\d+)"/.exec(tag)?.[1];
  console.log(`sprite ${sprite[1]} frame ${frame} charId ${charId} actions: ${actions}`);
}
if (!found.length) console.log('not found');
