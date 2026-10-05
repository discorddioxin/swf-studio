#!/usr/bin/env node
// Regenerates the bundled raw .swf files from the committed FFDec XML exports
// and rewrites game-files/manifest.json (vite publicDir).
//
//   node tools/xml2swf/generate-bundled.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { xmlToSwf } from './xml2swf.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// DOMParser is required by xmlToSwf's XML parsing
globalThis.DOMParser = new JSDOM('').window.DOMParser;

// load order: hub map first so packages[0] is the most sensible default view;
// the real main movie (bassken_game4.20) was never committed and is skipped.
const EXPORTS = [
  'bassken_overview',
  'bassken_pier',
  'bassken_fish4.20',
  'bassken_scene',
  'game_chat',
  'gsecs2.9',
];

const outDir = resolve(root, 'game-files/fish-full/swfs');
mkdirSync(outDir, { recursive: true });
// The main movie is a genuine Flash build (not synthesised from XML), so it is
// copied through untouched and listed first: the Execute tab picks the
// shallowest/first manifest entry as its default main SWF.
const MAIN = { name: 'bassken_game4.21', path: 'fish-full/swfs/bassken_game4.21.swf' };
const manifest = { swfs: [MAIN] };
for (const name of EXPORTS) {
  const xmlPath = resolve(root, `game-files/fish-full/external/${name}/${name}.xml`);
  const bytes = xmlToSwf(readFileSync(xmlPath, 'utf8'));
  const rel = `fish-full/swfs/${name}.swf`;
  writeFileSync(resolve(root, 'game-files', rel), bytes);
  // ttf fonts cannot be synthesized from binary (FFDec glyph decompilation),
  // so the committed FFDec font exports ride along in the manifest.
  const fontsDir = resolve(root, `game-files/fish-full/external/${name}/fonts`);
  const fonts = existsSync(fontsDir)
    ? readdirSync(fontsDir)
        .filter((f) => /\.ttf$/i.test(f))
        .sort()
        .map((f) => `fish-full/external/${name}/fonts/${f}`)
    : [];
  manifest.swfs.push(fonts.length ? { name, path: rel, fonts } : { name, path: rel });
  console.log(`${rel} — ${bytes.length} bytes${fonts.length ? `, ${fonts.length} ttf` : ''}`);
}
// Pre-built binary SWFs that have no XML export in external/ but ship in swfs/
const EXTRA_BINARIES = [
  { name: 'OmnitureActionSource', path: 'fish-full/swfs/OmnitureActionSource.swf' },
];
for (const extra of EXTRA_BINARIES) {
  if (existsSync(resolve(root, 'game-files', extra.path))) {
    manifest.swfs.push(extra);
  }
}
writeFileSync(resolve(root, 'game-files/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`game-files/manifest.json — ${manifest.swfs.length} swfs`);
