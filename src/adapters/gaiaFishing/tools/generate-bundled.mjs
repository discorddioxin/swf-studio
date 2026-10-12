#!/usr/bin/env node
// Regenerates the sample game's bundled raw .swf files from its committed FFDec
// XML exports and rewrites its game set (game-files/games/gaia-fishing.json)
// plus the index (game-files/manifest.json) that lists it (vite publicDir).
//
// This is the *sample data* preparation tool: it belongs to the game's adapter,
// while the generic FFDec-XML → SWF writer it calls lives in tools/xml2swf/.
//
//   node src/adapters/gaiaFishing/tools/generate-bundled.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { xmlToSwf } from '../../../../tools/xml2swf/xml2swf.mjs';
import {
  SAMPLE_EXPORTED_NAMES, SAMPLE_GAME_SET_ID, SAMPLE_MAIN, SAMPLE_ROOT, SAMPLE_SERVICE, SAMPLE_SWF_DIR, SAMPLE_TRACKING,
} from '../sample.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
// DOMParser is required by xmlToSwf's XML parsing
globalThis.DOMParser = new JSDOM('').window.DOMParser;

// Load order: hub map first so packages[0] is the most sensible default view.
// Every export in the sample with committed FFDec XML is synthesised; the real
// main movie (bassken_game4.20) was never committed and is skipped.
const EXPORTS = SAMPLE_EXPORTED_NAMES;

const outDir = resolve(root, SAMPLE_SWF_DIR);
mkdirSync(outDir, { recursive: true });
// The main movie is a genuine Flash build (not synthesised from XML), so it is
// copied through untouched and listed first: the Execute tab picks the
// shallowest/first manifest entry as its default main SWF.
const REL_SWF_DIR = SAMPLE_SWF_DIR.replace(/^game-files\//, '');
const REL_EXTERNAL_DIR = `${SAMPLE_ROOT.replace(/^game-files\//, '')}/external`;
const MAIN = { name: SAMPLE_MAIN, path: `${REL_SWF_DIR}/${SAMPLE_MAIN}.swf` };
// A game set is what the Loader's "bundled" dropdown lists and what the
// adapter selection in the Execute tab keys off, so the fishing SWFs stay in
// their own file instead of a global list every upload inherits.
const set = { id: SAMPLE_GAME_SET_ID, label: 'Gaia Online Fishing', adapter: 'gaia-fishing', main: MAIN.name, swfs: [MAIN] };
for (const name of EXPORTS) {
  const xmlPath = resolve(root, `${SAMPLE_ROOT}/external/${name}/${name}.xml`);
  const bytes = xmlToSwf(readFileSync(xmlPath, 'utf8'));
  const rel = `${REL_SWF_DIR}/${name}.swf`;
  writeFileSync(resolve(root, 'game-files', rel), bytes);
  // ttf fonts cannot be synthesized from binary (FFDec glyph decompilation),
  // so the committed FFDec font exports ride along in the manifest.
  const fontsDir = resolve(root, `${SAMPLE_ROOT}/external/${name}/fonts`);
  const fonts = existsSync(fontsDir)
    ? readdirSync(fontsDir)
        .filter((f) => /\.ttf$/i.test(f))
        .sort()
        .map((f) => `${REL_EXTERNAL_DIR}/${name}/fonts/${f}`)
    : [];
  // GSECS's server chooser fix is kept as readable AS2 and substituted for
  // the matching synthetic bytecode source when the bundled movie is loaded.
  const scriptOverrides = name === SAMPLE_SERVICE
    ? [{ path: `${REL_EXTERNAL_DIR}/${name}/scripts/frame_61/DoAction.as`, target: 'scripts/frame_61/DoAction.as' }]
    : [];
  // key order mirrors the committed game set, so a regeneration is a 0-diff gate
  set.swfs.push({
    name,
    path: rel,
    ...(fonts.length ? { fonts } : {}),
    ...(scriptOverrides.length ? { scriptOverrides } : {}),
    ...(fonts.length ? { fileBase: `${REL_EXTERNAL_DIR}/${name}` } : {}),
  });
  console.log(`${rel} — ${bytes.length} bytes${fonts.length ? `, ${fonts.length} ttf` : ''}`);
}
// Pre-built binary SWFs that have no XML export in external/ but ship in swfs/
const EXTRA_BINARIES = [
  { name: SAMPLE_TRACKING, path: `${REL_SWF_DIR}/${SAMPLE_TRACKING}.swf` },
];
for (const extra of EXTRA_BINARIES) {
  if (existsSync(resolve(root, 'game-files', extra.path))) {
    set.swfs.push(extra);
  }
}
mkdirSync(resolve(root, 'game-files/games'), { recursive: true });
writeFileSync(resolve(root, `game-files/games/${set.id}.json`), JSON.stringify(set, null, 2) + '\n');
writeFileSync(
  resolve(root, 'game-files/manifest.json'),
  JSON.stringify({ default: set.id, games: [`games/${set.id}.json`] }, null, 2) + '\n',
);
console.log(`game-files/games/${set.id}.json — ${set.swfs.length} swfs`);
