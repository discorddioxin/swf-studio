#!/usr/bin/env node
// Makes the sample game a *bundled* game set of this checkout: copies its SWFs
// from the uploaded corpus (src/testing/corpusPaths.ts) into game-files/ and
// writes the index the Loader reads — game-files/manifest.json → games/<id>.json.
//
// Only when you run it: the repo ships no bundled games (the app works from
// uploaded SWFs), and without game-files/ Vite serves no public dir at all.
//
// The set names the original SWFs and nothing else. Their fonts, sounds,
// bitmaps and scripts come out of the SWFs at load time, as for any upload.
//
//   node src/adapters/gaiaFishing/tools/generate-bundled.mjs      (SWF_CORPUS=… to point at the corpus)
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORPUS_CLONE } from '../../../testing/corpusPaths.ts';
import { hasSample, SAMPLE_ADAPTER, SAMPLE_GAME_SET_ID, SAMPLE_LABEL, SAMPLE_MAIN, SAMPLE_SWF_NAMES, sampleSwfPath } from '../sample.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
if (!hasSample()) {
  console.error(`The sample SWFs are not available. Get the corpus first:\n  ${CORPUS_CLONE}`);
  process.exit(1);
}

// A game set is what the Loader's "bundled" drop-down lists and what adapter
// selection keys off, so the sample's SWFs stay in their own set. The main movie
// is listed first: the Loader picks it as the default main SWF.
const swfDir = `${SAMPLE_GAME_SET_ID}/swfs`;
mkdirSync(resolve(root, 'game-files', swfDir), { recursive: true });
const set = { id: SAMPLE_GAME_SET_ID, label: SAMPLE_LABEL, adapter: SAMPLE_ADAPTER, main: SAMPLE_MAIN, swfs: [] };
for (const name of SAMPLE_SWF_NAMES) {
  const path = `${swfDir}/${name}.swf`;
  copyFileSync(sampleSwfPath(name), resolve(root, 'game-files', path));
  set.swfs.push({ name, path });
}
mkdirSync(resolve(root, 'game-files/games'), { recursive: true });
writeFileSync(resolve(root, `game-files/games/${set.id}.json`), JSON.stringify(set, null, 2) + '\n');
writeFileSync(
  resolve(root, 'game-files/manifest.json'),
  JSON.stringify({ default: set.id, games: [`games/${set.id}.json`] }, null, 2) + '\n',
);
console.log(`game-files/games/${set.id}.json — ${set.swfs.length} swfs (restart the dev server to serve game-files/)`);
