#!/usr/bin/env node
// Rewrites the sample game's set (game-files/games/gaia-fishing.json) and the
// index that lists it (game-files/manifest.json, vite publicDir) from the SWFs
// in game-files/fish-full/swfs/.
//
// The set names the original SWFs and nothing else. Their fonts, sounds,
// bitmaps and scripts come out of the SWFs at load time, as for any upload, so
// no exported or rebuilt file is ever shipped next to them.
//
//   node src/adapters/gaiaFishing/tools/generate-bundled.mjs
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_GAME_SET_ID, SAMPLE_MAIN, SAMPLE_SWF_DIR, SAMPLE_SWF_NAMES } from '../sample.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const REL_SWF_DIR = SAMPLE_SWF_DIR.replace(/^game-files\//, '');

// A game set is what the Loader's "bundled" dropdown lists and what the adapter
// selection in the Execute tab keys off, so the fishing SWFs stay in their own
// file instead of a global list every upload inherits. The main movie is listed
// first: the Execute tab picks the first entry as its default main SWF.
const set = { id: SAMPLE_GAME_SET_ID, label: 'Gaia Online Fishing', adapter: 'gaia-fishing', main: SAMPLE_MAIN, swfs: [] };
for (const name of SAMPLE_SWF_NAMES) {
  const path = `${REL_SWF_DIR}/${name}.swf`;
  if (!existsSync(resolve(root, 'game-files', path))) throw new Error(`missing ${path}`);
  set.swfs.push({ name, path });
}
mkdirSync(resolve(root, 'game-files/games'), { recursive: true });
writeFileSync(resolve(root, `game-files/games/${set.id}.json`), JSON.stringify(set, null, 2) + '\n');
writeFileSync(
  resolve(root, 'game-files/manifest.json'),
  JSON.stringify({ default: set.id, games: [`games/${set.id}.json`] }, null, 2) + '\n',
);
console.log(`game-files/games/${set.id}.json — ${set.swfs.length} swfs`);
